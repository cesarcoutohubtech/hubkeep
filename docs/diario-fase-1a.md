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

### Ponto de retomada (29/09/2026, etapa B, PR da B4 aberto e B5 pronta no local)
- **`main`:** `44a43a8` (#51, B3c). **Dev:** 16 migrações, até a 0016; 405 ok em 14 arquivos. Próxima conferência só depois do `db push` da 0017.
- **PR aberto:** B4, [#52](https://github.com/cesarcoutohubtech/hubkeep/pull/52), branch `1a-b4` (worktree `wt/b4-anexos`, branch local `1a-b4-anexos`), zona protegida. Espera do Cesar: merge e `db push` da 0017.
- **B5 pronta no local:** branch `1a-b5-qr` (worktree `wt/b5-qr`), feita sobre o `1a-b4`, enviada, sem PR. Depois do merge do #52: `git fetch && git rebase origin/main` na worktree (os commits da B4 saem sozinhos), push com outro nome se precisar de force, PR de zona protegida e vínculo com `ccd_pr`. Conferir na CI o pgTAP 013 (39), o `packages/db/test/ativos.test.ts` e o `kysely-codegen --verify` (o `tipos-banco.ts` foi editado à mão).
- **Decisões pendentes do Cesar:** nenhuma.
- **Worktrees removíveis em `C:\Cesar\HubKeep\Dev\wt\`:** `b1-locais`, `b2-categorias`, `b3-ativos`, `b3b-ativos-pwa`, `b3c-mover-ativo`, `adr-025-referencia`, `politica-sem-proprietario`, `decisoes-etapa-b`. Branches remotos velhos: `1a-b3c-mover-ativo` e `1a-b4-anexos` (base antiga da B4).
- **Próxima tarefa:** **B6, busca sem acento** (`pg_trgm`, ADR-030), no local, sobre o `1a-b5-qr`: `git worktree add C:/Cesar/HubKeep/Dev/wt/b6-busca -b 1a-b6-busca origin/1a-b5-qr`; ler a linha B6 do `docs/05`, o ADR-030 no `docs/03`, a função sem acento de `packages/i18n` e os meta-testes 11 (funções) do `001_meta_seguranca.test.sql`. Depois: resumo da etapa B (push e sugestão de `/compact`), etapa C e o kit de teste (parar quando pronto).
