# Diário da fase 1b

Diário do agente do Cesar: a fase 1b inteira e a administração do projeto. A administração inclui:
- o `CLAUDE.md`, os planos, o Registro de decisões e as perguntas ao cliente;
- o documento consolidado, a preparação do piloto e a F0-12;
- a segurança pré-piloto.

A partir de 12/10/2026, a 1b se registra aqui, e não mais no `docs/diario-fase-1a.md`. O histórico da 1b até a PV1 (#203) ficou no diário da 1a, da seção "Fila nova do Cesar (12/10/2026)" em diante. Os outros dois agentes têm diário próprio: o da 1c usa o `docs/diario-fase-1c.md`, e o do Kaio o `docs/diario-intelligence.md`.

## Passagem para a nuvem (12/10/2026)

Pedido do Cesar no chat ("Cesar aqui", 12/10/2026): o agente sai do notebook e passa a rodar na nuvem, com três agentes, todos na nuvem. A PV2 parou antes de começar; não havia nada dela no local.

O notebook ficou assim, antes de o Cesar apagar a pasta:
- **`1b-pv1b-checklist-telas` (1cba18f):** enviada ao GitHub, sem PR. É o resto da PV1: domínio, API, telas e kit. Detalhe no ponto de retomada abaixo.
- **`1b-pv1-checklist`:** entrou na `main` pelo #203.
- **`1a-d1-teste-proprietario` (28b1785):** está no GitHub e fora da `main`; o Cesar decide se apaga. É um ajuste do teste da C7, para esperar a auditoria do proprietário.
- **`1a-b4-anexos`, `1a-b5-qr` e `1a-b6-busca`:** só existem no local, mas todo o conteúdo já está na `main`.
- **Worktrees:** `wt/1b-pv1`, `wt/1b-pv1b` e o `wt/int-rascunhos` do Kaio ficaram, como o Cesar pediu. Ele apaga a pasta depois de conferir o GitHub.
- **Arquivos soltos na raiz do checkout principal, nunca versionados:** os `retomada-intelligence-*.md` e o `docs/referencia/HubKeep — Documento do projeto.md`. São cópias locais; o documento consolidado versionado é o `docs/referencia/documento-projeto.md`.

## Regras e contexto da memória local

Regras e contexto que estavam só na memória do agente no notebook. As que já estão no `CLAUDE.md` aparecem marcadas assim. As que só valiam para o notebook ficam registradas como histórico, porque na nuvem não há worktree nem pasta local.

### Aprovações e ADR

- **Merge não aprova ADR** (Cesar, 26/09/2026; está no `CLAUDE.md`).
  - Quando o PR de um ADR em "Proposta" entra na `main`, o agente pergunta ao Cesar antes de mudar o status no `docs/03`.
  - Só um "aprovo" escrito muda o status. O agente registra a data e o PR da aprovação.
  - Aprovação condicionada ("desde que X") exige confirmar X antes de marcar.
- **Nunca escrever aprovação em nome de outra pessoa** (Cesar e Kaio, 10/10/2026, #170).
  - O agente nunca comenta aprovação nem fecha issue ou PR de aprovação. Só registra e cita quem aprovou, com o link do que essa pessoa escreveu.
  - O `gh` e o `git` usam a conta do Cesar, então tudo o que o agente posta aparece como dele.
  - Toda mensagem diz quem fala: "Cesar aqui" ou "Kaio aqui". Sem isso, o agente pergunta antes de agir. Isso vale também para texto colado e para print de outro chat, que não contam como confirmação.
- **ADR-033: detalhe dentro de ADR aprovado do Intelligence é só do Kaio** (Cesar, 10/10/2026, #167).
  - São detalhes: limiares, mínimos, desempates, padrões de política dentro de regra aprovada, textos, rótulos, e ajustes no seed e no mock que não mudam regra.
  - Continua com Cesar e Kaio: componente, estado ou fonte de dado novos; quem vê ou quem decide; e os princípios (explicabilidade, correlação não é causa, IA só para texto, módulo nunca importado pelo núcleo).
  - Na dúvida entre detalhe e mudança, tratar como mudança.

### CI, PRs e banco

- **Conferir os checks** (Cesar, 29/09/2026).
  - Ao retomar e antes de dar um PR como pronto, o agente roda `gh pr checks <n>` uma vez e diz o que falhou e se a falha é esperada. A "zona protegida" falha sempre, por desenho (ADR-023).
  - Uma consulta pontual não é polling. O agente nunca faz polling da CI e nunca liga auto-merge.
- **A `main` vermelha se corrige antes de qualquer outro merge** (Cesar, 30/09/2026).
  - A correção abre primeiro, e o Cesar é avisado para não mergear outra coisa antes.
  - Enquanto os checks não ficam verdes, o aviso de PR aberto diz "não mergear ainda".
  - Os testes de integração do `packages/db` só rodam na CI. Foi por eles que o #72 e o #73 entraram vermelhos.
- **Conferir o PR antes do push** (10/10/2026).
  - PR mergeado não recebe commit. Antes do push, o agente usa uma condição que falha: `test "$(gh pr view N --json state -q .state)" = OPEN && git push ...`.
  - Depois do push, confere que o `headRefOid` é o commit novo, antes de dizer que ele está no PR ou que os checks passaram.
  - Se o PR já foi mergeado, os commits vão para uma branch nova, com PR novo.
- **Conferir o dev depois do `db push`** (10/10/2026). Depois de "mergeado e aplicado", a migração nova precisa aparecer no `supabase migration list` e o pgTAP dela passar contra o dev, antes de seguir.
  - Em 10/10, o `db push` da 0036 rodou num checkout atrasado e não aplicou nada.
  - Se faltar a migração, o agente avisa o Cesar com a causa provável e os comandos (`git pull --ff-only origin main` e `supabase db push`). Nunca roda o `db push` por conta própria.
  - Na nuvem, isso depende do workflow "conferir dev" (tarefa 6). Até ele existir, quem confere a saída do `db push` é o Cesar.
- **Zona protegida: vale a regex do `.github/workflows/zona-protegida.yml`, não a memória.**
  - Além de migrações, testes do banco, `CLAUDE.md`, `docs/03`, workflows e `.claude`, a regex pega:
    - `eslint.config.mjs` e `supabase/config.toml`;
    - `.gitleaks.toml` e `dependabot.yml`;
    - `packages/auth-admin/`;
    - três testes da raiz: secret-key, env-example e actions-fixadas.
  - Em 10/10, o #188 mexeu no `eslint.config.mjs` achando que estava fora.
- **Um PR de zona protegida aberto por vez, nunca PR empilhado, e base sempre a `main`** (Cesar, 28/09 e 12/10/2026; está no `CLAUDE.md`).
  - O #199, empilhado, foi mergeado na branch-base depois do merge dela e ficou fora da `main`.
  - A tarefa seguinte pode andar na branch; o PR só abre depois do merge do anterior.
- **`db push`, `config push` e o merge de zona protegida são só do Cesar** (está no `CLAUDE.md`).
- **DDL nunca no dev compartilhado.** DML com desfazimento no fim, como fazem os testes pgTAP, é permitido.

### Comandos

- **`pnpm`, `npm` e `npx` só na raiz de um checkout do HubKeep** (incidente 3, 26/09/2026; está no `CLAUDE.md`). A forma é `test -f pnpm-workspace.yaml && pnpm ...`.
  - No incidente, um `cd` falhou numa cadeia com `;`, e o pnpm subiu até `C:\Users\cesar\package.json` e moveu pacotes do usuário.
- **Passos dependentes só com `&&`, nunca com `;`** (Kaio, 06/10/2026). Vale para qualquer comando, inclusive leituras que dependem uma da outra.
  - No PowerShell, linhas seguidas no mesmo bloco rodam mesmo depois de uma falha. Lá se usa `&&` ou `if (-not ...) { throw }`.
- **Texto com crase nunca vai dentro de `node -e "..."` nem de string entre aspas duplas no bash** (05/10/2026). Ele vai por arquivo.
  - Em 05/10, a crase virou substituição de comando, e a saída de um `pnpm install` foi parar no diário.
  - Corpo de PR e de commit: de preferência, por arquivo e `--body-file`. Num heredoc `<<'EOF'`, a crase fica sem escape, porque `\`` aparece com a barra.
  - O heredoc do bash também perdeu barras invertidas em regex (#106). Script com barra invertida vai por arquivo escrito com a ferramenta de escrita, e a regex se confere com grep.

### Segurança e produto

Estas regras estão no `CLAUDE.md` ou nas instruções do ambiente; ficam aqui como lembrete.
- **Credenciais e dados sensíveis:**
  - nunca usar `service_role` nem a secret key para dado de negócio;
  - o segredo `DEV_SESSION_POOLER` nunca vai em argumento de linha de comando nem em saída;
  - o agente não lê o `HK_DEMO_SENHA` e não entra com senha em serviço externo;
  - o e-mail do usuário serve só para identificar autoria.
- **Banco e texto:**
  - sem trigger e sem função nova no banco sem ADR;
  - nenhum texto de interface fixo: catálogos ICU nos quatro idiomas.
- **Fora dos commits:** os arquivos soltos citados na seção anterior e o `apps/web/AGENTS.md` e o `apps/web/CLAUDE.md` que aparecem em checkouts locais.

### Forma de trabalhar com o Cesar

- **Sempre em português do Brasil**, em toda resposta, inclusive avisos curtos de CI e respostas depois de um resumo de contexto (26/09/2026; está no `CLAUDE.md`).
- **Testes só em resumo:** total, falhas e o nome do que falhou.
- **Ponto de retomada por etapa** (28/09/2026).
  - Quando parar: ao fim de cada etapa e quando o contexto passa de 60%. O agente para num ponto seguro: commit feito, nada pela metade e nenhum comando rodando.
  - O que registrar: um ponto de retomada curto e autossuficiente no diário da fase (agora, este). Ele cobre o estado da `main` e do dev, os PRs abertos e o que espera o Cesar, o trabalho não enviado, as decisões pendentes e a próxima tarefa com o primeiro passo.
  - Sessão nova só se der problema. A conferência do dev no início da sessão só acontece se houve `db push` desde a última.
- **Sem notificação push nas paradas:** o Cesar não usa o Remote Control (29/09/2026). Volta só se ele disser que ligou.

### Só no notebook (histórico)

- **Worktrees:**
  - ficavam em `C:\Cesar\HubKeep\Dev\wt\`, nunca na pasta temporária do Windows, que apagou links do `node_modules` na etapa A da 1a;
  - eram removidos logo depois do merge, no máximo 3 por agente; o fallback era `cmd /c rmdir /s /q` pelo PowerShell;
  - os `int-*` eram do Kaio.
- **Rascunhos do Intelligence:** ficavam no branch `int-rascunhos` (worktree `wt/int-rascunhos`), com commit e push no mesmo dia, e esse branch nunca vira PR. A regra é do agente do Kaio, que decide como fica na nuvem.
- **O disco do notebook estava quase cheio** (2,1 GB livres em 12/10). Por isso a passagem foi feita sem instalação, sem build e sem testes.

## Ponto de retomada (12/10/2026, passagem para a nuvem)

### Estado

- **`main` em 21bd04f**, com os checks de "segurança" verdes; "CI" e "banco" ainda rodavam no fim desta sessão, e a primeira sessão na nuvem confere.
  - Entraram em 12 e 13/10: #203 (PV1, migração 0042), #204 (1c, nível bandeira nas políticas) e #206 (1c, calendário de SLA, migração 0043, ADR-042).
  - Na `main`, a migração mais recente é a 0043: `20261013120000_calendario_sla.sql`, da 1c.
- **Dev:** o `db push` da 0042 e o da 0043 não foram conferidos por este agente. O Cesar confere a saída do `db push` até existir o workflow "conferir dev" (tarefa 6).
  - Depois do `db push`, falta o `pnpm db:types`. Os `tipos-banco.ts` da 0042 e da 0043 foram escritos à mão, no formato do gerador.
- **PR aberto:** só o #205, da 1c (domínio do calendário de SLA, fora da zona protegida). Nenhum PR da 1b está aberto, fora o deste diário.
- **Fila de zona protegida: livre.** A vez é da 1b, com a PV2.

### Branch enviada sem PR: `1b-pv1b-checklist-telas` (1cba18f)

É o resto da PV1, ADR-040, fora da zona protegida, sobre a 0042:
- **Domínio** (`packages/dominio/src/checklist.ts`): quem gere os modelos, os itens tipados, a versão, quando a OS aceita o checklist e as respostas.
- **Política nova:** `os.checklist_completo_obrigatorio`, desligada por padrão.
- **Casos de uso, porta e repositório:** `packages/db/src/repositorios/checklists.ts`.
- **API:** seis rotas, `/api/v1/modelos-de-checklist` e `/api/v1/os/{id}/checklist`.
- **Telas:** os modelos no web, o checklist no detalhe da OS e no PWA (`apps/tecnico/src/telas/ChecklistDaOs.tsx`), e a operação offline `os.responder_checklist`.
- **Resto:** os catálogos nos quatro idiomas, o kit e o roteiro no `docs/10`, e os eventos `os.checklist_aplicado` e `os.checklist_respondido`.

No local, em 12/10, antes de trazer a `main`, ficaram verdes:
- typecheck (12/12) e lint;
- turbo test (21/21): dominio 1931, aplicacao 132, tecnico 158, web 256 e db 74, com os testes de integração do banco só na CI;
- vitest da raiz (484).

Para abrir o PR:
1. Registrar neste diário que a PV1b mexe em áreas compartilhadas com a 1c: políticas, OS, catálogos e `packages/dominio`.
2. Trazer a `main` para a branch. O conflito esperado está nos arquivos que o #204 e o #206 também mexeram (`packages/dominio/src/politicas.ts`, `packages/dominio/src/index.ts`, `packages/contratos/src/configuracao.ts`, `packages/contratos/src/index.ts`, `tests/contratos-dominio.test.ts`, `packages/db/test/configuracao.test.ts`) e no `docs/diario-fase-1a.md`. O #205, se entrar antes, mexe nos mesmos arquivos.
   - Nas listas de políticas, ficam as entradas das duas fases.
   - A política nova precisa de amostras no `tests/contratos-dominio.test.ts`, do caso desligado por padrão no `packages/dominio/test/politicas.test.ts` e de entrar na lista de chaves do `packages/db/test/configuracao.test.ts`.
   - Conferir também se o nível bandeira do #204 muda algum teste da política nova.
3. Mover a entrada "PV1 — checklist na OS: domínio, API, telas e kit (12/10/2026)" do fim do `docs/diario-fase-1a.md` para este diário.
4. Rodar lint, typecheck e testes. Depois, empurrar a branch e abrir o PR com base na `main`, título "1b: PV1 — checklist na OS: domínio, API, telas e kit (ADR-040)". Por fim, rodar `gh pr checks` uma vez.

### Fila da 1b

Desenho em `docs/referencia/propostas-desenho-pv-implantacao.md`, com as 21 decisões aprovadas pelo Cesar em 12/10/2026. O ADR-040 está aprovado e no `docs/03`. O ADR-041 também está aprovado, e o texto dele entra no `docs/03` com a PV2, já como aprovado.

Cada item tem um PR de zona protegida com a migração e outro PR, fora da zona, com domínio, API e telas (modelo da I6 e da PV1). Os números abaixo supõem a vez alternada com a 1c e mudam a cada PR da 1c que entrar antes. Antes de cada `supabase migration new`, conferir a última migração da `main`; o nome do arquivo é por data e hora, e só o comentário "Migração 00NN" muda.

| Ordem | Item | Migração (provável) | ADR |
|---|---|---|---|
| 0 | PR da PV1b (fora da zona) | — | ADR-040 |
| 1 | PV2, planos preventivos | 0044 | ADR-041 (início, com o texto) |
| 2 | PV3, geração automática de OS (inclui o INSERT do worker em `app.os_checklist`) | próxima livre | ADR-041 (fim) |
| 3 | M1, modelos de ativo por categoria | próxima livre | — |
| 4 | M4 e M2, situação do cadastro e chave de importação | próxima livre | — |
| 5 | PB1, pacote da bandeira | próxima livre | — |
| 6 | M3, códigos reservados (QR em lote) | próxima livre | — |

A PV2 e a PV3 geram e mexem em OS. A 1c grava os prazos na abertura, na triagem e na pausa e retomada da OS. Antes de cada uma, ler o diário da 1c.

### Fila de zona protegida

- Agora está livre; a vez é da 1b (PV2). O #206 da 1c entrou.
- Depois, a vez alterna entre a 1c e a 1b (Cesar, 13/10/2026, registrado no diário da 1c). Quando dois agentes quiserem a vez, o Cesar decide a ordem.
- O PR de zona protegida do Intelligence que estiver pronto entra na fila do mesmo jeito: registrar no diário e conferir no GitHub antes de abrir.
- O PR do `CLAUDE.md` (tarefa 2) também precisa de uma vez da 1b. Perguntar ao Cesar se vai sozinho, antes da PV2, ou junto com ela.

### Decisões pendentes do Cesar

1. Confirmar o `db push` da 0042 e o da 0043.
2. Apagar ou não a branch `1a-d1-teste-proprietario` (28b1785).
3. A ordem do PR do `CLAUDE.md` em relação à PV2.
4. Aprovar a proposta do workflow "conferir dev" (tarefa 6) e cadastrar os segredos, quando a proposta estiver pronta.

As 14 decisões de `docs/referencia/propostas-desenho-1c.md` não estão nesta lista: o Cesar responde direto ao agente da 1c.

### Combinações com os outros agentes

**Agente da 1c** (pedidos no `docs/diario-fase-1c.md`, "Pedido ao agente da 1b", 13/10/2026):
1. Registrar no `CLAUDE.md` as branches `claude/*` e o título do PR por fase: é a tarefa 2.
2. Numeração: aceita. A 0043 é do SLA, e a PV2 passa a ser a 0044 ou a próxima livre.
3. Os conflitos entre o PR do SLA e o #203 o agente da 1c resolveu do lado dele (#206).
4. Conferir o dev depois do `db push` da 0043: até o workflow "conferir dev" existir, o Cesar confere a saída do `db push` (decisão de 12/10/2026). Quando existir, o workflow confere depois de cada `db push` de migração, da 1b e da 1c.

Áreas compartilhadas entre a 1b e a 1c: políticas, chamado, OS, catálogos de texto e `packages/dominio`. Quem mexer registra no próprio diário antes de começar e atualiza a branch a partir da `main` com frequência.

**Agente do Kaio:**
- O pedido de escopos permitidos na `ExtensaoDePolitica`, aprovado pelo Cesar em 12/10/2026, está na tarefa 5.
- O glossário de métricas (`docs/referencia/glossario-metricas.md`) é combinado entre a 1c e o Kaio, pelos diários.
- As tabelas da PV1 (`app.checklist_modelo` e `app.os_checklist`) já foram informadas ao Intelligence no diário da 1a. O worker lê as duas.

## Tarefas para a sessão na nuvem

Pedido do Cesar ("Cesar aqui", 12/10/2026). Começar pelo `CLAUDE.md` e por este diário, rodar `gh pr checks` nos PRs abertos e conferir que a `main` está verde.

1. **Nova organização, com três agentes, todos na nuvem:**
   - o agente do Cesar fica com a fase 1b inteira e a administração do projeto: `CLAUDE.md`, planos, Registro de decisões, perguntas ao cliente, documento consolidado, preparação do piloto, F0-12 e segurança pré-piloto;
   - o agente do Kaio fica com o HubKeep Intelligence;
   - o agente da 1c fica com a fase 1c inteira, no diário `docs/diario-fase-1c.md`. O Cesar responde direto a ele as 14 decisões do `propostas-desenho-1c.md`, que não fazem parte da lista deste agente.
2. **Atualizar o `CLAUDE.md`** num PR de zona protegida, na vez da fila:
   - os três agentes e os escopos de cada um, todos na nuvem, sem agente nem worktree no notebook;
   - branches no padrão que o ambiente impõe (`claude/*`), com o título do PR começando por "1b:" ou "adm:", "1c:" ou "int:";
   - um diário por agente;
   - um único PR de zona protegida aberto por vez no repositório inteiro. Antes de abrir, conferir no GitHub. Quando dois agentes quiserem a vez, o Cesar decide a ordem;
   - os ADRs do núcleo (1b e 1c) são aprovados pelo Cesar, e os do Intelligence pelo Cesar e pelo Kaio. Merges, `db push` e `config push` são só do Cesar;
   - áreas compartilhadas entre a 1b e a 1c (políticas, chamado, OS, catálogos de texto, `packages/dominio`): quem mexer registra no diário antes de começar e atualiza a branch a partir da `main` com frequência;
   - as regras vindas da memória local, da seção "Regras e contexto da memória local" acima, exceto as que eram só do notebook.
3. **Atualizar o documento consolidado** (`docs/referencia/documento-projeto.md`) e o `docs/00` com a nova divisão, e corrigir as linhas que ainda dão a 1c ao agente da 1b.
4. **Fila de zona protegida:** depois do #203 (PV1), a vez alterna entre a 1c e a 1b. O #206 da 1c já entrou, e a próxima vez é da 1b.
5. **Pedido do agente do Kaio, aprovado pelo Cesar:** acrescentar à `ExtensaoDePolitica` (`packages/dominio/src/politicas.ts`) uma opção de escopos permitidos, por exemplo `escopos: ['grupo']`. Com ela, a gravação de uma chave de módulo nos níveis de hotel e de bandeira é recusada.
   - É para a política `inteligencia.visibilidade_telas`.
   - Fica fora da zona protegida, se der. Registrar neste diário quando entrar e avisar o agente do Kaio pelo diário.
   - Mexe em políticas, área compartilhada com a 1c: registrar antes de começar.
6. **Propor um workflow do GitHub "conferir dev",** com disparo manual (`workflow_dispatch`). Ele roda o `supabase migration list` e o pgTAP com desfazimento contra o HubKeep-dev.
   - Usa os segredos de um ambiente "dev" do GitHub que exige a aprovação do Cesar.
   - Por ora, só a proposta, com a lista de segredos que o Cesar precisa cadastrar.
   - Quando existir, ele confere o dev depois de cada `db push` de migração, da 1b e da 1c. Até lá, o Cesar confere a saída do `db push`.
7. **Seguir com a fila da 1b:**
   - depois do merge do #203 (feito) e do `db push` da 0042, abrir o PR da PV1b a partir da branch enviada, pelos passos do ponto de retomada;
   - depois, a PV2.

## Primeira sessão na nuvem (13/10/2026)

Leitura feita: o `CLAUDE.md`, o documento consolidado, este diário inteiro e o fim dos diários da 1c e do Intelligence. Quando a sessão começou, a `main` estava em e491aa7. O 21bd04f (#206) estava verde nos três workflows; no e491aa7 (#207), a "segurança" já tinha passado e "CI" e "banco" ainda rodavam. Depois entrou o #205, da 1c (66769f2).

Decisões do Cesar no chat ("Cesar aqui", 13/10/2026):
- **0042 e 0043:** já estão no dev, conferidas pelo Cesar.
- **(a) Branch `1a-d1-teste-proprietario` (28b1785):** pode apagar. O conteúdo já entrou na `main` pelo 855e0cd ("main vermelha — linha do tempo do proprietário depois da 0028"), que ainda confere o nome vazio de quem gravou. A tentativa de apagar daqui voltou 403: o proxy da nuvem só deixa empurrar para branches `claude/*`. Quem apaga é o Cesar, pela interface do GitHub.
- **(b) PV1b:** esperar o merge do #205, juntar a `main` uma vez, conferir as listas, as amostras e o nível bandeira, e abrir o PR. Em paralelo, o PR do `CLAUDE.md`, com título "adm:" e sozinho na fila de zona protegida.
- **(c) Tipos do banco:** primeiro, confirmar se a CI pega uma divergência entre o `tipos-banco.ts` e as migrações. Se pegar, mudar o `db:types` para gerar os tipos a partir do banco local da CI, num PR próprio. Se não pegar, avisar antes de mudar qualquer coisa.
- **(d) Workflow "conferir dev":** fica para depois do `CLAUDE.md`. Até lá, o Cesar confere o `migration list` depois de cada `db push`.

Feito:
- **PR do `CLAUDE.md`:** é o #209, "adm: CLAUDE.md com os três agentes na nuvem e as regras da memória local — zona protegida", na branch `claude/adm-claude-md-tres-agentes`. Antes de abrir, conferi no GitHub: o único outro PR aberto era o #208 (int), que não toca a zona protegida.
- **(c):** o passo "Tipos do Kysely em dia com as migrações" do `banco.yml` roda o `kysely-codegen --verify` contra o banco do runner, em todo PR e em todo push na `main`. Ele quebra a CI se o arquivo divergir do que o gerador produziria a partir das migrações. O #203 e o #206, com os tipos escritos à mão, passaram por esse passo. A mudança do `db:types` mexe no `banco.yml`, que é zona protegida. Por isso ela espera a vez da fila, depois do #209.

## PV1b: aviso de área compartilhada e merge da `main` (13/10/2026)

**Aviso de área compartilhada com a 1c:** a PV1b mexe em políticas, OS, catálogos de texto e `packages/dominio`.

A branch `1b-pv1b-checklist-telas` (1cba18f) virou a `claude/1b-pv1b-checklist-telas`, porque daqui só se empurra para `claude/*`. Depois do merge do #205, a `main` (66769f2) entrou nela uma vez:
- **Conflitos de texto:**
  - na lista de chaves do `packages/db/test/configuracao.test.ts`, ficaram a política da PV1 e as duas da 1c (`chamado.sla` e `hotel.horario_atendimento`);
  - no `docs/diario-fase-1a.md`, ficou o lado da `main`, e a seção da PV1 veio para cá (abaixo).
- **Conferido sem conflito de texto:** as listas de `politicas.ts`, `contratos/src/configuracao.ts` e dos dois `index.ts` têm as entradas das duas fases. A amostra da política nova está no `tests/contratos-dominio.test.ts`, e o caso desligado por padrão no `packages/dominio/test/politicas.test.ts`.
- **Nível bandeira:** a conclusão e a fila do dia leem a política por `deps.triagem.politica`, que usa o `niveisDaPolitica`. Desde o #204, ele já traz a bandeira, então a política nova herda da bandeira sem mudar código. Entrou no teste do domínio o caso da bandeira, que liga a política, e o do hotel, que desliga por cima dela.

## PV1 — checklist na OS: domínio, API, telas e kit (12/10/2026)

O resto da PV1 (ADR-040), fora da zona protegida, sobre a migração 0042 do PR anterior.

- **Domínio** (`checklist.ts`):
  - quem gere os modelos (só o Admin do grupo);
  - os nomes e os itens do modelo, com as regras dos campos tipados; a versão sobe só quando os itens mudam;
  - quando a OS aceita o checklist (atribuída, em execução ou pausada) e a troca do modelo, só enquanto não há resposta;
  - as respostas: valor no tipo do item, mesclagem por item (null tira a resposta) e os obrigatórios sem resposta.
- **Política nova** `os.checklist_completo_obrigatorio`, desligada por padrão. Ligada, a conclusão volta `checklist_incompleto` com os itens que faltam.
- **Casos de uso:**
  - modelos: listar, criar, alterar, desativar e reativar;
  - na OS: aplicar ou trocar o modelo (com `podeTriar`) e ler o checklist.
  - As respostas vão pela operação offline `os.responder_checklist`, na sincronização, como os códigos da OS. A conclusão confere a política, e a fila do dia leva o checklist e a política.
- **API:**
  - `GET/POST /api/v1/modelos-de-checklist`;
  - `PUT /api/v1/modelos-de-checklist/{id}`, com `desativacao` e `reativacao`;
  - `GET/PUT /api/v1/os/{id}/checklist`.
  - As seis rotas estão no OpenAPI. Os erros são códigos com mensagem nos quatro catálogos.
- **Telas:**
  - no web, "Checklists" no menu (os modelos e os itens por tipo; só o Admin do grupo grava) e o checklist no detalhe da OS (aplicar, trocar, ver as respostas);
  - a política em "Configuração";
  - no PWA, o formulário por tipo de item, que manda só o que mudou, também sem rede, e o aviso dos itens que faltam na conclusão.
- **Kit de teste:**
  - o modelo "Inspeção de ar-condicionado", com um item de cada tipo, aplicado na OS do ar-condicionado parado (UH 102 do Centro);
  - roteiro no `docs/10`.
- **Testes:**
  - domínio, casos de uso, sincronização, projeção e telas do PWA, telas do web;
  - integração do repositório (aplicar, trocar, responder, auditoria e evento), que roda na CI.
- **Eventos novos** no outbox: `os.checklist_aplicado` e `os.checklist_respondido`.
