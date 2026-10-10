# Paridade com o mock — fase 1c

> **Referência, não tarefa.** Segue a regra de especificações externas: entra como referência e passa por revisão antes de virar tarefa.
> **Fontes:** `csc-mock` de 07/10/2026 (`app.js` e `seed.js`) e o Documento do projeto de 07/10/2026.
> **Ordem:** a da tabela da fase 1c no Documento do projeto. A tela inicial (Painel) junta o monitor de SLA e os indicadores, por isso tem um item próprio.
> **Conflito:** onde o mock e o documento divergem, vale o documento. A divergência aparece em "Não copiar do mock".
> **Companheiro:** `paridade-mock-1b.md`, mesmo formato.

O mock tem regras que se contradizem entre si ou que o documento não define. Elas estão reunidas logo abaixo e foram decididas pelo Cesar em 10/10/2026, para valer quando a 1c começar. Cada item depois traz as telas do mock, o que elas mostram, as regras visíveis, quem vê e uma lista de paridade para conferir no PR.

Papéis do mock: `csc` (Gestor CSC do grupo), `band` (Gestor CSC da bandeira), `hotel` (gerente do hotel), `tec` (técnico), `prop` (proprietária, administrado) e `loc` (locador, arrendado).

---

## Decididas antes de implementar (Cesar, 10/10/2026)

As sete foram aprovadas pelo Cesar em 10/10/2026, conforme as recomendações ("Cesar aqui", no chat do agente). Valem quando a 1c começar; nada foi implementado. A decisão 2 segue o adendo ao ADR-027, aprovado pelo Cesar em 10/10/2026 (`docs/03-decisoes-tecnicas.md`; registro no `docs/diario-fase-1a.md`).

| # | Ponto | O que o mock faz | Por que decidir | Decisão (Cesar, 10/10/2026) |
| --- | --- | --- | --- | --- |
| 1 | Fim do tempo médio de reparo | Mede da abertura ao **encerramento** (aceite), "por semana" | O SLA do mock para quando o serviço é concluído (estado "Aguardando aceite"), mas o MTTR continua contando até o aceite. Uma demora do solicitante em aceitar piora o MTTR da manutenção | **Decidido:** MTTR da abertura até o **serviço concluído**, pelas transições da OS; o tempo até o aceite pode virar um indicador à parte |
| 2 | "Aguardando peça" | O estado existe, mas o relógio do SLA **não pausa** | Pausar ou não é regra de política e muda todos os prazos | **Decidido:** não pausa por padrão; a pausa é opção da política por categoria, com o tempo pausado exibido na ficha. Segue o adendo ao ADR-027, aprovado (a pausa lê o estado da OS, e não a situação) |
| 3 | Escalonamento por bandeira | O limite de escalonamento (80% do prazo) é lido do hotel ou do grupo; a bandeira é pulada | O documento põe o nível bandeira na herança de todas as políticas | **Decidido:** herança completa: hotel, depois bandeira, depois grupo |
| 4 | Meta de SLA | "Meta 90%" fixa na tela | Uma meta fixa no código contraria a regra de que toda exigência do cliente vira política | **Decidido:** meta de SLA como política, com padrão de 90% |
| 5 | "Fluxo de eventos ao vivo" | São os 5 últimos registros da **auditoria**, no escopo de quem vê | Não é tempo real: é uma leitura da auditoria. O selo "ao vivo" promete mais do que entrega | **Decidido:** "Últimos eventos", lidos da auditoria ao abrir o painel e a cada 60 segundos, sem o selo "ao vivo" |
| 6 | Gráficos do painel e "chamados por 100 UHs" | Existem no mock e não estão na especificação da 1c | Já foram levados ao Cesar no mapa main × mock | **Decidido:** os gráficos do painel (abertos por dia, abertos × encerrados, onde mais quebra) e "chamados por 100 UHs" entram na 1c |
| 7 | Separador do CSV | Ponto e vírgula, com BOM | Correto para o Excel em português, espanhol e francês; em inglês o Excel espera vírgula | **Decidido:** separador pelo formato regional de quem exporta, mantendo o BOM |

---

## 1. Políticas — nível bandeira

**Telas do mock:** Políticas de SLA (seletor "Grupo, bandeira, hotel") e ficha do chamado ("prazo herdado").

**O que o mock mostra**

- Seletor de escopo: grupo, bandeira ou hotel.
- Tabela **Prazo de atendimento por prioridade**: "Horas até concluir o serviço. A regra mais específica vence: hotel, depois bandeira, depois grupo."
- "Campos em cinza mostram o valor herdado. Preencha para criar uma exceção; apague para voltar a herdar. Novos chamados já usam o valor alterado, e a mudança fica na auditoria."
- Prazos padrão do grupo no mock: Crítica 2 h, Alta 8 h, Média 24 h, Baixa 72 h. A Linha Suítes tem exceção de Alta 4 h.
- Na ficha do chamado, o prazo mostra a origem da regra, por exemplo "herdado da Linha Suítes".
- Para quem não altera: "Você vê as regras que valem para o seu escopo."

**Regra visível:** a prioridade padrão por categoria também segue hotel, depois bandeira, depois grupo; sem regra, vale "Média".

**Quem vê:** `csc` altera; `band` lê; os demais não acessam a tela.

**Paridade**

- [ ] Herança hotel → bandeira → grupo em todas as chaves de política, inclusive o escalonamento (decisão 3).
- [ ] Valor herdado em cinza e exceção preenchida; apagar volta a herdar.
- [ ] Origem da regra exibida no prazo do chamado.
- [ ] Mudança gravada na auditoria e aplicada só a chamados novos.

**Não copiar do mock:** o aviso "Somente a gestão do CSC altera políticas" contradiz o documento, em que quem altera é o Admin do grupo. Ponto levado ao Cesar no mapa main × mock.

---

## 2. Calendário de SLA

**Telas do mock:** Políticas de SLA (bloco "Prioridade padrão e relógio por categoria" e "Outras regras") e ficha do chamado.

**O que o mock mostra**

- Texto: "Quem abre o chamado não precisa escolher a prioridade. Ela vem da categoria, e o CSC ajusta na triagem se precisar. O relógio define se o prazo corre 24 horas por dia ou só no expediente do hotel: elevador parado conta sempre; pintura conta em horário comercial."
- Tabela por categoria: **Categoria**, **Prioridade padrão**, **Prazo no grupo** e **Relógio do SLA**, com as opções "24 horas, 7 dias" e "Horário comercial".
- Expediente do mock: segunda a sexta, das 8h às 18h; sábado, das 8h às 12h.
- Feriados, no texto da política: "Nacionais, estaduais e municipais do hotel, e os cadastrados pelo próprio hotel".
- Na ficha do chamado, a categoria aparece com "(relógio em horário comercial)" quando for o caso.

**Regras visíveis**

- Em horário comercial, o prazo só corre dentro do expediente e não corre em feriado.
- No mock, os feriados são só os nacionais fixos; o documento pede também os regionais e os do hotel.

**Paridade**

- [ ] Relógio por categoria (24x7 ou horário de atendimento), com herança.
- [ ] Expediente por hotel, no fuso do hotel.
- [ ] Feriados nacionais e regionais de fábrica, mais os municipais e os do próprio hotel.
- [ ] Prazo calculado em horas úteis quando o relógio é de horário comercial.
- [ ] Critério do piloto: elevador parado conta 24x7; pintura conta em horário comercial.
- [ ] Pausa do relógio por categoria, desligada por padrão, com o tempo pausado na ficha (decisão 2, com o adendo ao ADR-027).

---

## 3. Monitor de SLA — alerta e escalonamento

**Telas do mock:** ficha e lista de chamados, Painel (contagem regressiva) e Políticas de SLA ("Escalonamento").

**O que o mock mostra:** cinco situações do prazo.

| Situação | Quando | Texto no mock |
| --- | --- | --- |
| No prazo | Antes do limite de escalonamento | "Vence em X" |
| Perto de vencer | Tempo decorrido acima do limite de escalonamento (padrão 80% do prazo) | "Vence em X", em destaque |
| Vencido | Prazo passou e o serviço não foi concluído | "Vencido há X" |
| Serviço concluído | Chamado aguardando aceite | "Serviço no prazo" ou "Serviço fora do prazo" |
| Encerrado | Depois do aceite | "No prazo" ou "Fora do prazo" |

**Regra visível:** o SLA para de contar quando o serviço é concluído, e não no aceite.

**Paridade**

- [ ] As cinco situações, com o limite de escalonamento por política.
- [ ] Alerta de prazo perto de vencer e escalonamento à central quando passar do limite.
- [ ] O relógio para na conclusão do serviço.

**Não copiar do mock:** o escalonamento pula a bandeira na herança (decisão 3).

---

## 4. Painel (tela inicial)

**Telas do mock:** Painel, para cada persona.

**O que o mock mostra**

- **Indicadores do topo, em 30 dias, com a variação contra os 30 dias anteriores e uma linha de 14 dias:**
  - chamados em aberto;
  - SLA cumprido (meta 90%);
  - tempo médio de reparo;
  - preventivas em dia.
- **Quadro por hotel** (no mock, "Telemetria por hotel"): **Hotel**, **Em aberto**, **Vencem em breve**, **Fora do prazo**, **Críticos**, **Prev. atrasadas**, **SLA 30 dias (meta 90%)** e **Chamados abertos por dia, 14 dias**. Clicar no hotel abre a fila dele. Texto: "Cores mais fortes indicam mais ocorrências."
- **Situação do hotel no quadro:**
  - crítico, se há crítico vencido ou 3 ou mais vencidos;
  - atenção, se há algum vencido, algum perto de vencer ou 2 ou mais preventivas atrasadas;
  - ok nos demais casos.
- **Contagem regressiva:** os 6 próximos prazos a vencer, com "Ver fila completa".
- **Últimos eventos** (no mock, "Fluxo de eventos, ao vivo"): os 5 registros mais recentes da auditoria no escopo.
- **Gráficos:** "Fluxo de chamados", com abertos e encerrados por dia em 30 dias, e "Onde mais quebra", com chamados por categoria em 30 dias.
- **Proprietária:** cartão "UHs acompanhadas", com "Você vê só os chamados das suas unidades". A coluna de preventivas atrasadas some.
- **Locador:** cartão "Categorias sob o locador", com "Definidas na matriz de responsabilidade do contrato de arrendamento".
- **Selo "PMS lido":** depende do conector real da 1b.

**Quem vê:** todos os papéis menos `tec`, cada um no seu escopo.

**Paridade**

- [ ] Os quatro indicadores, com a variação e a linha de 14 dias.
- [ ] Quadro por hotel com as colunas e a regra de situação acima; o nome da seção decidido pelo Cesar (sugestão: "Situação por hotel").
- [ ] Contagem regressiva dos 6 próximos prazos.
- [ ] Cartões próprios do proprietário e do locador.
- [ ] Meta de SLA lida da política, com padrão de 90% (decisão 4).
- [ ] Gráficos (abertos por dia, abertos × encerrados, onde mais quebra) e "Últimos eventos", lidos da auditoria ao abrir e a cada 60 segundos, sem "ao vivo" (decisões 5 e 6).

---

## 5. Painel de indicadores

**Telas do mock:** Indicadores.

**O que o mock mostra**

- Indicadores do período, com "vs. 30 dias antes":
  - backlog;
  - % de SLA;
  - tempo médio de reparo, em horas abaixo de 24 h e em dias acima disso;
  - % de preventiva em dia;
  - razão preventiva/corretiva, sobre as OS concluídas;
  - UH-dias perdidos.
- O cálculo do mock também traz custo informado e % de chamados novos com impacto no hóspede.
- **Backlog por idade**, em cinco faixas: até 1 dia, 1 a 3 dias, 3 a 7 dias, 7 a 30 dias, mais de 30 dias.
- **Comparação entre hotéis da mesma bandeira**, com seletor de bandeira. Colunas:
  - Hotel, com o modelo contratual e o número de UHs;
  - % de SLA;
  - MTTR;
  - Backlog;
  - Preventiva em dia;
  - UH-dias perdidos;
  - Chamados por 100 UHs.
  Texto: "Em destaque, o melhor resultado da bandeira em cada coluna. Hotéis só se comparam dentro da mesma bandeira."
- **Produtividade por equipe e hotel**, em 30 dias: **Quem executou** (equipe interna ou fornecedor), **OS concluídas**, **Preventivas**, **Corretivas** e **Corretivas no prazo**.
- Botão **Exportar CSV**.

**Regras visíveis**

- UH-dias perdidos é a soma, em dias, dos períodos de UH indisponível dentro da janela.
- % de SLA é a fração dos chamados encerrados na janela cujo encerramento ficou dentro do prazo.

**Quem vê:** `csc`, `band` e `hotel`.

**Paridade**

- [ ] Os seis indicadores do documento, com a variação contra o período anterior.
- [ ] Backlog por idade nas cinco faixas.
- [ ] Comparação só dentro da mesma bandeira, com o melhor de cada coluna em destaque.
- [ ] Produtividade por equipe e hotel, com fornecedores. O indicador por técnico continua desligado por padrão, como proposto em 24/09.
- [ ] Exportação respeitando o escopo.

**Não copiar do mock**

- O tempo médio de reparo do mock vai até o aceite. Na 1c, vai até o serviço concluído (decisão 1).

"Chamados por 100 UHs" entra na 1c (decisão 6).

---

## 6. Impressão e exportação

**Telas do mock:** ficha da OS ("Imprimir OS"), Chamados, Indicadores e Auditoria ("Exportar CSV").

**O que o mock mostra**

- **OS impressa:**
  - Serviço, Origem, Local, Ativo e Responsável;
  - Executado por, Execução e Custo informado;
  - Checklist e Fotos;
  - Aceite, com "Assinado no celular" ou "Pendente".
- **CSV:** ponto e vírgula, com BOM. Depois de exportar, o aviso: "N linhas exportadas em arquivo.csv, só com o que o seu perfil enxerga".

**Paridade**

- [ ] OS impressa com fotos, checklist e assinatura, nos campos acima.
- [ ] CSV com o escopo de quem exporta, e o aviso com o número de linhas.
- [ ] Separador do CSV pelo formato regional de quem exporta, com BOM (decisão 7).

**Não copiar do mock:** o custo informado não aparece na impressão para o proprietário.

---

## 7. Auditoria geral

**Telas do mock:** Auditoria.

**O que o mock mostra**

- Título **Quem mudou o quê**, com o texto "Registro permanente, só de leitura, de alterações em chamados, OS, ativos, políticas e acessos".
- Filtros:
  - **Todos os registros** (tipo de registro);
  - **Todos os hotéis**;
  - busca "Buscar por pessoa, registro ou texto".
- Colunas: **Quando**, **Quem**, **Registro**, **Hotel** e **O que mudou**.
- Botão **Exportar CSV** e paginação.

**Quem vê:** `csc`, `band` e `hotel`, cada um no seu escopo; a gerente só vê a auditoria do hotel dela.

**Paridade**

- [ ] Tela só de leitura, com os três filtros e as cinco colunas.
- [ ] Escopo aplicado no banco, como o resto.
- [ ] Exportação CSV com o mesmo filtro da tela.

---

## 8. Arrendado mínimo

**Telas do mock:** Hotéis e unidades (matriz de responsabilidade), ficha do chamado, ficha da OS e Painel do locador.

**O que o mock mostra**

- **Matriz de responsabilidade dos arrendados:** "Por hotel e categoria: quem responde pelo custo. A OS já nasce marcada, e o locador é notificado com data registrada." Linhas por categoria; colunas **Arrendatária** e **Locador** em cada hotel arrendado.
- **Ficha do chamado e da OS:** campo **Responsável pelo custo**.
- **Aviso ao locador:** quando o responsável é o locador, o chamado ganha o evento "Locador notificado: categoria sob responsabilidade dele no contrato", com data. O aviso é feito uma vez só.
- **Locador:** vê painel, chamados, OS e ativos das categorias sob ele, só leitura. O painel mostra "Categorias sob o locador".

**Paridade**

- [ ] Matriz por hotel arrendado e categoria, com arrendatária ou locador.
- [ ] OS nasce com o responsável pelo custo vindo da matriz.
- [ ] Aviso ao locador com data registrada, uma vez por chamado.
- [ ] Locador com leitura só das categorias sob ele.

**Não copiar do mock:** aprovação de gastos pelo locador ou pelo proprietário é da fase 2.

---

## 9. Comunicação

**Telas do mock:** nenhuma. O mock não mostra e-mail, push nem recuperação de senha.

**O que o documento pede:** e-mail próprio com domínio de envio, notificações, push no celular e recuperação de senha.

**Paridade:** sem referência visual. Aplicar o pacote de interface do mock (ADR-038) aos modelos de e-mail e às telas de recuperação de senha.

**Lembrete:** pela decisão de idiomas de 25/09, e-mail, push e PDF saem em pt-BR, mas com os textos no catálogo desde já.

---

## 10. Idiomas

**Telas do mock:** nenhuma. O mock está só em português.

**O que o documento pede:** o catálogo completo nos quatro idiomas, com tradução profissional.

**Paridade**

- [ ] Toda tela da 1b e da 1c com os textos no catálogo, em pt-BR, inglês, espanhol e francês.
- [ ] Datas, números e moeda pelo formato regional de quem lê.
