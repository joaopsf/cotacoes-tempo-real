import { animationFrames, buffer, filter, interval, merge, type Observable, type OperatorFunction } from 'rxjs'

/**
 * Um aviso por quadro de tela. Sem requestAnimationFrame (jsdom, por exemplo), cai pra ~60 por segundo.
 * Com a aba em segundo plano o navegador para o requestAnimationFrame; sem o relógio de 1 s de reserva,
 * o lote cresceria sem fim (300 ticks/s por 10 minutos = 180 mil mensagens presas na memória).
 */
export function quadrosDaTela(): Observable<unknown> {
  return typeof requestAnimationFrame === 'function' ? merge(animationFrames(), interval(1000)) : interval(16)
}

/**
 * Junta tudo o que chegou entre um quadro e outro num lote só, e não emite lote vazio.
 * A tela redesenha no máximo uma vez por quadro, venham 10 ou 1000 mensagens por segundo.
 *
 * `bufferTime(16)` parece igual mas não é: roda num setInterval que não acompanha a tela, então às vezes
 * dois lotes caem no mesmo quadro (trabalho jogado fora) e às vezes nenhum. E com o animationFrameScheduler
 * e espera maior que 0 o RxJS volta pro setInterval. `buffer(animationFrames())` fecha o lote exatamente no quadro.
 * Recebe o "relógio" de fora pra dar pra testar com marble.
 */
export function agruparPorQuadro<T>(quadros$: Observable<unknown> = quadrosDaTela()): OperatorFunction<T, T[]> {
  return (fonte) =>
    fonte.pipe(
      buffer(quadros$),
      filter((lote) => lote.length > 0),
    )
}
