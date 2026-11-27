import type { Ponte } from '../servidor/ponte'
import type { EstadoDaRede, RedeSimulada } from './rede'

/**
 * O pedaço do WebSocket que o cliente usa. O `WebSocket` do navegador encaixa nesse tipo sem adaptador
 * (há um teste de tipo garantindo), então trocar o simulado pelo real é trocar a fábrica.
 */
export interface SoqueteLike {
  readonly url: string
  readonly readyState: number
  onopen: ((ev: Event) => unknown) | null
  onmessage: ((ev: MessageEvent) => unknown) | null
  onclose: ((ev: CloseEvent) => unknown) | null
  onerror: ((ev: Event) => unknown) | null
  send(dados: string): void
  close(codigo?: number, motivo?: string): void
}

export type FabricaDeSoquete = (url: string) => SoqueteLike

export const CONECTANDO = 0
export const ABERTO = 1
export const FECHANDO = 2
export const FECHADO = 3

let proximoId = 1

function eventoDeFechamento(code: number, reason: string, wasClean: boolean): CloseEvent {
  if (typeof CloseEvent === 'function') return new CloseEvent('close', { code, reason, wasClean })
  const e = new Event('close') as CloseEvent
  Object.defineProperties(e, { code: { value: code }, reason: { value: reason }, wasClean: { value: wasClean } })
  return e
}

/**
 * Um WebSocket de mentira com o comportamento do de verdade: abre depois de uma latência, `send` antes de abrir
 * lança InvalidStateError, queda de rede fecha com 1006 e `wasClean: false`, e as mensagens chegam sempre em
 * outra tarefa, nunca dentro do `send`.
 */
export class SoqueteSimulado extends EventTarget implements SoqueteLike {
  static readonly CONNECTING = CONECTANDO
  static readonly OPEN = ABERTO
  static readonly CLOSING = FECHANDO
  static readonly CLOSED = FECHADO
  readonly CONNECTING = CONECTANDO
  readonly OPEN = ABERTO
  readonly CLOSING = FECHANDO
  readonly CLOSED = FECHADO

  readonly protocol = ''
  readonly extensions = ''
  readonly bufferedAmount = 0
  binaryType: BinaryType = 'blob'

  onopen: ((ev: Event) => unknown) | null = null
  onmessage: ((ev: MessageEvent) => unknown) | null = null
  onclose: ((ev: CloseEvent) => unknown) | null = null
  onerror: ((ev: Event) => unknown) | null = null

  private estado = CONECTANDO
  private readonly id = proximoId++
  private soltarPonte: (() => void) | null = null
  private readonly soltarRede: () => void
  private abertura: ReturnType<typeof setTimeout> | null = null

  constructor(
    readonly url: string,
    private readonly ponte: Ponte,
    private readonly rede: RedeSimulada,
  ) {
    super()
    this.soltarRede = rede.ouvir((e) => this.aoMudarARede(e))
    this.abertura = setTimeout(() => this.tentarAbrir(), rede.sortearLatencia())
  }

  get readyState(): number {
    return this.estado
  }

  send(dados: string): void {
    if (this.estado === CONECTANDO)
      throw new DOMException("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.", 'InvalidStateError')
    // Igual ao navegador: depois de fechado, send não lança erro, só não vai a lugar nenhum.
    if (this.estado !== ABERTO) return
    if (this.rede.estado !== 'normal') return
    this.ponte.enviar({ tipo: 'texto', id: this.id, texto: dados })
  }

  close(codigo = 1000, motivo = ''): void {
    if (this.estado === FECHANDO || this.estado === FECHADO) return
    const estavaAberto = this.estado === ABERTO
    this.estado = FECHANDO
    // O aperto de mão de fechamento leva um instante; o evento nunca dispara dentro do próprio close().
    setTimeout(() => this.encerrar(codigo, motivo, estavaAberto), 0)
  }

  private tentarAbrir(): void {
    this.abertura = null
    if (this.estado !== CONECTANDO) return
    // Já estamos na tarefa do "pacote que voltou": a falha pode ser avisada agora.
    if (this.rede.estado === 'caida') return this.falhar(true)
    // Rede muda: o pedido de conexão some no caminho. Fica "conectando" até alguém desistir.
    if (this.rede.estado === 'muda') return
    this.estado = ABERTO
    this.ponte.enviar({ tipo: 'abrir', id: this.id })
    this.soltarPonte = this.ponte.ouvir((m) => {
      if (m.id !== this.id || this.estado !== ABERTO || this.rede.estado !== 'normal') return
      this.emitir(new MessageEvent('message', { data: m.texto }))
    })
    this.emitir(new Event('open'))
  }

  private aoMudarARede(e: EstadoDaRede): void {
    if (e === 'caida' && (this.estado === ABERTO || this.estado === CONECTANDO)) this.falhar()
    // A rede voltou com um pedido de conexão ainda pendurado: ele finalmente chega.
    if (e === 'normal' && this.estado === CONECTANDO && this.abertura === null) this.tentarAbrir()
  }

  /** Queda de verdade: sem aperto de mão, 1006, `wasClean: false`. */
  private falhar(agora = false): void {
    const estavaAberto = this.estado === ABERTO
    this.estado = FECHANDO
    const avisar = () => {
      this.emitir(new Event('error'))
      this.encerrar(1006, '', estavaAberto, false)
    }
    // Vindo de quem mexeu na rede (um clique), o aviso vai pra outra tarefa, como no navegador.
    if (agora) avisar()
    else setTimeout(avisar, 0)
  }

  private encerrar(codigo: number, motivo: string, avisarServidor: boolean, limpo = true): void {
    if (this.estado === FECHADO) return
    this.estado = FECHADO
    if (this.abertura) clearTimeout(this.abertura)
    this.soltarPonte?.()
    this.soltarRede()
    if (avisarServidor) this.ponte.enviar({ tipo: 'fechar', id: this.id })
    this.emitir(eventoDeFechamento(codigo, motivo, limpo))
  }

  private emitir(e: Event): void {
    this.dispatchEvent(e)
    const manipulador =
      e.type === 'open' ? this.onopen : e.type === 'message' ? this.onmessage : e.type === 'close' ? this.onclose : this.onerror
    ;(manipulador as ((ev: Event) => unknown) | null)?.call(this, e)
  }
}
