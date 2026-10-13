# Diário da fase 1c

Diário do agente da 1c, o terceiro agente do repositório (Cesar, 12/10/2026): o agente do Cesar fica com a 1b e a administração do projeto, o agente do Kaio com o Intelligence, e este com a fase 1c (`docs/13-plano-fase-1c.md`). A preparação do piloto e a F0-12 ficam fora deste diário.

## Início e decisões do Cesar (13/10/2026)

Primeira entrega, sem código: o que foi entendido, os conflitos vistos e a ordem proposta, mais a proposta do calendário de SLA, no chat. As respostas do Cesar, no chat, em 13/10/2026:

- **Ambiente:** o agente da 1c fica na nuvem e usa as branches que o ambiente impõe (`claude/*`), e não `1c-*`. O título de cada PR começa por "1c:". O agente da 1b registra a exceção no `CLAUDE.md`.
- **Banco:** os testes de banco rodam só na CI. Depois de cada `db push`, quem confere o dev é o agente da 1b.
- **Fila de zona protegida:** depois do #203 (PV1), a vez alterna entre a 1c e a 1b: o PR do SLA, depois a PV2, e assim por diante. Em disputa, o Cesar decide.
- **Auditoria sem hotel:** a RLS prevalece, e o Implantador não lê. O `docs/13` e o texto do ADR-021 são corrigidos no PR da auditoria geral.
- **Calendário de SLA** (item 1 de `docs/referencia/propostas-desenho-1c.md`):
  1. as quatro decisões da seção 1, aprovadas, com o ajuste C (a pausa conta pelo relógio do chamado, e não pelo relógio de parede);
  2. a categoria própria do chamado, vinda do ativo e ajustável na triagem, com recálculo dos prazos e auditoria;
  3. os feriados oficiais por uma porta na aplicação; o ADR confere a licença e a frequência de atualização da biblioteca;
  4. a marca "repete todo ano" em `app.feriado_hotel`;
  5. o ponto facultativo fora por padrão, com a opção por política;
  6. no ADR: só param o relógio os motivos de uma lista configurável (por exemplo, aguardando peça, aguardando fornecedor e UH ocupada sem acesso); cada pausa é auditada, e o tempo pausado aparece no indicador de SLA.
- **Glossário de métricas:** aprovado em `docs/referencia/glossario-metricas.md`, fechado com o agente do Kaio pelos diários.
- **Ordem da 1c,** aprovada:
  1. glossário;
  2. nível bandeira nas políticas;
  3. calendário de SLA;
  4. monitor de SLA e escalonamento;
  5. comunicação;
  6. arrendado mínimo;
  7. auditoria geral;
  8. painel de indicadores;
  9. impressão e CSV;
  10. catálogo completo.
- **Autorização:** escrever o ADR e preparar o PR, conferindo no GitHub, antes de abrir, que nenhum outro PR de zona protegida está aberto.

## Registro antes de mexer no que é compartilhado (13/10/2026)

O chamado, a OS, as políticas, os catálogos e o `packages/dominio` são compartilhados com o agente da 1b. O que a 1c muda, por PR:

- **PR do SLA (zona protegida, este):** a migração 0043, com quatro colunas novas em `app.chamado` (`categoria_id`, `prazo_atendimento`, `prazo_solucao` e `pausado_segundos`), o motivo da pausa em `app.os_transicao` (`motivo_pausa`) e a tabela nova `app.feriado_hotel`. Nenhuma policy existente muda. Ficam o pgTAP 035, a tabela na lista do meta-teste 28, o `tipos-banco.ts`, o ADR-042 e a linha do `docs/02`.
- **PR seguinte (fora da zona protegida):**
  - no domínio: as políticas `chamado.sla` e `hotel.horario_atendimento` (o prefixo `hotel.` entra no registro do núcleo), `MOTIVOS_DE_PAUSA` e o cálculo (`calcularPrazo`, `horasDeRelogioEntre`);
  - na aplicação: a porta `FeriadosOficiais` e o adaptador da `date-holidays`, e a gravação dos prazos na abertura, na triagem (troca de prioridade e de categoria) e na pausa e retomada da OS;
  - o motivo na operação offline `os.pausar` (contrato e PWA);
  - o catálogo dos motivos e dos erros novos nos quatro idiomas.

  As telas do chamado, da triagem e da OS no PWA são as mesmas da 1b: antes de mexer nelas, leio o diário da 1b e atualizo a branch a partir da `main`.

## Pedido ao agente da 1b (13/10/2026)

1. Registrar no `CLAUDE.md` a exceção das branches do agente da 1c (`claude/*`, com o título do PR começando por "1c:"), como o Cesar decidiu.
2. **Numeração das migrações:** com a vez alternada, a do SLA é a 0043, e a PV2 passa a ser a 0044 (a fila do diário da 1b, de 12/10, ainda dá a 0043 para a PV2). Os nomes dos arquivos são por data e hora, então nada colide; só os comentários "Migração 00NN" mudam.
3. O PR do SLA, aberto depois do merge do #203, mexe nas mesmas linhas do #203 em quatro arquivos: o fim do `docs/03`, a lista do meta-teste 28, a lista do `docs/02` e o `tipos-banco.ts`. Eu resolvo o conflito do meu lado, trazendo a `main` depois do merge.
4. Depois do `db push` da 0043, conferir o dev, como o Cesar decidiu.

## Pedido ao agente do Kaio: glossário de métricas (13/10/2026)

O Cesar aprovou um glossário único das métricas do núcleo e do Intelligence (`docs/referencia/glossario-metricas.md`), com a regra "um nome, um cálculo", e a função de cada termo no domínio. A primeira versão está no arquivo, e quatro pontos dependem do agente do Kaio (seção "Pontos para o agente do Kaio"):
1. mover `conclusaoEReaberturas` para o domínio, como foi com `uhDiasPerdidos`;
2. a "preventiva atrasada" da atenção ser o complemento da "preventiva em dia", com a mesma tolerância;
3. o Intelligence sem MTTR, backlog ou % de SLA próprios;
4. apontar os nomes do PRD que colidam com um termo do glossário.

A resposta fica no diário do Intelligence, e eu atualizo o glossário a partir dela.

## PR do SLA: migração 0043 e ADR-042 (13/10/2026)

Branch `claude/gallant-clarke-fptpo9`, zona protegida.
- **`supabase/migrations/20261013120000_calendario_sla.sql` (0043):**
  - o chamado ganha:
    - a categoria, com FK composta para as do grupo;
    - os dois prazos e o tempo pausado (não negativo);
    - o GRANT de UPDATE só nessas quatro colunas;
    - dois índices parciais para o monitor;
  - a transição ganha o motivo da pausa, na lista do domínio e só na ação `pausar`;
  - a tabela `app.feriado_hotel`:
    - um feriado ativo por data;
    - sem UPDATE na data;
    - exclusão lógica;
    - leitura por quem lê o hotel, e gravação pela gestão e pelo Implantador, em nome próprio.
- **`supabase/tests/database/035_isolamento_feriado_hotel.test.sql`:** 49 testes, com os seis casos mínimos do `docs/02`, o implantador vencido e as colunas novas, por papel.
- **Meta-teste 28:** `app.feriado_hotel` na lista fechada.
- **`packages/db/src/tipos-banco.ts`:** atualizado à mão, no formato do gerador. O `pnpm db:types` roda depois do `db push`.
- **ADR-042** no `docs/03`, com as decisões de 13/10; a `date-holidays` conferida no npm (3.37.0: código ISC, dados CC BY 3.0, 12 versões de maio a setembro de 2026).
- **`docs/02`:** a linha da tabela nova.
- **Verificação:** no local, lint, typecheck e testes. O pgTAP só roda na CI, por decisão do Cesar; não rodei nada contra o dev.
- **Situação:** a branch foi enviada, mas o PR não foi aberto, porque o #203 (PV1, zona protegida) está aberto. O PR abre depois do merge do #203, com a `main` trazida para a branch.

## ADR-042 aprovado (13/10/2026)

Mensagem do Cesar no chat, 13/10/2026: "aprovo adr 42. Siga". O texto completo do ADR-042 está aprovado, inclusive os cinco detalhes do agente que estavam pendentes:
- a cópia da política inteira no chamado;
- a lista dos motivos da pausa;
- quem cadastra o feriado do hotel;
- a reabertura contra o mesmo prazo;
- os tipos de feriado que contam.

O status no `docs/03` mudou para aprovado. O PR continua esperando o merge do #203.

## Nível bandeira nas políticas (13/10/2026)

Item 2 da ordem da 1c. PR fora da zona protegida, sem migração, na branch `claude/1c-politicas-bandeira`. A RLS de `app.politica` já aceitava o escopo bandeira (0010 e 0013): só o Admin do grupo grava, e a política da bandeira é lida por quem tem papel vigente em algum hotel, como a do grupo.
- **Domínio:** `resolverPolitica` passou a resolver hotel → bandeira → grupo → padrão. O registro de políticas, que o Intelligence usa, já resolvia assim.
- **Banco:**
  - os níveis de um hotel passam a trazer a bandeira dele, por subconsulta em `app.hotel`. Valem tanto para a leitura das portas da abertura, da triagem, da execução e dos ativos (`niveisDaPolitica`) quanto para a leitura da configuração. Hotel sem bandeira não tem esse nível;
  - a gravação leva o `bandeira_id`. A bandeira de outro tenant volta 404 `bandeira_nao_encontrada`, e a auditoria guarda o `bandeiraId`.
- **Contrato:** o escopo `{ tipo: 'bandeira', bandeiraId }` entrou. A resposta traz o valor da bandeira, a origem `bandeira` e a bandeira do hotel.
- **Tela da configuração:**
  - com o hotel escolhido e com bandeira, cada política ganha "Gravar na bandeira" e "Voltar a herdar na bandeira", e o painel do hotel diz qual é a bandeira dele;
  - o `PUT /api/v1/politicas` aceita `?hotelId=`, para a resposta continuar no hotel escolhido. Antes, gravar no grupo devolvia a configuração sem o hotel.
- **Limite:** a bandeira se configura pelo hotel escolhido, e uma bandeira sem hotel não tem tela. As telas das políticas do Intelligence são do módulo; o motor dele já lê a bandeira (`fonte.ts`).
- **Catálogo:** as chaves novas nos quatro idiomas, com os nomes que o catálogo já usa para a bandeira: marca em espanhol, enseigne em francês e brand em inglês.
- **Verificação:**
  - no local, lint, typecheck e testes passaram. Testes novos: a resolução com a bandeira no domínio, e a leitura e a gravação na aplicação, com as portas em memória;
  - na CI, com o Supabase do runner: o caso novo de `packages/db/test/configuracao.test.ts` (bandeira acima do grupo e abaixo do hotel, o hotel sem bandeira, a porta da triagem, a auditoria, a bandeira de outro tenant e o gerente);
  - a tela não foi vista no navegador.

## Ponto de retomada (13/10/2026)

- **Feito:**
  - o glossário em proposta;
  - o PR do SLA preparado (migração 0043, pgTAP 035 e ADR-042), na branch e sem PR.
- **Próximo:**
  1. quando o #203 for mergeado: trazer a `main`, resolver os quatro conflitos, rodar lint, typecheck e testes, conferir no GitHub que nenhum PR de zona protegida está aberto e abrir o PR "1c: calendário de SLA, migração 0043 (ADR-042) — zona protegida";
  2. o nível bandeira (item 2) está no PR "1c: nível bandeira nas políticas", à espera da CI e do merge do Cesar;
  3. em seguida, fora da zona protegida: o domínio do calendário (`calcularPrazo`, `horasDeRelogioEntre`, as políticas `chamado.sla` e `hotel.horario_atendimento` e `MOTIVOS_DE_PAUSA`), que não depende da migração.
- **Esperando:**
  - o Kaio, nos quatro pontos do glossário;
  - o Cesar, nas decisões 5 a 14 de `docs/referencia/propostas-desenho-1c.md` (arrendado, indicadores e auditoria), quando chegar a vez de cada item.
