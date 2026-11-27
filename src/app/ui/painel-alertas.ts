import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core'
import { lerPreco, reais, type Sentido } from '../dados/alertas'
import { Mesa } from '../mesa'
import { Icone } from './icone'

@Component({
  selector: 'app-painel-alertas',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cartao alertas" aria-labelledby="alertas-titulo">
      <h2 id="alertas-titulo" class="cartao__titulo"><app-icone nome="sino" /> Alerta de preço</h2>
      <form class="alertas__form" (submit)="criar($event)" novalidate>
        <fieldset class="alertas__sentido">
          <legend>Avisar quando {{ mesa.selecionado() }}</legend>
          <label class="pilula">
            <input type="radio" name="sentido" value="acima" [checked]="sentido() === 'acima'" (change)="sentido.set('acima')" />
            <span><app-icone nome="sobe" /> subir até</span>
          </label>
          <label class="pilula">
            <input type="radio" name="sentido" value="abaixo" [checked]="sentido() === 'abaixo'" (change)="sentido.set('abaixo')" />
            <span><app-icone nome="desce" /> cair até</span>
          </label>
        </fieldset>
        <div class="alertas__campo">
          <label for="alvo">Preço (R$)</label>
          <input
            #campo
            id="alvo"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            [placeholder]="sugestao()"
            [value]="texto()"
            (input)="digitar($event)"
            [attr.aria-invalid]="erro() ? true : null"
            [attr.aria-describedby]="erro() ? 'alvo-erro' : 'alvo-dica'"
          />
          @if (erro(); as e) {
            <p id="alvo-erro" class="erro">{{ e }}</p>
          } @else {
            <p id="alvo-dica" class="dica">Agora em {{ precoAtual() }}. O aviso sai quando o preço cruzar o valor.</p>
          }
        </div>
        <button type="submit" class="botao botao--primario">
          <app-icone nome="sino" />
          Criar alerta
        </button>
      </form>

      @if (mesa.alertas().length) {
        <ul class="alertas__lista" aria-label="Alertas ativos">
          @for (a of mesa.alertas(); track a.id) {
            <li>
              <app-icone [nome]="a.sentido === 'acima' ? 'sobe' : 'desce'" />
              <span
                ><b>{{ a.ativo }}</b> {{ a.sentido === 'acima' ? 'subir até' : 'cair até' }} {{ formatar(a.alvo) }}</span
              >
              <button
                type="button"
                class="icone-botao"
                [attr.aria-label]="'Apagar alerta de ' + a.ativo + ' em ' + formatar(a.alvo)"
                (click)="remover(a.id)"
              >
                <app-icone nome="fechar" />
              </button>
            </li>
          }
        </ul>
      } @else {
        <p class="dica">Nenhum alerta ativo.</p>
      }
    </section>
  `,
})
export class PainelAlertas {
  protected readonly mesa = inject(Mesa)
  protected readonly sentido = signal<Sentido>('acima')
  protected readonly texto = signal('')
  protected readonly erro = signal<string | null>(null)
  private readonly campo = viewChild.required<ElementRef<HTMLInputElement>>('campo')

  private readonly preco = computed(() => {
    // Lido só quando o painel redesenha; a dica não é região viva.
    this.mesa.versao()
    return this.mesa.livro.cotacao(this.mesa.selecionado())?.preco ?? null
  })
  protected readonly precoAtual = computed(() => {
    const p = this.preco()
    return p === null ? '…' : reais(p)
  })
  protected readonly sugestao = computed(() => {
    const p = this.preco()
    if (p === null) return ''
    const alvo = this.sentido() === 'acima' ? p * 1.002 : p * 0.998
    return (Math.round(alvo * 100) / 100).toFixed(2).replace('.', ',')
  })

  protected formatar(v: number): string {
    return reais(v)
  }

  protected digitar(e: Event): void {
    this.texto.set((e.target as HTMLInputElement).value)
    this.erro.set(null)
  }

  protected criar(e: Event): void {
    e.preventDefault()
    // Campo vazio usa a sugestão do placeholder: dá pra testar o alerta com um clique.
    const texto = this.texto().trim() || this.sugestao()
    const erro = this.mesa.criarAlerta(this.mesa.selecionado(), this.sentido(), lerPreco(texto))
    this.erro.set(erro)
    if (erro) {
      this.campo().nativeElement.focus()
      return
    }
    this.texto.set('')
  }

  protected remover(id: number): void {
    this.mesa.removerAlerta(id)
    this.campo().nativeElement.focus()
  }
}
