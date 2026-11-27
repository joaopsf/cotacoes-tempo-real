import { ApplicationRef, DestroyRef, effect, inject, Injectable, InjectionToken, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { animationFrames, map, share, switchMap, type Observable } from 'rxjs'
import { ClienteDeCotacoes, type EstadoConexao, type Registro } from './cliente/cliente'
import { agruparPorQuadro, quadrosDaTela } from './dados/agrupar'
import { conferirAlertas, reais, validarAlerta, type Alerta, type Sentido } from './dados/alertas'
import { LivroDeCotacoes } from './dados/livro'
import { CODIGOS } from './protocolo/ativos'
import type { MensagemServidor } from './protocolo/mensagens'
import { criarPonte, type Ponte } from './servidor/ponte'
import { RedeSimulada, type EstadoDaRede } from './soquete/rede'
import { SoqueteSimulado } from './soquete/soquete'

/** Onde o servidor roda. Nos testes entra um servidor na própria página, com o tempo na mão. */
export const PONTE = new InjectionToken<Ponte>('ponte', { providedIn: 'root', factory: criarPonte })
/** De onde vem o "quadro de tela". Nos testes, um Subject. */
export const QUADROS = new InjectionToken<() => Observable<unknown>>('quadros', { providedIn: 'root', factory: () => quadrosDaTela })

export const URL_DO_CANAL = 'wss://cotacoes.simulado/v1'
export const INICIAIS = CODIGOS.slice(0, 12)
export const DURACAO_DO_AVISO = 8000

export interface Aviso {
  id: number
  titulo: string
  texto: string
  sentido: Sentido
}

export interface Medidas {
  fps: number
  mensagens: number
  desenhos: number
}

/**
 * O estado da tela. Liga cliente, livro e alertas, e decide quando a tela redesenha.
 * Os dados correm por RxJS; a tela lê signals. A ponte entre os dois é `versao`, que sobe uma vez por desenho.
 */
@Injectable({ providedIn: 'root' })
export class Mesa {
  private readonly ponte = inject(PONTE)
  private readonly quadros = inject(QUADROS)
  private readonly appRef = inject(ApplicationRef)

  readonly rede = new RedeSimulada()
  readonly livro = new LivroDeCotacoes()
  readonly cliente = new ClienteDeCotacoes({
    url: URL_DO_CANAL,
    criarSoquete: (url) => new SoqueteSimulado(url, this.ponte, this.rede),
  })

  readonly conexao = signal<EstadoConexao>(this.cliente.estado)
  /** Sobe a cada desenho. Tabela e gráfico leem: é o único signal que muda com o mercado. */
  readonly versao = signal(0)
  readonly acompanhados = signal<string[]>(INICIAIS)
  readonly selecionado = signal<string>(INICIAIS[0])
  readonly agrupar = signal(true)
  readonly pausado = signal(false)
  readonly taxa = signal(200)
  readonly estadoDaRede = signal<EstadoDaRede>('normal')
  readonly alertas = signal<Alerta[]>([])
  readonly avisos = signal<Aviso[]>([])
  readonly registro = signal<Registro[]>([])
  readonly medidas = signal<Medidas>({ fps: 0, mensagens: 0, desenhos: 0 })

  private proximoId = 1
  private contaMensagens = 0
  private contaDesenhos = 0
  private contaQuadros = 0
  private readonly relogios: ReturnType<typeof setTimeout>[] = []

  constructor() {
    const destruir = inject(DestroyRef)

    this.cliente.estado$.pipe(takeUntilDestroyed(destruir)).subscribe((e) => this.conexao.set(e))
    this.cliente.registro$.pipe(takeUntilDestroyed(destruir)).subscribe((r) => this.registro.update((l) => [r, ...l].slice(0, 40)))

    const mensagens$ = this.cliente.mensagens$.pipe(share())
    toObservable(this.agrupar)
      .pipe(
        // Agrupado: um lote por quadro. Sem agrupar: cada mensagem é um "lote" de um e força um ciclo da tela.
        switchMap((agrupar) =>
          agrupar
            ? mensagens$.pipe(
                agruparPorQuadro<MensagemServidor>(this.quadros()),
                map((lote) => ({ lote, forcar: false })),
              )
            : mensagens$.pipe(map((m) => ({ lote: [m], forcar: true }))),
        ),
        takeUntilDestroyed(destruir),
      )
      .subscribe(({ lote, forcar }) => this.processar(lote, forcar))

    // Medidores: FPS conta só requestAnimationFrame (o relógio de reserva do agrupamento não é quadro), fechado a cada segundo.
    ;(typeof requestAnimationFrame === 'function' ? animationFrames() : this.quadros())
      .pipe(takeUntilDestroyed(destruir))
      .subscribe(() => this.contaQuadros++)
    const medidor = setInterval(() => {
      this.medidas.set({ fps: this.contaQuadros, mensagens: this.contaMensagens, desenhos: this.contaDesenhos })
      this.contaQuadros = this.contaMensagens = this.contaDesenhos = 0
    }, 1000)

    effect(() => this.ponte.enviar({ tipo: 'taxa', valor: this.taxa() }))
    effect(() => this.rede.definir(this.estadoDaRede()))

    this.cliente.assinar(INICIAIS)
    this.cliente.conectar()

    destruir.onDestroy(() => {
      clearInterval(medidor)
      for (const r of this.relogios) clearTimeout(r)
      this.cliente.desconectar()
      this.ponte.encerrar()
    })
  }

  // ---- dados -----------------------------------------------------------------

  private processar(lote: MensagemServidor[], forcar: boolean): void {
    this.contaMensagens += lote.length
    let alertas = this.alertas()
    for (const m of lote) {
      const mudanca = this.livro.aplicar(m)
      // Alerta confere tick a tick, dentro do lote: um pico que sobe e volta no mesmo quadro não passa batido.
      if (!mudanca || alertas.length === 0) continue
      const { disparados, restantes } = conferirAlertas(alertas, mudanca)
      if (disparados.length) {
        alertas = restantes
        for (const a of disparados) this.avisar(a, mudanca.atual)
      }
    }
    if (alertas !== this.alertas()) this.alertas.set(alertas)
    if (!this.pausado()) this.desenhar(forcar)
  }

  private desenhar(forcar: boolean): void {
    this.livro.fecharQuadro()
    this.versao.update((v) => v + 1)
    this.contaDesenhos++
    // Sem zone.js o Angular já juntaria várias mudanças de signal num ciclo só. Pra comparação ser honesta,
    // o modo sem agrupar faz o que acontece num app com zone.js: cada mensagem do socket vira um ciclo inteiro.
    if (forcar) this.appRef.tick()
  }

  // ---- ações da tela ---------------------------------------------------------

  acompanhar(codigo: string): void {
    if (this.acompanhados().includes(codigo)) return
    this.acompanhados.update((l) => [...l, codigo])
    this.cliente.assinar([codigo])
  }

  deixar(codigo: string): void {
    const restantes = this.acompanhados().filter((c) => c !== codigo)
    this.acompanhados.set(restantes)
    this.cliente.cancelar([codigo])
    // Sem cotação o alerta nunca dispararia: sai junto.
    this.alertas.update((l) => l.filter((a) => a.ativo !== codigo))
    if (this.selecionado() === codigo && restantes.length) this.selecionado.set(restantes[0])
  }

  selecionar(codigo: string): void {
    this.selecionado.set(codigo)
  }

  alternarPausa(): void {
    this.pausado.update((p) => !p)
    if (!this.pausado()) this.desenhar(false)
  }

  criarAlerta(ativo: string, sentido: Sentido, alvo: number): string | null {
    const erro = validarAlerta(sentido, alvo, this.livro.cotacao(ativo)?.preco ?? null)
    if (erro) return erro
    this.alertas.update((l) => [...l, { id: this.proximoId++, ativo, sentido, alvo }])
    return null
  }

  removerAlerta(id: number): void {
    this.alertas.update((l) => l.filter((a) => a.id !== id))
  }

  fecharAviso(id: number): void {
    this.avisos.update((l) => l.filter((a) => a.id !== id))
  }

  private avisar(a: Alerta, preco: number): void {
    const id = this.proximoId++
    const verbo = a.sentido === 'acima' ? 'subiu até' : 'caiu até'
    this.avisos.update((l) => [
      ...l.slice(-3),
      { id, titulo: `${a.ativo} ${verbo} ${reais(a.alvo)}`, texto: `Agora em ${reais(preco)}.`, sentido: a.sentido },
    ])
    this.relogios.push(setTimeout(() => this.fecharAviso(id), DURACAO_DO_AVISO))
  }
}
