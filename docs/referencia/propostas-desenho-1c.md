# Propostas de desenho da 1c: SLA, arrendado, indicadores e auditoria geral

**Situação:** proposta de 12/10/2026, do agente do núcleo, para a aprovação do Cesar. Só documento: nada disto entra antes do fim da 1b. Cada item tem uma proposta curta e termina com as decisões. Os itens vêm do `docs/13` e das sete decisões da paridade de 10/10/2026, que valem aqui sem repetir.

**Fatos do código** (12/10/2026):
- **Não existe cálculo de SLA:** a rota `/api/cron/sla` está vazia, e chamado e OS não têm coluna de prazo.
- **Já existem:** o fuso do hotel (`app.hotel.fuso`), o país e a subdivisão (`pais`, `subdivisao`), o peso da prioridade (reservado para o SLA), o nível bandeira em `app.politica` e a resolução hotel → bandeira → grupo no registro de políticas.
- **Pontos de partida:** as transições da OS (`app.os_transicao`, I5), os UH-dias (`uhDiasPerdidos`, no domínio) e o modelo contratual do hotel (I2).
- **O chamado não tem categoria própria:** ela vem do ativo, e o chamado sem ativo fica sem categoria.

---

## 1. Calendário de SLA

**Dois prazos por chamado:**
- **atendimento:** da abertura até a OS gerada;
- **solução:** da abertura até o serviço concluído (OS `concluida`), o mesmo ponto final do MTTR (decisão 1 da paridade). O aceite não conta.

**Política `chamado.sla`, com herança hotel → bandeira → grupo:**
- por prioridade: as horas de atendimento e de solução, e o relógio, `24x7` ou `atendimento`;
- por categoria (opcional): sobrepõe a linha da prioridade, com a opção "pausar com a OS pausada" (decisão 2 da paridade; a pausa lê o estado da OS, como no adendo ao ADR-027);
- sem categoria (chamado sem ativo): vale a linha da prioridade.

**Padrão de fábrica (editável):**

| Prioridade | Atendimento | Solução | Relógio |
|---|---|---|---|
| Urgente | 1 h | 2 h | 24x7 |
| Alta | 2 h | 8 h | 24x7 |
| Média | 8 h | 24 h | atendimento |
| Baixa | 24 h | 72 h | atendimento |

Os prazos de solução são os do mock; os de atendimento são proposta. A prioridade criada pelo tenant, sem linha na política, cai na linha de peso mais próximo.

**Horário de atendimento:**
- **Política `hotel.horario_atendimento`,** por dia da semana, com intervalos. Padrão do mock: de segunda a sexta, das 8h às 18h, e sábado, das 8h às 12h.
- **Sempre no fuso do hotel.** A virada do horário de verão, se voltar, sai da base de fusos.

**Feriados:**
- **Nacionais e regionais:** de uma biblioteca de calendário com os feriados por país e estado, como decidido no ADR-022. A escolha da biblioteca (licença, manutenção e cobertura por município) vai no ADR da 1c.
- **Do hotel:** tabela nova `app.feriado_hotel` (data e nome), com RLS e o modelo do `docs/02`. A gestão do hotel cadastra.
- **Feriado municipal:** fica no cadastro do hotel, porque a cobertura por município das bibliotecas é irregular.

**Cálculo e cópia:**
- **No domínio:** `somarHorasDeAtendimento(inicio, horas, calendário, feriados, fuso)`, puro e testado com virada de dia, fim de semana, feriado e fuso.
- **Na abertura:** o chamado grava a cópia da regra usada em `politica_aplicada` (ADR-026) e os prazos calculados em colunas novas (`prazo_atendimento`, `prazo_solucao`), para o monitor e o painel filtrarem sem recalcular.
- **Recálculo:** mudar a prioridade na triagem recalcula a partir da abertura com a regra nova, e a auditoria guarda os dois. A pausa soma o tempo pausado (coluna `pausado_segundos`) e empurra o prazo de solução na retomada.
- **O monitor** (alerta em 80% e escalonamento, decisão 3) lê essas colunas. Fica no item próprio da 1c.

**Decisões:**
1. Dois prazos, atendimento e solução, com o fim da solução na conclusão do serviço? (proposta: sim)
2. A tabela de fábrica acima, com urgente e alta em 24x7? (proposta: sim, editável por política)
3. Feriado municipal cadastrado no hotel, sem depender da biblioteca? (proposta: sim)
4. Prazos gravados em colunas na abertura, com recálculo na troca de prioridade e na retomada? (proposta: sim)

---

## 2. Arrendado mínimo

**Matriz como política, sem tabela nova:**
- **Política `hotel.matriz_arrendamento`:** por categoria, `arrendataria` ou `locador`.
  - No grupo, é o padrão do grupo; no hotel, sobrepõe o do grupo.
  - Vale só no hotel com `modelo_contratual = 'arrendado'` (I2).
  - A categoria sem regra fica com a arrendatária.
  - A política é auditada como as outras (ADR-026).
- **Quem é o locador:** o proprietário vinculado ao hotel inteiro (`app.hotel_proprietario`, ADR-031). Ele já lê os chamados do hotel pela RLS de hoje. A 1c acrescenta a marca de responsabilidade e o filtro "do locador".

**OS marcada:**
- **Na geração da OS corretiva,** o responsável vai para uma coluna nova, `app.os.responsavel_arrendamento`, com a cópia da regra (ADR-026).
- **Ajuste:** quem tria pode mudar a marca até o aceite, com motivo, que fica na auditoria.
- **Sem categoria:** chamado sem ativo fica com a arrendatária, e a triagem ajusta.
- **Preventiva:** a OS preventiva usa a categoria do ativo.

**Aviso ao locador, com a data registrada:**
- **Uma vez por OS,** quando ela nasce marcada como do locador, ou quando a marca muda para ele.
- **O evento `os.locador_avisado`** vai pelo outbox, e o worker envia o e-mail (depende do e-mail próprio da 1c).
- **O envio fica na auditoria,** com a hora, e aparece na linha do tempo ("Locador avisado em…"). Sem e-mail do locador, a linha do tempo mostra "sem e-mail cadastrado".

**Decisões:**
5. Matriz como política com herança grupo → hotel, e não tabela própria? (proposta: sim)
6. Locador = proprietário do hotel inteiro, sem papel novo? (proposta: sim)
7. Categoria sem regra, e chamado sem ativo, ficam com a arrendatária? (proposta: sim)
8. Aviso único por OS, com a hora na auditoria? (proposta: sim)

---

## 3. Definição de cada indicador do painel

**Regras comuns:**
- **Fonte:** as tabelas do núcleo, calculadas na aplicação a cada leitura. Sem tabela de agregados no MVP; se a medição da P1 mostrar lentidão, entra um agregado diário pelo worker, com ADR.
- **Período:** escolhido na tela (padrão: últimos 30 dias), com o dia no fuso de cada hotel.
- **Escopo:** pela RLS, os hotéis que o usuário lê. A comparação entre hotéis só mostra hotéis que ele lê.
- **Horas corridas** em todos os tempos. Só o % de SLA usa o calendário do item 1.

| Indicador | Definição | Observações |
|---|---|---|
| **Backlog** | Chamados não cancelados, ainda sem OS concluída, no fim do período. | Hoje e no fim de cada dia, para a linha de 14 dias do mock. |
| **Backlog por idade** | O backlog em cinco faixas pela idade desde a abertura: até 2 dias, 3 a 7, 8 a 15, 16 a 30 e mais de 30. | As faixas do mock. |
| **% de SLA** | Dos chamados com prazo de solução vencendo no período: os resolvidos dentro do prazo, sobre o total (os vencidos e ainda abertos contam como fora). | Meta por política, padrão de 90% (decisão 4 da paridade). Chamado cancelado fica fora. |
| **MTTR** | Média, em horas, da abertura do chamado até a transição da OS para `concluida` (`app.os_transicao`), dos chamados com serviço concluído no período. A mediana aparece ao lado. | Decisão 1 da paridade. Reaberta e concluída de novo: vale a última conclusão. Preventiva fora. |
| **% de preventiva em dia** | Das OS preventivas com data prevista no período e não canceladas: as concluídas até o fim do dia previsto mais a tolerância, sobre o total. | Tolerância por política (`preventiva.tolerancia_dias`, padrão 0). Depende da PV3. |
| **Razão preventiva/corretiva** | OS preventivas concluídas no período sobre as OS corretivas concluídas no período. | Mostrada como "x preventivas para cada corretiva" e em %. |
| **UH-dias perdidos** | `uhDiasPerdidos` (domínio) dos períodos de UH indisponível dentro do período, com o sobreposto contado uma vez e o chamado cancelado fora. | A mesma função lida pelo Intelligence. |
| **Chamados por 100 UHs** | Chamados abertos no período ÷ UHs ativas do hotel × 100. | Decisão 6 da paridade. Base da comparação entre hotéis. |
| **Comparação na bandeira** | Os indicadores acima por hotel, lado a lado, com a média da bandeira. As contagens vão normalizadas por 100 UHs. | Só os hotéis da bandeira que o usuário lê. |
| **Produtividade por equipe e hotel** | OS concluídas e horas apontadas (`app.os_apontamento`), por equipe e por hotel, no período. | A visão por técnico fica desligada por política, como no `docs/00`. |

**Quem vê:**
- **A gestão:** tudo, no escopo dela.
- **O proprietário e o locador:** só os cartões dos hotéis ou das UHs deles (backlog, UH-dias e chamados), sem produtividade e sem comparação, como os cartões do mock.

**Decisões:**
9. Cálculo na leitura, sem agregado, no MVP? (proposta: sim, até a medição mostrar o contrário)
10. As definições da tabela, em especial o % de SLA pelo prazo que vence no período e o MTTR com mediana ao lado? (proposta: sim)
11. Tolerância da preventiva em dia como política, padrão 0? (proposta: sim)

---

## 4. Tela de auditoria geral

**A tela:** `/auditoria`, só leitura, no menu da gestão (Admin do grupo, Gestor CSC e Gerente do hotel).
- **Filtros:** período (obrigatório, até 92 dias por consulta), hotel, tipo de registro, ação e pessoa.
- **Colunas:** quando, hotel, registro, ação e pessoa. "Antes e depois" ficam num detalhe que abre na linha.
- **Tradução:** ações e campos pela tradução do histórico por registro (`packages/dominio/src/auditoria.ts`), estendida às entidades que ainda não têm tradução.
- **Pessoa:** o nome sai de `app.membro`. A linha do job aparece como "Sistema".

**Paginação e exportação:**
- **Paginação:** cursor estável por `(em, id)`, 50 linhas por página.
- **CSV:** o mesmo da tela, nos mesmos filtros, com o separador pelo formato regional e o BOM (decisão 7 da paridade), até 50 mil linhas por exportação (`exportacao_limite`).
- **Índices novos** (migração só de índice): `(tenant_id, em desc, id)` e `(tenant_id, hotel_id, em desc, id)`. Hoje só existe o índice por registro.

**Escopo pela RLS de hoje, sem policy nova:**
- quem tem escrita no hotel lê a auditoria dos hotéis dele;
- a auditoria sem hotel é só do Admin do grupo, mais a do fornecedor para o Gestor CSC e o Gerente (adendo ao ADR-021);
- o proprietário não vê a tela (decisão 5 da paridade).

**Divergência a corrigir:** o `docs/13` diz que o Implantador lê a auditoria sem hotel, mas a RLS não deixa: ele só grava. A proposta é corrigir o `docs/13` para o que a RLS faz, em vez de abrir a leitura. O Implantador vê a auditoria do hotel dele.

**Decisões:**
12. Tela só para a gestão (o técnico e o solicitante, que a RLS deixa ler, não têm o menu)? (proposta: sim)
13. Período máximo de 92 dias por consulta e 50 mil linhas no CSV? (proposta: sim)
14. Corrigir o `docs/13` sobre o Implantador, sem abrir a leitura da auditoria sem hotel? (proposta: sim)
