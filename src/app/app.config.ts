import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core'

// Sem zone.js (padrão do Angular atual): a tela reage a signals e eventos do template.
// Num painel que recebe centenas de mensagens por segundo isso pesa: com zone.js, cada evento
// `message` do socket dispararia uma checagem da árvore inteira.
export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners()],
}
