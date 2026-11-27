import { ChangeDetectionStrategy, Component, input } from '@angular/core'

export type NomeIcone =
  | 'ajuda'
  | 'fechar'
  | 'ok'
  | 'pausa'
  | 'play'
  | 'mais'
  | 'remover'
  | 'sino'
  | 'reconectar'
  | 'sinal'
  | 'raio'
  | 'grafico'
  | 'fila'
  | 'sobe'
  | 'desce'

// Ícones de traço com currentColor: herdam a cor do botão e não pesam nada.
@Component({
  selector: 'app-icone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'icone', 'aria-hidden': 'true' },
  template: `
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
    >
      @switch (nome()) {
        @case ('ajuda') {
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" />
        }
        @case ('fechar') {
          <path d="M18 6 6 18M6 6l12 12" />
        }
        @case ('ok') {
          <path d="M20 6 9 17l-5-5" />
        }
        @case ('pausa') {
          <path d="M9 5v14M15 5v14" />
        }
        @case ('play') {
          <path d="M7 4.5v15l12-7.5-12-7.5Z" />
        }
        @case ('mais') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('remover') {
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12h8" />
        }
        @case ('sino') {
          <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
          <path d="M10 20.5a2 2 0 0 0 4 0" />
        }
        @case ('reconectar') {
          <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
          <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
          <path d="M21 3v5h-5M3 21v-5h5" />
        }
        @case ('sinal') {
          <path d="M2 9a15 15 0 0 1 20 0" />
          <path d="M5.5 12.5a10 10 0 0 1 13 0" />
          <path d="M9 16a5 5 0 0 1 6 0" />
          <path d="M12 19.5h.01" />
        }
        @case ('raio') {
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
        }
        @case ('grafico') {
          <path d="M3 3v18h18" />
          <path d="m7 15 4-5 3 3 5-6" />
        }
        @case ('fila') {
          <path d="M4 6h16M4 12h10M4 18h6" />
          <path d="m17 15 3 3-3 3" />
        }
        @case ('sobe') {
          <path d="m6 14 6-6 6 6" />
        }
        @case ('desce') {
          <path d="m6 10 6 6 6-6" />
        }
      }
    </svg>
  `,
})
export class Icone {
  readonly nome = input.required<NomeIcone>()
}
