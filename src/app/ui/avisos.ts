import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { Mesa } from '../mesa'
import { Icone } from './icone'

// A única região viva da tela. Ela existe desde o carregamento (vazia): leitor de tela só anuncia
// mudança em região que já estava lá. Cada aviso é role="alert", então é lido assim que aparece.
@Component({
  selector: 'app-avisos',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="avisos" aria-live="assertive" aria-relevant="additions">
      @for (a of mesa.avisos(); track a.id) {
        <div class="aviso-toast" role="alert" [attr.data-sentido]="a.sentido">
          <app-icone nome="sino" />
          <div class="aviso-toast__texto">
            <strong>{{ a.titulo }}</strong>
            <span>{{ a.texto }}</span>
          </div>
          <button type="button" class="icone-botao" aria-label="Fechar aviso" (click)="mesa.fecharAviso(a.id)">
            <app-icone nome="fechar" />
          </button>
        </div>
      }
    </div>
  `,
})
export class Avisos {
  protected readonly mesa = inject(Mesa)
}
