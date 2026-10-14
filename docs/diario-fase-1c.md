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

## Decisões do Cesar: licença, Dependabot e ADR-043 (13/10/2026)

Decisões do Cesar no chat ("Cesar aqui", 13/10/2026):
1. **Licença dos feriados:** aceita a `date-holidays`. O ADR-042 é corrigido no próximo PR de zona protegida da 1c, com quatro pontos:
   - os dados são CC BY-SA 3.0, e o código tem a licença própria;
   - a atribuição está no `AVISOS-DE-TERCEIROS.md`;
   - o servidor só consulta as datas, sem redistribuir o conjunto de dados;
   - antes de usar a biblioteca para outros países, a licença passa por revisão jurídica.

   Ele também pediu uma issue no repositório da biblioteca sobre o 20 de novembro em SP e no RJ.
2. **Dependabot:** o ecossistema npm entra no `dependabot.yml`, no mesmo PR de zona protegida, com três regras:
   - as atualizações de versão vêm agrupadas num PR só por semana;
   - há limite de PRs abertos;
   - as de segurança ficam sempre separadas.
3. **ADR-043:** "Aprovo o ADR-043". Ele também rodou o `db push` da 0044. O #219 ele mergeia quando a CI ficar verde.

**Feito:** na branch `claude/1c-adr-licenca-dependabot`, com três mudanças:
- a correção da licença no ADR-042;
- o status do ADR-043 ("aprovado", com a data e onde foi escrito);
- o npm no `dependabot.yml`, com o grupo semanal só para as atualizações de versão (`applies-to: version-updates`) e o limite de 5 PRs abertos. As de segurança ficam de fora do grupo e saem separadas.

O PR abre na vez da 1c, depois da PV2.

**Issue na `date-holidays`:** o GitHub desta sessão só alcança o `hubkeep`, então não dá para abrir issue no repositório da biblioteca (`commenthol/date-holidays`). O texto pronto, em inglês, foi entregue ao Cesar no chat. A causa está nos dados: no `data/countries/BR.yaml`, a entrada estadual do 20 de novembro de SP e a do RJ terminam em 21/12/2023 e se sobrepõem à nacional.

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

## Feriados do hotel: API e tela (13/10/2026)

Decisão do Cesar no chat ("Cesar aqui. Prossiga", 13/10/2026). Este PR é a parte de telas do item 3 (SLA) que não depende do #224. Fica fora da zona protegida, sem migração, na branch `claude/1c-feriados-hotel`. A tabela `app.feriado_hotel` está na `main` desde a 0043.

**Aviso de área compartilhada com a 1b:** mexe no `packages/dominio` (`feriados-do-hotel.ts` e a lista de entidades da auditoria geral), no `packages/db/src/adaptadores.ts`, no OpenAPI e nos catálogos.

- **Domínio:**
  - `podeCadastrarFeriados`, com os papéis da policy da 0043: o Admin do grupo, o Gestor CSC, o Implantador e o Gerente do hotel, no escopo deles;
  - o nome, de 1 a 120 caracteres;
  - a data, um dia que existe, de 2000 a 2100.
- **Aplicação:** listar (com `podeCadastrar`, para a tela), cadastrar, alterar o nome e a marca "repete todo ano", desativar e reativar. A data não muda: para trocar, desativa e cadastra outro.
- **Banco:**
  - o repositório, com auditoria (`feriado_hotel`, que também entra na auditoria geral);
  - o 409 `feriado_data_repetida`, vindo do índice de um feriado ativo por data.
- **API:** `GET` e `POST /api/v1/hoteis/{id}/feriados`, `PUT /api/v1/feriados/{id}` e `POST .../desativacao` e `.../reativacao`, no OpenAPI.
- **Tela:** `/admin/feriados`, no menu de configuração:
  - a escolha do hotel e a lista, com a data longa;
  - os formulários, só para quem pode cadastrar;
  - uma nota de que os feriados nacionais e estaduais já entram sozinhos e de que o prazo já calculado não muda.
- **Catálogo:** os textos e os cinco erros, nos quatro idiomas.
- **Verificação:**
  - no local, lint, typecheck e testes passaram. Testes novos: o domínio, a aplicação com as portas em memória e a tela;
  - só na CI: `packages/db/test/feriados-do-hotel.test.ts`, com a RLS (o Técnico e o Gerente de outro hotel), a data repetida e a auditoria.

## Prazos de SLA na ficha do chamado (13/10/2026)

**Aviso de área compartilhada (chamado):** a 1c vai mexer na ficha do chamado no web (`ChamadoEmDetalhe`, em `apps/web/src/cliente/corretiva.tsx`) e no catálogo. Só acrescenta linhas no painel do chamado; não muda contrato, caso de uso nem banco. Branch `claude/1c-prazos-na-ficha`, a partir da `main`.
- A ficha mostra o prazo de atendimento e o de solução, que a API já devolve desde o #215, e o tempo em que pausas pararam o relógio, quando houver.
- O chamado aberto antes dos prazos (prazos nulos) não mostra as linhas.
- O selo de "em risco" e "vencido" fica para o M4, depois do merge do #224, porque vem dos avisos do monitor.

## Revisão do glossário de métricas, versão 3 (13/10/2026)

Resposta ao "Pedido de revisão ao agente da 1c" (`docs/diario-intelligence.md`, atividade 4). A 1c não escreveu outra versão do glossário (regra do Cesar de 13/10/2026): os ajustes vão aqui, para o agente do Kaio levar ao rascunho. As definições do painel da 1c seguem o glossário depois da aprovação do Cesar.

**1. Termos fechados da versão 2.** Continuam iguais: comparei as seções da versão 2 (`main` antes do #225) com as da versão 3, de "Regras" a "Indicadores do painel da 1c", e não há diferença de texto.

**2. Levantamento.** Três correções e dois acréscimos, todos do lado do núcleo:
- **Abertura:** desde o #215, o `criado_em` do chamado é gravado pela aplicação, com o relógio dela (`abertoEm`, em `repositorios/chamados.ts`), e não pelo `default now()` do banco. A mudança veio para o recálculo dos prazos usar o mesmo instante da abertura. Proposta de texto: "Coluna `app.chamado.criado_em`, gravada pela aplicação na abertura".
- **Prazos e tempo pausado:** faltam no levantamento:
  - `calendarioDeSla`, `slaDaCopia` e `prazoNaRetomada` (`packages/dominio/src/sla.ts`);
  - `montarCalendarioDeSla` (`packages/aplicacao/src/casos-de-uso/calendario-sla.ts`), que junta o horário do hotel, os feriados oficiais (porta `FeriadosOficiais`, biblioteca date-holidays) e os feriados do hotel (`app.feriado_hotel`);
  - quem chama: abertura e triagem (`casos-de-uso/chamados.ts` e `triagem.ts`) e a retomada da OS (`casos-de-uso/execucao.ts`, que grava o `pausado_segundos`).
- **Avisos do monitor (ADR-043, #224 na `main`):** o termo ainda não está no glossário e já tem código. Proposta de dois termos do SLA, só do núcleo:
  - **Prazo em risco:** o prazo ainda não passou, e o tempo de relógio que falta é no máximo o complemento do percentual da política `chamado.escalonamento` (padrão de 80%), sobre as horas da regra. O atendimento conta até a primeira OS; a solução, até a conclusão do serviço, e não conta com o relógio parado.
  - **Prazo vencido:** o prazo passou sem a OS gerada (atendimento) ou sem a conclusão do serviço (solução).
  - Função: `avisosDeSla` (`packages/dominio/src/monitor-sla.ts`); quem chama: o cron `/api/cron/sla`, pelo `criarMonitorDeSla`.
- **Divergência pequena, minha, e corrijo eu:** o "dentro do prazo" fechado conta a conclusão no instante do prazo como dentro ("inclusive"), mas o `avisosDeSla` dá o vencido no mesmo instante (`agora >= prazo`). O monitor passa a dar o vencido só depois do prazo, no PR do M4 (painel dos avisos), e o glossário não muda.
- **Painel da 1c:** confirmo "sem código" para os indicadores. As funções vão para `packages/dominio`, com os nomes daqui, no item 8 da 1c, depois da aprovação.

**3. Divergências que mexem em termo de base do painel:**
- **a (o dia):** a premissa precisa de correção. O fuso que a regra 5 manda usar é o do hotel, e ele já existe: `app.hotel.fuso`, `not null` desde a fundação, que o SLA já usa. Não falta coluna de fuso no tenant para cumprir a regra. Proposta: o Intelligence passa a contar o dia no fuso de cada hotel com a coluna que existe, como versão nova da fórmula, sem recalcular o que já foi gravado (ADR-036). O registro de exceção temporária só vale até esse PR, e não até uma coluna nova. Quem decide continua sendo o Cesar e o Kaio.
- **b (chamado cancelado com OS):** a 1c concorda com a proposta: o chamado cancelado fica fora em qualquer caso. Para o painel, a regra já é essa: o backlog, o % de SLA, o MTTR e a razão preventiva/corretiva tiram o cancelado. Se o Intelligence ficar com a regra dele, o termo precisa de outro nome (regra 1), porque os números da reincidência e os do painel não bateriam para o mesmo hotel.
- **d (custo informado):** a 1c concorda com o termo de base, com um ajuste na cobertura. O custo é informado no aceite (`repositorios/aceite.ts`), e não na conclusão. Com a cobertura sobre as concluídas, a OS concluída e ainda sem aceite conta como "sem custo", e a cobertura cai sem ninguém ter deixado de informar. Proposta: a soma e a cobertura sobre as corretivas **aceitas** no período, e o "custo vazio não conta como zero" fica. O painel da 1c não tem indicador de custo na decisão 10; se entrar, usa este termo.

**4. Resposta aos quatro pontos.** A 1c aceita as quatro respostas.
- **Ponto 1:** o PR que leva `conclusaoEReaberturas` e o custo informado para `packages/dominio` é do agente do Kaio, com o aviso de área compartilhada no diário dele, como ele escreveu. O painel da 1c (item 8) só começa depois desse PR na `main`, para usar a função de lá, e não uma cópia.
- **Ponto 2:** registrado. A preventiva atrasada depende da PV3, da 1b, e a tolerância é a política `preventiva.tolerancia_dias`.

### Ponto de retomada (13/10/2026)
- **`main`:** com o #223 (licença dos feriados, ADR-043 aprovado e npm no Dependabot), o #224 (monitor de SLA) e o #225 (glossário, versão 3 em rascunho), verde. A 0044 já está no dev (db push do Cesar).
- **PRs da 1c esperando o merge do Cesar:**
  - #226: feriados do hotel;
  - #227: prazos na ficha do chamado;
  - o desta revisão.
  
  Os três mexem no fim deste diário. Depois de cada merge, a branch seguinte junta a `main`.
- **Esperando:** a resposta do agente do Kaio a esta revisão; as decisões das divergências; a aprovação do glossário pelo Cesar.
- **Próxima tarefa:** o M4, painel dos avisos de SLA (em risco e vencido) e selo na ficha do chamado, numa branch nova a partir da `main`. Primeiro passo: no `avisosDeSla`, o vencido só depois do prazo (`agora > prazo`), com o teste do instante exato. Depois, a leitura dos avisos abertos por hotel para o painel.

## Painel dos avisos de SLA e selo na ficha (M4, 13/10/2026)

**Aviso de área compartilhada (chamado):** a 1c acrescenta o selo dos avisos na ficha do chamado no web (`chamados/[id]/tela.tsx`, sem tocar no `corretiva.tsx`), duas rotas de leitura e textos no catálogo. Branch `claude/1c-avisos-sla`, a partir da `main` com o #224. Fora da zona protegida e sem migração: lê a `app.sla_alerta` da 0044.
- **Domínio** (`monitor-sla.ts`):
  - o vencido só depois do prazo, como o "dentro do prazo" do glossário (a correção prometida na revisão do glossário);
  - `avisosEmAberto`: no máximo um aviso por prazo, o mais forte. O vencido sai do próprio prazo, sem esperar o cron; o em risco, do aviso gravado para o prazo de agora, e o prazo refeito descarta os antigos. O atendimento conta até a primeira OS; a solução, até o serviço concluído;
  - com a pausa que parou o relógio, o prazo da solução está congelado até a retomada: vale só o aviso já gravado, como no monitor. A aplicação decide a pausa pela cópia do SLA e pelo motivo, com a mesma função do monitor;
  - `podeVerAvisosDeSla`: a gestão do hotel (Admin do grupo, Gestor CSC e Gerente do hotel), os papéis da policy da `app.sla_alerta`. Fora disso, `avisos_sla_fora_do_escopo`.
- **Aplicação:** `criarCasosDeUsoDeAvisosDeSla`, com `doHotel` (o painel, os vencidos primeiro e depois pelo prazo) e `doChamado` (o selo; vazio para quem não é da gestão, sem erro).
- **Banco:** `criarPortaAvisosDeSla` (`packages/db/src/avisos-de-sla.ts`), só leitura com `withContext`: os chamados em curso com prazo e os avisos gravados.
- **API:**
  - `GET /api/v1/hoteis/{id}/avisos-sla`, o painel;
  - `GET /api/v1/chamados/{id}/avisos-sla`, o selo;
  - no OpenAPI; tipos e níveis conferidos com o domínio.
- **Telas:**
  - `/sla` no menu de operação ("Avisos de SLA"), com a escolha do hotel e a lista com o link para a ficha;
  - na ficha, o selo no alto, relido depois de cada gravação;
  - vermelho para o vencido e âmbar para o em risco, sempre com o texto.
- **Catálogo:** o menu, o painel, o texto do aviso e o erro, nos quatro idiomas.
- **Fica para a comunicação (item 5):** o e-mail e o push, que consomem o evento `chamado.sla_alerta`.

## Aceite automático (M5): proposta para o Cesar (13/10/2026)

**Aviso de área compartilhada com a 1b (OS e chamado):** o M5 mexe no aceite da OS, no `packages/dominio` (`corretiva.ts`), no `packages/aplicacao` e no `packages/db`. Branch `claude/1c-aceite-automatico`, a partir da `main`.

**Por que precisa de decisão:** o M5 foi aprovado como "o job entra na rota de cron do SLA, num PR próprio" (ADR-043). Mas o job precisa gravar na OS e no chamado, e o `hk_worker` hoje só lê os dois. O ADR-043 diz que "o worker não ganha UPDATE no chamado". E a transição da OS (`app.os_transicao`) exige um usuário (`usuario_id not null`), que o job não tem. Então o M5 pede um ADR novo (ADR-044) e uma migração (0046, zona protegida). Proponho:

1. **Contagem dos dias:** N vezes 24 horas corridas desde a última conclusão da OS (a transição mais recente para `concluida`). Não usa o calendário de SLA: o hotel fechado no fim de semana não para a contagem. Cada reabertura recomeça a contagem na nova conclusão.
2. **Política resolvida por hotel:** `os.aceite_automatico` com a herança hotel → bandeira → grupo → padrão (desligado, 7 dias), como já está.
3. **Quando o job não aceita:** a OS segue aguardando aceite.
   - **Quem abriu também executa:** fica de fora até a resposta do cliente à pergunta 16 (`docs/referencia/perguntas-cliente.md`). Senão o técnico que acha e resolve o problema se aceita só esperando.
   - **Códigos obrigatórios** (`os.codigos_obrigatorios` ligada) e a OS sem os três códigos: fica de fora.
   - **Assinatura no aceite** (`os.assinatura_no_aceite` ligada): o hotel nunca tem aceite automático, porque não há quem assine. Proponho não barrar a combinação na configuração e mostrar uma nota na tela.
4. **Quem aparece como autor:** ninguém.
   - **Transição:** ação nova `aceitar_automatico`, com o usuário nulo. O check da tabela passa a exigir o usuário nulo nessa ação e só nela.
   - **Auditoria:** a auditoria já aceita usuário nulo para job.
   - **Evento:** o mesmo `os.aceita`, com `automatico: true`, para a comunicação e o Intelligence contarem a OS como aceita.
   - **Custo:** sem custo informado. No glossário, isso baixa a cobertura do custo; registro com o Kaio na revisão.
5. **Privilégios do `hk_worker` (migração 0046):**
   - UPDATE só nas colunas `estado`, `situacao_id`, `versao` e `atualizado_em` de `app.os` e `app.chamado`;
   - INSERT em `app.os_transicao`;
   - policies `worker_update` e `worker_insert` no tenant do job (`authz.tenant_sistema()`), como no `app.local`. A policy não confere o estado: a regra fica no domínio (regra 2);
   - pgTAP novo e as listas dos meta-testes.
6. **No cron:**
   - roda na mesma rota `/api/cron/sla`, a cada 5 minutos, depois do monitor;
   - cada tenant numa transação do `hk_worker`, com no máximo 200 OS por rodada;
   - a versão da OS é conferida: se alguém mexeu ao mesmo tempo, a OS fica para a rodada seguinte;
   - o chamado vai para o mesmo estado que teria num aceite manual (a mesma regra do domínio).
7. **Sem tela nova:**
   - a ficha da OS mostra "aceita automaticamente" na linha do tempo, pela ação da transição;
   - a tela de configuração ganha a nota da assinatura;
   - catálogo nos quatro idiomas.

**Ordem:** o ADR-044 e a 0046 vão num PR de zona protegida, quando for a vez da 1c (hoje nenhum PR de zona protegida está aberto). O código vai num PR seguinte, fora da zona. Enquanto espero a decisão, adianto na branch o domínio e a aplicação, com as portas em memória, sem abrir PR.

**Decisão:** Cesar aprovou no chat do agente da 1c, em 13/10/2026: "Cesar aqui. Aprovo o M5 conforme recomendado". O ADR-044 entra com o status "aguarda aprovação", porque o texto veio depois.

### Aceite automático: PR de zona protegida (ADR-044 e migração 0046)

Na branch `claude/1c-aceite-automatico`:
- o ADR-044 no `docs/03`;
- a migração 0046 (`20261013210000_aceite_automatico.sql`). A 0045 é a dos planos preventivos da 1b;
- o pgTAP `038`, com os testes `025` e `037` ajustados: antes, eles afirmavam que o worker não grava transição e não altera o chamado.

**Fila de zona protegida (13/10/2026):** o #231 do Dependabot está aberto e toca o `packages/auth-admin/package.json`, que é zona protegida. O PR da 0046 só abre depois que o #231 sair, e na vez que o Cesar der. A PV3 da 1b também quer a vez.

**Aviso à 1b (PV3, ADR-041):** a 0046 já faz parte do que a PV3 previa para `app.os_transicao`:
- dá ao `hk_worker` o INSERT e a policy `worker_insert`, no tenant do job e com o usuário nulo;
- deixa o `usuario_id` anulável.

O check `os_transicao_sem_autor_so_no_aceite_automatico` exige o usuário nulo na ação `aceitar_automatico` e só nela. A PV3 não precisa de GRANT nem de policy novos na transição. Basta trocar esse check por um que também aceite o nulo em `gerar`. Por exemplo: `case acao when 'aceitar_automatico' then usuario_id is null when 'gerar' then true else usuario_id is not null end`.

**Aviso ao Intelligence:** a transição do aceite automático tem a ação nova `aceitar_automatico`, de `concluida` para `aceita`, sem usuário. O evento continua `os.aceita`, com `automatico: true`. Quem conta aceites pela ação `aceitar` precisa contar as duas. A OS aceita automaticamente fica sem custo informado, o que pesa na cobertura do custo do glossário.

### ADR-044 aprovado e a vez da zona protegida (13/10/2026)

Cesar, no chat do agente da 1c: "Aprovo o ADR-044. Atualize o status." O status no `docs/03` passou a "aprovado". Na mesma mensagem, ele deu a vez da zona protegida à 1c para o PR da 0046.

**A `main` ficou vermelha.** O #231 do Dependabot foi mergeado (`bca63c1`) e subiu o TypeScript para a 7.0.2. O `typescript-eslint` 8.71 não suporta a 7.0, e o `pnpm lint` falha na `main`. A correção é o #236, fora da zona protegida: o TypeScript volta a `~6.0.3`, com o lockfile regenerado. Ela entra antes de qualquer outro merge. Até lá, o lint deste PR também falha, pelo mesmo motivo. Para o Dependabot não propor o TypeScript 7 de novo, falta um `ignore` no `.github/dependabot.yml`, que é zona protegida.

### Aceite automático: o código, pronto na branch (fora da zona protegida)

Na branch `claude/1c-aceite-automatico-m5`, feita a partir da `main` depois do merge do #237 (a 0046), sem empilhar. O PR abriu depois do `db push` da 0046.
- **Domínio:**
  - a ação `aceitar_automatico` na máquina da OS, sem papel que a faça, com o mesmo reflexo do aceite no chamado (aguardando aceite → concluído);
  - `decidirAceiteAutomatico`, com os motivos de não aceitar: desligado, fora do estado, antes do prazo, quem abriu e executa, faltam códigos, assinatura no aceite;
  - `aceiteAutomaticoEm` (N vezes 24 horas) e `quemAbriuExecuta`.
- **Aplicação:** a porta e o caso de uso por tenant, com as três políticas por hotel e no máximo 200 aceites por rodada. A leitura não tem limite, para a OS que nunca é aceita não tomar a vez das outras.
- **Banco:**
  - a sessão do `hk_worker` lê as OS corretivas concluídas, com a última conclusão e as equipes ativas de quem abriu;
  - o aceite trava a OS e o chamado na versão lida (`for update`) e grava a OS, a transição sem usuário, o reflexo no chamado, a auditoria e o evento `os.aceita` com `automatico: true`.
- **Web:**
  - a rota `/api/cron/sla` roda o aceite depois do monitor, numa transação própria;
  - a linha do tempo mostra "OS aceita automaticamente", sem autor;
  - a configuração mostra uma nota com as três exceções.
- **Catálogo:** a nota e a linha do tempo, nos quatro idiomas.
- **Contrato:** a ação nova em `ACOES_DA_OS_API`. O teste de valores canônicos confere a ação do check da 0046 contra o domínio.
- **Verificação:** no local, lint, typecheck e testes passaram. Só na CI: `packages/db/test/aceite-automatico.test.ts` (aceite, transição, auditoria, evento, as exceções e o outro tenant) e o pgTAP `038`.

### Pedido ao agente do Kaio: o tempo do teste do histórico de demonstração (13/10/2026)

O teste `cada cenário abre o insight esperado e termina no estado do roteiro; o ruído não abre nenhum` (`apps/web/test/demonstracao/historico-inteligencia.test.ts`) passou do limite padrão de 5 segundos do Vitest duas vezes:
- na CI do #237 (5,5 s), que passou depois de rodar o job de novo;
- no `pnpm test` local da branch do código do M5 (8,0 s), com os pacotes rodando em paralelo. Sozinho, o arquivo passa em 3,8 s.

O teste é do Intelligence e não muda com a 1c. Pedido: um `timeout` explícito nesse teste, ou um roteiro menor, para o tempo não depender da carga da máquina. A 1c não mexe no arquivo.

**Atendido** no #241, a pedido do Cesar no chat do agente do Kaio: um limite próprio de 20 s nos dois testes do roteiro (`docs/diario-intelligence.md`). Nada mais a pedir.

## Telas do SLA: as políticas (13/10/2026)

Decisão do Cesar no chat ("Cesar aqui. Merge e db push pronto. Continue", 13/10/2026). Esta é a parte de telas do item 3 (SLA) que ainda faltava. Vai em dois PRs fora da zona protegida, sem migração:
1. **Este PR:** a tela `/admin/sla`, no menu de configuração. Ela edita as três políticas do SLA, que a API já aceita desde o #224: `chamado.sla`, `hotel.horario_atendimento` e `chamado.escalonamento`. Grava nos níveis grupo, bandeira e hotel, como a tela de configuração. Todos os papéis leem, e a API recusa a gravação de quem não é Admin do grupo.
2. **O PR seguinte:** a troca de categoria na triagem, com o recálculo dos prazos (ADR-042, decisão 2). O GRANT da coluna existe desde a 0043.

**Aviso de área compartilhada com a 1b (políticas):** a 1c acrescenta uma página e textos no catálogo. A tela de configuração (`admin/configuracao/page.tsx`) e o domínio das políticas não mudam. Branch `claude/1c-telas-sla`, a partir da `main`.

### A `main` vermelha pelo teste da pausa (13/10/2026)

Desde as 20:15 UTC, o job do banco falha no `packages/db/test/sla-prazos.test.ts`, num teste da 1c ("a pausa com motivo da lista para o relógio"). O teste anda num relógio falso fixado nas 20:00 UTC de hoje, mas a geração da OS grava a transição com o `now()` do banco. Com a hora real depois do início do teste, o `horaDaTransicao` puxou o início e a pausa para a hora real, e a pausa ficou com menos de 2 horas. O #243 entrou com esse job vermelho, e a `main` ficou vermelha.

A correção é o #247, só no teste: o teste alinha a hora da geração com o relógio falso, pelo dono, como o `execucao.test.ts` já faz. O código não muda. O #246 recebeu o mesmo commit.

## Telas do SLA: a troca de categoria na triagem (13/10/2026)

Segundo PR das telas do SLA, depois da tela das políticas (#246). Segue o ADR-042, decisão 2: a categoria do chamado vem do ativo na abertura; quem tria escolhe, troca ou tira, e a troca refaz os prazos e fica na auditoria. Fica fora da zona protegida e sem migração, porque o GRANT de `categoria_id` existe desde a 0043. Branch `claude/1c-categoria-triagem`, a partir da `main`.

**Aviso de área compartilhada com a 1b (chamado, triagem e `packages/dominio`):**
- **Domínio** (`triagem.ts`): `podeAjustarCategoria` e `exigirCategoriaAtiva`, nos estados da prioridade, e o erro `categoria_indisponivel`.
- **Aplicação:** `categorizar` no caso de uso da triagem. O recálculo da prioridade virou `prazosNaTroca`, com a prioridade e a categoria.
- **Banco:** `alterarChamadoNaTriagem` passa a gravar a `categoria_id`, com o evento `chamado.categoria_alterada`.
- **API e tela:** `POST /api/v1/chamados/{id}/categoria` e o bloco da categoria no painel da triagem.

### Ponto de retomada (13/10/2026, telas do SLA)
- **`main`:** o #247 corrigiu o teste da pausa, mas a `main` ficou vermelha no typecheck. O #245 (PV3b da 1b) e o #243 (M5) passavam sozinhos e quebram juntos: o `preventiva-na-maquina.test.ts` não tem a ação `aceitar_automatico`. A correção é o #250, só no teste, e entra antes de qualquer outro merge. Entrou também o #246 (tela das políticas do SLA).
- **Dev:** com a 0046.
- **PRs da 1c:**
  - #250: a correção da `main`;
  - #248: a troca de categoria na triagem, com a `main` juntada e a correção do #250.
- **Esperando:**
  - o Cesar: o merge do #250, depois o do #248;
  - as aprovações do glossário (Cesar e Kaio). As divergências a, b, d e e já têm decisão (#242).
- **Próxima tarefa:** conferir no `docs/13-plano-fase-1c.md` o que falta do item 4 (monitor) depois do M4 e do M5, e então o item 5 (comunicação: o e-mail e o push dos avisos de SLA). Primeiro passo: comparar a seção dos itens 4 e 5 do plano com o que já está na `main`.

## Monitor e comunicação: o que falta (13/10/2026)

**Item 4 (monitor de SLA):** completo na `main`, com as decisões M1 a M5:
- o `app.sla_alerta` e o monitor no cron do SLA;
- a política `chamado.escalonamento` e a tela dela (#246);
- o painel dos avisos e o selo (M4);
- o aceite automático (M5).

A entrega do escalonamento à central por e-mail e push é o item 5. Até lá, o evento `chamado.sla_alerta` fica no outbox sem consumidor.

**Item 5 (comunicação):** não existe nada além do convite pelo Supabase Auth. Não há provedor de e-mail, adaptador da `EnviadorDeEmail`, push nem recuperação de senha.
- Escrevi a proposta `docs/referencia/propostas-comunicacao-1c.md`, com as decisões C1 a C9, para o Cesar.
- Ela tem duas tabelas novas, `app.envio_notificacao` e `app.inscricao_push`. A migração delas é zona protegida e só abre depois da aprovação, na vez do Cesar.
- A C6 (o idioma dos avisos) muda a decisão de 25/09, se o Cesar escolher a recomendação.
- O provedor e o DNS do domínio de envio são da F0-12, com o Cesar.

### Ponto de retomada (13/10/2026, comunicação)
- **`main`:** com o #250 (a correção do typecheck) e o #248 (a troca de categoria na triagem). O #248 entrou com o job "pgTAP" (que roda a integração do `packages/db`) ainda em andamento, e ele terminou verde depois do merge.
- **Dev:** com a 0046.
- **PR da 1c:** o desta proposta, só de documento.
- **Esperando o Cesar:**
  - as decisões C1 a C9 da comunicação;
  - as aprovações do glossário (Cesar e Kaio).
- **Próxima tarefa:** com as decisões, o ADR da comunicação e a migração das duas tabelas (zona protegida, um PR por vez). Primeiro passo: conferir no GitHub se há PR de zona protegida aberto. Enquanto as decisões não chegam, o item 6 (arrendado mínimo, com as decisões 5 a 8 já aprovadas) pode andar na branch, sem o aviso por e-mail.

## Arrendado mínimo (item 6): a matriz como política (13/10/2026)

Começa o item 6, com as decisões 5 a 8 do Cesar (13/10/2026, `docs/13`). Branch `claude/1c-arrendado`, a partir da `main`. O Cesar mandou continuar ("Cesar aqui. Continue") sem responder às decisões C1 a C9 da comunicação, então o item 5 espera.

**Aviso de área compartilhada com a 1b (políticas e `packages/dominio`):**
- **Domínio:**
  - `arrendamento.ts`, novo, com `responsavelDoArrendamento` e `matrizDeArrendamentoValida`;
  - em `politicas.ts`, a chave `hotel.matriz_arrendamento`. A definição de uma chave do núcleo passa a aceitar `escopos`, como a das extensões, e a matriz fica só no grupo e no hotel (decisão 5). `resolverPolitica` e `lerConfiguracao` ignoram o valor gravado num nível que a chave não aceita.
- **Contrato:** `MatrizDeArrendamentoApi`, no pedido e na resposta da configuração.
- **Tela:** `/admin/arrendamento`, com a categoria e quem responde (arrendatária ou locador). Os botões gravam no grupo ou no hotel, nunca na bandeira.

**PRs do item 6:**
1. **Este:** a política e a tela, fora da zona protegida.
2. **A migração** (zona protegida): a coluna `app.os.responsavel_arrendamento` (`arrendataria` ou `locador`, nula fora do arrendado), com o GRANT de UPDATE para o ajuste na triagem e o ADR. Só abre depois do #244 do Cesar, que é o PR de zona protegida aberto agora.
3. **A marca na OS:**
   - a geração da corretiva e da preventiva grava o responsável. A corretiva usa a categoria do chamado (decisão 7); a preventiva, a do ativo;
   - o ajuste na triagem tem motivo e auditoria;
   - o evento `os.locador_avisado` sai uma vez por OS (decisão 8);
   - a linha do tempo e o filtro "do locador".

   O e-mail ao locador espera o item 5.

### Pedido ao agente da 1b: a marca do arrendado na OS preventiva (13/10/2026)

A geração da OS preventiva é da PV3 (1b). Quando a migração 0047 e o código da marca estiverem na `main`, peço que a geração da preventiva grave `responsavel_arrendamento` com `responsavelDoArrendamento(modelo do hotel, matriz resolvida no hotel, categoria do ativo do plano)`. Se o plano não tiver ativo, fica com a arrendatária. O aviso ao locador (`os.locador_avisado`, uma vez por OS) segue a mesma regra da corretiva. A 1c entrega a função no domínio e o padrão no código da corretiva, para a 1b repetir.

### Ponto de retomada (13/10/2026, arrendado)
- **`main`:** verde, em `5196075`, com o #252 (a proposta da comunicação). O dev está com a 0046.
- **PR da 1c:** o #254, com a matriz como política e a tela, fora da zona protegida.
- **Na branch, sem PR:** `claude/1c-arrendado-migracao` (`397f5e5`), com a migração 0047 (`responsavel_arrendamento` e `locador_avisado_em` em `app.os`), o pgTAP 039, os tipos do Kysely e o ADR-045 ("aguarda aprovação"). Abre só depois que o #244 do Cesar entrar, porque ele é o PR de zona protegida aberto agora. Pela ordem do diário da 1b, ela é a próxima da 1c, e a PV3 vem depois. Antes de abrir: conferir a última migração da `main` e o número.
- **Esperando o Cesar:**
  - as decisões C1 a C9 da comunicação (#252, já na `main`);
  - a aprovação do ADR-045, quando o PR dele abrir;
  - as aprovações do glossário.
- **Próxima tarefa:** o PR 3 do arrendado, na branch `claude/1c-arrendado-os`, a partir da `main` depois da 0047 e do `db push`. Primeiro passo: em `gerarOs`, na triagem, resolver a matriz e o modelo do hotel e gravar a marca, e depois o aviso.

## Arrendado mínimo, PR 3: a marca na OS, o ajuste e o aviso ao locador (13/10/2026)

O #244 entrou, e a 0047 abriu no #257, na vez da 1c na fila de zona protegida. O PR dela espera o merge, o `db push` e o "aprovo" do ADR-045. A 1b aceitou o pedido da marca na preventiva (`docs/diario-fase-1b.md`, "Decisão do Cesar: o aceite da OS preventiva e o pedido da 1c"). Este PR fica na branch `claude/1c-arrendado-os`, feita a partir da branch da 0047. Ele só abre depois que a 0047 estiver na `main`, com a branch atualizada a partir dela.

**Aviso de área compartilhada com a 1b (OS, triagem, consultas da corretiva, catálogos e `packages/dominio`):**
- **Domínio** (`arrendamento.ts`):
  - `podeAjustarArrendamento`: exige o papel da triagem, a OS com marca (senão 409 `os_sem_arrendamento`), a OS antes do aceite e o motivo;
  - `avisaOLocador`: o aviso sai uma vez por OS;
  - `FiltroDaLista` ganha `doLocador`.
- **Aplicação:**
  - `gerarOs` lê a matriz só no hotel arrendado e grava a marca pela categoria do chamado;
  - o caso de uso novo `ajustarArrendamento`. A mesma marca não grava nada.
  - Na porta da triagem, o `ChamadoParaTriagem` ganha `modeloContratual`, e a `OsGravada`, a marca e a hora do aviso.
- **Banco:**
  - a geração grava as duas colunas;
  - o ajuste é um UPDATE por coluna, com o motivo na auditoria e o evento `os.arrendamento_ajustado`;
  - o aviso grava a auditoria `avisar_locador`, que vai para a linha do tempo, e o evento `os.locador_avisado`, para o e-mail do item 5;
  - a hora do aviso é sempre o `now()` do banco, também na montagem com o relógio do roteiro, como a auditoria e o outbox;
  - a lista de OS filtra as do locador.
- **API:**
  - `POST /api/v1/os/{id}/arrendamento`;
  - `GET /api/v1/os?doLocador=1`;
  - `OsApi` e `OsResumidaApi` com a marca.
- **Telas:**
  - a marca e a data do aviso na ficha da OS;
  - o ajuste, com motivo, no painel da triagem;
  - o filtro "Responde pela OS" e o selo "Do locador" na lista de OS;
  - as duas ações novas na linha do tempo.
  - Os catálogos estão nos 4 idiomas.
- **Testes:**
  - domínio;
  - consultas;
  - telas da triagem e da corretiva, nos 4 idiomas e no pseudo-idioma;
  - paridade do check `os_responsavel_arrendamento_lista` com `RESPONSAVEIS_DO_ARRENDAMENTO`;
  - a integração `packages/db/test/arrendamento-os.test.ts`, que roda só na CI.

**Validação local:** lint e typecheck passaram, e os testes também: 4.557 passaram e nenhum falhou.

### Ponto de retomada (13/10/2026, PR 3 do arrendado)
- **`main`:** verde, em `569f9e2`, com o #244. O dev está com a 0046.
- **PR da 1c:** o #257 (0047, zona protegida). O check "zona protegida" falha por desenho.
- **Na branch, sem PR:** `claude/1c-arrendado-os`, com o código da marca, do ajuste, do aviso e do filtro, sobre a branch da 0047.
- **Esperando o Cesar:**
  - o merge do #257 e o `db push`;
  - o "aprovo" do ADR-045 e a confirmação da coluna `locador_avisado_em`;
  - as decisões C1 a C9 da comunicação;
  - as aprovações do glossário.
- **Próxima tarefa:** depois do merge da 0047, juntar a `main` na `claude/1c-arrendado-os`, rodar lint, typecheck e testes, e abrir o PR 3. Primeiro passo: conferir que a 0047 está na `main` e que o `db push` foi feito.

## Decisões do Cesar: ADR-045 e comunicação (13/10/2026)

**ADR-045** (responsável do arrendamento na OS): aprovado pelo Cesar no chat do agente da 1c ("ADR-045 (responsável do arrendamento na OS): aprovo, como descrito"). A aprovação cobre:
- a marca gravada na criação da OS, sem recálculo;
- a categoria sem regra com a arrendatária;
- o ajuste manual na triagem até o aceite, com motivo, auditoria e linha do tempo;
- o aviso ao locador uma vez por OS.

**Status no `docs/03`:**
- O #257 (0047) foi mergeado antes de o status mudar. O ADR-045 continua "aguarda aprovação" na `main`.
- O commit com o status (`5cf260a`) foi enviado por engano para a branch do #257 depois do merge, sem conferir antes se o PR estava aberto, e recriou a branch `claude/1c-arrendado-migracao` no GitHub. Ele não está em PR nenhum.
- O status entra num PR de zona protegida, na vez que o Cesar der.

**Comunicação (C1 a C9):** aprovadas como recomendadas, com os registros do Cesar no fim de `docs/referencia/propostas-comunicacao-1c.md`:
- **C1:** o envio fica desligado e só registrado até o Cesar configurar a infraestrutura dele (domínio, AWS, SES e saída do sandbox).
- **C6:** muda a decisão de 25/09 (ADR-022). Os avisos saem no idioma de quem recebe; o convite e a recuperação, em pt-BR.
- **C8:** um e-mail por aviso, com a contagem por destinatário e por dia disponível desde o primeiro dia do piloto. Acima de 30 por pessoa e por dia, abre-se o resumo agrupado.
- **C9:**
  - a ordem é ADR, uma migração com as duas tabelas, e-mail do SLA, push, recuperação de senha e e-mail ao locador;
  - a migração entra na fila de zona protegida depois da parte protegida da PV3;
  - o ADR da comunicação vai no mesmo PR da migração, porque o `docs/03` é zona protegida.

### Pedido ao agente da 1b e administração: o Registro de decisões (13/10/2026)

O C6 muda a decisão de 25/09 (e-mail, push e PDF em pt-BR no MVP). Peço que o Registro de decisões anote a mudança:
- os avisos saem no idioma de quem recebe, com a preferência do membro e depois o padrão do tenant;
- o convite e a recuperação de senha seguem em pt-BR, porque o template do Supabase Auth é único;
- o PDF não foi tratado nesta decisão.

A aprovação está no chat do agente da 1c, em 13/10/2026.

### Ponto de retomada (13/10/2026, decisões)
- **`main`:** em `aeb3c47`, com a 0047 (#257).
- **Dev:** o `db push` da 0047 espera o Cesar, que avisa quando fizer.
- **PRs da 1c:** o deste registro, fora da zona protegida.
- **Na branch, sem PR:** `claude/1c-arrendado-os` (PR 3 do arrendado). Ela abre depois do aviso do `db push`, com a `main` mesclada nela.
- **Esperando o Cesar:**
  - o aviso do `db push` da 0047;
  - a vez de um PR de zona protegida para o status do ADR-045;
  - o que fazer com a branch `claude/1c-arrendado-migracao`, recriada por engano;
  - as aprovações do glossário.
- **Próxima tarefa:** com o aviso do `db push`, juntar a `main` na `claude/1c-arrendado-os`, validar e abrir o PR 3. Enquanto isso, na branch: o ADR da comunicação e a migração das duas tabelas, para abrir na vez dela, depois da PV3.

## Comunicação: o ADR-046 e a migração das duas tabelas, na branch (13/10/2026)

O Cesar mandou prosseguir ("Cesar aqui. Prossiga"). O PR 3 do arrendado abriu no #261, que não deve ser mergeado antes do `db push` da 0047.

A branch `claude/1c-comunicacao-migracao`, a partir da `main`, traz:
- **A migração** `20261014120000_comunicacao.sql` (0049, depois da 0048 da PV3; renomeada em 14/10/2026), com `app.envio_notificacao` e `app.inscricao_push`.
- **O pgTAP** `041_isolamento_comunicacao.test.sql`, com 45 asserções.
- **O meta-teste 001:** as duas tabelas entram na lista fechada, e o registro dos envios, na lista das tabelas só de inserção.
- **Os tipos do Kysely.**
- **O `docs/03`:**
  - o ADR-046, com o status "aguarda aprovação do Cesar";
  - o status aprovado do ADR-045, que não pôde entrar no #257.

O PR é de zona protegida e só abre na vez dele, depois da parte protegida da PV3 (C9).

**Antes de abrir:**
- conferir a última migração da `main`;
- renomear o arquivo com data e hora depois da migração da PV3, para o `db push` não recusar a ordem;
- refazer o número no comentário e no ADR-046.

Feito em 14/10/2026, depois do merge do #262 (PV3, 0048): a migração virou 0049 (`20261014120000`), o pgTAP virou 041 e a `main` entrou na branch.

### Ponto de retomada (13/10/2026, comunicação na branch)
- **`main`:** em `b7e9870`. O dev espera o `db push` da 0047.
- **PRs da 1c:** o #261 (PR 3 do arrendado), fora da zona protegida. Não mergear antes do `db push` da 0047.
- **Na branch, sem PR:** `claude/1c-comunicacao-migracao`, com a migração, o pgTAP, o meta-teste, os tipos, o ADR-046 e o status do ADR-045.
- **Esperando o Cesar:**
  - o `db push` da 0047;
  - a vez da migração da comunicação, depois da PV3;
  - o que fazer com a branch `claude/1c-arrendado-migracao`;
  - a conta e o DNS do SES (F0-12);
  - as aprovações do glossário.
- **Próxima tarefa:** o PR do e-mail do SLA (fora da zona protegida), na branch, a partir desta.
  - **O que entra:** a porta `EnviadorDeEmail` com o adaptador "desligado", o manipulador do `chamado.sla_alerta`, o modelo do e-mail no catálogo, o registro dos envios, a contagem do C8 e o teste de paridade.
  - **Primeiro passo:** ler `packages/aplicacao/src/casos-de-uso/eventos.ts` e a porta `EnviadorDeEmail`.

## Comunicação, PR do e-mail do SLA: na branch (13/10/2026)

O #261 entrou na `main`. A branch `claude/1c-email-sla` foi feita a partir da `claude/1c-comunicacao-migracao`, com a `main` mesclada. O PR só abre depois que a migração da comunicação estiver na `main` e no dev, porque o código grava em `app.envio_notificacao`.

**Aviso de área compartilhada com a 1b (`packages/dominio`, outbox e catálogos):**
- **Domínio** (`comunicacao.ts`):
  - `CANAIS_DE_ENVIO`, `SITUACOES_DE_ENVIO` e `LIMITE_DE_ENVIOS_POR_DIA` (30, C8);
  - `pessoasDoAviso`: os papéis pelas atribuições vigentes que cobrem o hotel, mais o responsável da OS ativa, que é o Técnico ou os membros ativos da equipe;
  - `situacaoAntesDoEnvio` (`sem_endereco` e `sem_provedor`), `podeVerContagemDeEnvios` e `validarPeriodoDaContagem` (até 31 dias).
- **Aplicação:**
  - o manipulador do `chamado.sla_alerta` em `criarManipuladoresDeEventos`, com a dependência opcional `comunicacao`;
  - um e-mail por pessoa, no idioma dela e depois no do tenant (C6);
  - o envio já registrado não sai de novo, e a falha de uma pessoa não para as outras;
  - o `EventoPendente` ganha o `registroId`, o chamado do aviso;
  - o caso de uso `contagemDeEnvios` (C8).
- **Banco:**
  - `criarPortaComunicacao`, que lê com o `hk_worker` e grava o registro pela unit of work (`repositorios/comunicacao.ts`);
  - o outbox passa o `registro_id` ao manipulador.
- **Web:**
  - na composição, o manipulador com o e-mail desligado (`email: null`, C1): até o SES, cada envio fica como `sem_provedor`;
  - a rota `GET /api/v1/comunicacao/envios/contagem`.
- **Catálogos:** o modelo `email.sla.*`, com o texto puro e o HTML e o prazo no fuso do hotel, e o erro `envios_fora_do_papel`, nos 4 idiomas.
- **Testes:**
  - domínio, i18n e aplicação, com portas falsas;
  - a paridade dos dois checks da 0049;
  - a integração `packages/db/test/comunicacao.test.ts`, que roda só na CI.

**Fica para depois:**
- o adaptador do SES, quando o Cesar configurar a conta (C1);
- a tela da contagem: a API já serve o piloto;
- o push.

**Validação local:** lint e typecheck passaram, e os testes também: 4.580 passaram e nenhum falhou. Os 296 de integração ficaram pulados, porque rodam só na CI.

## Respostas do Cesar de 14/10/2026

O Cesar respondeu ("Cesar aqui. Respostas:"):
- **A vez da migração da comunicação** é a próxima, depois do merge do #262 e do `db push` da 0048. Ele avisa quando a vez estiver livre.
- **O status do ADR-045** vai junto com a migração da comunicação.
- **A branch `claude/1c-arrendado-migracao`** pode ser apagada. O proxy da sessão recusou a exclusão (`git push --delete`); fica para o Cesar apagar no GitHub.
- **Glossário:** a versão 3 está aprovada por ele e pelo Kaio, e os termos "prazo em risco" e "prazo vencido" foram fechados no #258. O painel da 1c segue a versão 3.
- **Enquanto a vez não chega,** seguir com o que não depende da migração: o PR 3 do arrendado ou o push. O PR 3 do arrendado já entrou (#261); o push anda numa branch que já tem a migração, porque grava em `app.inscricao_push`, e o PR abre depois do merge e do `db push` da 0049.

## ADR-046 aprovado (14/10/2026)

O Cesar aprovou o ADR-046 no chat ("Cesar aqui. ADR-046 aprovado"). O status no `docs/03` foi trocado na branch `claude/1c-comunicacao-migracao` e entra na `main` com o PR da migração 0049. A aprovação cobre os detalhes do push registrados no ADR.

### Ponto de retomada (14/10/2026, depois do merge do #272)
- **`main`:** em `b1f70f8`, com o #272 (migração 0049, pgTAP 041, ADR-046 e ADR-045 aprovados). O dev espera o `db push` da 0049 pelo Cesar.
- **PRs abertos da 1c:** nenhum. Nenhum PR de zona protegida da 1c na fila.
- **Nas branches, já com a `main` e validadas (lint, typecheck e testes):**
  1. `claude/1c-email-sla`: o PR abre quando o Cesar confirmar o `db push` da 0049.
  2. `claude/1c-push`: o PR abre depois do merge do PR do e-mail.
- **Esperando o Cesar:** o `db push` da 0049; apagar a branch `claude/1c-arrendado-migracao`; a conta e o DNS do SES (F0-12); as chaves VAPID, depois do deploy do push.
- **Próxima tarefa:** o painel de indicadores (item 8), pela versão 3 do glossário. Primeiro passo: ler `docs/referencia/glossario-metricas.md` e a seção do painel no `docs/13`.
