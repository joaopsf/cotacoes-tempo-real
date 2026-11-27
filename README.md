# Cotações ao vivo

Resolve o teste técnico clássico de "painel de cotações com dados ao vivo por WebSocket"; um avaliador sênior deve reparar na reconexão (backoff com jitter, fila offline, conexão muda), no agrupamento por quadro e no que o leitor de tela anuncia e deixa de anunciar. Feito em **Angular 22** (standalone, signals, sem zone.js) com **RxJS** e TypeScript estrito.

**[Ver funcionando](https://joaopsf.github.io/cotacoes-tempo-real/)** · o painel **Simular** derruba a conexão, deixa ela muda e muda o ritmo do mercado.

## O problema

Um painel de cotações recebe centenas de mensagens por segundo e precisa continuar fluido. O jeito ingênuo (cada mensagem atualiza o estado e a tela) funciona com 10 mensagens por segundo e trava com 500. E a conexão cai: wi-fi troca, notebook dorme, proxy segura o socket aberto sem passar nada. O painel tem que perceber, voltar sem martelar o servidor e voltar com as mesmas assinaturas, sem perder o que a pessoa fez enquanto estava fora.

## O que dá pra fazer

- Acompanhar 20 ativos fictícios (códigos e nomes inventados, nenhum é empresa real) com preço, variação sobre a abertura e mini-sparkline. O preço pisca verde ou vermelho quando muda.
- Clicar num ativo e ver o gráfico ao vivo dos últimos 300 negócios, desenhado à mão em canvas.
- Adicionar e tirar ativos da lista: isso é `assinar` e `cancelar` no protocolo.
- Criar alerta de preço ("subir até" ou "cair até"). Quando cruza, aparece um aviso.
- Pausar a tela: os dados continuam chegando e os alertas continuam valendo.
- No **Simular**: conexão Normal, Caída ou Muda; ticks por segundo de 50 a 2000; agrupar por quadro ligado ou desligado.
- Ver as mensagens do protocolo e os eventos da conexão.

## Decisões técnicas

**WebSocket de mentira com o contrato do de verdade.**
Não dá pra ter servidor no GitHub Pages, então o servidor roda num **Web Worker** ([`servidor/`](src/app/servidor)) e o [`SoqueteSimulado`](src/app/soquete/soquete.ts) tem a interface do `WebSocket`: `readyState` com os mesmos números, `onopen`/`onmessage`/`onclose`/`onerror` e `addEventListener`, `send` antes de abrir lança `InvalidStateError`, queda de rede fecha com código 1006 e `wasClean: false`, e nenhuma resposta chega dentro do `send`. O cliente recebe uma fábrica de soquete; um teste de tipo garante que `(url) => new WebSocket(url)` encaixa na mesma fábrica. Trocar pelo servidor real é trocar uma linha.

**Cada tick é uma mensagem.**
O Worker manda cada tick num `postMessage` separado, como cada quadro de um WebSocket vira um evento `message`. Juntar ticks no servidor deixaria o teste fácil demais.

**Reconexão** ([`cliente/cliente.ts`](src/app/cliente/cliente.ts)):
- Backoff exponencial com teto (0,5 s, 1 s, 2 s... até 15 s) e jitter "igual": metade da espera é fixa e metade é sorteada. Sem jitter, mil painéis que caíram juntos voltam juntos e derrubam o servidor de novo. Com jitter total, uma tentativa pode sair em 0 ms.
- O contador de tentativas só zera se a conexão ficar aberta 3 s. Conexão que abre e cai na hora não pode voltar pro backoff curto.
- **Conexão muda**: o navegador não avisa nada quando a conexão fica aberta sem passar dado. O servidor manda batimento a cada 1 s; 4 s sem nenhuma mensagem e o cliente dá a conexão como morta. Conexão que não abre em 5 s também é abandonada.
- Estado visível o tempo todo: conectado, conectando, sem conexão com contagem pra próxima tentativa, número de falhas seguidas e o motivo. Tem "Tentar agora".

**Reassinatura e fila offline** ([`cliente/fila.ts`](src/app/cliente/fila.ts)).
O cliente sabe o que o servidor tinha assinado quando caiu. Na volta, reassina isso e despeja a fila do que a pessoa fez offline. A fila guarda o efeito, não o histórico de cliques: assinar e cancelar o mesmo ativo offline se anulam, assinar duas vezes vira uma. E conexão nova começa vazia no servidor, então "cancelar B" feito offline vira simplesmente "não reassinar B".

**Um desenho por quadro** ([`dados/agrupar.ts`](src/app/dados/agrupar.ts)).
`buffer(animationFrames())` junta tudo o que chegou entre dois quadros num lote e a tela redesenha uma vez por lote. Não é `bufferTime(16)`: aquele roda num `setInterval` fora de fase com a tela, e às vezes dois lotes caem no mesmo quadro (trabalho jogado fora). Com a aba em segundo plano o navegador para o `requestAnimationFrame`, então um relógio de 1 s de reserva impede o lote de crescer sem fim.

**Agrupar é sobre quando desenhar, não sobre jogar dado fora.**
Todo tick entra no [`LivroDeCotacoes`](src/app/dados/livro.ts), num buffer circular de `Float64Array` por ativo. O gráfico tem todos os negócios, e o alerta confere tick a tick: um pico que sobe e volta dentro do mesmo quadro dispara o alerta, mesmo que o preço desenhado nunca tenha passado do alvo.

**Modo "sem agrupar" honesto.**
Sem zone.js o Angular já junta várias mudanças de signal num ciclo só, então desligar o agrupamento não mudaria nada. Pra comparação valer, o modo sem agrupar chama `ApplicationRef.tick()` a cada mensagem, que é o que acontece num app com zone.js: cada evento `message` dispara uma checagem da árvore inteira. Os medidores mostram FPS, mensagens por segundo e desenhos por segundo. Com 1000 ticks por segundo a diferença aparece.

**RxJS nos dados, signals na tela.**
O cliente não depende de Angular: expõe `estado$`, `mensagens$` e `registro$`. O serviço [`Mesa`](src/app/mesa.ts) liga o pipeline (com `switchMap` trocando entre agrupado e não agrupado) e publica um único signal que muda com o mercado, `versao`. Tabela, gráfico e números leem esse signal; o resto da tela não é recalculado a cada lote.

**Destaque sem setTimeout.**
Cada cotação tem um `pulso` que alterna 0/1 no quadro em que o preço mudou. O CSS usa dois `@keyframes` iguais com nomes diferentes: trocar o nome reinicia a animação. Nada de tirar e pôr classe com timer.

**Gráfico em canvas, sem biblioteca.**
Grade com passos "redondos" (1, 2 ou 5 × 10ⁿ), linha da abertura tracejada, área com degradê, etiqueta do último preço, `devicePixelRatio` e `ResizeObserver`. Desenha numa passada pelo buffer, sem criar array. Uma biblioteca de gráficos traria dezenas de KB e um ciclo de atualização próprio. O build inteiro fica em ~60 KB comprimidos.

**Acessibilidade.**
- A tabela não é região viva. Anunciar cada tick seria barulho constante e deixaria o leitor de tela inútil. Ela tem uma descrição escondida explicando isso e o botão de pausa.
- **Pausar a tela** atende o critério 2.2.2 da WCAG (conteúdo que se atualiza sozinho precisa poder parar).
- O alerta é a única coisa anunciada: a região `aria-live="assertive"` existe desde o carregamento e cada aviso entra com `role="alert"`.
- O estado da conexão também não é região viva: a contagem muda a cada 200 ms.
- `prefers-reduced-motion` desliga o piscar e as transições. A cor do preço e a seta continuam dizendo pra onde ele foi.
- Erro do alerta fica ligado ao campo por `aria-describedby`, com `aria-invalid`, e o foco volta pro campo. Tirar um ativo da lista devolve o foco pro "Adicionar ativo".
- Rádios e checkbox de verdade por baixo do visual, foco visível, alvos de 40 a 44 px.

## Protocolo

Quadros de texto em JSON, com campos curtos porque passam centenas de vezes por segundo.

```
painel → servidor   {"op":"assinar","ativos":["ARVX3","QRTZ3"]}
                    {"op":"cancelar","ativos":["ARVX3"]}
servidor → painel   {"t":"inicio","s":"ARVX3","abertura":18.4,"hist":[...120 preços],"ts":...}
                    {"t":"tick","s":"ARVX3","p":18.42,"ts":...}
                    {"t":"cancelado","ativos":["ARVX3"]}
                    {"t":"pulso","ts":...}
                    {"t":"erro","motivo":"ativo desconhecido: XXXX3"}
```

O servidor é idempotente (assinar de novo não duplica o `inicio`) e quadro estranho vira `null` no cliente em vez de derrubar o painel.

## Estrutura

```
src/app/
  protocolo/     ativos fictícios, tipos das mensagens, leitura com validação
  servidor/      servidor de cotações (puro), Worker e a "ponte" até ele
  soquete/       SoqueteSimulado (interface do WebSocket) e a rede simulada
  cliente/       cliente: reconexão, batimento, fila, backoff
  dados/         agrupamento por quadro, livro de cotações, alertas, buffer circular
  mesa.ts        estado da tela: liga tudo e decide quando desenhar
  ui/            tabela, gráfico, alertas, Simular, estado, medidores, avisos, guia
```

## Como rodar

```bash
npm install
npm start            # desenvolvimento em http://localhost:5193
npm test             # testes (Vitest + jsdom, sem navegador)
npm run typecheck    # tipos, incluindo templates
npm run lint         # angular-eslint, falha com qualquer aviso
npm run build        # produção
```

Node 24 ou mais novo.

## Testes

Vitest (runner padrão do Angular 22) com jsdom. Relógio falso do Vitest pra reconexão, marble do RxJS pro agrupamento.

- **Reconexão**: sequência de esperas 500, 1000, 2000, 4000, 8000, 8000 sem tentar antes da hora; contador que só zera com conexão estável; conexão muda derrubada pelo batimento; conexão que não abre no prazo; close atrasado de soquete abandonado não mexe no novo; "Tentar agora"; desconectar de propósito não volta.
- **Backoff**: teto, faixa do jitter, nunca 0 ms, painéis espalhados.
- **Fila e reassinatura**: assinar/cancelar se anulam, último pedido vale, na volta reassina o que estava ativo e manda só o que falta.
- **Agrupamento**: marble (lote por quadro, quadro vazio não emite), mil mensagens viram um lote, todo tick entra no livro mas o destaque troca uma vez por quadro; na tela, 50 ticks viram 1 desenho agrupado e 50 desenhos sem agrupar.
- **Protocolo**: `inicio` com histórico, ticks só do que foi assinado, cancelar para, idempotência, cada conexão isolada, conexão nova começa vazia, erro pra ativo desconhecido, taxa exata com passos fracionados, batimento.
- **Soquete simulado**: estados, `InvalidStateError`, resposta fora do `send`, 1006 sem aperto de mão, rede muda, close limpo; e um teste ponta a ponta cliente + soquete + servidor caindo e voltando com a reassinatura.
- **Alertas**: cruzamento (inclusive bater exato), não repete do outro lado do alvo, alerta de uma vez só, pico dentro do quadro, validação de alvo já ultrapassado, leitura de "R$ 1.234,56".
- **Tela**: guia lembrado, preço chegando na tabela, tabela sem região viva, alerta anunciado em `role="alert"`, alvo inválido com foco no campo, pausa congela a tabela mas o alerta dispara, tirar ativo manda `cancelar` e devolve o foco.

O CI (GitHub Actions) roda lint, tipos, testes e build a cada push e publica no GitHub Pages quando passa na `main`.

## O que muda num produto real

- Servidor de verdade e `new WebSocket(url)` na fábrica. Autenticação no primeiro quadro, não na URL.
- Ouvir `online`/`offline` e `visibilitychange` pra tentar na hora em que a rede volta e parar de desenhar com a aba escondida.
- Número de sequência por ativo pra detectar tick perdido e pedir snapshot.
- Protocolo binário (ou ticks em lote) se a banda pesar.
- Tabela virtualizada pra centenas de ativos, e o gráfico em `OffscreenCanvas` dentro do Worker.

## Autor

João Paulo da Silva Ferreira · [joaopaulo.omniahub.com.br](https://joaopaulo.omniahub.com.br) · [LinkedIn](https://www.linkedin.com/in/jo%C3%A3o-paulo-da-silva-ferreira-682aa423/)

Licença MIT.
