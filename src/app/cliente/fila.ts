import type { MensagemCliente } from '../protocolo/mensagens'

/**
 * Fila de saída: o que o painel mandou enquanto estava sem conexão.
 * Ela não guarda a sequência crua. Assinar e cancelar o mesmo ativo offline se anulam, e assinar duas vezes
 * vira uma vez, porque o que importa pro servidor é o estado final, não o histórico de cliques.
 * `base` é o que o servidor vai ter assinado quando a fila for despejada (a reassinatura da volta).
 */
export function compactarFila(fila: readonly MensagemCliente[], base: ReadonlySet<string>): MensagemCliente[] {
  const final = new Map<string, boolean>()
  for (const m of fila) for (const s of m.ativos) final.set(s, m.op === 'assinar')

  const cancelar: string[] = []
  const assinar: string[] = []
  for (const [s, quer] of final) {
    if (quer && !base.has(s)) assinar.push(s)
    if (!quer && base.has(s)) cancelar.push(s)
  }
  const saida: MensagemCliente[] = []
  if (cancelar.length) saida.push({ op: 'cancelar', ativos: cancelar })
  if (assinar.length) saida.push({ op: 'assinar', ativos: assinar })
  return saida
}

/** Aplica mensagens a um conjunto de assinaturas (o que o servidor passa a ter depois de recebê-las). */
export function aplicarAoConjunto(conjunto: Set<string>, mensagens: readonly MensagemCliente[]): void {
  for (const m of mensagens) {
    for (const s of m.ativos) {
      if (m.op === 'assinar') conjunto.add(s)
      else conjunto.delete(s)
    }
  }
}
