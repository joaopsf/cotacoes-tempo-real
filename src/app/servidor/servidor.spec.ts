import { CODIGOS } from '../protocolo/ativos'
import { codificar, lerDoServidor, type MensagemServidor } from '../protocolo/mensagens'
import { ServidorDeCotacoes } from './servidor'

function montar(taxa = 300) {
  const recebidas = new Map<number, MensagemServidor[]>()
  const servidor = new ServidorDeCotacoes(
    (id, texto) => {
      const m = lerDoServidor(texto)
      if (!m) throw new Error('servidor mandou quadro inválido: ' + texto)
      recebidas.set(id, [...(recebidas.get(id) ?? []), m])
    },
    { taxa, semente: 42, agora: () => 1000 },
  )
  const de = (id: number) => recebidas.get(id) ?? []
  const limpar = () => recebidas.clear()
  return { servidor, de, limpar }
}

const ticks = (l: MensagemServidor[]) => l.filter((m) => m.t === 'tick')

describe('ServidorDeCotacoes (protocolo de assinatura)', () => {
  it('assinar devolve abertura e histórico, e depois só ticks dos ativos assinados', () => {
    const { servidor, de } = montar()
    servidor.abrir(1)
    servidor.receber(1, codificar({ op: 'assinar', ativos: ['ARVX3', 'QRTZ3'] }))

    const inicio = de(1).filter((m) => m.t === 'inicio')
    expect(inicio.map((m) => m.s)).toEqual(['ARVX3', 'QRTZ3'])
    expect(inicio[0].t === 'inicio' && inicio[0].hist.length).toBe(120)

    servidor.avancar(2000)
    const recebidos = ticks(de(1))
    expect(recebidos.length).toBeGreaterThan(0)
    expect(new Set(recebidos.map((m) => m.t === 'tick' && m.s))).toEqual(new Set(['ARVX3', 'QRTZ3']))
  })

  it('cancelar para os ticks daquele ativo e confirma', () => {
    const { servidor, de, limpar } = montar()
    servidor.abrir(1)
    servidor.receber(1, codificar({ op: 'assinar', ativos: ['ARVX3', 'QRTZ3'] }))
    servidor.receber(1, codificar({ op: 'cancelar', ativos: ['ARVX3'] }))
    expect(de(1).at(-1)).toEqual({ t: 'cancelado', ativos: ['ARVX3'] })
    limpar()
    servidor.avancar(3000)
    expect(ticks(de(1)).every((m) => m.t === 'tick' && m.s === 'QRTZ3')).toBe(true)
  })

  it('assinar de novo o que já está assinado não duplica o início', () => {
    const { servidor, de } = montar()
    servidor.abrir(1)
    servidor.receber(1, codificar({ op: 'assinar', ativos: ['ARVX3'] }))
    servidor.receber(1, codificar({ op: 'assinar', ativos: ['ARVX3'] }))
    expect(de(1).filter((m) => m.t === 'inicio').length).toBe(1)
    expect(servidor.assinaturas(1)).toEqual(['ARVX3'])
  })

  it('cada conexão recebe só o que ela assinou', () => {
    const { servidor, de } = montar()
    servidor.abrir(1)
    servidor.abrir(2)
    servidor.receber(1, codificar({ op: 'assinar', ativos: ['ARVX3'] }))
    servidor.receber(2, codificar({ op: 'assinar', ativos: ['BQRZ3'] }))
    servidor.avancar(3000)
    expect(ticks(de(1)).every((m) => m.t === 'tick' && m.s === 'ARVX3')).toBe(true)
    expect(ticks(de(2)).every((m) => m.t === 'tick' && m.s === 'BQRZ3')).toBe(true)
  })

  it('conexão fechada esquece as assinaturas (conexão nova começa vazia)', () => {
    const { servidor } = montar()
    servidor.abrir(1)
    servidor.receber(1, codificar({ op: 'assinar', ativos: ['ARVX3'] }))
    servidor.fechar(1)
    servidor.abrir(1)
    expect(servidor.assinaturas(1)).toEqual([])
  })

  it('responde erro pra ativo desconhecido e mensagem quebrada, sem cair', () => {
    const { servidor, de } = montar()
    servidor.abrir(1)
    servidor.receber(1, codificar({ op: 'assinar', ativos: ['XXXX3', 'ARVX3'] }))
    servidor.receber(1, '{"op":"comprar"}')
    expect(
      de(1)
        .filter((m) => m.t === 'erro')
        .map((m) => m.t === 'erro' && m.motivo),
    ).toEqual(['ativo desconhecido: XXXX3', 'mensagem inválida'])
    expect(servidor.assinaturas(1)).toEqual(['ARVX3'])
  })

  it('gera a taxa pedida, mesmo com passos de 10 ms que não dão número inteiro', () => {
    const { servidor, de } = montar(250)
    servidor.abrir(1)
    servidor.receber(1, codificar({ op: 'assinar', ativos: CODIGOS }))
    for (let i = 0; i < 100; i++) servidor.avancar(10)
    expect(ticks(de(1)).length).toBe(250)
  })

  it('manda batimento a cada segundo, mesmo sem nenhuma assinatura', () => {
    const { servidor, de } = montar()
    servidor.abrir(1)
    for (let i = 0; i < 300; i++) servidor.avancar(10)
    expect(de(1).filter((m) => m.t === 'pulso').length).toBe(3)
  })

  it('preço anda em centavos e nunca fica zero ou negativo', () => {
    const { servidor, de } = montar(2000)
    servidor.abrir(1)
    servidor.receber(1, codificar({ op: 'assinar', ativos: CODIGOS }))
    servidor.avancar(5000)
    for (const m of ticks(de(1))) {
      if (m.t !== 'tick') continue
      expect(m.p).toBeGreaterThan(0)
      expect(Math.round(m.p * 100) / 100).toBe(m.p)
    }
  })
})
