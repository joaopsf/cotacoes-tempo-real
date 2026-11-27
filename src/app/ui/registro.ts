import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { Mesa } from '../mesa'
import { Icone } from './icone'

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// O que o painel mandou pelo protocolo e o que aconteceu com a conexão. Ticks ficam de fora (seriam centenas por segundo).
@Component({
  selector: 'app-registro',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cartao registro" aria-labelledby="registro-titulo">
      <h2 id="registro-titulo" class="cartao__titulo"><app-icone nome="fila" /> Mensagens do protocolo</h2>
      <ol class="registro__lista">
        @for (r of mesa.registro(); track $index) {
          <li [attr.data-tipo]="r.tipo">
            <time>{{ hora(r.ts) }}</time>
            <span class="registro__seta" aria-hidden="true">{{ r.tipo === 'enviada' ? '→' : '•' }}</span>
            <span class="sr-only">{{ r.tipo === 'enviada' ? 'enviada:' : 'conexão:' }}</span>
            <code>{{ r.texto }}</code>
          </li>
        } @empty {
          <li class="dica">Nada ainda.</li>
        }
      </ol>
    </section>
  `,
})
export class RegistroDoProtocolo {
  protected readonly mesa = inject(Mesa)
  protected hora(ts: number): string {
    return HORA.format(ts)
  }
}
