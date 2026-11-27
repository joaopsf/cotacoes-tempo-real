import { Subject } from 'rxjs'
import { TestScheduler } from 'rxjs/testing'
import { agruparPorQuadro } from './agrupar'
import { LivroDeCotacoes } from './livro'

describe('agruparPorQuadro', () => {
  let ts: TestScheduler
  beforeEach(() => (ts = new TestScheduler((atual, esperado) => expect(atual).toEqual(esperado))))

  it('junta o que chegou entre dois quadros e não emite lote vazio', () => {
    ts.run(({ hot, expectObservable }) => {
      const mensagens = hot('-a-b-c------d---|')
      const quadros = hot(' ----q----qq---q---')
      expectObservable(mensagens.pipe(agruparPorQuadro(quadros))).toBe('----x----y----z-|', {
        x: ['a', 'b'],
        y: ['c'],
        z: ['d'],
      })
    })
  })

  it('mil mensagens no mesmo quadro viram um lote só', () => {
    const mensagens = new Subject<number>()
    const quadros = new Subject<void>()
    const lotes: number[][] = []
    mensagens.pipe(agruparPorQuadro(quadros)).subscribe((l) => lotes.push(l))

    for (let i = 0; i < 1000; i++) mensagens.next(i)
    expect(lotes).toEqual([])
    quadros.next()
    expect(lotes.length).toBe(1)
    expect(lotes[0].length).toBe(1000)
    // Ordem preservada: o último tick do lote é o preço que fica na tela.
    expect(lotes[0].at(-1)).toBe(999)
  })

  it('agrupar não joga dado fora: todo tick entra no livro, mas o destaque troca uma vez por quadro', () => {
    const livro = new LivroDeCotacoes(['ARVX3'])
    livro.aplicar({ t: 'inicio', s: 'ARVX3', abertura: 10, hist: [10], ts: 0 })
    livro.fecharQuadro()
    const c = livro.cotacao('ARVX3')!
    const pulsoAntes = c.pulso

    for (const p of [10.01, 10.02, 10.03]) livro.aplicar({ t: 'tick', s: 'ARVX3', p, ts: 1 })
    expect(livro.fecharQuadro()).toBe(1)

    expect(c.serie.length).toBe(4)
    expect(c.negocios).toBe(3)
    expect(c.preco).toBe(10.03)
    expect(c.direcao).toBe(1)
    expect(c.pulso).toBe(pulsoAntes ? 0 : 1)
    // Quadro sem mudança: ninguém pisca.
    expect(livro.fecharQuadro()).toBe(0)
  })
})
