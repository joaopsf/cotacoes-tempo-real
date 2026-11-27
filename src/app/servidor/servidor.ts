import { ATIVOS, existe } from '../protocolo/ativos'
import { codificar, lerDoCliente, type MensagemServidor } from '../protocolo/mensagens'

const HISTORICO = 120
const PULSO_MS = 1000

/** Gerador pseudoaleatório pequeno e com semente: o mesmo pregão se repete nos testes. */
export function mulberry32(semente: number): () => number {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface OpcoesServidor {
  /** Ticks por segundo somando o mercado inteiro (não por ativo). */
  taxa?: number
  semente?: number
  agora?: () => number
}

/**
 * O "outro lado" do WebSocket: gera o pregão e manda pra cada conexão só os ativos que ela assinou.
 * Não sabe nada de Worker nem de tela; quem chama decide quando o tempo anda (`avancar`).
 */
export class ServidorDeCotacoes {
  private readonly aleatorio: () => number
  private readonly agora: () => number
  private readonly precos: number[]
  private readonly aberturas: number[]
  private readonly historicos: number[][]
  private readonly conexoes = new Map<number, Set<string>>()
  private taxa: number
  private sobra = 0
  private desdePulso = 0

  constructor(
    private readonly enviar: (conexao: number, texto: string) => void,
    opcoes: OpcoesServidor = {},
  ) {
    this.aleatorio = mulberry32(opcoes.semente ?? 20261126)
    this.agora = opcoes.agora ?? (() => Date.now())
    this.taxa = opcoes.taxa ?? 300
    this.aberturas = ATIVOS.map((a) => a.base)
    this.precos = [...this.aberturas]
    this.historicos = ATIVOS.map(() => [])
    // Um pouco de pregão antes de abrir as conexões, pra variação e sparkline já terem o que mostrar.
    for (let i = 0; i < ATIVOS.length * HISTORICO; i++) this.mover(i % ATIVOS.length)
  }

  definirTaxa(taxa: number): void {
    this.taxa = Math.max(0, taxa)
  }

  abrir(conexao: number): void {
    this.conexoes.set(conexao, new Set())
  }

  fechar(conexao: number): void {
    this.conexoes.delete(conexao)
  }

  assinaturas(conexao: number): string[] {
    return [...(this.conexoes.get(conexao) ?? [])]
  }

  receber(conexao: number, texto: string): void {
    const assinadas = this.conexoes.get(conexao)
    if (!assinadas) return
    const m = lerDoCliente(texto)
    if (!m) {
      this.mandar(conexao, { t: 'erro', motivo: 'mensagem inválida' })
      return
    }
    const desconhecidos = m.ativos.filter((s) => !existe(s))
    if (desconhecidos.length) this.mandar(conexao, { t: 'erro', motivo: `ativo desconhecido: ${desconhecidos.join(', ')}` })
    const validos = m.ativos.filter(existe)

    if (m.op === 'assinar') {
      for (const s of validos) {
        // Assinar de novo o que já está assinado não duplica nada: o servidor é idempotente.
        if (assinadas.has(s)) continue
        assinadas.add(s)
        const i = ATIVOS.findIndex((a) => a.codigo === s)
        this.mandar(conexao, { t: 'inicio', s, abertura: this.aberturas[i], hist: [...this.historicos[i]], ts: this.agora() })
      }
    } else {
      for (const s of validos) assinadas.delete(s)
      this.mandar(conexao, { t: 'cancelado', ativos: validos })
    }
  }

  /** Faz o tempo andar `ms` milissegundos: gera os ticks do intervalo e o batimento. */
  avancar(ms: number): void {
    const quantos = this.taxa * (ms / 1000) + this.sobra
    const inteiros = Math.floor(quantos)
    this.sobra = quantos - inteiros
    for (let n = 0; n < inteiros; n++) {
      const i = Math.floor(this.aleatorio() * ATIVOS.length)
      const p = this.mover(i)
      const s = ATIVOS[i].codigo
      const texto = codificar({ t: 'tick', s, p, ts: this.agora() })
      for (const [conexao, assinadas] of this.conexoes) if (assinadas.has(s)) this.enviar(conexao, texto)
    }
    this.desdePulso += ms
    if (this.desdePulso >= PULSO_MS) {
      this.desdePulso = 0
      const texto = codificar({ t: 'pulso', ts: this.agora() })
      for (const conexao of this.conexoes.keys()) this.enviar(conexao, texto)
    }
  }

  private mandar(conexao: number, m: MensagemServidor): void {
    this.enviar(conexao, codificar(m))
  }

  /** Passeio aleatório com uma leve volta à média, em centavos (o passo de preço da bolsa). */
  private mover(i: number): number {
    const { base, vol } = ATIVOS[i]
    const gauss = (this.aleatorio() + this.aleatorio() + this.aleatorio() - 1.5) * 2
    const puxao = ((base - this.precos[i]) / base) * 0.002
    const novo = Math.max(0.01, Math.round(this.precos[i] * Math.exp(vol * gauss + puxao) * 100) / 100)
    this.precos[i] = novo
    const h = this.historicos[i]
    h.push(novo)
    if (h.length > HISTORICO) h.shift()
    return novo
  }
}
