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

- **Superado** pela entrada seguinte. Os rascunhos foram para o branch `int-rascunhos`, que nunca vira PR. O worktree dele é `wt/int-rascunhos`.

## Pauta atualizada com o diário do núcleo (06/10/2026)

O Kaio pediu para ler o fim do `docs/diario-fase-1a.md` (decisões de 05 e 06/10) antes de seguir. A pauta deste diário estava desatualizada.

- **Revogação:** o registro de 05/10, na sessão deste agente, que aceitava a aprovação de um só para os ADRs do Intelligence, foi revogado pelo Cesar em 06/10/2026. A regra é a de 30/09: Cesar **e** Kaio, agora no `CLAUDE.md` (#105). Os ADR-033 a 037 e as três regras do #101 aguardam o Cesar.
- **Já na `main`:**
  - #105: regra dos dois agentes;
  - #106: `registroDePoliticas`, com extensão de módulo;
  - #108: liberação estreita no lint e `montarInteligencia`.
- **Aprovados pelo Cesar, entram no começo da 1b** (etapa I do `docs/12`), depois do teste do kit:
  - I1: criticidade de 1 a 5;
  - I2: chamado e OS;
  - I3: `app.os_transicao`;
  - I4: códigos de manutenção;
  - I5: `licenca.modulo`.
- **Os pedidos ao núcleo de 06/10 estão respondidos:**
  - a conclusão e as reaberturas vêm de `app.os_transicao` (I3);
  - a liberação do lint é o #108;
  - o ponto de extensão é o #106, com a bandeira na 1c.

### Recados do agente do núcleo, feitos neste PR

- **Resolução de políticas:** o módulo não tem mais resolução própria. Sai o `resolverPoliticaDoIntelligence`, e entra a `EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE` para o `registroDePoliticas`. O registro em `montarInteligencia` só entra com o filtro por módulo contratado (I5).
- **`ehChaveDePoliticaDoIntelligence`** usa `Object.hasOwn`, assim como o formato das chaves, para recusar `toString`.
- **Limite do insight:** virou o campo `limiteInsight` da `inteligencia.atencao_ativo`, com padrão 70 e de 0 a 100. O `calcularDia` lê o limite da política do hotel, e a entrada `limiteInsight` saiu.
- **Criticidade:** fixa de 1 a 5 (`Criticidade`, `CRITICIDADE_MAXIMA` e `ehCriticidade`), sem o máximo da política.
- **Transições da OS:** `conclusaoEReaberturas` deriva a conclusão e as reaberturas das transições até a data do cálculo. Assim o recálculo de um dia passado vê a OS como ela estava. Os nomes das colunas vêm no aviso do fim da etapa I.
- **Mapa das entradas** revisto com as tarefas I1 a I5.
- **Testes:** 107 no pacote.

### Janela de leitura revista: 180 dias

- **O que mudou:** o Kaio reviu a decisão de 60 dias. A janela precisa comportar a efetividade do PRD, que compara 90 dias antes com 90 dias depois, então o mínimo é 180.
  - Padrão e mínimo: 180 dias.
  - Política proposta: `inteligencia.metrica_janela_leitura`.
- **ADR-035 e ADR-036 revistos** num PR do `docs/03`, que é zona protegida. Ambos ficam como "aprovado por Kaio, aguardando Cesar".
  - **ADR-035:** a sexta chave, o limite do insight, a criticidade de 1 a 5 e a resolução pelo registro.
  - **ADR-036:** nada apagado, a janela de 180 dias, o limite do recálculo e a pendência de particionamento da métrica diária.
- **O rascunho do PR da tabela** (`int-rascunhos`) passa a usar 180 dias.

### Decisões de Kaio sobre o insight de rede, a janela e o recálculo (06/10/2026)

1. **Hotel novo num insight de rede: opção (c).** Aprovado por Kaio, aguardando Cesar. Substitui a decisão 3 anterior, em que o job encerrava o insight, porque ela conflitava com o ADR-033.
   - O job abre o insight novo, ligado ao anterior pelo `anterior_id`.
   - O anterior continua aberto até uma pessoa resolver ou descartar.
   - O job não muda estado (ADR-033), e `hotel_ids` continua sem UPDATE (ADR-011).
   - Na tela e na API, o anterior aparece como "substituído pelo insight X", calculado pelo vínculo. O descarte aceita o motivo "substituído". Não há estado novo.
   - **Implementação parada: a unicidade colide.**
     - O índice do rascunho é `(tenant_id, chave) where encerrado_em is null`, e a chave do sinal sistêmico não leva os hotéis.
     - O novo e o anterior teriam a mesma chave abertos ao mesmo tempo. Além disso, o `decidirDeteccao` atualizaria o anterior em vez de abrir outro.
   - **Proposta para o Cesar, com os ajustes do Kaio:** aprovado por Kaio, aguardando Cesar. O detalhe está no `LEIAME.md` do rascunho (`int-rascunhos`, `00797ab`).
     - **Chave com hash:** a `chave` é a família mais o SHA-256 do conjunto de hotéis em ordem canônica, e não a lista. O btree não aceita entrada acima de cerca de 2,7 KB, e a lista estoura com uns 70 hotéis. `hotel_ids` guarda a lista completa.
     - **Família:** a coluna `familia` é a chave sem os hotéis, com índice próprio e checks de prefixo e tamanho.
     - **Regra pela família no `decidirDeteccao`:**
       - se o conjunto novo está contido no de um insight aberto da mesma família (saiu hotel, ou nada mudou), não há nada a fazer;
       - se tem hotel a mais, o job abre um insight novo, ligado ao anterior, e o anterior fica aberto até uma pessoa decidir.
     - **Silêncio de 30 dias pela família,** só quando o descarte for "não relevante". O descarte "substituído" não silencia. O motivo é canônico (`nao_relevante` ou `substituido`).
     - **pgTAP:** 50 testes no rascunho, com o novo e o anterior abertos juntos e um insight de 80 hotéis.
     - **O hash no domínio puro:** proposta de um SHA-256 em TypeScript, sem dependência, testado contra os vetores do NIST e o `sha256()` do Postgres. Fica para o PR do código.
2. **Validação entre chaves no ADR-035** (#113, mesmo status): a `inteligencia.metrica_janela_leitura` precisa ser pelo menos o dobro da `janelaDias` da `inteligencia.efetividade`, no mesmo escopo.
   - A validação é do módulo, ao gravar qualquer uma das duas.
   - O job também confere na leitura: se a janela resolvida for menor que o dobro, usa o dobro e registra um aviso de configuração.
3. **Limitação do recálculo, texto atualizado** no comentário do `calcularDia`, no ADR-036 (#113), no documento de retenção e no rascunho.
   - A conclusão e as reaberturas são reproduzidas pelas transições da OS.
   - Só os campos editáveis e a política vigente ficam com o valor atual.
4. **Regra de comandos:** comandos que dependem um do outro nunca são ligados por `;`. Ou usam `&&`, ou o passo para na primeira falha.
   - Vale para qualquer comando, não só os que alteram arquivos.
   - **Motivo:** em 06/10 um `git worktree add` falhou e o `git switch` seguinte rodou mesmo assim. Não houve dano, porque os rascunhos já estavam enviados.

### "Por que estou vendo isso?" no catálogo (ADR-034)

- **`explicacao.ts`:**
  - `explicacaoDoScore` transforma os motivos do score (`motivosDoScore`) em chave de catálogo `inteligencia.motivo.<score>.<componente>`, com os números e textos da evidência. Ids e listas ficam de fora;
  - `chaveDoNomeDoScore` e `chaveDaFaixa` dão as chaves do nome do score e da faixa.
- **Catálogos:** 26 chaves `inteligencia.*` nos quatro idiomas:
  - o título e o vazio da explicação;
  - os nomes dos dois scores e as seis faixas;
  - os 12 motivos;
  - os tipos, estados e ações do insight;
  - as regras do sistêmico.

  O custo sai em reais (`::currency/BRL`), como a versão mínima de custo decidida pelo Cesar.
- **`@hubkeep/i18n`** entrou como dependência de desenvolvimento do pacote, só para o teste formatar cada motivo com o tradutor real nos quatro idiomas. O código do motor continua sem importar o i18n.
- **Testes:** 115 no pacote.

### Ponto de retomada (06/10/2026, pauta atualizada)

- **Superado** pela entrada de 07/10/2026, abaixo.

## Atividades de 07/10/2026

O Kaio pediu para seguir a pauta do agente do núcleo (`docs/diario-fase-1a.md`, 07/10/2026). Branch `int-job-diario`, no worktree `wt/int-motor`. Não é zona protegida.

### Aprovações do Cesar, registradas (07/10/2026)

- **Aprovados pelos dois** (Kaio em 05 e 06/10, Cesar em 07/10), sem condição:
  - ADR-033, ADR-034 e ADR-037;
  - ADR-035, com a revisão de 06/10 (janela de leitura de 180 dias e validação entre chaves);
  - o adendo ao ADR-026 (extensão por módulo e liberação no lint);
  - as três regras do cálculo do dia (#101), que entram no `docs/03` com o PR da `app.insight`.
- **ADR-036, aprovado pelo Cesar com uma condição.** Cada resultado diário grava a versão da política e a da fórmula usadas, e um recálculo fica marcado como recálculo, com a versão nova.
- **Hotel novo num insight de rede, aprovado pelo Cesar com uma condição.** O hash da lista de hotéis é calculado fora do `packages/inteligencia` (no job, com `node:crypto`, ou no banco, com `sha256()`), a função pura devolve só a lista canônica, e nada de SHA-256 escrito à mão.
- **Aceite do Kaio às duas condições:** em 07/10/2026, ao pedir que o agente as aplicasse. Elas estão aplicadas (abaixo). O Kaio pode corrigir este registro.
- **Texto literal da aprovação do Cesar** (colado pelo usuário no chat deste agente em 09/10/2026, sem alteração). Canal: o Documento do projeto do Cesar no claude.ai, seção "Registro de decisões da revisão". Dia: 07/10/2026. Canal e dia informados pelo Kaio em 09/10/2026:

  > “Eu, Cesar, aprovo o ADR-033 a 037, o adendo ao ADR-026 e as três regras do #101, com as duas condições: o resultado diário grava a versão da política e da fórmula, com o recálculo marcado; e o hash do insight de rede é calculado fora da função pura.”

  As duas condições do texto são as do ADR-036 (versão da política e da fórmula no resultado diário, recálculo marcado) e a do hash do insight de rede, ambas registradas acima e já aplicadas.
- **Texto literal do aceite do Kaio às duas condições** (passado pelo Kaio ao agente em 09/10/2026, sem alteração):

  > "Eu, Kaio, aceito as duas condições do Cesar de 07/10: o resultado diário grava a versão da política e da fórmula, com o recálculo marcado; e o hash do insight de rede é calculado fora da função pura."
- **Superado:** a proposta de um SHA-256 próprio no TypeScript, que estava no rascunho. Saiu.

### O que ficou fora do merge, e foi recolocado

Os #112 e #113 foram mergeados antes dos meus últimos envios a esses branches. Não chegaram à `main`:
- **Neste PR, trazidos por cherry-pick:** o `explicacaoDoScore` e as 26 chaves de catálogo (`0a130ca`) e o diário de 06/10 (`54c7614`). Por isso o `docs/referencia/HubKeep — Documento do projeto.md` diz que o detalhamento nos quatro idiomas está na `main`, e ainda não estava.
- **Só no `docs/03`, zona protegida, sem PR:** o texto do ADR-035 sobre a validação entre chaves e a conferência na leitura (`a3dfab8` e `519095e`). Ver "Pendente para o Cesar".

### Condições do Cesar aplicadas

1. **ADR-036: versões e recálculo.**
   - `LinhaDaMetricaDiaria` (`agregacao.ts`): além dos scores, `versaoFormulaReincidencia`, `versaoFormulaAtencao`, `versaoPolitica`, `recalculo` e `calculo`. As versões da fórmula vêm do próprio `Score.versao`. A da política é o texto que a ligação do servidor monta com as linhas de `app.politica` que resolveram (`HotelDoDia.versaoPolitica`), ou `padrao`.
   - Um recálculo é outra linha, com o número de cálculo seguinte e a marca. O recálculo de um dia nunca gravado entra com o cálculo 1 e a marca. A agregação mensal usa o cálculo de maior número de cada dia.
   - `fimDoDia(dia)` dá o `agora` para recalcular um dia passado.
   - Rascunho da `app.metrica_ativo_diaria` e do pgTAP (28 testes) no branch `int-rascunhos`.
2. **Hash fora da função pura.**
   - `listaCanonicaDeHoteis` devolve a lista (sem repetição, em ordem); `familiaDoInsight` monta a família. O `decidirDeteccao` compara conjuntos de hotéis, e não hashes.
   - A chave de unicidade (`familia|hoteis=<sha256>`) é montada por quem grava. A escolha é o `node:crypto` na ligação do servidor, e o banco confere o formato. O pgTAP confere o `sha256()` do banco com o mesmo vetor do `node:crypto`.
   - Rascunho da `app.insight` (52 testes, um deles com 80 hotéis) atualizado no `int-rascunhos`.

### A regra pela família e o motivo do descarte, no motor

- `decidirDeteccao` agora decide pela família: mesmo conjunto atualiza; conjunto contido num aberto, nada a fazer; hotel a mais abre um insight novo, ligado ao anterior, que fica aberto. Silêncio de 30 dias pela família só depois do descarte "não relevante".
- `decidirNoInsight` exige o motivo do descarte (`nao_relevante` ou `substituido`), com o erro `motivo_de_descarte_invalido`. `substituidoPor` calcula o "substituído pelo insight X" pelo vínculo.
- **Pendente:** o texto do ADR-033 no `docs/03` ainda descreve a primeira versão ("o job encerra o insight e abre outro"), que conflita com "o job nunca muda estado". O Cesar aprovou o hotel novo com a condição do hash, mas sobre esse texto. É preciso confirmar com ele que a aprovação vale para a variante (c).

### Os dados novos da revisão de 07/10

- **Fornecedor como tabela:** `ExecutadoPor` passou a `equipe_interna | fornecedor`; `Corretiva.fornecedorId` no lugar de `terceiroNome`; a regra do mesmo fornecedor agrupa pelo id (`fornecedorDaOs`). Sai a comparação de nomes normalizados. **Os nomes das colunas do núcleo ainda não saíram no diário dele:** `fornecedorId` e `fornecedor` são os nomes do motor, e a ligação do servidor adapta.
- **UH indisponível:** proposta em `docs/referencia/proposta-uh-indisponivel-intelligence.md`, para aprovação. Recomendação: sinal próprio, e não componente da atenção. Só a medida está escrita (`uhDiasPerdidos`, em `uh.ts`); nenhum score a usa.
- **Modelo contratual do hotel:** registrado como dimensão das comparações de rede da 2.0, no mapa das entradas. Nada implementado.

### Janela de leitura e a sexta chave

- `inteligencia.metrica_janela_leitura` (`{ dias }`, de 180 a 730) em `politicas.ts`.
- `validarJanelaDeLeitura` recusa, ao gravar qualquer das duas janelas, a de leitura menor que o dobro da efetividade (`janela_de_leitura_curta`). `janelaDeLeituraEfetiva` devolve o dobro e o aviso de configuração quando a janela resolvida ficou curta.
- `inicioDaJanelaDeLeitura` e `JANELA_DE_LEITURA_PADRAO_DIAS` (180) substituem o `limiteDeRetencao` de 12 meses, que saiu.
- **O job ainda não confere a janela:** quem lê a métrica (telas e consultas) usa `janelaDeLeituraEfetiva` e registra o aviso. O job diário não lê a janela.

### O job diário em código puro

`executarDiaDoTenant` (`job.ts`), com a leitura e a gravação por portas (`FonteDoJob` e `GravacaoDoJob`), e as implementações em memória nos testes (`test/apoio-job.ts`):
- lê, calcula o dia (`calcularDia`), grava as métricas e decide cada detecção (`decidirDeteccao`);
- a conclusão e as reaberturas saem das transições da OS até o dia calculado (`conclusaoEReaberturas`);
- rodar duas vezes no mesmo dia não duplica a métrica, e o insight já aberto só é atualizado; o job nunca muda o estado de um insight;
- o recálculo só grava métrica, com o cálculo seguinte e a marca, e não abre nem atualiza insight;
- o banco em memória faz a unicidade de um aberto por chave, e o hotel novo abre o insight novo, ligado ao anterior, com os dois abertos.

A ligação com o `packages/db` fica no servidor do web (`apps/web/src/servidor/modulos/inteligencia/`), depois das tabelas.

### Proposta das telas do 1.0

`docs/referencia/proposta-telas-intelligence-1-0.md`, com as imagens em `docs/referencia/design/intelligence-1-0/` (lista de insights, painel de investigação e detalhe do ativo, nos dois temas e em largura de celular), geradas por uma vitrine descartável com o `packages/ui` e dados fictícios. O código da vitrine está no `int-rascunhos` (`rascunhos/telas-vitrine/`). Aguarda a aprovação do Cesar e do Kaio.

### Pendente para o Cesar (zona protegida, sem PR)

O branch `int-adr-aceite` (sem PR) corrige o `docs/03` para o estado real:
- **ADR-033:** o hotel novo como variante (c), a família e a chave, o motivo do descarte e a condição do hash aceita;
- **ADR-035:** a validação entre chaves e a conferência na leitura (o que ficou fora do #113);
- **ADR-036:** o aceite do Kaio à condição e o que foi gravado em cada linha.

Só abre depois da fila de zona protegida (a etapa I da 1b). O status de cada trecho novo fica "aprovado por Kaio, aguardando Cesar".

### Ponto de retomada (07/10/2026)

- **PR aberto:** `int-job-diario`, que não é zona protegida. Conferir com `gh pr checks`; o merge é do usuário.
- **Esperando o Cesar:**
  - a confirmação de que a aprovação do hotel novo vale para a variante (c);
  - a decisão sobre os UH-dias (sinal próprio ou componente);
  - a aprovação das três telas;
  - o aviso, no diário dele, dos nomes das colunas novas (fornecedor, UH indisponível, transições e demais).
- **Esperando o núcleo:** as migrações da etapa I da 1b.
- **Próximo passo:** quando a etapa I terminar, trocar os campos "(fase A)" do `historico.ts` pelos nomes reais, e abrir a `app.insight` (depois a `app.metrica_ativo_diaria`) a partir do `int-rascunhos`, uma de cada vez, com a ligação do job no web.
- **Parada:** nada de migração, tela ou PR de zona protegida até lá.

## Decisões de 07/10/2026 sobre a fila, os nomes, os UH-dias e o painel

Instruções do Cesar (pauta de 07/10/2026, depois do merge do #125).

### Fila e nomes
- **`int-adr-aceite` fica fechado** até o PR da instrumentação entrar na `main`: a etapa I tem prioridade na fila de zona protegida.
- **Os nomes provisórios ficam** (`fornecedorId`, `executadoPor`, `transicoes`). Quando cada migração da etapa I entrar na `main`, os nomes são ajustados num PR fora de zona protegida.

### UH-dias: componente da atenção do ativo (aprovado por Kaio, aguardando Cesar)
- Os UH-dias perdidos são **componente da atenção do ativo**, e não sinal próprio. O **peso fica 0** até existir a origem do dado de UH indisponível; com peso 0, a fórmula e a versão dela não mudam.
- Isso troca a recomendação que o agente do Kaio tinha feito (sinal próprio). As objeções dela seguem como pendência de desenho para a versão da fórmula em que o peso deixar de ser 0: a UH parada sem ativo cadastrado, e a conta em dobro com a parada do ativo (15%) e o impacto no hóspede (20%).
- Registrado em `docs/referencia/proposta-uh-indisponivel-intelligence.md`. Nada mudou no código: `uhDiasPerdidos` continua só como medida.

### O que o painel mostra (aprovado por Kaio, aguardando Cesar)
- O painel mostra o **resultado original gravado de cada dia**. O recálculo com a política atual aparece só no painel de investigação, sob demanda e identificado como recálculo.
- Isso troca a escolha do rascunho (cálculo de maior número). O rascunho da `app.metrica_ativo_diaria` e o LEIAME foram atualizados no `int-rascunhos` (`e87d5d8`). A tabela não muda: muda a agregação e a consulta.
- **Pendência de código:** `agregarMesDosAtivos` ainda escolhe o maior `calculo` do dia. Passa a escolher o original quando o painel for ligado (e uma consulta do recálculo, sob demanda, no painel de investigação). Não mexi no motor nesta rodada.

### Ponto de retomada
- Esperando o Cesar: a confirmação de que o hotel novo vale na variante (c), as três telas e as seis decisões da proposta, e a confirmação das duas decisões acima.
- Esperando o núcleo: as migrações da etapa I; depois, o ajuste dos nomes e as tabelas do Intelligence, uma de cada vez.

## Alinhamento do motor com o mock (08/10/2026)

### A aprovação do Cesar
- **Quando e por onde:** o Cesar aprovou **por escrito, em 08/10/2026**, as três propostas do alinhamento do motor com o mock oficial (identidade oficial, ADR-038): atenção v2, efetividade sem linguagem de causa e padrão sistêmico com os mínimos do mock. O Kaio passou a aprovação ao agente na pauta de 08/10. Canal: **[a preencher com o canal do Cesar]**.
- **Texto do Cesar** (passado pelo Kaio ao agente em 09/10/2026, sem alteração):

  > Eu, Cesar, aprovo em 08/10/2026: a atenção por ativo versão 2, com os oito componentes e os pesos padrão propostos; a efetividade sem linguagem de causa, com os limiares e o mínimo de 3 chamados antes; o padrão sistêmico do 1.0 só com a regra do mesmo modelo e os mínimos de 3 hotéis, 6 chamados em 90 dias e 5 ativos; e o mock de apresentação como mock oficial único na main.

  Nota do agente: o texto fala em "oito componentes", como a pauta de 08/10; a lista de pesos da pauta, e o motor, têm nove, porque os UH-dias entram com peso 0 e sem dado. A leitura aplicada é a da lista de pesos. **[a confirmar com o Cesar]**
- **A análise que originou o alinhamento** (08/10/2026): a tabela componente a componente entre o mock e o motor da `main`. Os números do mock eram: atenção com cinco componentes (reincidência 35, indisponibilidade 25, criticidade 20, medições fora da faixa 10, garantia vencida 10); efetividade por razão depois ÷ antes (40% e 75%); padrão sistêmico com 3 hotéis, 6 chamados em 90 dias e taxa de pelo menos o dobro da base (mínimo 0,3).

### O que foi aprovado, por área, e onde entra
1. **Atenção v2** (`VERSAO_ATENCAO` 2): pesos padrão reincidência 20, tempo parado 15, impacto no hóspede 15, criticidade 15, custo informado 10, preventiva atrasada 10, medições fora da faixa 10, garantia vencida 5 e UH-dias 0. PR `int-atencao-v2` (este).
2. **Efetividade, versão nova**, com os limiares na política: redução de 60% ou mais = redução observada; de 25% a 60% = redução parcial; de −25% a +20% = sem mudança relevante; aumento de 20% ou mais = aumento observado; menos de 3 chamados antes = sem base de comparação; menos de 90 dias depois = janela incompleta. PR `int-efetividade-v2` (aberto, empilhado sobre o `int-atencao-v2`).
3. **Padrão sistêmico, versão nova**: mínimos na política de 3 hotéis, 6 chamados em 90 dias e 5 ativos; taxa de pelo menos o dobro da base, com mínimo de 0,3; base = chamados por ativo da mesma categoria, nos outros modelos do tenant, em 90 dias; só a regra do mesmo modelo ligada por padrão, e as outras quatro desligadas por política. PR `int-sistemico-v2` (a abrir).
4. **Adendos ao ADR-034 e ao ADR-036:** texto no `int-rascunhos`; entra no PR `int-adr-aceite`, depois das migrações da instrumentação. Os ADR continuam como estão no `docs/03` até lá.
5. **Não mexer no `csc-mock`.** O Cesar traz a versão de apresentação para a `main`; depois, a tela do Intelligence no mock é atualizada para as fórmulas novas, num PR separado.

### Atenção v2: o que o PR faz e as escolhas que a pauta deixou abertas
- **Garantia** entra no `AtivoAnalisado` (`garantiaAte`, de `app.ativo.garantia_ate`, I1). O componente vale 1 quando a garantia venceu, 0 dentro dela, e fica **sem dado** sem a data. A data de fim vale até o fim do dia (UTC) e vence no seguinte.
- **Medições fora da faixa** ficam como componente **sem dado** até o checklist tipado (P1). A entrada é `{ foraDaFaixa, total }` e o valor é a fração fora da faixa (sem limite novo para configurar). **Escolha minha, a confirmar:** a pauta não define como a medição vira número; a fração é a que não inventa parâmetro. Se o Cesar preferir uma contagem com limite, é versão nova da fórmula.
- **Preventiva atrasada** substitui "preventiva ou compliance": a chave do componente passa a `preventiva_atrasada` e a entrada a `preventivaAtrasada`. Continua sem dado até a etapa P.
- **UH-dias** é componente com peso 0 e sem dado, sem limite configurado (decisão de 07/10): nada muda no score. Quando a origem existir e o peso passar de 0, é a versão seguinte, com o limite e os pesos definidos.
- **O peso sem dado, "para o tenant inteiro":** entendi como regra única, a mesma em todo o tenant e sem chave por hotel: o peso do componente sem dado é dividido entre os que têm dado, na proporção dos pesos, ativo a ativo, como já era. **A confirmar com o Cesar:** se ele quis dizer outra coisa (por exemplo, o componente sem dado em todo o tenant ser tratado igual para todos os ativos), é outro desenho e muda este PR.
- **O detalhamento** (`detalhamentoDoScore`) devolve uma linha por componente, com o "sem dado", o peso configurado, o peso usado e a chave do aviso de redistribuição. O texto sai do catálogo (`inteligencia.componente.atencao_ativo.*`, `inteligencia.detalhamento.sem_dado` e os três motivos novos), nos quatro idiomas.
- **A política `inteligencia.atencao_ativo`** muda de formato (os nomes dos pesos), e não ganha chave nova: o formato é o de uma chave por score (ADR-035). Nada está gravado ainda (as tabelas e o registro no web entram na 1b), então não há valor antigo a migrar. O resultado gravado de cada dia continua com a versão da fórmula que o calculou.

### Efetividade v2: o que o PR faz e as leituras que fiz da pauta
- **Versão 2** (`VERSAO_EFETIVIDADE` 2), gravada no resultado (`Efetividade.versao`). A política `inteligencia.efetividade` passa a ter: `janelaDias` 90, `reducaoObservadaPercentual` 60, `reducaoParcialPercentual` 25, `aumentoObservadoPercentual` 20 e `minChamadosAntes` 3. O campo `limiarPercentual` da v1 sai; não há valor gravado.
- **Resultados**, pela variação dos chamados (`depois` contra `antes`): redução de 60% ou mais = `reducao_observada`; de 25% a menos de 60% = `reducao_parcial` (novo); de mais de −25% a menos de +20% = `sem_mudanca_relevante`; aumento de 20% ou mais = `aumento_observado`; menos de 3 chamados antes = `sem_base_de_comparacao`; menos de 90 dias depois = `janela_incompleta`.
- **Pontas:** os limiares incluem o valor (60% e 25% de redução e +20% de aumento já entram na faixa de cima), como "60% ou mais", "de 25% a 60%" e "20% ou mais" da pauta. A variação usada é a arredondada em 0,1, a mesma que a tela mostra.
- **Ordem das regras:** `janela_incompleta` vale primeiro (o depois ainda está se formando, então o resultado não é final), depois `sem_base_de_comparacao`. Escolha minha, a confirmar: a pauta não diz qual vence quando os dois valem.
- **A política é validada ao gravar:** a redução parcial precisa ficar acima de 0 e abaixo da observada, a observada não passa de 100%, o aumento é positivo, a base mínima e a janela são inteiras e de pelo menos 1. Sem isso o resultado poderia ser contraditório. A conferência com a janela de leitura (o dobro da janela da efetividade) segue como estava.
- **Sem linguagem de causa:** os rótulos novos (`inteligencia.efetividade.*`, nos quatro idiomas) dizem "redução observada", "redução parcial" e "sem mudança relevante", com a ressalva "não prova que a intervenção foi a causa". Um teste reprova, em qualquer idioma, texto da efetividade com "resolveu", "causou" e equivalentes (a ressalva fica de fora, porque nega a causa).


### Padrão sistêmico v2: o que o PR faz e as leituras que fiz da pauta
- **Versão 2** (`VERSAO_SISTEMICO` 2), gravada em cada sinal. A política `inteligencia.sistemico` ganha o booleano `ativa` em cada regra, e o mesmo modelo ganha `minHoteis` 3, `minChamados` 6, `minAtivos` 5, `janelaDias` 90, `taxaMinimaVezesBase` 2 e `taxaMinima` 0,3.
- **Só o mesmo modelo vem ligado** por padrão. Mesmo andar, área comum, mesmo fornecedor e crescimento ficam desligados (`ativa: false`), com os parâmetros que já tinham, e o grupo liga as que quiser pela política.
- **O mesmo modelo agrupa por categoria, fabricante e modelo, sem a falha** (como no mock). O escopo do insight muda de `{ modelo, falha }` para `{ categoriaId, modelo }`, e a família do insight muda junto; não há insight gravado ainda. Isso troca o que o motor fazia antes (modelo e falha). As outras quatro regras continuam agrupando pela falha.
- **Os mínimos:** hotéis distintos com chamado do modelo, chamados do modelo na janela e ativos distintos com chamado. Os três valem juntos.
- **A taxa contra a base:** a taxa do modelo é chamados por ativo instalado do modelo, em 90 dias; a base é a mesma conta nos outros modelos da mesma categoria, no tenant. O sinal só sai se a taxa for de pelo menos o dobro da base, e nunca menos que 0,3.
- **Leituras minhas, a confirmar:**
  - "ativo instalado" são todos os ativos do modelo que o motor recebe (com ou sem chamado), no escopo dos hotéis do cálculo;
  - o ativo sem categoria, fabricante ou modelo fica fora da conta, inclusive da base, porque não se sabe se é o mesmo modelo;
  - sem outros modelos na categoria (ou sem chamado neles), a base é 0 e vale só o mínimo de 0,3;
  - "3 hotéis" são os hotéis em que houve chamado do modelo na janela, e não os hotéis onde ele está instalado.
- **A evidência do sinal** ganha `ativosDoModelo`, `taxaPorAtivo` e `basePorAtivo`; o rótulo `inteligencia.sistemico.regra` do mesmo modelo deixa de falar em "mesma falha", e a mensagem `inteligencia.sistemico.evidencia.mesmo_modelo` mostra a taxa contra a base, nos quatro idiomas.
- **A política é validada ao gravar:** mínimos e janelas inteiros de pelo menos 1; razão contra a base positiva; `ativa` obrigatório e booleano.

### Ponto de retomada (08/10/2026)
- **PRs abertos, empilhados** (fora de zona protegida; o merge é do usuário, nesta ordem): #142 atenção v2 → #144 efetividade v2 → #145 padrão sistêmico v2. Conferir com `gh pr checks`.
- **Esperando o Kaio:** o canal e o texto literal da aprovação do Cesar, para o campo "A aprovação do Cesar" acima (o diário sai do #142 com os dois campos em aberto). O texto chegou em 09/10/2026; o canal ainda não.
- **Esperando o Cesar:** as confirmações listadas nos PRs (medições como fração; "tenant inteiro"; ordem entre janela incompleta e sem base; leituras do mesmo modelo; "a versão 1 nunca foi gravada").
- **Pronto, no `int-rascunhos` (`1deab5f`):** o texto dos adendos ao ADR-034 e ao ADR-036 (`rascunhos/adr/adendos-adr-034-e-036.md`). Entra no `int-adr-aceite`, depois das migrações da etapa I.
- **Fora do escopo, por instrução:** o `csc-mock` não foi tocado. Quando o Cesar trouxer a versão de apresentação, a tela do Intelligence no mock é atualizada para as fórmulas novas, num PR separado.
- **Esperando o núcleo:** as migrações da etapa I; depois, o ajuste dos nomes provisórios e as tabelas do Intelligence, um PR de zona protegida de cada vez.

### A tela do Intelligence no mock, com o padrão sistêmico v2 (08/10/2026)
- O mock oficial já trazia a atenção v2 e a efetividade v2 (PR #147 do agente do núcleo), mas o padrão sistêmico estava na v1: o mesmo modelo agrupava por modelo e falha, e as cinco regras apareciam ligadas. Este PR leva a tela para a v2: só o mesmo modelo ligado por padrão (3 hotéis, 6 chamados em 90 dias, 5 ativos, taxa contra a base, dobro e mínimo de 0,3), as outras quatro com `ativa: false` na política do seed, e o texto do sinal igual ao do catálogo.
- A versão do cache local do mock sobe para 8, porque a política do seed mudou de formato. Conferido no navegador: com os dados do seed, a tela mostra um sinal (Midea Split Inverter, 29 chamados em 17 ativos de 6 hotéis, 1,26 por ativo contra 0,1) e nenhum erro de script.
- Diferença conhecida, só de demonstração: a garantia no mock vence no instante da data; no motor, no dia seguinte (UTC). Não muda nenhum número da tela.

## Etapa I na `main`: conferência dos nomes do motor (09/10/2026)

Depois do merge do #148, conferi o `historico.ts` e o mapa das entradas contra as migrações que o núcleo já pôs na `main` (I1, I2, I3 e I5). PR fora de zona protegida; só comentários e documentação, nenhuma linha de lógica mudou.

### O que entrou na `main` e o que o motor lê
- **I1 (0030), ativo:** `app.ativo.data_compra`, `garantia_ate` e `criticidade` (1 a 5). O motor já usa `garantiaAte` e `criticidade` com esses nomes. Nada a trocar.
- **I5 (0031), transições da OS:** `app.os_transicao` com `acao`, `de`, `para`, `quando` e `usuario_id`; o `hk_worker` lê no tenant do job. O `TransicaoDaOs` (`acao`, `para`, `quando`) já bate com as colunas, então o nome `transicoes` fica. O motor não usa `de` nem `usuario_id`.
- **I2 (0032), hotel e local:** `app.hotel.modelo_contratual` (nulo é "não informado"; valores em `MODELOS_CONTRATUAIS` do domínio) e `app.local.edificacao`. O motor 1.0 não os carrega: o modelo contratual continua registrado como dimensão das comparações de rede da 2.0.
- **I3 (0033), fornecedor:** `app.fornecedor` do grupo. O `hk_worker` **não** tem SELECT nela, e o motor só precisa do id (`fornecedorId`), que virá da OS. Nenhum pedido ao núcleo por enquanto.

### O que continua provisório
- `executadoPor`, `fornecedorId` e o período de UH indisponível dependem da **I4** (chamado e OS), que ainda não está na `main`. Os nomes ficam como estão até ela entrar. O mesmo vale para `custoInformado` e `impactoHospede`, que seguem os nomes das propostas, ainda sem coluna na `main`.
- `codigoFalha` espera a I6; o filtro por módulo e o registro da extensão de políticas, a I7.

### O que mudou neste PR
- **Numeração:** a etapa I tem oito migrações desde 08/10 (aviso do núcleo no `docs/diario-fase-1a.md`). O mapa e os comentários do `historico.ts` e do `transicoes.test.ts` ainda usavam a numeração de cinco (transições como I3, chamado e OS como I2, módulos como I5). Foram corrigidos para I5, I4 e I7, e o mapa passou a dizer o que já está na `main`.
- **`TransicaoDaOs`:** o comentário agora lista as colunas reais da migração 0031.

### Ponto de retomada (09/10/2026)
- **Main verde** no merge do #148; nenhum PR aberto do Intelligence além deste.
- **Esperando o núcleo:** a I4 (chamado e OS), a I6 e a I7. Quando a I4 entrar, trocar `executadoPor`, `fornecedorId`, `custoInformado`, `impactoHospede` e o período de UH indisponível pelos nomes reais, num PR fora de zona protegida.
- **`int-adr-aceite` continua fechado** (a instrumentação não terminou), e as tabelas do Intelligence esperam a I7 (aviso do núcleo: a fila de zona protegida abre para elas depois da I7).
- **Esperando o Kaio e o Cesar:** o canal da aprovação do Cesar de 08/10 (o texto literal entrou em 09/10/2026), e as confirmações dos PRs de 08/10.

## I4 na `main`: os nomes reais no motor (09/10/2026)

Pedido do Kaio de 09/10/2026, depois do merge do #151 (I4) e do #152 (telas). PR fora de zona protegida.

### O que a I4 trouxe e como o motor lê
- **`app.os.executado_por`** (`equipe_interna` ou `fornecedor`, `not null default 'equipe_interna'`): o motor passa a usar o `ExecutadoPor` do `@hubkeep/dominio` (lista `EXECUTORES_DA_OS`), e não a cópia própria. O `historico.ts` reexporta o tipo, então quem importava do motor não muda. As OS anteriores à 0034 ficaram com o padrão; o campo continua opcional na `Corretiva` porque o chamado sem OS não tem quem executou.
- **`app.os.fornecedor_id`**: o `fornecedorId` já tinha esse nome. O banco amarra o id a `executado_por = 'fornecedor'` (`os_fornecedor_quando_externo`), a mesma regra do `fornecedorDaOs`.
- **`app.os.custo_informado`** (`numeric(12,2)`): o `custoInformado` já tinha esse nome. O driver devolve texto; quem lê o banco converte para número antes de entregar ao motor.
- **`app.chamado.impacto_hospede`** (boolean; nulo é "não informado"): o `impactoHospede` já tinha esse nome.
- **`app.uh_indisponivel`** (`hotel_id`, `local_id`, `chamado_id`, `inicio`, `fim`): o `uhDiasPerdidos` e o `PeriodoDeUhIndisponivel` passaram para o domínio na I4, com o `chamadoCancelado` (o período de chamado cancelado não conta). A cópia do módulo (`src/uh.ts`) saiu, e o `uh.test.ts` ficou, apontando para o domínio, como o contrato do componente UH-dias da atenção (peso 0).
- **Nenhum nome de campo do motor mudou**: os provisórios já eram os da proposta aprovada. Mudaram o tipo de origem (`ExecutadoPor`), a função de UH-dias (do domínio) e os comentários, que agora dizem a coluna e a migração. Nenhuma fórmula mudou, então nenhuma versão sobe.

### Outros ajustes do mesmo PR
- **PV1:** o núcleo renomeou a etapa do checklist tipado de P1 para PV1 (aviso no `docs/diario-fase-1a.md`). Mudou nos comentários do motor e no mapa das entradas. As entradas antigas deste diário ficam como foram escritas: onde dizem "checklist tipado (P1)", leia PV1.
- **"Fase A"** saiu dos comentários: cada campo diz a etapa (I4 ou I6).
- **Mapa das entradas:** as linhas da I4 passam a "Existe (I4)", com as colunas reais; o item que ainda dizia "UH-dias como sinal próprio, a aprovar" ganhou a nota de que foi superado em 07/10.

### Verificação
- Testes do pacote: 202 passando; tipos do pacote e do web ok; eslint no pacote sem apontamentos; os testes da raiz que tocam o Intelligence (composição, contratos e fronteiras) passando.

### Ponto de retomada (09/10/2026)
- **Esperando o núcleo:** a I6 (códigos de manutenção, `codigoFalha`) e a I7 (módulos). Depois da I7, a fila de zona protegida abre para o `int-adr-aceite` e as tabelas do Intelligence, uma por vez.
- **A ligação do job** (a camada que lê o banco e monta a `Corretiva`) ainda não existe: é ela que vai ler as colunas acima e converter o custo. Entra com a `app.insight`.

## Respostas do Kaio às confirmações de 08/10 (10/10/2026)

As seis leituras que os PRs de 08/10 (#142, #144 e #145) deixaram para o Cesar confirmar. O Kaio respondeu às seis e pediu o registro como **aprovado por Kaio, aguardando Cesar**. Canal: o chat deste agente, colado pelo usuário em 10/10/2026. **Nada disso foi implementado:** o motor só muda depois do ok do Cesar.

### Texto do Kaio (sem alteração)

> 1. São oito componentes com peso mais os UH-dias com peso 0 (nove no motor); o texto "oito" foi redação.
> 2. Medições fora da faixa como fração, com mínimo de 3 medições na janela.
> 3. Componente disponível quando pelo menos 50% das corretivas encerradas do tenant na janela têm o dado; abaixo disso, sem dado para todos.
> 4. "Sem base" prevalece sobre "janela incompleta".
> 5. Mesmo modelo: fabricante e modelo sem maiúsculas, acentos e espaços nas pontas; ativo sem modelo fica fora.
> 6. A primeira versão gravada da atenção é a 2; a versão 1 nunca foi gravada.

### As seis, com as razões do Kaio e o que muda no motor depois do ok do Cesar

Status de cada uma: aprovado por Kaio, aguardando Cesar.

1. **Oito ou nove componentes.** O Kaio explicou que a diferença veio da redação do texto que ele sugeriu ao Cesar. A proposta aprovada tem oito componentes com peso e os UH-dias com peso 0, e o motor conta nove. O conteúdo é o mesmo, então só a redação muda. A nota do agente no texto do Cesar de 08/10 ("a confirmar com o Cesar") fica respondida por esta linha.
   - **No motor:** nada muda. O comentário do `atencao.ts` já diz "nove componentes, oito com peso e UH-dias com peso 0".
2. **Medições fora da faixa como fração, com mínimo de 3 na janela.** Para o Kaio, a fração é mais justa que a contagem com o ativo que tem muitos itens de checklist. Com menos de 3 medições na janela, o componente fica sem dado.
   - **No motor:** a fração já é o que ele calcula. O mínimo não existe: hoje uma medição basta, e só zero medição deixa o componente sem dado.
   - **Pergunta do agente, para a implementação:** o mínimo de 3 fica fixo na fórmula ou vira campo da política `inteligencia.atencao_ativo`?
3. **"Tenant inteiro".** O componente conta como disponível quando pelo menos 50% das corretivas encerradas do tenant, na janela, têm o dado preenchido. Abaixo disso, fica sem dado para todos os hotéis, e o peso vai para os outros componentes. O Kaio explicou o motivo: assim um hotel que preenche e outro que não preenche não ficam com pesos diferentes.
   - **No motor:** é outro desenho. Hoje o peso sem dado é redistribuído ativo a ativo, e era essa a leitura que o PR #142 deixou para confirmar. A mudança pede no `calcularDia` a conta das corretivas encerradas do tenant na janela, com e sem cada dado.
   - **Perguntas do agente, para a implementação:**
     - A regra vale para quais componentes? Minha leitura são os que vêm da corretiva encerrada: impacto no hóspede e custo informado. Fica a confirmar se vale também para o tempo parado.
     - Quando o componente está disponível no tenant, que valor tem o ativo cujas corretivas não têm o dado? Zero, ou sem dado só para aquele ativo?
4. **"Sem base de comparação" prevalece sobre "janela incompleta"** quando os dois valem. Pela explicação do Kaio, o resultado já é definitivo no dia da intervenção: menos de 3 chamados antes nunca vira uma comparação válida, por mais que a janela termine.
   - **No motor:** inverte a ordem de hoje. Hoje `janela_incompleta` vale primeiro (`efetividade.ts`), por escolha minha no #144.
   - **Nota do agente:** a efetividade é calculada sob demanda e nada dela foi gravado. Pela regra do adendo ("mudou a fórmula depois da primeira gravação, sobe a versão"), a versão continua 2. Fica a confirmar com o Cesar junto com o resto.
5. **Mesmo modelo.** Fabricante e modelo são comparados sem diferenciar maiúsculas, acentos e espaços nas pontas. Ativo sem modelo fica fora da regra.
   - **No motor:** o `chaveDeModelo` (`historico.ts`) já tira os espaços das pontas, junta os espaços repetidos do meio e ignora maiúsculas. Ativo sem fabricante ou modelo já fica de fora. Falta tirar os acentos.
   - **Pergunta do agente, para a implementação:** os espaços repetidos do meio continuam juntados? O Kaio falou só das pontas.
   - **Nota do agente:** o Kaio disse "se a pergunta do Code era outra, me traga o detalhe". O PR #145 deixou outras quatro leituras do mesmo modelo para confirmar (diário de 08/10, "Leituras minhas, a confirmar"):
     - "ativo instalado" são todos os ativos do modelo que o motor recebe;
     - o ativo sem categoria, fabricante ou modelo fica fora da conta, inclusive da base;
     - sem outros modelos na categoria, a base é 0 e vale só o mínimo de 0,3;
     - "3 hotéis" são os hotéis com chamado do modelo na janela.

     A resposta cobre a segunda, em parte, porque fala do ativo sem modelo. As outras três seguem a confirmar.
6. **"Versão 1 nunca gravada".** A numeração continua, e a primeira versão gravada da atenção é a 2. A 1 existe no texto do ADR-034, e renumerar só confunde. Este diário registra que a versão 1 nunca foi gravada: ela existiu só no código e nos testes, antes das tabelas do ADR-036.
   - **No motor:** nada muda. É o que o código e o rascunho dos adendos já diziam.

### Onde mais ficou registrado
- **Rascunho dos adendos ao ADR-034 e ao ADR-036**, no `int-rascunhos` (`rascunhos/adr/adendos-adr-034-e-036.md`, `3b9eeff`): as seis respostas entraram no texto, cada uma com a marca "aprovado por Kaio, aguardando Cesar". O que estava escrito do jeito antigo foi trocado pelas respostas, e o adendo diz o que ainda é pergunta.

### Ponto de retomada (10/10/2026)
- **Esperando o Cesar:**
  - o ok às seis respostas acima;
  - as perguntas do agente para a implementação:
    - o mínimo de medições fixo ou na política;
    - os componentes da regra dos 50% e o valor do ativo sem o dado;
    - os espaços do meio no mesmo modelo;
    - as três leituras do mesmo modelo ainda abertas.
  - Com o ok, a implementação entra num PR fora de zona protegida.
- **Esperando o Kaio:** o canal da aprovação do Cesar de 08/10.
- **Esperando o núcleo:** a I6 e a I7. Depois da I7, a fila de zona protegida abre para o `int-adr-aceite` e as tabelas do Intelligence, uma por vez.

## Respostas do Kaio às perguntas da implementação (10/10/2026)

O Kaio respondeu às perguntas que a seção anterior deixou para a implementação e pediu o registro como **aprovado por Kaio, aguardando Cesar**. Canal: o chat deste agente, colado pelo usuário em 10/10/2026. **Nada disso foi implementado:** o motor só muda depois do ok do Cesar.

### Texto do Kaio (sem alteração)

> 1. Mínimo de medições na política: padrão 3, mínimo 1.
> 2. A regra dos 50% vale só para o custo informado. Impacto no hóspede e
>    tempo parado estão sempre disponíveis (não marcado = não teve).
>    Garantia em branco = não vencida. Medições: disponibilidade por
>    categoria (sem item de medição no plano da categoria = sem dado);
>    ativo com menos de 3 medições contribui 0, sem redistribuir. Confira
>    se a coluna de custo da I4 distingue vazio (null) de zero e me diga.
> 3. Com o custo disponível no tenant, o ativo soma só as corretivas que
>    têm o dado; o detalhamento mostra "custo informado em X de Y
>    corretivas".
> 4. Mesmo modelo: sem maiúsculas, sem acentos, sem espaços nas pontas e
>    com espaços repetidos no meio reduzidos a um.
> 5. Leituras do #145: ativos instalados = ativos em algum momento da
>    janela (baixados antes do início não contam; instalados no meio contam
>    inteiros); sem outro modelo na categoria, a regra não dispara; 3 hotéis
>    = hotéis distintos com pelo menos um chamado contado na janela em
>    ativos do modelo.

### As respostas e o que muda no motor depois do ok do Cesar

Status de cada uma: aprovado por Kaio, aguardando Cesar.

1. **Mínimo de medições na política** `inteligencia.atencao_ativo`: padrão 3, mínimo 1. O Kaio explicou que segue a regra dos pesos e limites: nenhum limiar fica fixo na fórmula.
   - **No motor:** campo novo na política, com a validação do mínimo 1 ao gravar.
2. **Disponibilidade por componente.** Esta resposta substitui a leitura da seção anterior, que aplicava a regra dos 50% a todos os componentes da corretiva. Também muda o mínimo de medições da resposta 2 daquela seção: com menos medições que o mínimo, o ativo contribui 0, e não "sem dado".
   - **Custo informado:** é o único componente com a regra dos 50%, porque só nele "não informado" é diferente de "zero".
     - **No motor:** é desenho novo. Hoje o custo fica sem dado só no ativo sem nenhum custo informado. A entrada do `calcularDia` passa a precisar da conta das corretivas encerradas do tenant na janela, com e sem custo.
   - **Impacto no hóspede e tempo parado:** estão sempre disponíveis. Não marcar é "não teve".
     - **No motor, impacto:** hoje o `impactoHospedeDosChamados` calcula a fração só entre os chamados respondidos. O null fica fora da conta, e sem nenhum respondido o componente fica sem dado. Com o ok, o null conta como "não teve" e o componente nunca fica sem dado. Sem chamado na janela, o valor é 0.
     - **No motor, tempo parado:** nada muda. O `horasParadasNoTrecho` já devolve número sempre.
   - **Garantia em branco:** conta como não vencida. O peso é pequeno, e não se pune o dado que falta.
     - **No motor:** hoje a garantia sem data fica sem dado (#142). Com o ok, vale 0.
   - **Medições:** a disponibilidade é por categoria. Sem item de medição no plano da categoria, o componente fica sem dado nos ativos dela, e o peso é redistribuído. O ativo com menos medições que o mínimo contribui 0, sem redistribuir.
     - **No motor:** a entrada passa a dizer se o plano da categoria tem item de medição. O plano é da etapa PV, e até lá o componente continua sem dado.
3. **Custo disponível no tenant:** o ativo soma só o custo das corretivas que têm o dado. O detalhamento mostra "custo informado em X de Y corretivas".
   - **No motor:** a soma já ignora o null (`custoInformadoNaJanela`). O detalhamento ganha os dois números e uma mensagem nova no catálogo (`packages/i18n`), nos quatro idiomas.
4. **Normalização do mesmo modelo:** sem maiúsculas, sem acentos, sem espaços nas pontas e com os espaços repetidos do meio reduzidos a um.
   - **No motor:** falta só tirar os acentos. O resto o `normalizar` do `historico.ts` já faz.
5. **Leituras do #145.**
   - **Ativos instalados:** contam os ativos que estiveram ativos em algum momento da janela. O baixado antes do início não conta, e o instalado no meio conta inteiro no 1.0.
     - **No motor:** hoje contam todos os ativos que o motor recebe. A leitura do agente é que "baixado" é o `app.ativo.desativado_em` anterior ao início da janela. O `AtivoAnalisado` ganha esse campo, e quem lê o banco passa a mandar também os ativos desativados dentro da janela.
   - **Sem outro modelo na categoria:** a regra não dispara. Sem comparação, não dá para atribuir o problema ao modelo, o mesmo princípio do "sem base" da efetividade.
     - **No motor:** hoje a base vira 0 e vale só o mínimo de 0,3. Isso muda.
   - **Os 3 hotéis:** são hotéis distintos com pelo menos um chamado contado na janela em ativos do modelo. Ter o modelo instalado não basta.
     - **No motor:** já é assim.

### A conferência do custo na I4 (pedido do Kaio)
O vazio e o zero são distintos no banco e no aceite do `apps/web`:
- **Banco:** `app.os.custo_informado` é `numeric(12, 2)`, anulável e sem default (migração `20261009150000_chamado_os_uh_indisponivel.sql`). O check `os_custo_nao_negativo` aceita null ou valor maior ou igual a 0, e as OS anteriores à 0034 ficaram com null.
- **Tela do aceite:** o campo começa vazio, e o `custoDoCampo` (`apps/web/src/cliente/corretiva.tsx`) devolve null para o campo vazio. Zero só chega se alguém digitar 0.
- **Gravação:** o repositório do aceite (`packages/db/src/repositorios/aceite.ts`) só grava o custo quando ele não é null. A leitura (`packages/db/src/adaptadores.ts`) devolve null para null.
- **O mock** (`docs/referencia/design/csc-mock/app.js`, aceite) faz diferente: o campo de custo tem `placeholder="0"`, e `parseFloat(...) || 0` transforma o vazio em 0. É só demonstração e não toca o banco. Mas, se o mock for usado para mostrar a regra dos 50%, ele precisa gravar null no vazio. Não mexi no mock.

### Onde mais ficou registrado
- **Rascunho dos adendos ao ADR-034 e ao ADR-036**, no `int-rascunhos` (`rascunhos/adr/adendos-adr-034-e-036.md`, `6454723`): as respostas entraram no texto, com a marca "aprovado por Kaio em 10/10/2026, aguardando Cesar".

### Ponto de retomada (10/10/2026)
- **Esperando o Cesar:** o ok às respostas desta seção e da anterior. Com o ok, a implementação entra num PR fora de zona protegida, com a versão de cada fórmula conforme a regra do adendo.
- **Esperando o Kaio:** o canal da aprovação do Cesar de 08/10.
- **Esperando o núcleo:** a I6 e a I7. Depois da I7, a fila de zona protegida abre para o `int-adr-aceite` e as tabelas do Intelligence, uma por vez.

## Aprovação do Cesar e implementação das respostas de 10/10 (10/10/2026)

### A aprovação do Cesar
- **Texto literal do Cesar** (passado pelo usuário no chat deste agente em 10/10/2026, sem alteração):

  > Aprovado. Podem seguir.

- **Dia:** 10/10/2026. **Canal:** o usuário passou a frase no chat deste agente, como "O cesar disse:". O canal em que o Cesar escreveu não veio com o texto. A mensagem do Kaio trazia o lugar do texto ainda com o marcador "[cole aqui o texto do Cesar]", e por isso o registro é a frase passada pelo usuário. **[canal a confirmar com o Kaio]**
- **O que ela aprova**, pela mensagem do Kaio do mesmo dia: as propostas de 08/10 e as respostas de 10/10 (as duas seções acima). O Kaio confirmou a leitura do agente de que ativo baixado é o `app.ativo.desativado_em` anterior ao início da janela.
- **O que ela não aprova:** o texto dos adendos ao ADR-034 e ao ADR-036. Ele segue no `int-rascunhos` para o `int-adr-aceite`, depois da I6 e da I7. Merge não aprova ADR.

### Os três PRs (fora de zona protegida, cada um a partir da `main`, sem empilhar)
1. **Atenção** (#157, `int-atencao-respostas`): a versão continua 2, a primeira gravada, com os pesos padrão aprovados.
   - Tempo parado e impacto no hóspede ficam sempre disponíveis.
   - Garantia sem data conta como não vencida.
   - Medições: fração, com mínimo na política (`minMedicoes`, padrão 3, mínimo 1) e disponibilidade por categoria (`categoriasComMedicao`). Abaixo do mínimo, o ativo contribui 0.
   - Custo: regra dos 50% das corretivas encerradas do tenant. O ativo soma só as corretivas que têm o dado.
   - O detalhamento ganha uma nota por linha (custo em X de Y corretivas, custo sem dado no tenant, medições abaixo do mínimo e garantia sem data), nos quatro idiomas.
   - **Escolha do agente, a confirmar com o Kaio:** os 50% ficaram fixos na fórmula, e não na política. A política da atenção se resolve por hotel, e a regra precisa ser a mesma em todos os hotéis do tenant.
2. **Efetividade** (#158, `int-efetividade-ordem`): "sem base de comparação" prevalece sobre "janela incompleta".
   - Os limiares continuam na política.
   - A versão continua 2, que é a primeira gravada.
   - O rótulo do "sem base" diz que o resultado vale desde o dia da intervenção.
3. **Padrão sistêmico** (este PR, `int-sistemico-respostas`):
   - **Normalização:** fabricante e modelo sem maiúsculas, acentos e espaços extras.
   - **Ativos instalados:** o ativo baixado antes do início da janela não conta, nem no modelo nem na base (`AtivoAnalisado.desativadoEm`).
   - **Sem outro modelo na categoria:** a regra não dispara.
   - **Os 3 hotéis:** contam só os hotéis com chamado contado no modelo, como já era.
   - **Versão:** continua 2, a primeira gravada. Só o mesmo modelo segue ligado por padrão, com os mínimos na política.

**Versões:** nenhuma sobe nos três PRs. Pela regra do adendo, a versão só sobe quando a fórmula muda depois da primeira gravação, e nada foi gravado ainda.

**Registro de políticas:** nenhuma chave nova. As três chaves (`inteligencia.atencao_ativo`, `inteligencia.efetividade` e `inteligencia.sistemico`) já existem. O campo novo `minMedicoes` é validado pela extensão do Intelligence.

### Fora deste trabalho
- **Mock de apresentação:** já está na `main`. O #143 ("mock de apresentação como mock oficial único") entrou em 08/10/2026.
  - A tela do Intelligence no mock recebeu a atenção v2 e a efetividade v2 no #147 (agente do núcleo) e o padrão sistêmico v2 no #148.
  - As respostas de 10/10 ainda não entraram no mock, e o aceite do mock ainda grava 0 no custo vazio (`parseFloat(...) || 0`).
  - Fica para um PR depois destes três, quando o Kaio mandar seguir.

### Ponto de retomada (10/10/2026)
- **Merge do Kaio, na ordem:** #157, #158 e este. Os três saem da `main` e não dependem um do outro. Este é o único que mexe no diário.
- **Esperando o Kaio:**
  - o canal da aprovação do Cesar de 08/10;
  - o canal da aprovação de 10/10;
  - a confirmação da regra dos 50% fixa na fórmula.
- **Esperando o núcleo:** a I6 e a I7. Depois, o `int-adr-aceite` e as tabelas do Intelligence.

## Depois do merge dos #157, #158 e #159 (10/10/2026)

Instruções do Kaio, coladas pelo usuário no chat deste agente em 10/10/2026.

- **Regra dos 50% fixa na fórmula: aprovado por Kaio (10/10/2026).** O Kaio confirmou a escolha do #157. É regra de qualidade de dado do tenant, e a política da atenção se resolve por hotel. Mudar o limiar exige versão nova da fórmula.
- **Aprovação do Cesar de 10/10:** o canal continua **[a confirmar]** até o Kaio colar o texto do Cesar.
- **Rascunho dos adendos** (`int-rascunhos`, `5c4f1e5`): as marcas das propostas de 08/10 e das respostas de 10/10 passaram a "aprovado por Cesar e Kaio em 10/10/2026". A regra dos 50% fixa na fórmula entrou como "aprovado por Kaio". O texto dos adendos continua precisando da revisão do Cesar no PR `int-adr-aceite`.
- **Mock (#160):** o PR leva as respostas de 10/10 para a tela do Intelligence. Mudam a atenção, a efetividade e o sistêmico, o aceite passa a gravar o custo vazio como vazio, e o seed não informa custo em parte das corretivas internas. Fica fora de zona protegida, e o merge espera a revisão do Cesar, porque o mock é identidade.
  - Com a regra das medições, a "Bomba de recalque 1" sai da lista de atenção da demonstração: cai de 74 para 69, porque tem 2 medições, abaixo do mínimo de 3.

### Ponto de retomada (10/10/2026)
- **Esperando o Cesar:** a revisão do #160.
- **Esperando o Kaio:** o canal das aprovações do Cesar de 08/10 e de 10/10.
- **Esperando o núcleo:** a I6 e a I7. Depois, o `int-adr-aceite` e as tabelas do Intelligence.

## Decisões das telas do 1.0 (10/10/2026)

Instruções do Kaio, coladas pelo usuário no chat deste agente em 10/10/2026, depois do merge dos #160 e #161. As seis decisões estão em `docs/referencia/proposta-telas-intelligence-1-0.md`, seção "Decisões de 10/10/2026", **aprovadas por Kaio, aguardando Cesar**. Em resumo:

1. **Estrutura das três telas** aprovada. A referência visual passa a ser a tela do Intelligence do mock na `main`. As imagens de 07/10 (`docs/referencia/design/intelligence-1-0/`) saíram do repositório. O que o mock ainda não tem entra primeiro no mock, num PR com a revisão do Cesar; o código vem depois.
2. **Decidir só na página do insight.** A página do ativo mostra o score e leva ao insight.
3. **Menu** com um único item, "HubKeep Intelligence", que abre a lista de insights.
4. **Fora do 1.0:** abrir chamado, criar preventiva, vincular feedback e pedir orçamento.
5. **UH-dias** numa linha discreta no fim da tabela de composição: "Ainda sem dado: UH-dias (peso 0)".
6. **Gráfico de 90 dias** pequeno no celular, com os números também em texto.

**A vitrine de 07/10** (`int-rascunhos`, `rascunhos/telas-vitrine/`) deixou de ser referência. Continua no rascunho até o Kaio dizer se sai.

**Narração do tour** (`docs/referencia/design/csc-mock/tour.js`, capítulo "Intelligence"): nenhuma fala cita número ou ativo do Intelligence, então nenhuma muda com o #160. Os seletores do capítulo continuam encontrando a tela. Depois do #160, a lista de atenção da persona do tour mostra um cartão só, o "Elevador social 2" (94), e a fala não depende de quantos são.

### Ponto de retomada (10/10/2026)
- **Esperando o Cesar:** as seis decisões das telas.
- **Esperando o Kaio:**
  - o canal das aprovações do Cesar de 08/10 e de 10/10;
  - o lugar da efetividade e do quadro "Próximas versões" nas três telas;
  - a ordem dos PRs do mock para o que falta.
- **Esperando o núcleo:** a I6 e a I7. Depois, o `int-adr-aceite` e as tabelas do Intelligence.

## Vitrine, efetividade e mock das três telas (10/10/2026)

Instruções do Kaio, coladas pelo usuário no chat deste agente em 10/10/2026, depois do merge do #162. Decisões **aprovadas por Kaio, aguardando Cesar**:

1. **Vitrine de 07/10:** sai do `int-rascunhos` (`rascunhos/telas-vitrine/`), porque o histórico do git a guarda. Feito no commit `260d8e8` do `int-rascunhos`.
2. **A efetividade não é tipo de insight.** Ela aparece em três lugares:
   - na lista de insights, como seção abaixo da lista, como já estava no mock;
   - na página do ativo, com as intervenções dele;
   - na página do insight, quando houver intervenção registrada depois da decisão.
3. **"Próximas versões"** fica só no mock, fora do produto.

A proposta das telas (`docs/referencia/proposta-telas-intelligence-1-0.md`) recebeu as três decisões.

**Mock das três telas** (#163, fora de zona protegida; o merge espera a revisão do Cesar):
- **Commits:** um por tela, nesta ordem: lista de insights, página do insight e detalhe do ativo.
- **Dados gravados:**
  - o seed simula o job diário, com os resultados dos últimos 90 dias e as versões da fórmula e da política;
  - os insights saem da regra de detecção do motor (`decidirDeteccao`);
  - as decisões das pessoas entram como roteiro da demonstração.
- **Caso novo no seed:** o Elevador social 2 do Hotel Curitiba Batel, sem sorteio, para a gerente ter um insight do hotel dela para decidir, com uma intervenção depois da decisão.
- **Conferido no navegador:**
  - a gestora do CSC, o gestor da bandeira e a gerente;
  - a gerente não decide insight de rede: não o vê, e pelo link direto a página diz que está fora do escopo;
  - o console fica sem erros.
- **Tour:** as falas são as mesmas e a narração não foi regerada; só mudaram os seletores do capítulo do Intelligence.
- **Para o Cesar decidir na revisão:** o caso novo do Batel e a regra do mock de que quem decide primeiro vira o responsável. O produto ainda não tem regra de atribuição do insight.

### Ponto de retomada (10/10/2026)
- **Esperando o Cesar:**
  - as decisões das telas de 10/10, as seis e as três acima;
  - a revisão do #163.
- **Esperando o Kaio:** o canal das aprovações do Cesar de 08/10 e de 10/10.
- **Esperando o núcleo:** a I6 e a I7. Depois, o `int-adr-aceite` e as tabelas do Intelligence.

## Responsável pelo insight e canal de aprovação (10/10/2026)

Instruções do Kaio, coladas pelo usuário no chat deste agente em 10/10/2026, depois do merge dos #163 e #164.

- **Responsável pelo insight: aprovado por Kaio, aguardando Cesar.**
  - Quem toma a primeira ação no insight vira o responsável.
  - O Admin do grupo e o Gestor CSC podem reatribuir, com registro na auditoria.
  - A regra é do domínio, e não do banco. O mock (#163) já faz o primeiro ponto; a reatribuição ainda não está nele.
  - Registrada também no rascunho da `app.insight` (`int-rascunhos`, `rascunhos/insight/LEIAME.md`, `0b6202a`).
- **Proposta de processo para o ADR-033, do Kaio, aguardando Cesar.** Texto do Kaio, que corrigiu em 10/10/2026 a primeira redação deste agente, antes de o Cesar ler:
  > "Proposta (muda o ADR-033): detalhe de implementação dentro de um ADR do Intelligence já aprovado é decidido só pelo Kaio. É detalhe: limiares, mínimos, regras de desempate, valores padrão de política dentro de uma regra aprovada, textos e rótulos, e ajustes no seed e no mock que não mudam regra. Continua com Cesar e Kaio: componente novo, estado novo ou fonte de dado nova; mudança em quem vê ou quem decide; e qualquer mudança nos princípios (explicabilidade, correlação não é causa, IA só para texto, módulo nunca importado pelo núcleo)."
- **Canal oficial de aprovação do Intelligence:** a issue "Aprovações pendentes do Intelligence" (#166, https://github.com/cesarcoutohubtech/hubkeep/issues/166). Ela reúne, em ordem de data, tudo o que está como "aguardando Cesar" neste diário e no `int-rascunhos`, com uma caixa de seleção por item.
  - O Cesar marca o que aprova e comenta "Aprovo os itens marcados". Nos itens não marcados, comenta o motivo.
  - Quando o Cesar comentar, este diário e o `int-rascunhos` são atualizados citando o link do comentário.

### Ponto de retomada (10/10/2026)
- **Esperando o Cesar:** o comentário na issue #166, com os itens marcados.
- **Esperando o Kaio:** o canal das aprovações do Cesar de 08/10 e de 10/10.
- **Esperando o núcleo:** a I6 e a I7. Depois, o `int-adr-aceite` e as tabelas do Intelligence.

## Aprovação do Cesar aos itens da issue #166 (10/10/2026)

- **Aprovação:** o Cesar escreveu no corpo do #167 (https://github.com/cesarcoutohubtech/hubkeep/pull/167), em 10/10/2026: "Eu Cesar aprovo a continuidade nos trabalhos".
  - Confirmado no chat deste agente, no mesmo dia, que a frase vale para os 17 itens da issue #166 (https://github.com/cesarcoutohubtech/hubkeep/issues/166).
  - Confirmado pelo Cesar na #166, com o próprio login: "Issue aprovada totalmente" (https://github.com/cesarcoutohubtech/hubkeep/issues/166#issuecomment-6099298901) e "O texto de aprovação é meu Cesar Couto" (https://github.com/cesarcoutohubtech/hubkeep/issues/166#issuecomment-6099343563).
  - A #166 foi fechada apontando para o #167, com as caixas marcadas.
- **Itens aprovados, todos os 17; nenhum ficou de fora:**
  - **06/10:** hotel novo num insight de rede, na variante (c). Isso confirma que a aprovação de 07/10 vale para a variante (c).
  - **07/10:**
    - as correções do `docs/03` no `int-adr-aceite`: ADR-033 com a variante (c) e o motivo do descarte; ADR-035 com a validação entre chaves; ADR-036 com o aceite do Kaio;
    - os UH-dias como componente da atenção, com peso 0;
    - o painel mostra o resultado original gravado de cada dia.
  - **10/10:**
    - os 50% do custo informado ficam fixos na fórmula;
    - as seis decisões das telas do 1.0;
    - a vitrine de 07/10 sai do `int-rascunhos`;
    - a efetividade aparece em três lugares;
    - "Próximas versões" fica só no mock;
    - o caso novo do Batel no seed do mock (#163);
    - o responsável pelo insight;
    - a proposta de processo do ADR-033.
- **Processo do ADR-033, em vigor desde esta aprovação:** detalhe de implementação dentro de um ADR do Intelligence já aprovado é decidido só pelo Kaio, nos termos do texto corrigido da seção anterior.
  - Continuam com Cesar e Kaio:
    - componente, estado ou fonte de dado nova;
    - mudança em quem vê ou em quem decide;
    - mudança nos princípios.
  - O texto do `docs/03` muda pelo `int-adr-aceite`.
- **`int-rascunhos`:** as marcas de "aguardando Cesar" passaram a "aprovado por Cesar em 10/10/2026", com o link do #167.
- **O que ainda depende do núcleo:** a I6 e a I7 não estão na `main`. Sem elas, ficam parados:
  - o motor com os nomes reais, os códigos de falha no padrão sistêmico e a habilitação pelo `licenca.modulo`;
  - a fila de zona protegida do Intelligence: `int-adr-aceite`, `app.insight`, `app.metrica_ativo_diaria` e a ligação do job no web.

- **Nota sobre a #166, corrigida pelo Cesar em 10/10/2026** (substitui a nota anterior, do Kaio):
  > "O comentário e o fechamento da issue #166 foram feitos pelo agente do Intelligence, em sessão operada pelo Cesar com a conta do Claude do Kaio. A aprovação dos 17 itens é do Cesar, dada no chat em 10/10/2026, e confirmada por ele na #166 com o próprio login."
  - Os comentários do Cesar na #166: https://github.com/cesarcoutohubtech/hubkeep/issues/166#issuecomment-6099298901 e https://github.com/cesarcoutohubtech/hubkeep/issues/166#issuecomment-6099343563.
- **Regra deste agente, do Kaio e do Cesar, em 10/10/2026:**
  - O agente nunca escreve aprovação em nome de outra pessoa e nunca fecha issue ou PR de aprovação. Ele só registra e cita a aprovação feita por quem aprovou.
  - Toda mensagem diz quem fala: "Cesar aqui" ou "Kaio aqui". Sem isso, o agente pergunta antes de agir.
- **Confirmações do Kaio:** a issue #169 (https://github.com/cesarcoutohubtech/hubkeep/issues/169), aberta a pedido do Cesar, reúne em ordem de data tudo o que está como "aprovado por Kaio" neste diário e no `int-rascunhos`.
  - São 23 itens, cada um com uma caixa e o link.
  - O Kaio marca o que aprova e comenta com o próprio login. Nos itens não marcados, diz o motivo.
  - Até o comentário do Kaio, esses itens valem como aprovados pelo Cesar.

### Ponto de retomada (10/10/2026, depois do #167)
- **Esperando o Kaio:** o comentário na issue #169, com o próprio login.
- **Esperando o núcleo:** o merge da I6 e da I7.
- **Depois:**
  1. adaptar o motor aos nomes reais da I6 e da I7, num PR fora de zona protegida;
  2. seguir a fila de zona protegida, um PR por vez, conferindo antes que não há outro aberto: `int-adr-aceite`, `app.insight`, `app.metrica_ativo_diaria` e a ligação do job.

### Exceção do Cesar: CNPJ alfanumérico, I6 e I7 por este agente (10/10/2026)
- Por decisão do Cesar de 10/10/2026, este agente faz o CNPJ alfanumérico, a I6 e a I7 no lugar do agente do núcleo, em branches `1b-*`. O registro, as decisões e o ponto de retomada estão no diário do núcleo, `docs/diario-fase-1a.md`, seção "Exceção do Cesar: o agente do Intelligence faz o CNPJ alfanumérico, a I6 e a I7". Terminada a I7, a exceção acaba e este agente volta ao ponto de retomada acima.

### Fim da exceção e volta à fila (10/10/2026)
- **Entregue na exceção:** o CNPJ alfanumérico (#171), a I6 (#173, migração 0036, e #174, regras e telas) e a I7 (#175, migração 0037, e o PR das regras, fora da zona protegida). O detalhe está no diário do núcleo, `docs/diario-fase-1a.md`.
- **O que muda para o Intelligence:**
  - os códigos ficam em `app.os.codigo_falha_id`, `codigo_causa_id` e `codigo_solucao_id`, com o cadastro em `app.codigo_manutencao` e o tipo `falha`, `causa` ou `solucao`;
  - a habilitação do módulo fica em `licenca.modulo`, e a regra de vigência em `moduloVigente`, no domínio;
  - as chaves `inteligencia.*` só valem para o tenant com o módulo vigente. `montarInteligencia` já registra a extensão ligada ao módulo `inteligencia`;
  - o job, quando for ligado, segue a mesma regra no tenant do job (adendo da I7 ao ADR-026, que aguarda a aprovação do Cesar).
- **Ponto de retomada:**
  1. adaptar o motor aos nomes reais da I6 e da I7, num PR fora de zona protegida;
  2. seguir a fila de zona protegida, um PR por vez, conferindo antes que não há outro aberto: `int-adr-aceite`, `app.insight`, `app.metrica_ativo_diaria` e a ligação do job.
  - Continua esperando o comentário do Kaio na issue #169.

## I6 e I7 na `main`: o motor com os nomes reais (10/10/2026)

Depois do merge do #176 ("Cesar aqui", 10/10/2026), este é o primeiro passo do ponto de retomada da seção anterior. PR fora de zona protegida.

### O que a I6 e a I7 trouxeram e como o motor lê
- **I6, `app.os.codigo_falha_id`:**
  - o `codigoFalha` já tinha esse nome, e nenhum campo mudou;
  - o id é de um código de `app.codigo_manutencao` com tipo `falha`; o motor compara o id, e o nome que a tela mostra vem de `nomes`, que o `hk_worker` lê no tenant do job;
  - a causa e a solução (`codigo_causa_id`, `codigo_solucao_id`) não entram no motor 1.0.
- **I7, `licenca.modulo`:**
  - a `FonteDoJob` ganhou `modulos()`, lida pelo `hk_worker` no tenant do job;
  - o `executarDiaDoTenant` confere primeiro se o módulo `inteligencia` vale em `agora`, com o `modulosVigentes` do domínio. Sem ele (sem linha, vencido, ainda não iniciado ou com a vigência inválida), não lê o resto nem grava, e o resumo volta com `semModulo: true`;
  - **no recálculo**, vale a vigência no dia recalculado (o `agora` é o fim dele). Um dia anterior ao contrato não é recalculado, e um dia do tempo de contrato pode ser, mesmo com o módulo já vencido. É detalhe de implementação dentro do adendo da I7 (ADR-033: decisão do Kaio), e fica para ele confirmar;
  - as políticas que chegam em `hoteis()` e `politicaSistemica()` são as do registro do tenant (`doTenant`), com a extensão do Intelligence, porque o job só chega a elas com o módulo vigente.
- **Nenhuma fórmula mudou**, então nenhuma versão sobe.

### Verificação
- Testes do pacote: 229 passando, com os quatro casos novos do job (sem o módulo; vencido, futuro ou inválido; vigente com prazo; recálculo antes e depois do início).

### Ponto de retomada (10/10/2026)
- **O mapa das entradas** (`docs/referencia/mapa-entradas-calcular-dia.md`) não tem mais nenhuma linha esperando a etapa I. Continuam sem origem só as medições (PV1) e o `aposPreventiva` (etapa P).
- **Próximo:** a fila de zona protegida, um PR por vez, conferindo antes que não há outro aberto: `int-adr-aceite`, `app.insight`, `app.metrica_ativo_diaria` e a ligação do job (é ela que implementa o `modulos()` e as outras leituras).
- **Esperando o Kaio:** o comentário na issue #169 e a confirmação da vigência no recálculo.
- **Esperando o Cesar:** a aprovação do adendo da I7 ao ADR-026. **Atualização:** aprovado por Cesar em 10/10/2026 (registro no `docs/diario-fase-1a.md`, #178).

## `int-adr-aceite`: o `docs/03` no estado real (10/10/2026)

Primeiro PR da fila de zona protegida do Intelligence, aberto depois do merge do #179, com a confirmação do Cesar ("Cesar aqui", 10/10/2026). Nenhum outro PR estava aberto no repositório.

- **Branch novo, `int-adr-aceite-v2`, a partir da `main`.** O `int-adr-aceite` de 07/10 partia de uma `main` antiga e trazia "aguardando Cesar" em itens que a #166 já aprovou. O texto dele foi reaproveitado, com as aprovações de 10/10, e o branch antigo fica como está.
- **O que entra no `docs/03`:**
  - **ADR-026:** o adendo da I7 passa a "aprovado por Cesar em 10/10/2026";
  - **ADR-033:** as aprovações de 10/10 (#166), o processo do ADR-033, o hotel novo na variante (c), o responsável pelo insight, a família e a chave, a regra do job pela família e o motivo do descarte;
  - **ADR-034:** o adendo da atenção v2, do `int-rascunhos` (`rascunhos/adr/adendos-adr-034-e-036.md`);
  - **ADR-035:** a validação entre chaves, a conferência na leitura e a remissão aos adendos de 08/10;
  - **ADR-036:** o aceite do Kaio à condição, como ela foi aplicada (o painel mostra o resultado original) e o adendo das versões e do formato das políticas, do `int-rascunhos`.
- **Status dos dois adendos:** o conteúdo foi aprovado por Cesar e Kaio em 10/10/2026; o texto aguarda a aprovação escrita dos dois. Merge não aprova ADR.
- **Itens "aprovado por Kaio":** foram dados no chat deste agente; a confirmação do Kaio com o próprio login continua na issue #169.
- **Fora deste PR:** as três regras do cálculo do dia (#101), que entram com a `app.insight`, e o adendo proposto ao ADR-027 (núcleo, aguarda o Cesar).

### Ponto de retomada (10/10/2026)
- **PR aberto:** `int-adr-aceite-v2` (zona protegida; o merge é do Cesar, com bypass).
- **Esperando o Cesar e o Kaio:** a aprovação escrita do texto dos adendos ao ADR-034 e ao ADR-036.
- **Esperando o Kaio:** o comentário na issue #169 e a confirmação da vigência no recálculo.
- **Depois do merge:** tirar o texto dos adendos do `int-rascunhos` e abrir a `app.insight`, a partir do rascunho. **Atualização:** #180 mergeado; o texto saiu do `int-rascunhos` (d267cb6).

## `int-insight-tabela`: a `app.insight` (migração 0038, 10/10/2026)

Segundo PR da fila de zona protegida do Intelligence, depois do merge do #181 (adendo ao ADR-027, do núcleo), com a confirmação do Cesar ("Cesar aqui", 10/10/2026). Nenhum outro PR estava aberto. O `int-insight` de 06/10 é outro branch, antigo, e fica como está.

- **Do rascunho (`rascunhos/insight/`):** a migração e o pgTAP, com o número 0038 e o 031.
- **Quem lê, decidido pelo Cesar em 10/10/2026** (aguarda o Kaio, porque muda quem vê): só quem decide. O rascunho deixava ler quem lê o hotel e, na rede, quem lê todos os hotéis do insight. Isso divergia do ADR-033 ("só quem tem escopo de grupo ou bandeira lê" o de rede) e tinha um furo: `authz.hoteis_leitura()` inclui o proprietário com escopo de hotel, que o pgTAP do rascunho não cobria. Agora:
  - a policy de leitura é a mesma da decisão, com os papéis em lista explícita;
  - o pgTAP prova que o Técnico, o gerente de vários hotéis (no insight de rede) e o proprietário do hotel inteiro não leem. São 53 testes.
- **Paridade:** os checks do estado e do motivo do descarte estão em `tests/valores-canonicos-banco.test.ts`, contra `ESTADOS_DO_INSIGHT` e `MOTIVOS_DE_DESCARTE`, como os da I4, I6 e I7. O `paridade-estados.test.ts` do `packages/db` olha policies e índices, e nenhum dos dois cita estado do insight; além disso, o `packages/db` não depende do módulo. O check do motivo virou `motivo_descarte in (...)`, porque null já passa num check.
- **Meta-testes:** a `app.insight` entra na lista fechada (28), e `hotel_ids` entra nos campos de escopo sem UPDATE (18).
- **Tipos do banco:** `AppInsight` no `tipos-banco.ts`, no formato do `kysely-codegen`, à mão, como na 0037. O `pnpm db:types` confere depois do `db push`.
- **No `docs/03`:** as três regras do cálculo do dia (#101) e quem lê o insight, no ADR-033. **No `docs/02`:** o modelo de leitura do insight.
- **Fora deste PR:** o repositório do insight e a ligação do job, que vêm depois da `app.metrica_ativo_diaria`.

### Ponto de retomada (10/10/2026)
- **PR aberto:** `int-insight-tabela` (zona protegida; o merge e o `db push` são do Cesar).
- **Esperando o Kaio:** quem lê o insight, o comentário na issue #169, a confirmação da vigência no recálculo e a aprovação escrita do texto dos adendos ao ADR-034 e ao ADR-036 (que também precisa do Cesar).
- **Depois do merge e do `db push`:** `supabase migration list` e `pnpm db:testar-dev`; depois, a `app.metrica_ativo_diaria`, a partir do rascunho.

## `int-metrica-ativo-diaria`: a `app.metrica_ativo_diaria` (migração 0039, 10/10/2026)

Terceiro PR da fila de zona protegida do Intelligence, depois do merge do #182 (a `app.insight`), com a retomada do Cesar ("Cesar aqui", 10/10/2026). A CI da main no e6dbe17 estava verde e nenhum outro PR estava aberto. O `db push` da 0038 no dev ainda não tinha sido feito quando o branch nasceu.

- **Do rascunho (`rascunhos/metrica/`):** a migração e o pgTAP, com o número 0039 e o 032. O `rascunhos/insight/` saiu do `int-rascunhos`, porque já está na main.
- **Quem lê, decidido pelo Cesar em 10/10/2026** (aguarda o Kaio, porque muda quem vê): só quem decide, como no insight de hotel. O rascunho usava `authz.hoteis_leitura()`, que deixa ler o Técnico, o solicitante, o implantador e o proprietário do hotel inteiro; o comentário dizia que o proprietário não lia, mas o pgTAP só cobria o proprietário da UH, que não está em `hoteis_leitura`. Agora:
  - a policy usa `authz.hoteis_com_papel` com o Admin do grupo, o Gestor CSC e o Gerente;
  - o pgTAP prova que o Gestor CSC vê só os hotéis da bandeira dele e que o Técnico, o solicitante, o implantador válido e o proprietário do hotel inteiro não leem. São 33 testes.
- **Meta-testes:** a tabela entra na lista fechada (28) e nas tabelas só de inserção (32). Nenhum campo recebe UPDATE, então o 18 não muda.
- **Paridade:** nada a acrescentar. A faixa da atenção é a chave de uma das faixas do score (`FAIXAS_PADRAO`, que a política pode trocar) ou `dados_insuficientes`, sem lista canônica no domínio; por isso a coluna não tem check de lista, como a `faixa` do insight.
- **Versões nos dados do teste:** a atenção está na versão 2 (adendo de 08/10 ao ADR-036), e os dados do pgTAP usam `versao_formula_atencao = 2`.
- **Tipos do banco:** `AppMetricaAtivoDiaria` no `tipos-banco.ts`, à mão, no formato do `kysely-codegen`. O `pnpm db:types` confere depois do `db push`.
- **No `docs/03`:** quem lê a métrica diária, no ADR-036. **No `docs/02`:** o modelo de leitura.
- **Fora deste PR:** o particionamento (pendência do ADR-036, decisão do Cesar), as tabelas do resumo mensal, o repositório da métrica e a ligação do job.

### Ponto de retomada (10/10/2026)
- **PR aberto:** `int-metrica-ativo-diaria` (zona protegida; o merge e o `db push` são do Cesar).
- **Esperando o Kaio:** quem lê o insight e a métrica diária, o comentário na issue #169, a confirmação da vigência no recálculo e a aprovação escrita do texto dos adendos ao ADR-034 e ao ADR-036 (que também precisa do Cesar).
- **Depois do merge e do `db push` da 0038 e da 0039:** `supabase migration list` e `pnpm db:testar-dev`; depois, a ligação do job no web, com as portas do `executarDiaDoTenant` sobre o `packages/db`.

## `int-job-ligacao`: a ligação do job diário no web (10/10/2026)

Depois do merge do #183 e do `db push` da 0039 ("Cesar aqui", 10/10/2026). O `supabase migration list` mostrou a 0038 e a 0039 no dev, e o `pnpm db:testar-dev` passou com 1026 testes em 32 arquivos. Este PR não toca a zona protegida.

**Decisões do Cesar de 10/10/2026, no chat do agente do Intelligence.** Aguardam a aprovação escrita do Kaio, porque mudam quem gera insight. O texto entra no ADR-036 (`docs/03`) num PR de zona protegida depois da aprovação.
- **O que entra no cálculo**, as três propostas do mapa das entradas:
  - só os hotéis com status `ativo`;
  - o ativo baixado sai do score e da métrica a partir da baixa, mas continua na base do sinal sistêmico;
  - o chamado cancelado sem OS não é corretiva. Com mais de uma OS, vale a que não foi cancelada; só com canceladas, a mais recente.
- **Agendamento:** a rota `/api/cron/inteligencia` existe, com o segredo, o laço por tenant e o `hk_worker`, mas fica fora do `vercel.json`, como o SLA e a preventiva. Entra no agendamento quando o painel for ler a métrica.
- **Auditoria e evento:**
  - insight: uma auditoria por abertura (`abrir`) e por atualização (`atualizar_deteccao`), com o evento `insight.aberto`, e `insight.subiu_de_faixa` quando a faixa sobe;
  - métrica: uma auditoria por tenant e dia (`gravar_dia`, com o número de linhas), sem evento;
  - evento sem consumidor fica pendente no outbox até existir quem o leia.

**O que o PR leva:**
- **Motor (`packages/inteligencia`):**
  - `fonte.ts` (novo): `corretivasDosChamados` (o chamado e a OS que vale), `inicioDaLeitura` (a maior janela que alguma regra do dia olha, pelas políticas resolvidas), `hoteisDoDia` (só os ativos, as políticas pelo registro do tenant e a versão da política) e `politicaSistemicaDoGrupo`;
  - a versão da política é `chave=id@atualizado_em` de cada linha que resolveu, separadas por `;`, ou `padrao`;
  - `FonteDoJob.ativos` e `FonteDoJob.corretivas` recebem o `desde`, e `corretivas` passa a entregar os chamados com as OS (`ChamadoDaFonte`);
  - a linha da métrica leva o detalhamento dos dois scores (`detalheReincidencia`, `detalheAtencao`), que vai para `detalhe_*`; a detecção leva o `detalhe` do insight (o score da atenção, ou o sinal sistêmico com a evidência);
  - o `calcularDia` tira do score o ativo baixado até `agora`.
- **Banco (`packages/db`):** `criarPortaDoJobDoIntelligence`, uma sessão por tenant numa unit of work só (`executarComoSistema`). As leituras e as gravações do dia estão na mesma transação: se algo falha, nada do dia fica, e o job seguinte refaz o dia. Só IO: as linhas saem como o banco as guarda.
- **Web (`apps/web/src/servidor/modulos/inteligencia/job.ts`):**
  - as portas do `executarDiaDoTenant` sobre a sessão, com os módulos e as políticas lidos uma vez;
  - a chave do insight por `node:crypto`, com o vetor do pgTAP 031;
  - `montarInteligencia().jobDoDia`, que a composição chama em `calcularDiaDoIntelligence`. A composição continua importando só `montarInteligencia`.
- **Testes:**
  - no motor: `fonte.test.ts`, o ativo baixado no `dia.test.ts`, e o `desde` e o chamado cancelado no `job.test.ts`;
  - no web: `job-inteligencia.test.ts`, com o vetor do hash e as portas sobre uma sessão em memória;
  - no banco: `job-inteligencia.test.ts`, contra Postgres real, só na CI.

**Fora deste PR:**
- o recálculo pontual por handler do outbox (ADR-036);
- o fechamento do mês (as tabelas do resumo mensal ainda não existem);
- as categorias com medição (PV1) e a preventiva (etapa P), que seguem sem origem;
- o agendamento no `vercel.json`.

### Ponto de retomada (10/10/2026)
- **PR aberto:** `int-job-ligacao` (fora da zona protegida).
- **Esperando o Kaio:**
  - quem lê o insight e a métrica diária;
  - as três decisões acima;
  - o comentário na issue #169;
  - a confirmação da vigência no recálculo;
  - a aprovação escrita do texto dos adendos ao ADR-034 e ao ADR-036, que também precisa do Cesar.
- **Depois do merge:** rodar a rota no dev, com o `CRON_SECRET` do dev, num tenant com o módulo, e conferir a métrica e a auditoria gravadas.

**Depois do merge (#184, 10/10/2026):**
- Na CI do PR, o job do banco rodou os testes de integração da ligação contra Postgres real: 7 da sessão do job no `packages/db` e 4 da ligação no web.
- **A rodada no dev fica para quando o painel for ler a métrica** (Cesar, 10/10/2026, opção c). A métrica só recebe INSERT, e o que o job gravasse no dev compartilhado ficaria lá para sempre.
- **Próximo:** esperar o Kaio nas aprovações acima. Depois:
  - o PR de zona protegida com as decisões de 10/10 no ADR-036;
  - as telas do painel lendo a métrica e o insight;
  - com elas, o agendamento da rota no `vercel.json` e a primeira rodada no dev.

## Decisões do Cesar de 10/10/2026, fim do dia, e o mock (`int-mock-ao-vivo-politicas`)

"Cesar aqui", 10/10/2026, no chat do agente do Intelligence.

1. **Quem lê a `app.metrica_ativo_diaria`:** a mesma regra do insight, "só quem decide". A métrica **nunca** tem mais leitores que o insight. Fica mantida a condição de gravar a versão da política e a da fórmula em cada resultado (ADR-036, condição de 07/10).
   - Já é o que a migração 0039 e o pgTAP 032 fazem. Nada muda no banco.
   - Como a regra é do Intelligence, o texto no ADR-036 ainda pede a aprovação escrita do Kaio. A frase "nunca mais leitores que o insight" entra junto, no PR de zona protegida das decisões de 10/10.
2. **#179, o selo "Ao vivo" da faixa de estado do painel:** sai do mock. O painel não promete atualização periódica.
   - O relógio e as contagens regressivas continuam andando no navegador, porque são contas sobre os dados da tela e não leitura nova.
   - A narração do tour não foi regerada. A fala 8 ainda diz que a contagem regressiva "corre ao vivo", o que continua valendo para a contagem.
3. **#179, quem altera as políticas:** o Admin do grupo, como no documento do projeto. É só texto do mock, sem migração.
   - A Marina passa a ser "Admin do grupo e Gestora do CSC", e o tour das políticas continua com ela.
   - A tela de políticas libera a edição só para quem é Admin do grupo e diz isso no aviso. O Gestor CSC da bandeira continua vendo "Somente o Admin do grupo altera políticas".
   - A versão do seed passou a 11: quem já abriu o mock recebe os dados novos, e as alterações salvas no navegador são descartadas.

As duas perguntas do #179 que estavam abertas ficam respondidas.

## `int-job-auditoria`: uma auditoria por execução do job (10/10/2026)

**Contexto ("Cesar aqui", 10/10/2026, noite).**
- Um texto com "Aprovo", redigido num chat do Claude, foi colado na sessão. Ele pedia:
  - tirar o Gerente do hotel da leitura;
  - uma janela de 180 dias;
  - auditoria com quem disparou;
  - recálculo com a política vigente no dia.
- O agente mostrou que o texto contradizia a `main` (0038, 0039, `PAPEIS_DO_INSIGHT`) e que o banco não guarda o histórico da `app.politica`.
- A revisão do mesmo texto, colada em seguida, **não vale como aprovação**: aprovação é escrita na issue, com o login de quem aprova. O Cesar deixou a aprovação da #169 para depois.
- **As posições abaixo seguem a revisão e aguardam as aprovações escritas de Cesar e de Kaio:**
  - **Quem lê e decide:** fica como está na `main`. Admin do grupo e Gestor CSC no próprio escopo; Gerente do hotel no próprio hotel, lendo e decidindo, sem ver insight de rede. Sem migração 0040.
  - **Janela de 180 dias:** já vale (a janela de leitura tem mínimo de 180 dias, e o job lê 365).
  - **Auditoria:** uma por execução em cada tenant, mesmo sem gravar nada, com quem disparou e as versões de fórmula e de política por hotel. Substitui a auditoria por dia da métrica do #184. O Cesar confirmou seguir com este PR.
  - **Recálculo:** o ADR-036 fica como está, com a política atual, em linhas novas marcadas. Recalcular com a política da época fica para quando houver um caso concreto; o ponto de partida será a configuração gravada no detalhe da métrica original, sem migração.

**O que o PR faz.**
- **Motor:** `executarDiaDoTenant` chama `registrarExecucao` no fim de toda execução num tenant com o módulo vigente, inclusive quando nada é gravado e no recálculo. Leva:
  - quem disparou (`disparadoPor`, 'cron' por padrão, ou o usuário do recálculo);
  - o resumo;
  - as versões das fórmulas (reincidência 1, atenção 2, sistêmico 2);
  - a versão da política de cada hotel do dia.
- **Tenant sem o módulo:** não ganha registro, porque o job não grava nada nele (I7).
- **Banco:** a auditoria `job_inteligencia`, com a ação `calcular_dia` ou `recalcular_dia`, sem usuário (é o worker); quem disparou vai no `depois`. A auditoria `gravar_dia` da métrica saiu.
- **Testes:** o registro no `job.test.ts`, a sessão em memória do web e a integração do `packages/db`, que só roda na CI.

## As telas do painel: decisões do Cesar e a base (`int-telas-base`, 10/10/2026)

**Decisões do Cesar** ("Cesar aqui", 10/10/2026, no chat do agente do Intelligence, depois do merge do #187):
- **Linha do tempo do insight:** fica fora do 1.0. A página do insight mostra só as datas do próprio registro: primeira e última detecção, responsável, e quem encerrou e quando. A linha do tempo completa fica para uma tabela própria depois do piloto. Isso muda o "Histórico" da proposta das telas (`docs/referencia/proposta-telas-intelligence-1-0.md`).
  - Motivo: não há tabela de transições, e a RLS da `app.auditoria` deixa a auditoria do insight de rede (`hotel_id` nulo) só para o Admin do grupo; o Gestor CSC da bandeira ficaria sem histórico.
- **Auditoria do insight sem `hotel_id`:** as auditorias `abrir` e `atualizar_deteccao` passam a ser gravadas com `hotel_id` nulo, como a `job_inteligencia`. Hoje a RLS da `app.auditoria` (`hotel_id in authz.hoteis_escrita()`) deixa o técnico e o solicitante do hotel lerem essas linhas pelo banco, o que contraria "só quem decide lê o insight". Nenhuma tela ou rota mostra essas linhas, e o job ainda não rodou no dev. Entra no PR do servidor, sem migração.
- **Item de menu "HubKeep Intelligence":** a moldura do núcleo (`apps/web/src/cliente/moldura.tsx`) ganha o item, que aparece quando a rota `GET /api/v1/inteligencia/resumo` responde: 404 sem o módulo ou sem papel que decide; a contagem dos abertos quando há. A moldura não importa o pacote do Intelligence. Fica registrado também no diário do núcleo, no PR das telas.

**A ordem dos PRs:**
1. `int-telas-base` (este): a liberação do lint e o `packages/ui`.
2. O servidor: a leitura e a decisão do insight, com hk_app (porta, casos de uso, contratos, rotas `/api/v1/inteligencia/...`), a regra do responsável e a auditoria sem `hotel_id`.
3. As telas: a lista, a página do insight e o detalhe do ativo, o item de menu e os textos nos quatro idiomas.

**O que este PR faz:**
- **Lint:** a tela em pasta `inteligencia` do `apps/web/src/app` passa a importar o código de cliente do web (`cliente/api`, `i18n/cliente`) por caminho relativo, como qualquer página. É o que o adendo de 06/10/2026 ao ADR-026 já diz ("veem o que a rota e a página veem"); a configuração liberava só o servidor do web. A pasta do módulo no servidor continua fora do alcance da tela. Casos novos no `tests/fronteiras.test.ts`; os dois "permite" falham sem a mudança.
- **`packages/ui`:** `Indicadores` (`hk-indicadores`, a fileira que se ajusta à largura, com nome de grupo opcional para o leitor de tela) e `Dados` (`hk-dados`, pares de rótulo e valor numa `dl`, em uma coluna no celular), como a proposta das telas previa.

## `int-insight-servidor`: a leitura e a decisão do insight no servidor (10/10/2026)

Segundo dos PRs das telas do painel (a ordem e as decisões do Cesar estão na seção do `int-telas-base`). **Zona protegida**, com a migração 0040; o merge e o `db push` são do Cesar.

**Correção: a auditoria sem `hotel_id` pede migração.** Na seção do `int-telas-base`, o agente escreveu que a mudança era "sem migração". Para o job, que grava com o `hk_worker`, é verdade. Para a decisão de uma pessoa, não: a primeira CI do #189 falhou com `new row violates row-level security policy for table "auditoria"`. O INSERT da `app.auditoria` pelo `hk_app` só aceita `hotel_id` nulo do Admin do grupo e do implantador. Com isso, o Gestor CSC também não conseguiria auditar a decisão de um insight de rede.
- **Decisão do Cesar** ("Cesar aqui", 10/10/2026, no chat do agente do Intelligence): a migração 0040, no próprio #189, para não ter dois PRs abertos.
- **O que a 0040 muda:** só o INSERT da `app.auditoria`, no molde do fornecedor (0033). A linha pode ter `hotel_id` nulo quando:
  - a entidade é `insight`;
  - quem grava tem papel de Gestor CSC ou de Gerente do hotel;
  - o insight existe e é visível a quem grava (a subconsulta passa pela RLS da `app.insight`).
- **A leitura não muda:** a linha sem hotel continua só do Admin do grupo.
- **Pedido ao núcleo:** a `app.auditoria` é tabela do núcleo, e este pedido fica registrado aqui, no diário de quem pede. O Cesar aprovou no chat.
- **pgTAP 031:** nove casos novos (de 53 para 62). O Gerente e o Gestor gravam a auditoria do insight que veem, e só dele; o técnico não grava; só o Admin do grupo lê.

**Correção sobre o #188 (`int-telas-base`):** ele era de zona protegida, porque o `eslint.config.mjs` está na lista do `.github/workflows/zona-protegida.yml`. O agente o abriu achando que estava fora; a descrição do PR foi corrigida, e o Cesar fez o merge com bypass. A lista que vale é a do workflow.

**O que o PR faz.**
- **Motor (`packages/inteligencia/src/painel.ts`):** o painel em código puro, por portas, como o job.
  - **Casos de uso:** `resumoDoPainel`, `listarInsights`, `verInsight` e `decidirInsight`.
  - **Portão:** sem o módulo vigente, ou sem papel que decide insight, o painel responde 404 `inteligencia_indisponivel`, e o menu não mostra o item.
  - **Responsável:** quem toma a primeira ação vira o responsável (aprovado por Cesar, #166).
  - **Substituição:** "substitui" e "substituído por" pelo vínculo `anterior_id`.
  - **Página do insight:** os chamados da evidência que quem lê vê, e a série de 12 semanas.
  - **Decisão:** a transição de `decidirNoInsight`, com a trava de versão.
- **Banco (`packages/db/src/repositorios/inteligencia-painel.ts`):**
  - **Leitura pelo `hk_app`:** contagens, lista com filtros (estado, tipo, faixa, hotel; até 500), insight com a evidência, ligados, chamados e nomes.
  - **Decisão na unit of work:** auditoria com a ação da pessoa e evento `insight.decidido`.
- **Auditoria do insight sem `hotel_id`:** vale nas três ações, `abrir` e `atualizar_deteccao` do job e a decisão (Cesar, 10/10/2026).
- **Web:**
  - a montagem do módulo ganhou `painel`, e a composição, `casosDeUsoDoPainelDoIntelligence`;
  - quatro rotas: `GET /api/v1/inteligencia/resumo`, `GET /api/v1/inteligencia/insights`, `GET /api/v1/inteligencia/insights/{id}` e `POST /api/v1/inteligencia/insights/{id}/decisao`;
  - contratos e OpenAPI;
  - as mensagens `erro.inteligencia_indisponivel` e `erro.insight_nao_encontrado` nos quatro idiomas.
- **Testes:**
  - o motor em memória (`test/painel.test.ts`);
  - a ligação no web, com as listas da API iguais às do motor;
  - a integração do `packages/db` (`test/painel-inteligencia.test.ts`), que só roda na CI. Ela cobre quem lê o quê por papel, os ligados, os chamados recortados pela RLS, a trava de versão e o técnico sem leitura da auditoria do insight.

**Fica para depois, fora deste PR:**
- **Reatribuição** do responsável pelo Admin do grupo e pelo Gestor CSC (aprovada, #166). Pede a lista de quem pode receber o insight; entra num PR próprio.
- **Detalhe do ativo** (a terceira tela): a leitura da `app.metrica_ativo_diaria`. Entra num PR próprio, antes da tela.
- **Efetividade** nos três lugares e o **recálculo sob demanda** na página do insight. Ficam depois das três telas.
- **Número do insight:** a proposta das telas tem a coluna "número do insight" ("INS-0133" no mock), mas a `app.insight` não tem número sequencial. Até haver decisão, a tela mostra o tipo e o escopo como link.

## `int-ativo-metrica`: o detalhe do ativo lendo a métrica diária (10/10/2026)

Continuação do #189: a leitura que a terceira tela, o detalhe do ativo, vai usar. Fora da zona protegida, sem migração. A branch partiu da `int-insight-servidor`, e o PR abre depois do merge do #189.

- **Motor (`verAtivo`, em `painel.ts`):**
  - **O que a página traz:** a atenção de cada dia gravado nos últimos 90 dias, o último dia com o detalhe (o `Score`, que já traz os componentes e o limite do insight na configuração) e os insights de atenção do ativo.
  - **Qual resultado:** o original de cada dia, o primeiro cálculo sem recálculo (decisão de 07/10/2026, aprovada por Cesar na #166).
- **Quem vê:** só quem decide o insight do hotel do ativo. Para os outros, a resposta é `ativo_nao_encontrado`, porque a métrica nunca tem mais leitores que o insight (Cesar, 10/10/2026). A RLS da métrica (0039) já faz o mesmo no banco; o portão na aplicação evita a página com o ativo e sem a métrica para quem lê o ativo por outro papel.
- **Banco:**
  - `ativoDoPainel` traz o ativo com a bandeira do hotel;
  - `metricasDoAtivo` traz o primeiro cálculo de cada dia sem recálculo (`distinct on (dia)`) a partir da data pedida;
  - `insightsDoEscopo` traz os insights de um tipo com um par no escopo. O tipo e a chave vêm do motor.
- **Web:** `GET /api/v1/inteligencia/ativos/{id}`, com o contrato `RespostaDoAtivoNoIntelligence` e a entrada no OpenAPI.
- **Testes:**
  - no motor, a série, o último dia, a página sem dados e quem não decide;
  - no web, a resposta passando pelo contrato;
  - na integração do `packages/db`, só na CI: o recálculo fica fora, o dia antes da data também, e o técnico lê o ativo mas não a métrica nem o insight.
- **Para as telas (acrescentado no mesmo PR):**
  - **Nomes:** a resposta passa a trazer `ativos`, o nome dos ativos citados no escopo dos insights (`ativoId`), para o título da linha do insight de atenção.
  - **`explicacaoDoSinal`:** a evidência do sinal sistêmico vira chave de catálogo e valores. A regra do mesmo modelo tem frase própria; as outras usam a frase nova `inteligencia.sistemico.evidencia.generica`, com chamados, hotéis e janela, nos quatro idiomas, até ganharem a sua.

## `int-telas`: as três telas do painel (10/10/2026)

Terceiro dos PRs das telas (a ordem está na seção do `int-telas-base`). Fora da zona protegida. A branch partiu da `int-ativo-metrica` e só vira PR depois dos merges do #189 e do PR do detalhe do ativo.

- **Rotas:** `apps/web/src/app/(painel)/inteligencia/`, no elemento liberado do lint.
  - `insights/` é a lista;
  - `insights/[id]/` é a página do insight;
  - `ativos/[id]/` é o detalhe do ativo;
  - `comum.tsx` reúne os selos, o título e o escopo, as datas e os dois gráficos em SVG.
- **Lista:**
  - a nota do módulo opcional;
  - os quatro indicadores do resumo;
  - os filtros por estado, tipo, faixa e hotel; o de hotel só aparece com mais de um hotel visível;
  - a tabela com faixa, o que é, escopo, score, estado, responsável e última detecção;
  - a substituição nos dois sentidos, em link.
  - O título do insight de atenção é o nome do ativo; o do sistêmico, o nome da regra.
- **Página do insight:**
  - o cabeçalho com as datas do registro, sem linha do tempo (decisão do Cesar);
  - "Por que estou vendo isso?": no sistêmico, a regra, a evidência e o aviso do sinal; na atenção, o limite, os três fatores e o aviso do score;
  - os chamados por semana, com os números também em texto;
  - os chamados da evidência que quem lê vê (sistêmico), ou o ativo, com link para o detalhe (atenção);
  - a coluna de decisão: as ações do estado, o formulário de resolver ou descartar (motivo, aviso dos 30 dias, nota obrigatória) e o texto de quem decide por escopo. Quem não decide vê "Você não decide este insight".
- **Detalhe do ativo:**
  - os quatro indicadores: atenção com o limite, criticidade, horas paradas e impacto em hóspedes, tirados do detalhe gravado;
  - os três fatores;
  - a atenção dos últimos 90 dias sobre as faixas, com a linha do limite, o resumo em texto e os valores dia a dia num `details`;
  - a composição do score, com a nota de cada linha e o aviso do peso dividido, e os UH-dias numa linha discreta no fim (decisão 5);
  - "Como este resultado foi gravado" (`Dados`);
  - os insights do ativo.
  - A página não decide nada.
- **Moldura:** o item "HubKeep Intelligence" com a contagem dos abertos, pela rota do resumo, registrado também no diário do núcleo.
- **Textos:** 116 chaves novas nos quatro idiomas.
- **Testes:** as três telas renderizadas nos quatro idiomas e no pseudo-idioma, sem chave crua, mais casos de conteúdo e de quem decide; e a moldura com o item novo.
- **Fora destas telas:**
  - a efetividade nos três lugares e o recálculo sob demanda;
  - o número do insight, que espera decisão: a tela usa o título como link;
  - a ficha do ativo do núcleo, que não tem rota de detalhe, então não há link para ela.
- **Não conferido no navegador:** o dev não tem a 0040, e nenhum job rodou lá. A primeira rodada, com o `vercel.json`, fica para depois do merge.
- **Atualização (12/10/2026):** a `main` com o #190 e o #191 entrou no branch. O único conflito foi no diário do núcleo, onde cada lado acrescentou uma seção; as duas ficaram. Typecheck, lint e testes verdes no local. O dev já tem a 0040 (conferido no fechamento de 10/10), mas nenhum job rodou lá, então as telas ainda não foram conferidas no navegador com dados; isso fica antes do merge do PR.
- **Merge:** o Cesar fez o merge do #192 sem a conferência no navegador (12/10/2026). Ela fica para a seção seguinte, com o job rodado no dev.

## `int-job-agendamento`: o job diário no `vercel.json` e a primeira rodada no dev (12/10/2026)

Decisões do Cesar de 12/10/2026, no chat do agente do Intelligence ("Cesar aqui"), depois do merge do #192. PR fora da zona protegida.
- **Horário:** uma vez por dia às 03:00 de Brasília, `0 6 * * *` no `vercel.json` (o cron da Vercel é em UTC). A rota já existia (#184) e ficava fora do agendamento até o painel ler a métrica.
- **Primeira rodada no dev**, pelo web local apontando para o `HubKeep-dev`, com um `CRON_SECRET` só daquela rodada, sem gravar em arquivo. **Aviso à equipe:** a métrica só recebe INSERT, e as linhas desta rodada ficam no dev compartilhado.
  - Sem o módulo, a rota respondeu 200 e não leu nada: o Grupo Demonstração do kit não tinha o Intelligence contratado.
  - **Módulo contratado no dev**, com a autorização do Cesar: `pnpm ops:modulo` no tenant do kit (`0199a1f0-de30-7000-8000-00000000de30`), `inteligencia` a partir de 10/10/2026 00:00 de Brasília, sem prazo, "por Cesar". O `--dry-run` foi conferido antes.
  - Segunda rodada: 200, 1 tenant, 7 ativos, 7 métricas gravadas, nenhum insight (os chamados do kit não passam do limite da atenção) e nenhuma falha.
- **A resposta da rota** soma só os números de cada tenant, então o `semModulo` não aparece nela; a primeira rodada só se explicou pelo kit. Fica registrado, sem mudança neste PR.
- **Telas no navegador:** o detalhe do ativo já tem métrica para conferir; a página do insight só terá dados quando algum insight abrir no dev.

## `int-visibilidade-telas`: as telas só a partir da abertura (12/10/2026)

Primeira das cinco atividades pedidas pelo Kaio em 12/10/2026, nesta ordem: (1) visibilidade das telas no piloto; (2) o job na escala da rede (teste de carga, observabilidade e recálculo de um período); (3) histórico de demonstração; (4) glossário único de métricas; (5) o `docs/piloto/` atualizado a cada entrega. O agente para a cada proposta de desenho e a cada PR de zona protegida.

**Decisão do Cesar** ("Cesar aqui", 12/10/2026, nesta sessão do agente do Intelligence, operada com a conta do Kaio). Texto que ele mandou:
> "Eu, Cesar, aprovo a proposta inteligencia.visibilidade_telas e o adendo ao ADR-035, com estas decisões:
> 1. Papéis na política, padrão Admin do grupo e Gestor CSC; o Gerente do hotel pode ser incluído depois só por configuração.
> 2. O Admin do grupo também não vê as telas antes da data; ele vê a data de abertura na configuração e pode antecipá-la pela política.
> 3. Os 60 dias contam a partir do início do PRIMEIRO contrato do módulo no tenant, e não do contrato vigente. O aPartirDe continua sendo a forma de ajustar.
> 4. O corte do dia usa o fuso configurado do grupo, com Brasília como padrão, para não depender da célula."
- **Aprovação do Kaio** ao adendo ao ADR-035, em 13/10/2026, nesta sessão: "Eu kaio, aprovo o adendo. Siga". Com as duas, o status no `docs/03` passou a "aprovado pelos dois".
- **Duas lacunas, levantadas pelo agente antes de agir; o Cesar respondeu "Prossiga" e o agente seguiu as próprias recomendações:**
  - o grupo não tem fuso gravado (`app.tenant` não tem a coluna `fuso`): vale Brasília até o núcleo criar a coluna (pedido abaixo);
  - o adendo está no `docs/03`, que é zona protegida (`.github/workflows/zona-protegida.yml`): um PR só, de zona protegida, com o código e o adendo.

**Pedidos ao núcleo** (registrados aqui, no diário de quem pede; o Cesar avisa o agente do núcleo):
1. **`escopos` na `ExtensaoDePolitica`** (`packages/dominio/src/politicas.ts`): uma lista opcional dos níveis em que a chave pode ser gravada, por exemplo `escopos: ['grupo']`, e o `gravarPolitica` recusando os outros níveis com código. Hoje o registro aceita `inteligencia.visibilidade_telas` gravada no hotel; o motor só ignora esse valor na leitura.
2. **Fuso do grupo:** uma coluna `fuso` na `app.tenant`, com padrão `America/Sao_Paulo`, validada na aplicação como a do hotel (ADR-005), e a leitura na `PortaConfiguracao`. É migração de tabela do núcleo e zona protegida. Quando existir, só a ligação do painel no web muda (`fuso` em `apps/web/src/servidor/modulos/inteligencia/painel.ts`).

**O que o PR faz.**
- **Motor (`packages/inteligencia/src/visibilidade.ts`):**
  - a chave `inteligencia.visibilidade_telas` (a sétima do ADR-035), com o formato `{ aPartirDe, diasAposAtivacao, papeis }` e o padrão `{ null, 60, ['admin_grupo', 'gestor_csc'] }`;
  - `aberturaDasTelas`: a data, ou o dia do início do primeiro contrato do módulo mais os dias, às 00:00 no fuso; o dia da ativação também é o do fuso;
  - `diaNoFuso` e `inicioDoDiaNoFuso`, só com `Intl`, sem pacote novo;
  - `atribuicoesQueVeem` e `telasAbertas`.
- **Painel (`painel.ts`):**
  - o portão `exigirPainel` passa a exigir a abertura e um papel da política; quem não passa recebe o mesmo 404 `inteligencia_indisponivel` de antes, nas rotas, nas telas e no item do menu;
  - quem tem também um papel fora da política decide só pelos papéis dela; a leitura continua a da RLS;
  - `aberturaDoPainel`: a data, a origem, a configuração efetiva e se já abriu, só para o Admin do grupo com o módulo vigente, também antes da abertura.
- **Web:**
  - a ligação lê a política só no nível do grupo, pela `PortaConfiguracao`, e passa Brasília como fuso;
  - `GET /api/v1/inteligencia/abertura`, com o contrato `RespostaDaAberturaDoIntelligence` e a entrada no OpenAPI;
  - a página `/inteligencia/abertura`, para o Admin: a data, de onde vem, quem vê, e o formulário que grava a política no grupo por `PUT /api/v1/politicas` (e "Voltar ao padrão");
  - a moldura: com o resumo em 404 e a abertura em 200 (o Admin antes da abertura), o item aparece sem contagem e leva à página da abertura; a lista de insights ganha o link para o Admin;
  - 17 chaves novas nos quatro idiomas.
- **Testes:** o formato da chave, o corte do dia em Brasília e num fuso com horário de verão, o primeiro contrato contra o vigente, a data antes e depois, o portão por papel e por data no motor, a política do hotel ignorada e o contrato da API no web, e a página da abertura nos quatro idiomas e no pseudo-idioma.
- **Docs:** o adendo ao ADR-035 no `docs/03`; `docs/piloto/` (README, manual por papel e roteiro de treinamento).
- **Sem banco:** nenhuma migração, policy ou função.

**Limites conhecidos:**
- O resumo do menu conta pela RLS. Quem tem um papel fora da política, além de um dentro dela, pode ver na contagem e na lista algum insight que só o outro papel lê; ele não o decide.
- No dev, o Grupo Demonstração do kit tem o módulo desde 10/10/2026. Sem política gravada, as telas lá fecham até 09/12/2026. Para conferir as telas no dev, o Admin do kit grava uma data na página da abertura.

**Não conferido no navegador:** as telas foram testadas renderizadas no servidor, sem rodar o app.

**PR:** não aberto em 12/10/2026, porque o #203 (PV1 do núcleo, zona protegida) estava aberto, e depois o #206 e o #209. Aberto em 13/10/2026, quando o Cesar avisou que a fila de zona protegida estava livre ("Cesar aqui", 13/10/2026), com a `main` mesclada na branch.

## `int-carga-job`: o job diário na escala da rede, os números (13/10/2026)

Atividade 2a do Kaio de 12/10/2026, depois do `int-visibilidade-telas`, que espera o merge do #203 para virar PR. O relatório completo, com o método e as tabelas, está em `docs/referencia/carga-job-inteligencia.md`.
- **Onde:** um Postgres 16 descartável no contêiner do agente, com as migrações; não o dev compartilhado, porque a métrica só recebe INSERT.
- **Números:** com 40 hotéis, 10 mil ativos e 73 mil chamados e OS no ano, uma rodada do tenant leva de 4 a 5 s. Com o dobro de chamados, de 7 a 11 s. Quase todo o tempo vai na leitura dos chamados do período e na gravação das 10 mil linhas da métrica; o cálculo fica abaixo de 1,3 s. O heap de uma rodada vai de 350 a 690 MB.
- **Vercel:** pela busca na documentação (o vercel.com está bloqueado no contêiner), 300 s de padrão e 800 s de máximo no Pro, com o Fluid compute. Uma pessoa precisa conferir na página o limite da função chamada pelo cron.
- **Otimizações:** nenhuma neste PR, como o Kaio pediu. Os números vão primeiro para ele.
- **Arquivos:** o gerador `scripts/carga/inteligencia-sintetico.sql` e o executor `apps/web/test/carga-inteligencia.test.ts`, pulado sem `HK_CARGA_URL_WORKER`, também na CI.

## `int-carga-job` (continuação): observabilidade do job e recálculo de um período (13/10/2026)

Atividades 2b e 2c do Kaio de 12/10/2026, com a proposta aprovada pelo Cesar nesta sessão ("Cesar aqui. Prossiga", 13/10/2026). Ficam na mesma branch da carga, num PR só para o job na escala da rede. A referência de operação é `docs/referencia/observabilidade-job-inteligencia.md`.
- **2b, observabilidade:** a rota `/api/cron/inteligencia` passa a gravar uma linha de log por tenant (`inteligencia.job.tenant`: duração, resultado `ok`, `sem_modulo` ou `falha`, e os números do resumo) e uma por rodada (`inteligencia.job.rodada`). Ao fim de cada rodada, manda um check-in ao monitor `inteligencia-job-diario` do Sentry. O check-in é `ok` quando todos os tenants rodaram e `error` quando um falhou ou a rota não rodou (503 ou 500). O monitor tem o horário do `vercel.json`, e um teste confere que os dois são iguais; sem check-in no horário, o Sentry marca a rodada como perdida. O 401 não manda check-in. Sem `SENTRY_DSN`, fica só o log.
- **Núcleo:** o `rotaDeCron` (`servidor/cron.ts`) não mudou: a observação envolve a rota e o job só do Intelligence. No `servidor/sentry.ts`, que é do núcleo, entrou a função `enviarCheckInAoSentry`. Ela é genérica e serve a outro cron que queira monitor. Avisar o agente do núcleo.
- **Alerta:** o monitor abre um problema no Sentry na primeira falha ou falta. Para isso virar aviso a uma pessoa, falta configurar no projeto do Sentry a regra de alerta e quem a recebe. Esse passo é do Cesar, depois de o `SENTRY_DSN` entrar na Vercel; o passo a passo está na referência.
- **2c, recálculo:** `pnpm ops:recalcular-inteligencia --ambiente dev|staging --tenant <uuid> --de AAAA-MM-DD --ate AAAA-MM-DD --por "<quem>" [--dry-run]`, no molde do `ops:provisionar`, que confere o alvo antes de conectar. Dia a dia, cada um numa transação do `hk_worker`, o comando roda o modo de recálculo do motor (ADR-036). Esse modo grava outra linha por ativo, com o número de cálculo seguinte, a marca de recálculo e as versões das fórmulas de hoje. Não abre nem atualiza insight. A auditoria registra `recalcular_dia`, com `disparadoPor` `ops:<quem>`. O comando aceita no máximo 366 dias e só dias que já terminaram (UTC). Produção fica fora, até o roteiro de operação dela (F0-12). O `--dry-run` roda cada dia inteiro e desfaz a transação.
- **Conferido no Postgres da carga:** o `--dry-run` não gravou nada. A rodada real gravou o cálculo 2, com `recalculo = true`, nos 10 mil ativos de cada dia, e deixou intactas as linhas originais. A auditoria registrou `ops:Kaio`. Cada dia levou cerca de 6 s.
- **`.env.example`:** entraram as variáveis do executor de carga e do recálculo, montadas pelos scripts.

## Atividade 3, proposta: histórico de demonstração do Intelligence (13/10/2026)

Terceira atividade do Kaio de 12/10/2026: um grupo com cerca de seis meses de histórico sintético, em que os insights aparecem. Só dev e staging, com a mesma trava do kit contra produção. Combinar com o agente do núcleo, por este diário, se o gerador mora junto do kit. Antes do código, **o agente para aqui** para Cesar e Kaio decidirem.

**O que o agente encontrou:**
- O kit (`apps/web/test/demonstracao/semear.ts`, do núcleo) grava tudo pelos casos de uso, com a unit of work. Ele já aceita outro tenant e outro domínio (`semearDemonstracao({ tenantId, dominio })`, o mesmo caminho das turmas).
- **O passado não entra pelos casos de uso de hoje.** O chamado é aberto na hora do `relogio` da composição (`relogioDoSistema`). A transição da OS aceita a hora do aparelho (`feitaEm`), mas nunca depois de agora e nunca antes da transição anterior. Então seis meses atrás só entram com um relógio do roteiro.
- O outbox só tem manipulador para `membro.convidado`. Os eventos do passado não mandam e-mail nem push.
- O job do dia já recebe o relógio (`DepsDoJobDoDia.relogio`). Rodado dia a dia com o relógio no fim de cada dia, ele grava a métrica e abre os insights na data em que abririam de verdade. O recálculo não serve aqui, porque não abre insight.
- As telas abrem 60 dias depois do primeiro contrato do módulo. Com o módulo contratado seis meses atrás, o grupo já nasce com as telas abertas.
- Os agentes não acessam o dev. Quem roda no dev é o Cesar, e a CI roda o teste no Supabase do runner.

**Decisões pedidas** (recomendação do agente em cada uma):

1. **Onde mora o gerador.** Recomendação: um arquivo do Intelligence ao lado do kit, `apps/web/test/demonstracao/historico-inteligencia.ts`, com o comando `pnpm demo:historico --ambiente dev|staging`.
   - O comando segue o molde do `demo:dados`: `AMBIENTES_PERMITIDOS = ['dev', 'staging']`, o ref conferido antes de conectar, nada em argv, e a `HK_DEMO_SENHA` pela variável de ambiente.
   - A base do grupo sai do próprio kit, chamando `semearDemonstracao` como as turmas chamam, sem mudar o `semear.ts`. Os seis meses vêm por cima.
   - A alternativa era pôr o histórico dentro do `semear.ts`: dois agentes mexeriam no mesmo arquivo, e o kit ficaria mais lento para quem só quer os chamados em cada estado.
2. **Que grupo.** Recomendação: um tenant próprio, "Grupo Demonstração — Intelligence", com e-mails `@intelligence.demo.hubkeep.test`.
   - O grupo do kit fica como está, com os chamados em cada estado para o teste manual e a métrica que o job grava desde 10/10.
   - Seis meses de chamados enterrariam esses casos nas listas.
3. **Como gravar o passado.** Recomendação (A): pelos casos de uso, com um relógio do roteiro que anda dia a dia. Auditoria, outbox, SLA e status saem iguais aos de verdade, só que com a data do roteiro.
   - Isso pede à composição uma forma de montar os casos de uso de chamado, execução e sincronização com outro relógio. É arquivo do núcleo (pedido 2 abaixo).
   - A alternativa (B) é SQL direto pelo dono, como o gerador da carga. É mais rápida, mas pula a unit of work (regra 6) e grava dado permanente no dev compartilhado fora dela. O agente não recomenda.
4. **Métrica e insights.** Recomendação: depois da operação de cada dia, rodar o job normal daquele dia, com o relógio às 23:59:59 do dia, do primeiro ao de ontem.
   - Algumas decisões das pessoas também entram no roteiro, pelos casos de uso do insight e com o relógio do dia: um insight reconhecido, um descartado como "não relevante" e um resolvido.
   - Assim a página do insight mostra os três destinos.
5. **Roteiro determinístico, não aleatório.** Semente fixa, e um cenário plantado para cada sinal do motor, com ruído normal em volta:
   - um ativo de atenção alta, com o score subindo nas últimas semanas;
   - reincidência no mesmo ativo;
   - sinal sistêmico em quatro formas: mesmo modelo em vários hotéis, mesmo andar, mesma área comum e mesmo fornecedor;
   - crescimento de chamados de uma categoria;
   - um candidato a substituição, pelo custo acima do limite;
   - efetividade de uma ação: chamados antes e depois de uma troca.
   Rodar de novo não duplica nada, porque as operações offline têm chaves fixas, como no kit.
6. **Volume.** Recomendação:
   - 2 bandeiras, 6 hotéis e uns 60 ativos por hotel;
   - cerca de 3 chamados por dia em cada hotel, uns 3.300 chamados em 183 dias;
   - pela carga (cerca de 6 s por dia para 10 mil ativos), o job dos 183 dias cabe em poucos minutos, e a operação pelos casos de uso em uns 10 minutos.
   O Kaio ajusta o volume e os cenários (detalhe, ADR-033).
7. **Teste.** Um `historico-inteligencia.test.ts` na CI, no Supabase do runner, como o `semear.test.ts`.
   - Ele roda um roteiro curto (cerca de 45 dias, com os cenários comprimidos) e confere que cada cenário plantado abriu o insight esperado.
   - Também confere que produção é recusada.

**Pedidos ao agente do núcleo** (resposta no `docs/diario-fase-1b.md`):
1. Que o gerador do Intelligence more em `apps/web/test/demonstracao/`, ao lado do kit, chamando `semearDemonstracao` sem alterá-la. Se o kit mudar a assinatura, o teste do histórico quebra na CI e avisa.
2. Na `composicao.ts`, uma montagem dos casos de uso de chamados, execução, sincronização e checklists que receba o relógio, por exemplo `casosDeUsoComRelogio(relogio)`. As exportações de hoje continuariam com o `relogioDoSistema`. Uso fora da Vercel, só pelo gerador, como a conta do kit (ADR-024). O agente do Intelligence pode fazer essa mudança no PR dele, se o núcleo preferir, registrada no diário da 1b.

**Fora desta atividade:** produção (nunca) e o staging antes do `[remotes.staging]` (F0-12; o comando o recusa como o `demo:dados`). Também fica fora qualquer mudança no motor ou nas fórmulas.

**Aguarda:** a decisão de Cesar e Kaio nos itens 1 a 7, e a resposta do agente do núcleo aos dois pedidos. Nenhum código foi escrito.

## Atividade 3: decisões e o roteiro do histórico de demonstração (13/10/2026)

**Decisões de Cesar e Kaio** (mensagem do Cesar nesta sessão, 13/10/2026, com as decisões dos dois):
1. Aprovado: o gerador em `apps/web/test/demonstracao/historico-inteligencia.ts`, com `pnpm demo:historico --ambiente dev|staging` e a mesma trava do kit contra produção.
2. Aprovado: um tenant próprio, "Grupo Demonstração — Intelligence".
3. Aprovado o uso dos casos de uso com o relógio do roteiro, com condições:
   - a montagem com relógio controlável é separada e só serve ao gerador e aos testes. O web em funcionamento continua com o relógio do sistema, sem parâmetro para trocá-lo;
   - um teste de guarda impede o código do web em funcionamento de importar essa montagem, e ela recusa rodar contra produção;
   - quem implementa a montagem é o agente da 1b; o PR do Intelligence só a usa. O pedido à 1b vai pelo Cesar.
4. Sem SQL direto.

Siga com o roteiro, o volume e o teste curto da CI, sem a parte que depende da montagem, até ela entrar na `main`. O PR da visibilidade das telas ([#212](https://github.com/cesarcoutohubtech/hubkeep/pull/212)), que vinha antes, já estava na `main` desde 13/10.

### Pedido ao agente da 1b (pelo Cesar): a montagem com o relógio do roteiro

O que o gerador precisa, com as condições do item 3:
1. Uma montagem separada da `composicao.ts`, que recebe o relógio, com os casos de uso que o histórico usa:
   - cadastros: bandeiras, hotéis, locais, categorias, códigos, fornecedores, ativos e configuração;
   - chamados, triagem, execução da OS (com o executor e o custo) e paradas.
   O web em funcionamento não a importa (teste de guarda), e ela recusa o alvo de produção.
2. **O instante precisa chegar ao banco, não só ao caso de uso.** Hoje o `criado_em` de `app.chamado`, `app.os` e `app.ativo` vem do `default now()` da coluna, e os repositórios não o gravam. A leitura do job usa essas colunas: o chamado entra por `criado_em <= agora`, e o ativo só existe a partir do `criado_em`. Então, com o relógio só no caso de uso, o chamado de seis meses atrás nasceria com a data de hoje.
   - A `app.os_transicao.quando` já vem de `feitaEm`, e a `app.parada_ativo.inicio` vem do domínio. Essas duas só precisam do relógio da montagem.
   - Sugestão do agente: a auditoria e o outbox ficam com o instante real da gravação, porque registram quando o dado entrou de fato. A 1b decide.
3. O módulo do Intelligence já recebe o relógio pelas dependências (`montarInteligencia().jobDoDia` e `.painel`). O job do dia e as decisões do insight não entram no pedido.

### O que foi feito (branch `claude/vigilant-cray-l06ew1`, sem PR)

- `apps/web/test/demonstracao/historico-inteligencia.ts`: o roteiro, uma função pura e determinística, `roteiroDoHistorico({ fim, volume?, semente? })`.
  - Ela descreve o grupo, os chamados com a OS e a parada de cada um, e as decisões sobre cada insight.
  - Também descreve a política `inteligencia.sistemico` do grupo, com as cinco regras ligadas e os valores padrão.
  - As decisões contam em dias desde a abertura do insight, porque quem abre é o job. A gravação entra neste arquivo depois da montagem da 1b.
- `apps/web/test/demonstracao/historico-inteligencia.test.ts` (CI, sem banco), com 5 testes:
  - O job de cada dia (`executarDiaDoTenant`) roda sobre o roteiro, com portas em memória, e as decisões mudam o estado dos insights.
  - Ele confere quatro coisas: o roteiro é determinístico; tem o volume da proposta; a OS segue as transições do domínio; cada cenário abre um só insight e termina no estado planejado.
  - Também confere que o ruído não abre nenhum insight, e que a reincidência, a substituição e a efetividade aparecem nos ativos dos cenários.
- **Volume completo** (o do dev e do staging):
  - 2 bandeiras, 6 hotéis e 336 ativos (56 por hotel);
  - 4.314 chamados: 3.272 nos 183 dias do histórico e o resto no aquecimento (abaixo).
- **Os cenários** (fim em 12/10/2026, volume completo):

| Cenário | Sinal | Abre em | Termina |
|---|---|---|---|
| Elevador social do hotel 5 | atenção; depois, efetividade (redução observada) | 01/05 | resolvido |
| Exaustão na cozinha do hotel 4 | mesma área comum | 31/05 | descartado (não relevante) |
| Câmaras frias da bandeira 1, mesmo fornecedor | mesmo fornecedor | 20/07 | em ação |
| Caldeira do hotel 2 | atenção | 31/07 | em ação |
| Infiltração no 3º andar do hotel 3 | mesmo andar | 07/08 | resolvido |
| Ar Polar Inverter 18000 nos 6 hotéis | mesmo modelo | 29/08 | aceito |
| Entupimento no hotel 4 | crescimento | 22/09 | em revisão |
| Disjuntor da lavanderia do hotel 6 | mesma área comum | 08/10 | novo |
| Ar de uma UH do hotel 1 | reincidência (sem insight, na tela do ativo) | — | — |
| Lava-roupa de 12 anos do hotel 6 | substituição (avaliar substituição) | — | — |

**Desvios da proposta, para o Kaio conferir (ADR-033):**
- **Aquecimento de 60 dias.** O grupo tem chamados do núcleo nos 60 dias antes do contrato do Intelligence; o job roda só a partir do contrato. Sem isso, no segundo mês do histórico a janela anterior do crescimento (30 dias) fica quase vazia, e todo código parece crescer. É também o caminho de um cliente real, que usa o núcleo antes de contratar o módulo.
- **O ruído é regular de propósito.** O número de chamados de cada dia segue a média, os códigos giram em ordem por hotel e os ativos recebem o ruído em rodízio, com os modelos intercalados. Com sorteio puro, o ruído sozinho abria os sinais de crescimento e de mesmo modelo.
  - O ruído dos ativos de área comum é de 1 corretiva por ano, contra 3 nas UHs, porque essas categorias têm poucos ativos por modelo.
  - Os ativos dos cenários têm modelo próprio e ficam fora do ruído.
- **As rajadas dos cenários têm no máximo 5 chamados do mesmo código.** Com 6, a rajada que atravessa a borda da janela abre também o crescimento.
- Conferido fora do teste: as mesmas checagens passam em 24 combinações de semente e fim, nos dois volumes.

**Observações sobre o motor, para o Kaio (sem mudança nesta atividade):**
1. **Crescimento no segundo mês de um tenant novo.** Do 31º ao 60º dia de histórico, a janela anterior cobre só parte do tempo, e a regra (`antes > 0` e +50%) dispara para quase todo código. No piloto, um cliente que entra com o núcleo e o Intelligence juntos veria isso. O Kaio decide se a regra precisa de histórico mínimo antes de valer.
2. **Mesmo modelo em categorias com poucos ativos.** Com cerca de 6 ativos por modelo, a base fica pequena, e poucos chamados bastam para a taxa passar de duas vezes a base. É informação para os mínimos da política.
3. A substituição e a efetividade ainda não têm tela no web. Os cenários delas ficam prontos para quando tiverem.

**Testes:**
- No web: 285 passaram e 53 foram pulados (os que pedem banco), em 38 arquivos. Os 5 do roteiro estão entre os que passaram.
- Na raiz: 500 passaram.
- Lint e typecheck verdes.

### Ponto de retomada (13/10/2026)
- **`main`:** com #212 e #214. O dev ficou sem mudança.
- **PRs abertos** (de outros agentes): #215 (1c) e #216 (1b, zona protegida).
- **Não enviado:** nada; o roteiro e o teste estão na branch `claude/vigilant-cray-l06ew1`, sem PR (fora da zona protegida).
- **Esperando:**
  - o Cesar levar o pedido da montagem à 1b;
  - o Kaio conferir os desvios e as observações acima.
- **Próximo, depois da montagem na `main`:**
  - a gravação no `historico-inteligencia.ts`;
  - o `scripts/ops/historico-demonstracao.ts` (`pnpm demo:historico`), no molde do `dados-demonstracao.ts`;
  - o teste do histórico no Supabase do runner.
- **Primeiro passo:** ler a montagem da 1b.
- **Depois:** as atividades 4 (glossário de métricas) e 5 (`docs/piloto/`).

## Atividade 5: `docs/piloto/` com as entregas até o #223 (13/10/2026)

Quinta atividade do Kaio (12/10/2026). Proposta de desenho levada ao Cesar e aprovada em 13/10/2026 ("Cesar aqui. Sim, pode seguir com opção A"): um PR só de docs, a partir da `main`, na branch `claude/int-piloto-1b-1c`, separado do PR do glossário (#225), que espera a revisão da 1c.

- **README:** tabela da 1b estendida (I8, provisionamento e kit por turma, edificação no PWA, responsáveis só Técnicos, PV1, PV2) e tabela nova "O que a 1c já entregou" (nível bandeira, auditoria geral, prazos de SLA, motivo da pausa), porque o piloto só começa depois da 1c. Listas "[vai mudar na 1b]" e "[ainda não existe]" limpas; pergunta 10 respondida pelo #196.
- **Manual, roteiro e guia:** checklist (Admin grava os modelos, quem tria aplica, o técnico responde no PWA), foto com momento, assinatura no aceite, as três políticas novas, nível bandeira, auditoria geral com CSV, motivo da pausa, prazos de SLA só em "Ver histórico" e na auditoria, provisionamento por script. Exercícios 16 a 19 novos no roteiro; o 4 mudou, porque a Solicitante não aparece mais na lista de responsáveis (#201).
- Conferido pelo código e pelo catálogo pt-BR, sem rodar o app.

### Ponto de retomada (13/10/2026, atividade 5)

- **`main`:** no #223. **PRs do Intelligence abertos:** #225 (glossário v3, rascunho, espera a revisão da 1c) e o PR desta atividade. Os dois acrescentam seção no fim deste diário: quem entrar depois recebe a `main` e resolve o conflito mantendo as duas seções.
- **Espera o Cesar:** o merge dos dois PRs; as decisões do piloto sobre "Foto de depois na conclusão", "Assinatura no aceite", "Checklist completo na conclusão" e a política de SLA padrão.
- **Pendências de antes:** as da atividade 4 (revisão da 1c, divergências a–f, aprovações) e da atividade 3 (montagem da 1b com relógio controlável e a conferência do Kaio).
- **Próximo:** atualizar o `docs/piloto/` de novo a cada entrega da 1b (PV2 com telas, PV3, M1 a M4); depois da aprovação do glossário, o PR de código da conclusão do serviço e do custo informado no domínio.
