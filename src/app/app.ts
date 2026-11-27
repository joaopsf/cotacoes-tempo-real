import { ChangeDetectionStrategy, Component, signal } from '@angular/core'
import { Avisos } from './ui/avisos'
import { EstadoConexao } from './ui/estado-conexao'
import { GraficoAoVivo } from './ui/grafico-ao-vivo'
import { GuiaRapido } from './ui/guia-rapido'
import { Icone } from './ui/icone'
import { Medidores } from './ui/medidores'
import { PainelAlertas } from './ui/painel-alertas'
import { PainelSimular } from './ui/painel-simular'
import { RegistroDoProtocolo } from './ui/registro'
import { TabelaCotacoes } from './ui/tabela-cotacoes'

// O guia aparece na primeira visita; depois de fechado, só volta pelo botão "Como testar".
export const CHAVE_GUIA = 'cotacoes-tempo-real:guia-fechado'

function lerGuia(): boolean {
  try {
    return localStorage.getItem(CHAVE_GUIA) !== '1'
  } catch {
    return true
  }
}

@Component({
  selector: 'app-root',
  imports: [
    Avisos,
    EstadoConexao,
    GraficoAoVivo,
    GuiaRapido,
    Icone,
    Medidores,
    PainelAlertas,
    PainelSimular,
    RegistroDoProtocolo,
    TabelaCotacoes,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {
  protected readonly guiaAberto = signal(lerGuia())

  protected mostrarGuia(aberto: boolean): void {
    try {
      localStorage.setItem(CHAVE_GUIA, aberto ? '0' : '1')
    } catch {
      // Navegação privada sem storage: o guia só não fica lembrado.
    }
    this.guiaAberto.set(aberto)
  }
}
