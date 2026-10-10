# Diário da fase 1a

Uma entrada por tarefa do `docs/05-plano-fase-1a.md`: o que entregou, como o aceite foi provado, o PR e o que ficou pendente. As regras de processo são as do `docs/diario-fase-0.md` (zona protegida, ADR só com aprovação explícita, `db push` e `config push` só pelo Cesar, merge não aprova ADR). A execução vai uma etapa por vez, com parada e resumo ao fim de cada etapa.

**Ponto de retomada e compactação (Cesar, 28/09/2026, revisto no mesmo dia para economizar o limite semanal):**
- **Quando parar:** ao fechar cada etapa e quando a janela de contexto passar de 60%, no próximo ponto seguro (commit feito, nada pela metade, nenhum comando rodando).
- **Ao parar:**
  1. registrar um "Ponto de retomada" **curto e autossuficiente**: com ele e o `CLAUDE.md`, uma sessão nova retoma sem ler o diário nem o plano inteiros. Traz o estado da `main` e das migrações no dev, os PRs abertos e o que espera o Cesar, os worktrees e branches com trabalho não enviado, as decisões pendentes e a próxima tarefa exata, com o primeiro passo e os arquivos a ler;
  2. enviar push avisando e sugerindo o `/compact`;
  3. terminar a resposta com a instrução exata para o Cesar usar no `/compact`.
- **Sessão nova só em caso de problema.** O Cesar não abre mais sessão nova a cada etapa.
- **Conferência do dev no início** (de sessão ou depois do `/compact`): só quando houve `db push` desde a última conferência.
- **Saídas de teste:** só o resumo, com o total, as falhas e o nome do que falhou.

## Etapa A — Estrutura e administração

### A1 — Ativação de hotel a partir do staging
- `DadosDeHotel` no contrato do adaptador: nome e fuso opcional.
- Domínio: `contaComoHotel`, `saldoDeHoteis` e `decidirAtivacao` (bloqueia sem saldo de hotéis, conflito se já ativo, libera as UHs pendentes até o saldo de UHs).
- Casos de uso `listarParaAtivacao`, `importarHotel` (para implantação, sem licença) e `ativarHotel`, só para o Admin do grupo. A regra é injetável para o teste de RLS.
- Rotas:
  - `GET /api/v1/hoteis/staging`;
  - `POST /api/v1/hoteis/importacoes`;
  - `POST /api/v1/hoteis/{id}/ativacao`.
- Tela `/admin/hoteis`: lista, diferenças com o sistema hoteleiro, escolha de fuso e ações, com os textos no catálogo nos quatro idiomas.
- Sem saldo: 409 `licenca_hoteis_sem_saldo`, com a tentativa na auditoria e o evento `licenca.sem_saldo` no outbox. O evento fica pendente até existir o manipulador da notificação (1c).
- Lock de licença por tenant (advisory lock de transação), também na promoção de UHs do worker. Sem migração.
- Aceite (`packages/db/test/hoteis.test.ts`, banco real na CI):
  - importação sem licença; repetir dá 409; sem fuso dá 422;
  - ativação com liberação parcial de UHs;
  - bloqueio sem saldo, com auditoria e evento;
  - RLS barrando o gerente com a checagem removida;
  - duas ativações simultâneas com uma licença: uma passa, a outra recebe 409;
  - paridade com `licenca.uso()`.
- Também: o teste do pseudo-idioma passou a ler as variáveis de cada mensagem pelo parser, em vez de uma lista fixa.
- Pendente: desativar hotel (libera licença) não entrou; fica para quando o plano pedir.

### Incidente 3 — `pnpm` executado fora do repositório (26/09/2026, ~20h18)
- **O que aconteceu:** numa cadeia de comandos ligada por `;`, um `cd` para a worktree da A3 falhou. O passo seguinte, `pnpm --filter ... exec`, rodou no scratchpad da sessão, fora do repositório. Sem workspace ali, o pnpm subiu as pastas até `C:\Users\cesar\package.json`, um projeto npm pessoal do Cesar, e moveu `cors`, `docx`, `express` e `mssql` para `C:\Users\cesar\node_modules\.ignored`. Não criou lockfile nem mexeu em outros arquivos.
- **Contenção:** o Claude viu o aviso do pnpm, achou a pasta afetada e parou. A restauração que ele tentou foi negada pelo classificador de permissões. O Cesar devolveu os 4 pacotes pelo PowerShell.
- **Regra nova (Cesar):**
  - antes de qualquer `pnpm`, `npm` ou `npx`, confirmar que o diretório atual é a raiz de um checkout do HubKeep (existe `pnpm-workspace.yaml`) e abortar se não for;
  - nenhuma cadeia com `;` em comandos que alteram arquivos, fazem merge ou instalam pacotes, só `&&`.

  A regra está no `CLAUDE.md` ("Comandos na máquina") e na memória do Claude.
- **Relação com incidentes anteriores:** o risco de `;` já aparecia na fase 0, quando um merge rodou apesar de uma guarda que falhou.

### A3 — Usuários e papéis
- Domínio (`packages/dominio/src/membros.ts`):
  - `podeGerirMembros` (Admin ou Implantador vigente);
  - `podeAlterarAtivoDoMembro` (só o Admin; ninguém altera o próprio acesso);
  - `podeAlterarValidade` (Admin, ou Implantador em papéis abaixo dele nos hotéis dele; o Implantador sempre com validade).
- Decisão do Cesar: desativar e reativar membro só pelo Admin do grupo. O Implantador tira o acesso revogando o papel no hotel dele.
- Migração 0007: a policy de UPDATE de `app.membro` passa a ser só do Admin do grupo. Fecha a lacuna da fundação, que deixava o Implantador alterar membro sem papel privilegiado em qualquer hotel. pgTAP 006. Aprovada pelo Cesar.
- Casos de uso `listarMembros`, `desativarMembro`, `reativarMembro` e `alterarValidade`. Concessão e revogação reaproveitam os casos de uso da F0-06, agora com rota.
- Rotas:
  - `GET /api/v1/membros`;
  - `POST /api/v1/atribuicoes`, `POST /api/v1/atribuicoes/{id}/revogacao`, `PUT /api/v1/atribuicoes/{id}/validade`;
  - `POST /api/v1/membros/{usuarioId}/desativacao` e `.../reativacao`.
- Tela `/admin/membros`: convite, lista com papéis, concessão, revogação, validade e desativação. Catálogo nos quatro idiomas, com os nomes dos papéis e escopos.
- Aceite (`packages/db/test/membros.test.ts`, banco real):
  - paridade domínio × RLS na desativação para todo par de quem age e alvo, com a única exceção sendo a regra própria do domínio;
  - o desativado perde o acesso e volta ao ser reativado;
  - lista recortada pela RLS;
  - validade auditada, no passado dá 422;
  - o Implantador não mexe na validade de outro Implantador.
- Falso alarme registrado: a suspeita de que o Implantador estendesse a própria validade pelo banco não procede. O `WITH CHECK` da policy de atribuição barra, e o pgTAP 002 já testa.

### A2 — Bandeiras (PR #38, migração 0008)
- Migração 0008: `ativa` em `app.bandeira` (desativação lógica), com UPDATE só nessa coluna, além do nome. pgTAP 007 (10 casos).
- Domínio (`bandeiras.ts`): `podeGerirBandeiras` e `podeLigarHotelABandeira` (só o Admin do grupo) e `normalizarNomeDeBandeira`.
- Casos de uso: listar, criar, renomear, desativar e reativar bandeira, e ligar ou desligar o hotel da bandeira. Nome repetido dá 409 `bandeira_nome_repetido`, pela restrição única do banco.
- Rotas:
  - `GET/POST /api/v1/bandeiras` e `PUT /api/v1/bandeiras/{id}`;
  - `POST /api/v1/bandeiras/{id}/desativacao|reativacao`;
  - `PUT /api/v1/hoteis/{id}/bandeira`.
- `HotelVisivel` ganhou `bandeiraId`. Tela `/admin/bandeiras`.
- O teste de OpenAPI passou a comparar o documento com a lista derivada de `ROTAS`, em vez de uma lista fixa. A mesma troca foi feita em A4, A5, A6 e A7, para os PRs paralelos não conflitarem.
- Aceite: `packages/db/test/bandeiras.test.ts`, com paridade domínio × RLS.

### A4 — Proprietários, de UH e de hotel inteiro (PR #41, migração 0011, ADR-031)
- Migração 0011:
  - `app.hotel_proprietario`, com vigência e FK composta. Leitura e escrita só pelo Admin do grupo, como em `app.proprietario`. Sem DELETE; só a vigência muda.
  - `authz.locais_proprietario()` passa a incluir todos os locais dos hotéis vinculados, dentro da vigência. As policies existentes cobrem o caso, e UH nova no hotel entra no escopo sozinha. O proprietário continua só leitura.
- Meta-teste 11b (novo): impressão (md5 do `prosrc`) do corpo de cada função, para que mudar o que uma função de autorização calcula exija o teste atualizado no mesmo PR. Meta-teste 19 com a exceção `authz_leitura` da tabela nova. pgTAP 010 (24 casos).
- Domínio (`proprietarios.ts`):
  - gestão só pelo Admin;
  - nome e documento normalizados;
  - vigência yyyy-mm-dd, com os dois extremos valendo;
  - sem sobreposição de vínculos do mesmo proprietário com o mesmo alvo;
  - vínculo por local só com UH.
- Rotas:
  - `GET/POST /api/v1/proprietarios` e `PUT /api/v1/proprietarios/{id}`;
  - `POST /api/v1/proprietarios/{id}/vinculos`;
  - `PUT /api/v1/vinculos-de-proprietario/{id}/vigencia`;
  - `GET /api/v1/hoteis/{id}/locais`, mínima, que a B1 amplia.

  O convite aceita `proprietarioId`, para convidar alguém direto como proprietário.
- A auditoria de proprietário e vínculo não guarda nome nem documento (LGPD).
- Tela `/admin/proprietarios`: cadastro, vínculo, vigência, dar acesso a um membro e convite.
- Aceite (`packages/db/test/proprietarios.test.ts`): o dono vê o hotel inteiro, a UH nova e a UH vinculada; encerrar a vigência tira o acesso; recusas com código; paridade com a checagem removida; auditoria sem dado pessoal.
- CI: a primeira execução falhou na verificação dos tipos gerados (`kysely-codegen --verify`), porque `AppHotelProprietario` estava fora da ordem alfabética em `tipos-banco.ts`. Corrigido no mesmo PR.
- Limite conhecido: hotel vinculado sem nenhum local não aparece ao proprietário até chegar o primeiro local.
- Pendente: aprovação explícita do texto dos ADRs 030 e 031 (pedida no PR #41).

### A5 — Fluxos do Implantador e painel de implantação (PR #42, mergeado, sem migração)
- Domínio (`implantacao.ts`):
  - quem vê: o Admin do grupo ou o Implantador vigente do hotel;
  - resumo de locais;
  - pessoas com papel vigente no hotel, por papel;
  - pessoas que ficaram sem papel vigente;
  - pendências `sem_locais`, `uhs_pendentes_de_licenca`, `sem_gerente`, `sem_tecnico` e `pessoas_sem_papel_vigente`.
- Rota `GET /api/v1/hoteis/{id}/implantacao` e tela `/admin/implantacao`. O cadastro de pessoas é o da tela de membros (A3), com as regras de concessão da F0-06.
- Aceite (`packages/db/test/implantacao.test.ts`):
  - painel do Implantador;
  - concessão de gerente, com o painel refletindo;
  - 403 com código ao conceder acima do próprio papel ou em outro hotel;
  - ativar é só do Admin;
  - vencido e gerente não veem;
  - sem a checagem, a RLS esconde o hotel.
- CI: a primeira execução falhou no seed do teste (atribuição revogada sem `revogado_por`, recusada pelo check `revogacao_consistente`), e a segunda no Prettier do mesmo arquivo, porque a checagem local estava num pipe com `tail`, que esconde a falha. As duas foram corrigidas no PR.
- Pendente para a etapa B: as pendências de ativos (locais sem ativo, ativos sem categoria) e o cadastro de locais, ativos e QR.

### A6 — Equipes do hotel (PR #39, migração 0009)
- Migração 0009:
  - `app.equipe` (nome, ativa) e `app.equipe_membro` (equipe, usuário, ativo), com FKs compostas por tenant e hotel;
  - leitura para quem lê o hotel;
  - gestão por Admin, Gestor CSC, Implantador e Gerente do hotel;
  - sem DELETE.

  pgTAP 008 (19 casos).
- Domínio (`equipes.ts`): quem gere (papel e escopo cobrindo o hotel) e nome normalizado. Nome repetido no hotel dá 409 `equipe_nome_repetido`.
- Rotas:
  - `GET/POST /api/v1/hoteis/{id}/equipes` e `PUT /api/v1/equipes/{id}`;
  - `POST /api/v1/equipes/{id}/desativacao|reativacao`;
  - `POST /api/v1/equipes/{id}/membros` e `.../membros/{usuarioId}/remocao`.
- Tela `/admin/equipes`.
- Aceite (`packages/db/test/equipes.test.ts`): técnico em duas equipes; pôr de novo reativa, sem duplicar; desativação lógica; o técnico lê e não gerencia; outro hotel não vê; paridade com a checagem removida.

### A7 — Configuração do tenant e do hotel e políticas (PR #40, migração 0010, ADR-026)
- Migração 0010:
  - `app.politica`: valor jsonb por chave e escopo (grupo, bandeira ou hotel), com uma linha por chave em cada escopo;
  - gravação só pelo Admin, com `atualizado_por` igual a quem grava; sem DELETE, e voltar a herdar é `ativa = false`;
  - leitura por escopo: a política do hotel só para quem lê o hotel; a do grupo, para quem tem papel vigente;
  - `app.tenant` ganha UPDATE de país, subdivisão, moeda e idioma padrão, só pelo Admin.

  pgTAP 009 (22 casos).
- Correção feita antes do merge: a primeira versão deixava todo membro do tenant ler qualquer política. Isso furava dois dos seis casos do docs/02: o gerente de outro hotel via a política do hotel, e o implantador vencido via as do grupo. A leitura passou a ser por escopo, com os casos no pgTAP.
- Domínio (`politicas.ts`):
  - `os.aceite_automatico` (`{ligado, dias 1..60}`), desligado por padrão, com job na 1c;
  - `chamado.prioridade_padrao_por_categoria`, para B2 e C1;
  - resolução hotel → grupo → padrão;
  - valor fora do formato cai para o nível seguinte;
  - região ISO.
- Os contratos repetem o formato, e `tests/contratos-dominio` compara os dois lados.
- Rotas:
  - `GET/PUT /api/v1/configuracao`;
  - `PUT /api/v1/hoteis/{id}/configuracao`;
  - `PUT /api/v1/politicas`.
- Tela `/admin/configuracao`.
- Aceite (`packages/db/test/configuracao.test.ts`): o hotel vence o grupo; null volta a herdar sem duplicar a linha; auditoria de cada gravação; recusas com código; paridade com a checagem removida.

### Fim da etapa A — resumo
- **PRs:**
  - A1 #36 e A3 #37, mergeados;
  - A2 #38, A6 #39, A7 #40 e A4 #41, com migração, abertos para revisão e merge do Cesar;
  - A5 #42, sem migração, mergeado depois da CI verde.
- **Migrações:**
  - no dev até a 0006;
  - para `db push`, nesta ordem: 0007 (#37), 0008 (#38), 0009 (#39), 0010 (#40) e 0011 (#41). Se os merges saírem de ordem, usar `supabase db push --include-all`.
- **Telas novas:**
  - `/admin/hoteis`, `/admin/membros`, `/admin/bandeiras`, `/admin/equipes`;
  - `/admin/configuracao`, `/admin/proprietarios`, `/admin/implantacao`.
- **Decisão de processo para o Cesar:** o docs/02 manda pôr os casos de cada tabela nova no `003_isolamento_por_tabela`. Nesta etapa, cada tabela ganhou arquivo próprio (007 a 010), com os seis casos, para os PRs paralelos não conflitarem no mesmo arquivo. A escolha é entre mover tudo para o 003 depois dos merges ou ajustar o docs/02 para aceitar arquivo por tabela.
- **Pendente:**
  - aprovação dos textos dos ADRs 030 e 031;
  - desativar hotel;
  - pendências de ativos no painel (etapa B);
  - hotel vinculado sem local invisível ao proprietário até o primeiro local.

### Decisões do Cesar e conferência do dev (28/09/2026)
- **Dev:** o Cesar aplicou as migrações 0007 a 0011 por `db push`. Conferência só de leitura:
  - o histórico do dev é igual às 11 migrações da `main`;
  - `pnpm db:testar-dev` passou: 312 testes ok em 10 arquivos, 0 falhas.
- **ADR-030 e ADR-031:** aprovados como estão.
- **Vínculo com hotel inteiro:** confirmado que só o Admin lê `app.hotel_proprietario`. A pendência do hotel sem locais, que não aparece para o proprietário, fica para a etapa B (B1 no `docs/05`).
- **Meta-teste 11b:** mantido.
- **pgTAP:** um arquivo por tabela, `0NN_isolamento_<tabela>.test.sql`, e o docs/02 ajustado, com os seis casos mínimos no checklist.
  - Os arquivos da etapa A foram renomeados: 007 bandeira, 008 equipe, 009 política e 010 hotel_proprietario.
  - O 008 cobria duas tabelas e foi dividido: 008 ficou com `equipe`, e o novo 011 cobre `equipe_membro`, com os seis casos completos. Antes, `equipe_membro` só tinha FK, sem contexto e escrita do gerente.
- **Processo da etapa B:**
  - worktrees em `C:\Cesar\HubKeep\Dev\wt\`. Os antigos, na pasta temporária, foram removidos: eram todos de branches já mergeadas e estavam limpos;
  - o próximo PR de zona protegida só abre depois do merge do anterior.

  Registrado no `CLAUDE.md`.

## Etapa B — Locais e ativos

### B1 — Locais e o hotel inteiro sem locais (migração 0012)
- Domínio (`locais.ts`):
  - a UH vem do sistema hoteleiro e é só leitura (`local_so_leitura`); o status dela é da licença;
  - a área comum é cadastrada à mão e não conta licença;
  - quem gere: Admin, Gestor CSC, Implantador e Gerente, no escopo do hotel. Técnico e solicitante têm escrita no hotel pela RLS, então esse limite por papel é regra de ação (regra 2);
  - nome e andar normalizados; nome repetido entre as áreas comuns ativas dá 409 `local_nome_repetido`.
- Rotas:
  - `GET/POST /api/v1/hoteis/{id}/locais`; o GET veio da A4 e agora devolve origem, andar e se o local é editável;
  - `PUT /api/v1/locais/{id}`;
  - `POST /api/v1/locais/{id}/desativacao|reativacao`.
- Tela `/admin/locais`.
- **Pendência da A4, o hotel sem locais:**
  - a primeira versão usava `left join` em `authz.locais_proprietario()`, que passava a devolver `(nulo, hotel)`;
  - o Cesar pediu que a função devolva só locais de verdade e escolheu a função nova `authz.hoteis_proprietario()`, usada nas policies de `app.hotel` e `app.politica` (adendo ao ADR-031, aguarda aprovação);
  - o pgTAP 010 garante que `locais_proprietario()` nunca devolve `local_id` nulo;
  - meta-testes 11 e 11b atualizados.
- Aceite (`packages/db/test/locais.test.ts`):
  - área comum sem consumo de licença;
  - a UH do CM é só leitura;
  - nome repetido;
  - desativar e reativar;
  - auditoria;
  - o técnico não gere; outro hotel não vê; a RLS barra pela porta;
  - o dono do hotel inteiro vê o hotel sem locais, e nenhum local.

### B1 — ajuste: o proprietário não lê políticas (migração 0013)
- **Decisões do Cesar (28/09/2026):**
  - ADR-031 aprovado, com o adendo valendo só para a leitura de `app.hotel`;
  - o proprietário não lê políticas no MVP, por falta de uso concreto.
- **Migração 0013:** a leitura de `app.politica` perde todos os caminhos do proprietário.
  - Sai `hoteis_proprietario()`, posta pela 0012.
  - Sai também `locais_proprietario()`, desde a 0010, pela qual o dono de UH e o dono de hotel com locais liam a política do hotel e as do grupo. Tirar só a função nova deixaria o dono de hotel com locais lendo.
- **pgTAP 009 (25 casos):** o dono de UH e o dono de hotel inteiro não leem política nenhuma, nem gravam; o dono de hotel inteiro continua vendo o hotel.
- **Dev, conferência só de leitura antes da 0013:** o histórico parava na 0011, sem a 0012. Não existia `authz.hoteis_proprietario()`, e as policies de `app.hotel` e `app.politica` eram as anteriores.
  - `pnpm db:testar-dev` falhou, como se espera sem a 0012: 310 ok. As falhas foram os meta-testes 11 e 11b (lista e impressão das funções) e o 010, que parou no caso 12, na primeira chamada à função que não existe.
  - O resto passou: 002 a 009 e 011.

### Dev conferido depois da 0013 (28/09/2026)
- O Cesar mergeou o #46 e rodou `db push` (0012 e 0013).
- Conferência só de leitura:
  - o histórico do dev é igual às 13 migrações da `main`;
  - `authz.hoteis_proprietario()` existe, com a impressão esperada;
  - a leitura de `app.hotel` usa a função, e a de `app.politica` não tem caminho do proprietário.
- `pnpm db:testar-dev` passou inteiro: 335 testes ok em 11 arquivos, com os meta-testes 11 e 11b e o 010.
- Confirmado pelo Cesar: nenhum proprietário, de UH ou de hotel inteiro, lê políticas.

### B2 — Categorias de ativo e campos tipados (migração 0014, ADR-028)
- **Migração 0014, `app.categoria_ativo`:**
  - colunas: `nomes jsonb` parcial por idioma, `chave_padrao` quando a categoria é uma das padrão, `campos jsonb` com as definições e `ativa`;
  - uma categoria padrão por tenant; checks de formato da chave e do tipo dos jsonb;
  - RLS: lê o Admin e quem tem papel vigente, inclusive o proprietário, que vai ver a categoria dos ativos da UH dele na B3; grava só o Admin; sem DELETE;
  - `chave_padrao` não é alterável.

  pgTAP `012_isolamento_categoria_ativo` (20 casos).
- **Domínio `campos-tipados.ts`,** o módulo comum com o checklist da 1b:
  - tipos texto, número (com unidade), data, lista (com opções) e sim/não;
  - rótulos em quatro idiomas;
  - `validarDefinicoes` recusa com `definicao_de_campo_invalida`, levando o campo e o motivo;
  - `validarMudancaDeDefinicoes`: o tipo de um campo existente não muda (`campo_muda_de_tipo`);
  - `validarValores`, para gravação nova (obrigatório, tipo, campo desconhecido), e `lerValores`, que nunca lança: campo novo obrigatório vale só para gravações novas, e a leitura do que já foi gravado não quebra.
- **Domínio `categorias.ts`:**
  - `CATEGORIAS_PADRAO` (10), com o nome no catálogo `categoria_ativo.padrao.<chave>`;
  - só o Admin gere;
  - a categoria do tenant precisa de ao menos um nome, e a padrão pode ficar sem.
- **`@hubkeep/i18n`:** `resolverNome`, com a volta do ADR-027 (nome do tenant no idioma → catálogo → idioma padrão do tenant → qualquer um).
- **Rotas:**
  - `GET/POST /api/v1/categorias-de-ativo` e `PUT /api/v1/categorias-de-ativo/{id}`;
  - `POST .../{id}/desativacao|reativacao`;
  - `POST /api/v1/categorias-de-ativo/padrao`, idempotente.
- **Tela** `/admin/categorias`: instalar as padrão, criar, nomes nos quatro idiomas, acrescentar e tirar campo, desativar.
- **Aceite** (`packages/db/test/categorias.test.ts`):
  - instalação idempotente;
  - campos tipados;
  - definição inválida com o campo e o motivo;
  - mudança de tipo recusada;
  - campo novo obrigatório aceito;
  - a padrão com nome próprio;
  - paridade com a checagem removida;
  - auditoria.

### Ponto de retomada (28/09/2026, meio da etapa B, contexto da sessão acima de 60%)
- **`main`:** `04c57e5`, o merge do #46 (0013).
- **Dev:** 13 migrações, até a 0013, iguais às da `main`; `pnpm db:testar-dev` com 335 ok em 11 arquivos.
- **PR aberto:** [#47](https://github.com/cesarcoutohubtech/hubkeep/pull/47), B2, migração 0014, com a CI verde fora a zona protegida. Espera do Cesar:
  - o merge;
  - o `db push` da 0014;
  - a resposta sobre o proprietário ler categorias de ativo (incluído na RLS, para a B3).
- **Worktrees em `C:\Cesar\HubKeep\Dev\wt\`:**
  - `b2-categorias` (branch `1a-b2-categorias`, todo enviado);
  - `b1-locais`, `politica-sem-proprietario` e `decisoes-etapa-b`, de branches já mergeadas, que podem ser removidos com `git worktree remove`.

  Nenhum trabalho local fora do GitHub.
- **Decisão pendente:** o proprietário lê categorias de ativo? Está no #47.
- **Próxima tarefa: B3, ativos (ADR-029, concorrência por versão).**
  - O que ela tem:
    - `app.ativo` com local, categoria, campos estendidos em `jsonb` (validados por `validarValores` e lidos por `lerValores` de `campos-tipados.ts`), fabricante, modelo, número de série e `versao`;
    - cadastro no web e no PWA, com as operações offline `ativo.cadastrar` e `ativo.alterar` (ADR-025);
    - o conflito de versão aparece no aparelho;
    - nas pendências do painel de implantação (A5), "locais sem ativo" e "ativos sem categoria".
  - Primeiro passo, depois do merge do #47 e do `db push`:
    1. conferir o dev só por leitura: histórico até a 0014 e `pnpm db:testar-dev`;
    2. `git worktree add C:/Cesar/HubKeep/Dev/wt/b3-ativos -b 1a-b3-ativos origin/main`;
    3. `supabase migration new ativo`;
    4. ler o ADR-025, o ADR-029 e o código da fila offline (`packages/db/src/repositorios/operacoes-offline.ts`, `PedidoDeOperacaoOffline` em `packages/contratos/src/sincronizacao.ts`).

### Dev conferido depois da 0014 (28/09/2026)
- O Cesar mergeou o #47 e rodou `db push` da 0014.
- Conferência só de leitura: o histórico do dev tem as 14 migrações da `main`, até a 0014.
- `pnpm db:testar-dev` passou inteiro: 355 testes ok em 12 arquivos, com o 012 (categorias, 20 casos).
- **Decisão do Cesar (28/09/2026):** o proprietário, de UH e de hotel inteiro, continua lendo as categorias de ativo, como está na 0014.

### B3 — Ativos (migração 0015, ADR-028 e ADR-029)
- **Migração 0015, `app.ativo`:**
  - colunas: local, categoria opcional, nome, fabricante, modelo, número de série, `campos jsonb` (objeto), `versao` (começa em 1) e `desativado_em` (desativação lógica);
  - FK composta com o hotel, com o local pelo `(hotel_id, local_id)` e com a categoria pelo `(tenant_id, categoria_id)`;
  - RLS no modelo do `docs/02`: lê quem lê o hotel e o proprietário, só nos locais dele; grava quem escreve no hotel; sem DELETE;
  - **o local não muda depois do cadastro.** O meta-teste 18 proíbe UPDATE em `local_id`, e o local decide o que o proprietário vê (ADR-011). Trocar o ativo de local fica como decisão pendente (abaixo).

  pgTAP `013_isolamento_ativo` (26 casos): os seis do `docs/02`, os checks, `hotel_id` e `local_id` não alteráveis, UPDATE com versão velha sem linha, sem DELETE e o worker.
- **Domínio `ativos.ts`:**
  - gerem ativos os papéis que gerem locais e o técnico, que cadastra pelo celular (`ativos_fora_do_escopo`);
  - nome (`ativo_nome_invalido`) e fabricante, modelo e número de série (`ativo_texto_invalido`, com o campo);
  - local inativo não recebe ativo (`ativo_local_inativo`); UH pendente de licença recebe;
  - `validarCamposDoAtivo`: sem categoria, nenhum campo estendido; categoria desativada não entra em ativo novo nem em troca (`ativo_categoria_inativa`), mas o ativo que já estava nela segue alterável;
  - `conflitoDeVersao` (409 `conflito_de_versao`, com `versaoAtual`).
- **Aplicação:** `criarCasosDeUsoDeAtivos` com `listarAtivos`, `cadastrar`, `alterar`, `desativar` e `reativar`. `prepararCadastro` e `prepararAlteracao` são os mesmos no web e na fila offline.
- **Banco:** o UPDATE leva `where versao = $esperada` e incrementa. Sem linha, relê a versão depois do UPDATE: se mudou, é conflito; senão, "não encontrado" (fora do escopo ou sem escrita). Reler depois cobre a gravação simultânea que terminou enquanto esta esperava a trava da linha.
- **Fila offline (ADR-025):** operações `ativo.cadastrar` e `ativo.alterar` no contrato, no caso de uso e na sessão da unit of work. O conflito volta como 409 e a chave não fica guardada; no aparelho, a recusa já segue o fluxo de rejeitada, e o rótulo das operações está nos catálogos.
- **Rotas:**
  - `GET /api/v1/hoteis/{id}/ativos`;
  - `POST /api/v1/ativos`;
  - `PUT /api/v1/ativos/{id}`;
  - `POST /api/v1/ativos/{id}/desativacao|reativacao`, com a versão.
- **Tela** `/admin/ativos`: cadastro com os campos da categoria escolhida, alteração com a versão vista, desativar e reativar.
- **Painel de implantação (A5):** pendências `locais_sem_ativo` e `ativos_sem_categoria`, e o resumo de ativos.
- **Aceite** (`packages/db/test/ativos.test.ts`, banco real na CI):
  - o técnico cadastra com campos estendidos;
  - obrigatório, campo desconhecido, categoria e local inativos recusados com código;
  - versão velha dá `conflito_de_versao` com a versão atual;
  - o solicitante não gere; o gerente de outro hotel não vê; a RLS barra pela porta; o proprietário lê e não grava;
  - o proprietário vê só o ativo da UH dele;
  - na fila offline, o reenvio de `ativo.cadastrar` não duplica, e o conflito de `ativo.alterar` não guarda a chave;
  - auditoria de cada gravação e as contas do painel.
- **Fica para a B3b** (PR fora da zona protegida): a tela de cadastro no PWA. Ela depende de guardar no aparelho hotéis, locais, categorias e ativos, com a limpeza ao sair (ADR-025 b), e de enfileirar `ativo.cadastrar` e `ativo.alterar`. A parte do servidor e a exibição da recusa já estão nesta B3.
- **Decisão pendente do Cesar:** trocar o ativo de local. O caminho sem mexer no ADR-011 é desativar e cadastrar de novo. Se mover for necessário, a proposta é uma exceção no meta-teste 18 para `app.ativo.local_id`, com adendo ao ADR-011: o proprietário da UH antiga deixa de ver o ativo.

### B3b — Ativos no PWA (sem migração)
- **Referência no aparelho** (`apps/tecnico/src/referencia/banco.ts`):
  - hotéis, locais, categorias e ativos num IndexedDB próprio (`hubkeep-tecnico-referencia`), separado da fila para a atualização de um não mexer no outro;
  - um registro por usuário, com o tenant em que foi lido: outro tenant ou outra pessoa no aparelho não o enxergam;
  - relida da API (`lerReferencia`, validada pelos contratos) com sessão e rede, e depois de cada envio que tirou algo da fila; sem rede, vale a guardada;
  - **sair apaga a referência de quem sai** (ADR-025, ajuste (b)), junto com a fila e o tenant.
- **Tela de ativos** (`telas/Ativos.tsx`), aberta pela fila do dia:
  - cadastro com local, categoria e os campos dela, fabricante, modelo e número de série; alteração dos ativos guardados;
  - o aparelho valida com as mesmas regras do domínio que o servidor (`normalizarNomeDeAtivo`, `validarCamposDoAtivo`, `exigirLocalParaAtivo`); a recusa aparece na hora, com `erro.<codigo>`, sem ir à fila;
  - a gravação vira operação `ativo.cadastrar` ou `ativo.alterar`, e os cadastros aguardando envio aparecem na tela;
  - a alteração leva a versão guardada, e a referência passa à versão seguinte, para uma segunda alteração sem rede sair em ordem. Se a primeira for recusada, a segunda também volta com `conflito_de_versao`, na lista de recusadas da fila do dia, até o técnico dispensar (ADR-029).
- **Textos:** a tela reaproveita as chaves `admin.ativos.*` (catálogo compartilhado) e acrescenta 8 `tecnico.ativos.*` nos quatro idiomas.
- **Aceite** (`apps/tecnico/test/ativos.test.ts` e `telas-ativos.test.tsx`):
  - a referência é do usuário e do tenant;
  - sair apaga só a de quem sai, e ela não volta ao reabrir;
  - `lerReferencia` monta pelos contratos, e qualquer erro dá null;
  - `ativo.cadastrar` sai no contrato; a alteração com versão velha fica rejeitada com `conflito_de_versao`;
  - a tela nos quatro idiomas e no pseudo-idioma.
- **Pendência de texto:** o ADR-025 (ajuste (b)) ainda diz que o aparelho só guarda a fila. A atualização vai num PR de zona protegida (`docs/03`), depois do #48.

### Ponto de retomada (28/09/2026, etapa B depois da B3 e da B3b, sessão longa)
- **`main`:** `807f542`, o merge do #47 (0014).
- **Dev:** 14 migrações, até a 0014, iguais às da `main`; `pnpm db:testar-dev` com 355 ok em 12 arquivos.
- **PR aberto:** [#48](https://github.com/cesarcoutohubtech/hubkeep/pull/48), B3, migração 0015. A CI está verde fora a zona protegida: pgTAP com o 013 e o meta-teste 18, lint, typecheck e testes. Espera do Cesar:
  - o merge;
  - o `db push` da 0015;
  - a decisão sobre trocar o ativo de local (abaixo).
- **Branch enviada sem PR:** `1a-b3b-ativos-pwa` (B3b, fora da zona protegida), feita a partir de `1a-b3-ativos`. O PR abre depois do merge do #48, com a base atualizada para a `main`. Este ponto de retomada está nela.
- **Worktrees em `C:\Cesar\HubKeep\Dev\wt\`:**
  - `b3-ativos` (branch `1a-b3-ativos`, todo enviado);
  - `b3b-ativos-pwa` (branch `1a-b3b-ativos-pwa`, todo enviado);
  - `b1-locais`, `b2-categorias`, `politica-sem-proprietario` e `decisoes-etapa-b`, de branches já mergeadas, que podem ser removidos com `git worktree remove`.

  Nenhum trabalho local fora do GitHub.
- **Decisões pendentes:**
  - trocar o ativo de local: hoje é desativar e cadastrar de novo; mover exige exceção no meta-teste 18 para `app.ativo.local_id` e adendo ao ADR-011;
  - o texto do ADR-025 (ajuste (b)) passa a citar a referência guardada no aparelho (B3b), num PR de zona protegida depois do #48.
- **Próxima tarefa:**
  1. depois do merge do #48 e do `db push`, conferir o dev só por leitura: histórico até a 0015 e `pnpm db:testar-dev` (esperado: 381 ok em 13 arquivos, os 355 mais os 26 do 013);
  2. abrir o PR da B3b: `git rebase origin/main` na worktree `b3b-ativos-pwa`, push e `gh pr create --base main`;
  3. **B4, anexos de local e ativo** (migração, `app.anexo`; talvez ajuste do ADR-024 para o download do proprietário). Primeiro passo: `git worktree add C:/Cesar/HubKeep/Dev/wt/b4-anexos -b 1a-b4-anexos origin/main`, depois ler o ADR-024 e o fluxo de upload da F0-10 (`auth-admin`, URL assinada).

### Dev conferido depois da 0015 (28/09/2026)
- O Cesar mergeou o #48 e rodou `db push` da 0015.
- Conferência só de leitura: o histórico do dev tem as 15 migrações da `main`, até a 0015.
- `pnpm db:testar-dev` passou inteiro: 381 testes ok em 13 arquivos, com o 013 (ativos, 26 casos).

### Decisões do Cesar depois do #48 (28/09/2026)
- **Mover ativo:** só dentro do mesmo hotel, por uma ação própria de mover, restrita a quem gere o hotel, auditada e com registro de cada movimentação (origem, destino, quando, quem).
  - O `hotel_id` continua imutável. A exceção no meta-teste 18 vale só para `app.ativo.local_id`, com adendo ao ADR-011.
  - Entre hotéis, continua desativar e cadastrar de novo.
  - Entra como tarefa da etapa B: **B3c** no `docs/05`.
- **ADR-025:** o texto do ajuste (b) passa a citar a referência guardada no aparelho (B3b), num PR de zona protegida. Um PR de zona protegida por vez.
- **Kit de teste no notebook:** ao fim da etapa C, antes da D, preparar o kit (variáveis do `.env.local` com onde achar cada valor, script de demonstração só para o dev com um usuário por papel criado sem e-mail, roteiro de teste por papel e comandos do PowerShell para subir o web e o PWA). O trabalho para quando o kit estiver pronto. Registrado no `docs/05`, entre as etapas C e D.

### B3c — Mover ativo dentro do hotel (migração 0016, adendo ao ADR-011)
- **Banco** (`20260928225415_mover_ativo.sql`):
  - `grant update (local_id)` em `app.ativo`: segunda exceção nomeada do meta-teste 18 (a primeira é `app.hotel.bandeira_id`). O `hotel_id` continua imutável, e a FK `(hotel_id, local_id)` da 0015 recusa um local de outro hotel com ou sem a checagem da aplicação;
  - `app.ativo_movimentacao`: uma linha por movimentação (origem, destino, quando, quem), só INSERT, com FKs compostas para hotel, ativo, os dois locais e o membro, e check de locais distintos;
  - RLS: lê quem lê o hotel; grava quem escreve no hotel e só em nome do usuário do contexto. **Proposta:** o proprietário não lê movimentações no MVP.
- **Regra de ação** (`packages/dominio`): `podeMoverAtivo` (os papéis que gerem locais do hotel) e `validarMovimentacao` (`ativo_desativado`, `mover_ativo_entre_hoteis`, `mover_ativo_mesmo_local`, `mover_ativo_local_inativo`).
- **Caso de uso e repositório:** `mover` e `listarMovimentacoes`. `moverAtivo` lê com FOR UPDATE, confere a versão (ADR-029), troca o local, grava a movimentação, a auditoria `mover` e o evento `ativo.movido` na mesma unit of work.
- **API e tela:** `POST /api/v1/ativos/{id}/movimentacao` e `GET /api/v1/ativos/{id}/movimentacoes`; em `/admin/ativos`, "Mover" com a lista de destinos e o histórico. 5 textos e 5 códigos de erro nos quatro idiomas.
- **Aceite:**
  - pgTAP 013 (30 casos: mover no hotel, recusa para local de outro hotel, o dono da UH antiga deixa de ver) e 014 novo (20 casos de isolamento da movimentação);
  - `packages/db/test/mover-ativo.test.ts`: movimentação, auditoria e evento; recusas sem gravar nada; sem as regras da aplicação, o banco ainda barra.
- **Entre hotéis:** continua desativar e cadastrar de novo.

### Decisões do Cesar e dev conferido depois da 0016 (28/09/2026)
- **Dev:** 16 migrações, até a 0016; `pnpm db:testar-dev` com 405 ok em 14 arquivos.
- **Aprovados:** o adendo do ADR-025 (dados guardados no aparelho), o do ADR-011 (mover ativo dentro do hotel) e o do ADR-024 (registro do anexo e download do proprietário, B4).
- **Confirmado:** o proprietário não lê o histórico de movimentações no MVP. Pergunta registrada para a reunião com o cliente (`docs/05`): em condo-hotel, os equipamentos da UH podem ser do proprietário, e a saída de um deles da UH pode precisar ficar visível para ele.
- **Confirmado:** o proprietário não vê os anexos do hotel, só os dos locais e ativos dele.
- **Miniatura também no web:** o mesmo código de compressão e miniatura do PWA, para as fotos enviadas pelo computador também terem miniatura.

### B4 — Anexos de local e ativo (migração 0017, adendo ao ADR-024)
- **Banco** (`20260928233727_anexo.sql`): `app.anexo`, uma linha por arquivo do hotel, de um local ou de um ativo, com FKs compostas pelo hotel. Um check exige que o caminho do arquivo e o da miniatura comecem por `{tenant}/{hotel}/{entidade}/{registro}` da própria linha. Exclusão lógica (`removido_em`, `removido_por`, só em nome do usuário do contexto).
  - RLS: lê quem lê o hotel; o proprietário lê os anexos dos locais dele e dos ativos que estão hoje nesses locais (um ativo movido leva os anexos). Grava quem escreve no hotel.
- **Regra de ação** (`packages/dominio`): nome do anexo, miniatura do mesmo registro e `podeRemoverAnexo` (quem enviou ou quem gere os locais do hotel).
- **Caso de uso e repositório:** registrar confere o caminho como o download (formato, tenant, registro visível, escrita no hotel) e grava com auditoria (`anexo`, `criar`) e evento `anexo.registrado`; remover grava auditoria e `anexo.removido`; listas sem o caminho.
- **API:** `POST /api/v1/anexos`, `GET /api/v1/{hoteis|locais|ativos}/{id}/anexos`, `POST /api/v1/anexos/{id}/url-de-download` (arquivo ou miniatura) e `POST /api/v1/anexos/{id}/remocao`.
- **Telas:** anexos em `/admin/locais` e `/admin/ativos`; no PWA, "Fotos" no ativo, com rede (a fila offline de fotos entra com a C4).
- **Miniatura:** `packages/imagem` (novo), o código de canvas que era do PWA, usado pelo PWA e pelo web; imagem sai em JPEG de 1600 px com miniatura de 320 px, PDF vai como está. Fronteiras: só as telas do web e o PWA importam; o pacote não importa pacote externo nem módulo do Node.
- **Textos:** 11 do web, 9 do PWA e 7 códigos de erro nos quatro idiomas.
- **Aceite:**
  - pgTAP 015 (30 casos: isolamento, checks de caminho, remoção, proprietário por UH e por hotel inteiro, ativo movido);
  - `packages/db/test/anexos.test.ts`, com banco real: anexo de outro hotel dá 404, o proprietário da UH baixa a miniatura, auditoria e evento, e o banco barra sem as regras da aplicação;
  - testes da aplicação, do PWA, do envio pelo web e das fronteiras.

### B5 — QR individual do ativo (migração 0018)
- **Banco** (`20260929002134_codigo_qr_ativo.sql`): `codigo_qr` em `app.ativo`, obrigatório, com 10 caracteres do alfabeto de Crockford em maiúsculas (check), único no tenant e sem GRANT de UPDATE (o código impresso não muda). Os ativos que já existem recebem um código na própria migração, uma vez só; daqui em diante, só a aplicação gera. Sem função nova.
- **Domínio** (`qr.ts`): o alfabeto, `codigoQrDeBytes` (os bytes aleatórios vêm de fora; o domínio não faz IO), `lerCodigoQr` (aceita minúsculas, hífens e espaços, O por 0, I e L por 1) e `caminhoDoQr`.
- **Geração:** `novoCodigoQr` em `packages/db/src/ids.ts`, com `crypto.getRandomValues` (50 bits), no `criarAtivo`: vale para o cadastro do web e para o da fila offline. O código vai na auditoria do cadastro.
- **API:** `GET /api/v1/ativos/qr/{codigo}` devolve o ativo e o hotel. Código mal formado, de outro tenant ou fora do escopo dá o mesmo 404 (`ativo_nao_encontrado`), pela RLS. `AtivoApi` passa a ter `codigoQr`.
- **Web:** "Ver QR" em `/admin/ativos`. A matriz do QR é calculada no navegador pela `uqr` (dependência nova do web, MIT, sem dependências) e o SVG sai do componente, sem `innerHTML`. O endereço impresso é `NEXT_PUBLIC_URL_DO_TECNICO` + `/q/<codigo>` (variável nova no `.env.example`); sem ela, a tela avisa em vez de gerar um QR errado.
- **PWA:** `/q/<codigo>` abre o ativo depois do login e da leitura da referência guardada: pelo aparelho, sem rede, se o ativo estiver guardado; senão, com rede, pela API; sem rede e sem o ativo, avisa (`qr_sem_rede`). A tela de ativos abre no hotel do ativo, com ele aberto, e o caminho volta para `/`. O service worker já serve o `index.html` em qualquer navegação; `apps/tecnico/vercel.json` faz o mesmo no primeiro acesso.
- **Textos:** 5 do web e 2 códigos de erro do PWA nos quatro idiomas.
- **Aceite:**
  - pgTAP 013 com 9 casos novos (39): formato, obrigatório, único no tenant e repetível em outro, não alterável, e a busca pelo código só dentro do escopo (outro tenant, outro hotel, UH de onde o ativo saiu);
  - `packages/db/test/ativos.test.ts`: o cadastro gera códigos distintos no formato; o proprietário abre pelo código digitado em minúsculas; o gerente de outro hotel e o código mal formado dão 404; o código está na auditoria;
  - testes do domínio, do PWA (aparelho sem rede, API, 404, código mal formado, tela aberta pelo QR) e do web (endereço e SVG).
- **Fora da B5:** etiqueta de impressão e QR em lote (1b, como no plano).

### B6 — Busca sem acento (migração 0019, ADR-030)
- **Banco** (`20260929005255_busca_sem_acento.sql`): extensão `pg_trgm` em `extensions`; coluna `busca` (`text not null`, sem default) em `app.local` e `app.ativo`, com índice GIN de trigramas; os registros existentes preenchidos uma vez, com `translate()` e `lower()`, antes do `set not null`; GRANT de UPDATE da coluna para hk_app (nos dois) e hk_worker (no local, pela promoção). Sem função nova.
- **Normalização:** `textoDeBusca` em `packages/i18n`, reexportada por `packages/aplicacao` junto com `termoDeBusca` (a fronteira de `db` não mudou). O texto da coluna sai só de `packages/db/src/repositorios/busca.ts`, que devolve os campos pesquisáveis com a busca; `busca-unica.test.ts` varre os fontes do pacote para que nenhum outro trecho escreva a busca ou um campo pesquisável direto.
- **Gravação:** cadastro e alteração de área comum e de ativo, criação e atualização de UH na promoção do CM.
- **API:** `?busca=` nas listas de locais e de ativos do hotel; `busca_curta` (422) abaixo de 3 caracteres; `%`, `_` e barra são texto. OpenAPI com o parâmetro.
- **Telas:** campo de busca em `/admin/locais` e `/admin/ativos` (vai à API); no PWA, filtro dos ativos guardados, sem rede, com a mesma função.
- **Textos:** 4 da busca e o erro `busca_curta`, nos quatro idiomas.
- **Aceite:**
  - pgTAP 001 com os meta-testes 25 (extensões) e 26 (índices de trigramas); 013 com 4 casos (busca obrigatória; busca por trecho no escopo do gerente e do outro tenant; worker não grava a busca do ativo), 43 no total; as fixtures de todos os arquivos gravam a coluna;
  - integração (só na CI): `ativos.test.ts` ("acucar", "FRIG", fabricante, curingas como texto, dono da outra UH não acha, `busca_curta`, alterar regrava, renomear atualiza a coluna), `locais.test.ts` (trecho, sem acento, alterar regrava) e `ingestao.test.ts` (promoção grava a busca da UH);
  - unitários: i18n (inclusive o mesmo resultado do `translate()` da migração), aplicacao, padrão do ILIKE, PWA e web.
- **Decisão do Cesar (29/09/2026):** coluna obrigatória e sem default, com o cálculo num único lugar do repositório (a primeira versão tinha `default ''`).
- **Fora da B6:** a coluna do chamado entra na C2, com a tabela.

## Etapa C — Corretiva

### C1 — Domínio da corretiva (migração 0020, ADR-027)
- **Domínio** (`corretiva.ts`): estados canônicos do chamado e da OS, as transições com o reflexo da OS no chamado, e quem faz cada uma, por papel e escopo (`decidirNoChamado`, `decidirNaOs`, `podeAbrirChamado`, `podeTriar`, `normalizarMotivo`). O resumo das regras está no bloco de implementação do ADR-027, no `docs/03`.
- **Domínio** (`situacoes.ts`):
  - situações e prioridades padrão;
  - validação de nome (quatro idiomas, com volta ao catálogo), ordem, cor, peso e estado;
  - `situacaoPara` (situação ao entrar num estado);
  - última ativa do estado e última prioridade não saem;
  - `prioridadePadraoDoChamado`, com a política já resolvida hotel → grupo → padrão.
- **Banco** (`20260929112214_situacao_prioridade.sql`): `app.situacao` e `app.prioridade`, do tenant, com `nomes jsonb` e `chave_padrao` como a categoria; lê o Admin e quem tem papel vigente (inclusive o proprietário, que vai ver a situação e a prioridade do chamado da UH dele na C2); grava só o Admin; sem DELETE; entidade, estado e chave padrão sem UPDATE; `unique (tenant_id, id)` para as FKs compostas da C2 e da C3. Sem função nem trigger.
- **Aplicação e API** (sem tela, como pede o plano):
  - `GET /api/v1/situacoes-e-prioridades` e `POST .../padrao` (idempotente);
  - `POST /api/v1/situacoes` e `PUT /api/v1/situacoes/{id}`, com desativação e reativação;
  - as mesmas rotas para `/api/v1/prioridades`;
  - OpenAPI com as rotas.
- **Contratos:** estados, ações, entidades e prioridades padrão repetidos do domínio; `tests/contratos-dominio` compara.
- **Textos:** 21 códigos de erro e os nomes das 12 situações e 4 prioridades padrão, nos quatro idiomas.
- **Aceite:**
  - domínio: `corretiva.test.ts` percorre toda ação × estado × papel (14 atores, inclusive vencido, revogado, outro hotel e outra bandeira) contra tabelas esperadas escritas à mão, mais motivo, OS reatribuída e quem abriu; `situacoes.test.ts` cobre padrões, validações, situação ao entrar no estado e a prioridade padrão pela política nos três níveis;
  - pgTAP `016_isolamento_situacao_prioridade` (35 casos): os seis casos nas duas tabelas, só o Admin grava, campos fixos, sem DELETE, worker;
  - integração (só na CI, `situacoes.test.ts`): instalação idempotente, leitura pelo técnico e pelo proprietário de hotel inteiro, recusas com código, última ativa, paridade com a checagem removida, auditoria.
- **Decisões do Cesar (29/09/2026)**, aplicadas no PR de ajustes da C1:
  1. o Admin do grupo fica num grupo à parte (`administracao`, `PAPEIS_DA_ADMINISTRACAO`), porque terá alçadas e permissões a mais que o Gestor CSC e o Gerente; hoje faz as mesmas ações de gestão que a triagem, e não aceita nem executa;
  2. sem regra para a categoria, o chamado nasce na prioridade ativa de menor peso (mantido);
  3. cancelar a OS devolve o chamado à triagem, para ganhar outra OS (antes, cancelava o chamado). A C3 precisa aceitar mais de uma OS por chamado, com uma só em andamento;
  4. o Gerente e o Gestor não executam a OS no lugar do técnico (mantido);
  5. técnico que não responde pela OS recebe 409 (mantido).
- **Meta-teste 26 vermelho desde a B6:** o PR da B6 (#54) e o da C1 (#55) foram mergeados com o pgTAP falhando no 001: "could not determine which collation to use", porque os nomes do catálogo têm collation "C" e os valores esperados, a padrão. As migrações aplicaram, e os outros arquivos do pgTAP passaram; o 001 parava no teste 26. Corrigido com `collate "default"` no PR de ajustes. O `db push` da 0019 e da 0020 espera esse PR ficar verde. Lição: no relatório ao Cesar, não chamar de pendente uma CI que ainda não terminou sem avisar que o merge deve esperar o verde.

### C2 — Chamado (migração 0021)
- **Banco** (`20260929120937_chamado.sql`):
  - `app.chamado`: local obrigatório, ativo opcional, descrição, `busca` (ADR-030, com índice de trigramas), estado, situação, prioridade, `politica_aplicada` (ADR-026), `aberto_por` e `versao` (ADR-029), com FKs compostas para hotel, local, ativo, situação, prioridade e membro;
  - lê quem lê o hotel, o proprietário da UH do chamado e o do hotel inteiro; abre quem tem escrita no hotel, só em nome dele mesmo; sem UPDATE nesta migração (a C3 concede o que a triagem altera); sem DELETE;
  - `app.anexo` ganha a entidade `chamado` (coluna `chamado_id`, FK pelo hotel, checks de registro e caminho refeitos), e o proprietário lê a foto dos chamados que vê.
- **Domínio** (`chamados.ts`): descrição (1 a 2000, quebras de linha mantidas), UH pendente de licença e local desativado recusados, ativo no local e ativo, e a cópia da política aplicada.
- **Aplicação** (`casos-de-uso/chamados.ts`):
  - `prepararAbertura`, a mesma no web e na operação offline: quem abre (`podeAbrirChamado`), local, ativo, descrição, prioridade padrão pela política (hotel → grupo → padrão) e situação inicial;
  - `abrir` e `chamado`.
- **Operação offline** `chamado.abrir` (contrato, sincronização e sessão da unit of work): o reenvio devolve a resposta guardada, sem abrir outro chamado.
- **API:** `POST /api/v1/chamados`, `GET /api/v1/chamados/{id}` e `GET /api/v1/chamados/{id}/anexos`; os anexos aceitam a entidade `chamado` (a foto vai depois da abertura, pelas rotas de anexo). OpenAPI com as rotas.
- **PWA:** tela "Abrir chamado", sem rede, a partir da referência guardada (locais e ativos); a UH pendente aparece e é recusada com o motivo; a operação vai para a fila, e a recusa do servidor aparece na fila do dia.
- **Textos:** 11 do PWA, 6 códigos de erro e o rótulo da operação, nos quatro idiomas.
- **Aceite:**
  - domínio: `chamados.test.ts`;
  - pgTAP `017_isolamento_chamado` (28 casos): os seis casos (inclusive o proprietário de UH e de hotel inteiro e a foto), abertura só em nome próprio, sem UPDATE, sem DELETE, worker; meta-teste 26 com o índice do chamado;
  - integração (só na CI, `chamados.test.ts`): o Solicitante abre com a prioridade da política e a cópia; mudar a política depois não altera o chamado; sem categoria, a de menor peso; o reenvio offline não duplica; UH pendente, ativo de outro local e descrição vazia com código; isolamento do proprietário (vê e não grava, e a RLS barra sem a checagem) e do gerente de outro hotel; auditoria e evento `chamado.aberto`;
  - `busca-unica.test.ts` cobre o chamado; PWA com a tela nos quatro idiomas e no pseudo-idioma.
- **Fora da C2:**
  - a foto sem rede no PWA entra com a OS (C4), junto com a fila de fotos;
  - a tela de abertura no web e as listas entram na C7;
  - o chamado ainda não tem número legível para o usuário (hoje, só o id); fica para a C7, se o cliente pedir.

### Ponto de retomada (29/09/2026, etapa B concluída, PR da B6 aberto)
- **`main`:** `a5dd03d` (#53, B5). **Dev:** 18 migrações, até a 0018; 444 ok em 15 arquivos.
- **PR aberto:** B6, branch `1a-b6` (worktree `wt/b6-busca`, branch local `1a-b6-busca`; push com `git push origin HEAD:1a-b6`), zona protegida, migração 0019. Conferir na CI o pgTAP 001 (27) e 013 (43), os testes de integração de ativos, locais e ingestão, e o `kysely-codegen --verify` (`busca` como `string`). Depois do merge: `db push` da 0019 (Cesar) e conferir o dev.
- **Worktrees removíveis em `C:\Cesar\HubKeep\Dev\wt\`:** `b1-locais`, `b2-categorias`, `b3-ativos`, `b3b-ativos-pwa`, `b3c-mover-ativo`, `b4-anexos`, `b5-qr`, `adr-025-referencia`, `politica-sem-proprietario`, `decisoes-etapa-b`. Branches remotos velhos: `1a-b3c-mover-ativo`, `1a-b4-anexos`, `1a-b4`, `1a-b5`, `1a-b5-qr` e `1a-b6-busca`.
- **Próxima tarefa:** etapa C a partir da C1 (domínio da corretiva, `docs/05`), no local, sobre o `1a-b6-busca`; o kit de teste no fim da C (parar quando pronto).

### Ponto de retomada (29/09/2026, etapa C: C1 mergeada, PR da C2 aberto)
- **`main`:** `8375bff` (#56). **Dev:** 20 migrações, até a 0020; 485 ok em 16 arquivos (conferido depois do `db push` da 0019 e da 0020).
- **PRs abertos:**
  - #57, correção do teste de busca da B6, fora da zona protegida, CI verde: falta o merge do Cesar;
  - #58, C2, zona protegida, migração 0021, branch `1a-c2`, que parte do commit do #57. Conferir na CI o pgTAP 001 (27) e 017 (28), a integração `chamados.test.ts` e o `kysely-codegen --verify`. Depois do merge: `db push` da 0021 (Cesar) e conferir o dev.
- **Regra reforçada:** merge só com a CI verde. O check `zona protegida` fica vermelho em todo PR de zona protegida, e isso é esperado; o pgTAP, não.
- **Worktree:** `wt/b6-busca` na branch `1a-c2`. As branches locais `1a-b6-busca`, `1a-c1`, `1a-c1-ajustes` e `1a-b6-teste-busca` já estão no remoto e podem sair. Os worktrees removíveis são os do ponto anterior.
- **Decisões do Cesar em vigor (C1):**
  - o Admin do grupo é um grupo à parte da triagem;
  - OS cancelada devolve o chamado à triagem, então a C3 precisa aceitar mais de uma OS por chamado, com só uma em andamento.
- **Próxima tarefa:** C3 (triagem e atribuição, `app.os`), no local, sobre a `1a-c2`.
  - Primeiro passo: ler a C3 no `docs/05`, `TRANSICOES_DA_OS` em `corretiva.ts`, a migração 0021 e a A6 (equipes).
  - O PR da C3 só abre depois do merge do #58.
  - O kit de teste fica para o fim da etapa C, e o trabalho para quando o kit estiver pronto.

### S1 — Segurança (pedido do Cesar antes de seguir na C, ADR-032)
- **Modelo de ameaças** em `docs/09-seguranca-ameacas.md`: ativos, atores (outro tenant, técnico mal-intencionado, proprietário, atacante externo, agente de código), superfícies (web, API, PWA, ingestão, storage, cron, repositório e CI), controle e status por ameaça, e checklist do ASVS 5.0 nível 2 por capítulo.
- **Feito agora:**
  - **Cabeçalhos no web:**
    - CSP com nonce pelo `proxy.ts`; todas as páginas já eram dinâmicas;
    - HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options`, COOP e `Permissions-Policy` pelo `next.config.ts`;
    - `Cache-Control: no-store` na API;
    - cabeçalhos básicos no `vercel.json` do PWA.
  - **Sessão em cookie HttpOnly, SameSite=Lax e Secure em produção.** O login continua direto no Auth, só em memória. Os tokens vão na hora para `POST /auth/sessao`; saída e senha nova também passam pelo servidor. O `cliente/supabase.ts` saiu.
  - **CSRF:** origem conferida no proxy, com 403 `origem_recusada` e linha de log.
  - **Lint:** `sql.raw` e identificador dinâmico só em `packages/db`; HTML cru proibido em todo lugar.
  - **CI (`seguranca.yml`):** gitleaks no histórico e Semgrep. Actions por SHA, CLI do Supabase em versão fixa (2.118.0) e Dependabot das actions. `.gitleaks.toml` e o Dependabot entram na zona protegida.
  - **Bucket:** conferido que não aceita SVG nem HTML. O pgTAP 001 passou no dev depois do `db push` da 0021, e o teste novo prende as listas.
  - **Senha:** mínimo de 8 no `config.toml`. No dev, só depois do `config push` (Cesar).
- **Semgrep no local** (venv na pasta temporária da sessão, 1.178.0): dois achados.
  - TLS sem conferir o certificado, em `conexao.ts` e `ambiente.ts`. Ficam com `nosemgrep` e viraram a pendência P6.
  - A regra `unsafe-add-mask-workflow-command`, excluída com o motivo no workflow.
  - O gitleaks não rodou no local (sem o binário na máquina); a primeira rodada é a da CI.
- **Listado sem implementar** (`docs/09`, seção 7): rate limiting com onde, ferramenta e custo (P1), endurecimento do banco de produção (P2), pentest antes do rollout (P3), e as pendências P4 a P13 do levantamento.
- **Aceite:**
  - `apps/web/test/seguranca.test.ts`: CSRF, CSP, cabeçalhos, proxy e cookie;
  - `tests/fronteiras.test.ts`, com 17 casos novos;
  - `tests/anexos-sem-html.test.ts`;
  - integração (só na CI, `autenticacao.test.ts`): cookie HttpOnly no convite, senha nova pelo servidor, entrada por `/auth/sessao`, token forjado recusado sem cookie e saída apagando o cookie.

### Ponto de retomada (29/09/2026, S1 aberta, C3 a seguir)
- **`main`:** `c34a8bb` (#58). **Dev:** 21 migrações, até a 0021; 513 ok em 17 arquivos (conferido depois do `db push` da 0021).
- **PR aberto:** S1, branch `1a-s1` (worktree `wt/b6-busca`), zona protegida.
  - Tem CI nova (`segurança`: gitleaks e Semgrep). Se o gitleaks acusar algum fixture de teste, a exceção vai para o `.gitleaks.toml` com o motivo.
  - Depois do merge, o Cesar decide sobre o ADR-032, que está como proposta, e faz o `config push`, que leva a senha mínima de 8 ao dev.
- **Depois do merge, nada muda no banco:** não há migração.
- **Próxima tarefa:** C3 (triagem e atribuição, `app.os`), a partir da `main` depois do merge da S1.
  - Primeiro passo: ler a C3 no `docs/05`, `TRANSICOES_DA_OS` em `corretiva.ts`, a migração 0021 e a A6 (equipes).
  - Decisões da C1 em vigor: o Admin do grupo é um grupo à parte; OS cancelada devolve o chamado à triagem, com mais de uma OS por chamado e só uma em andamento.
  - O kit de teste fica para o fim da etapa C, e o trabalho para quando o kit estiver pronto.

### S1 mergeada e ADR-032 aprovado (29/09/2026)
- **#59 mergeado** (`main` em `c06bfd0`). O Cesar fez o `config push`. Só a senha mínima mudou, de 6 para 8, e a leitura pela Management API confirma `password_min_length: 8`. A API apareceu como "up to date", sem o falso `api.enabled` que o docs/06 previa.
- **ADR-032 aprovado pelo Cesar, com condições:**
  1. Certificado do banco conferido agora, no dev.
  2. Limite de tamanho do pedido em todas as rotas.
  3. Actions por SHA com a versão em comentário.
  4. Tarefas antes do piloto: MFA obrigatório para Admin do grupo, Gestor CSC e Implantador; CSP de script no PWA; rate limiting junto com o Vercel Pro.
  5. Pentest antes do rollout.
- As condições 1 a 3 vão num PR próprio (S2), antes da C3. A 4 e a 5 entraram no `docs/05` (SP1 a SP4).

### S2 — Condições 1 a 3 do ADR-032
- **Certificado do banco:**
  - Antes de mexer, conferi com o openssl: o pooler do dev (portas 5432 e 6543) apresenta a cadeia `*.pooler.supabase.com` → Supabase Intermediate 2021 CA → Supabase Root 2021 CA, e a verificação com CA e nome do host passa. Com outro nome, falha.
  - O Cesar baixou a CA do painel para `C:\Cesar\HubKeep\Dev\certificados\prod-ca-2021.crt`, fora do git. A impressão digital bate com a raiz que o pooler apresenta (`80:70:25:AD:…:CA:FA`).
  - O conteúdo da CA entrou no git, por ser público: `packages/db/src/ca-supabase.ts` e a cópia em `packages/db/certificados/`.
  - `criarPool` usa `rejectUnauthorized: true` com a CA e recusa URL com `sslmode`/`ssl`. O pg aplicaria esses parâmetros por cima da opção, e `sslmode=no-verify` desligaria tudo sem erro.
  - Aperto de mão TLS pelo Node, sem login: autoriza com a CA; sem ela dá `SELF_SIGNED_CERT_IN_CHAIN`; com nome errado, `ERR_TLS_CERT_ALTNAME_INVALID`.
  - **Achado:** o `db:types` conectava ao dev **sem TLS**. O kysely-codegen tenta TLS sem conferir e, se falhar, cai para conexão aberta, e o dev aceita ("Enforce SSL" desligado, lido pela Management API). Agora ele passa por `scripts/ops/gerar-tipos.mjs`, com `verify-full` e a CA. Ligar o "Enforce SSL" no dev fica como sugestão ao Cesar.
  - Também conferem o certificado: os scripts de operação (`ambiente.ts`), o `db:fumaca` e o psql do `db:testar-dev` (`verify-full`).
  - Conferido no dev: o `db:types` conecta e gera o `tipos-banco.ts` idêntico; o `db:testar-dev` pelo psql com `verify-full` dá 513 ok em 17 arquivos.
  - Os dois `nosemgrep` saíram.
- **Limite do corpo:**
  - A `rota()` aplica `LIMITE_BYTES_PADRAO` (256 KiB) a toda rota que não declara outro.
  - A leitura é em fluxo e cancela o envio ao passar do limite, em vez de ler tudo para depois medir.
  - O `proxy.ts` recusa com 413 o `content-length` acima de `LIMITE_BYTES_MAXIMO` (o do lote, 4 MiB), inclusive fora da `rota()`.
  - `tests/corpo-limitado.test.ts` reprova rota que leia o `Request` direto.
- **Actions:** os pins por SHA vieram da S1. Agora `tests/actions-fixadas.test.ts` reprova `uses:` sem SHA ou sem `# vX.Y.Z` e imagem sem digest.
- **Docs:**
  - ADR-032 aprovado com as condições (`docs/03`);
  - SP1 a SP4 no `docs/05`;
  - S2, P6 resolvida e P1/P3/P4/P5 decididas no `docs/09`;
  - seção de TLS no `docs/06`.

### Ponto de retomada (29/09/2026, S2 aberta, C3 a seguir)
- **`main`:** `c06bfd0` (#59). **Dev:** 21 migrações, até a 0021; senha mínima de 8 aplicada. 513 ok em 17 arquivos, pelo psql com `verify-full`.
- **PR aberto:** S2, branch `1a-s2` (worktree `wt/b6-busca`), zona protegida (`docs/03`), sem migração. Depois do merge, nada muda no banco nem na configuração do dev.
- **Próxima tarefa:** C3 (triagem e atribuição, `app.os`), a partir da `main`. A C3 pode andar no local enquanto a S2 espera o merge; o PR dela só abre depois do merge da S2.
  - Primeiro passo: ler a C3 no `docs/05`, `TRANSICOES_DA_OS` em `corretiva.ts`, a migração 0021 e a A6 (equipes).
  - Decisões da C1 em vigor: o Admin do grupo é um grupo à parte; OS cancelada devolve o chamado à triagem, com mais de uma OS por chamado e só uma em andamento.
  - O kit de teste fica para o fim da etapa C, e o trabalho para quando o kit estiver pronto.

### C3 — Plano (29/09/2026, antes de implementar)
Levantamento feito na `main` `c06bfd0`. Decisões de desenho, dentro do que a C1 e o ADR-027 já fixaram:
- **Migração 0022** (`supabase migration new os`):
  - `app.os`: `id`, `tenant_id`, `hotel_id`, `chamado_id`, `estado` (check de formato, como o chamado), `situacao_id`, `tecnico_id` **ou** `equipe_id` (check: exatamente um), `motivo_cancelamento` (até 500), `criado_por`, `versao`, `criado_em`, `atualizado_em`.
    - FKs compostas: `(hotel_id, chamado_id)` → chamado, `(hotel_id, equipe_id)` → equipe, `(tenant_id, tecnico_id)` → membro, `(tenant_id, situacao_id)` → situação, `(tenant_id, criado_por)` → membro. `unique (tenant_id, id)` e `unique (hotel_id, id)`, para a C4.
    - O técnico se chama `tecnico_id`, não `usuario_id`: o meta-teste 18 proíbe UPDATE em `usuario_id`, e a reatribuição troca o responsável.
    - **Uma OS não cancelada por chamado:** índice único parcial `(hotel_id, chamado_id) where estado <> 'cancelada'`. É integridade, como a parada da C5. O 23505 vira `Conflito('os_em_andamento')`.
  - Grants de `app.os`: select e insert; update só em `estado, situacao_id, tecnico_id, equipe_id, motivo_cancelamento, versao, atualizado_em`.
  - Policies de `app.os`: `app_select` como o chamado (leitura no hotel, proprietário da UH ou do hotel pelo chamado); `app_insert`/`app_update` só com `authz.hoteis_com_papel(array['admin_grupo','gestor_csc','gerente_hotel'])`. A C4 amplia o update para o responsável.
  - `app.chamado` ganha `motivo_cancelamento`. UPDATE em `estado, situacao_id, prioridade_id, motivo_cancelamento, versao, atualizado_em`, com a mesma policy de triagem. A C4 (concluir) e a C6 (aceite) ampliam.
  - pgTAP `018_isolamento_os.test.sql` com os seis casos. No `017`, o caso do UPDATE muda: o gerente altera a prioridade (ok), o solicitante não (42501) e a descrição segue sem UPDATE.
- **Domínio:**
  - Checagem de quem pode receber a OS: o técnico tem papel `tecnico` vigente que cobre o hotel; a equipe é do hotel e está ativa. Códigos novos nos quatro idiomas.
  - Ajuste de prioridade só com prioridade ativa, pelo `podeTriar` e com o chamado em `aberto`, `em_triagem` ou `em_execucao`.
  - Transições pelo `decidirNoChamado`/`decidirNaOs` que já existem.
- **Aplicação e API** (todas com `versao` e 409 `conflito_de_versao`):
  - `POST /api/v1/chamados/{id}/triagem` (`aberto` → `em_triagem`, com prioridade opcional);
  - `POST /chamados/{id}/prioridade`;
  - `POST /chamados/{id}/cancelamento` (com motivo);
  - `POST /chamados/{id}/os` (gerar, com o responsável; o chamado vai a `em_execucao`);
  - `POST /os/{id}/reatribuicao`;
  - `POST /os/{id}/cancelamento` (com motivo; o chamado volta a `em_triagem`);
  - `GET /chamados/{id}` passa a trazer as OS.
  - Situação sempre pela `situacaoPara`.
  - Auditoria e evento no repositório: `chamado.triado`, `chamado.prioridade_alterada`, `chamado.cancelado`, `os.atribuida` (gerar e reatribuir, com o responsável no payload) e `os.cancelada`. O `os.atribuida` fica pendente no outbox até a 1c, sem handler.
  - O `podeTriar`/`decidir*` é injetável, como o `podeAbrir`, para o teste provar que a RLS recusa sozinha.
- **Testes:**
  - domínio;
  - integração em `packages/db/test/os.test.ts`: papéis, reenvio, conflito de versão, uma OS ativa, cancelar e gerar outra, auditoria e outbox;
  - OpenAPI;
  - tipos regenerados (`pnpm db:types` só depois do `db push` da 0022; antes, na CI com `--verify`).
- **Fora da C3:** equipes do ator (`AtorDaCorretiva.equipes`, C4), anexo da OS (C4) e a fila do PWA (C4).

### C3 — Condições do Cesar e implementação (29/09/2026)
- **#64 (S2) mergeado.** O Cesar ligou o "Enforce SSL" no dev. Conferido só por leitura:
  - conexão sem TLS recusada nas portas 5432 e 6543 (`ESSLREQUIRED`);
  - `db:testar-dev` passou, com 513 ok em 17 arquivos;
  - `db:types` gerou o `tipos-banco.ts` idêntico.
- **Uma OS não cancelada por chamado, aprovada pelo Cesar com condições:**
  - aceite recusado reabre a mesma OS (a transição `reabrir` já faz isso, e o pgTAP prova que o índice aceita);
  - OS preventiva (sem chamado) fora da restrição: o predicado do índice é `chamado_id is not null and estado <> 'cancelada'`, pronto para quando a 1b deixar o `chamado_id` opcional;
  - a mesma regra no domínio (`osOcupaOChamado`, `exigirChamadoSemOsEmAndamento`, chamado pelo `decidirNaOs('gerar')`), com teste de paridade com o banco para cada estado da OS e o caso das duas triagens simultâneas (`packages/db/test/os.test.ts`, com uma barreira que faz as duas passarem juntas pelo domínio);
  - pergunta ao cliente sobre o problema com duas especialidades (dois chamados no MVP) em `docs/referencia/perguntas-cliente.md`, item 15.
- **Achado:** o Gerente e o Gestor CSC não liam as atribuições do Técnico (a policy de `app.atribuicao_escopo` só mostra ao Admin, a si mesmo e ao Implantador). Sem isso, a aplicação não confere se quem recebe a OS é Técnico do hotel. A 0022 amplia a leitura só para as atribuições de papel `tecnico` que cobrem os hotéis em que o leitor faz a triagem. Registrado no adendo ao ADR-027, **aguardando o ok do Cesar**.
- **Migração 0022** (`20260929183205_os.sql`): `app.os`, `motivo_cancelamento` e UPDATE da triagem em `app.chamado`, e a leitura de atribuições acima. pgTAP `018_isolamento_os` com 43 casos; o nome de um caso do `017` foi atualizado.
- **Domínio:** `triagem.ts` (quem recebe a OS, prioridade ativa, ajuste de prioridade) e a regra da OS em `corretiva.ts`. Códigos novos nos quatro idiomas: `os_em_andamento`, `os_nao_encontrada`, `responsavel_sem_papel_tecnico`, `equipe_indisponivel`, `prioridade_indisponivel`.
- **Aplicação e API:** `criarCasosDeUsoDeTriagem` (regras injetáveis), `PortaTriagem`, repositório `repositorios/triagem.ts` (a OS é gravada antes do chamado, para a segunda triagem esperar no índice e receber `os_em_andamento`), seis rotas POST e o `GET /chamados/{id}` com as OS.
- **Tipos:** `tipos-banco.ts` escrito à mão com `app.os` e o `motivo_cancelamento`, no formato do kysely-codegen; a CI confere com `--verify`. Depois do `db push`, o `pnpm db:types` deve dar o mesmo arquivo.
- **No local:** typecheck, lint e testes verdes (domínio com 1656). O `os.test.ts` e o pgTAP rodam só na CI, porque a 0022 ainda não está no dev.

### Ponto de retomada (29/09/2026, C3 aberta)
- **`main`:** `4fa95dc`. **Dev:** 21 migrações, até a 0021; Enforce SSL ligado.
- **PR aberto:** C3, branch `1a-c3` (worktree `wt/c3-triagem`), zona protegida, com a migração 0022.
  - Merge só com CI verde (pgTAP, `segurança` e a verificação dos tipos).
  - Pendente do Cesar: ok para a leitura das atribuições de Técnico pela triagem (adendo ao ADR-027).
- **Depois do merge:** o Cesar faz o `db push` da 0022. Em seguida, conferir no dev só por leitura: `db:testar-dev` (18 arquivos) e `db:types` idêntico.
- **Próxima tarefa:** C4 (execução da OS pelo Técnico: iniciar, pausar, retomar, concluir, anexo da OS, equipes do ator e fila do PWA). Pode andar no local enquanto o PR da C3 espera.
- O kit de teste fica para o fim da etapa C, e o trabalho para quando o kit estiver pronto.

### C3 mergeada (29/09/2026)
- **#65 mergeado** (`main` em `068db9e`). O Cesar fez o `db push` da 0022. Conferido no dev, só por leitura: o `db:testar-dev` deu 556 ok em 18 arquivos, e o `db:types` gerou o arquivo idêntico (28 tabelas).
- **Aprovado pelo Cesar depois do merge:** a triagem lê as atribuições de Técnico nos hotéis dela (adendo ao ADR-027).
- O Cesar não vai usar o Remote Control por enquanto, então não há notificação push nas paradas.

### C4 — Plano (29/09/2026)
Dividida em duas partes, cada uma no seu PR:
- **C4a, servidor** (zona protegida, migração 0023):
  - `app.os_apontamento` (início e fim) e `app.os_material` (texto livre, até 500), só inserção, pelo Técnico responsável: ele, ou uma equipe ativa de que é membro. Sem UPDATE: correção fica para depois.
  - Anexo com a entidade `os`.
  - O UPDATE de `app.os` e de `app.chamado` (este, só pela OS não cancelada do chamado) ganha o Técnico responsável.
  - Domínio: iniciar, pausar, retomar e concluir pelo `decidirNaOs`, que já existe, com as equipes do ator preenchidas. Apontar horas e material só com a OS em execução ou pausada. Apontamento com fim depois do início, até 24 h, e fim até 10 min no futuro.
  - Seis operações offline: `os.iniciar`, `os.pausar`, `os.retomar`, `os.concluir` (com a versão), `os.apontar_horas` e `os.registrar_material`.
  - `GET /api/v1/os/do-dia`: as OS do Técnico e das equipes dele, atribuídas, em execução ou pausadas.
  - Anexo com `arquivoId` opcional gerado no aparelho, para o caminho ser o mesmo no reenvio (base da foto offline da C4b).
- **C4b, PWA:** a fila do dia no aparelho (apagada ao sair, com adendo ao ADR-025), as ações com a versão calculada no aparelho e as fotos offline sem duplicar.
- **Risco aceito:** o GRANT de UPDATE é por coluna e vale para todos os papéis do `hk_app`, então o Técnico responsável tem, no banco, UPDATE em `tecnico_id`/`equipe_id` da OS e em `prioridade_id` do chamado. A policy só deixa o resultado com ele como responsável, e a aplicação nunca grava essas colunas pelo Técnico. Fica na auditoria.

### C4a — Implementação (29/09/2026)
- **Migração 0023** (`20260929211202_os_execucao.sql`): apontamento, material, anexo da OS e o UPDATE do responsável em `app.os` e `app.chamado`. pgTAP `019_isolamento_os_execucao` com 37 casos. No `018`, o caso "técnico não altera OS" passou a mirar a OS de uma equipe de que ele não é membro, porque o responsável agora altera a dele.
- **Domínio:** `decidirRegistroNaOs` em `corretiva.ts` e `execucao.ts` (apontamento e material). Códigos novos nos quatro idiomas: `apontamento_invalido` e `material_invalido`, e os rótulos das seis operações.
- **Aplicação:**
  - `criarCasosDeUsoDeExecucao` com `preparar*` e a fila do dia, e as equipes do ator lidas do banco;
  - seis operações offline no `sincronizacao.ts`;
  - a regra vem antes da versão, então a OS reatribuída com a operação na fila volta como `os_de_outro_responsavel`.
- **Banco e API:** repositório `execucao.ts`, que reaproveita o `refletirNoChamado`/`semLinha` da triagem; `criarPortaExecucao`; `GET /api/v1/os/do-dia`; `GET /api/v1/os/{id}/anexos`; e `arquivoId` na URL de upload.
- **Tipos:** `tipos-banco.ts` à mão, com as duas tabelas e o `os_id` do anexo; a CI confere com `--verify`.
- **Testes:** no local, typecheck, lint e testes verdes (domínio com 1681). A integração em `packages/db/test/execucao.test.ts` e o pgTAP rodam só na CI.

### Ponto de retomada (29/09/2026, C4a aberta)
- **`main`:** `068db9e` (#65). **Dev:** 22 migrações, até a 0022; 556 ok em 18 arquivos.
- **PR aberto:** C4a, branch `1a-c4` (worktree `wt/c4-execucao`), zona protegida, com a migração 0023. Merge só com CI verde (pgTAP, `segurança` e a verificação dos tipos).
- **Depois do merge:** o Cesar faz o `db push` da 0023. Em seguida, conferir no dev só por leitura: `db:testar-dev` (19 arquivos) e `db:types` idêntico (30 tabelas).
- **Próxima tarefa:** C4b, o PWA, num worktree novo a partir da `main` depois do merge da C4a:
  - a fila do dia guardada no IndexedDB, apagada ao sair (adendo ao ADR-025, linhas 426-428 do `docs/03`);
  - telas da OS com as ações;
  - a versão calculada no aparelho (a vista mais uma por transição já na fila);
  - horas, material e fotos offline, com o `arquivoId` fixo e o envio repetido tratado como feito.
  - Arquivos: `apps/tecnico/src/App.tsx`, `fila/`, `referencia/banco.ts`, `anexos/fotos.ts`, `saida.ts` e `telas/FilaDoDia.tsx`.
- O kit de teste fica para o fim da etapa C, e o trabalho para quando o kit estiver pronto.

### C4a mergeada com a CI vermelha; correção na 0024 (29/09/2026)
- **O que aconteceu:** o #66 foi mergeado (`732c967`) e a 0023 foi aplicada no dev com três checagens vermelhas:
  - **zona protegida:** falha por desenho em todo PR de zona protegida;
  - **gitleaks:** falha desde o S1 (#59) por um falso positivo antigo, os hashes md5 do meta-teste 11 no commit `5025f7d`;
  - **pgTAP:** falha real. A 0023 criou um ciclo de policies (o UPDATE do chamado lê a OS, e a leitura da OS lia o chamado), e todo UPDATE do chamado pelo `hk_app` falhava com 42P17, no dev e na `main`.
- **Conferência do dev** (só leitura, depois do push da 0023): 551 ok em 19 arquivos, com a mesma falha da CI. O `017` falha no teste 19 e o `019` aborta depois do 17.
- **Correção** (branch `1a-c4-correcao`, worktree `wt/c4-correcao`):
  - **migração 0024:** o `local_id` do chamado vai para a OS, com FK composta, e a leitura da OS não lê mais o chamado;
  - **meta-teste 27:** falha com qualquer ciclo entre policies. Rodado só por leitura no dev, ele acha o ciclo chamado ↔ os e nenhum outro;
  - **pgTAP:** fixtures do 018 e do 019 com o `local_id`, e no 018 um caso novo, "OS com local diferente do do chamado";
  - **aplicação:** a porta e o caso de uso passam o local do chamado ao `gerarOs`;
  - **gitleaks:** exceção estreita no `.gitleaks.toml`, só para a linha `'schema.funcao:<md5>'` do meta-teste 11.
- **Local:** typecheck, lint e testes verdes, com 272 testes na raiz.
- **Lição:** não conto com o aviso de CI. Antes de dar o PR como pronto, confiro `gh pr checks`, e digo ao Cesar quais checagens falharam e se a falha é esperada.

### Ponto de retomada (29/09/2026, correção da C4a aberta)
- **`main`:** `732c967` (#66). **Dev:** 23 migrações, até a 0023, com o UPDATE do chamado quebrado (42P17) até entrar a 0024.
- **PR aberto:** #67, branch `1a-c4-correcao` (worktree `wt/c4-correcao`), zona protegida, com a migração 0024. Merge só com o pgTAP, o `segurança` (depois do OK do Cesar à exceção do gitleaks), a verificação dos tipos e a integração do `packages/db` verdes. A "zona protegida" falha por desenho.
- **Depois do merge:** o Cesar faz o `db push` da 0024. Em seguida, conferir no dev só por leitura: `db:testar-dev` (19 arquivos, sem falha) e `db:types` idêntico.
- **Próxima tarefa:** C4b (PWA), no local, num worktree novo a partir da `main` depois do merge do #67. O plano está no ponto de retomada "C4a aberta".

### #67 mergeado; reenvio de operação já aplicada (29/09/2026)
- **#67** (`b78a025`): pgTAP, verificação dos tipos e gitleaks verdes. A integração do `packages/db`, que rodou pela primeira vez com a C4a, falhou em um teste: "um dia offline".
- **Dev**, conferido só por leitura depois do push da 0024: 596 ok em 19 arquivos, sem falha; `db:types` idêntico, com 30 tabelas.
- **Defeito da C4a:** o reenvio de uma operação já aplicada passava pela validação antes de se conferir a chave. Com a OS já concluída, o reenvio das horas voltava como `transicao_invalida` em vez de "repetida". O `ativo.alterar` tinha o mesmo defeito latente (reenvio depois de outra alteração).
- **Correção** (branch `1a-c4-reenvio`, sem zona protegida):
  - a porta ganha `respostaGuardada`;
  - o `receberOperacao` devolve a resposta guardada antes de validar, para todos os tipos;
  - o `aplicarUmaVez` segue conferindo a chave na transação, para os envios simultâneos;
  - teste de unidade novo para o reenvio depois de o estado mudar. A integração roda na CI.

### C4b — PWA da execução (29/09/2026)
- **Fila do dia no aparelho** (`apps/tecnico/src/os`): IndexedDB próprio (`hubkeep-tecnico-os`), por usuário e tenant, relido junto com a referência e apagado ao sair. A tela mostra a guardada com as operações pendentes por cima (`projecao.ts`), e cada transição sai com a versão do aparelho.
- **Tela da OS** (`telas/Os.tsx`): ações pelo estado (`TRANSICOES_DA_OS`); horas e material validados no aparelho com as regras do domínio; concluir pede confirmação.
- **Foto da OS sem rede:** entra na mesma fila (`anexo.foto`, só do aparelho), com os bytes como `ArrayBuffer` e um `arquivoId` por arquivo. Assim sai antes da conclusão tirada depois dela. No reenvio, contam como feitos:
  - `arquivo_ja_enviado` (a API devolve o caminho);
  - o PUT recusado como duplicado;
  - `anexo_ja_registrado`.
- **Servidor:**
  - a porta do Storage devolve `null` quando o caminho já tem arquivo, e a URL de upload vira 409 `arquivo_ja_enviado` com o caminho;
  - **lacuna da C4a fechada:** a foto na OS não passava pela regra dos registros. Agora a URL e o registro chamam `regraParaAnexar`, que na OS usa `exigirFoto` (responsável, com a OS em execução ou pausada);
  - teste de integração novo em `execucao.test.ts`.
- **Docs:** adendo ao ADR-025 (fila do dia e fotos no aparelho, a aprovar pelo Cesar); implementação da C4b no ADR-027; OpenAPI com os 409 novos.
- **i18n:** 22 chaves novas nos quatro idiomas, com `erro.arquivo_ja_enviado`.
- **Local:** typecheck, lint e testes verdes: raiz 272, PWA 79 (dois arquivos novos: `os.test.ts` e `telas-os.test.tsx`), aplicação 89. A integração roda na CI.
- A branch parte do #68 (`1a-c4-reenvio`), para a integração da CI não herdar a falha da `main`.

### Ponto de retomada (29/09/2026, C4b aberta)
- **`main`:** `b78a025` (#67). **Dev:** 24 migrações, até a 0024; 596 ok em 19 arquivos; `db:types` idêntico (30 tabelas).
- **PRs abertos:**
  - #68 (`1a-c4-reenvio`, sem zona protegida), com a CI toda verde;
  - C4b (`1a-c4b-pwa`, worktree `wt/c4b-pwa`, zona protegida por causa do `docs/03`), apoiada no #68.
- **Merge:** primeiro o #68, depois a C4b. Os dois só com a CI verde. A C4b não tem migração, então não precisa de `db push`.
- **Próxima tarefa:** C5, lida no `docs/04`/plano da fase 1a antes de começar, num worktree novo a partir da `main`.
- O kit de teste fica para o fim da etapa C, e o trabalho para quando o kit estiver pronto.

### C4b mergeada; aprovações e espaço do aparelho (29/09/2026)
- **#68** (`b0437d9`) e **#69** (`675dd7c`) mergeados pelo Cesar. **CI da `main`** depois do #69: `banco` (pgTAP e integração do `packages/db`), `CI` e `segurança` verdes. Sem migração nova, sem `db push`.
- **Aprovações do Cesar (29/09/2026):**
  - correção da C4a no ADR-027 (migração 0024): aprovada;
  - adendo ao ADR-025 (fila do dia e fotos no aparelho): aprovado com três condições. (a) `navigator.storage.persist()` e aviso de pendências antigas, por causa do descarte de armazenamento no iOS. (b) Teto de espaço e compressão das fotos antes de guardar. (c) Saída bloqueada, ou com aviso, enquanto houver fila pendente.
- **Situação na C4b mergeada:** a compressão (b) e a saída com aviso (c) já existiam. Faltavam a persistência, o aviso de pendência antiga e o teto de espaço.
- **Complemento** (branch `1a-c4b-armazenamento`, worktree `wt/c4b-armazenamento`, zona protegida por causa do `docs/03`):
  - `apps/tecnico/src/armazenamento.ts`:
    - `pedirPersistencia`, chamada ao entrar;
    - `pendenteAntigaDesde`: pendente com mais de 24 h gera aviso na fila do dia, com a data da mais velha;
    - `conferirEspacoParaFoto`: até 50 MB de fotos do usuário na fila (`fotos_na_fila_no_limite`) e 20 MB livres depois da foto pela estimativa do navegador (`espaco_insuficiente`);
    - `faltouEspaco`: o `QuotaExceededError` do IndexedDB vira `espaco_insuficiente`;
  - `saida.ts`: `podeApagar` (a confirmação ao sair com pendente) sai do `App.tsx` para ser testada;
  - adendo do ADR-025 com as três condições descritas, e as marcações "a aprovar" trocadas por "aprovado";
  - i18n: 3 chaves novas nos quatro idiomas (`tecnico.sincronizacao.antiga`, `erro.fotos_na_fila_no_limite`, `erro.espaco_insuficiente`).
- **Local:** typecheck, lint e testes verdes: raiz 272; PWA 96 em 12 arquivos, com `armazenamento.test.ts` novo e o aviso em `telas-os.test.tsx`.

### Ponto de retomada (29/09/2026, complemento da C4b aberto)
- **`main`:** `675dd7c` (#69), CI verde. **Dev:** 24 migrações, até a 0024; sem mudança desde a última conferência.
- **PR aberto:** complemento da C4b (`1a-c4b-armazenamento`, worktree `wt/c4b-armazenamento`, zona protegida). Sem migração: sem `db push`. Merge só com a CI verde.
- **Próxima tarefa:** C5, equipamento parado (`docs/05-plano-fase-1a.md`, linha da C5). Tem migração (`app.parada_ativo`, com no máximo uma parada aberta por ativo, garantida por restrição de integridade). Pode andar no local, num worktree novo a partir da `main`. O PR dela só abre depois do merge do complemento, porque os dois são zona protegida.
- O kit de teste fica para o fim da etapa C, e o trabalho para quando o kit estiver pronto.

### C5 — Equipamento parado (29/09/2026)
- **Migração 0025** (`parada_ativo`):
  - `app.parada_ativo` com ativo, chamado (obrigatório), OS opcional, início, fim, quem abriu e quem encerrou;
  - FK `(hotel_id, chamado_id, ativo_id)` → chamado com o mesmo ativo (constraint nova `chamado_ativo_unico`) e `(hotel_id, os_id, chamado_id)` → OS do mesmo chamado (`os_chamado_unico`);
  - uma parada aberta por ativo: índice único parcial `parada_ativo_uma_aberta`;
  - checks: fim depois do início; fim e quem encerrou juntos;
  - RLS: lê quem lê o hotel e o proprietário (hotel inteiro ou UH do ativo); insere quem tem escrita no hotel, em nome dele mesmo; UPDATE só de `fim`, `encerrada_por` e `atualizado_em`, pela gestão do hotel e pelo Técnico responsável por OS não cancelada do chamado. Nenhuma policy lê a tabela nova: sem ciclo.
- **pgTAP:** `020_isolamento_parada.test.sql`, com 38 casos (os seis do doc 02, FKs, checks, parada aberta única, UPDATE por coluna, sem DELETE, worker).
- **Domínio:** `paradas.ts` (`validarParada`, `validarFimDaParada`, `exigirAtivoNoChamado`, `exigirSemParadaAberta`, `exigirParadaAberta`, `tempoParado`, `tempoParadoTotal`, com sobreposição) e, em `corretiva.ts`, `registrar_parada` e `encerrar_parada` nos registros da OS e `podeEncerrarParada`.
- **Aplicação:**
  - abertura do chamado com `paradoDesde`: a parada aberta nasce na mesma unit of work; ativo já parado fica com a parada que existe;
  - execução: `prepararParada` e `prepararEncerramentoDeParada`, e as operações offline `os.registrar_parada` e `os.encerrar_parada`; a OS só encerra a parada do próprio chamado (`parada_de_outro_chamado`);
  - web: `criarCasosDeUsoDeParadas` (lista com tempo parado e encerramento pela gestão).
- **API:** `GET /api/v1/ativos/{id}/paradas`, `POST /api/v1/paradas/{id}/encerramento`; `paradoDesde` no ativo e na fila do dia; `ativoId` na fila do dia; OpenAPI atualizado.
- **Telas:**
  - web, ativos: "parado desde" na lista, as paradas com o tempo parado e o encerramento;
  - PWA: "o equipamento está parado" na abertura do chamado; "parado desde" na lista de ativos; na OS, "equipamento parado desde" e o botão de registrar ou encerrar, com a parada pendente projetada por cima.
- **i18n:** 22 chaves novas nos quatro idiomas (7 códigos de erro `parada_*`).
- **Docs:** bloco "Implementação (C5)" no ADR-027, com as decisões de desenho a confirmar pelo Cesar.
- **Local:** typecheck, lint e testes verdes: raiz 274, domínio 1709 (`paradas.test.ts` novo), aplicação 91, PWA 86, web 63. A integração do `packages/db` (`paradas.test.ts` novo, 6 casos) e o pgTAP rodam só na CI.
- **Não verificado no local:** a migração e o pgTAP (sem banco local; o dev só recebe a 0025 pelo `db push` do Cesar, depois da CI verde).

### #70 mergeado; PR da C5 (29/09/2026)
- **#70** (`86318a3`) mergeado pelo Cesar. CI da `main` depois dele: `CI` e `segurança` verdes; `banco` rodando na hora da conferência.
- **`main` trazida para a `1a-c5-parada`:** conflitos no `App.tsx` do PWA (comentário do topo e a vizinhança de `fotografarOs`) e no fim do diário; mantidos os dois lados. O `docs/03` entrou sem conflito.
- **Local depois do merge:** typecheck, lint e prettier verdes; testes verdes: raiz 274, domínio 1709, aplicação 91, PWA 103 (os da C5 e os do #70), web 63.
- **PR da C5 aberto** (zona protegida, migração 0025). Merge só com a CI verde: pgTAP, integração do `packages/db`, tipos e segurança; a "zona protegida" falha por desenho.
- **Primeira CI do #71:** pgTAP vermelho em 1 de 38 casos do `020`: "parada em chamado sem ativo" esperava 23503 (FK composta) e recebeu 23505, porque a parada do teste era aberta num ativo que já tinha parada aberta, e o índice único responde antes da FK (conferida no fim do comando). O caso passou a usar uma parada encerrada. A migração não mudou.

### Ponto de retomada (29/09/2026, PR da C5 aberto)
- **`main`:** `86318a3` (#70). **Dev:** 24 migrações, até a 0024.
- **PR aberto:** C5 (`1a-c5-parada`, worktree `wt/c5-parada`, zona protegida, migração 0025). Conferir `gh pr checks`; se a CI falhar, corrigir na branch.
- **Depois do merge da C5:** o Cesar faz o `db push` da 0025, e eu confiro o dev só por leitura (`db:testar-dev` sem falha, `db:types` idêntico).
- **Perguntas ao Cesar:** as decisões de desenho da C5 (bloco "Implementação (C5)" no ADR-027, "a confirmar").
- **Próxima tarefa:** C6 (aceite), no local, num worktree novo a partir da `main`.
- O kit de teste fica para o fim da etapa C, e o trabalho para quando o kit estiver pronto.

### #71 mergeado; decisões do Cesar; complemento da C5 (30/09/2026)
- **#71** (`c3e68c5`) mergeado pelo Cesar com a CI verde (a segunda rodada, depois da correção do `020`). CI da `main` depois dele: `banco`, `CI` e `segurança` verdes.
- **Decisões do Cesar sobre a C5 e a C6** chegaram depois do merge (ele pedia o item 4 da C5 no #71, antes do merge). Como o #71 já tinha entrado, os itens 4 e 5 vão num PR complementar a partir da `main` (`1a-c5b-parada-conclusao`, worktree `wt/c5b-parada-conclusao`), sem migração. As decisões da C5 estão no ADR-027 (bloco "Decisões do Cesar sobre a C5"); as da C6 entram na branch da C6.
- **Item 4, conclusão com a parada aberta:**
  - domínio: `paradaAEncerrarNaConclusao` (só a parada aberta do próprio chamado, só com "sim") e `ESTADOS_DA_OS_CONCLUIDA`;
  - `os.concluir` aceita `equipamentoVoltou` e `concluidaEm`; `prepararAcao` devolve a parada a encerrar, e a sincronização encerra na mesma unit of work da conclusão (a resposta traz `paradaEncerrada`);
  - sem resposta: a parada fica aberta, em vez de recusar a conclusão;
  - fila do dia com `paradaDoChamado`; no PWA, a pergunta obrigatória na conclusão (`PerguntaDaParada`), a projeção que encerra a parada com o "sim", e o botão de encerrar só na parada do próprio chamado;
  - web: `GET /api/v1/paradas/abertas-com-os-concluida` e a tela `/admin/paradas` (Admin do grupo, Gestor CSC e Gerente, cada um com os hotéis dele).
- **Item 5, proprietário:** `veDetalhesDaParada`; a API tira chamado, OS e autores da parada para o proprietário. pgTAP `020` com 4 casos novos (42): ele não lê o membro que abriu, a auditoria da parada, os eventos e as paradas de outro hotel. A RLS é por linha: esconder colunas no banco pediria uma view e ADR (registrado no ADR-027, sem implementar).
- **Item 1:** a UH não é ativo; lacuna registrada no ADR-027.
- **i18n:** 10 chaves novas nos quatro idiomas (a pergunta e as respostas no PWA; a tela das paradas pendentes e o link no início do web).
- **Local:** typecheck, lint e testes verdes: raiz 275, domínio 1727, aplicação 91, PWA 109, web 63. A integração do `packages/db` (4 casos novos em `paradas.test.ts`) e o pgTAP rodam só na CI.
- **Item 7 da C6 (gatilho), em aberto:** o preenchimento de `chamado_aberto_por` por gatilho esbarra na regra 3 do CLAUDE.md (sem trigger; exceção só por ADR aprovado, com o meta-teste atualizado) e pede uma função nova no banco (meta-teste 11). Perguntado ao Cesar antes de implementar a C6.

### Ponto de retomada (30/09/2026, complemento da C5 aberto)
- **`main`:** `c3e68c5` (#71). **Dev:** o `db push` da 0025 é do Cesar; conferir o dev só por leitura depois dele.
- **PR aberto:** complemento da C5 (`1a-c5b-parada-conclusao`, worktree `wt/c5b-parada-conclusao`, zona protegida, sem migração). Conferir `gh pr checks`; se a CI falhar, corrigir na branch.
- **Depois do merge:** trazer a `main` para a `1a-c6-aceite` e aplicar as decisões da C6 (itens 7 a 11), com a resposta do Cesar sobre o gatilho do item 7; então o PR da C6.

### C6 — Aceite (30/09/2026)
- **#70** (`86318a3`) mergeado pelo Cesar; a `main` trazida para a C5, e o PR da C5 aberto (#71, zona protegida, migração 0025).
- **C6 no local**, num worktree novo a partir da `main` (`1a-c6-aceite`, `wt/c6-aceite`), enquanto o #71 espera a CI e o merge.
- **O domínio já tinha tudo** desde a C1: `aceitar` e `reabrir` em `TRANSICOES_DA_OS`, o grupo `aceite` (quem abriu, com escrita no hotel, ou o Gerente) e o motivo obrigatório na reabertura, com testes.
- **Migração 0026 (`aceite_os`), não prevista no plano:**
  - a RLS não deixava quem abriu gravar (só a gestão do hotel e o responsável); o Solicitante que abriu seria recusado;
  - a OS guarda `chamado_aberto_por`, com FK composta para o `aberto_por` do chamado (constraint nova `chamado_aberto_por_unico`), porque a policy da OS não pode ler o chamado (ciclo, meta-teste 27); nulo aceito para a OS preventiva da 1b;
  - o UPDATE de `app.os` e de `app.chamado` ganha o ramo de quem abriu, com escrita no hotel.
- **pgTAP:** `021_aceite_os.test.sql`, com 20 casos (outro tenant, quem abriu e quem não abriu, atribuição vencida, sem atribuição no hotel, Gerente, sem contexto, FK, colunas sem UPDATE, quem abriu não gera OS, o ramo do responsável continua).
- **Aplicação:** `aceitarOs` e `reabrirOs` em `casos-de-uso/triagem.ts`; a geração da OS grava quem abriu o chamado.
- **Banco:** `repositorios/aceite.ts`, com auditoria (motivo em `depois`) e os eventos `os.aceita` e `os.reaberta`.
- **API:** `POST /api/v1/os/{id}/aceite` e `POST /api/v1/os/{id}/reabertura`; OpenAPI atualizado. Sem tela: as telas entram na C7.
- **i18n:** nenhuma chave nova; os códigos de erro já existiam.
- **Docs:** bloco "Implementação (C6)" no ADR-027, com as decisões a confirmar; coluna "Migração" da C6 no plano.
- **Local:** typecheck, lint e testes verdes: raiz 274, domínio 1681, aplicação 90, PWA 96, web 63. A integração do `packages/db` (`aceite.test.ts` novo, 4 casos) e o pgTAP rodam só na CI.
- **Conflitos esperados** ao trazer a `main` depois do merge da C5: fim do diário, ADR-027 (os blocos da C5 e da C6 no mesmo ponto: manter os dois, C5 antes) e `tipos-banco.ts`.
- O kit de teste fica para o fim da etapa C, e o trabalho para quando o kit estiver pronto.

### #72 mergeado; C6 com as decisões do Cesar (30/09/2026)
- **#72** (`61e029f`) mergeado pelo Cesar com o job `pgTAP (meta e isolamento)` vermelho no PR, e a CI da `main` repetiu: `CI` e `segurança` verdes, `banco` vermelho. O pgTAP passou; falhou 1 de 159 casos da integração do `packages/db`, "conclusão com o equipamento de volta" (`paradas.test.ts`). **O código estava certo; o erro era do teste:** a contagem do evento `parada.encerrada` fazia join pelo id da parada, mas o evento é do ativo (`registro_id` = ativo, a parada no payload), e a contagem dava 0. Corrigido na branch da C6 (contagem por `registro_id` = ativo). Sem migração no #72: nada foi para o dev por causa dele.
- **Como entrou:** no relato de abertura do #72, a CI tinha acabado de começar e não estava conferida; o merge veio antes do resultado. Daqui em diante, o relato de PR pronto só sai depois de `gh pr checks` com tudo verde, e o aviso de PR aberto diz explicitamente "não mergear ainda".
- **`main` trazida para a `1a-c6-aceite`:** conflitos só no ADR-027 (bloco da C5 antes do da C6) e no fim do diário; mantidos os dois lados, sem o ponto de retomada antigo da C6. `tipos-banco.ts` entrou sem conflito.
- **Decisões da C6 aplicadas** (ADR-027, "Decisões do Cesar sobre a C6"):
  - item 8: quem abriu e executa a OS (responsável, ou membro da equipe responsável) não aceita nem reabre; só o Gerente do hotel, outro que não ele. Domínio (`estaNoGrupo` com a OS) e `PortaTriagem.equipesDoUsuario`;
  - item 9: lacuna do aceite automático registrada;
  - item 10: `app.os.motivo_reabertura` na 0026 (check de 1 a 500, UPDATE só nela), na OS da API, na fila do dia e na tela da OS do PWA;
  - item 11: `paradoDesde` na reabertura abre uma parada nova no mesmo chamado, com a OS (`pararNaAbertura` ganhou `osId`); ativo já parado fica com a que existe (`paradaId` nulo).
- **Item 7 em aberto:** o gatilho de `chamado_aberto_por` fere a regra 3 e pede função nova (meta-teste 11); a FK composta e a coluna sem UPDATE já dão o valor certo e a imutabilidade, com pgTAP. Recomendado seguir sem gatilho; perguntado ao Cesar.
- **pgTAP `021`:** 23 casos (3 novos: motivo em branco, acima de 500 e o UPDATE da coluna; o Gerente reabre gravando o motivo).
- **Integração do `packages/db`** (`aceite.test.ts`, 6 casos): o motivo na OS; quem abriu e executa (ele e o membro da equipe) recusado, o Gerente aceita; a reabertura com parada (sem ativo 422, no futuro 422, parada nova com a OS, ativo já parado fica com a que existe).
- **i18n:** 1 chave nova nos quatro idiomas (`tecnico.os.reaberta`).
- **Local:** typecheck, lint e prettier verdes; testes verdes: raiz 277, domínio 1733, aplicação 91, PWA 113, web 63. A integração do `packages/db` e o pgTAP rodam só na CI.

### #73 mergeado; Gerente único no aceite (30/09/2026)
- **#73** (`45a4dff`) mergeado pelo Cesar com o job `pgTAP (meta e isolamento)` vermelho no PR, e o `banco` da `main` repetiu (`CI` e `segurança` verdes). O pgTAP passou; a suíte de integração `aceite.test.ts` caiu inteira no `beforeAll`: o ativo do teste tinha `codigo_qr` = UUID, fora do check `ativo_codigo_qr_formato` (10 caracteres Crockford). **Erro do teste, não do código.** O relato de abertura do #73 dizia "não mergear" e a CI não estava conferida. Corrigido neste PR (`ACETE00001`).
- **Dev:** `supabase migration list` (só leitura) mostra o dev com a 0025 e a 0026 aplicadas.
- **Decisões do Cesar (30/09/2026):** item 7 aprovado sem gatilho (FK composta e sem UPDATE); item 8 mantém a extensão à reabertura; **Gerente único:** para o Gerente que abriu e executou, decide outro Gerente do hotel; se não houver outro Gerente ativo no hotel, decidem o Gestor CSC ou o Admin do grupo. Pedido pgTAP do caso.
- **Branch nova** `1a-c6b-gerente-unico` (worktree `wt/c6b-gerente-unico`), a partir da `main`, porque o #73 já tinha entrado.
- **Domínio:** grupo `aceite` com `DadosDoAceite` (equipes de quem abriu e atribuições de Gerente) e `PAPEIS_DO_ACEITE_SEM_GERENTE` (Gestor CSC e Admin). "Outro Gerente ativo": atribuição de Gerente vigente, que cobre o hotel (hotel, bandeira ou grupo), de outra pessoa, membro ativo. Sem os dados, falha fechada. A condição vale também para o Técnico que abriu e executa num hotel sem Gerente (a mesma regra; a confirmar com o Cesar); quem abriu e não executa segue decidindo, sem o Gestor.
- **Aplicação e db:** `PortaTriagem.dadosDoAceite` (equipes ativas de quem abriu; atribuições de Gerente não revogadas, de membro ativo, que podem cobrir o hotel), lida com o contexto de quem pede.
- **Migração 0027** (`20260930014033_gerente_unico_aceite.sql`): a policy de leitura de `app.atribuicao_escopo` soma as atribuições de Gerente que cobrem os hotéis em que a pessoa é Gestor CSC (antes, o Gestor lia só as de Técnico; o Admin já lia todas). Sem função, sem gatilho; a escrita não muda (o Gestor e o Admin já gravam OS e chamado).
- **pgTAP `022`** (17 casos): o Gestor CSC lê o Gerente do hotel dele (por hotel e pela bandeira) e não o de fora; segue lendo os Técnicos e não os outros papéis; lê o membro; grava o aceite da OS e do chamado do Gerente único; o Gestor de outra bandeira não; o Admin lê todos e reabre; o Gerente não lê outro Gerente; o Técnico e o Solicitante não leem Gerentes; outro tenant e sem contexto, nada.
- **Integração** (`aceite.test.ts`, 7 casos): Gerente único recusado, o Gestor aceita e o Admin reabre; com outro Gerente no hotel, o Gestor é recusado e o Gerente aceita.
- **Docs:** ADR-027 (itens 7 e 8), OpenAPI (textos do aceite e da reabertura), plano (coluna da C6 com a 0027).
- **Local:** typecheck, lint e prettier verdes; testes verdes: raiz 277, domínio 1742, aplicação 91, PWA 113, web 63. A integração do `packages/db` e o pgTAP rodam só na CI.

### #74 mergeado; registros e regra de processo (30/09/2026)
- **#74** (`1c377e2`) mergeado pelo Cesar, e a CI da `main` voltou a ficar verde (`CI`, `banco` e `segurança`, run do merge do #74).
- **Dev:** `supabase migration list` (só leitura) mostra a 0027 ainda pendente no dev; a 0025 e a 0026 aplicadas.
- **Decisões do Cesar (30/09/2026):** aprovada a regra do Gerente único também para o Técnico que abre e executa num hotel sem Gerente (decide o Gestor CSC ou o Admin do grupo), e aprovada a leitura da 0027 como está. Anotado no ADR-027 (bloco da C6, item 8).
- **Pergunta ao cliente** (`docs/referencia/perguntas-cliente.md`, item 16): a OS aberta e executada pelo próprio técnico (ex.: problema achado em ronda) precisa do aceite de outra pessoa, ou pode ter aceite automático com a foto de depois? No plano (`docs/05`, perguntas para a reunião): se o cliente quiser o aceite automático, ele entra como política configurável (ADR-026), desligada por padrão.
- **Como o #73 entrou com a CI vermelha, e por quê:**
  - o relato de abertura do #73 dizia "não mergear ainda", com a CI recém-iniciada e não conferida; o merge veio antes do resultado, com o job `pgTAP (meta e isolamento)` vermelho no PR, e o `banco` da `main` repetiu;
  - a causa era o teste, não o código: o ativo do `aceite.test.ts` tinha `codigo_qr` = UUID, fora do check `ativo_codigo_qr_formato`, e a suíte caiu inteira no `beforeAll`. A integração do `packages/db` roda só na CI (sem Docker local, ADR-015), então o erro não aparecia nos testes do local;
  - foi o segundo caso seguido (o #72 entrou do mesmo jeito, por outro erro de teste); a `main` ficou vermelha até o merge do #74, que trouxe a correção.
- **Regra de processo nova (Cesar, 30/09/2026):** PR que entra na `main` com a CI vermelha é corrigido antes de qualquer outro merge. Registrada também na lista de processo do `docs/diario-fase-0.md`.

### C7 — Telas do CSC e do hotel (30/09/2026)
- **C7 num worktree novo** a partir da `main` (`1a-c7-telas`, `wt/c7-telas`). Sem migração, sem função e sem gatilho: não é zona protegida.
- **Domínio** (`consultas.ts`): o período da lista (`periodo_invalido` se o início não é antes do fim), o tamanho da página (50), as entidades da linha do tempo e o motivo lido da auditoria.
- **Aplicação** (`casos-de-uso/consultas.ts`, `PortaConsultasDaCorretiva`): listar chamados e OS com os filtros básicos (hotel, situação, prioridade, período), os nomes do detalhe e a linha do tempo. Ler é escopo: a RLS decide, sem regra de papel no caso de uso. A página continua pelo último id (UUID v7, do mais novo para o mais antigo).
- **Banco** (`consultas-da-corretiva.ts`): leituras com withContext; os nomes (hotel, local, ativo, pessoa, equipe) por left join, e o que quem pede não lê volta null sem esconder o registro. A prioridade da OS é a do chamado.
- **Linha do tempo pela auditoria** (as ações do chamado, das OS dele e das paradas do chamado, com quem fez, quando e o motivo do cancelamento ou da reabertura). A RLS da auditoria já mostra ao Admin e a quem escreve no hotel; o proprietário vê o chamado da UH e recebe a linha do tempo vazia. A leitura da auditoria pelo proprietário e o antes e depois de cada campo ficam para a D1, que generaliza a linha do tempo.
- **API:** `GET /api/v1/chamados` e `GET /api/v1/os` (filtros na query, validados pelo contrato; `rota().consulta()` novo no web), `GET /api/v1/chamados/{id}/linha-do-tempo`, e os nomes no `GET /api/v1/chamados/{id}`. OpenAPI com os parâmetros da query.
- **Telas** (`/chamados`, `/os`, `/chamados/{id}`, links na tela inicial): filtros, itens, detalhe com as OS, o aceite e a reabertura da OS concluída (motivo e, com ativo, "equipamento parado" com a data e a hora), o último motivo de reabertura e a linha do tempo. Os botões aparecem na OS concluída, e a API decide quem aceita ou reabre (a recusa aparece traduzida). Tela funcional, sem acabamento; o layout definitivo vem do protótipo.
- **i18n:** 47 chaves novas nos quatro idiomas, com o `erro.periodo_invalido`.
- **Testes:** domínio (período e motivo), aplicação (filtro, página, 404 sem ler a linha do tempo), telas nos quatro idiomas e no pseudo-idioma (todo texto do catálogo, fora os dados do banco) e integração por papel no `packages/db` (`consultas.test.ts`: Admin, Gestor CSC da bandeira, Gerente de cada hotel, Técnico, Solicitante, proprietário da UH e outro tenant; filtros, página, nomes e linha do tempo).
- **Local:** typecheck, lint e prettier verdes; testes verdes: raiz 280, domínio 1747, aplicação 95, PWA 113, web 74. A integração do `packages/db` roda só na CI.
- **CI do PR (#76):** o `pgTAP (meta e isolamento)` caiu no `beforeAll` do `consultas.test.ts` pelo mesmo motivo do #73: o `codigo_qr` do ativo de teste (`CONSU00001`) tinha O e U, fora do alfabeto do check `ativo_codigo_qr_formato` (base 32 de Crockford, sem I, L, O e U). Trocado por `0000C7A001`. O #75 entrou antes; a `main` foi trazida para a branch e o conflito no fim deste diário ficou com as duas entradas, a do #75 antes.
- **Lição:** código de QR em fixture de teste só com `0-9` e `A-Z` sem I, L, O e U; o erro só aparece na CI.

### #76 mergeado; fim da etapa C (30/09/2026)
- **#76** (C7) mergeado pelo Cesar, com os checks verdes; a `main` ficou verde no merge (`CI`, `banco` e `segurança`). O Cesar fez o `db push` da 0027: `supabase migration list` (só leitura) mostra as 27 migrações iguais no local e no dev.
- **Resumo da etapa C (corretiva):**
  - **C1** (#55 e #56, 0020): estados canônicos fixos do chamado e da OS, situações configuráveis e prioridades do tenant (ADR-027), com transições e papéis no domínio.
  - **C2** (#58, 0021): abertura do chamado pelo web e pelo PWA (operação offline `chamado.abrir`), com a cópia da política aplicada no chamado (ADR-026) e a recusa na UH pendente de licença.
  - **C3** (#65, 0022): triagem, prioridade, geração e reatribuição da OS para técnico ou equipe, cancelamentos com motivo, evento `os.atribuida` no outbox.
  - **C4** (#66 a #70, 0023 e 0024): execução no PWA (fila do dia, iniciar, pausar, retomar, concluir, horas, material e fotos offline), conflito visível ao técnico, reenvio sem duplicar e o espaço do aparelho.
  - **C5** (#71 e #72, 0025): parada do ativo, com a pergunta na conclusão, as paradas pendentes e a leitura do proprietário.
  - **C6** (#73 a #75, 0026 e 0027): aceite e reabertura com motivo; quem executou não aceita; Gerente único (sem outro Gerente, decidem o Gestor CSC ou o Admin).
  - **C7** (#76): listas de chamados e OS por escopo, com filtros, detalhe, aceite e reabertura na tela e a linha do tempo pela auditoria.
  - **Processo:** três PRs entraram com a CI vermelha (C4a, #72 e #73), sempre por teste de integração que só roda na CI; daí a regra de 30/09/2026 (CI vermelha na `main` se corrige antes de qualquer merge).
- **Lacuna vista ao montar o kit:** a triagem (triar, prioridade, gerar, reatribuir e cancelar a OS, cancelar o chamado) tem API e regra, mas **não tem tela** no web. Nenhuma tarefa da C previa essa tela (a C7 fez listas, detalhe, aceite e reabertura). Registrada no kit (seção 5) como decisão do Cesar: tela de triagem no detalhe antes ou durante a D.

### Kit de teste no notebook (30/09/2026)
- **Branch `1a-kit-teste`**, worktree `wt/kit-teste`. Sem migração, sem ADR: não é zona protegida.
- **`docs/10-kit-de-teste.md`:** as variáveis do `.env.local` do web e do PWA e as do script, com onde achar cada valor e o que não vai para o git; os comandos do PowerShell (instalar, dados de demonstração, web, PWA e o build do PWA para o teste sem rede, porque o service worker só existe no build); o que o script cria; o roteiro por papel (o que deve dar certo e o que deve ser barrado, com a recusa traduzida); o que ainda não dá para testar pela tela; e como rodar de novo.
- **`pnpm demo:dados --ambiente dev`** (`scripts/ops/dados-demonstracao.ts`): só no dev. Lê o `apps/web/.env.local`, confere pelo ref de `[remotes.dev]` que a `DEV_SESSION_POOLER`, as três `DATABASE_URL_*` e a URL do Supabase são do HubKeep-dev, e chama o vitest com a config `apps/web/vitest.demonstracao.config.ts` (como o `db:fumaca`, sem dependência nova para rodar TypeScript).
- **O script** (`apps/web/test/demonstracao/semear.ts`) grava pelos casos de uso, com a unit of work:
  - hotéis e UHs pelo caminho do conector (lote no staging com credencial de agente revogada no fim, importação e ativação pelo Admin, promoção pelo worker);
  - pessoas pelo caso de uso de convite de sempre, com a identidade de demonstração;
  - ativos, chamados e ações do Técnico como operação offline de chave fixa (UUID tirado do tenant e do nome), então rodar de novo não duplica;
  - a triagem, a geração da OS, o cancelamento e o aceite pelos casos de uso do web, cada passo conferindo o estado antes.
  - **Exceção:** o tenant, o contrato de licença e o primeiro Admin, que são do backoffice e não têm caso de uso, entram pelo dono do banco, como nos testes de integração.
- **Dados:** Grupo Demonstração; Centro e Praia ativos e Serra em implantação (UHs pendentes, para o Admin ativar no teste); Bandeiras Azul e Verde; áreas comuns, categorias, situações e prioridades padrão; 7 ativos; Equipe Centro; 10 contas (um por papel, Gerente e Técnico em dois hotéis, proprietário de UH e de hotel inteiro); 7 chamados, um em cada estado (aberto, OS atribuída, em execução com o equipamento parado, aguardando aceite, cancelado, concluído e um no Praia).
- **Identidade de demonstração** (`criarIdentidadeDeDemonstracao` no `packages/auth-admin`, que continua o único dono da secret key): conta com o e-mail confirmado e a senha de teste, sem convite nem e-mail; quem já existe volta à senha de teste. Recusa e-mail fora do domínio `.test`, para nunca trocar a senha de uma conta de verdade. Composta em `apps/web/src/servidor/demonstracao.ts`, que recusa rodar na Vercel e não é usada por nenhuma rota. O teste que fixa os exports do `auth-admin` ganhou o nome novo.
- **Por que em `apps/web/test/`:** o script precisa dos casos de uso compostos pelo servidor do web e da conexão do dono para a parte do backoffice; o lint deixa o `pg` direto só nos testes (fixtures), como já fazem os testes de integração.
- **Teste na CI** (`apps/web/test/demonstracao/semear.test.ts`, no Supabase do runner): roda o script duas vezes e confere que a segunda devolve os mesmos registros sem mudar a contagem de nenhuma tabela do tenant; login com a senha de teste; a lista de chamados de cada papel (Admin 7, Gestor da Azul 6, Gerentes 6 e 1, Técnicos 6 e 1, Solicitante 6, Implantador 0, proprietários 1 e 1); o estado de cada chamado e da OS; o Serra em implantação com as UHs pendentes. **Não rodei o script no dev:** quem roda é o Cesar, pelo kit.
- **Variáveis novas no `.env.example`:** `HK_DEMO_SENHA` e `HK_DEMO_URL_DONO` (montada pelo script).

### Ponto de retomada (30/09/2026, kit de teste pronto)
- **`main`:** merge do #76 (C7). **Dev:** 27 migrações aplicadas (0027 incluída).
- **PR aberto:** o do kit (`1a-kit-teste`, worktree `wt/kit-teste`, sem zona protegida). Conferir `gh pr checks`; o teste `semear.test.ts` só roda na CI. Só avisar pronto com tudo verde.
- **Parada:** o kit está pronto; a etapa D só começa com o aval do Cesar, depois do teste no notebook.
- **Decisão pendente do Cesar:** tela de triagem no detalhe do chamado (lacuna da etapa C), antes ou durante a D.

### #77 mergeado; tela de triagem no detalhe do chamado (30/09/2026)
- **#77 (kit de teste) na `main`**, com a CI verde no PR e depois do merge. O `semear.test.ts` rodou no Supabase do runner (5 de 5): o script dos dados de demonstração está validado num banco real.
- **Decisão do Cesar (30/09/2026):** a tela de triagem entra agora, antes do teste no notebook, usando as rotas que já existem. O passo a passo vai para o roteiro do docs/10.
- **Branch `1a-triagem`**, worktree `wt/triagem`. Sem migração, sem ADR, sem rota nova: não é zona protegida.
- **Painel "Triagem e atribuição"** (`apps/web/src/cliente/triagem.tsx`), no detalhe do chamado, abaixo das OS: triar (com a prioridade junto), ajustar a prioridade, gerar a OS para um Técnico ou uma equipe do hotel, reatribuir e cancelar a OS (com motivo) e cancelar o chamado (com motivo), pelas seis rotas da C3, sempre com a versão vista.
  - **O que aparece em cada estado** sai das tabelas de transição do domínio (`TRANSICOES_DO_CHAMADO`, `TRANSICOES_DA_OS`, `ESTADOS_COM_PRIORIDADE_AJUSTAVEL`), sem regra repetida na tela. No chamado aberto, a prioridade vai com a triagem, num formulário só.
  - **Quem pode** é decidido pela API, como no aceite da C7: o painel aparece para todos, e a recusa volta como código e aparece traduzida.
  - **Lista de responsáveis:** as equipes ativas e as pessoas ativas que `GET /api/v1/hoteis/{id}/equipes` já devolve. Quem não é Técnico do hotel é recusado pela API (`responsavel_sem_papel_tecnico`). Filtrar só Técnicos pede uma rota nova de leitura; ficou registrado no docs/10 como limite, fora desta tarefa.
- **Catálogos:** 20 chaves `corretiva.triagem.*` em pt-BR, en, es e fr, com os termos que os catálogos já usam (service request, orden de trabajo, ordre de travail, triaje).
- **Testes:**
  - `apps/web/test/telas-triagem.test.tsx`: as ações por estado; o valor do seletor de responsável; só equipes ativas; o aviso sem candidatos; o painel nos quatro idiomas; e, no pseudo-idioma, todo texto vindo do catálogo.
  - No `semear.test.ts` (CI), o passo a passo do roteiro sobre os dados de demonstração:
    - Gerente e Gestor recebem a Equipe Centro e o Técnico do Centro na lista;
    - a Solicitante é recusada na triagem;
    - o Gerente tria com a prioridade urgente;
    - OS para quem não é Técnico: recusada; para a equipe: gerada;
    - reatribuição ao Técnico e cancelamento da OS, com o chamado de volta à triagem;
    - cancelamento do chamado sem motivo: recusado; com motivo: feito.
    - Cada recusa tem mensagem no catálogo.
- **docs/10:** passo a passo da triagem na seção 4; Gestor, Gerentes e Solicitante apontando para ele; a lacuna saiu da seção 5.

### Ponto de retomada (30/09/2026, tela de triagem)
- **`main`:** merge do #77 (kit de teste), CI verde. **Dev:** 27 migrações aplicadas.
- **PR aberto:** o da triagem (`1a-triagem`, worktree `wt/triagem`, sem zona protegida). Conferir `gh pr checks`; o passo a passo no `semear.test.ts` só roda na CI. Só avisar pronto com tudo verde.
- **Depois do merge:** `gh run list --branch main`; main vermelha se corrige antes de qualquer outro merge. Aí avisar o Cesar de que o kit e a triagem estão na `main`, para ele rodar o kit no notebook.
- **Parada:** a etapa D só começa com o aval do Cesar, depois do teste no notebook.

### #78 mergeado; contrato com o Reputation e tarefas pós-piloto (30/09/2026)
- **`main`:** merge do #78 (tela de triagem), com CI, banco e segurança verdes no push. O kit (#77) e a triagem estão na `main`, então o Cesar pode rodar o kit no notebook.
- **Contrato com o Reputation:** a cópia idêntica do contrato v0.1 (proposta) está em `docs/referencia/contrato-integracao-reputation-v0.1.md`.
- **Tarefas IX1 a IX3 no `docs/05`:** credencial de integração por tenant, rota de entrada de chamados com origem externa e entrega de eventos por webhook assinado. É a mesma base que vai servir ao EasyTools. **Não implementar antes do piloto** (Cesar).
- **Parada:** a etapa D só começa com o aval do Cesar, depois do teste no notebook.
- **Correção no contrato (Cesar, 30/09/2026):** o cronograma dizia "Contrato aprovado — Agora", o que estava errado. O contrato é proposta até Cesar e Kaio aprovarem, e a linha agora é "Aprovação do contrato por Cesar e Kaio — Pendente". **Pendência:** a mesma correção precisa ir para a cópia do repositório do Reputation, para as duas cópias continuarem idênticas.

### Etapa D começa: D1, histórico de cada registro (30/09/2026)
- **Decisão do Cesar:** a etapa D começa agora, em paralelo com o teste dele no notebook. As correções que o teste pedir vão em PRs próprios, separados dos da D. Se a D mudar algo que o script de dados ou o roteiro do docs/10 usam, os dois são atualizados no mesmo PR.
- **`main`:** #79 (contrato com o Reputation) e #80 (aprovação do contrato pendente) mergeados, com a CI verde no push.
- **Branch `1a-d1-historico`**, worktree `wt/d1-historico`. **É zona protegida:** tem migração.
- **Migração 0028** (`auditoria_do_proprietario`): a policy de leitura de `app.auditoria` soma as linhas do local, do ativo, do chamado e da OS que o proprietário vê. A da parada fica de fora, pela decisão de 30/09/2026 (C5, pgTAP 020). "Vê" é a RLS da tabela de cada registro: o EXISTS roda com o contexto de quem pede. A auditoria do hotel fica de fora, porque grava o uso da licença. Não tem função nova nem gatilho. Quem escreve no hotel e o Admin leem como antes.
- **pgTAP 023:**
  - sem contexto;
  - admin de outro tenant;
  - gerente como antes;
  - dono de UH lê só o que está na UH dele;
  - o ativo que sai da UH sai do histórico;
  - dono do hotel inteiro, sem a auditoria do hotel;
  - vínculo vencido;
  - implantador vencido;
  - proprietário não grava;
  - sem UPDATE nem DELETE.
- **Domínio** (`auditoria.ts`): `mudancasDaAuditoria` junta o antes (nome da coluna) e o depois (nome do domínio) no mesmo campo.
  - Mostra só o que o depois grava.
  - Abre os campos estendidos do ativo, um por chave.
  - Transforma o responsável da OS em técnico e equipe.
  - Deixa de fora a versão, a busca, a cópia da política, o próprio registro, o hotel e o chamado pai.
  - A ativação bloqueada não mostra o uso da licença.
  - Os ids viram referências para buscar o nome.
- **Aplicação:** `criarCasosDeUsoDeHistorico`. O registro fora do escopo dá 404 `registro_nao_encontrado`, com a entidade, e a auditoria nem é lida. Os nomes só são pedidos quando aparece algum id.
- **Banco:** `criarPortaHistorico`. A leitura é toda pela RLS: o nome de quem gravou vem por left join, e os nomes das referências vêm das tabelas de cada uma. O que quem pede não lê fica de fora e aparece como "sem acesso".
- **Rota** `GET /api/v1/auditoria`, com contrato Zod, OpenAPI e teste de paridade das entidades com o domínio.
- **Tela** (`HistoricoDoRegistro`): o botão "Ver histórico" fica no detalhe do chamado e de cada OS, nos locais, nos ativos, na configuração do hotel e na lista de hotéis. O histórico só carrega quando pedido. A versão na chave fecha o histórico aberto depois de uma gravação.
- **Catálogos:** 20 chaves `auditoria.*` nos quatro idiomas. As ações do chamado e da OS reaproveitam as da linha do tempo.
- **Configuração do hotel:** passa a gravar o antes na auditoria.
- **Testes:**
  - domínio: 12 casos;
  - aplicação: 3;
  - tela: 6 (os quatro idiomas e o pseudo-idioma);
  - no `semear.test.ts` (só na CI), o histórico no escopo de cada papel.
- **docs/10:** passo a passo do histórico. O proprietário ganha linha do tempo e histórico, depois do `db push` da 0028. A lacuna saiu da seção 5.
- **Local:** lint, typecheck 10/10 e testes 17/17 verdes.

### Fechamento da fase 1a: conferência de conformidade (05/10/2026)
- **#81 (D1)** foi mergeado com o job do banco vermelho no último commit. O pgTAP passou; falhou um teste de integração do `packages/db` que esperava a linha do tempo do proprietário vazia. A `main` repetiu a falha no `3570da8`. A correção está no **#83**.
- **No mesmo #83, a exceção do `pnpm audit`.** Um alerta alto novo no `braces`, GHSA-vfj7-8cjw-p6xm, sem versão corrigida, passou a reprovar todos os PRs. O `braces` só entra pelo lint de fronteiras e pelo gerador de tipos. A exceção ficou registrada com o motivo em `pnpm-workspace.yaml`, como pede o `ci.yml`, para revisão do Cesar.
- **Antes do merge do #81:** a 0028 incluía a auditoria da parada para o proprietário, o que contrariava a decisão de 30/09/2026 (C5, pgTAP 020). A parada saiu da policy, e os testes 003 e 023 foram ajustados.
- **Conferência de conformidade** em `docs/11-conformidade-fase-1a.md`, só por leitura, em quatro frentes:
  - **resultado:** nenhuma violação das regras inegociáveis;
  - **quatro achados médios:** a identidade de demonstração com a chave secreta sem ADR, nenhuma trava contra preview no banco de produção, o `hotel_id` fora do log e o `pnpm dev` inexistente na raiz;
  - **treze baixos:** guardas de lint, meta-teste e testes incompletas, e pendências de operação.
  - Cada correção vai num PR próprio, só com o aval do Cesar.
- **Pendente do Cesar:** o `db push` da 0028. Até lá, o proprietário vê o histórico e a linha do tempo vazios no dev.

### Ponto de retomada (05/10/2026, fim da etapa D)
- **Etapa D:** feita. A D1 está na `main` (#81). A conferência de conformidade está neste PR (`docs/11`).
- **Para a `main` voltar a verde:** o #83, com o teste de integração e a exceção do `pnpm audit`. Ele entra antes de qualquer outro merge, inclusive o #82 (`int-motor`, que não é desta sessão). Depois do merge: `gh run list --branch main`.
- **Do Cesar:**
  - `db push` da 0028;
  - teste do kit no notebook: as correções que ele pedir vão em PRs próprios;
  - aval para corrigir os achados da conformidade.
- **Parada:** a fase 1b só começa com o aval do Cesar.

### Main verde, Reputation descontinuado e PR-I1 (05/10/2026)
- **`main`:** #83, #82 e #84 mergeados nessa ordem. CI, banco e segurança verdes no push do merge do #84 (`be08194`).
- **Dev, só por leitura:** as 28 migrações estão aplicadas, a 0028 inclusive. A policy `app_select` de `app.auditoria` tem a cláusula do proprietário, sem a parada. O dev está sem dados (zero tenants, chamados e auditoria), então a leitura do proprietário fica para depois do script de dados do kit. A CI já cobre a leitura no pgTAP 023.
- **Reputation descontinuado** (Cesar, 30/09/2026, registrado agora):
  - o contrato leva a marca de descontinuado no cabeçalho, sem apagar o texto;
  - o `docs/05` diz que as IX1 a IX3 servem ao EasyTools e à entrada de feedback;
  - a pendência de 30/09, levar a correção do cronograma à cópia do repositório do Reputation, está encerrada.
- **HubKeep Intelligence:**
  - o PRD está em `docs/referencia/prd-hubkeep-intelligence-v1.md`, como proposta e com o texto original;
  - o pedido de 01/10 tinha parado porque o PRD não veio anexado; o Cesar pôs o arquivo no repositório em 05/10.
- **PR-I1** (`docs/referencia/lacunas-instrumentacao-intelligence.md`), só análise:
  - dos 17 campos da seção 32: 5 existem, 1 se deriva da auditoria, 7 faltam e cabem no MVP, e 4 são de fase 2 (fornecedor e custos);
  - a proposta tem três migrações, a do ativo, a do chamado e a dos códigos de manutenção, cada uma num PR de zona protegida, com o impacto no PWA tudo opcional;
  - também lista os conflitos do PRD com as regras.

### Decisões do Cesar sobre o PR-I1 e o docs/11 (05/10/2026)
- **Instrumentação** (relatório de lacunas atualizado neste PR):
  - as três migrações entram no começo da 1b, antes de qualquer outra tarefa dela, na ordem proposta: ativo; chamado e OS; códigos de manutenção;
  - versão mínima de custo e fornecedor, fora do PWA: "executado por" na triagem (equipe interna ou terceiro, com o nome do terceiro) e "custo informado" no aceite (valor opcional em reais, sem aprovação nem alçada). O módulo de custos e fornecedores segue na fase 2;
  - os códigos são cadastrados pelo Admin do grupo, com padrões por categoria. A obrigatoriedade é política por hotel, desligada por padrão, e no PWA os códigos aparecem como sugestão.
  - **A confirmar na 1b:** com a política ligada, a cobrança dos códigos fica no aceite, para não recusar uma conclusão feita offline.
- **docs/11:** o agrupamento e as recomendações estão aprovados, com uma mudança no B5. A recuperação de senha entra no piloto, na fase 1c, junto com o e-mail próprio; até lá, a rota `auth/confirmar` recusa `recovery` e `magiclink`. O ajuste do B13 no GitHub (Gitleaks e Semgrep obrigatórios) fica com o Cesar.
- **Ordem de trabalho:**
  1. o #85 com a CI verde;
  2. os PRs de zona protegida, um de cada vez: ESLint (fronteira do `packages/inteligencia`, B11 e B3), meta-testes (B1, B2, B6 e B8), M1 e B13;
  3. em paralelo, fora da zona protegida, cada um no seu PR: M2, M3, M4, B4, B5, B9 e B12.
- **Fase 1b:** só com o aval do Cesar, depois do teste do kit.

### Achados do docs/11: PRs abertos (05/10/2026)
- **#85** (PRD e PR-I1) mergeado. As decisões do Cesar chegaram depois do merge e estão no **#86**.
- **Zona protegida, um de cada vez:** **#87**, ESLint (fronteira do `packages/inteligencia`, B11 e B3). Depois dele vêm os meta-testes (B1, B2, B6 e B8), o M1 e o B13.
- **Fora da zona protegida, em paralelo**, cada um no seu PR e sem mexer no diário, para não haver conflito entre eles:
  - **#88:** M4, `pnpm dev` na raiz;
  - **#89:** B9, crons de SLA e preventiva fora do agendamento;
  - **#90:** B12, `.env.example` só com variável lida, e o teste olhando o Vite e o `exigir()`;
  - **#91:** B5, `lang` do PWA, e `/auth/confirmar` aceitando só o convite até a 1c;
  - **#92:** B4, es e fr obrigatórios e códigos de erro montados em template;
  - **#93:** M2, o preview recusa o banco de produção (`HK_REF_PRODUCAO`);
  - **#94:** M3, `hotel_id` no log e no Sentry.
- **Ordem dos merges:** o #90 e o #93 mexem no `.env.example`; quem entrar depois pode precisar atualizar o branch.
- **Incidente sem dano:** um comando com crase dentro de aspas duplas no bash executou trechos do texto. Um `pnpm install` rodou dentro do worktree `wt/docs-pr-i1`, que é um checkout do HubKeep, e a saída foi parar neste diário num commit do #86, corrigido no commit seguinte. Regra: texto com crase vai por arquivo (Write), nunca dentro de `node -e "..."`.

### Ponto de retomada (05/10/2026, achados do docs/11)
- **Ao retomar:** `gh pr checks` de #86 a #94 e `gh run list --branch main`. A `main` vermelha se corrige antes de outro merge.
- **Próximo PR de zona protegida**, só depois do merge do #87: meta-testes (B1, B2, B6 e B8, com a migração pequena da policy de INSERT de `atribuicao_escopo`). Depois, M1 e o resto do B13.
- **Do Cesar:**
  - o merge do #87, com bypass;
  - o ajuste do B13 no GitHub;
  - decidir se o PWA reporta erro ao Sentry (resto do M3);
  - o teste do kit no notebook;
  - o aval para a 1b.
- **Parada:** a fase 1b só começa com o aval do Cesar.

### PR de ESLint: fronteira do Intelligence, B11 e B3 (05/10/2026)
- **Zona protegida** (`eslint.config.mjs`), o primeiro da ordem aprovada para os achados do `docs/11`.
- **Fronteira do `packages/inteligencia`** (pedido de 01/10/2026):
  - o pacote vira elemento das fronteiras;
  - ele importa só o `dominio` e o `i18n`, sem pacote externo nem módulo do Node;
  - nenhum pacote nem app do núcleo o importa, nem pelo nome nem por caminho relativo. A rota do Intelligence, quando existir, ganha uma liberação explícita.
- **B11:**
  - `pg` e `postgres` passam a ser proibidos em todo elemento fora do `packages/db`; antes, só nos apps;
  - o `packages/aplicacao` não importa módulo do Node.
- **B3:**
  - o lint de texto fixo passa a olhar as props `rotulo`, `titulo` e `mensagem`;
  - também pega o literal passado a `alert`, `confirm` e `prompt` e atribuído ao `document.title`;
  - arquivos `.ts` e literal guardado em variável ficam para a revisão, como aprovado.
- **Testes:** `tests/fronteiras.test.ts` ganhou os casos proibidos e permitidos de cada regra. Local: lint, typecheck e os testes da raiz verdes; nenhum código existente violava as regras novas.

### Pendências do Intelligence avaliadas e decididas (06/10/2026)
- **Main:** #96 a #102 (Intelligence e dependência) mergeados; verde no `4994d1a`. A 0029 está no dev (`db push` do Cesar, conferido por leitura).
- **Avaliação** do mapa das entradas do `calcularDia` e da proposta de extensão das políticas, do agente do Kaio, sem aplicar nada. **Decisões do Cesar**, registradas no fim do relatório de lacunas:
  - aprovados com os ajustes do agente do núcleo: a liberação estreita no lint, a tabela de transições da OS, o ponto de extensão das políticas e os módulos contratados em `licenca.modulo`;
  - criticidade fixa de 1 a 5, com nomes configuráveis nos quatro idiomas;
  - o limite que sugere insight vira campo da `inteligencia.atencao_ativo`, com padrão 70.
- **Aprovação de ADR do Intelligence:** é dos dois, Cesar e Kaio (30/09/2026, reafirmado pelo Cesar em 06/10/2026). O registro de 05/10, na sessão do agente do Kaio, que aceitava um só, foi revogado. Os ADR-033 a 037 e as três regras do cálculo do dia (#101) ficam como "aprovados por Kaio; aguardam aprovação do Cesar". A regra dos dois agentes entrou no `CLAUDE.md`.
- **Para o agente do Kaio**, no diário dele:
  - anotar a revogação da regra de 05/10;
  - a política `inteligencia.atencao_ativo` ganha o limite do insight, com padrão 70;
  - a criticidade é 1 a 5 fixa, sem o máximo da política;
  - o job usa a resolução do registro do núcleo, e a resolução própria do `politicas.ts` sai ou passa a delegar;
  - as rotas e telas do Intelligence ficam em pastas `inteligencia` do `apps/web`, e o servidor do módulo em `apps/web/src/servidor/modulos/inteligencia/`.
- **Fila de zona protegida, um PR por vez:**
  1. M1 (#103, mergeado em 06/10/2026);
  2. a correção do ADR-033 com a regra dos dois agentes no `CLAUDE.md` (este PR);
  3. B13;
  4. a liberação no lint com o adendo ao ADR-026 (extensão das políticas);
  5. no começo da 1b, com o aval do Cesar: migração 1 (ativo), 2 (chamado e OS), transições da OS, 3 (códigos) e `licenca.modulo`.

### Ponto de retomada (06/10/2026, fila de zona protegida)
- **Ao retomar:** `gh pr list`, `gh pr checks` do PR aberto e `gh run list --branch main`.
- **Prontos no local:** o B13 (`wt/b13-zona`), que precisa ser atualizado com a `main` antes de abrir. Este PR está em `wt/adr-aprovacao`.
- **Do Cesar:** o merge de cada PR protegido; ler e responder sobre os ADR-033 a 037 e as regras do #101; o ajuste do B13 no GitHub; decidir se o PWA reporta erro ao Sentry; o teste do kit; o aval para a 1b.
- **Parada:** a fase 1b só começa com o aval do Cesar.

### Registro de políticas e liberação estreita no lint (06/10/2026)
- **Mergeados:** #105 (ADRs do Intelligence aguardam o Cesar, regra dos dois agentes), #106 (registro de políticas com extensão de módulo) e #107 (B13).
- **#106, fora da zona protegida:**
  - `registroDePoliticas` no domínio, com uma resolução só (hotel → bandeira → grupo → padrão);
  - o caso de uso de configuração recebe o registro e o contrato aceita chave de módulo;
  - de passagem, `ehChaveDePolitica` deixou de aceitar chave do protótipo (`toString`).
- **Este PR, zona protegida:**
  - a liberação estreita no lint: só a pasta `apps/web/src/servidor/modulos/inteligencia/` e as rotas e telas em pastas `inteligencia` importam `@hubkeep/inteligencia`;
  - `montarInteligencia()` nessa pasta, que por enquanto não registra extensão;
  - a composição monta o registro de políticas com o que ela devolve;
  - `tests/composicao-inteligencia.test.ts`: só a composição chega à pasta, e só por essa função;
  - o adendo ao ADR-026, cujo texto aguarda a aprovação do Cesar.
- **Para o agente do Kaio**, além do que está na entrada anterior:
  - o conteúdo de `montarInteligencia` passa a ser dele. A extensão das políticas (`ExtensaoDePolitica` do domínio, prefixo `inteligencia.`) só é registrada junto com o filtro por módulo contratado (`licenca.modulo`, 1b);
  - `ehChaveDePoliticaDoIntelligence` usa `c in PADROES_DO_INTELLIGENCE`, que aceita `toString` e quebra o `valorValidoDoIntelligence`; trocar por `Object.hasOwn`, como no núcleo;
  - a leitura das chaves dele para a tela é do módulo: a configuração do núcleo devolve só as chaves do núcleo.

### Ponto de retomada (06/10/2026, depois do registro de políticas)
- **Ao retomar:** `gh pr list`, `gh pr checks` do PR aberto e `gh run list --branch main`.
- **Fila de zona protegida:** este PR é o último antes da 1b; depois dele, o começo da 1b, com o aval do Cesar.
- **Do Cesar:** o merge de cada PR; ler e responder sobre os ADR-033 a 037, as regras do #101 e o adendo ao ADR-026; o ajuste do B13 no GitHub; decidir se o PWA reporta erro ao Sentry; o teste do kit; o aval para a 1b.
- **Parada:** a fase 1b só começa com o aval do Cesar.

### Fim da fila de zona protegida (06/10/2026)
- **Mergeados:** #107 (B13) e #108 (liberação estreita no lint e adendo ao ADR-026). CI da `main` verde depois do #108 (CI, banco e segurança).
- **Decisão do Cesar:** se o PWA reporta erro ao Sentry fica para junto da decisão do Sentry, antes do piloto. Registrado como pendência no `docs/04` (item do Sentry) e no M3 do `docs/11`.
- **Com o Cesar:** os ADR-033 a 037, as três regras do #101, o texto do adendo ao ADR-026, o ruleset do B13 no GitHub e o teste do kit.

### Ponto de retomada (06/10/2026, fila de zona protegida concluída)
- **Ao retomar:** `gh pr list`, `gh pr checks` do PR aberto e `gh run list --branch main`.
- **Próximo passo:** o começo da 1b, só com o aval do Cesar depois do teste do kit, com os PRs de zona protegida um por vez:
  1. migração do ativo, com a criticidade de 1 a 5;
  2. migração do chamado e da OS, com executado por, nome do terceiro e custo informado;
  3. transições da OS;
  4. códigos de manutenção;
  5. `licenca.modulo`.
- **Parada:** a fase 1b só começa com o aval do Cesar.

### Identidade visual, U0 e U1 (06/10/2026)
- **Plano da 1b:** #111 mergeado; a 1b continua parada até o aval do Cesar. A I1 (migração do ativo) está commitada só no local, em `wt/instrumentacao` (`1b-i1-ativo`), e fica lá até a 1b.
- **Tarefa U1, identidade visual a partir do mock** (`docs/referencia/design/csc-mock/`, referência oficial). Divisão aprovada pelo Cesar:
  - U0: cliente do Supabase criado uma vez só no login do web (#114, fora da zona protegida);
  - U1: fundação do `packages/ui` (este PR, zona protegida);
  - U2: componentes base;
  - U3 e U4: web;
  - U5: PWA.
- **Decisões do Cesar:**
  - fontes pelos pacotes `@fontsource`;
  - web escuro como padrão, com troca e cookie lido pelo servidor;
  - PWA claro como padrão; as telas do PWA fora da lista (ativos, fotos do ativo) herdam tokens e fontes sem reestruturar;
  - o painel de implantação da 1a recebe só o estilo;
  - o ADR-038 ele aprova quando vier no PR.
- **U1:**
  - `packages/ui` com os tokens nos dois temas, as fontes e a base dos elementos;
  - o lint: o `ui` só para o web, o PWA e as telas do Intelligence; ele mesmo só importa React, sem texto fixo;
  - o teste de contraste (`tests/ui-contraste.test.ts`), que pegou dois pares a mais do que a conta inicial (a prioridade baixa no escuro e o âmbar de texto no claro sobre o fundo);
  - o mock commitado, fora do ESLint e do Semgrep;
  - o ADR-038, aguardando a aprovação do Cesar.
- **Próximas tarefas do Cesar, na ordem:**
  - P1, desempenho, depois da U1: diagnóstico antes de corrigir (proxy, pool de conexões, chamadas duplicadas no detalhe, medição no build de produção e metas por tela);
  - prioridades realistas por categoria nos dados de demonstração (hoje todos os chamados aparecem como Baixa);
  - o Cesar passa pelas telas com o pseudo-idioma e manda os textos fixos que aparecerem.

### Ponto de retomada (06/10/2026, U1 aberto)
- **Ao retomar:** `gh pr list`, `gh pr checks` do PR aberto e `gh run list --branch main`.
- **Fila:** U1 (zona protegida, merge do Cesar) → U2 → U3 e U5 em paralelo → U4. Fora da fila: P1 (diagnóstico), depois da U1, e os dados de demonstração.
- **Parada:** a fase 1b só começa com o aval do Cesar.

### U2, U3 e o diagnóstico da P1 (07/10/2026)
- **Merges do Cesar:** #114 (U0), #115 (U1), #116 (prioridades da demonstração) e #117 (U2, componentes base do `packages/ui`). A CI da main ficou verde depois de cada um.
- **U3 (este PR), web parte 1:**
  - o layout raiz importa `@hubkeep/ui/estilo.css` e lê o cookie `hk_tema` no servidor (escuro por padrão); sai o estilo solto do `body`;
  - as telas autenticadas passaram para o grupo de rotas `app/(painel)/`, que não entra na URL; o `layout.tsx` dele põe a moldura (`cliente/moldura.tsx`): menu lateral com `Link` do Next, barra superior com idioma, tema e sair, e a faixa de escopo com o grupo;
  - a sessão, o grupo (`hk_tenant`) e a sincronização do idioma saíram da tela inicial para a moldura; a tela inicial ficou só com os hotéis;
  - login e definição de senha na tela de entrada do `ui`, com rótulo visível em cada campo;
  - catálogos: as chaves dos links da tela inicial viraram `menu.*` (com "Hotéis" e "Paradas a encerrar" mais curtos), mais o rótulo do menu, os grupos, o atalho para o conteúdo e o botão de tema, nos quatro idiomas;
  - as outras telas do painel entram na moldura com o próprio h1 e o estilo antigo até a U4.
  - **Aviso ao agente do Intelligence:** tela nova autenticada vai em `apps/web/src/app/(painel)/`; o padrão do lint (`app/**/inteligencia`) continua valendo.
- **Diagnóstico da P1, levado ao Cesar (sem correção ainda):**
  - medições da máquina local: ida e volta ao pooler cerca de 22 ms; transação (BEGIN, contexto, consulta, COMMIT) cerca de 90 ms; conexão nova de 130 a 270 ms; Auth de 46 a 90 ms; build de produção sem sessão de 10 a 15 ms por pedido;
  - a) o `proxy.ts` chama `getUser()`, que vai ao Auth em todo pedido com sessão, e o resultado não autoriza nada; os handlers já validam pelo JWKS em memória;
  - b) o pool é único por processo, mas cada método de repositório abre a própria transação (de 4 idas e voltas), e o pool fecha conexão ociosa em 10 s;
  - c) no detalhe do chamado, o dobro é do StrictMode de dev; a navegação por `<a href>` recarrega o documento inteiro; a proposta é carregar o detalhe no servidor;
  - d) metas propostas: leitura da API até 150 ms, proxy até 15 ms, listas até 400 ms, detalhe até 500 ms, fila do dia do PWA até 300 ms;
  - correções propostas, um PR cada: P1a (proxy sem ida ao Auth e `Server-Timing`), P1b (transação por caso de uso, BEGIN e contexto juntos, pool ocioso maior) e P1c (detalhe no servidor e `Link`). Aguardam o aval do Cesar.

### Ponto de retomada (07/10/2026, U3 aberto)
- **Ao retomar:** `gh pr list`, `gh pr checks` do PR aberto e `gh run list --branch main`.
- **Fila:** U3 (este PR) e U5 (PWA) → U4 (resto das telas do web na moldura). P1a, P1b e P1c esperam o aval do Cesar.
- **Parada:** a fase 1b só começa com o aval do Cesar.

### U4a, telas da operação (07/10/2026)
- **Merges do Cesar:** #118 (U3). A U5 (PWA) foi aberta como #119, rebaseada na main depois da U3.
- **U4 dividida em duas,** para o PR não ficar grande demais: U4a (operação, este PR) e U4b (cadastros e configuração).
- **U4a:**
  - listas de chamados e de OS em tabela, com filtros em linha, selo de situação pela cor do estado canônico e selo de prioridade pelo nível;
  - o nível da prioridade padrão vem da chave; o da prioridade criada pelo tenant, da posição do peso entre as ativas (`nivelDaPrioridade`);
  - detalhe do chamado em duas colunas (chamado, OS, aceite e triagem; linha do tempo e histórico), com `Link` de volta;
  - paradas a encerrar em lista com ação;
  - histórico, anexos e campo de busca, usados também pelos cadastros, já nos componentes;
  - o título dessas telas sai da barra superior (`tituloDaRota`), e o h1 próprio saiu;
  - o `ui` ganhou as classes de arranjo (grade, pilha, filtros, bloco, linha do tempo, lista, caixa de marcar) e a `Nota` (informação, confirmação e atenção).

### Duas tarefas novas no plano (07/10/2026)

Pedido do Cesar, registrado sem implementar:
- **M4, na fase 1b, junto com a M2:** aprovação dos ativos cadastrados pelo celular, com a exigência por política de hotel. Os ativos existentes passam a aprovados. Conferido: o ativo não tem situação de cadastro que dê para reaproveitar (só `desativado_em` e `versao`); o modelo a seguir é o `status` do local. As propostas (padrão da política, quem aprova e se o pendente recebe chamado) vão ao Cesar antes de codificar.
- **Auditoria geral, na fase 1c:** tela só de leitura com filtros, paginação e CSV, com o escopo pela RLS e a auditoria sem hotel só para o Admin do grupo e o Implantador (ADR-021). Reaproveita a tradução do D1.

### U4b, cadastros e configuração (07/10/2026)

As dez telas de cadastro e configuração (hotéis, locais, categorias, ativos, equipes, proprietários, bandeiras, membros, configuração e implantação) e o QR do ativo passaram para os componentes do `packages/ui`. Com isso, termina a U4.
- **Título:** todas as telas do menu têm o título na barra superior. O h1 próprio e o "voltar" para o início saíram, porque o menu cumpre esse papel. Um teste confere que cada item do menu tem título.
- **Peças comuns:** o aviso de resultado (`cliente/aviso.tsx`) agora aceita o texto de sucesso da ação e serve à operação e aos cadastros. A escolha do hotel e a lista de hotéis de quem vê ficaram em `cliente/cadastro.tsx`.
- **Arranjo novo no `ui`:** formulário em linha (`hk-em-linha`), item de cadastro com cabeçalho (`hk-itens`, `hk-item-cabecalho`), lista dentro do item (`hk-sublista`) e o quadro do QR. A entrada e a lista têm a mesma altura mínima, para os campos lado a lado alinharem.
- **Situação em selo:** ativo ou desativado, status do local e do hotel, vigência, papel vencido ou revogado, ativo parado e origem da política.
- **Implantação:** só o visual. O conteúdo é o mesmo.
- **Estilo inline:** não sobra nenhum `style=` nem `<a href>` no web. Tirar o `'unsafe-inline'` do `style-src` continua como pendência, porque é preciso conferir antes o que o próprio Next injeta.
- **Verificação:** lint, typecheck e testes verdes. As telas foram vistas numa vitrine descartável (Vite, com a API simulada e dados fictícios), nos dois temas e em largura estreita, e a vitrine foi apagada. As telas logadas de verdade não foram vistas.


### Respostas do Cesar (07/10/2026)

- **P1:** P1a, P1b e P1c aprovadas, nessa ordem e com um PR cada, com o `Server-Timing` e as metas propostas. A P1 fica fora da zona protegida e corre em paralelo com a 1b.
- **ADR-038 (identidade visual):** aprovado.
- **Adendo ao ADR-026** (extensão por módulo e liberação no lint): texto aprovado.
- **Fase 1b:** liberada. Começa pelas migrações da instrumentação, uma por vez, com a I1 primeiro. Nenhum PR de zona protegida abre junto com outro.
- **Teste do kit:** continua, já no visual novo, depois da P1. As correções que saírem dele vão em PRs separados.
- **Pseudo-idioma no web:** nenhum texto fixo nas telas de chamados, de OS, no detalhe com histórico nem em categorias. O que ficou sem mudar eram dados digitados. O Cesar vai repetir a conferência no PWA.
- **Limpeza:** os worktrees dos branches já mergeados podem sair. O `wt/p1-medicao` só sai quando a P1 terminar.

### Aviso ao agente do Intelligence (07/10/2026)

O Cesar deu a parte dele nas aprovações do Intelligence. Os status estão no `docs/03`.
- **Aprovados pelos dois (Kaio em 05 e 06/10, Cesar em 07/10):**
  - ADR-033, ADR-034 e ADR-037;
  - ADR-035, com a revisão de 06/10 (janela de leitura de 180 dias e validação entre chaves);
  - as três regras do cálculo do dia (#101), que entram no `docs/03` com o PR da `app.insight`.
- **ADR-036, aprovado pelo Cesar com uma condição.** A condição precisa do aceite do Kaio:
  - cada resultado diário grava a versão da política e a versão da fórmula usadas;
  - um recálculo fica marcado como recálculo, com a versão nova.
- **Hotel novo num insight de rede, aprovado pelo Cesar com uma condição.** A condição também precisa do aceite do Kaio:
  - o hash da lista de hotéis é calculado fora do `packages/inteligencia`, no job (com `node:crypto`) ou no banco (com `sha256()`);
  - a função pura devolve só a lista canônica dos hotéis;
  - nada de SHA-256 escrito à mão.
- **Pedido:** registrar o aceite (ou não) das duas condições no `docs/diario-intelligence.md`. Até lá, o ADR-036 e a decisão do insight de rede continuam aguardando o Kaio.
- **Etapa I:** a 1b foi liberada, e a I1 (criticidade de 1 a 5) é a primeira migração. As outras vêm uma por vez, cada uma depois do merge da anterior.

### Documento do projeto e planos revistos (08/10/2026)

- **Main verde de novo** com o #129 (Next 16.3.8). Na CI dos merges #127 e #128, a auditoria falhou primeiro, e o lint, o typecheck e os testes foram pulados. Rodei tudo no local sobre a main com os dois, e passou.
- **Documento do projeto versionado** em `docs/referencia/documento-projeto.md`, a visão consolidada da revisão de 07/10/2026.
- **Registro de decisões:** o Registro de produto fica fora do repositório. As decisões de 07/10 em diante passam a ter cópia em `docs/referencia/registro-de-decisoes.md`.
- **`docs/00`** reescrito pelo documento:
  - piloto em 4 hotéis cobrindo a matriz de modelos;
  - modelo contratual e edificação;
  - itens novos do MVP;
  - fase 1d e EasyGov depois do MVP;
  - calendário de 5 a 8 semanas.
- **`docs/12`:** a etapa I passou a ter oito migrações, na ordem do Cesar de 08/10. Entrou a etapa PB (pacote da bandeira). O "Registrado para a fase 1c" foi para o plano novo.
- **`docs/13-plano-fase-1c.md`** (novo): a fase 1c e a preparação do piloto, com as respostas do Cesar de 08/10 registradas no `docs/piloto/README.md`.
- **`perguntas-cliente.md`:** o sistema hoteleiro é a primeira pergunta. Entraram os modelos de empreendimento, a equipe, a terceirização e os dados do piloto.

**Aviso ao agente do Intelligence: a numeração da etapa I mudou.**

| Item | Número antigo | Número novo |
|---|---|---|
| Chamado e OS | I2 | I4 |
| Transições da OS | I3 | I5 |
| Códigos de manutenção | I4 | I6 |
| `licenca.modulo` | I5 | I7 |

- **Itens novos:** I2 (hotel e local), I3 (fornecedor mínimo) e I8 (fotos e assinatura).
- **O que muda para o Intelligence:** o "executado por" da OS passa a apontar para o fornecedor da I3, e não para um nome em texto livre.
- **A fila de zona protegida** abre para as tabelas do Intelligence depois da I7.

### I1, ativo: compra, garantia e criticidade (08/10/2026)

Primeira migração da instrumentação (etapa I do `docs/12`). PR de zona protegida.
- **Banco (migração 0030):** três colunas anuláveis em `app.ativo`:
  - `data_compra` e `garantia_ate` (`date`);
  - `criticidade` (`smallint`, `check` de 1 a 5).
  - O UPDATE vai para o `hk_app`, sob a policy de escrita no hotel que já existe.
  - O pgTAP 024 testa a escala, os privilégios e a escrita por papel.
- **Domínio:**
  - `validarCriticidade` (`ativo_criticidade_invalida`);
  - `validarDatasDoAtivo` (`ativo_data_invalida`, `ativo_garantia_antes_da_compra`, garantia no mesmo dia vale);
  - `ehDataDeCalendario`;
  - a política `ativo.criticidade`, com os nomes de cada nível por idioma. O padrão é vazio, e então valem os nomes do catálogo.
- **Compatibilidade com o aparelho:** na gravação, os três campos são opcionais.
  - Na alteração, o campo ausente mantém o valor gravado, e `null` apaga. A operação offline guardada antes da I1 continua valendo.
  - No PWA com a referência guardada antes da I1, o campo deixado vazio não vai na operação.
- **API:**
  - a lista de ativos do hotel devolve os nomes da criticidade resolvidos para o hotel (`nomesDeCriticidade`: hotel → grupo → padrão);
  - as datas saem como `aaaa-mm-dd` (`::text`), sem passar por `Date` e fuso.
- **Telas:**
  - no web, os campos na tela de ativos e um selo para a criticidade 4 e 5;
  - na configuração, a edição dos nomes dos níveis por idioma, no grupo ou no hotel;
  - no PWA, a parte recolhida "Compra, garantia e criticidade".
- **Kit:** cinco ativos com criticidade, e três com compra e garantia (a do aquecedor já venceu). Num grupo criado antes da I1, os ativos ficam sem esses campos.
- **Auditoria:** os campos novos aparecem traduzidos no histórico.
- **Verificação:**
  - no local: lint, typecheck e testes verdes;
  - na CI: os testes de integração do `packages/db` e o pgTAP rodam no banco da CI;
  - as telas não foram vistas no navegador.
- **Aviso ao agente do Intelligence:** o `@hubkeep/dominio` exporta `Criticidade`, `CRITICIDADE_MAXIMA` e `ehCriticidade`, com os mesmos nomes dos que o `packages/inteligencia` tem hoje. O módulo pode passar a importar do domínio.

### P1b, transação por pedido, contexto no BEGIN e pool ocioso maior (08/10/2026)
- **BEGIN e contexto juntos:** o driver do Kysely ganhou uma subclasse (`DriverDoHubKeep`, em `packages/db/src/conexao.ts`) que, na transação aberta por `emTransacao`, manda `begin; select set_config(...), set_config(...)` num envio só, pelo protocolo simples. Os valores vão como literais, e só UUID ou vazio passa (`inicioComContexto`). O `set_config` continua local à transação. Se o início falhar, sai um `rollback` antes de a conexão voltar ao pool. A transação sozinha cai de 4 para 3 idas e voltas.
- **Escopo de leitura:** todo GET da API roda dentro de `emEscopoDeLeitura` (`packages/db/src/escopo-de-leitura.ts`, chamado pelo `rota()` do `http.ts`).
  - O primeiro `withContext` abre uma transação `read only` com o contexto dele. Os seguintes, com o mesmo contexto e o mesmo acesso, usam essa transação. O COMMIT sai no fim do pedido.
  - Contexto diferente nunca reusa a transação. Leitura que falha descarta o escopo, e as seguintes abrem a própria.
  - `executar` (unit of work) nunca entra no escopo: abre a própria transação, com auditoria e outbox juntas. Escrita fora dela, no escopo, o banco recusa (25006).
  - Conta: N leituras num GET custavam 4N idas e voltas; agora custam N + 2. No `/hoteis/{id}/ativos` (5 leituras), o caminho crítico cai de cerca de 12 para 7.
- **Pool:** `idleTimeoutMillis` de 10 s para 120 s, com `allowExitOnIdle`, `keepAlive` e um ouvinte de `error` no pool (antes, um cliente ocioso que caísse derrubava o processo). Justificativa no comentário de `OCIOSO_MS`.
- **Testes:** testes de unidade novos com pool falso (`packages/db/test/transacao.test.ts`), um caso novo no `integracao.test.ts` (roda na CI) e casos do escopo no `apps/web/test/http.test.ts`.
- **Pendência para o Cesar (ADR):** a proposta de ADR "transação por pedido de leitura e contexto no BEGIN" está no corpo do PR. O `docs/03` não foi tocado, porque é zona protegida.
  - Confirmar pelo Supavisor com `pnpm db:fumaca-dev` (`HK_TESTE_VIA_POOLER=1`) depois do merge.
  - Medir o `Server-Timing` de `app` em `/api/v1/hoteis/{id}/ativos` antes e depois.

### I5, transições da OS (08/10/2026)
- **Merges do Cesar:** #133 (I1), #134 (P1b) e #136 (correção da main: a `ativo.criticidade` na lista de políticas do teste de configuração, que só roda na CI).
- **Migração 0031:** tabela `app.os_transicao`, com as colunas `acao`, `de` (nulo só na geração), `para`, `quando` (`now()` da transação, igual ao `atualizado_em` da OS) e `usuario_id`.
  - Só INSERT. O meta-teste 32 trava o UPDATE em todas as tabelas só de inserção: auditoria, movimentação do ativo, apontamento, material e transição.
  - A leitura segue o recorte da OS. A gravação é de quem tem escrita no hotel, em nome dele mesmo. O worker lê só o tenant do job.
  - O pgTAP 025 cobre os seis casos de isolamento, o implantador vencido, o formato e a falta de UPDATE e DELETE.
- **Gravação:** cada repositório que muda o estado da OS grava a transição na mesma unit of work, antes do reflexo no chamado, da auditoria e do evento. São elas: gerar, reatribuir, iniciar, pausar, retomar, concluir, aceitar, reabrir e cancelar.
  - O estado de antes (`de`) vem do caso de uso, que leu a OS na versão conferida. O UPDATE confere a mesma versão, então o par gravado é o real.
- **Testes de integração** (rodam na CI): o dia offline grava uma transição por ação, e o reenvio não duplica; triagem, reatribuição e cancelamento, com as tentativas recusadas sem linha; aceite e reabertura.
- **Sem histórico retroativo:** as OS que já existiam ficam sem transições, porque não há dado real antes do piloto.
- **Pendência para o Cesar:** a transição feita sem rede leva a hora da sincronização, e não a hora do aparelho. As operações `os.iniciar`, `os.pausar` e `os.retomar` não mandam a hora do aparelho, e a `os.concluir` só manda para a parada. Se o MTTR do piloto pedir a hora do aparelho, é preciso mandar a hora em cada operação, com o limite que a parada já usa.
- **Aviso ao agente do Intelligence:** a tabela é `app.os_transicao`, com as colunas `acao`, `de`, `para`, `quando` e `usuario_id`. Os valores são os de `ACOES_DA_OS` e `ESTADOS_DA_OS` do `@hubkeep/dominio`. O `TransicaoDaOs` do `historico.ts` (`acao`, `para`, `quando`) lê direto dessas colunas, e o worker tem SELECT no tenant do job. No comentário do `historico.ts`, a etapa passou de I3 para I5.

### Respostas do Cesar (08/10/2026, depois da I5)
- **Merges do Cesar:** #135 (I5).
- **As nove decisões de desenho da #132:** aprovadas como propostas. O `docs/12` mudou junto:
  - I2, I3, I4 (parte nova) e I8 com o desenho aprovado;
  - a etapa PB foi para depois da etapa M.
- **Hora do aparelho nas transições feitas sem rede:** sim. Entrou como tarefa I9 no `docs/12`, sem migração.
- **ADR-039 (P1b):** aprovado. O texto foi para o `docs/03`.
- **Bloco do piloto:** confirmado pelo Cesar, nas palavras dele. Entram o script de provisionamento, o kit por turma, o staging antes do treinamento, e o kit e o provisionamento aceitando o staging (pergunta 10). O `docs/13` foi atualizado.
- **Data de revisão da exceção GHSA-vfj7-8cjw-p6xm:** será definida pelo Cesar.
- **Fila (zona protegida, um PR por vez):** I2 → I3 → I4 → I6 → I7 → I8. A I9 fica fora da zona protegida e corre em paralelo, junto com a P1c.

### I9, hora do aparelho nas transições feitas sem rede (08/10/2026)
- **Decisão do Cesar (08/10/2026):** a transição feita sem rede leva a hora do aparelho. Não há migração.
- **Contrato:** `os.iniciar`, `os.pausar`, `os.retomar` e `os.concluir` ganharam `feitaEm`, opcional. A operação guardada antes não tem, e continua valendo. O PWA manda a hora em que o técnico tocou no botão.
- **Domínio (`horaDaTransicao`):**
  - a hora no futuro vira a do servidor;
  - a anterior à última transição da OS vira a dela;
  - sem a hora, vale a do servidor; na conclusão antiga, vale o `concluidaEm`;
  - nunca recusa, porque uma recusa travaria a fila do aparelho.
- **Leitura nova:** `ultimaTransicaoEm`, o maior `quando` de `app.os_transicao` da OS.
- **Teste de integração** (roda na CI): relógio atrasado, operação sem hora e relógio adiantado, com as transições em ordem e nenhuma no futuro.
- **Não verificado:** o PWA não tem teste da tela que monta a operação, e a tela não foi vista no navegador.

### P1c, detalhe do chamado no servidor e navegação por Link (08/10/2026)
- **Detalhe no servidor:** `chamados/[id]/page.tsx` virou Server Component. Ele lê o chamado, as OS, os nomes, a linha do tempo, os hotéis, as situações e prioridades e os candidatos a responsável, e entrega tudo à tela (`tela.tsx`, no cliente). A tela cuida das ações e recarrega pela API depois de cada uma, como antes.
  - Mesmos casos de uso e mesmo contexto da API: as rotas `GET /api/v1/chamados/{id}` e `.../linha-do-tempo` e a página montam a resposta pelo mesmo módulo (`servidor/leituras-do-chamado.ts`), e cada leitura passa pelo contrato da rota.
  - `servidor/pagina.ts` (`carregarNaPagina`) faz para a página o que o `rota()` faz para a API: contexto pelo `resolverContexto` (token do cookie verificado pelo JWKS, tenant do `hk_tenant`), leituras num `emEscopoDeLeitura` (uma transação), erro classificado pelo `falhaDe` do `http.ts` (agora exportado), Sentry no inesperado e uma linha de log `pagina` com `duracao_ms` e `auth_ms`.
  - Quem não vê o chamado, ou pede um id que não é UUID, recebe 404 (`notFound()`, com `not-found.tsx` traduzido pela mensagem `erro.chamado_nao_encontrado`). Sem sessão ou sem grupo escolhido (primeiro acesso), a página não decide nada e a tela carrega pela API, como antes. Outra recusa (ex.: sem permissão) chega à tela como código.
  - Complemento que falha (linha do tempo, referências, equipes) vira vazio, como na tela que chamava a API.
- **Link:** os links internos do painel já eram `next/link` desde a U3 e a U4 (menu, voltar, linhas das listas, implantação). Não sobrou `<a href>` interno; ficam o atalho para o conteúdo (âncora) e os links externos.
- **Detalhe da OS:** o web não tem tela de detalhe da OS (a lista de OS abre o detalhe do chamado), então o item já está coberto. O detalhe da OS do PWA é outra arquitetura (Vite, offline) e fica fora.
- **Testes:** `apps/web/test/carga-da-pagina.test.ts` (montagem pelos casos de uso, 404, sem contexto, recusa, inesperado) e `apps/web/test/pagina-do-chamado.test.tsx` (a página entrega os dados, 404 para quem não vê e para id inválido, e a tela já sai com o chamado no primeiro HTML).
- **Server-Timing:** o da API não mudou. A página continua com o do proxy (`proxy` e `sessao`); um Server Component não grava cabeçalho da resposta, então o tempo da leitura da página vai na linha de log `pagina`.
- **Não verificado no navegador.** Medir com o build de produção: o documento de `/chamados/{id}` (tempo até o chamado aparecer) contra a meta de 500 ms, e a linha `pagina` no log.
- **Pendência para o Cesar:** a moldura só mostra a página depois do efeito que lê o cookie do grupo, então o primeiro HTML ainda sai com "carregando" e o chamado aparece na hidratação, sem pedido à API. Ler o `hk_tenant` no layout do servidor tiraria esse passo; fica para um PR próprio, se as medições pedirem.

### I2, modelo contratual do hotel e edificação do local (08/10/2026)

Desenho aprovado pelo Cesar em 08/10/2026 (`docs/referencia/propostas-desenho-1b.md`, item 1). PR de zona protegida.
- **Banco (migração 0032):**
  - `app.hotel.modelo_contratual`, anulável, com o check `hotel_modelo_contratual_lista` em `proprio`, `administrado`, `arrendado` e `afiliado`. Nulo é "não informado": os hotéis existentes ficam nulos, sem padrão. O UPDATE vai para o `hk_app`, sob a policy de UPDATE do hotel, que já só deixava o Admin do grupo. O worker não tem UPDATE em `app.hotel`.
  - `app.local.edificacao`, texto opcional, com o check de 1 a 60 caracteres (o vazio é nulo, pelo domínio). O UPDATE vai só para o `hk_app`, sob a policy de escrita no hotel. O worker, que atualiza nome e andar da UH, não recebe UPDATE na coluna.
  - O pgTAP 026 testa o formato, os privilégios e a escrita por papel: só o Admin grava o modelo (gerente e implantador vigente, não); a edificação, quem escreve no hotel, na UH e na área comum; o worker não grava nenhuma das duas, e a atualização dele não mexe na edificação.
- **Domínio:**
  - `MODELOS_CONTRATUAIS`, `ModeloContratual`, `ehModeloContratual` e `validarModeloContratual` (`hotel_modelo_contratual_invalido`), em `hoteis.ts`. O teste `tests/modelo-contratual-banco.test.ts` lê o check das migrações e compara com a lista do domínio; `tests/contratos-dominio` compara com a da API.
  - `normalizarEdificacao` (`local_edificacao_invalida`, `{maximo: 60}`; espaços nas pontas saem, os repetidos viram um, vazio vira nulo) e `edificacoesDoHotel` (sugestões, uma por grafia sem diferença de caixa).
  - Painel de implantação: pendência nova `modelo_contratual_nao_informado`, a primeira da lista.
- **Quem grava:** o modelo, só o Admin do grupo, pela configuração do hotel (`PUT /hoteis/{id}/configuracao`, a mesma regra da configuração). A edificação, os papéis que gerem locais (`podeGerirLocais`), em qualquer local: na área comum, junto com nome e andar; na UH do sistema hoteleiro, pela rota nova `PUT /locais/{id}/edificacao`. O nome e o andar da UH continuam só leitura.
- **Conector:** a ingestão e a promoção não mexem em nenhuma das duas. A promoção que atualiza o nome da UH lê a edificação gravada, com a linha travada (`for update`), para manter a busca. A alteração pelo HubKeep também trava a linha.
- **Busca (ADR-030):** a coluna `busca` do local passa a ser o nome mais a edificação, calculada em `repositorios/busca.ts` (`colunasPesquisaveisDoLocal` e, para a promoção, `colunasPesquisaveisDaUhDoSistema`, que grava só nome e busca). O `busca-unica.test.ts` passou a barrar a escrita direta da edificação. Os locais existentes não têm edificação, então a busca gravada continua certa.
- **Compatibilidade:** na API, o modelo contratual e a edificação são opcionais na gravação: ausente, fica o gravado; `null` apaga. O PWA não mostra nem edita a edificação, e nenhuma operação offline mudou.
- **Telas (web):**
  - configuração do hotel: a seleção do modelo, com "Não informado";
  - administração de hotéis: a coluna do modelo e o filtro (os quatro e "não informado");
  - locais: a edificação na criação e na edição da área comum e na tabela das UHs, com a sugestão das edificações do hotel (`datalist`); a resposta da lista de locais traz `edificacoes`, sem o filtro da busca;
  - painel de implantação: a pendência; histórico: os campos novos e os nomes dos modelos.
- **Kit:** o Centro é próprio e o Praia, arrendado; o Serra fica sem modelo, para o painel mostrar a pendência. No Centro, as UHs 101 a 104 na Torre A, as 201 e 202 na Torre B, e a Piscina na "Área externa". O script só grava no hotel sem modelo e no local sem edificação.
- **Verificação:**
  - no local: lint, typecheck e os testes de todos os pacotes mexidos, verdes;
  - na CI: o pgTAP 026 e os testes de integração do `packages/db` (configuração, locais, ingestão e implantação, com a lista de pendências atualizada) e do kit;
  - as telas não foram vistas no navegador.
- **Aviso ao agente do Intelligence:** as colunas são `app.hotel.modelo_contratual` (nulo é "não informado") e `app.local.edificacao`. Os valores canônicos do modelo são `MODELOS_CONTRATUAIS` (tipo `ModeloContratual`, guarda `ehModeloContratual`), exportados do `@hubkeep/dominio`. No MVP, o modelo é só rótulo e filtro; o comportamento por modelo vem na 1c. O worker lê as duas colunas pelo SELECT que já tem em `app.hotel` e `app.local`.

### I3, fornecedor mínimo do grupo (08/10/2026)

Desenho aprovado pelo Cesar em 08/10/2026 (`docs/referencia/propostas-desenho-1b.md`, item 2). PR de zona protegida.
- **Banco (migração 0033):**
  - `app.fornecedor`, do grupo (sem `hotel_id`): `nome` (1 a 120), `cnpj` opcional (só os 14 dígitos, check `fornecedor_cnpj_formato`; único no grupo pelo índice parcial `fornecedor_cnpj_unico`, `(tenant_id, cnpj) where cnpj is not null`), `contato_nome`, `contato_telefone` e `contato_email` opcionais, `versao` (ADR-029), `desativado_em`, `criado_em` e `atualizado_em`; `unique (tenant_id, id)` para a FK composta da OS na I4. Sem DELETE; o UPDATE não alcança `id` nem `tenant_id`.
  - Leitura: o Admin do grupo e quem tem papel de escrita em algum hotel do grupo (`exists (select 1 from authz.hoteis_escrita())`, que já deixa de fora o proprietário). Gravação: `authz.eh_admin_grupo()` ou `authz.hoteis_com_papel(['gestor_csc', 'gerente_hotel'])` não vazio. Sem função nova.
  - O worker não lê: nenhum job usa o fornecedor no MVP (sem GRANT, o pgTAP confere a recusa).
  - Auditoria sem hotel: as policies de INSERT e SELECT de `app.auditoria` ganharam o caso da entidade `fornecedor` para o Gestor CSC e o Gerente (antes, sem hotel, só o Admin e o Implantador gravavam). O INSERT exige que o registro seja um fornecedor do tenant. O resto da auditoria sem hotel não muda.
  - pgTAP 027 com os seis casos (o do gerente e o da FK adaptados, porque a tabela não tem hotel), o implantador vencido, os três tipos de proprietário, Técnico e Implantador vigente que leem e não gravam, CNPJ único e formato, sem DELETE, worker e a auditoria do fornecedor. Meta-teste 28 com a tabela nova.
- **Domínio (`fornecedores.ts`):** `podeGerirFornecedores` (`fornecedores_sem_permissao`), `validarCnpj` (aceita com ou sem pontuação, devolve os dígitos, confere os verificadores; `fornecedor_cnpj_invalido`), `formatarCnpj`, `normalizarNomeDeFornecedor` (`fornecedor_nome_invalido`), `normalizarContatoDeFornecedor` (`fornecedor_contato_nome_invalido`, `fornecedor_telefone_invalido`, `fornecedor_email_invalido`; e-mail em minúsculas), `validarDadosDeFornecedor` e `cnpjDeFornecedorRepetido` (409 `fornecedor_cnpj_repetido`, da violação do índice).
- **API:** `GET` e `POST /api/v1/fornecedores`, `PUT /api/v1/fornecedores/{id}` (cadastro inteiro, com a versão), `POST .../desativacao` e `.../reativacao` (com a versão). O histórico (`GET /api/v1/auditoria`) aceita a entidade `fornecedor`.
- **Tela:** "Fornecedores" no menu de cadastros (`admin/fornecedores`), com o cadastro, a edição de cada um, desativar e reativar e o histórico. Catálogos nos quatro idiomas, inclusive as ações e os campos novos do histórico.
- **Kit:** três fornecedores fictícios, um do Admin, um do Gestor CSC e um da Gerente do Centro (sem CNPJ).
- **A OS ainda não usa o fornecedor:** isso é a I4 (`executado_por`).
- **Verificação:**
  - no local: lint, typecheck e os testes de todos os pacotes, verdes;
  - na CI: o pgTAP 027 e o meta-teste, o teste de integração `packages/db/test/fornecedores.test.ts` (inclusive a RLS sem a checagem do domínio e o histórico do Gerente) e o kit;
  - a tela não foi vista no navegador.
- **Aviso ao agente do Intelligence:** a tabela é `app.fornecedor`, do tenant, com `id`, `tenant_id`, `nome`, `cnpj` (14 dígitos ou nulo), `contato_nome`, `contato_telefone`, `contato_email`, `versao`, `desativado_em`, `criado_em` e `atualizado_em`. O `hk_worker` não tem SELECT nela; se o job precisar (ex.: MTTR por fornecedor, depois da I4), o pedido vem por este diário e entra numa migração do núcleo. A ligação com a OS chega na I4.

### Respostas do Cesar (09/10/2026, depois da I3)
- **Merges e `db push` do Cesar:** #141 (I3). A 0033 está no dev: `migration list` confere, e o pgTAP contra o dev passou em tudo, menos no teste 29 do `002` (corrigido abaixo).
- **Fornecedor (I3):**
  - mudança nas policies de `app.auditoria`: adendo ao ADR-021, já no `docs/03` (texto aguarda a aprovação);
  - CNPJ alfanumérico (formato da Receita desde julho de 2026): aceitar, com o dígito verificador do formato novo. Muda o check `fornecedor_cnpj_formato` (migração nova) e o `validarCnpj`. Entra num PR de zona protegida próprio, logo depois da I4, para não atrasar a I4;
  - CNPJ de fornecedor desativado continua reservado no grupo: reativação em vez de novo cadastro. É o comportamento atual (409 `fornecedor_cnpj_repetido`);
  - Gestor CSC de bandeira sem hotel: código de erro próprio, com mensagem nos quatro idiomas. Hoje recebe 42501 sem código. Vai no mesmo PR do CNPJ alfanumérico;
  - CNPJs do kit: continuam inventados, com dígito válido, nunca CNPJ real. Os dois do kit (`98765432000198` e `13579246000101`) já têm dígito válido; nada a mudar.
- **Hotel e local (I2) e desempenho (P1):**
  - edificação no nome do local no PWA, quando preenchida ("UH 101 · Torre A"): sim. PR fora da zona protegida, em paralelo com a fila;
  - busca por nome e edificação: só este registro, sem adendo ao ADR-030. A busca de locais acha pelo trecho do nome ou da edificação;
  - limite de 60 caracteres da edificação: mantido;
  - ler o `hk_tenant` no layout do servidor: só se a medição mostrar ganho. O cookie é só preferência; a participação no tenant continua conferida (o banco só aceita tenant de que o usuário é membro);
  - página que chama os casos de uso direto no servidor (P1c): adendo curto ao ADR-039, já no `docs/03` (texto aguarda a aprovação).
- **Medidas:** os comandos da fumaça pelo pooler (o nome certo é `pnpm db:fumaca --ambiente dev`; `db:fumaca-dev` não existe) e da leitura do `Server-Timing` de `/api/v1/hoteis/{id}/ativos` foram passados ao Cesar; ele roda.
- **Exceção GHSA-vfj7-8cjw-p6xm:** revisão em 08/11/2026 ou antes do piloto, o que vier primeiro. A data está no comentário da exceção, no `pnpm-workspace.yaml`.
- **Nomes:** a etapa de checklist e preventiva passou de P1 a P3 para **PV1 a PV3**, para não confundir com a P1 de desempenho. Mudou no `docs/12` e nos documentos do piloto. O diário da fase 1a fica como está: lá, P1 é desempenho.
- **Fila (zona protegida, um PR por vez):** correção do teste 29 → I4 → CNPJ alfanumérico e código do Gestor CSC sem hotel → I6 → I7 → I8. O Cesar é avisado a cada PR pronto para merge e `db push`.
- **Aviso ao agente do Intelligence:** o checklist tipado agora é a **PV1** (antes P1), e a preventiva, PV2 e PV3. O `docs/diario-intelligence.md` cita "checklist tipado (P1)"; ajustar no próximo PR de vocês. A I4 vem a seguir.

### Teste 29 do `002_isolamento_escopo` no dev (09/10/2026)
- **Problema:** o teste compara todo o resultado de `licenca.uso()`. No dev compartilhado existe o tenant "Grupo Demonstração" do kit, então o teste falhava lá e passava na CI, que começa com o banco vazio.
- **Correção:** o teste filtra pelos dois tenants que ele mesmo cria. A asserção continua a mesma: o `hk_backoffice` vê só os agregados.
- **Verificação:** pgTAP contra o dev, com rollback, passou: 812 testes ok em 27 arquivos.

### I4, chamado e OS: origem, impacto no hóspede, quem executa, custo e UH indisponível (09/10/2026)

Desenho aprovado pelo Cesar em 08/10/2026 (`docs/12`, I4; `docs/referencia/propostas-desenho-1b.md`, itens 2 e 3). A I4 foi dividida em dois PRs: este, de zona protegida, com a migração, o domínio, a API e os testes; e a I4b, fora da zona protegida, com as telas do web (triagem, aceite e detalhe) e do PWA (as perguntas na abertura e na conclusão).
- **Banco (migração 0034):**
  - `app.chamado.origem` (`not null default 'interno'`, sem UPDATE; check `chamado_origem_lista`) e `app.chamado.impacto_hospede` (boolean anulável; nulo é "não informado"; GRANT de UPDATE);
  - `app.os.executado_por` (`not null default 'equipe_interna'`; check `os_executado_por_lista` com `equipe_interna` e `fornecedor`), `app.os.fornecedor_id` (FK composta `(tenant_id, fornecedor_id)` para `app.fornecedor`) e `app.os.custo_informado` (`numeric(12,2)`, não negativo). O check `os_fornecedor_quando_externo` amarra o fornecedor a quem executa. GRANT de UPDATE nas três; quem grava segue o `app_update` da OS que já existia;
  - `app.uh_indisponivel`, no modelo da parada do ativo: `local_id`, `chamado_id`, `inicio`, `fim`, `aberta_por` e `encerrada_por`. A FK `(hotel_id, chamado_id, local_id)` prende o período ao local do chamado; um período aberto por chamado (índice único parcial); a mesma UH aceita períodos de chamados diferentes. Policies como as da parada; o worker lê no tenant do job;
  - os checks das listas seguem o do modelo contratual (0032): o teste `tests/valores-canonicos-banco.test.ts` lê as migrações e falha se divergirem do domínio.
- **Domínio:**
  - `chamados.ts`: `ORIGENS_DO_CHAMADO` e `ORIGEM_PADRAO_DO_CHAMADO`;
  - `executor-e-custo.ts`: `EXECUTORES_DA_OS`, `decidirQuemExecuta` (`os_fornecedor_obrigatorio`, `os_fornecedor_indevido`, `os_fornecedor_desativado`, `fornecedor_nao_encontrado`), `ESTADOS_COM_EXECUTOR_AJUSTAVEL` (atribuída, em execução e pausada) e `normalizarCustoInformado` (`os_custo_invalido`: não negativo, dois decimais, até o teto da coluna);
  - `triagem.ts`: `podeInformarImpacto` (triagem, chamado até o aceite) e `podeAjustarQuemExecuta` (triagem, OS até a conclusão);
  - `uh-indisponivel.ts`: só UH (`uh_indisponivel_fora_de_uh`), início e fim (`uh_indisponivel_periodo_invalido`, com a folga do relógio), um aberto por chamado (`uh_indisponivel_ja_aberta`, `uh_indisponivel_nao_aberta`), `periodoALiberarNaConclusao` e `uhDiasPerdidos` (veio do Intelligence; o período de chamado cancelado não conta);
  - `corretiva.ts`: `podeGerirUhIndisponivel` (Admin, Gestor CSC e Gerente; `uh_indisponivel_fora_do_papel`).
- **Aplicação:**
  - abertura com `impactoHospede` e `uhIndisponivelDesde`; a origem é gravada pelo servidor;
  - triagem: `gerarOs` com quem executa (sem escolha, a equipe interna), `definirQuemExecuta`, `informarImpacto`, aceite com `custoInformado`, e o cancelamento do chamado encerra o período aberto da UH;
  - `uh-indisponivel.ts`: os períodos do chamado (o proprietário recebe só a UH, o estado e as datas), marcar depois e liberar, pela gestão;
  - execução: na conclusão, `uhLiberada` encerra o período na mesma operação offline (resposta `uhLiberada`); a fila do dia traz `uhIndisponivelDesde`.
- **API:** `POST /api/v1/chamados/{id}/impacto-hospede`, `POST /api/v1/os/{id}/executor`, `GET` e `POST /api/v1/chamados/{id}/uh-indisponivel` e `POST /api/v1/uh-indisponivel/{id}/liberacao`. A geração da OS aceita `executadoPor` e `fornecedorId`; o aceite, `custoInformado`; a abertura, `impactoHospede` e `uhIndisponivelDesde`; a operação `os.concluir`, `uhLiberada`. O chamado e a OS da API trazem os campos novos, e a linha do tempo, a UH (entidade `uh_indisponivel`, ações `marcar` e `liberar`).
- **Catálogos:** os dez códigos de erro novos e as ações novas da linha do tempo, nos quatro idiomas.
- **Verificação:**
  - no local: lint, typecheck e os testes de todos os pacotes, verdes; o domínio ganhou 62 testes;
  - na CI: o pgTAP 028 (50 asserções) e o meta-teste 28, e o teste de integração `packages/db/test/chamado-os-uh.test.ts` (inclusive a RLS sem a regra do domínio e a operação offline antiga);
  - sem tela nova neste PR: a I4b traz as telas.
- **Aviso ao agente do Intelligence:** os nomes reais, para trocar no `historico.ts` e no `uh.ts` num PR fora de zona protegida:
  - `app.chamado.origem` (`interno`) e `app.chamado.impacto_hospede` (boolean ou nulo);
  - `app.os.executado_por` (`equipe_interna` ou `fornecedor`, os mesmos valores do `ExecutadoPor` de vocês), `app.os.fornecedor_id` e `app.os.custo_informado` (`numeric(12,2)`, chega como texto pelo driver);
  - `app.uh_indisponivel` (`hotel_id`, `local_id`, `chamado_id`, `inicio`, `fim`); o período de chamado cancelado é encerrado no cancelamento, e quem calcula os UH-dias deixa de fora (`app.chamado.estado = 'cancelado'`);
  - `uhDiasPerdidos` agora mora no `@hubkeep/dominio`, com o campo opcional `chamadoCancelado` no período; o motor pode importar de lá e apagar a cópia do módulo;
  - o `hk_worker` lê `app.uh_indisponivel` e as colunas novas de `app.chamado` e `app.os`; `app.fornecedor` continua sem GRANT para ele.

### Depois da I4 (09/10/2026)
- **Merge e `db push` do Cesar:** #151 (I4). A 0034 está no dev: `migration list` confere, e o pgTAP contra o dev, com rollback, passou: 862 testes ok em 28 arquivos, sem nenhuma falha.

### I4b, telas da I4 no web e no PWA (09/10/2026)

PR fora da zona protegida, sobre a API da I4 (#151).
- **Web, detalhe do chamado:**
  - o chamado mostra se afeta hóspede (sim, não ou não informado);
  - cada OS mostra quem executa (a equipe interna ou o fornecedor, pelo nome) e o custo informado, em reais;
  - o aceite ganhou o campo do custo, opcional; vazio vai como não informado;
  - painel novo "UH indisponível", com os períodos do chamado (aberto ou liberado, com as horas), "Liberar UH" no período aberto e "Marcar UH indisponível" (desde quando, com agora como padrão) com o chamado em curso e sem período aberto. Some em chamado de área comum sem períodos;
  - triagem: "Quem executa" na geração da OS (equipe interna ou fornecedor ativo do grupo) e na correção até a conclusão, e "Afeta hóspede?" corrigido até o aceite.
- **API:** os nomes do detalhe (`GET /api/v1/chamados/{id}`) ganharam o tipo do local (`localTipo`) e os nomes dos fornecedores das OS (`fornecedores`). O join respeita a RLS: o proprietário fica sem o nome do fornecedor.
- **O web não tem tela de abertura de chamado** (a abertura é pelo PWA). Lá, a UH indisponível e o impacto entram pela gestão no detalhe do chamado.
- **PWA:**
  - abertura: "Afeta hóspede?" (sim, não ou não sei; o padrão é não sei) e, num chamado de UH, "A UH ficou indisponível", desde a hora da abertura no aparelho. A referência de locais guarda o tipo; a guardada antes da I4b não tem e não mostra a pergunta da UH;
  - OS: a nota "UH indisponível desde..." e, na conclusão, a pergunta "A UH foi liberada?". Com a parada do chamado aberta também, a pergunta da parada vem antes, e as duas respostas vão na mesma operação `os.concluir`;
  - a projeção tira a UH indisponível da OS quando a conclusão na fila diz que foi liberada.
- **Catálogos:** os textos novos nos quatro idiomas.
- **Verificação:**
  - no local: lint, typecheck e os testes de todos os pacotes, verdes (testes novos das telas do web e do PWA, inclusive o pseudo-idioma);
  - na CI: os testes de integração do `packages/db` com o tipo do local e o fornecedor nos nomes do detalhe;
  - as telas não foram vistas no navegador.
- **Fica para depois:** a edificação no nome do local no PWA (decisão 6 do Cesar), num PR próprio, fora da zona protegida.

### Exceção do Cesar: o agente do Intelligence faz o CNPJ alfanumérico, a I6 e a I7 (10/10/2026)

Decisão do Cesar de 10/10/2026, no chat da sessão do agente do Intelligence ("Cesar aqui"). O agente do Intelligence faz, no lugar do agente do núcleo, o CNPJ alfanumérico, a I6 (códigos de manutenção) e a I7 (módulos contratados), em branches `1b-*`. Fora disso, o escopo dele continua o do Intelligence, e a exceção acaba quando a I7 terminar.
- **Ordem:** CNPJ, depois a I6, depois a I7. Um PR de zona protegida por vez; em cada um, o agente para até o Cesar dizer "mergeado e aplicado". O merge com bypass e o `db push` são do Cesar.
- **Divisão de cada I:** no PR de zona protegida, a migração, o pgTAP, os tipos e as listas canônicas do domínio. Regras, casos de uso, API e telas vão num PR separado, fora de zona protegida, depois do merge da migração (como na I4 e na I4b).
- **Decisões do Cesar para a I6:** no PWA, o técnico preenche falha, causa e solução como sugestão, e a conclusão nunca é recusada por falta delas. Com a política `os.codigos_obrigatorios` ligada, o aceite no web exige os três códigos, com mensagem de recusa.
- **Decisão do Cesar para a I7:** um adendo curto ao ADR-026, sobre registrar as políticas de um módulo só para o tenant que tem o módulo, vai no mesmo PR da migração da I7, para a aprovação dele.
- **Fica com o agente do núcleo:** o código próprio para o Gestor CSC sem hotel (`fornecedores_sem_hotel`). Ele estava no mesmo commit do CNPJ (`020a5a0`, branch `1b-cnpj-alfanumerico`), que fica intacto no remoto como fonte; o PR do CNPJ leva só a parte do CNPJ.
- **Levantamento antes de começar:** nenhum rascunho da I6 nem da I7 em branch ou worktree (o `wt/instrumentacao` está limpo, na I1); nenhum PR de zona protegida aberto.

### CNPJ alfanumérico (09/10/2026, PR em 10/10/2026)

Decisão 2 do Cesar de 09/10/2026. PR de zona protegida, depois da I4 e da I4b (#152), aberto pelo agente do Intelligence na exceção acima, a partir do commit `020a5a0` do agente do núcleo, sem a parte do Gestor CSC sem hotel.
- **Migração 0035:** o check `fornecedor_cnpj_formato` passa a aceitar 12 caracteres em letras maiúsculas ou dígitos e 2 dígitos verificadores. O CNPJ numérico continua valendo, e o índice de CNPJ único no grupo não muda.
  - Domínio: o cálculo dos verificadores usa o código de cada caractere menos 48 (o dígito vale ele mesmo, e A vale 17), com os mesmos pesos. Confere o exemplo da Receita (12.ABC.345/01DE-35) e os CNPJs numéricos de antes;
  - `validarCnpj` aceita pontuação e minúsculas e guarda os 14 caracteres em maiúsculas, sem pontuação; `formatarCnpj` usa a mesma máscara;
  - contrato da API (`FornecedorApi.cnpj`) e pgTAP 027 (41 asserções: o alfanumérico entra, a minúscula não) atualizados. A mensagem de CNPJ inválido deixou de falar em "14 dígitos".
- **Verificação:**
  - no local: lint, typecheck e os testes de todos os pacotes;
  - na CI: o pgTAP 027 e o teste de integração `packages/db/test/fornecedores.test.ts` (o alfanumérico gravado em maiúsculas).
- **Depois do merge:** `db push` da 0035.
- **Ponto de retomada:** o PR do CNPJ aguarda o merge e o `db push` do Cesar. Depois de "mergeado e aplicado", o agente do Intelligence faz a I6 (zona protegida) e para; depois a I7. O Gestor CSC sem hotel continua com o agente do núcleo, a partir do `020a5a0`.

### I6 — códigos de falha, causa e solução: a migração (10/10/2026)

PR de zona protegida, aberto pelo agente do Intelligence na exceção do Cesar (acima), depois do merge do CNPJ alfanumérico (#171) e do `db push` da 0035 ("mergeado e aplicado", Cesar, 10/10/2026). Nenhum rascunho anterior da I6 existia.
- **Migração 0036** (`20261010164213_codigo_manutencao.sql`):
  - `app.codigo_manutencao`, do grupo, no modelo da situação e da prioridade (ADR-027): `tipo` (`falha`, `causa` ou `solucao`, com check), `categoria_id` anulável (FK composta com `app.categoria_ativo`; nulo vale para todas), `chave_padrao` (código padrão do catálogo, uma vez por tipo no tenant), `nomes` por idioma e `ativa`. Todo código tem nome pela chave padrão ou pelos `nomes` (check);
  - lê o Admin do grupo e quem lê algum hotel, inclusive o proprietário; grava só o Admin do grupo; depois de criado, mudam só `nomes`, `ativa` e `atualizado_em`; o worker lê no tenant do job; sem DELETE;
  - `app.os` ganha `codigo_falha_id`, `codigo_causa_id` e `codigo_solucao_id`, anuláveis, com FK composta para o código do próprio tenant e GRANT de UPDATE, que segue o `app_update` da OS (a gestão do hotel, o Técnico responsável e quem abriu o chamado). Índice parcial no código de falha, para a reincidência do Intelligence.
- **pgTAP 029** (46 asserções): os seis casos, a integridade da tabela, quem grava os códigos da OS (o gerente do hotel e o Técnico responsável, sim; outro técnico, o de outro hotel e o proprietário, não) e o worker.
- **Meta-teste 28:** a tabela nova na lista fechada.
- **Tipos** (`packages/db/src/tipos-banco.ts`) e a lista `TIPOS_DE_CODIGO_DE_MANUTENCAO` no domínio, com a paridade em `tests/valores-canonicos-banco.test.ts`.
- **Fica para o PR seguinte, fora da zona protegida, depois do merge** (decisão 4 do Cesar de 10/10/2026): os códigos padrão por categoria no catálogo, as regras do domínio (o tipo certo em cada coluna, o código ativo e da categoria do ativo), a política `os.codigos_obrigatorios` (desligada por padrão; ligada, o aceite no web exige os três, com mensagem de recusa; a conclusão no PWA nunca é recusada por falta deles), os casos de uso, a API, o cadastro do Admin, o aceite no web, a sugestão no PWA e o kit de teste.
- **Depois do merge:** `db push` da 0036.
- **Ponto de retomada:** o PR da I6 aguarda o merge e o `db push` do Cesar. Depois de "mergeado e aplicado", o agente do Intelligence abre o PR das regras, dos casos de uso e das telas da I6, fora da zona protegida, e a migração da I7 com o adendo ao ADR-026, que é o próximo PR de zona protegida.

### I6 — regras, casos de uso, API e telas (10/10/2026)

O #173 foi mergeado, e o `db push` da 0035 e da 0036 chegou ao dev na segunda tentativa ("Cesar aqui", 10/10/2026). A primeira rodou no checkout principal ainda no `b9aaa77`, sem os arquivos das duas migrações. O pgTAP contra o dev passou inteiro: 910 testes em 29 arquivos. PR fora da zona protegida, aberto pelo agente do Intelligence na exceção do Cesar.
- **Domínio** (`codigos-manutencao.ts`):
  - os 37 códigos padrão: 5 falhas gerais, 14 falhas das categorias padrão (cada categoria tem ao menos uma), 9 causas e 9 soluções gerais. O nome de cada um fica no catálogo (`codigo_manutencao.padrao.<chave>`), e `tests/codigos-padrao-catalogo.test.ts` confere os dois lados;
  - só o Admin do grupo gere (`codigos_so_admin`); o nome do código do grupo é obrigatório (`codigo_nome_invalido`);
  - o código serve para a OS se está ativo, é do tipo da coluna e é da categoria do ativo do chamado ou de todas. **Sem ativo no chamado, ou com o ativo sem categoria, vale qualquer código ativo do tipo**: não há com o que comparar (decisão deste agente, para o Cesar conferir no PR);
  - **no aceite**, o código que não serve é recusado, com o tipo da coluna: `codigo_nao_encontrado`, `codigo_de_outro_tipo`, `codigo_inativo` ou `codigo_de_outra_categoria`;
  - **na conclusão**, o código que não serve é descartado, e a conclusão segue. A auditoria da OS guarda os descartados, com o motivo, e a resposta da operação diz quantos foram (`codigosDescartados`). Assim um código desativado enquanto o aparelho estava sem rede não trava a fila;
  - a política `os.codigos_obrigatorios` (`{ ligado }`, desligada por padrão) entra no registro do núcleo e no contrato. Ligada no hotel, o aceite sem os três é recusado com `codigos_obrigatorios_no_aceite` e o número que falta. Nunca é cobrada na conclusão.
- **Aceite:** com `codigos`, os três substituem os da OS; sem eles, ficam os que o técnico sugeriu, e é sobre esses que a política cobra.
- **API:** `GET` e `POST /api/v1/codigos-de-manutencao`, `PUT /api/v1/codigos-de-manutencao/{id}` (nomes), desativação, reativação e `POST .../padrao`, que é idempotente e instala a falha de uma categoria padrão só se o tenant tiver a categoria. `GET /api/v1/os/{id}/codigos` devolve os ids que servem para a OS, por tipo, para a lista do aceite. A `OsApi` ganha `codigos`, e o `os.concluir` da fila ganha `codigos`, opcional. O OpenAPI tem as seis rotas.
- **Telas:**
  - cadastro do Admin em "Códigos de manutenção" (`/admin/codigos`), com um painel por tipo;
  - o bloco da política na configuração, por grupo ou por hotel;
  - o detalhe da OS mostra os códigos;
  - o aceite traz os três campos com a sugestão do técnico já escolhida;
  - no PWA, o painel "Falha, causa e solução (opcional)" na OS em execução ou pausada, com os códigos da referência local (os da categoria do ativo primeiro). A referência guardada antes da I6 segue sem códigos, e a tela sem o painel;
  - os 77 textos novos nos quatro catálogos.
- **Kit:** o script instala os códigos padrão. Na conclusão do aquecedor, o técnico sugere falha e causa, sem solução. O forno é aceito com os três. O `docs/10` ganha os passos do Admin (cadastro e política), do Gerente (aceite com a política ligada no Centro) e do Técnico (sugestão no PWA).
- **Testes:**
  - domínio: padrões, quem gere, o filtro, a recusa no aceite, a sugestão que nunca recusa e a política;
  - integração (`packages/db/test/codigos-manutencao.test.ts`, só na CI): cadastro, a RLS sem a checagem, a lista da OS, a conclusão com descarte e o aceite com a política desligada e ligada;
  - telas do web e do PWA nos quatro idiomas e no pseudo-idioma;
  - a paridade dos tipos e da política entre contrato e domínio.
- **Ponto de retomada:** o PR fica para o Cesar revisar e mergear. É fora da zona protegida, então não segura a fila. O próximo PR de zona protegida é a migração da I7 (`licenca.modulo`), com o adendo ao ADR-026 em "aguarda aprovação", e para no link até "mergeado e aplicado".

### I7 — módulos contratados: a migração e o adendo ao ADR-026 (10/10/2026)

PR de zona protegida, aberto pelo agente do Intelligence na exceção do Cesar, depois do merge da migração da I6 (#173) e do `db push` da 0036 ("Cesar aqui", 10/10/2026). O PR das telas da I6 (#174), fora da zona protegida, foi mergeado antes deste; o diário dele vem logo acima.
- **Migração 0037** (`20261010180824_licenca_modulo.sql`), no modelo de `licenca.contrato`:
  - `licenca.modulo` guarda o tenant, o módulo (`inteligencia`, com check), a vigência (`inicio`, `fim` anulável), `atualizado_em` e `atualizado_por`, com uma linha por módulo no tenant;
  - lê o `hk_app`, quando quem pede é Admin do grupo ou lê algum hotel (inclusive o proprietário), e o `hk_worker`, no tenant do job;
  - grava só o `hk_backoffice` (INSERT e UPDATE da vigência), sem filtro de tenant, como no contrato;
  - ninguém tem DELETE.
- **pgTAP 030** (30 asserções): os seis casos, a integridade, o backoffice (grava em qualquer tenant, não muda o módulo nem o tenant), o worker e a ingestão.
- **Meta-teste:** as três policies do backoffice nas exceções do 19 e a tabela na lista fechada do 28.
- **Tipos** (`LicencaModulo`) e a lista `MODULOS_CONTRATAVEIS` no domínio, com a paridade em `tests/valores-canonicos-banco.test.ts`.
- **Adendo ao ADR-026**, em "aguarda aprovação": dois registros montados na partida, escolhidos a cada request pela vigência do módulo do tenant, e falha fechada.
- **Fica para o PR seguinte, fora da zona protegida, depois do merge:**
  - o script de operação que grava o módulo como `hk_backoffice`;
  - a regra da vigência no domínio;
  - a escolha do registro por request na montagem (`montarInteligencia` passa a registrar a extensão, e a composição só a usa para o tenant com o módulo);
  - o teste de integração: o tenant sem o módulo não vê nem grava as chaves `inteligencia.*`.
- **Depois do merge:** `db push` da 0037.
- **Ponto de retomada:** o PR da I7 aguarda o merge e o `db push` do Cesar, e o adendo aguarda a aprovação dele. Depois de "mergeado e aplicado", este agente abre o PR da I7 fora da zona protegida. Com isso, a exceção termina: o agente registra o fim dela no diário e volta à fila do Intelligence.
