import { conferirAlertas, cruzou, lerPreco, validarAlerta, type Alerta } from './alertas'
import { LivroDeCotacoes, variacao } from './livro'

const acima: Alerta = { id: 1, ativo: 'ARVX3', sentido: 'acima', alvo: 18.5 }
const abaixo: Alerta = { id: 2, ativo: 'ARVX3', sentido: 'abaixo', alvo: 18 }

describe('alertas de preço', () => {
  it('dispara quando o preço cruza o alvo, incluindo bater exatamente nele', () => {
    expect(cruzou(acima, { s: 'ARVX3', anterior: 18.49, atual: 18.5 })).toBe(true)
    expect(cruzou(acima, { s: 'ARVX3', anterior: 18.2, atual: 18.9 })).toBe(true)
    expect(cruzou(abaixo, { s: 'ARVX3', anterior: 18.01, atual: 17.99 })).toBe(true)
  })

  it('não dispara enquanto o preço só fica do outro lado do alvo', () => {
    expect(cruzou(acima, { s: 'ARVX3', anterior: 18.6, atual: 18.7 })).toBe(false)
    expect(cruzou(acima, { s: 'ARVX3', anterior: 18.5, atual: 18.6 })).toBe(false)
    expect(cruzou(acima, { s: 'ARVX3', anterior: 18.3, atual: 18.4 })).toBe(false)
  })

  it('ignora outro ativo e o primeiro preço (sem anterior não há cruzamento)', () => {
    expect(cruzou(acima, { s: 'BQRZ3', anterior: 18, atual: 19 })).toBe(false)
    expect(cruzou(acima, { s: 'ARVX3', anterior: null, atual: 19 })).toBe(false)
  })

  it('alerta é de uma vez só: o que disparou sai da lista', () => {
    const { disparados, restantes } = conferirAlertas([acima, abaixo], { s: 'ARVX3', anterior: 18.4, atual: 18.55 })
    expect(disparados).toEqual([acima])
    expect(restantes).toEqual([abaixo])
  })

  it('pico dentro de um mesmo quadro não passa batido, porque a conferência é tick a tick', () => {
    const livro = new LivroDeCotacoes(['ARVX3'])
    livro.aplicar({ t: 'inicio', s: 'ARVX3', abertura: 18, hist: [18.3], ts: 0 })
    let alertas = [acima]
    const disparados: Alerta[] = []
    // Sobe até 18,60 e volta pra 18,30 antes do próximo quadro: o preço desenhado nunca passa do alvo.
    for (const p of [18.45, 18.6, 18.3]) {
      const m = livro.aplicar({ t: 'tick', s: 'ARVX3', p, ts: 1 })
      if (!m) continue
      const r = conferirAlertas(alertas, m)
      alertas = r.restantes
      disparados.push(...r.disparados)
    }
    expect(livro.cotacao('ARVX3')!.preco).toBe(18.3)
    expect(disparados).toEqual([acima])
  })

  it('valida antes de criar: alvo já ultrapassado nunca dispararia', () => {
    expect(validarAlerta('acima', 18, 18.3)).toContain('use um valor maior')
    expect(validarAlerta('abaixo', 18.5, 18.3)).toContain('use um valor menor')
    expect(validarAlerta('acima', 18.4, 18.3)).toBeNull()
    expect(validarAlerta('acima', NaN, 18.3)).toBe('Informe um preço maior que zero.')
    expect(validarAlerta('acima', 20, null)).toContain('Espere a primeira cotação')
  })

  it('lê preço no jeito brasileiro e no jeito do teclado numérico', () => {
    expect(lerPreco('18,50')).toBe(18.5)
    expect(lerPreco('18.5')).toBe(18.5)
    expect(lerPreco('R$ 1.234,56')).toBe(1234.56)
    expect(lerPreco('')).toBeNaN()
    expect(lerPreco('abc')).toBeNaN()
  })

  it('variação é sobre a abertura', () => {
    expect(variacao({ abertura: 20, preco: 21 })).toBeCloseTo(5)
    expect(variacao({ abertura: null, preco: 21 })).toBeNull()
  })
})
