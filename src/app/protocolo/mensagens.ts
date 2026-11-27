// Protocolo do canal de cotações. Quadros de texto em JSON, como num WebSocket de verdade.
// Campos curtos (t, s, p) porque passam centenas de vezes por segundo.

/** Do painel pro servidor. */
export type MensagemCliente = { op: 'assinar'; ativos: string[] } | { op: 'cancelar'; ativos: string[] }

/** Do servidor pro painel. */
export type MensagemServidor =
  /** Primeira coisa depois de assinar: preço de abertura e o histórico recente, pra sparkline não nascer vazia. */
  | { t: 'inicio'; s: string; abertura: number; hist: number[]; ts: number }
  | { t: 'tick'; s: string; p: number; ts: number }
  | { t: 'cancelado'; ativos: string[] }
  /** Batimento: com o mercado parado ou sem assinatura, ainda dá pra saber que a conexão está viva. */
  | { t: 'pulso'; ts: number }
  | { t: 'erro'; motivo: string }

export type Tick = Extract<MensagemServidor, { t: 'tick' }>

export function codificar(m: MensagemCliente | MensagemServidor): string {
  return JSON.stringify(m)
}

function listaDeTexto(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Lê o que chega do servidor. Quadro estranho vira null em vez de derrubar o painel. */
export function lerDoServidor(texto: unknown): MensagemServidor | null {
  if (typeof texto !== 'string') return null
  let m: Record<string, unknown>
  try {
    const bruto: unknown = JSON.parse(texto)
    if (!bruto || typeof bruto !== 'object') return null
    m = bruto as Record<string, unknown>
  } catch {
    return null
  }
  switch (m['t']) {
    case 'tick':
      return typeof m['s'] === 'string' && numero(m['p']) && numero(m['ts']) ? { t: 'tick', s: m['s'], p: m['p'], ts: m['ts'] } : null
    case 'inicio':
      return typeof m['s'] === 'string' && numero(m['abertura']) && numero(m['ts']) && Array.isArray(m['hist']) && m['hist'].every(numero)
        ? { t: 'inicio', s: m['s'], abertura: m['abertura'], hist: m['hist'], ts: m['ts'] }
        : null
    case 'cancelado':
      return listaDeTexto(m['ativos']) ? { t: 'cancelado', ativos: m['ativos'] } : null
    case 'pulso':
      return numero(m['ts']) ? { t: 'pulso', ts: m['ts'] } : null
    case 'erro':
      return typeof m['motivo'] === 'string' ? { t: 'erro', motivo: m['motivo'] } : null
    default:
      return null
  }
}

/** Lê o que chega do painel (lado do servidor). */
export function lerDoCliente(texto: unknown): MensagemCliente | null {
  if (typeof texto !== 'string') return null
  try {
    const m = JSON.parse(texto) as Record<string, unknown> | null
    if (!m || typeof m !== 'object') return null
    if ((m['op'] === 'assinar' || m['op'] === 'cancelar') && listaDeTexto(m['ativos'])) return { op: m['op'], ativos: m['ativos'] }
    return null
  } catch {
    return null
  }
}
