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
- **Situação:**
  - a branch foi enviada sem PR enquanto o #203 (PV1, zona protegida) esteve aberto;
  - depois do merge do #203, em 13/10/2026, a `main` entrou na branch, com os conflitos resolvidos (no `docs/02`, no `docs/03`, com o ADR-042 depois do ADR-040, no meta-teste 28 e no diário);
  - conferido no GitHub que nenhum PR de zona protegida estava aberto, o PR foi aberto como "1c: calendário de SLA, migração 0043 (ADR-042) — zona protegida".

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

## Domínio do calendário de SLA (13/10/2026)

O cálculo do ADR-042, só no domínio e no contrato. PR fora da zona protegida, sem migração e sem gravar nada ainda, na branch `claude/1c-sla-dominio`. A gravação dos prazos na abertura, na triagem e na retomada vem depois do merge da 0043, porque precisa das colunas novas.
- **`packages/dominio/src/sla.ts`:**
  - as políticas `chamado.sla` (`SLA_PADRAO`) e `hotel.horario_atendimento` (`HORARIO_PADRAO`), com o formato validado. As horas vão em quartos de hora, até 90 dias, com o atendimento até a solução. O horário vai por dia da semana, com até 4 intervalos em ordem e sem sobreposição, e ao menos um na semana;
  - `regraDeSla`: a linha da prioridade pelo id, senão pela chave padrão, senão pelo peso mais próximo (no empate, a de peso maior). A categoria sobrepõe o que tem;
  - `pausaParaORelogio`;
  - `datasSemAtendimento`, com o feriado, o ponto facultativo só ligado, a observância nunca e o anual do hotel em cada ano;
  - `calcularPrazo`, `tempoDeRelogioEntre` e `horasDeRelogioEntre`, no fuso do hotel pela `Intl`. Na hora que não existe, vale a depois do salto; na que existe duas vezes, a primeira;
  - `prazoNaRetomada`: a pausa que começou com o prazo já vencido não muda nada;
  - `MOTIVOS_DE_PAUSA` e `TIPOS_DE_FERIADO_OFICIAL`;
  - o prefixo `hotel.` entrou nos do núcleo.
- **Contrato:** os formatos das duas políticas e `MOTIVOS_DE_PAUSA_API`, com a paridade conferida em `tests/contratos-dominio.test.ts`, por amostras.
- **Fica para o PR da 0043 ou o seguinte:** `MOTIVOS_DE_PAUSA` em `tests/valores-canonicos-banco.test.ts`, que lê o check da migração. O teste entra no PR que for mergeado por último, entre este e o da 0043.
- **Verificação:**
  - no local, lint, typecheck e testes passaram. Os 17 testes novos (`packages/dominio/test/sla.test.ts`) cobrem o fim de semana, o feriado de 12/10, o almoço, o prazo no fim do intervalo, Manaus e Noronha, o horário de verão real de São Paulo em 04/11/2018 (o dia de 23 h), a retomada nos dois relógios e a pausa com o prazo vencido;
  - na CI: a lista de chaves de `packages/db/test/configuracao.test.ts`.

## Decisões 5 a 14 do desenho da 1c (13/10/2026)

O Cesar respondeu no chat às decisões 5 a 14 de `docs/referencia/propostas-desenho-1c.md`. A tabela está no `docs/13` ("Decisões do desenho da 1c"). O que muda no desenho:
- **7 (ajuste):** a matriz do arrendado usa a categoria do próprio chamado (`app.chamado.categoria_id`, da 0043), e não a do ativo. A OS preventiva, que não tem chamado, continua com a categoria do ativo.
- **9 (condição):** a meta de tempo do painel é do agente da 1c, medida com o volume do teste de carga do agente do Kaio. O repositório ainda não tem esse teste nem esse volume: a meta e o volume vão ao Cesar e ao Kaio (seção seguinte).
- **10 e 11:** o glossário passou à segunda versão, com os indicadores fechados pelo Cesar. Continuam em proposta a conclusão do serviço e a preventiva atrasada, que esperam o Kaio, e o tempo até o aceite.
- **12:** "gestão" é o Admin do grupo, o Gestor CSC e o Gerente do hotel, este só no escopo do hotel dele, como a RLS da auditoria já faz.
- **14:** a correção do `docs/13` sobre o Implantador e o texto do ADR-021 entram no PR da auditoria geral.

## Pedido ao agente do Kaio: volume do teste de carga (13/10/2026)

A decisão 9 do Cesar mede a meta de tempo do painel de indicadores com o volume do teste de carga do agente do Kaio. Não achei esse teste no repositório. Pedido:
1. Existe um teste de carga, ou um volume de referência, do Intelligence? Se existe, onde está, e com quantos hotéis, UHs, ativos, chamados, OS e transições, em quantos meses?
2. Se não existe, proponho o volume abaixo, para os dois módulos medirem com o mesmo, e que o Kaio confirme ou ajuste:
   - 40 hotéis, 6.000 UHs e 20.000 ativos;
   - 24 meses de histórico, com 150 chamados por hotel por mês (144 mil chamados), uma OS por chamado e cerca de 5 transições por OS (720 mil transições);
   - 10% dos chamados com UH indisponível e 5% com parada do ativo.

## Monitor de SLA, meta do painel e auditoria adiantada (13/10/2026)

O Cesar aprovou no chat, conforme as recomendações ("aprovado conforme recomendado"):
- as cinco decisões do monitor de SLA, M1 a M5;
- a meta de tempo do painel (decisão 9).

A tabela está no `docs/13`. Ele também autorizou adiantar a auditoria geral ("Pode sim").

**Plano:**
- **Auditoria geral, primeiro, fora da zona protegida:** a tela, a API e o CSV. Funciona sem os índices novos, só mais devagar no volume grande.
- **Um PR de zona protegida só, na vez da 1c depois da PV2:**
  - a tabela `app.sla_alerta` e a política do escalonamento (ADR do monitor);
  - os dois índices da auditoria;
  - a correção do ADR-021 e do `docs/13` sobre o Implantador (decisão 14).

## Auditoria geral (13/10/2026)

Item 7 da ordem, adiantado com a autorização do Cesar ("Pode sim"). PR fora da zona protegida, sem migração, na branch `claude/1c-auditoria-geral`. Segue o item 4 de `docs/referencia/propostas-desenho-1c.md`, com as decisões 12 a 14.
- **Domínio** (`packages/dominio/src/auditoria-geral.ts`):
  - **quem tem a tela:** `podeVerAuditoriaGeral`, com a gestão vigente: o Admin do grupo, o Gestor CSC e o Gerente do hotel;
  - **o período:** até 92 dias, com o fim depois do início;
  - **o cursor:** `em~id`, com o `em` exato em UTC e microssegundos. O `Date` do JavaScript perde os microssegundos, e o cursor pularia ou repetiria linhas do mesmo milissegundo;
  - **as mudanças:** saem como no histórico por registro, sem o detalhe da ativação bloqueada;
  - **`ENTIDADES_DA_AUDITORIA`:** as 28 entidades que a aplicação grava na auditoria.
- **Aplicação:** a porta e o caso de uso, com uma linha a mais para saber se há página seguinte. A tela pede 50 por página e a exportação pede 1.000; as referências vêm pela porta do histórico.
- **Banco** (`packages/db/src/auditoria-geral.ts`):
  - a RLS de `app.auditoria` decide o que cada um lê, sem policy nova;
  - a consulta fica com os hotéis da gestão, por `authz.hoteis_com_papel`, como em `consultas.ts` (ADR-017). Assim, o Gerente que também é Técnico de outro hotel não vê esse outro hotel aqui (decisão 12);
  - as linhas sem hotel ficam só pela RLS.
- **API:** `GET /api/v1/auditoria/geral`, no OpenAPI, com 403 `auditoria_sem_permissao`, 422 `auditoria_periodo_invalido` (com `maximoDias`) e 422 `auditoria_cursor_invalido`.
- **Tela** (`/admin/auditoria`, no menu de configuração):
  - os filtros, a tabela, o "carregar mais" e o detalhe do antes e depois na linha, com a tradução do histórico (o formatador de valores do `HistoricoDoRegistro` virou fábrica, para a exportação);
  - a lista de ações e de pessoas do filtro é a das linhas já carregadas.
- **CSV no navegador:**
  - a resposta de uma função da Vercel tem limite de tamanho (4,5 MB), e 50 mil linhas passariam dele. Por isso, a exportação pede páginas de 1.000 e junta o arquivo no navegador, com o texto do mesmo catálogo da tela;
  - o arquivo leva o BOM, o separador pelo formato regional de quem exporta (`separadorDeCsv`, em `@hubkeep/i18n`) e as linhas em CRLF;
  - o texto que começa como fórmula ganha um apóstrofo;
  - acima de 50 mil linhas, a exportação para e pede menos período ou mais filtros.
- **Catálogo:** o nome das 28 entidades, as ações comuns das entidades sem histórico próprio, os textos da tela e os três erros, nos quatro idiomas.
- **`docs/13`:** corrigido sobre o Implantador (decisão 14). O texto do ADR-021 entra no próximo PR de zona protegida da 1c, junto com a tabela do monitor e os índices da auditoria.
- **Verificação:**
  - no local, lint, typecheck e testes passaram. Testes novos:
    - o domínio (`auditoria-geral.test.ts`);
    - a aplicação, com as portas em memória;
    - a paridade das entidades com os repositórios, a API e o catálogo (`tests/auditoria-entidades.test.ts`);
    - a tela nos quatro idiomas e o CSV;
    - o separador do CSV;
  - na CI, com o Supabase do runner: `packages/db/test/auditoria-geral.test.ts`. Ele cobre o Gerente que também é Técnico, a auditoria sem hotel, o Técnico sem a tela, os filtros e o cursor no mesmo milissegundo;
  - a tela não foi vista no navegador.

## Ponto de retomada (13/10/2026)

- **Feito e mergeado pelo Cesar:**
  - o nível bandeira (#204);
  - a migração 0043 e o ADR-042 (#206);
  - o domínio do calendário de SLA e o glossário, na segunda versão (#205).
- **Aberto:** a auditoria geral, no PR "1c: auditoria geral", fora da zona protegida.
- **Próximo:**
  1. depois do `db push` da 0043, que é do Cesar, com a conferência do dev pelo agente da 1b:
     - a porta `FeriadosOficiais` com a `date-holidays`;
     - a gravação dos prazos na abertura, na triagem e na retomada;
     - o motivo da pausa no PWA, com o catálogo;
  2. o monitor de SLA (M1 a M5), com o PR de zona protegida na vez da 1c, depois da PV2. O PR leva:
     - a tabela `app.sla_alerta` e o ADR do monitor;
     - os dois índices da auditoria;
     - o texto do ADR-021 (decisão 14);
  3. depois do monitor, o job do aceite automático (M5).
- **Esperando:** o Kaio, nos quatro pontos do glossário e no volume do teste de carga.

## Ordem da fila e prazos de SLA: aviso de área compartilhada (13/10/2026)

Decisão do Cesar no chat ("Cesar aqui", 13/10/2026), depois do merge do #211:
- **Ordem da fila de zona protegida:**
  1. o PR de visibilidade das telas do agente do Kaio;
  2. a próxima migração da 1c (o monitor de SLA);
  3. a PV2 da 1b.
- **Agora:** seguir com o próximo item da 1c e conferir no GitHub, antes de abrir um PR de zona protegida, se já é a vez da 1c.
- **Dev:** o diário da 1b registra que a 0042 e a 0043 já estão no dev, conferidas pelo Cesar.

**Aviso de área compartilhada com a 1b:** a ligação dos prazos de SLA (item 3 da ordem, segunda parte do ADR-042) mexe no chamado (abertura e triagem), na OS (pausa e retomada), no `packages/dominio` (`sla.ts` e `chamados.ts`) e nos catálogos. Vai em dois PRs fora da zona protegida, na ordem abaixo, cada um com a `main` atualizada antes de abrir:
1. **"1c: prazos de SLA na abertura e na triagem":** a porta `FeriadosOficiais`, com a `date-holidays` fixada no servidor do web; a categoria, os prazos e a cópia da `chamado.sla` e do horário na abertura (web e operação offline); o recálculo na triagem quando muda a prioridade;
2. **"1c: motivo da pausa e prazo na retomada":** o motivo na pausa da OS (web e PWA), o prazo refeito e o tempo pausado na retomada, com o catálogo dos motivos.

Depois, as telas: os feriados do hotel, a política de SLA, a troca da categoria na triagem e os prazos na ficha.

## Prazos de SLA na abertura e na triagem (13/10/2026)

Primeiro dos dois PRs do aviso acima, na branch `claude/1c-sla-prazos`, fora da zona protegida e sem migração.
- **Domínio** (`sla.ts`, `chamados.ts`):
  - a cópia da `chamado.sla` e do horário vai em `politica_aplicada`, e `slaDaCopia` a lê. O chamado de antes da 0043 não tem cópia, e nada o recalcula;
  - `regiaoDoHotel`: o país e a subdivisão do hotel, com o nulo herdando do tenant. A subdivisão do tenant só vale no país dele;
  - `calendarioDeSla` e `anosDoCalendario`: os anos vão do anterior até o limite da procura;
  - `prazosDoChamado`: o tempo já pausado estende a solução;
  - `prazosNoRecalculo`: o prazo de atendimento fica o gravado depois da primeira OS.
- **Aplicação:**
  - a porta `FeriadosOficiais` e os dados do calendário do hotel;
  - a abertura (web e offline) grava a categoria do ativo e os dois prazos;
  - `triar` com prioridade e `priorizar` refazem os prazos pela cópia, da abertura, com o calendário de agora.
- **Banco:** o fuso, a região e os feriados ativos do hotel, lidos pela RLS de quem pede. A auditoria da triagem guarda os prazos de antes e de depois.
- **Web:**
  - a `date-holidays` 3.37.0 fixada, só no servidor, com cache por (país, estado, ano);
  - **falha nos dados da biblioteca:** na 3.37.0, São Paulo e o Rio de Janeiro deixam de fora o 20 de novembro, que é nacional. A ligação junta os feriados do país com os do estado, e o teste de regressão confere o Brasil e quatro estados (SP, PR, RJ, RS) em 2026 e em 2027.
- **Contrato:** o `ChamadoApi` leva a categoria, os prazos e o tempo pausado.
- **Verificação:**
  - no local, o lint, o typecheck e os testes passaram;
  - o `packages/db/test/sla-prazos.test.ts` roda só na CI. Ele cobre a abertura pelo Solicitante (com o feriado do hotel lido pela RLS), a cópia, a triagem que refaz os prazos pela cópia depois de a política mudar, a auditoria e o prazo de atendimento depois da OS;
  - os testes do banco que montam a abertura e a triagem recebem `semFeriadosOficiais`.

**Pendências para o Cesar:**
1. **Licença dos dados da `date-holidays`:** o arquivo `LICENSE` do pacote diz **CC BY-SA 3.0** ("compartilha igual"), e não CC BY 3.0, como está no ADR-042. O campo de licença do npm diz `(ISC AND CC-BY-3.0)`, e daí veio a conferência do ADR. O servidor só lê as datas para calcular prazos e não altera nem redistribui os dados. O aviso de terceiros (`AVISOS-DE-TERCEIROS.md`) já leva a licença certa e as fontes do Brasil. A correção do texto do ADR-042 depende da sua decisão e entra no próximo PR de zona protegida da 1c. O `js-yaml` 5 e a `argparse` são Python-2.0, licença permissiva.
2. **Dependabot:** o ADR-042 diz que o Dependabot propõe as versões novas da biblioteca. Hoje o `dependabot.yml` só cobre as actions. Para incluir o npm (só a `date-holidays`, ou o repositório inteiro), é preciso mudar o `dependabot.yml`, que é zona protegida. Até lá, a atualização é deliberada, com o teste de regressão.

**A `main` vermelha depois do #210 e do #211:** no a6b761b, o "CI" falhou no `tests/auditoria-entidades.test.ts` (da 1c): o #210 passou a gravar na auditoria `checklist_modelo` e `os_checklist`, fora da lista. O "banco" falhou na limpeza do `apps/web/test/demonstracao/semear.test.ts`. O agente da 1b já tem a correção das duas falhas na branch `claude/1b-main-vermelha-auditoria`, e a 1c não abre outra. O PR dos prazos abre depois do merge dessa correção, com a `main` juntada.

## Migração do monitor de SLA, pronta na branch (13/10/2026)

Na branch `claude/1c-monitor-sla`, enviada, ainda **sem PR**. Pela ordem do Cesar, ela espera o merge do #212 (o PR de visibilidade das telas do Kaio, aberto); depois, a PV2 da 1b.
- **Migração 0044** (`20261013150000_monitor_sla.sql`):
  - a tabela `app.sla_alerta`, só de inserção, gravada pelo `hk_worker` no tenant do job e lida pela gestão;
  - um aviso por chamado, tipo e prazo, com FK composta para o hotel e o chamado;
  - os dois índices da auditoria geral, na ordem do cursor.
- **Numeração:** a PV2 da 1b já se numerou 0045, com o pgTAP 036. Por isso a 1c fica com a 0044 e o pgTAP 037. O horário do arquivo (15h) vem antes do da PV2 (20h), para a ordem de aplicação bater com a do merge.
- **pgTAP 037:** os seis casos mínimos, os privilégios, o worker e os índices. A tabela entrou nos meta-testes 28 e 32, e os tipos do Kysely, à mão.
- **ADR-043** (aguarda o "aprovo" do Cesar) e a correção do texto do ADR-021: o Implantador grava e não lê a auditoria sem hotel (decisão 14).
- **Antes de abrir:** juntar a `main`, conferir no GitHub que não há outro PR de zona protegida aberto e que o #212 já entrou.

## Ponto de retomada (13/10/2026)

- **`main`:** em 38bf55f, com a correção da `main` vermelha (#213, da 1b). **Dev:** a 0042 e a 0043 conferidas pelo Cesar (diário da 1b).
- **PRs abertos da 1c:**
  - o [#215](https://github.com/cesarcoutohubtech/hubkeep/pull/215), dos prazos de SLA na abertura e na triagem, fora da zona protegida. Na primeira rodada, o pgTAP passou, e a integração do `packages/db` falhou no teste novo, com um código QR fora do formato do banco. A correção já está no PR (23bfc0c). Quando ficar verde, espera o merge do Cesar.
- **Trabalho enviado sem PR:** a branch `claude/1c-monitor-sla`, com a migração 0044 e o ADR-043. Espera o merge do #212.
- **Decisões pendentes do Cesar:**
  1. a licença dos dados da `date-holidays` (CC BY-SA 3.0, e não CC BY 3.0) e a correção do texto do ADR-042;
  2. o Dependabot para o npm (o `dependabot.yml` é zona protegida);
  3. o "aprovo" do texto do ADR-043.
- **Esperando o Kaio:** os quatro pontos do glossário e o volume do teste de carga.
- **Próxima tarefa:** o motivo da pausa e o prazo na retomada (o segundo PR do aviso de área compartilhada), numa branch nova a partir da `main` depois do merge do #215. Primeiro passo:
  - acrescentar `motivo` opcional ao `os.pausar` no contrato da sincronização;
  - calcular, em `prepararAcao` da execução, se a pausa para o relógio, pela cópia do SLA do chamado;
  - na retomada, refazer o prazo de solução e o tempo pausado com `prazoNaRetomada`;
  - acrescentar o seletor de motivo no PWA e os nomes dos motivos no catálogo, nos quatro idiomas.

## Motivo da pausa e prazo na retomada (13/10/2026)

Segundo PR do aviso de área compartilhada, na branch `claude/1c-sla-pausa`, feita a partir da branch do #215 e ainda **sem PR**. O PR abre depois do merge do #215, com a `main` juntada e a base na `main`. Fora da zona protegida e sem migração: usa a coluna `motivo_pausa` da 0043.
- **Domínio:**
  - `slaDoChamado`: a regra de SLA do chamado, tirada da cópia;
  - `pausaDoChamadoParaORelogio`: a pausa para o relógio só com cópia, prazo de solução, a categoria com a pausa ligada e o motivo na lista.
- **Contrato:** o `os.pausar` da sincronização aceita `motivo` (opcional, da lista do domínio).
- **Aplicação** (`execucao.ts`):
  - a pausa leva o motivo e diz se parou o relógio;
  - a retomada lê a última pausa da OS e, se ela parou o relógio, refaz o prazo de solução com `prazoNaRetomada`, no calendário do hotel. O tempo parado vai em segundos;
  - as prioridades e os feriados entram como dependências opcionais, só lidas na pausa com motivo.
- **Banco:**
  - a transição grava o motivo;
  - na retomada, a mesma operação grava no chamado o prazo novo e soma o tempo parado, com a versão do chamado conferida;
  - a auditoria da OS leva o motivo, se a pausa parou o relógio, e o prazo de antes e o de depois.
- **PWA:** "Pausar" abre a pergunta do motivo, com os cinco motivos do domínio, e o motivo vai na operação offline.
- **Catálogo:**
  - `os.motivo_pausa`, que o histórico do web também usa;
  - a pergunta do PWA;
  - os campos novos do histórico, nos quatro idiomas.
- **Verificação:**
  - no local, lint, typecheck e testes passaram;
  - o cenário novo do `packages/db/test/sla-prazos.test.ts` roda só na CI. Ele cobre a pausa com "aguardando peça", que estende a solução em 2 h e soma 7.200 s, com o motivo na transição e o antes e o depois na auditoria, e o "fim de turno", que não muda nada.

## Monitor de SLA: domínio, worker e cron (13/10/2026)

Decisão do Cesar no chat ("Cesar aqui. Prossiga", 13/10/2026). Item 4 da ordem, depois da migração 0044 (#217, com o `db push` feito pelo Cesar). PR fora da zona protegida, sem migração, na branch `claude/1c-monitor-sla-cron`.

**Aviso de área compartilhada com a 1b:** mexe em políticas (a chave nova `chamado.escalonamento` em `packages/dominio/src/politicas.ts` e no contrato), no `packages/dominio` (`monitor-sla.ts`) e no `packages/db/src/adaptadores.ts`. As leituras das políticas e do calendário do hotel saíram para `packages/db/src/leituras-do-hotel.ts`, para o repositório do worker usar as mesmas.

- **Domínio** (`monitor-sla.ts`):
  - os quatro tipos de aviso, conferidos com o check da 0044 em `tests/valores-canonicos-banco.test.ts`;
  - a política `chamado.escalonamento`: o percentual de 50 a 95, com padrão de 80, e os destinatários de cada nível, da lista do domínio;
  - `avisosDeSla`: o vencido no prazo e o em risco quando o tempo de relógio que falta chega ao complemento do percentual. O atendimento conta até a primeira OS, e a solução até o serviço concluído; o relógio parado pela pausa congela a solução.
- **Aplicação:**
  - a porta `PortaMonitorDeSla`;
  - `criarMonitorDeSla`, por tenant. A regra sai da cópia do chamado, e o percentual e os destinatários, da política do hotel. O calendário vale por hotel e cópia, e o aviso já emitido para o prazo não sai de novo.
- **Banco:**
  - o repositório `repositorios/monitor-sla.ts`, na unit of work do `hk_worker`. Ele lê os chamados em curso com prazo, a OS que já existiu, a pausa em curso com o motivo e os avisos já emitidos;
  - o aviso grava com `on conflict do nothing` e só publica o evento `chamado.sla_alerta` quando é novo. O aviso não vai para a auditoria.
- **Web:** `monitorarSlaDoTenant` na composição, a rota `/api/cron/sla` com a tarefa e o cron de volta ao `vercel.json`, a cada 5 minutos (ADR-007).
- **Contrato:** `EscalonamentoDeSlaApi` e `DESTINATARIOS_DO_AVISO_API`, com as amostras em `tests/contratos-dominio.test.ts`.
- **Verificação:**
  - no local, lint, typecheck e testes passaram. Testes novos:
    - o domínio, nos relógios 24x7 e de atendimento;
    - a aplicação, com as portas em memória;
  - só na CI: `packages/db/test/monitor-sla.test.ts`. Ele cobre o aviso e o evento, a segunda rodada sem repetir, o prazo refeito, a pausa que congela e o outro tenant.
- **Fica para depois:** o painel dos avisos e o selo da ficha (M4), e o aceite automático (M5), cada um num PR próprio.

**Observação para o agente do Kaio:** na suíte inteira, no local, o `apps/web/test/demonstracao/historico-inteligencia.test.ts` (#221) estourou o tempo padrão de 5 s uma vez. Sozinho, passou. Pode valer um `timeout` maior nesse teste.

## Glossário de métricas: quem rascunha (13/10/2026)

Decisão do Cesar no chat ("Cesar aqui", 13/10/2026):
- **o rascunho do glossário único** (`docs/referencia/glossario-metricas.md`) é do agente do Kaio, na atividade 4 dele;
- **o papel da 1c:** revisar e alinhar com os indicadores do painel quando o agente do Kaio pedir, pelo diário;
- **sem versão paralela:** a 1c não escreve outra versão;
- **as definições do painel da 1c** seguem o glossário depois da aprovação do Cesar.

**O que muda para a 1c:**
- a 1c não edita mais o `glossario-metricas.md`;
- os quatro pontos que a 1c tinha pedido ao Kaio (seção "Pedido ao agente do Kaio" acima) ficam como contribuição para o rascunho dele, e não como pendência da 1c;
- o painel de indicadores (item 8 da ordem) espera o glossário aprovado.
