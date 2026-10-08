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
