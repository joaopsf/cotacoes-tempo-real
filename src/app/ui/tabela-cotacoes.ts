import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core'
import { variacao, type Cotacao } from '../dados/livro'
import { Mesa } from '../mesa'
import { ativo, ATIVOS } from '../protocolo/ativos'
import { Icone } from './icone'

const PRECO = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const PERCENTUAL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' })
const PONTOS_DA_SPARKLINE = 60
const LARGURA = 80
const ALTURA = 24

export interface Linha {
  c: Cotacao
  nome: string
  preco: string
  variacao: string
  sinal: -1 | 0 | 1
  pontos: string
}

/** Pontos da mini-sparkline (SVG polyline). Barato: 60 números por linha, uma vez por desenho. */
export function pontosDaSparkline(c: Cotacao, n = PONTOS_DA_SPARKLINE): string {
  const s = c.serie
  const qtd = Math.min(n, s.length)
  if (qtd < 2) return ''
  const [min, max] = s.faixa(qtd)
  const amplitude = max - min || 1
  const partes: string[] = []
  for (let i = 0; i < qtd; i++) {
    const v = s.em(s.length - qtd + i)
    const x = (i / (qtd - 1)) * LARGURA
    const y = ALTURA - 2 - ((v - min) / amplitude) * (ALTURA - 4)
    partes.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return partes.join(' ')
}

@Component({
  selector: 'app-tabela-cotacoes',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cartao tabela" aria-labelledby="tabela-titulo">
      <div class="cartao__cabeca">
        <h2 id="tabela-titulo" class="cartao__titulo"><app-icone nome="sinal" /> Cotações</h2>
        <div class="tabela__acoes">
          <button
            type="button"
            class="botao botao--pequeno botao--fantasma"
            [attr.aria-pressed]="mesa.pausado()"
            (click)="mesa.alternarPausa()"
          >
            <app-icone [nome]="mesa.pausado() ? 'play' : 'pausa'" />
            {{ mesa.pausado() ? 'Continuar' : 'Pausar a tela' }}
          </button>
          <button
            #botaoAdicionar
            type="button"
            class="botao botao--pequeno"
            aria-controls="lista-adicionar"
            [attr.aria-expanded]="adicionando()"
            [disabled]="disponiveis().length === 0"
            (click)="adicionando.set(!adicionando())"
          >
            <app-icone nome="mais" />
            Adicionar ativo
          </button>
        </div>
      </div>

      @if (adicionando()) {
        <div id="lista-adicionar" class="adicionar" role="group" aria-label="Ativos pra acompanhar">
          @for (a of disponiveis(); track a.codigo) {
            <button type="button" class="adicionar__ativo" (click)="adicionar(a.codigo)">
              <app-icone nome="mais" />
              <b>{{ a.codigo }}</b> <span>{{ a.nome }}</span>
            </button>
          }
        </div>
      }

      @if (mesa.pausado()) {
        <p class="aviso-pausa">
          <app-icone nome="pausa" />
          Tela pausada. As cotações continuam chegando e os alertas continuam valendo.
        </p>
      }

      <p id="tabela-nota" class="sr-only">
        Atualiza sozinha várias vezes por segundo. Os valores não são lidos a cada mudança; use Pausar a tela pra ler com calma.
      </p>
      <div class="tabela__rolagem">
        <table aria-labelledby="tabela-titulo" aria-describedby="tabela-nota">
          <thead>
            <tr>
              <th scope="col">Ativo</th>
              <th scope="col" class="num">Preço</th>
              <th scope="col" class="num">Variação</th>
              <th scope="col" class="col-tendencia"><span class="sr-only">Tendência</span><span aria-hidden="true">Últimos 60</span></th>
              <th scope="col"><span class="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            @for (l of linhas(); track l.c.codigo) {
              <tr [class.selecionada]="l.c.codigo === mesa.selecionado()">
                <th scope="row">
                  <button
                    type="button"
                    class="ativo"
                    [attr.aria-pressed]="l.c.codigo === mesa.selecionado()"
                    (click)="mesa.selecionar(l.c.codigo)"
                  >
                    <span class="ativo__codigo">{{ l.c.codigo }}</span>
                    <span class="ativo__nome">{{ l.nome }}</span>
                  </button>
                </th>
                <td class="num preco" [attr.data-dir]="l.c.direcao" [attr.data-pulso]="l.c.pulso">{{ l.preco }}</td>
                <td class="num variacao" [attr.data-sinal]="l.sinal">
                  @if (l.sinal !== 0) {
                    <app-icone [nome]="l.sinal > 0 ? 'sobe' : 'desce'" />
                  }
                  {{ l.variacao }}
                </td>
                <td class="col-tendencia">
                  <svg
                    class="sparkline"
                    [attr.data-sinal]="l.sinal"
                    viewBox="0 0 80 24"
                    width="80"
                    height="24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <polyline [attr.points]="l.pontos" />
                  </svg>
                </td>
                <td class="col-acao">
                  <button
                    type="button"
                    class="icone-botao"
                    [attr.aria-label]="'Parar de acompanhar ' + l.c.codigo"
                    (click)="deixar(l.c.codigo)"
                  >
                    <app-icone nome="remover" />
                  </button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="vazio">Nenhum ativo na lista. Use Adicionar ativo.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class TabelaCotacoes {
  protected readonly mesa = inject(Mesa)
  protected readonly adicionando = signal(false)
  private readonly botaoAdicionar = viewChild.required<ElementRef<HTMLButtonElement>>('botaoAdicionar')

  protected readonly disponiveis = computed(() => {
    const ja = new Set(this.mesa.acompanhados())
    return ATIVOS.filter((a) => !ja.has(a.codigo))
  })

  /** Recalcula só quando sobe a versão (uma vez por desenho) ou muda a lista. */
  protected readonly linhas = computed<Linha[]>(() => {
    this.mesa.versao()
    const linhas: Linha[] = []
    for (const codigo of this.mesa.acompanhados()) {
      const c = this.mesa.livro.cotacao(codigo)
      if (!c) continue
      const v = variacao(c)
      linhas.push({
        c,
        nome: ativo(codigo)?.nome ?? '',
        preco: c.preco === null ? '…' : PRECO.format(c.preco),
        variacao: v === null ? '…' : PERCENTUAL.format(v) + '%',
        sinal: v === null || Math.abs(v) < 0.005 ? 0 : v > 0 ? 1 : -1,
        pontos: pontosDaSparkline(c),
      })
    }
    return linhas
  })

  protected adicionar(codigo: string): void {
    this.mesa.acompanhar(codigo)
    if (this.disponiveis().length === 0) this.adicionando.set(false)
    // O botão clicado some da lista; o foco não pode cair no vazio.
    this.botaoAdicionar().nativeElement.focus()
  }

  protected deixar(codigo: string): void {
    this.mesa.deixar(codigo)
    this.botaoAdicionar().nativeElement.focus()
  }
}
