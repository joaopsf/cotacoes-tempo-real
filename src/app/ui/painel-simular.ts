import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { Mesa } from '../mesa'
import type { EstadoDaRede } from '../soquete/rede'
import { Icone } from './icone'

const OPCOES: { valor: EstadoDaRede; rotulo: string; dica: string }[] = [
  { valor: 'normal', rotulo: 'Normal', dica: 'conecta e entrega tudo' },
  { valor: 'caida', rotulo: 'Caída', dica: 'derruba e recusa conexão' },
  { valor: 'muda', rotulo: 'Muda', dica: 'parece aberta, não passa nada' },
]

@Component({
  selector: 'app-painel-simular',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cartao simular" aria-labelledby="simular-titulo">
      <h2 id="simular-titulo" class="cartao__titulo"><app-icone nome="raio" /> Simular</h2>

      <fieldset class="simular__rede">
        <legend>Conexão</legend>
        <div class="segmentos">
          @for (o of opcoes; track o.valor) {
            <label class="segmento" [attr.data-valor]="o.valor">
              <input
                type="radio"
                name="rede"
                [value]="o.valor"
                [checked]="mesa.estadoDaRede() === o.valor"
                (change)="mesa.estadoDaRede.set(o.valor)"
                [attr.aria-describedby]="'dica-' + o.valor"
              />
              <span class="segmento__rotulo">{{ o.rotulo }}</span>
              <span class="segmento__dica" [id]="'dica-' + o.valor">{{ o.dica }}</span>
            </label>
          }
        </div>
      </fieldset>

      <div class="simular__linha">
        <label for="taxa">Ticks por segundo</label>
        <output for="taxa" class="simular__valor">{{ mesa.taxa() }}</output>
      </div>
      <input
        id="taxa"
        type="range"
        min="50"
        max="2000"
        step="50"
        [value]="mesa.taxa()"
        (input)="mudarTaxa($event)"
        aria-describedby="taxa-dica"
      />
      <p id="taxa-dica" class="dica">Somando o mercado todo. Cada ativo acompanhado recebe a parte dele.</p>

      <label class="chave">
        <input
          type="checkbox"
          role="switch"
          [checked]="mesa.agrupar()"
          (change)="mesa.agrupar.set(!mesa.agrupar())"
          aria-describedby="agrupar-dica"
        />
        <span class="chave__trilho" aria-hidden="true"></span>
        <span>Agrupar por quadro</span>
      </label>
      <p id="agrupar-dica" class="dica">
        Desligado, cada mensagem do socket vira um ciclo inteiro de detecção de mudanças, como num app com zone.js.
      </p>
    </section>
  `,
})
export class PainelSimular {
  protected readonly mesa = inject(Mesa)
  protected readonly opcoes = OPCOES

  protected mudarTaxa(e: Event): void {
    this.mesa.taxa.set(Number((e.target as HTMLInputElement).value))
  }
}
