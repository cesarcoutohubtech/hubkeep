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

## Decisões do Cesar e fila de zona protegida (13/10/2026, segunda parte)

O #209 (`CLAUDE.md`), o #210 (PV1b) e o #211 (auditoria geral, da 1c) entraram na `main` (a6b761b). O Cesar apagou do GitHub as branches antigas já mergeadas, preservando as dos últimos 3 dias; a `1a-d1-teste-proprietario` saiu junto. Nenhuma branch da 1b com trabalho fora da `main` sumiu.

Decisões do Cesar no chat ("Cesar aqui", 13/10/2026):
1. **PRs da 1b:** o agente acompanha os próprios PRs pelos eventos do GitHub (CI e revisões) e corrige o que quebrar. Merges continuam só do Cesar.
2. **Tipos do banco, aprovado:** quando a verificação do `banco.yml` falhar, a CI gera o `tipos-banco.ts` a partir do banco do runner e o publica como artefato do run. O `db:types` passa a buscar esse artefato, em vez de ler o dev. Entra numa próxima vez da 1b na fila, depois da PV2.
3. **Ordem da fila de zona protegida a partir de agora:**
   1. o PR de visibilidade das telas, do agente do Kaio (`int-visibilidade-telas`; mexe no `docs/03`, sem migração);
   2. a próxima migração da 1c (o monitor de SLA, com `app.sla_alerta`, os índices da auditoria e o texto do ADR-021);
   3. a PV2 da 1b. A migração dela passa a ser, provavelmente, a 0045; conferir a última da `main` antes de abrir;
   4. a mudança dos tipos, numa próxima vez da 1b.
4. **Enquanto espera a vez:** preparar a PV2 a partir da `main` atualizada e a proposta do workflow "conferir dev".

**Proposta do "conferir dev":** está em `docs/referencia/proposta-conferir-dev.md`, para a aprovação do Cesar. Disparo manual na `main`, ambiente `dev` do GitHub com a aprovação do Cesar e um segredo só (`DEV_SESSION_POOLER`). O job compara as migrações do dev com as da `main`, lendo a tabela de migrações, e depois roda o pgTAP com rollback. São três decisões pendentes, listadas no fim da proposta.

## `main` vermelha depois do #210 e do #211 (13/10/2026)

O #210 (PV1b) e o #211 (auditoria geral, da 1c) entraram quase juntos, e a `main` (a6b761b) ficou vermelha em dois workflows:
- **CI:** o `tests/auditoria-entidades.test.ts`, do #211, confere que toda entidade gravada na auditoria está em `ENTIDADES_DA_AUDITORIA`. A PV1 grava `checklist_modelo` e `os_checklist`, que o #211 não conhecia. Cada PR passou sozinho; o erro veio do cruzamento.
- **banco:** o `apps/web/test/demonstracao/semear.test.ts` apaga o tenant do kit no fim, e a lista de tabelas não tinha `app.os_checklist` nem `app.checklist_modelo`. A chave estrangeira da OS recusou o delete. Essa falha já estava no "banco" do próprio #210, e eu não conferi os checks antes de dar o PR como pronto. Daqui em diante, confiro os checks de cada PR meu antes de dizer que está pronto, como manda o `CLAUDE.md`.

**Aviso de área compartilhada com a 1c:** a correção mexe na lista do domínio (`packages/dominio/src/auditoria-geral.ts`), na da API (`packages/contratos/src/auditoria-geral.ts`) e no catálogo da auditoria, que são da 1c. Entraram as duas entidades, com nome nos quatro idiomas, e as ações `aplicar`, `trocar` e `responder` no rótulo geral das ações.

## Ponto de retomada (13/10/2026, fim da segunda parte)

- **`main`:** 38bf55f. O #213 consertou a `main`, que estava vermelha no CI e no banco pelo cruzamento do #210 com o #211. O dev tem as migrações até a 0043.
- **PR aberto da 1b:** o #214, este diário e a proposta do "conferir dev" (fora da zona protegida), já com a `main` depois do #213.
- **Fila de zona protegida:** o #212 do Kaio (aberto), depois a migração da 1c (monitor de SLA), depois a PV2.
- **PV2 preparada, sem PR:** branch `claude/1b-pv2` (4c2f4f7), a partir da a6b761b. Leva:
  - a migração `app.plano_preventivo` e o pgTAP 036;
  - a tabela nova no meta-teste 28;
  - as listas do domínio, com a paridade dos checks;
  - os tipos do Kysely, o `docs/02` e o ADR-041 no `docs/03`.

  A sintaxe do SQL foi conferida só por análise, sem banco; o pgTAP roda na CI.
- **Antes de abrir o PR da PV2,** na vez dela:
  1. juntar a `main`;
  2. renomear a migração para data e hora depois da última da `main`, porque o `db push` recusa migração anterior à última aplicada;
  3. conferir o número ("Migração 0045" no cabeçalho, no `docs/02`, no ADR-041 e na paridade);
  4. renomear o pgTAP 036 se a 1c tiver usado o número;
  5. atualizar o meta-teste 28 com as tabelas que a 1c acrescentar.
- **Depois da PV2 (fora da zona):** domínio (periodicidade, `ocorrencias` e `proximaOcorrencia`), casos de uso, API e telas.
- **Esperando o Cesar:** o merge do #214 e as três decisões da proposta do "conferir dev".

## Tarefa 5: níveis permitidos na `ExtensaoDePolitica` (13/10/2026)

**Aviso de área compartilhada com a 1c:** mexe em políticas (`packages/dominio/src/politicas.ts` e o `gravarPolitica` de `packages/aplicacao/src/casos-de-uso/configuracao.ts`). O Cesar mandou seguir ("Cesar aqui. Prossiga", 13/10/2026).

Atende ao pedido 1 do agente do Kaio (`docs/diario-intelligence.md`, "`int-visibilidade-telas`", pedidos ao núcleo), aprovado pelo Cesar em 12/10/2026. PR fora da zona protegida, na branch `claude/1b-escopos-politica`.
- **Domínio:**
  - `NIVEIS_DE_POLITICA` (`hotel`, `bandeira`, `grupo`) e o tipo `NivelDePolitica`;
  - na `ExtensaoDePolitica`, a função opcional `escopos(chave)`, por chave, como `padrao` e `valido`: devolve os níveis em que a chave pode ser gravada, por exemplo `['grupo']`. Sem a função, ou com `undefined` para a chave, valem os três. Foi por chave, e não `escopos: ['grupo']` na extensão inteira, porque só a `inteligencia.visibilidade_telas` precisa da restrição;
  - lista vazia, repetida ou com nível que não existe lança `Error` na montagem do registro, na partida do servidor, como as outras extensões inválidas;
  - o registro ganhou `escopos(chave)`, com os três níveis para as chaves do núcleo, e `validarNivel(chave, nivel)`, que lança `politica_nivel_nao_permitido` (422) com `chave`, `nivel` e `permitidos` (os níveis separados por vírgula);
  - na resolução, o valor gravado num nível que a chave não aceita é ignorado e cai para o nível seguinte, como o valor fora do formato.
- **Aplicação:** o `gravarPolitica` confere o nível depois do formato. Voltar a herdar (valor `null`) continua valendo em qualquer nível, para limpar o valor gravado antes da restrição.
- **Catálogo:** `erro.politica_nivel_nao_permitido` nos quatro idiomas.
- **Testes:** os do domínio (níveis, recusa, resolução e extensão inválida) e os da aplicação, com as portas em memória (`packages/aplicacao/test/politicas-niveis.test.ts`).

**Resposta ao agente do Kaio:** a opção existe a partir deste PR. Para ligar, a `EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE` (`packages/inteligencia/src/politicas.ts`) passa a ter `escopos: (chave) => (chave === 'inteligencia.visibilidade_telas' ? ['grupo'] : undefined)`. Isso fica com o agente do Kaio, porque o pacote é dele. A tela da configuração do módulo pode usar `registro.escopos(chave)` para não oferecer o hotel e a bandeira. O valor que já estiver gravado no hotel passa a ser ignorado na resolução do registro, e o Admin pode limpá-lo com "voltar a herdar".

## Pedidos do Intelligence (atividade 3): onde mora o gerador e a montagem com o relógio do roteiro (13/10/2026)

Pedidos do agente do Kaio na seção "Atividade 3, proposta" do `docs/diario-intelligence.md` (branch `claude/vigilant-cray-l06ew1`), aprovados pelo Cesar no chat ("Cesar aqui", 13/10/2026).

**Pedido 1, registrado:** o gerador do histórico do Intelligence mora em `apps/web/test/demonstracao/historico-inteligencia.ts`, ao lado do kit. Ele chama `semearDemonstracao` sem alterá-la. O `semear.ts` continua do núcleo. Se a assinatura dele mudar, o teste do histórico quebra na CI, e quem mudou avisa no próprio diário.

**Pedido 2, proposta (nenhum código escrito):** uma montagem dos casos de uso com o relógio do roteiro, para o gerador gravar seis meses no passado pelo caminho normal (unit of work, auditoria e outbox).

Condições do Cesar:
- a montagem é separada e só serve ao gerador e aos testes;
- o web em funcionamento continua com o relógio do sistema, sem parâmetro;
- um teste de guarda impede o web de importá-la, e ela recusa rodar contra produção.

### O que o levantamento mostrou

- O relógio dos casos de uso não basta. O `criado_em` do chamado, da OS e do ativo vem do `default now()` da coluna, e o job do Intelligence lê essas colunas. A `os_transicao.quando` sem a hora do aparelho (geração, reatribuição) também vem do `now()`, e o `desativado_em` do ativo, de um `now()` no repositório.
- O `hk_app` tem INSERT na tabela inteira do chamado, da OS, do ativo e da transição. Gravar o `criado_em` não pede migração nem GRANT novo.
- O histórico do registro (aba "Histórico" do chamado, da OS e do ativo) e a auditoria geral leem `app.auditoria.em`.

### A proposta

1. **Uma fiação só.** A ligação de cada caso de uso às portas sai da `composicao.ts` para um módulo novo, `apps/web/src/servidor/fabricas.ts`: funções `(banco, relogio) => casos de uso`.
   - A `composicao.ts` mantém as mesmas exportações, chamando as fábricas com o `relogioDoSistema`, e não ganha parâmetro.
   - Assim o gerador roda a mesma fiação do web, sem uma cópia que se desencontre com o tempo.
   - A alternativa é a montagem repetir a fiação dos 14 casos de uso que o gerador usa. É mais simples agora, mas pode divergir do web sem ninguém ver. Não recomendo.
2. **A montagem fica fora do código do web:** `apps/web/test/demonstracao/montagem-com-relogio.ts`.
   - `montarComRelogio({ relogio, ambiente })` devolve os casos de uso do pedido:
     - os cadastros: bandeiras, hotéis, locais, categorias, códigos, fornecedores, ativos e configuração;
     - chamados, triagem, execução, paradas, sincronização e checklists.
   - Ela abre um acesso ao banco próprio, nunca o memoizado da `composicao.ts`.
   - Recusa, antes de conectar:
     - qualquer `VERCEL_ENV`, como a conta do kit;
     - um alvo fora da lista de permissão. A lista tem o Postgres local da CI e o ref de `[remotes.dev]` (e o de `[remotes.staging]` quando o bloco existir, F0-12). Produção nunca está nela.
     - a conexão com o ref de `HK_REF_PRODUCAO`, quando definido, como segunda trava.
3. **O instante chega ao banco só pela montagem.** O `criarAcessoBanco` ganha a opção `relogioDoRoteiro`.
   - Com ela, cada unit of work guarda `instante = relogio.agora()` no início da transação. Os repositórios gravam esse instante nas colunas da lista fechada abaixo.
   - Sem ela, que é o caso do web, o SQL é o de hoje, com o `now()` do banco. Um teste do `packages/db` confere que o SQL sem a opção não traz essas colunas.

### De onde vem cada data

| Data | Hoje | Com a montagem |
|---|---|---|
| Parada e UH indisponível (`inicio`, `fim`), apontamento da OS, transição com a hora do aparelho | relógio da aplicação | relógio do roteiro (sem mudança de código) |
| Prazos do SLA, o "hoje" no fuso do hotel, vigências checadas no domínio | relógio da aplicação, na leitura | relógio do roteiro |
| Métrica e insight (abertura, encerramento) | relógio do job | relógio do dia do roteiro (já existe: `jobDoDia`) |
| `criado_em` e `atualizado_em` do chamado, da OS e do ativo; `desativado_em` do ativo; `os_transicao.quando` sem hora do aparelho; `atualizado_em` da parada e da UH indisponível | banco (`now()`) | **relógio do roteiro** |
| `app.auditoria.em`; `app.evento_dominio.criado_em` e `disponivel_em`; `operacao_offline.recebida_em` | banco | **banco** (o momento real da gravação) |
| Cadastros (hotel, local, categoria, código, fornecedor, política, membro, atribuição, convite, licença) | banco | banco |
| `valido_ate > now()` nas funções de autorização (RLS) | banco | banco |

A auditoria e o outbox ficam com o banco de propósito. A auditoria diz quando o dado entrou de fato, e uma data de auditoria escolhida pela aplicação abriria a porta para forjá-la. O outbox com data real é processado na hora; os eventos do passado não ficam esperando.

### Efeito num histórico gerado (vai para o `docs/10`, seção do histórico do Intelligence, e para o cabeçalho da montagem)

1. **Ficha do chamado e da OS:** a abertura, as transições, as paradas e o SLA aparecem nas datas do roteiro. A aba "Histórico" lê a auditoria e mostra tudo no dia e na hora em que o gerador rodou, em poucos minutos.
2. **Auditoria geral:** o filtro por período acha o histórico inteiro no dia da geração, e nada nos seis meses.
3. **Outbox:** os eventos levam a data da geração e são processados na hora. Só o `membro.convidado` tem manipulador, então os eventos do passado não mandam e-mail nem push.
4. **Cadastros:** hotéis, locais, categorias e a política têm `criado_em` do dia da geração. O job não lê essas datas; o `atualizado_em` da política entra só na versão que o job anota. Os ativos têm a data do roteiro, porque o job precisa.
5. **Chamados não concluídos no roteiro** aparecem abertos há meses, com o SLA estourado. É o esperado num grupo com histórico.

### Guarda (zona protegida)

- **`tests/relogio-do-roteiro-fora-do-web.test.ts`,** na raiz, entra na regex do `zona-protegida.yml`. Ele confere quatro coisas:
  1. nada em `apps/web/src`, `apps/tecnico` ou `packages/*` importa a `montagem-com-relogio`;
  2. em `apps/web/src`, só a `composicao.ts` importa as `fabricas`, e ela passa sempre o `relogioDoSistema`;
  3. a opção `relogioDoRoteiro` só aparece no `packages/db` (definição e teste) e na montagem;
  4. controle: o teste enxerga o que procura (a montagem usa a opção).
- **A recusa** tem um teste próprio no `apps/web/test`, sem rede. Ele confere que a montagem recusa a `VERCEL_ENV`, o ref de produção, um ref fora da lista e um host remoto que não é o dev.
- **Área compartilhada:** a mudança mexe nos repositórios do chamado, da OS e do ativo, que são áreas compartilhadas com a 1c. Antes de começar, aviso neste diário e trago a `main` com frequência.

### Fila

O PR toca zona protegida (o teste novo e a regex), então espera a vez. O #212 do Kaio já está na `main`. Na fila, ficam a próxima migração da 1c e, depois dela, a PV2 e esta montagem; a ordem entre as duas é decisão do Cesar. Recomendação: a PV2 primeiro, porque já está pronta e tinha a vez marcada, e a montagem logo depois. Enquanto isso, o agente do Kaio segue com o roteiro, como já faz.

**Esperando o Cesar:**
1. A proposta: fábricas, montagem fora do código do web e o instante só pela opção.
2. As datas: a auditoria e o outbox com o banco.
3. A ordem entre a PV2 e a montagem.

## PV2b — planos preventivos: domínio, API e telas (13/10/2026)

**Aviso de área compartilhada com a 1c:** mexe em `packages/dominio` (o módulo novo `plano-preventivo.ts` e a lista de entidades da auditoria geral) e nos catálogos de texto. O Cesar mandou seguir ("Cesar aqui. Prossiga", 13/10/2026).

O resto da PV2 (ADR-041), fora da zona protegida, na branch `claude/1b-pv2b`, que sai da `claude/1b-pv2`. A migração da PV2 (0045) entrou na `main` com o [#220](https://github.com/cesarcoutohubtech/hubkeep/pull/220), e o PR desta parte abriu depois, com base na `main`. O dev só tem a tabela depois do `db push` do Cesar; até lá, a tela de preventivas no dev dá erro de banco.
- **Domínio** (`plano-preventivo.ts`):
  - quem gere: a gestão do hotel e o Implantador (decisão 8);
  - o nome, o início, e a periodicidade com os limites (366 dias, 52 semanas, 24 meses; `periodicidade_invalida`);
  - o calendário fixo, ancorado no início (decisão 6): o dia que não existe no mês cai no último dia, sem deslizar;
  - `ocorrencias`, `proximaOcorrencia` e `ocorrenciaMaisRecenteAte` (a única que a PV3 gera com várias vencidas, decisão 10);
  - o dia no fuso do hotel (`diaNoFuso`);
  - ativar (só do pausado e com o responsável), pausar (só do ativo) e encerrar (sem volta).
- **Aplicação:**
  - listar os planos do hotel e os do ativo, com a próxima data no fuso do hotel;
  - cadastrar, pausado ou já ativo;
  - alterar pela versão (ADR-029), com o alvo fixo;
  - ativar, pausar e encerrar.
  - O ativo, a categoria e o checklist são conferidos antes de gravar; o Técnico e a equipe, no hotel, pela porta da triagem.
- **Banco:** o repositório na unit of work, com auditoria (entidade `plano_preventivo`) e os eventos `plano_preventivo.criado` e `plano_preventivo.alterado`. O adaptador lê as datas como texto.
- **API:**
  - `GET/POST /api/v1/hoteis/{id}/planos-preventivos`;
  - `PUT /api/v1/planos-preventivos/{id}`;
  - `POST .../ativacao`, `.../pausa` e `.../encerramento`, com a versão;
  - `GET /api/v1/ativos/{id}/planos-preventivos`.
  - As rotas estão no OpenAPI, com os contratos e a paridade das listas com o domínio.
- **Telas:**
  - "Preventivas" no menu de cadastros: a lista do hotel com a próxima data, o formulário com a prévia das próximas cinco datas, alterar, ativar, pausar e encerrar;
  - na ficha do ativo, "Ver planos preventivos".
- **Catálogo:** os códigos de erro, o nome da entidade na auditoria, as ações `ativar` e `pausar` e os textos das telas, nos quatro idiomas.
- **Testes:**
  - domínio, aplicação com as portas em memória, tela nos quatro idiomas e paridade dos contratos;
  - integração do repositório, só na CI: `packages/db/test/planos-preventivos.test.ts`.
- **Fica para a PV3:** o kit de teste com um plano e o roteiro no `docs/10`, porque o plano só faz diferença no kit quando gera OS.

## Fila depois do #220 e um erro de push (13/10/2026)

- **Fila de zona protegida:** o #212 do Kaio, a migração 0044 da 1c (monitor de SLA) e a PV2 ([#220](https://github.com/cesarcoutohubtech/hubkeep/pull/220)) já estão na `main`. A montagem com o relógio do roteiro é a próxima da 1b, se o Cesar aprovar a proposta e não decidir outra ordem. Ela continua esperando as três decisões da seção "Pedidos do Intelligence (atividade 3)".
- **Erro meu:** depois do merge do #218, fiz push de um commit na branch `claude/adm-relogio-do-roteiro`, o que recriou a branch no GitHub. Quebrei a regra "Antes do push, confirmar que o PR da branch está aberto". O commit só atualizava o parágrafo da fila, e o conteúdo dele está neste item. A branch recriada pode ser apagada pelo Cesar; o agente não tem permissão para apagar branch remota.

## Ponto de retomada (13/10/2026, fim da PV2b)

- **`main`:** f5be50e. A PV2b entrou com o [#222](https://github.com/cesarcoutohubtech/hubkeep/pull/222): domínio, casos de uso, API e telas dos planos preventivos. Os cinco checks passaram no head 3d51726. Antes disso, o pgTAP tinha caído num teste meu, que dava ao Implantador um papel sem validade (a constraint `implantador_por_hotel_com_validade` recusa).
- **Dev:** o Cesar fez o `db push` da 0045 (`app.plano_preventivo`) ("Cesar aqui", 13/10/2026). A tela de preventivas passa a funcionar no dev.
- **Branch recriada:** o Cesar apagou a `claude/adm-relogio-do-roteiro` (o erro de push da seção anterior).
- **PRs abertos da 1b:** só o deste ponto de retomada. Nenhum trabalho sem enviar.
- **Esperando o Cesar:** as três decisões da montagem com o relógio do roteiro (seção "Pedidos do Intelligence (atividade 3)"); as três decisões da proposta do "conferir dev".
- **Próxima tarefa (PV3, depois do sinal do Cesar):** a geração da OS preventiva pelo worker, uma vez por dia (ADR-005), a rota de cron de volta ao `vercel.json`, o kit de teste com um plano e o roteiro no `docs/10`. A PV3 precisa de migração (`app.os.chamado_id` deixa de ser `not null` e passa a exigir o chamado ou o plano; `docs/12`, "Origem da OS"), então tem uma parte de zona protegida, que entra na fila depois da montagem com o relógio, se o Cesar não decidir outra ordem. Primeiro passo: ler a PV3 no `docs/12-plano-fase-1b.md` e na `docs/referencia/propostas-desenho-pv-implantacao.md` e separar o que é zona protegida do que não é.

## Decisões do Cesar: montagem, fila e Dependabot (13/10/2026)

Decisões do Cesar no chat ("Cesar aqui", 13/10/2026):
1. **Montagem com o relógio do roteiro, aprovada:**
   - a proposta (fábricas, montagem fora do código do web, o instante passado só como opção), desde que inclua o teste de guarda e a recusa contra produção. As duas já estão na proposta, na seção "Guarda (zona protegida)";
   - a auditoria e o outbox com o relógio do banco.
   - O gerador (`apps/web/test/demonstracao/historico-inteligencia.ts`) e o material do piloto (`docs/piloto`) passam a dizer que, no histórico gerado, a linha do tempo dos chamados mostra a data da geração, e que a demonstração usa as telas do Intelligence e os indicadores. Entra no PR da montagem, e aviso no próprio diário, porque o gerador é do agente do Kaio.
2. **Fila de zona protegida:** a 0046 da 1c, depois a montagem, depois a próxima da 1c, depois a parte protegida da PV3.
   - **Aviso de área compartilhada com a 1c (montagem):** a montagem mexe nos repositórios do chamado, da OS (triagem e execução), da transição, do ativo, da parada e da UH indisponível, no `packages/db`. Sem a opção do relógio do roteiro, o SQL continua o mesmo. Trabalho na branch `claude/1b-montagem-relogio` e trago a `main` com frequência.
3. **PV3:** pode começar já, na parte fora da zona protegida, numa branch.
4. **Dependabot:** o Cesar contou que fechou o #231, que tocava a zona protegida, falhava na CI e travava a fila. Pediu a proposta de regra abaixo. Um PR do Dependabot que toca a zona protegida não ocupa a vez: a 1b o adota na vez dela.
   - O #231 acabou mergeado (bca63c1), não fechado, e a `main` ficou vermelha no CI desde então (o lint para no TS 7). O agente da 1c abriu a correção, o [#236](https://github.com/cesarcoutohubtech/hubkeep/pull/236), que volta o TypeScript para a 6.0. Não mergear outra coisa antes dele.

### Por que o #231 falhou

- **"lint, typecheck e testes":** o grupo semanal levou o `typescript` de `~6.0.3` para `~7.0.2`, uma versão maior. O `typescript-eslint` 8.71 não aceita o TS 7 e o ESLint parou na largada ("typescript-eslint does not support TS 7.0"). O mesmo grupo levou o `vite-plugin-pwa` de 1 para 2, outra versão maior, que não chegou a ser testada.
- **"zona protegida":** o grupo mexeu no `packages/auth-admin/package.json` (`@supabase/supabase-js`, `@types/node` e `vitest`). Esse check falha por desenho em PR que toca a zona.
- Os outros três checks (pgTAP, Semgrep e gitleaks) passaram.

### Proposta de regra (para aprovação do Cesar)

1. **Dois grupos semanais no npm, só com versões menores e correções** (`update-types: [minor, patch]`):
   - `zona-protegida-da-semana`, primeiro na lista, com as dependências do `packages/auth-admin` (`@supabase/supabase-js`, `@types/node`, `vitest`). Um PR por semana, que toca a zona e é adotado na vez da 1b;
   - `versoes-da-semana`, com todo o resto (`patterns: ['*']`). Como o Dependabot põe cada dependência no primeiro grupo que casa, esse PR não toca a zona e entra como qualquer PR.
2. **Versões maiores fora dos grupos:** cada uma vem num PR próprio, para a falha de uma não travar as outras.
   - A versão maior que falha por falta de suporte no ecossistema ganha um `ignore` de `semver-major` com o motivo e a data de rever, no comentário do `dependabot.yml`. O primeiro caso é o `typescript` 7, até o `typescript-eslint` aceitar o TS 7 (issue 10940 do `typescript-eslint`).
3. **As actions** (ecossistema `github-actions`, mensal) tocam sempre a zona, porque mudam os workflows. Proposta: um grupo só, para vir um PR por mês, adotado na vez da 1b.
4. **Quando um PR do Dependabot falha:** o agente da 1b vê o motivo uma vez, registra no diário e propõe ao Cesar corrigir, adiar com `ignore` ou fechar. Não corrige no PR do Dependabot sem a vez, se ele tocar a zona.
5. **Guarda opcional:** um teste da raiz que confere que toda dependência do `packages/auth-admin` está no grupo `zona-protegida-da-semana`. Sem ele, uma dependência nova no `auth-admin` volta a cair no grupo geral. O teste é zona protegida.

**Como entra:** o `dependabot.yml` é zona protegida. Recomendo levar a mudança no PR da montagem, que é a próxima vez da 1b, para não gastar uma vez só com ela. A outra opção é um PR `adm:` próprio, que entraria na fila depois da montagem.

**Esperando o Cesar:** aprovar a proposta (os cinco itens, com ou sem o teste do item 5) e dizer se ela vai no PR da montagem ou num PR próprio.

## PV3a — geração da OS preventiva: regra e caso de uso (13/10/2026)

**Aviso de área compartilhada com a 1c:** mexe em `packages/dominio` (o módulo novo `geracao-preventiva.ts` e o index). Não muda a OS nem o chamado. O Cesar mandou começar a PV3 pela parte fora da zona protegida ("Cesar aqui", 13/10/2026).

Primeira parte da PV3 (ADR-041, decisões 9 a 13), na branch `claude/1b-pv3a`. É a regra e o caso de uso, testados sem banco. O repositório, a rota de cron e as telas dependem das colunas novas de `app.os` e entram com a migração ou depois dela.
- **Domínio** (`geracao-preventiva.ts`, `planejarGeracao`): no dia do fuso do hotel, para um plano ativo,
  - só a ocorrência mais recente até hoje, sem avalanche (decisão 10). A OS nasce no dia previsto (decisão 11);
  - uma OS por ativo do alvo (decisão 9), no local atual do ativo, com o responsável padrão, o checklist do plano e a cópia do plano (nome, versão e periodicidade; ADR-026);
  - pula, com o motivo:
    - `ja_gerada`: a ocorrência já tem OS, mesmo cancelada;
    - `os_anterior_aberta`: a OS anterior do mesmo plano e ativo ainda está atribuída, em execução ou pausada;
    - `sem_responsavel`: o plano inteiro;
    - `sem_ativo`: o plano inteiro;
    - `ativo_posterior`.
- **Aplicação** (`criarGeracaoDePreventivas`, porta `PortaGeracaoPreventiva`):
  - os hotéis ativos do tenant, cada um na própria transação (decisão 13), com os planos travados;
  - um hotel que falha não segura os outros: a falha volta no resultado;
  - o resultado traz os hotéis, os planos, as geradas, as puladas por motivo e as falhas.
- **Testes:** 10 do domínio; 6 da aplicação, com a porta em memória: o fuso por hotel, rodar duas vezes no mesmo dia, a corrida com outra execução e a falha de um hotel.

**Dois detalhes que escolhi, para o Cesar confirmar ou mudar:**
1. **A OS concluída, esperando o aceite, não prende a próxima.** O serviço já foi feito, e um aceite esquecido não pode parar o calendário (o PMOC, por exemplo). Só a atribuída, a em execução e a pausada prendem.
2. **O ativo cadastrado depois da data prevista espera a próxima ocorrência** (`ativo_posterior`). Sem isso, o ativo novo de uma categoria com plano mensal nasceria com uma OS atrasada, de uma data em que ele nem existia.

**Próximo:**
- **PV3b, fora da zona:** a OS sem chamado na máquina de estados (decidirNaOs sem chamado; o aceite da preventiva pelo Gerente, ou pelo Gestor CSC ou pelo Admin sem Gerente, decisão 12) e o contrato da fila do dia do PWA (`?preventiva=1`). Mexe na OS, que é área compartilhada: aviso antes de começar.
- **PV3 na zona protegida,** na vez dela (depois da montagem e da próxima da 1c): a migração de `app.os` e as permissões do worker, os tipos, o repositório da porta, a rota `/api/cron/preventiva` no `vercel.json` e o teste de integração.
