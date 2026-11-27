import type { MensagemServidor } from '../protocolo/mensagens'
import type { SoqueteLike } from '../soquete/soquete'
import { ClienteDeCotacoes, type OpcoesCliente } from './cliente'

/** Soquete controlado pelo teste: abre, recebe e cai quando o teste manda. */
class SoqueteDeTeste implements SoqueteLike {
  readyState = 0
  readonly enviados: string[] = []
  fechadoCom: number | null = null
  onopen: ((ev: Event) => unknown) | null = null
  onmessage: ((ev: MessageEvent) => unknown) | null = null
  onclose: ((ev: CloseEvent) => unknown) | null = null
  onerror: ((ev: Event) => unknown) | null = null

  constructor(readonly url: string) {}

  send(dados: string): void {
    if (this.readyState !== 1) throw new Error('send com o soquete fora do ar')
    this.enviados.push(dados)
  }
  close(codigo = 1000): void {
    this.readyState = 3
    this.fechadoCom = codigo
  }
  abrir(): void {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }
  receber(m: MensagemServidor): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(m) }))
  }
  cair(code = 1006): void {
    this.readyState = 3
    this.onclose?.({ code, reason: '', wasClean: false } as CloseEvent)
  }
  get mensagens(): unknown[] {
    return this.enviados.map((t) => JSON.parse(t))
  }
}

function montar(opcoes: Partial<OpcoesCliente> = {}) {
  const soquetes: SoqueteDeTeste[] = []
  const cliente = new ClienteDeCotacoes({
    url: 'wss://teste',
    criarSoquete: (url) => {
      const s = new SoqueteDeTeste(url)
      soquetes.push(s)
      return s
    },
    backoff: { base: 500, teto: 8000 },
    // Sorteio no máximo: o atraso fica previsível (a janela inteira).
    aleatorio: () => 1,
    ...opcoes,
  })
  const ultimo = () => soquetes[soquetes.length - 1]
  return { cliente, soquetes, ultimo }
}

describe('ClienteDeCotacoes', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('assinatura feita antes de conectar sai assim que a conexão abre', () => {
    const { cliente, ultimo } = montar()
    cliente.assinar(['ARVX3', 'BQRZ3'])
    expect(cliente.estado.fila).toEqual([{ op: 'assinar', ativos: ['ARVX3', 'BQRZ3'] }])

    cliente.conectar()
    expect(cliente.estado.fase).toBe('conectando')
    ultimo().abrir()

    expect(cliente.estado.fase).toBe('aberta')
    expect(ultimo().mensagens).toEqual([{ op: 'assinar', ativos: ['ARVX3', 'BQRZ3'] }])
    expect(cliente.estado.fila).toEqual([])
  })

  it('conexão aberta: assinar e cancelar saem na hora', () => {
    const { cliente, ultimo } = montar()
    cliente.conectar()
    ultimo().abrir()
    cliente.assinar(['A'])
    cliente.cancelar(['A'])
    expect(ultimo().mensagens).toEqual([
      { op: 'assinar', ativos: ['A'] },
      { op: 'cancelar', ativos: ['A'] },
    ])
  })

  it('reconecta com backoff exponencial e teto, sem tentar antes da hora', () => {
    const { cliente, soquetes, ultimo } = montar()
    cliente.conectar()
    const esperas: number[] = []
    for (let i = 0; i < 6; i++) {
      const antes = soquetes.length
      ultimo().cair()
      expect(cliente.estado.fase).toBe('aguardando')
      const espera = cliente.estado.proximaEm! - Date.now()
      esperas.push(espera)
      vi.advanceTimersByTime(espera - 1)
      expect(soquetes.length).toBe(antes)
      vi.advanceTimersByTime(1)
      expect(soquetes.length).toBe(antes + 1)
      expect(cliente.estado.fase).toBe('conectando')
    }
    expect(esperas).toEqual([500, 1000, 2000, 4000, 8000, 8000])
    expect(cliente.estado.tentativa).toBe(6)
  })

  it('o contador de tentativas só zera depois de a conexão ficar estável', () => {
    const { cliente, ultimo } = montar({ estavelApos: 3000 })
    cliente.conectar()
    ultimo().cair()
    vi.advanceTimersByTime(500)
    ultimo().cair()
    vi.advanceTimersByTime(1000)

    // Abre e cai antes de 3 s: conta como mais uma falha seguida, a espera continua crescendo.
    ultimo().abrir()
    vi.advanceTimersByTime(2000)
    ultimo().cair()
    expect(cliente.estado.proximaEm! - Date.now()).toBe(2000)
    vi.advanceTimersByTime(2000)

    // Agora fica 3 s aberta: na próxima queda volta pro começo.
    ultimo().abrir()
    vi.advanceTimersByTime(3000)
    expect(cliente.estado.tentativa).toBe(0)
    ultimo().cair()
    expect(cliente.estado.proximaEm! - Date.now()).toBe(500)
  })

  it('na volta, reassina o que estava ativo e despeja a fila já compactada', () => {
    const { cliente, ultimo } = montar()
    cliente.conectar()
    ultimo().abrir()
    cliente.assinar(['A', 'B'])
    ultimo().cair()

    // Offline: os pedidos vão pra fila, que guarda só o efeito final.
    cliente.assinar(['C'])
    cliente.cancelar(['B'])
    cliente.assinar(['D'])
    cliente.cancelar(['D'])
    expect(cliente.estado.fila).toEqual([
      { op: 'cancelar', ativos: ['B'] },
      { op: 'assinar', ativos: ['C'] },
    ])

    vi.advanceTimersByTime(500)
    ultimo().abrir()
    // Conexão nova começa vazia: o cancelamento de B vira "não reassinar B".
    expect(ultimo().mensagens).toEqual([
      { op: 'assinar', ativos: ['A'] },
      { op: 'assinar', ativos: ['C'] },
    ])
    expect(cliente.estado.fila).toEqual([])
    expect(cliente.assinados.sort()).toEqual(['A', 'C'])
  })

  it('conexão muda: sem nenhuma mensagem no prazo, derruba e reconecta', () => {
    const { cliente, soquetes, ultimo } = montar({ prazoDeSilencio: 4000 })
    cliente.conectar()
    ultimo().abrir()

    // Com batimento chegando, fica aberta.
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(1000)
      ultimo().receber({ t: 'pulso', ts: Date.now() })
    }
    expect(cliente.estado.fase).toBe('aberta')

    // Sem nada por mais de 4 s: dá a conexão como morta.
    vi.advanceTimersByTime(5000)
    expect(soquetes[0].fechadoCom).toBe(4000)
    expect(cliente.estado.fase).toBe('aguardando')
    expect(cliente.estado.motivo).toBe('sem sinal do servidor')
  })

  it('conexão que não abre no prazo é abandonada', () => {
    const { cliente, soquetes } = montar({ prazoDeConexao: 5000 })
    cliente.conectar()
    vi.advanceTimersByTime(5000)
    expect(soquetes[0].readyState).toBe(3)
    expect(cliente.estado.fase).toBe('aguardando')
    expect(cliente.estado.motivo).toBe('conexão não abriu a tempo')
  })

  it('o close atrasado de um soquete abandonado não mexe no soquete novo', () => {
    const { cliente, soquetes, ultimo } = montar({ prazoDeConexao: 1000 })
    cliente.conectar()
    const velho = soquetes[0]
    const onclose = velho.onclose
    vi.advanceTimersByTime(1000 + 500)
    ultimo().abrir()
    onclose?.({ code: 1006 } as CloseEvent)
    expect(cliente.estado.fase).toBe('aberta')
  })

  it('tentar agora pula a espera', () => {
    const { cliente, soquetes, ultimo } = montar()
    cliente.conectar()
    ultimo().cair()
    cliente.tentarAgora()
    expect(soquetes.length).toBe(2)
    ultimo().abrir()
    // E o relógio antigo (500 ms) não abre uma terceira conexão depois.
    vi.advanceTimersByTime(2000)
    expect(soquetes.length).toBe(2)
    expect(cliente.estado.fase).toBe('aberta')
  })

  it('desconectar de propósito não tenta voltar', () => {
    const { cliente, soquetes, ultimo } = montar()
    cliente.conectar()
    ultimo().abrir()
    cliente.desconectar()
    vi.advanceTimersByTime(60_000)
    expect(soquetes.length).toBe(1)
    expect(soquetes[0].fechadoCom).toBe(1000)
    expect(cliente.estado.fase).toBe('parada')
  })

  it('repassa as mensagens válidas e ignora quadro estranho', () => {
    const { cliente, ultimo } = montar()
    const recebidas: MensagemServidor[] = []
    cliente.mensagens$.subscribe((m) => recebidas.push(m))
    cliente.conectar()
    ultimo().abrir()
    ultimo().receber({ t: 'tick', s: 'A', p: 10.5, ts: 1 })
    ultimo().onmessage?.(new MessageEvent('message', { data: '{quebrado' }))
    ultimo().onmessage?.(new MessageEvent('message', { data: JSON.stringify({ t: 'tick', s: 'A', p: 'dez' }) }))
    expect(recebidas).toEqual([{ t: 'tick', s: 'A', p: 10.5, ts: 1 }])
  })
})
