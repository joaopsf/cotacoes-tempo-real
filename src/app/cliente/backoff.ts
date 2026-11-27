export interface ConfigBackoff {
  /** Espera da primeira tentativa, em ms. */
  base: number
  /** Espera máxima, em ms. */
  teto: number
}

export const BACKOFF_PADRAO: ConfigBackoff = { base: 500, teto: 15_000 }

/**
 * Espera antes da tentativa `n` (0 = primeira): exponencial com teto e jitter "igual".
 * Metade da janela é fixa e a outra metade é sorteada. Com jitter total (0 até a janela) uma tentativa pode
 * sair em 0 ms e martelar o servidor; sem jitter, mil painéis que caíram juntos voltam juntos e derrubam de novo.
 */
export function atrasoDeReconexao(n: number, config: ConfigBackoff = BACKOFF_PADRAO, aleatorio: () => number = Math.random): number {
  const janela = Math.min(config.teto, config.base * 2 ** Math.max(0, n))
  return Math.round(janela / 2 + aleatorio() * (janela / 2))
}
