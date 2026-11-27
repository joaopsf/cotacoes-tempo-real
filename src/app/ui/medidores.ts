import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { Mesa } from '../mesa'

const INTEIRO = new Intl.NumberFormat('pt-BR')

@Component({
  selector: 'app-medidores',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="medidores">
      <div class="medidor" [class.medidor--ruim]="medidas().fps > 0 && medidas().fps < 45">
        <dt>FPS</dt>
        <dd>{{ medidas().fps }}</dd>
      </div>
      <div class="medidor">
        <dt>Mensagens/s</dt>
        <dd>{{ formatar(medidas().mensagens) }}</dd>
      </div>
      <div class="medidor" [class.medidor--ruim]="medidas().desenhos > 70">
        <dt>Desenhos/s</dt>
        <dd>{{ formatar(medidas().desenhos) }}</dd>
      </div>
    </dl>
  `,
})
export class Medidores {
  protected readonly medidas = inject(Mesa).medidas
  protected formatar(n: number): string {
    return INTEIRO.format(n)
  }
}
