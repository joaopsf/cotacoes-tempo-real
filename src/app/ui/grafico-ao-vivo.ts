import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core'
import { reais } from '../dados/alertas'
import { variacao } from '../dados/livro'
import { Mesa } from '../mesa'
import { ativo } from '../protocolo/ativos'
import { Icone } from './icone'

export const PONTOS_DO_GRAFICO = 300
const PRECO = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const INTEIRO = new Intl.NumberFormat('pt-BR')

interface Cores {
  linha: string
  sobe: string
  desce: string
  grade: string
  texto: string
  abertura: string
  fundo: string
}

/** Escala "bonita" pro eixo: passos de 1, 2 ou 5 × 10^n. */
export function passoDoEixo(amplitude: number, divisoes = 4): number {
  const bruto = amplitude / divisoes || 0.01
  const ordem = 10 ** Math.floor(Math.log10(bruto))
  const r = bruto / ordem
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * ordem
}

// Gráfico desenhado à mão no canvas. Uma biblioteca de gráficos traria dezenas de KB e um ciclo de
// atualização próprio; aqui o desenho acontece uma vez por versão, junto com a tabela.
@Component({
  selector: 'app-grafico-ao-vivo',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cartao grafico" aria-labelledby="grafico-titulo">
      <div class="cartao__cabeca">
        <h2 id="grafico-titulo" class="cartao__titulo">
          <app-icone nome="grafico" />
          {{ codigo() }} <span class="grafico__nome">{{ nome() }}</span>
        </h2>
      </div>
      <div class="grafico__tela" #caixa>
        <canvas #tela role="img" [attr.aria-label]="rotulo()"></canvas>
      </div>
      <dl class="grafico__numeros">
        <div>
          <dt>Último</dt>
          <dd>{{ numeros().ultimo }}</dd>
        </div>
        <div>
          <dt>Variação</dt>
          <dd [attr.data-sinal]="numeros().sinal">{{ numeros().variacao }}</dd>
        </div>
        <div>
          <dt>Máxima</dt>
          <dd>{{ numeros().maxima }}</dd>
        </div>
        <div>
          <dt>Mínima</dt>
          <dd>{{ numeros().minima }}</dd>
        </div>
        <div>
          <dt>Negócios</dt>
          <dd>{{ numeros().negocios }}</dd>
        </div>
      </dl>
    </section>
  `,
})
export class GraficoAoVivo {
  private readonly mesa = inject(Mesa)
  private readonly tela = viewChild.required<ElementRef<HTMLCanvasElement>>('tela')
  private readonly caixa = viewChild.required<ElementRef<HTMLDivElement>>('caixa')
  private readonly tamanho = signal({ largura: 0, altura: 0, dpr: 1 })
  private cores: Cores | null = null

  protected readonly codigo = this.mesa.selecionado
  protected readonly nome = computed(() => ativo(this.codigo())?.nome ?? '')
  protected readonly rotulo = computed(
    () => `Gráfico do preço de ${this.codigo()} nos últimos ${PONTOS_DO_GRAFICO} negócios. Os números estão logo abaixo.`,
  )

  protected readonly numeros = computed(() => {
    this.mesa.versao()
    const c = this.mesa.livro.cotacao(this.codigo())
    const v = c ? variacao(c) : null
    return {
      ultimo: c?.preco != null ? reais(c.preco) : '…',
      variacao: v === null ? '…' : `${v > 0 ? '+' : ''}${PRECO.format(v)}%`,
      sinal: v === null ? 0 : Math.sign(v),
      maxima: c && Number.isFinite(c.maxima) ? reais(c.maxima) : '…',
      minima: c && Number.isFinite(c.minima) ? reais(c.minima) : '…',
      negocios: c ? INTEIRO.format(c.negocios) : '0',
    }
  })

  constructor() {
    const destruir = inject(DestroyRef)
    afterRenderEffect(() => {
      // Dependências: versão (dados novos), ativo selecionado e tamanho da caixa.
      this.mesa.versao()
      this.desenhar(this.codigo(), this.tamanho())
    })
    afterNextRender(() => {
      if (typeof ResizeObserver !== 'function') return
      const caixa = this.caixa().nativeElement
      const obs = new ResizeObserver(([e]) => {
        const { width, height } = e.contentRect
        this.tamanho.set({ largura: Math.round(width), altura: Math.round(height), dpr: Math.min(2, window.devicePixelRatio || 1) })
      })
      obs.observe(caixa)
      destruir.onDestroy(() => obs.disconnect())
    })
  }

  private lerCores(el: HTMLElement): Cores {
    const css = getComputedStyle(el)
    const v = (nome: string, padrao: string) => css.getPropertyValue(nome).trim() || padrao
    return {
      linha: v('--tinta', '#e8eefc'),
      sobe: v('--sobe', '#2fd17a'),
      desce: v('--desce', '#ff6b7a'),
      grade: v('--linha', '#24304a'),
      texto: v('--tinta-3', '#8d9ab8'),
      abertura: v('--ambar', '#f3b54a'),
      fundo: v('--placa', '#111a2c'),
    }
  }

  private desenhar(codigo: string, { largura, altura, dpr }: { largura: number; altura: number; dpr: number }): void {
    const canvas = this.tela().nativeElement
    if (!largura || !altura) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (canvas.width !== largura * dpr || canvas.height !== altura * dpr) {
      canvas.width = largura * dpr
      canvas.height = altura * dpr
    }
    this.cores ??= this.lerCores(canvas)
    const cor = this.cores
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, largura, altura)

    const c = this.mesa.livro.cotacao(codigo)
    if (!c || c.serie.length < 2) {
      ctx.fillStyle = cor.texto
      ctx.font = '13px system-ui, sans-serif'
      ctx.fillText('Esperando cotações…', 12, 24)
      return
    }

    const s = c.serie
    const n = Math.min(PONTOS_DO_GRAFICO, s.length)
    const primeiro = s.length - n
    let [min, max] = s.faixa(n)
    if (c.abertura !== null && c.abertura >= min - (max - min) && c.abertura <= max + (max - min)) {
      min = Math.min(min, c.abertura)
      max = Math.max(max, c.abertura)
    }
    const folga = (max - min) * 0.12 || 0.05
    min -= folga
    max += folga

    const margemDireita = 64
    const topo = 10
    const base = altura - 18
    const larguraUtil = largura - margemDireita
    // Com menos de 300 pontos, a linha encosta na direita e cresce pra esquerda, como num gráfico de corretora.
    const xi = (i: number) => ((PONTOS_DO_GRAFICO - n + i) / (PONTOS_DO_GRAFICO - 1)) * larguraUtil
    const y = (v: number) => topo + (1 - (v - min) / (max - min)) * (base - topo)

    // Grade e eixo de preço.
    const passo = passoDoEixo(max - min)
    ctx.strokeStyle = cor.grade
    ctx.lineWidth = 1
    ctx.fillStyle = cor.texto
    ctx.font = '11px ui-monospace, Consolas, monospace'
    ctx.textBaseline = 'middle'
    for (let v = Math.ceil(min / passo) * passo; v <= max; v += passo) {
      const py = Math.round(y(v)) + 0.5
      ctx.beginPath()
      ctx.moveTo(0, py)
      ctx.lineTo(larguraUtil, py)
      ctx.stroke()
      ctx.fillText(PRECO.format(v), larguraUtil + 8, py)
    }

    // Linha da abertura: referência da variação do dia.
    if (c.abertura !== null && c.abertura > min && c.abertura < max) {
      const py = Math.round(y(c.abertura)) + 0.5
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = cor.abertura
      ctx.beginPath()
      ctx.moveTo(0, py)
      ctx.lineTo(larguraUtil, py)
      ctx.stroke()
      ctx.restore()
    }

    const ultimo = s.em(s.length - 1)
    const subiu = c.abertura === null || ultimo >= c.abertura
    const tom = subiu ? cor.sobe : cor.desce

    // Área e linha numa passada só pelo buffer, sem criar array.
    ctx.beginPath()
    ctx.moveTo(xi(0), y(s.em(primeiro)))
    for (let i = 1; i < n; i++) ctx.lineTo(xi(i), y(s.em(primeiro + i)))
    ctx.strokeStyle = tom
    ctx.lineWidth = 1.75
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.lineTo(xi(n - 1), base)
    ctx.lineTo(xi(0), base)
    ctx.closePath()
    const degrade = ctx.createLinearGradient(0, topo, 0, base)
    degrade.addColorStop(0, tom + '55')
    degrade.addColorStop(1, tom + '00')
    ctx.fillStyle = degrade
    ctx.fill()

    // Etiqueta do último preço, presa ao eixo.
    const py = y(ultimo)
    ctx.fillStyle = tom
    ctx.beginPath()
    ctx.arc(xi(n - 1), py, 3, 0, Math.PI * 2)
    ctx.fill()
    const etiqueta = PRECO.format(ultimo)
    ctx.fillRect(larguraUtil + 2, py - 9, margemDireita - 4, 18)
    ctx.fillStyle = cor.fundo
    ctx.font = 'bold 11px ui-monospace, Consolas, monospace'
    ctx.fillText(etiqueta, larguraUtil + 8, py)

    ctx.fillStyle = cor.texto
    ctx.font = '11px system-ui, sans-serif'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(`últimos ${n} negócios`, 4, altura - 4)
  }
}
