import { atrasoDeReconexao } from './backoff'

const config = { base: 500, teto: 8000 }

describe('atrasoDeReconexao', () => {
  it('dobra a cada tentativa até o teto', () => {
    const maximo = () => 1
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => atrasoDeReconexao(n, config, maximo))).toEqual([500, 1000, 2000, 4000, 8000, 8000, 8000])
  })

  it('jitter: metade da janela é fixa e a outra metade é sorteada', () => {
    expect(atrasoDeReconexao(3, config, () => 0)).toBe(2000)
    expect(atrasoDeReconexao(3, config, () => 0.5)).toBe(3000)
    expect(atrasoDeReconexao(3, config, () => 1)).toBe(4000)
  })

  it('nunca sai em 0 ms, nem com o menor sorteio possível', () => {
    expect(atrasoDeReconexao(0, config, () => 0)).toBe(250)
  })

  it('espalha painéis que caíram juntos', () => {
    let semente = 7
    const aleatorio = () => ((semente = (semente * 16807) % 2147483647) - 1) / 2147483646
    const atrasos = Array.from({ length: 50 }, () => atrasoDeReconexao(4, config, aleatorio))
    expect(new Set(atrasos).size).toBeGreaterThan(40)
    expect(Math.min(...atrasos)).toBeGreaterThanOrEqual(4000)
    expect(Math.max(...atrasos)).toBeLessThanOrEqual(8000)
  })

  it('tentativa negativa é tratada como a primeira', () => {
    expect(atrasoDeReconexao(-3, config, () => 1)).toBe(500)
  })
})
