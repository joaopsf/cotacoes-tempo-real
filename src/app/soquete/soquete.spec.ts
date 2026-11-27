import { ClienteDeCotacoes } from '../cliente/cliente'
import type { MensagemServidor } from '../protocolo/mensagens'
import { PonteLocal } from '../servidor/ponte'
import { RedeSimulada } from './rede'
import { SoqueteSimulado, type FabricaDeSoquete } from './soquete'

// Teste de tipo: o WebSocket do navegador encaixa na mesma fábrica. Se a interface divergir, o typecheck quebra.
export const fabricaReal: FabricaDeSoquete = (url) => new WebSocket(url)

function montar() {
  const ponte = new PonteLocal({ automatico: false, semente: 7 })
  const rede = new RedeSimulada([100, 100])
  const abrir = () => new SoqueteSimulado('wss://teste', ponte, rede)
  return { ponte, rede, abrir }
}

describe('SoqueteSimulado', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('abre depois da latência e segue os estados do WebSocket', async () => {
    const { abrir } = montar()
    const s = abrir()
    const eventos: string[] = []
    s.addEventListener('open', () => eventos.push('open (listener)'))
    s.onopen = () => eventos.push('open (onopen)')

    expect(s.readyState).toBe(SoqueteSimulado.CONNECTING)
    let erro: unknown = null
    try {
      s.send('oi')
    } catch (e) {
      erro = e
    }
    expect((erro as DOMException | null)?.name).toBe('InvalidStateError')
    await vi.advanceTimersByTimeAsync(100)
    expect(s.readyState).toBe(SoqueteSimulado.OPEN)
    expect(eventos).toEqual(['open (listener)', 'open (onopen)'])
  })

  it('a resposta nunca chega dentro do send', async () => {
    const { abrir } = montar()
    const s = abrir()
    await vi.advanceTimersByTimeAsync(100)
    const recebidas: string[] = []
    s.onmessage = (e) => recebidas.push(String(e.data))
    s.send(JSON.stringify({ op: 'assinar', ativos: ['ARVX3'] }))
    expect(recebidas).toEqual([])
    await vi.advanceTimersByTimeAsync(0)
    expect(JSON.parse(recebidas[0]).t).toBe('inicio')
  })

  it('queda de rede: error e close 1006 sem aperto de mão', async () => {
    const { abrir, rede } = montar()
    const s = abrir()
    await vi.advanceTimersByTimeAsync(100)
    const eventos: string[] = []
    s.onerror = () => eventos.push('error')
    s.onclose = (e) => eventos.push(`close ${e.code} limpo=${e.wasClean}`)
    rede.definir('caida')
    await vi.advanceTimersByTimeAsync(0)
    expect(eventos).toEqual(['error', 'close 1006 limpo=false'])
    expect(s.readyState).toBe(SoqueteSimulado.CLOSED)
    // Depois de fechado, send não lança (igual ao navegador).
    expect(() => s.send('x')).not.toThrow()
  })

  it('com a rede caída, conexão nova não abre', async () => {
    const { abrir, rede } = montar()
    rede.definir('caida')
    const s = abrir()
    let codigo = 0
    s.onclose = (e) => (codigo = e.code)
    await vi.advanceTimersByTimeAsync(100)
    expect(codigo).toBe(1006)
  })

  it('rede muda: continua "aberta", mas nada chega', async () => {
    const { abrir, rede, ponte } = montar()
    const s = abrir()
    await vi.advanceTimersByTimeAsync(100)
    s.send(JSON.stringify({ op: 'assinar', ativos: ['ARVX3'] }))
    await vi.advanceTimersByTimeAsync(0)
    const recebidas: unknown[] = []
    s.onmessage = (e) => recebidas.push(e.data)
    rede.definir('muda')
    ponte.servidor.avancar(3000)
    expect(recebidas).toEqual([])
    expect(s.readyState).toBe(SoqueteSimulado.OPEN)
  })

  it('close() fecha limpo e avisa depois, nunca dentro da chamada', async () => {
    const { abrir } = montar()
    const s = abrir()
    await vi.advanceTimersByTimeAsync(100)
    let fechou: CloseEvent | null = null
    s.onclose = (e) => (fechou = e)
    s.close(1000, 'tchau')
    expect(s.readyState).toBe(SoqueteSimulado.CLOSING)
    expect(fechou).toBeNull()
    await vi.advanceTimersByTimeAsync(0)
    expect(fechou).toMatchObject({ code: 1000, reason: 'tchau', wasClean: true })
  })
})

describe('cliente + soquete simulado + servidor', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('cai, espera o backoff, volta e o servidor recebe a reassinatura', async () => {
    const { ponte, rede } = montar()
    const cliente = new ClienteDeCotacoes({
      url: 'wss://teste',
      criarSoquete: (url) => new SoqueteSimulado(url, ponte, rede),
      backoff: { base: 1000, teto: 8000 },
      aleatorio: () => 1,
    })
    const inicios: string[] = []
    cliente.mensagens$.subscribe((m: MensagemServidor) => m.t === 'inicio' && inicios.push(m.s))

    cliente.assinar(['ARVX3', 'BQRZ3'])
    cliente.conectar()
    await vi.advanceTimersByTimeAsync(100)
    expect(cliente.estado.fase).toBe('aberta')
    expect(inicios).toEqual(['ARVX3', 'BQRZ3'])

    rede.definir('caida')
    await vi.advanceTimersByTimeAsync(0)
    expect(cliente.estado.fase).toBe('aguardando')

    // Tentativa com a rede ainda fora: falha e a espera dobra.
    await vi.advanceTimersByTimeAsync(1000 + 100)
    expect(cliente.estado.fase).toBe('aguardando')
    expect(cliente.estado.proximaEm! - Date.now()).toBe(2000)

    rede.definir('normal')
    cliente.cancelar(['BQRZ3'])
    await vi.advanceTimersByTimeAsync(2000 + 100)
    expect(cliente.estado.fase).toBe('aberta')
    expect(inicios).toEqual(['ARVX3', 'BQRZ3', 'ARVX3'])
  })
})
