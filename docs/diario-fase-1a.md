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
