import { ChangeDetectionStrategy, Component, output } from '@angular/core'
import { Icone } from './icone'

// Caixa "Teste em 1 minuto": diz pra quem chega pelo link o que o app faz e o que testar.
// Quem decide se ela aparece é o App (lembra no aparelho e reabre pelo "Como testar").
@Component({
  selector: 'app-guia-rapido',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="guia" aria-labelledby="guia-titulo">
      <div class="guia__cabeca">
        <h2 id="guia-titulo">Teste em 1 minuto</h2>
        <button type="button" class="guia__fechar" aria-label="Fechar o guia" (click)="fechar.emit()">
          <app-icone nome="fechar" />
        </button>
      </div>
      <p class="guia__oque">
        Painel de cotações de 20 ativos fictícios. Os preços chegam por um WebSocket simulado que roda num Web Worker, com centenas de
        mensagens por segundo, e a tela redesenha no máximo uma vez por quadro.
      </p>
      <ol>
        <li>
          Em <b>Simular</b>, troque a conexão para <b>Caída</b>. O estado mostra a contagem pra próxima tentativa, que dobra a cada falha.
        </li>
        <li>Ainda sem conexão, adicione ou tire um ativo da lista. O pedido fica na fila e sai quando você volta para <b>Normal</b>.</li>
        <li>Suba os ticks por segundo e desligue <b>Agrupar por quadro</b>. Compare o FPS e os desenhos por segundo.</li>
        <li>Crie um alerta um pouco acima ou abaixo do preço do ativo do gráfico e espere o aviso.</li>
      </ol>
      <p class="guia__reparar">
        <b>Repare:</b> em <b>Muda</b> a conexão parece aberta mas não passa nada; o batimento percebe em 4 segundos e reconecta. O leitor de
        tela não lê a tabela a cada tick, só o alerta.
      </p>
      <button type="button" class="botao botao--primario" (click)="fechar.emit()">
        <app-icone nome="ok" />
        Entendi
      </button>
    </section>
  `,
})
export class GuiaRapido {
  readonly fechar = output()
}
