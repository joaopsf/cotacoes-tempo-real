import type { DoServidor, ParaServidor } from './ponte'
import { PASSO_MS } from './ponte'
import { ServidorDeCotacoes } from './servidor'

// Servidor de cotações rodando fora da thread da tela.
// Cada tick sai num postMessage separado, como cada quadro de um WebSocket chega num evento `message`.
const escopo = self as unknown as {
  postMessage(m: DoServidor): void
  addEventListener(tipo: 'message', fn: (e: MessageEvent<ParaServidor>) => void): void
}

const servidor = new ServidorDeCotacoes((id, texto) => escopo.postMessage({ tipo: 'texto', id, texto }), {
  semente: Date.now() & 0xffff,
})

escopo.addEventListener('message', ({ data: m }) => {
  switch (m.tipo) {
    case 'abrir':
      return servidor.abrir(m.id)
    case 'texto':
      return servidor.receber(m.id, m.texto)
    case 'fechar':
      return servidor.fechar(m.id)
    case 'taxa':
      return servidor.definirTaxa(m.valor)
  }
})

// O navegador segura setInterval em ~4 ms no mínimo; com passo de 10 ms e vários ticks por passo, chega fácil a mil por segundo.
let antes = performance.now()
setInterval(() => {
  const agora = performance.now()
  // Aba em segundo plano atrasa o relógio; limita o salto pra não despejar milhares de ticks de uma vez na volta.
  servidor.avancar(Math.min(agora - antes, 250))
  antes = agora
}, PASSO_MS)
