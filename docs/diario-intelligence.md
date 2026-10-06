# Diário do HubKeep Intelligence

Diário do agente do Kaio, que trabalha no módulo Intelligence. O núcleo do HubKeep tem o próprio diário, `docs/diario-fase-1a.md` e os das fases seguintes. Branches `int-*`.

**Regras deste agente**, além das do `CLAUDE.md`:
- o escopo é só o módulo; migrações, tabelas e telas do núcleo ficam com o agente do Cesar;
- o módulo depende do núcleo, nunca o contrário, e lê o núcleo por portas e repositórios;
- um único PR de zona protegida aberto por vez no repositório inteiro, e antes de abrir um, conferir no GitHub se já existe outro;
- os ADRs do Intelligence só valem com a aprovação escrita de Cesar e Kaio;
- `db push` e `config push` são do Cesar;
- nenhuma chamada a provedor de IA, porque o provedor é pendência.

## Sessão inicial (01/10/2026)

- **Leituras:** `CLAUDE.md`, `docs/02`, `docs/03`, `docs/05`, o último ponto de retomada do `docs/diario-fase-1a.md` e o PRD do Intelligence. O PRD ainda não está no repositório: li a cópia anexa, e o agente do núcleo vai publicar o arquivo em `docs/referencia/prd-hubkeep-intelligence-v1.md`.
- **Resumo devolvido ao Kaio e aprovado por ele**, com os conflitos do PRD com as regras:
  - fórmula de score e views materializadas no banco;
  - nomes e status em inglês;
  - transições do insight como regra de domínio;
  - tabela de sinais que copia o núcleo;
  - IA, feedback e compliance na 1.5;
  - custo, fornecedor e Repair vs Replace na fase 2;
  - textos pelo catálogo;
  - o "Integration Hub", que não existe.
- **Identidade:** o Kaio autorizou commits desta máquina e desta conta. Eles aparecem no git como Cesar Couto, mas são do agente do Kaio. Por isso este diário e o PR marcam a autoria.
- **Branch `int-motor`**, worktree `wt/int-motor`. Não é zona protegida: não tem migração, não mexe no `eslint.config.mjs` e não toca no `docs/03`.
  - **`packages/inteligencia`**, em funções puras e só com o domínio como dependência:
    - `score.ts` traz a forma comum: componentes, peso dos ausentes dividido entre os presentes e faixas do PRD;
    - `reincidencia.ts`, `atencao.ts` e `efetividade.ts` (antes e depois);
    - `sistemico.ts` cobre mesmo modelo, mesmo andar e crescimento da mesma falha;
    - `substituicao.ts` dá o sinal de Repair vs Replace.
  - **Testes:** 42, com os casos da seção 37 que não dependem de IA. As contas esperadas estão escritas à mão nos testes.
  - **Propostas de ADR** (ADR-INT-1 a 5) em `docs/referencia/propostas-adr-inteligencia.md`, esperando a aprovação de Cesar e Kaio.
- **Local:** lint, typecheck (11 de 11) e os testes da raiz (282) verdes.

### Ponto de retomada (01/10/2026, motor do Intelligence)
- **PR aberto:** `int-motor`, que não é zona protegida. Conferir com `gh pr checks`, e não mergear sem o Kaio revisar.
- **Dependências do núcleo:**
  - registrar o `packages/inteligencia` nas fronteiras do ESLint, no PR de lint do agente do núcleo;
  - publicar o PRD em `docs/referencia/`;
  - publicar o relatório de lacunas (PR-I1).
- **Próximo passo:** com o relatório de lacunas publicado, ajustar os campos `(fase A)` de `historico.ts` aos nomes reais e propor as tabelas `app.insight` e `app.metrica_ativo_diaria`, num PR de zona protegida, um de cada vez.
- **Parada:** nenhuma tabela antes do relatório de lacunas, e nenhum ADR vale antes da aprovação de Cesar e Kaio.

## Retomada: instrumentação mapeada, área comum e fornecedor (05/10/2026)

- **Estado da `main`:**
  - #82 (motor) mergeado;
  - #85 (relatório de lacunas) e #86 (decisões do Cesar) publicados;
  - #87 (lint) trouxe o elemento `inteligencia` nas fronteiras: ele importa só `dominio` e `i18n`, e o núcleo não o importa.
- **Decisões do Cesar de 05/10** (no relatório de lacunas):
  - a instrumentação entra no começo da 1b;
  - "executado por" e o custo informado ficam fora do PWA, na triagem e no aceite;
  - os códigos de falha, causa e solução têm obrigatoriedade por política, desligada por padrão.
- **Branch `int-fornecedor`**, no mesmo worktree `wt/int-motor`. Não é zona protegida.
  - **`historico.ts`:** os campos da fase A com os nomes do relatório: `executadoPor`, `terceiroNome` e `custoInformado`, além do `tipo` do local. Ganhou `chaveDeTerceiro` (o nome normalizado como o modelo) e `custoInformadoNaJanela`, que devolve null, e não zero, quando ninguém informou custo.
  - **Atenção por ativo:** o custo passa a ser a soma do custo informado em 12 meses, contra um limite em reais da política (`limiteCusto12m`), porque o custo de reposição é da fase 2. A criticidade e o custo continuam opcionais.
  - **Problema sistêmico, duas regras novas:**
    - mesma área comum: a mesma falha no mesmo local de área comum;
    - mesmo fornecedor: a taxa de volta das OS de um terceiro, com a taxa da equipe interna como referência. Só conta a OS cuja observação de 30 dias já terminou.
  - **`motivosDoScore`:** os componentes que mais pesaram, para o "por que estou vendo isso?".
  - **Testes:** 54 no pacote; 319 na raiz.
  - **Propostas de ADR revistas:** com o relatório de lacunas, a tabela das regras sistêmicas, o mapa da instrumentação e sete decisões para Cesar e Kaio.
- **Nome do arquivo das propostas:** a mensagem de retomada pedia `adr-propostas-intelligence.md`, mas as propostas já estavam na `main` como `propostas-adr-inteligencia.md`, desde o #82. Ficou o nome que já existe, para não ter dois arquivos.
- **Local:** lint, prettier, typecheck (11 de 11) e testes verdes.

- **Respostas às sete decisões (05/10/2026),** registradas no fim das propostas:
  - ADR-INT-1 a 5 aprovados;
  - evidência do insight pelos ids;
  - só o Admin altera as políticas;
  - padrões como propostos;
  - limite de custo de R$ 10.000;
  - impacto no hóspede pelo indicador do chamado no 1.0 (`impactoHospedeDosChamados`, já no motor, com 3 testes; 57 no pacote);
  - retenção de 12 meses.
- **Pendências:**
  - confirmar se a aprovação vale por Cesar e Kaio;
  - confirmar a agregação mensal.

## ADRs do Intelligence no docs/03 (05/10/2026)

- **#96 mergeado pelo usuário.** O merge pelo agente foi recusado pela permissão do modo automático, que pede revisão humana.
- **Confirmado pelo usuário:** basta a aprovação de um dos dois, Cesar ou Kaio, para um ADR do Intelligence. A regra substitui a de 30/09/2026, que exigia os dois. A agregação mensal fica para a visão de rede.
- **Branch `int-adrs`, zona protegida:** ADR-033 a ADR-037 no `docs/03`, com as respostas de 05/10. As propostas ficam como histórico, apontando para o `docs/03`.
- **A regra dos dois agentes** (quem faz o quê, diários, um PR protegido por vez, quem aprova ADR) ainda não está no `CLAUDE.md`. O registro é do agente do núcleo, num PR de zona protegida próprio.

### Ponto de retomada (05/10/2026, ADRs no docs/03)

- **PR aberto:** `int-adrs`, de zona protegida, o único aberto. O check `zona protegida` fica vermelho até o Cesar mergear com bypass (ADR-023).
- **Depois do merge:** `gh run list --branch main`. Se a `main` ficar vermelha, corrigir antes de qualquer outro merge.
- **Próximo passo:** as tabelas `app.insight` e `app.metrica_ativo_diaria`, depois das três migrações da instrumentação no começo da 1b, que são do agente do núcleo. Uma de cada vez, com a fila de zona protegida livre.
- **Parada:** nada de migração nem tela antes disso.

## Insight, políticas e agregação mensal (05/10/2026)

- **#97 mergeado:** os ADR-033 a 037 estão na `main`.
- **Branch `int-insight`**, no worktree `wt/int-motor`. Não é zona protegida: só `packages/inteligencia`, uma chave nova nos catálogos e este diário.
  - **`insight.ts` (ADR-033):**
    - os sete estados canônicos e seis ações: revisar, aceitar, agir, monitorar, resolver e descartar;
    - resolver e descartar pedem nota;
    - `decidirDeteccao` é o job, que abre, atualiza ou ignora sem duplicar pela chave de escopo e regra e nunca muda o estado.
  - **`politicas.ts` (ADR-035):**
    - o formato das cinco chaves `inteligencia.*`, com os `PADRAO_*` como padrão;
    - a resolução vai do hotel para a bandeira, depois o grupo e o padrão.
  - **`agregacao.ts` (ADR-036):**
    - o resumo do mês por ativo e por hotel;
    - o corte dos 12 meses (`limiteDeRetencao`) e o mês que o job fecha.
  - **Catálogos:** `erro.insight_fora_do_escopo` nos quatro idiomas.
  - **Testes:** 89 no pacote e 319 na raiz.
- **Aprovadas por escrito pelo usuário em 05/10/2026, como sugeridas:**
  - quem decide o insight: o Admin do grupo, o Gestor CSC e o Gerente do hotel, cada um no próprio escopo, e o insight de rede só com escopo de grupo ou da bandeira;
  - as transições;
  - o silêncio de 30 dias depois do descarte, salvo se a faixa subir;
  - o resolvido não silencia: o problema que volta abre insight novo, ligado ao anterior.
- **Para o agente do núcleo:**
  - registrar as chaves `inteligencia.*` no `POLITICAS` do domínio, ou criar um ponto de extensão, porque o núcleo não importa este módulo (ADR-037);
  - a resolução do núcleo ainda não lê a bandeira.

### Ponto de retomada (05/10/2026, insight e políticas)

- **PR aberto:** `int-insight`, que não é zona protegida. Conferir com `gh pr checks`; o merge é do usuário.
- **Esperando:** as três migrações da instrumentação no começo da 1b.
- **Próximo passo:** as tabelas `app.insight` e `app.metrica_ativo_diaria`, num PR de zona protegida, com a fila livre.
- **Parada:** nada de migração nem tela antes disso.

### Ponto de retomada (05/10/2026, motor completo para o 1.0)

- **PR aberto:** `int-fornecedor`, que não é zona protegida. Conferir com `gh pr checks`, e não mergear sem o Kaio revisar.
- **Esperando:**
  - a aprovação escrita de Cesar e Kaio às propostas de ADR, com as sete decisões do fim do documento;
  - as três migrações da instrumentação no começo da 1b, que são do agente do núcleo.
- **Próximo passo,** depois das aprovações e das migrações: um único PR de zona protegida com os ADRs no `docs/03`, e depois as tabelas `app.insight` e `app.metrica_ativo_diaria`, uma de cada vez, quando a fila de zona protegida estiver livre.
- **Parada:** nada de migração, tela ou PR de zona protegida até lá.

## Cálculo do dia (06/10/2026)

- **#98 mergeado:** o insight, as políticas e a agregação estão na `main`. O #99 corrigiu a auditoria da CI (override do `source-map-js`).
- **Branch `int-dia`**, no worktree `wt/int-motor`. Não é zona protegida: só `packages/inteligencia` e este diário.
  - **`dia.ts` (ADR-036):** `calcularDia` recebe o histórico de um tenant, já lido pelas portas, com as políticas resolvidas por hotel. Devolve:
    - os scores de reincidência e atenção por ativo, com o detalhamento;
    - a linha da métrica diária (`MetricaDiaria`);
    - os sinais sistêmicos;
    - as detecções, cada uma com a chave, a faixa, o alcance, o escopo e os ids de origem, prontas para `decidirDeteccao`.
  - **`horasParadasNoTrecho`** saiu da efetividade para o `historico.ts`, para a atenção usar a mesma conta.
  - **Testes:** 97 no pacote e 319 na raiz.
- **Aprovado por Kaio, aguardando Cesar** (06/10/2026, como sugeridas; o #100 foi mergeado no mesmo dia):
  1. **Tipos de insight no 1.0:**
     - a atenção do ativo, quando passa do limite;
     - o sinal sistêmico.
     A reincidência já é componente da atenção e não abre insight próprio, para o mesmo ativo não ter dois. A substituição fica na tela do ativo.
  2. **Janelas da atenção:** as horas paradas e o impacto no hóspede usam a janela da reincidência do hotel (90 dias no padrão), e o custo informado usa 12 meses.
  3. **Insight sistêmico:**
     - não tem score e entra com a faixa fixa `atencao`, então só reabre depois do descarte quando passarem os 30 dias;
     - vale no hotel quando todas as corretivas são de um hotel;
     - senão, vale na rede: da bandeira, quando os hotéis são todos dela, ou do grupo.

### Ponto de retomada (06/10/2026, cálculo do dia)

- **#100 mergeado,** com as três propostas aprovadas por Kaio, aguardando Cesar.
- **Superado** pelo ponto de retomada seguinte.

## Sem migração, enquanto o núcleo não entra (06/10/2026)

O usuário pediu, em ordem: (a) o caso de uso do job dentro do `packages/inteligencia`, com portas próprias; (b) o mapa das entradas do `calcularDia`; (c) o rascunho local da `app.insight`; (d) a proposta de ponto de extensão nas políticas. Pediu também as opções de retenção da métrica diária. Branch `int-job`, no worktree `wt/int-motor`. Não é zona protegida.

- **(a) Parado, como pedido.** O caso de uso dentro do pacote passaria no lint. A ligação no servidor do web não passa: o lint recusa `@hubkeep/inteligencia` em qualquer elemento do núcleo, inclusive no `apps/web/src/servidor`. Conferido com um arquivo de sonda, já apagado:

  ```
  O núcleo não importa @hubkeep/inteligencia: o módulo depende do núcleo, nunca o contrário  boundaries/dependencies
  ```

  Pela mesma regra, o `packages/db` não pode implementar portas definidas no módulo. A saída que o próprio `eslint.config.mjs` anuncia é uma liberação explícita, descrita na proposta (d). Ela é zona protegida e decisão do Cesar.

- **(b) `docs/referencia/mapa-entradas-calcular-dia.md`.** Achado novo: o `hk_worker` só tem INSERT em `app.auditoria`. A conclusão e as reaberturas da OS, que vêm da auditoria, ficam sem origem para o job. Também ficam sem origem:
  - as chaves `inteligencia.*` no núcleo;
  - o máximo da escala da criticidade;
  - o limite do insight como política;
  - a preventiva, que é da 1b;
  - o módulo contratado por tenant.
- **(c) Rascunho em `rascunhos/insight/`,** fora do git (`.git/info/exclude`) e fora de `supabase/migrations`, sem timestamp. Tem a migração, o pgTAP com os seis casos mínimos e 40 testes, e o `LEIAME.md` com as decisões abertas.
  - **Quem lê:** só quem tem acesso a todos os hotéis do insight (`hotel_ids <@ hoteis_leitura`).
  - **Quem decide:** no insight de hotel, o Admin do grupo, o Gestor CSC e o Gerente; no de rede, o Admin do grupo e o Gestor CSC que cobrem todos os hotéis.
  - **Não rodou:** sem Docker local, só roda na CI do PR.
  - **Ajuste no código:** o `calcularDia` passou a devolver `hotelIds` em cada detecção, com teste de que o escopo e a evidência só citam esses hotéis.
- **(d) `docs/referencia/proposta-extensao-politicas.md`.** Propõe:
  - um registro de extensões por prefixo no domínio do núcleo, montado na composição do web;
  - a resolução pela bandeira;
  - a liberação estreita do lint.

  É ADR do núcleo, então ficou só como proposta, sem nada aplicado.

- **Retenção:** `docs/referencia/retencao-metrica-diaria.md` traz as duas opções sem escolher: (A) partição mensal removida por operação do responsável; (B) só limitar a leitura a 12 meses.
- **As três regras do cálculo do dia:** aprovadas por Kaio, aguardando Cesar. Entram no `docs/03` com o PR da `app.insight`.

### Ponto de retomada (06/10/2026, sem migração)

- **#102 mergeado.** Superado pelo ponto de retomada seguinte.

## Decisões de retenção, recálculo e insight de rede (06/10/2026)

Decisões de Kaio, registradas a pedido dele. As que mudam ADR do Intelligence ficam como "aprovado por Kaio, aguardando Cesar".

1. **Retenção da `app.metrica_ativo_diaria`:** opção B, com janela de 60 dias.
   - Telas e consultas leem só os últimos 60 dias.
   - O valor é uma política configurável. A chave proposta é `inteligencia.metrica_janela_leitura`, no rascunho.
   - Nada é apagado.
   - Muda o "12 meses" do ADR-036: aprovado por Kaio, aguardando Cesar, até o conflito com o ADR-033 ser resolvido.
   - No PR da tabela, o padrão de 12 meses do `limiteDeRetencao` e o texto do ADR-036 dão lugar à janela de 60 dias. A redação está em `rascunhos/metrica/LEIAME.md`, local.
2. **Recálculo:** o resultado gravado de cada dia é a fonte de verdade do histórico e guarda a configuração usada.
   - Recalcular um dia passado usa os valores atuais da origem e não reproduz exatamente o que foi gravado.
   - A limitação está registrada no comentário do `calcularDia` e no `LEIAME.md` do rascunho do insight.
   - Confirmado: o insight guarda a própria evidência e não depende da métrica diária.
   - Confirmado: nenhuma regra aprovada lê a métrica diária além de 60 dias. O custo informado de 12 meses vem da OS.
3. **Hotel novo num insight de rede:** o job encerra o insight e abre outro, ligado pelo `anterior_id`. `hotel_ids` continua sem UPDATE. Registrado no rascunho da migração e no `LEIAME.md`.
4. **As três regras do cálculo do dia** ficam como estão (aprovado por Kaio, aguardando Cesar) até o Cesar resolver o conflito entre o ADR-033 e o registro de 30/09/2026. O `CLAUDE.md` hoje pede a aprovação escrita de Cesar **e** de Kaio.

### Pedidos ao núcleo (para o Cesar)

1. **Conclusão e reaberturas da OS com data, lidas pelo `hk_worker`.**
   - Hoje elas só existem na `app.auditoria`, que o worker não lê. Decisão de Kaio: o worker não ganha leitura da auditoria.
   - O pedido é que a própria OS (ou uma tabela do núcleo) guarde a conclusão e cada reabertura com data, gravadas pela unit of work.
   - A forma é decisão do núcleo.
2. **A liberação estreita do lint** para a composição do web chegar ao `@hubkeep/inteligencia` (`docs/referencia/proposta-extensao-politicas.md`).
3. **O ponto de extensão das políticas,** com a resolução pela bandeira (mesma proposta).

### Ponto de retomada (06/10/2026, decisões registradas)

- **Rascunhos locais,** fora do git, em `wt/int-motor/rascunhos/`:
  - `insight/`: migração, pgTAP e `LEIAME.md`;
  - `metrica/`: `LEIAME.md` com a troca do `limiteDeRetencao` e o texto novo do ADR-036.
- **Esperando o Cesar:**
  - os três pedidos acima;
  - o conflito de aprovação entre o ADR-033 e o registro de 30/09/2026.
- **Esperando o núcleo:** as três migrações da instrumentação.
- **Próximo passo:** depende do núcleo.
- **Parada:** nada de migração, tela, caso de uso do job ou PR de zona protegida até lá.