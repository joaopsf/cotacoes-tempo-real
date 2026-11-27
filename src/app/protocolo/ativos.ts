// Ativos fictícios no formato da B3 (4 letras + número). Nomes e códigos inventados:
// nenhum deles é empresa real, de propósito.
export interface Ativo {
  codigo: string
  nome: string
  setor: string
  /** Preço de partida do pregão simulado, em reais. */
  base: number
  /** Volatilidade relativa por tick (desvio do passeio aleatório). */
  vol: number
}

export const ATIVOS: readonly Ativo[] = [
  { codigo: 'ARVX3', nome: 'Arvoredo Celulose', setor: 'Papel', base: 18.4, vol: 0.0011 },
  { codigo: 'BQRZ3', nome: 'Baquara Mineração', setor: 'Mineração', base: 61.2, vol: 0.0012 },
  { codigo: 'ADRK4', nome: 'Andorinha Aérea', setor: 'Transporte', base: 7.35, vol: 0.002 },
  { codigo: 'CJTX3', nome: 'Cajuti Saneamento', setor: 'Saneamento', base: 42.9, vol: 0.0007 },
  { codigo: 'DUNZ3', nome: 'Dunas Varejo', setor: 'Varejo', base: 3.12, vol: 0.0024 },
  { codigo: 'FERQ3', nome: 'Ferroquara Siderurgia', setor: 'Siderurgia', base: 24.75, vol: 0.0013 },
  { codigo: 'GRVX3', nome: 'Graviola Alimentos', setor: 'Alimentos', base: 15.6, vol: 0.0009 },
  { codigo: 'IPEZ3', nome: 'Ipê Roxo Construtora', setor: 'Construção', base: 9.88, vol: 0.0016 },
  { codigo: 'JQTB4', nome: 'Banco Jequitibá', setor: 'Bancos', base: 33.1, vol: 0.0008 },
  { codigo: 'KRNZ3', nome: 'Carnaúba Energia', setor: 'Energia', base: 47.3, vol: 0.0006 },
  { codigo: 'LXMR3', nome: 'Lagoa Mirim Logística', setor: 'Logística', base: 12.05, vol: 0.0014 },
  { codigo: 'MNGZ4', nome: 'Mangaba Telecom', setor: 'Telecom', base: 21.4, vol: 0.0008 },
  { codigo: 'NQRA3', nome: 'Nascente Química', setor: 'Química', base: 28.65, vol: 0.0012 },
  { codigo: 'PQXR3', nome: 'Pequi Agro', setor: 'Agro', base: 36.8, vol: 0.001 },
  { codigo: 'QRTZ3', nome: 'Quartzo Tecnologia', setor: 'Tecnologia', base: 54.2, vol: 0.0017 },
  { codigo: 'RXBN3', nome: 'Ribeirão Seguros', setor: 'Seguros', base: 38.45, vol: 0.0007 },
  { codigo: 'SZBR3', nome: 'Sabiá Saúde', setor: 'Saúde', base: 11.3, vol: 0.0015 },
  { codigo: 'UXRA3', nome: 'Urucum Cosméticos', setor: 'Consumo', base: 19.9, vol: 0.0011 },
  { codigo: 'VZTR3', nome: 'Vazante Petróleo', setor: 'Petróleo', base: 44.1, vol: 0.0014 },
  { codigo: 'ZNTH11', nome: 'Zênite Shoppings FII', setor: 'Imobiliário', base: 96.5, vol: 0.0004 },
]

export const CODIGOS = ATIVOS.map((a) => a.codigo)

const POR_CODIGO = new Map(ATIVOS.map((a) => [a.codigo, a]))

export function ativo(codigo: string): Ativo | undefined {
  return POR_CODIGO.get(codigo)
}

export function existe(codigo: string): boolean {
  return POR_CODIGO.has(codigo)
}
