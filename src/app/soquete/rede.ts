// A rede entre a página e o servidor. É aqui que o painel "Simular" mexe.
// - normal: conecta e entrega tudo;
// - caida: conexão aberta cai na hora (código 1006) e nenhuma conexão nova abre;
// - muda: a conexão parece aberta, mas nada passa. É o caso traiçoeiro (wi-fi de hotel, proxy que
//   segura o socket): o navegador não avisa nada, só um batimento com prazo percebe.
export type EstadoDaRede = 'normal' | 'caida' | 'muda'

export class RedeSimulada {
  private atual: EstadoDaRede = 'normal'
  private readonly ouvintes = new Set<(e: EstadoDaRede) => void>()

  /** Tempo pra abrir uma conexão, em ms. Sorteado entre os dois valores. */
  constructor(
    readonly latencia: readonly [number, number] = [120, 380],
    private readonly aleatorio: () => number = Math.random,
  ) {}

  get estado(): EstadoDaRede {
    return this.atual
  }

  definir(estado: EstadoDaRede): void {
    if (estado === this.atual) return
    this.atual = estado
    for (const fn of [...this.ouvintes]) fn(estado)
  }

  ouvir(fn: (e: EstadoDaRede) => void): () => void {
    this.ouvintes.add(fn)
    return () => this.ouvintes.delete(fn)
  }

  sortearLatencia(): number {
    const [min, max] = this.latencia
    return Math.round(min + this.aleatorio() * (max - min))
  }
}
