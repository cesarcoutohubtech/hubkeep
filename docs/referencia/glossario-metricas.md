# Glossário único de métricas do núcleo e do Intelligence

**Situação:** o Cesar aprovou o glossário único neste arquivo em 13/10/2026, no chat do agente da 1c, para ser fechado com o agente do Kaio pelos diários. Esta é a primeira versão, escrita pelo agente da 1c em 13/10/2026. Cada termo diz se está **fechado** (já decidido e no código, ou decidido pelo Cesar) ou **em proposta** (aguarda o Kaio, ou a aprovação do Cesar do desenho dos indicadores, itens 9 a 11 de `docs/referencia/propostas-desenho-1c.md`).

## Regras

1. **Um nome, um cálculo.** O painel de indicadores da 1c e o Intelligence usam o mesmo nome só para o mesmo cálculo. Uma métrica parecida com outra definição ganha outro nome.
2. **A função mora no núcleo.** O cálculo de cada termo daqui é uma função pura de `packages/dominio`. O Intelligence importa do domínio, e o núcleo nunca importa o Intelligence (ADR-037). Foi assim com `uhDiasPerdidos` na I4.
3. **Score do Intelligence não é métrica do núcleo.** Reincidência, atenção do ativo, efetividade e sinal sistêmico são do módulo, versionados no módulo (ADR-034). O painel da 1c não usa esses nomes.
4. **Mudar uma definição** é uma versão nova deste arquivo, registrada nos dois diários, com a aprovação do Cesar e, nos termos que o Intelligence usa, também a do Kaio.
5. **Dia e período no fuso do hotel.** Toda contagem por dia, e todo período escolhido na tela, usa o dia no fuso de cada hotel (`app.hotel.fuso`).
6. **Horas corridas,** salvo onde o termo diz outra coisa. Só o SLA usa o calendário de atendimento (ADR-042).

## Termos de base

| Termo | Definição | Função ou fonte | Quem usa | Situação |
|---|---|---|---|---|
| **Abertura** | A criação do chamado (`app.chamado.criado_em`). | Coluna | Os dois | Fechado |
| **Corretiva** | O chamado e a OS dele. O chamado cancelado fica fora de toda métrica, salvo onde o termo diz outra coisa. | `Corretiva` (Intelligence) | Os dois | Fechado |
| **Conclusão do serviço** | A última transição `concluir` da OS (`app.os_transicao`), se depois dela a OS não foi reaberta nem cancelada. O aceite não muda a conclusão. | `conclusaoEReaberturas`, hoje em `packages/inteligencia/src/historico.ts`; **proposta: mover para o domínio**, com o mesmo comportamento, para o painel usar | Os dois | Em proposta (Kaio) |
| **Reabertura** | A transição `reabrir` da OS, no aceite recusado. | A mesma função | Os dois | Fechado |
| **Tempo parado do ativo** | Do início ao fim de cada parada do ativo, ou até agora, se aberta, com o trecho sobreposto contado uma vez. | `tempoParado`, `tempoParadoTotal` (domínio) | Os dois | Fechado |
| **UH-dias perdidos** | As horas de UH indisponível dentro do intervalo, divididas por 24, com uma casa decimal. O período sobreposto na mesma UH conta uma vez, o aberto conta até agora, e o do chamado cancelado fica fora. | `uhDiasPerdidos` (domínio) | Os dois | Fechado |

## Termos do SLA (ADR-042)

| Termo | Definição | Função ou fonte | Quem usa | Situação |
|---|---|---|---|---|
| **Prazo de atendimento** | O limite para a OS ser gerada, calculado na abertura pela política `chamado.sla` copiada no chamado. | `app.chamado.prazo_atendimento`; `calcularPrazo` (domínio) | Núcleo | Fechado |
| **Prazo de solução** | O limite para a conclusão do serviço, calculado da mesma forma e empurrado pela pausa que para o relógio. | `app.chamado.prazo_solucao` | Núcleo | Fechado |
| **Tempo pausado** | O tempo em que o relógio da solução ficou parado pelas pausas da OS com motivo da lista da política, na categoria com a pausa ligada. | `app.chamado.pausado_segundos` | Núcleo | Fechado |
| **Dentro do prazo** | A conclusão do serviço até o prazo de solução, inclusive. | Domínio | Núcleo | Fechado |

## Indicadores do painel da 1c

| Termo | Definição | Função ou fonte | Quem usa | Situação |
|---|---|---|---|---|
| **Backlog** | Os chamados não cancelados ainda sem conclusão do serviço, num instante (hoje, ou o fim de cada dia). | Domínio | Núcleo; o Intelligence pode ler | Em proposta (item 10) |
| **Backlog por idade** | O backlog em cinco faixas pela idade desde a abertura: até 2 dias, 3 a 7, 8 a 15, 16 a 30 e mais de 30. | Domínio | Núcleo | Em proposta (item 10) |
| **% de SLA** | Dos chamados com prazo de solução vencendo no período, os concluídos dentro do prazo sobre o total. O vencido e ainda aberto conta como fora. O tempo pausado dos mesmos chamados aparece ao lado, em soma e em média. | Domínio | Núcleo | Em proposta (item 10); o tempo pausado ao lado é decisão 6 do Cesar (13/10/2026) |
| **Meta de SLA** | O alvo do % de SLA, padrão de 90%. | Política `chamado.sla` | Núcleo | Fechado (decisão 4 da paridade) |
| **MTTR** | A média, em horas corridas, da abertura até a conclusão do serviço, dos chamados com a conclusão no período, sem preventiva. A mediana aparece ao lado. Reaberto e concluído de novo, vale a última conclusão. | Domínio, sobre a conclusão do serviço | Os dois (o PRD do Intelligence cita MTTR) | Fechado (decisão 1 da paridade); a mediana, em proposta (item 10) |
| **Tempo até o aceite** | Da conclusão do serviço até o aceite. Não entra no MTTR. | Domínio | Núcleo, se entrar | Em proposta (decisão 1 da paridade, "pode virar indicador à parte") |
| **% de preventiva em dia** | Das OS preventivas com data prevista no período e não canceladas, as concluídas até o fim do dia previsto mais a tolerância, sobre o total. | Domínio; tolerância pela política `preventiva.tolerancia_dias`, padrão 0 | Núcleo | Em proposta (item 11); depende da PV3 |
| **Preventiva atrasada** | A preventiva vencida: passou do fim do dia previsto mais a tolerância e não foi concluída nem cancelada. É o complemento da "preventiva em dia", com a mesma tolerância. | Domínio; hoje é o campo `preventivaAtrasada` da atenção do ativo, ainda sem dado | Os dois | Em proposta (Kaio) |
| **Razão preventiva/corretiva** | As OS preventivas concluídas no período sobre as corretivas com a conclusão do serviço no período. | Domínio | Núcleo | Em proposta (item 10) |
| **Chamados por 100 UHs** | Os chamados abertos no período, divididos pelas UHs ativas do hotel, vezes 100. | Domínio | Núcleo | Fechado (decisão 6 da paridade) |
| **Comparação na bandeira** | Os indicadores por hotel, lado a lado, com a média da bandeira, e as contagens normalizadas por 100 UHs. Só os hotéis que o usuário lê. | Domínio | Núcleo | Em proposta (item 10) |
| **Produtividade por equipe e hotel** | As OS concluídas e as horas apontadas (`app.os_apontamento`), por equipe e por hotel, no período. A visão por técnico fica desligada por política. | Domínio | Núcleo | Em proposta (item 10) |

## Pontos para o agente do Kaio

1. Mover `conclusaoEReaberturas` para o domínio, com o mesmo comportamento e os testes, e o Intelligence passar a importar de lá, como foi com `uhDiasPerdidos`. A mudança é no pacote dele, e só ele a faz.
2. Confirmar que o campo `preventivaAtrasada` da atenção vai usar a "preventiva atrasada" daqui, com a tolerância da política do núcleo, quando a PV3 trouxer o dado.
3. Confirmar que o Intelligence não calcula MTTR, backlog nem % de SLA próprios. Se precisar, ele usa as funções do domínio, com estes nomes.
4. Apontar qualquer nome do PRD (`docs/referencia/prd-hubkeep-intelligence-v1.md`) que colida com um termo daqui com outro cálculo.
