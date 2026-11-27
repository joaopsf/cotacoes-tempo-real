import type { MensagemCliente } from '../protocolo/mensagens'
import { aplicarAoConjunto, compactarFila } from './fila'

const assinar = (...ativos: string[]): MensagemCliente => ({ op: 'assinar', ativos })
const cancelar = (...ativos: string[]): MensagemCliente => ({ op: 'cancelar', ativos })

describe('compactarFila', () => {
  it('assinar e cancelar o mesmo ativo offline se anulam', () => {
    expect(compactarFila([assinar('ARVX3'), cancelar('ARVX3')], new Set())).toEqual([])
  })

  it('o último pedido de cada ativo é o que vale', () => {
    expect(compactarFila([assinar('A'), cancelar('A'), assinar('A')], new Set())).toEqual([assinar('A')])
  })

  it('assinar duas vezes vira uma', () => {
    expect(compactarFila([assinar('A', 'B'), assinar('B', 'C')], new Set())).toEqual([assinar('A', 'B', 'C')])
  })

  it('não pede o que o servidor já vai ter', () => {
    const base = new Set(['A', 'B'])
    expect(compactarFila([assinar('A'), cancelar('C')], base)).toEqual([])
    expect(compactarFila([cancelar('A'), assinar('D')], base)).toEqual([cancelar('A'), assinar('D')])
  })

  it('aplicar ao conjunto reproduz o estado final', () => {
    const s = new Set(['A', 'B'])
    aplicarAoConjunto(s, compactarFila([cancelar('A'), assinar('C'), assinar('A'), cancelar('B')], s))
    expect([...s].sort()).toEqual(['A', 'C'])
  })
})
