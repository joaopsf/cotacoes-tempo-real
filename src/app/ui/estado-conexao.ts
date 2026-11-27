import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core'
import { Mesa } from '../mesa'
import { Icone } from './icone'

const SEGUNDOS = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// Estado da conexão sempre à vista. Não é região viva de propósito: a contagem muda a cada 200 ms
// e viraria falatório no leitor de tela.
@Component({
  selector: 'app-estado-conexao',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="conexao" [attr.data-fase]="estado().fase">
      <span class="conexao__luz" aria-hidden="true"></span>
      <div class="conexao__texto">
        <strong class="conexao__fase">{{ titulo() }}</strong>
        <span class="conexao__detalhe">{{ detalhe() }}</span>
      </div>
      @if (estado().fase === 'aguardando') {
        <button type="button" class="botao botao--pequeno botao--fantasma" (click)="mesa.cliente.tentarAgora()">
          <app-icone nome="reconectar" />
          Tentar agora
        </button>
      }
    </div>
    @if (estado().fila.length) {
      <p class="conexao__fila">
        <app-icone nome="fila" />
        <span
          >Na fila:
          @for (m of estado().fila; track m.op; let ultimo = $last) {
            <code>{{ m.op }} {{ m.ativos.join(', ') }}</code>
            @if (!ultimo) {
              ·
            }
          }
        </span>
      </p>
    }
  `,
})
export class EstadoConexao {
  protected readonly mesa = inject(Mesa)
  protected readonly estado = this.mesa.conexao
  private readonly agora = signal(Date.now())

  protected readonly titulo = computed(() => {
    switch (this.estado().fase) {
      case 'aberta':
        return 'Conectado'
      case 'conectando':
        return 'Conectando…'
      case 'aguardando':
        return 'Sem conexão'
      default:
        return 'Desconectado'
    }
  })

  protected readonly detalhe = computed(() => {
    const e = this.estado()
    if (e.fase === 'aguardando' && e.proximaEm !== null) {
      const falta = Math.max(0, e.proximaEm - this.agora()) / 1000
      return `nova tentativa em ${SEGUNDOS.format(falta)} s · ${e.tentativa}ª falha seguida (${e.motivo})`
    }
    if (e.fase === 'conectando') return e.tentativa ? `tentativa ${e.tentativa + 1}` : 'abrindo o canal'
    if (e.fase === 'aberta') return e.motivo ? `voltou depois de: ${e.motivo}` : 'recebendo cotações'
    return e.motivo ?? ''
  })

  constructor() {
    const relogio = setInterval(() => {
      if (this.estado().fase === 'aguardando') this.agora.set(Date.now())
    }, 200)
    inject(DestroyRef).onDestroy(() => clearInterval(relogio))
  }
}
