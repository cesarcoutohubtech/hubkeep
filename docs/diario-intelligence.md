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

### Ponto de retomada (05/10/2026, motor completo para o 1.0)

- **PR aberto:** `int-fornecedor`, que não é zona protegida. Conferir com `gh pr checks`, e não mergear sem o Kaio revisar.
- **Esperando:**
  - a aprovação escrita de Cesar e Kaio às propostas de ADR, com as sete decisões do fim do documento;
  - as três migrações da instrumentação no começo da 1b, que são do agente do núcleo.
- **Próximo passo,** depois das aprovações e das migrações: um único PR de zona protegida com os ADRs no `docs/03`, e depois as tabelas `app.insight` e `app.metrica_ativo_diaria`, uma de cada vez, quando a fila de zona protegida estiver livre.
- **Parada:** nada de migração, tela ou PR de zona protegida até lá.
