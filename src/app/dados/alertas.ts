import type { Mudanca } from './livro'

export type Sentido = 'acima' | 'abaixo'

export interface Alerta {
  id: number
  ativo: string
  sentido: Sentido
  alvo: number
}

/**
 * O alerta dispara quando o preço CRUZA o alvo, não quando está além dele. Assim ele toca uma vez,
 * na passagem, e não a cada tick enquanto o preço ficar do outro lado.
 */
export function cruzou(a: Alerta, m: Mudanca): boolean {
  if (a.ativo !== m.s || m.anterior === null) return false
  return a.sentido === 'acima' ? m.anterior < a.alvo && m.atual >= a.alvo : m.anterior > a.alvo && m.atual <= a.alvo
}

/** Separa os que dispararam (e saem da lista: alerta é de uma vez só) dos que continuam valendo. */
export function conferirAlertas(alertas: readonly Alerta[], m: Mudanca): { disparados: Alerta[]; restantes: Alerta[] } {
  const disparados: Alerta[] = []
  const restantes: Alerta[] = []
  for (const a of alertas) (cruzou(a, m) ? disparados : restantes).push(a)
  return { disparados, restantes }
}

/** Confere o alerta antes de criar. Alvo já ultrapassado nunca dispararia, então a pessoa precisa saber na hora. */
export function validarAlerta(sentido: Sentido, alvo: number, precoAtual: number | null): string | null {
  if (!Number.isFinite(alvo) || alvo <= 0) return 'Informe um preço maior que zero.'
  if (precoAtual === null) return 'Ainda sem preço desse ativo. Espere a primeira cotação.'
  if (sentido === 'acima' && alvo <= precoAtual) return `O preço já está em ${reais(precoAtual)}. Pra "acima de", use um valor maior.`
  if (sentido === 'abaixo' && alvo >= precoAtual) return `O preço já está em ${reais(precoAtual)}. Pra "abaixo de", use um valor menor.`
  return null
}

const FORMATO_REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function reais(v: number): string {
  return FORMATO_REAIS.format(v)
}

/** Aceita "12,34", "12.34" e "R$ 1.234,56". */
export function lerPreco(texto: string): number {
  const limpo = texto.replace(/[R$\s]/g, '')
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  return normalizado === '' ? NaN : Number(normalizado)
}
