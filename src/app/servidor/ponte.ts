import { ServidorDeCotacoes } from './servidor'

// O que passa entre a página e o servidor simulado. É o "cabo": o soquete fala com ele,
// e ele leva pro Worker (ou, sem Worker, pra um servidor na própria página).
export type ParaServidor =
  | { tipo: 'abrir'; id: number }
  | { tipo: 'texto'; id: number; texto: string }
  | { tipo: 'fechar'; id: number }
  | { tipo: 'taxa'; valor: number }

export interface DoServidor {
  tipo: 'texto'
  id: number
  texto: string
}

export interface Ponte {
  enviar(m: ParaServidor): void
  ouvir(fn: (m: DoServidor) => void): () => void
  encerrar(): void
}

export const PASSO_MS = 10

/** O servidor roda num Web Worker: gerar centenas de ticks por segundo não disputa a thread da tela. */
export function ponteDeWorker(worker: Worker): Ponte {
  return {
    enviar: (m) => worker.postMessage(m),
    ouvir: (fn) => {
      const aoReceber = (e: MessageEvent<DoServidor>) => fn(e.data)
      worker.addEventListener('message', aoReceber)
      return () => worker.removeEventListener('message', aoReceber)
    },
    encerrar: () => worker.terminate(),
  }
}

/**
 * Mesmo servidor, na própria página. Serve pros testes (jsdom não tem Worker) e pra navegador sem Worker.
 * O pedido é tratado numa microtarefa, nunca dentro do `send`, como aconteceria do outro lado de um Worker.
 */
export class PonteLocal implements Ponte {
  private readonly ouvintes = new Set<(m: DoServidor) => void>()
  readonly servidor: ServidorDeCotacoes
  private relogio: ReturnType<typeof setInterval> | null = null

  constructor(opcoes: { taxa?: number; semente?: number; automatico?: boolean } = {}) {
    this.servidor = new ServidorDeCotacoes(
      (id, texto) => {
        for (const fn of this.ouvintes) fn({ tipo: 'texto', id, texto })
      },
      { taxa: opcoes.taxa, semente: opcoes.semente },
    )
    if (opcoes.automatico ?? true) this.relogio = setInterval(() => this.servidor.avancar(PASSO_MS), PASSO_MS)
  }

  enviar(m: ParaServidor): void {
    queueMicrotask(() => this.tratar(m))
  }

  ouvir(fn: (m: DoServidor) => void): () => void {
    this.ouvintes.add(fn)
    return () => this.ouvintes.delete(fn)
  }

  encerrar(): void {
    if (this.relogio) clearInterval(this.relogio)
    this.ouvintes.clear()
  }

  private tratar(m: ParaServidor): void {
    switch (m.tipo) {
      case 'abrir':
        return this.servidor.abrir(m.id)
      case 'texto':
        return this.servidor.receber(m.id, m.texto)
      case 'fechar':
        return this.servidor.fechar(m.id)
      case 'taxa':
        return this.servidor.definirTaxa(m.valor)
    }
  }
}

/** Escolhe onde o servidor roda. O `new URL(..., import.meta.url)` é o que o build do Angular reconhece pra empacotar o Worker. */
export function criarPonte(): Ponte {
  if (typeof Worker === 'function') {
    try {
      return ponteDeWorker(new Worker(new URL('./cotacoes.worker', import.meta.url), { type: 'module' }))
    } catch {
      // Sem permissão pra Worker (alguns ambientes restritos): cai pro servidor na página.
    }
  }
  return new PonteLocal()
}
