import { BehaviorSubject, Subject, type Observable } from 'rxjs'
import { codificar, lerDoServidor, type MensagemCliente, type MensagemServidor } from '../protocolo/mensagens'
import type { FabricaDeSoquete, SoqueteLike } from '../soquete/soquete'
import { atrasoDeReconexao, BACKOFF_PADRAO, type ConfigBackoff } from './backoff'
import { aplicarAoConjunto, compactarFila } from './fila'

export type Fase = 'conectando' | 'aberta' | 'aguardando' | 'parada'

export interface EstadoConexao {
  fase: Fase
  /** Quantas quedas seguidas sem a conexão ficar estável. Zera depois de `estavelApos` aberta. */
  tentativa: number
  /** Quando sai a próxima tentativa (epoch ms), se estiver aguardando. */
  proximaEm: number | null
  /** Por que a última conexão terminou. */
  motivo: string | null
  /** O que vai sair quando a conexão voltar (já compactado). */
  fila: MensagemCliente[]
}

export interface Registro {
  ts: number
  tipo: 'enviada' | 'conexao'
  texto: string
}

export interface OpcoesCliente {
  url: string
  criarSoquete: FabricaDeSoquete
  backoff?: ConfigBackoff
  aleatorio?: () => number
  agora?: () => number
  /** Desiste de uma conexão que não abre nesse prazo (rede muda engole o pedido). */
  prazoDeConexao?: number
  /** Sem nenhuma mensagem nesse prazo, a conexão é dada como morta. O servidor manda batimento a cada 1 s. */
  prazoDeSilencio?: number
  /** Só zera o contador de tentativas se a conexão ficar aberta esse tempo. Evita backoff curto em conexão que abre e cai. */
  estavelApos?: number
}

const MOTIVOS: Record<number, string> = {
  1000: 'fechada normalmente',
  1001: 'servidor saiu',
  1006: 'queda de conexão',
  1011: 'erro no servidor',
  4000: 'sem sinal do servidor',
  4001: 'conexão não abriu a tempo',
}

/**
 * Cliente do canal de cotações. Não depende de Angular: recebe uma fábrica de soquete (o simulado ou o
 * `WebSocket` real) e expõe estado e mensagens como Observables.
 */
export class ClienteDeCotacoes {
  private readonly estadoSujeito: BehaviorSubject<EstadoConexao>
  private readonly mensagensSujeito = new Subject<MensagemServidor>()
  private readonly registroSujeito = new Subject<Registro>()

  readonly estado$: Observable<EstadoConexao>
  readonly mensagens$: Observable<MensagemServidor> = this.mensagensSujeito.asObservable()
  readonly registro$: Observable<Registro> = this.registroSujeito.asObservable()

  private soquete: SoqueteLike | null = null
  /** O que o servidor tem assinado (ou tinha, até a conexão cair). É o que a volta reassina. */
  private readonly noServidor = new Set<string>()
  private fila: MensagemCliente[] = []
  private tentativa = 0
  private parado = true
  private ultimaMensagem = 0

  private relogioReconexao: ReturnType<typeof setTimeout> | null = null
  private relogioConexao: ReturnType<typeof setTimeout> | null = null
  private relogioEstavel: ReturnType<typeof setTimeout> | null = null
  private vigia: ReturnType<typeof setInterval> | null = null

  private readonly backoff: ConfigBackoff
  private readonly aleatorio: () => number
  private readonly agora: () => number
  private readonly prazoDeConexao: number
  private readonly prazoDeSilencio: number
  private readonly estavelApos: number

  constructor(private readonly opcoes: OpcoesCliente) {
    this.backoff = opcoes.backoff ?? BACKOFF_PADRAO
    this.aleatorio = opcoes.aleatorio ?? Math.random
    this.agora = opcoes.agora ?? (() => Date.now())
    this.prazoDeConexao = opcoes.prazoDeConexao ?? 5000
    this.prazoDeSilencio = opcoes.prazoDeSilencio ?? 4000
    this.estavelApos = opcoes.estavelApos ?? 3000
    this.estadoSujeito = new BehaviorSubject<EstadoConexao>({ fase: 'parada', tentativa: 0, proximaEm: null, motivo: null, fila: [] })
    this.estado$ = this.estadoSujeito.asObservable()
  }

  get estado(): EstadoConexao {
    return this.estadoSujeito.value
  }

  /** O que o servidor tem assinado agora (ou terá assim que a fila sair). */
  get assinados(): string[] {
    const s = new Set(this.noServidor)
    aplicarAoConjunto(s, this.fila)
    return [...s]
  }

  conectar(): void {
    this.parado = false
    this.limparRelogio('reconexao')
    if (this.soquete) return
    this.abrir()
  }

  /** Fecha de propósito: não tenta voltar. */
  desconectar(): void {
    this.parado = true
    this.limparTudo()
    const s = this.soquete
    this.soquete = null
    if (s) {
      this.soltar(s)
      s.close(1000, 'painel fechado')
    }
    this.publicar({ fase: 'parada', proximaEm: null, motivo: 'fechada pelo painel' })
  }

  /** Pula a espera do backoff (botão "Tentar agora"). */
  tentarAgora(): void {
    if (this.estado.fase !== 'aguardando') return
    this.limparRelogio('reconexao')
    this.abrir()
  }

  assinar(ativos: string[]): void {
    if (ativos.length) this.enviar({ op: 'assinar', ativos })
  }

  cancelar(ativos: string[]): void {
    if (ativos.length) this.enviar({ op: 'cancelar', ativos })
  }

  /** Conexão aberta: sai na hora. Fora disso: vai pra fila e sai quando voltar. */
  enviar(m: MensagemCliente): void {
    if (this.soquete?.readyState === 1 && this.estado.fase === 'aberta') {
      this.mandar(m, '')
      aplicarAoConjunto(this.noServidor, [m])
      return
    }
    this.fila = compactarFila([...this.fila, m], this.noServidor)
    this.publicar({})
  }

  // ---------------------------------------------------------------------------

  private abrir(): void {
    this.publicar({ fase: 'conectando', proximaEm: null })
    this.registrar('conexao', this.tentativa ? `tentativa ${this.tentativa + 1}` : 'conectando')
    const s = this.opcoes.criarSoquete(this.opcoes.url)
    this.soquete = s

    this.relogioConexao = setTimeout(() => {
      this.relogioConexao = null
      if (this.soquete === s && s.readyState !== 1) this.derrubar(s, 4001)
    }, this.prazoDeConexao)

    s.onopen = () => {
      if (this.soquete !== s) return
      this.limparRelogio('conexao')
      this.ultimaMensagem = this.agora()
      this.publicar({ fase: 'aberta', proximaEm: null })
      this.registrar('conexao', 'conectado')
      this.aoAbrir()
      this.relogioEstavel = setTimeout(() => {
        this.relogioEstavel = null
        this.tentativa = 0
        this.publicar({})
      }, this.estavelApos)
      this.vigia = setInterval(
        () => {
          if (this.agora() - this.ultimaMensagem > this.prazoDeSilencio) this.derrubar(s, 4000)
        },
        Math.min(1000, this.prazoDeSilencio / 2),
      )
    }

    s.onmessage = (e) => {
      if (this.soquete !== s) return
      this.ultimaMensagem = this.agora()
      const m = lerDoServidor(e.data)
      if (m) this.mensagensSujeito.next(m)
    }

    s.onclose = (e) => {
      if (this.soquete !== s) return
      this.aoCair(e.code)
    }

    // O erro sempre vem seguido de close; quem decide o que fazer é o close.
    s.onerror = null
  }

  /** Reassina o que o servidor tinha e despeja a fila. Conexão nova começa vazia, então cancelar não precisa ir. */
  private aoAbrir(): void {
    const fila = compactarFila(this.fila, this.noServidor)
    const cancelados = new Set(fila.filter((m) => m.op === 'cancelar').flatMap((m) => m.ativos))
    const reassinar = [...this.noServidor].filter((s) => !cancelados.has(s))
    const daFila = fila.filter((m) => m.op === 'assinar').flatMap((m) => m.ativos)

    this.noServidor.clear()
    if (reassinar.length) this.mandar({ op: 'assinar', ativos: reassinar }, ' (reassinatura)')
    if (daFila.length) this.mandar({ op: 'assinar', ativos: daFila }, ' (fila)')
    for (const s of [...reassinar, ...daFila]) this.noServidor.add(s)
    this.fila = []
    this.publicar({})
  }

  /** Desiste de um soquete (silêncio ou prazo de conexão) e segue pro backoff sem esperar o close dele. */
  private derrubar(s: SoqueteLike, codigo: number): void {
    this.soltar(s)
    try {
      s.close(codigo === 4001 ? 1000 : codigo, MOTIVOS[codigo])
    } catch {
      // close com código inválido em alguns navegadores: o soquete já foi solto mesmo.
    }
    this.aoCair(codigo)
  }

  private aoCair(codigo: number): void {
    const s = this.soquete
    if (s) this.soltar(s)
    this.soquete = null
    this.limparTudo()
    const motivo = MOTIVOS[codigo] ?? `código ${codigo}`
    this.registrar('conexao', `caiu: ${motivo}`)
    if (this.parado) {
      this.publicar({ fase: 'parada', proximaEm: null, motivo })
      return
    }
    const espera = atrasoDeReconexao(this.tentativa, this.backoff, this.aleatorio)
    this.tentativa++
    this.publicar({ fase: 'aguardando', proximaEm: this.agora() + espera, motivo })
    this.relogioReconexao = setTimeout(() => {
      this.relogioReconexao = null
      this.abrir()
    }, espera)
  }

  private mandar(m: MensagemCliente, nota: string): void {
    this.soquete?.send(codificar(m))
    this.registrar('enviada', `${m.op} ${m.ativos.join(', ')}${nota}`)
  }

  private soltar(s: SoqueteLike): void {
    s.onopen = s.onmessage = s.onclose = s.onerror = null
  }

  private limparRelogio(qual: 'reconexao' | 'conexao'): void {
    if (qual === 'reconexao' && this.relogioReconexao) {
      clearTimeout(this.relogioReconexao)
      this.relogioReconexao = null
    }
    if (qual === 'conexao' && this.relogioConexao) {
      clearTimeout(this.relogioConexao)
      this.relogioConexao = null
    }
  }

  private limparTudo(): void {
    this.limparRelogio('reconexao')
    this.limparRelogio('conexao')
    if (this.relogioEstavel) clearTimeout(this.relogioEstavel)
    if (this.vigia) clearInterval(this.vigia)
    this.relogioEstavel = null
    this.vigia = null
  }

  private registrar(tipo: Registro['tipo'], texto: string): void {
    this.registroSujeito.next({ ts: this.agora(), tipo, texto })
  }

  private publicar(mudanca: Partial<EstadoConexao>): void {
    this.estadoSujeito.next({ ...this.estado, ...mudanca, tentativa: this.tentativa, fila: this.fila })
  }
}
