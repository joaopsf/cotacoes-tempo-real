/** Buffer circular de números: guarda os últimos N sem criar array novo a cada tick. */
export class Serie {
  private readonly dados: Float64Array
  private inicio = 0
  private tamanho = 0

  constructor(readonly capacidade: number) {
    this.dados = new Float64Array(capacidade)
  }

  get length(): number {
    return this.tamanho
  }

  push(v: number): void {
    const fim = (this.inicio + this.tamanho) % this.capacidade
    this.dados[fim] = v
    if (this.tamanho < this.capacidade) this.tamanho++
    else this.inicio = (this.inicio + 1) % this.capacidade
  }

  /** i = 0 é o mais antigo guardado. */
  em(i: number): number {
    return this.dados[(this.inicio + i) % this.capacidade]
  }

  ultimo(): number | undefined {
    return this.tamanho ? this.em(this.tamanho - 1) : undefined
  }

  /** Mínimo e máximo dos últimos `n` (ou de tudo). */
  faixa(n = this.tamanho): [number, number] {
    let min = Infinity
    let max = -Infinity
    for (let i = Math.max(0, this.tamanho - n); i < this.tamanho; i++) {
      const v = this.em(i)
      if (v < min) min = v
      if (v > max) max = v
    }
    return [min, max]
  }

  limpar(): void {
    this.inicio = 0
    this.tamanho = 0
  }
}
