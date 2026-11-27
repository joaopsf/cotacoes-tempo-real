import { CODIGOS } from '../protocolo/ativos'
import type { MensagemServidor } from '../protocolo/mensagens'
import { Serie } from './serie'

export const CAPACIDADE_DA_SERIE = 600

export interface Cotacao {
  readonly codigo: string
  abertura: number | null
  preco: number | null
  /** Sentido da última mudança de preço. */
  direcao: -1 | 0 | 1
  /**
   * Alterna 0/1 a cada quadro em que o preço mudou. A tela troca o nome da animação de destaque por ele:
   * trocar o nome reinicia a animação, sem precisar tirar e pôr classe com setTimeout.
   */
  pulso: 0 | 1
  negocios: number
  maxima: number
  minima: number
  readonly serie: Serie
}

export interface Mudanca {
  s: string
  anterior: number | null
  atual: number
}

/**
 * Onde os ticks moram. Todo tick entra aqui, agrupado ou não: agrupar é sobre quando desenhar, não sobre
 * jogar dado fora. O gráfico tem todos os negócios, e o alerta vê todos os preços.
 */
export class LivroDeCotacoes {
  private readonly cotacoes = new Map<string, Cotacao>()
  private readonly mudaramNoQuadro = new Set<Cotacao>()

  constructor(codigos: readonly string[] = CODIGOS) {
    for (const codigo of codigos) {
      this.cotacoes.set(codigo, {
        codigo,
        abertura: null,
        preco: null,
        direcao: 0,
        pulso: 0,
        negocios: 0,
        maxima: -Infinity,
        minima: Infinity,
        serie: new Serie(CAPACIDADE_DA_SERIE),
      })
    }
  }

  cotacao(codigo: string): Cotacao | undefined {
    return this.cotacoes.get(codigo)
  }

  /** Aplica uma mensagem. Devolve a mudança de preço, se houve, pra quem confere alerta. */
  aplicar(m: MensagemServidor): Mudanca | null {
    if (m.t === 'inicio') {
      const c = this.cotacoes.get(m.s)
      if (!c) return null
      // Reassinatura depois de uma queda manda o histórico de novo: substitui em vez de duplicar.
      c.serie.limpar()
      c.abertura = m.abertura
      c.maxima = -Infinity
      c.minima = Infinity
      for (const p of m.hist) this.registrar(c, p)
      const ultimo = m.hist.at(-1)
      if (ultimo !== undefined) c.preco = ultimo
      this.mudaramNoQuadro.add(c)
      return null
    }
    if (m.t !== 'tick') return null
    const c = this.cotacoes.get(m.s)
    if (!c) return null
    const anterior = c.preco
    c.negocios++
    this.registrar(c, m.p)
    if (anterior === m.p) return null
    c.preco = m.p
    c.direcao = anterior === null ? 0 : m.p > anterior ? 1 : -1
    this.mudaramNoQuadro.add(c)
    return { s: m.s, anterior, atual: m.p }
  }

  /** Fecha o quadro: quem mudou troca o pulso (uma vez por quadro, por mais ticks que tenha recebido). */
  fecharQuadro(): number {
    const n = this.mudaramNoQuadro.size
    for (const c of this.mudaramNoQuadro) c.pulso = c.pulso ? 0 : 1
    this.mudaramNoQuadro.clear()
    return n
  }

  private registrar(c: Cotacao, p: number): void {
    c.serie.push(p)
    if (p > c.maxima) c.maxima = p
    if (p < c.minima) c.minima = p
  }
}

/** Variação em % sobre a abertura. */
export function variacao(c: Pick<Cotacao, 'abertura' | 'preco'>): number | null {
  if (c.abertura === null || c.preco === null || c.abertura === 0) return null
  return ((c.preco - c.abertura) / c.abertura) * 100
}
