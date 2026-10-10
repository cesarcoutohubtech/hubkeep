# Adendos aos ADR-034 e ADR-036: o alinhamento do motor com o mock

**Rascunho, de 08/10/2026.** Não é PR e não entra na `main` por este branch. O texto abaixo entra no `docs/03` pelo PR `int-adr-aceite` (zona protegida), **depois** das migrações da etapa I da 1b, junto com os ajustes que o `int-adr-aceite` já carrega (ADR-033, ADR-035 e ADR-036 de 07/10).

**Origem:** o Cesar aprovou por escrito, em 08/10/2026, as três propostas do alinhamento do motor com o mock oficial (identidade oficial, ADR-038): atenção v2, efetividade sem linguagem de causa e padrão sistêmico com os mínimos do mock. O código está nos PRs do agente do Intelligence: #142 (atenção v2), #144 (efetividade v2) e #145 (padrão sistêmico v2). O registro da aprovação, com o canal e o texto dele, está em `docs/diario-intelligence.md`.

**Status dos adendos:** aprovado por Kaio, aguardando Cesar. Aprovar as propostas não aprova este texto: ADR do Intelligence precisa da aprovação escrita de Cesar **e** de Kaio, e merge não aprova ADR.

**Respostas do Kaio de 10/10/2026:** as seis leituras que os PRs de 08/10 deixaram para o Cesar confirmar entraram no texto abaixo, cada uma com a marca **[aprovado por Kaio em 10/10/2026, aguardando Cesar]**. O registro, com o texto do Kaio e as perguntas que ficam para a implementação, está no `docs/diario-intelligence.md`, seção "Respostas do Kaio às confirmações de 08/10". No mesmo dia, o Kaio respondeu também às perguntas que o agente deixou para a implementação (seção "Respostas do Kaio às perguntas da implementação" do diário), e o texto abaixo já as incorpora. O motor ainda não mudou: a implementação espera o ok do Cesar.

---

## Adendo ao ADR-034 (a colar depois da seção Decisão)

**Adendo de 08/10/2026: atenção ao ativo na versão 2.**

**Status:** as propostas foram aprovadas por escrito pelo Cesar em 08/10/2026; este texto aguarda a aprovação escrita de Kaio e de Cesar.

- **A atenção ao ativo passa para a versão 2**, com oito componentes com peso e os UH-dias com peso 0: nove no motor. Os pesos padrão estão abaixo; são política (ADR-035) e somam 100. O "oito componentes" do texto do Cesar de 08/10 foi redação, e o conteúdo é o mesmo. **[aprovado por Kaio em 10/10/2026, aguardando Cesar]**

  | Componente | Peso | Origem |
  |---|---|---|
  | Reincidência de falhas | 20 | o score de reincidência do mesmo ativo |
  | Tempo parado | 15 | `app.parada_ativo` na janela da reincidência |
  | Impacto no hóspede | 15 | `app.chamado.impacto_hospede` (I4, 1.0), até o Guest Impact Score da 1.5 |
  | Criticidade | 15 | `app.ativo.criticidade`, de 1 a 5 (I1) |
  | Custo informado | 10 | `app.os.custo_informado` (I4) em 12 meses |
  | Preventiva atrasada | 10 | plano de preventiva (etapa PV); sem dado até lá |
  | Medições fora da faixa | 10 | checklist tipado (PV1, antes P1); sem dado até lá |
  | Garantia vencida | 5 | `app.ativo.garantia_ate` (I1); vale até o fim do dia da data |
  | UH-dias | 0 | `app.uh_indisponivel` (I4), com `uhDiasPerdidos` do domínio; peso 0 e sem dado: o `calcularDia` ainda não lê |

- **Garantia** entra no `AtivoAnalisado` (`garantiaAte`). O componente vale 1 quando venceu e 0 dentro da garantia. Sem a data, conta como não vencida (0): o peso é pequeno, e não se pune o dado que falta. **[aprovado por Kaio em 10/10/2026, aguardando Cesar]**
- **Medições:** o valor é a fração das medições da janela que saíram da faixa aceitável, e não a contagem, que pesaria contra o ativo com muitos itens de checklist. A disponibilidade é por categoria: se o plano da categoria não tem item de medição, o componente fica sem dado nos ativos dela, e o peso é redistribuído. O ativo com menos medições na janela que o mínimo da política (`inteligencia.atencao_ativo`, padrão 3, mínimo 1) contribui 0, sem redistribuir. **[aprovado por Kaio em 10/10/2026, aguardando Cesar]**
- **Preventiva atrasada** substitui "preventiva ou compliance".
- **UH-dias** (decisão de 07/10/2026) é componente da atenção, e não sinal próprio. Com peso 0 e sem dado, não muda o score nem a versão. Quando existir o dado e o peso passar de 0, a atenção ganha a versão seguinte, com o limite e os pesos redistribuídos.
- **Dado ausente** (a regra deste ADR, reafirmada): o peso do componente sem dado vai para os presentes, na proporção dos pesos. A regra é a mesma para todo o tenant e não há chave por hotel que a ligue ou desligue.
- **Custo informado, disponível no tenant inteiro:** é o único componente em que "não informado" é diferente de "zero". Ele conta como disponível quando pelo menos 50% das corretivas encerradas do tenant, na janela, têm o custo preenchido. Abaixo disso, fica sem dado para todos os hotéis, e o peso é redistribuído. Assim, o hotel que preenche e o que não preenche não ficam com pesos diferentes. Com o componente disponível, o ativo soma só o custo das corretivas que têm o dado, e o detalhamento mostra "custo informado em X de Y corretivas". A regra depende de o custo vazio ser gravado como vazio (null), e não como 0: a coluna `app.os.custo_informado` (I4) e o aceite do `apps/web` já fazem assim. **[aprovado por Kaio em 10/10/2026, aguardando Cesar]**
- **Sempre disponíveis:** impacto no hóspede e tempo parado. Não marcar é "não teve", e não "sem dado". **[aprovado por Kaio em 10/10/2026, aguardando Cesar]**
- **Detalhamento:** o `detalhamentoDoScore` mostra cada componente "sem dado", o peso configurado, o peso usado e a fração do peso que foi redistribuída. O componente de peso 0 sem dado não conta como redistribuição.
- **Versão gravada:** a versão 1 existiu só no código e nos testes; nenhum resultado foi gravado com ela, porque as tabelas do ADR-036 ainda não existem. Por isso a versão 2 é a primeira a ser gravada, e é a ela que se aplica a frase deste ADR "a versão 1 fica congelada na primeira gravação de resultado". Mudou a fórmula depois da primeira gravação, sobe a versão. A numeração não recomeça: a 1 existe no texto deste ADR, e renumerar só confunde. **[aprovado por Kaio em 10/10/2026, aguardando Cesar]**
- A política `inteligencia.atencao_ativo` muda de formato (os nomes dos pesos) e não ganha chave nova.

---

## Adendo ao ADR-036 (a colar depois da seção Decisão)

**Adendo de 08/10/2026: as versões gravadas por área e o formato das políticas.**

**Status:** as propostas foram aprovadas por escrito pelo Cesar em 08/10/2026; este texto aguarda a aprovação escrita de Kaio e de Cesar.

- **Versões vigentes:** reincidência 1, atenção ao ativo 2, efetividade 2 e sinal sistêmico 2.
  - A métrica diária grava `versao_formula_reincidencia` e `versao_formula_atencao` (condição do Cesar de 07/10/2026).
  - O insight grava a versão da detecção que o abriu (`versao_score`: a da atenção, ou a do sinal sistêmico).
  - A efetividade é calculada sob demanda na tela do ativo e devolve a própria versão; se um dia for gravada, grava a versão junto.
  - Recálculo continua marcado como recálculo, com as versões de hoje.
- **A efetividade na versão 2** compara a mesma janela antes e depois e fala só em variação observada, nunca em causa (PRD, princípio 7). Pela variação dos chamados:
  - redução de 60% ou mais: redução observada;
  - de 25% a menos de 60%: redução parcial;
  - de mais de −25% a menos de +20%: sem mudança relevante;
  - aumento de 20% ou mais: aumento observado;
  - menos de 3 chamados antes: sem base de comparação;
  - menos de 90 dias depois: janela incompleta.

  Quando os dois últimos valem juntos, prevalece "sem base de comparação". Ele já é definitivo no dia da intervenção: menos de 3 chamados antes nunca vira uma comparação válida, por mais que a janela termine. **[aprovado por Kaio em 10/10/2026, aguardando Cesar]**

  Os limiares, a base mínima e a janela são campos da política `inteligencia.efetividade`. A janela de 90 dias continua cabendo na janela de leitura de 180 dias (o dobro, como já exige a validação entre chaves).
- **O padrão sistêmico na versão 2:**
  - só a regra do mesmo modelo vem ligada por padrão; as outras quatro (mesmo andar, área comum, mesmo fornecedor e crescimento) ficam desligadas por política, com o campo `ativa` em cada regra;
  - o mesmo modelo agrupa por categoria, fabricante e modelo, sem a falha, e exige na política 3 hotéis, 6 chamados em 90 dias e 5 ativos;
  - fabricante e modelo são comparados sem maiúsculas, sem acentos, sem espaços nas pontas e com os espaços repetidos do meio reduzidos a um; o ativo sem modelo fica fora da regra. **[aprovado por Kaio em 10/10/2026, aguardando Cesar]**
  - a taxa do modelo (chamados por ativo instalado, em 90 dias) precisa ser de pelo menos o dobro da base e nunca menos de 0,3. A base é a taxa dos outros modelos da mesma categoria no tenant;
  - ativo instalado é o que esteve ativo em algum momento da janela: o baixado antes do início não conta, e o instalado no meio conta inteiro no 1.0. **[aprovado por Kaio em 10/10/2026, aguardando Cesar]**
  - sem outro modelo na categoria, a regra não dispara: sem comparação, não dá para atribuir o problema ao modelo, o mesmo princípio do "sem base" da efetividade. **[aprovado por Kaio em 10/10/2026, aguardando Cesar]**
  - os 3 hotéis são hotéis distintos com pelo menos um chamado contado na janela em ativos do modelo; ter o modelo instalado não basta. **[aprovado por Kaio em 10/10/2026, aguardando Cesar]**
  - o escopo do insight do mesmo modelo passa a `{ categoriaId, modelo }`, e a família do insight muda junto (`sistemico|categoriaId=...|modelo=...|regra=mesmo_modelo`).
- **O formato das políticas muda nas três chaves** (atenção: pesos; efetividade: limiares; sistêmico: `ativa` e mínimos). Nenhum valor de política do Intelligence foi gravado (a extensão só é registrada junto com o filtro por módulo, 1b), então não há valor antigo a migrar. Daqui para a frente, mudar o formato de uma chave exige versão nova da fórmula e um plano para os valores já gravados.

---

## Nota para o Cesar: o ADR-035

Os formatos de três chaves do ADR-035 mudaram (atenção, efetividade e sistêmico). A decisão do ADR-035 não muda (uma chave por score, resolução pelo registro, só o Admin altera), mas a frase "os pesos e faixas do PRD e os limites de `packages/inteligencia`" passa a apontar para os adendos acima. **Sugestão:** uma linha no ADR-035 remetendo ao adendo do ADR-036. Fica a seu critério; não preparei texto separado.

## O que o PR `int-adr-aceite` leva, somando

1. ADR-033: o hotel novo como variante (c), a família e a chave, o motivo do descarte e a condição do hash aceita.
2. ADR-035: a validação entre chaves e a conferência na leitura.
3. ADR-036: o aceite do Kaio à condição, o que foi gravado em cada linha, e **o adendo acima**.
4. ADR-034: **o adendo acima**.
