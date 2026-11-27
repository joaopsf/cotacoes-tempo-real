import { TestBed } from '@angular/core/testing'
import { Subject } from 'rxjs'
import { App, CHAVE_GUIA } from './app'
import { Mesa, PONTE, QUADROS } from './mesa'
import { codificar, type MensagemServidor } from './protocolo/mensagens'
import type { DoServidor, ParaServidor, Ponte } from './servidor/ponte'

/** Servidor de mentira: o teste decide exatamente o que chega pelo soquete. */
class PonteDeTeste implements Ponte {
  readonly recebidos: ParaServidor[] = []
  conexao: number | null = null
  private ouvinte: ((m: DoServidor) => void) | null = null
  enviar(m: ParaServidor): void {
    this.recebidos.push(m)
    if (m.tipo === 'abrir') this.conexao = m.id
  }
  ouvir(fn: (m: DoServidor) => void): () => void {
    this.ouvinte = fn
    return () => (this.ouvinte = null)
  }
  encerrar(): void {
    this.ouvinte = null
  }
  falar(m: MensagemServidor): void {
    this.ouvinte?.({ tipo: 'texto', id: this.conexao!, texto: codificar(m) })
  }
}

async function montar() {
  const ponte = new PonteDeTeste()
  const quadros = new Subject<void>()
  TestBed.configureTestingModule({
    providers: [
      { provide: PONTE, useValue: ponte },
      { provide: QUADROS, useValue: () => quadros },
    ],
  })
  const fixture = TestBed.createComponent(App)
  document.body.appendChild(fixture.nativeElement)
  await fixture.whenStable()
  const raiz = fixture.nativeElement as HTMLElement
  const mesa = TestBed.inject(Mesa)
  const quadro = async () => {
    quadros.next()
    await fixture.whenStable()
  }
  return { fixture, raiz, ponte, mesa, quadro }
}

async function conectado(ponte: PonteDeTeste, mesa: Mesa) {
  await vi.waitFor(() => expect(mesa.conexao().fase).toBe('aberta'), { timeout: 2000 })
  expect(ponte.conexao).not.toBeNull()
}

const botao = (raiz: HTMLElement, texto: string) => [...raiz.querySelectorAll('button')].find((b) => b.textContent?.includes(texto))!
const celulaDePreco = (raiz: HTMLElement, codigo: string) =>
  [...raiz.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes(codigo))?.querySelector('.preco')

describe('App', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => document.body.replaceChildren())

  it('guia abre na primeira visita, fecha pelo Entendi e volta pelo "Como testar"', async () => {
    const { raiz, fixture } = await montar()
    expect(raiz.querySelector('.guia h2')?.textContent).toBe('Teste em 1 minuto')

    raiz.querySelector<HTMLButtonElement>('.guia .botao--primario')!.click()
    await fixture.whenStable()
    expect(raiz.querySelector('.guia')).toBeNull()
    expect(localStorage.getItem(CHAVE_GUIA)).toBe('1')

    botao(raiz, 'Como testar').click()
    await fixture.whenStable()
    expect(raiz.querySelector('.guia')).not.toBeNull()
  })

  it('conecta, assina a lista inicial e mostra o preço que chega', async () => {
    const { raiz, ponte, mesa, quadro } = await montar()
    await conectado(ponte, mesa)
    const assinatura = ponte.recebidos.find((m) => m.tipo === 'texto')
    expect(assinatura?.tipo === 'texto' && JSON.parse(assinatura.texto)).toEqual({ op: 'assinar', ativos: mesa.acompanhados() })

    ponte.falar({ t: 'inicio', s: 'ARVX3', abertura: 18, hist: [18, 18.2], ts: 0 })
    ponte.falar({ t: 'tick', s: 'ARVX3', p: 18.36, ts: 1 })
    await quadro()
    expect(celulaDePreco(raiz, 'ARVX3')?.textContent?.trim()).toBe('18,36')
    expect(celulaDePreco(raiz, 'ARVX3')?.getAttribute('data-dir')).toBe('1')
    expect(raiz.querySelector('.conexao__fase')?.textContent).toBe('Conectado')
  })

  it('agrupado, 50 ticks viram um desenho; sem agrupar, cada tick é um desenho', async () => {
    const { fixture, ponte, mesa, quadro } = await montar()
    await conectado(ponte, mesa)
    ponte.falar({ t: 'inicio', s: 'ARVX3', abertura: 18, hist: [18], ts: 0 })
    await quadro()

    let antes = mesa.versao()
    for (let i = 1; i <= 50; i++) ponte.falar({ t: 'tick', s: 'ARVX3', p: 18 + i / 100, ts: i })
    expect(mesa.versao()).toBe(antes)
    await quadro()
    expect(mesa.versao()).toBe(antes + 1)

    mesa.agrupar.set(false)
    await fixture.whenStable()
    antes = mesa.versao()
    for (let i = 1; i <= 50; i++) ponte.falar({ t: 'tick', s: 'ARVX3', p: 19 + i / 100, ts: i })
    expect(mesa.versao()).toBe(antes + 50)
    expect(mesa.livro.cotacao('ARVX3')!.negocios).toBe(100)
  })

  it('a tabela não é região viva; o alerta é, e é anunciado quando o preço cruza', async () => {
    const { raiz, fixture, ponte, mesa, quadro } = await montar()
    await conectado(ponte, mesa)
    ponte.falar({ t: 'inicio', s: 'ARVX3', abertura: 18, hist: [18.3], ts: 0 })
    await quadro()

    const tabela = raiz.querySelector('table')!
    expect(tabela.closest('[aria-live]')).toBeNull()
    expect(tabela.querySelector('[aria-live], [role=status], [role=alert]')).toBeNull()
    const regiao = raiz.querySelector('.avisos')!
    expect(regiao.getAttribute('aria-live')).toBe('assertive')
    expect(regiao.children.length).toBe(0)

    const campo = raiz.querySelector<HTMLInputElement>('#alvo')!
    campo.value = '18,50'
    campo.dispatchEvent(new Event('input'))
    raiz.querySelector('form')!.dispatchEvent(new Event('submit'))
    await fixture.whenStable()
    expect(raiz.querySelector('.alertas__lista')?.textContent).toContain('ARVX3')

    ponte.falar({ t: 'tick', s: 'ARVX3', p: 18.42, ts: 1 })
    await quadro()
    expect(regiao.children.length).toBe(0)

    ponte.falar({ t: 'tick', s: 'ARVX3', p: 18.51, ts: 2 })
    await quadro()
    // Intl põe espaço não separável depois do R$; normaliza pra comparar.
    const aviso = regiao.querySelector('[role=alert]')?.textContent?.replace(/\s+/g, ' ')
    expect(aviso).toContain('ARVX3 subiu até R$ 18,50')
    expect(aviso).toContain('Agora em R$ 18,51')
    expect(mesa.alertas()).toEqual([])
  })

  it('alerta com alvo já ultrapassado é recusado com explicação, e o foco volta pro campo', async () => {
    const { raiz, fixture, ponte, mesa, quadro } = await montar()
    await conectado(ponte, mesa)
    ponte.falar({ t: 'inicio', s: 'ARVX3', abertura: 18, hist: [18.3], ts: 0 })
    await quadro()

    const campo = raiz.querySelector<HTMLInputElement>('#alvo')!
    campo.value = '17'
    campo.dispatchEvent(new Event('input'))
    raiz.querySelector('form')!.dispatchEvent(new Event('submit'))
    await fixture.whenStable()
    expect(campo.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(campo.getAttribute('aria-describedby')!)?.textContent).toContain('use um valor maior')
    expect(document.activeElement).toBe(campo)
    expect(mesa.alertas()).toEqual([])
  })

  it('pausar congela a tela, mas os dados e o alerta continuam', async () => {
    const { raiz, fixture, ponte, mesa, quadro } = await montar()
    await conectado(ponte, mesa)
    ponte.falar({ t: 'inicio', s: 'ARVX3', abertura: 18, hist: [18.3], ts: 0 })
    await quadro()
    expect(mesa.criarAlerta('ARVX3', 'acima', 18.5)).toBeNull()

    botao(raiz, 'Pausar a tela').click()
    await fixture.whenStable()
    ponte.falar({ t: 'tick', s: 'ARVX3', p: 18.6, ts: 1 })
    await quadro()
    expect(celulaDePreco(raiz, 'ARVX3')?.textContent?.trim()).toBe('18,30')
    expect(raiz.querySelector('.avisos [role=alert]')).not.toBeNull()

    botao(raiz, 'Continuar').click()
    await fixture.whenStable()
    expect(celulaDePreco(raiz, 'ARVX3')?.textContent?.trim()).toBe('18,60')
  })

  it('tirar um ativo da lista cancela a assinatura no protocolo e devolve o foco', async () => {
    const { raiz, fixture, ponte, mesa } = await montar()
    await conectado(ponte, mesa)
    raiz.querySelector<HTMLButtonElement>('[aria-label="Parar de acompanhar BQRZ3"]')!.click()
    await fixture.whenStable()
    const ultima = ponte.recebidos.at(-1)
    expect(ultima?.tipo === 'texto' && JSON.parse(ultima.texto)).toEqual({ op: 'cancelar', ativos: ['BQRZ3'] })
    expect(raiz.querySelector('[aria-label="Parar de acompanhar BQRZ3"]')).toBeNull()
    expect(document.activeElement?.textContent).toContain('Adicionar ativo')

    botao(raiz, 'Adicionar ativo').click()
    await fixture.whenStable()
    botao(raiz, 'BQRZ3').click()
    await fixture.whenStable()
    const depois = ponte.recebidos.at(-1)
    expect(depois?.tipo === 'texto' && JSON.parse(depois.texto)).toEqual({ op: 'assinar', ativos: ['BQRZ3'] })
  })
})
