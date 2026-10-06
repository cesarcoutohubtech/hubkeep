# Retenção de 12 meses da `app.metrica_ativo_diaria`: opções

**Situação:** levantamento de 06/10/2026, feito pelo agente do Kaio. A escolha é do Cesar e entra no PR da tabela (ADR-036: "o prazo de guarda da agregação mensal e a forma de tirar o que passou de 12 meses, sem DELETE para nenhum papel da aplicação").

## Decisão (06/10/2026): opção B, com janela de 60 dias

- **Aprovado por Kaio, aguardando Cesar.** Muda o "12 meses" do ADR-036 e por isso segue a regra de aprovação dos ADRs do Intelligence.
- **Telas e consultas leem só os últimos 60 dias.** O valor é configurável por política.
- **Nada é apagado:** o resultado gravado de cada dia é a fonte de verdade do histórico. Recalcular um dia passado usa os valores atuais da origem e não reproduz exatamente o que foi gravado (comentário do `calcularDia`).
- **Nenhuma regra aprovada lê a métrica diária além de 60 dias.** A agregação mensal lê só o mês que fecha. O custo informado de 12 meses vem da OS, não da métrica.
- **No PR da tabela:** o `limiteDeRetencao` (padrão de 12 meses) dá lugar à janela de leitura de 60 dias, e o texto do ADR-036 muda junto. A redação está no rascunho local.

A análise das opções segue abaixo, como registro.

**Ordem de grandeza:** 40 hotéis com 500 ativos cada dão 20 mil linhas por dia e cerca de 7,3 milhões por ano. Com o detalhamento do score em jsonb, são alguns GB por ano. A linha não tem dado pessoal. Os ids de quem decide ficam no insight, não na métrica.

## Opção A: partição por mês, removida por operação do responsável

- A tabela é particionada por intervalo de `dia`, uma partição por mês.
- **Criar as partições:**
  - a migração já cria as dos próximos meses;
  - antes de acabarem, uma migração nova cria as seguintes. Como DDL não é feito por papel da aplicação, nem o job cria partição.
- **Tirar o mês que passou de 12:** o responsável (o Cesar, pelo `postgres` do Supabase) roda `detach partition` e `drop table`. É um script de operação versionado em `scripts/ops`, que confere a data contra `limiteDeRetencao` e só remove partição inteira já fora do prazo. Fica registrado no diário de operação.
- **Pontos de atenção:**
  - os meta-testes 1, 2 e 28 olham cada partição como tabela. O 28 (lista fechada) teria de ignorar as partições (`relispartition`) e conferir só a tabela-mãe. É mudança no meta-teste, na mesma revisão;
  - RLS e grants ficam na mãe. As partições precisam de RLS habilitada e forçada também, para ninguém ler direto por elas;
  - a PK e os índices únicos precisam levar `dia`;
  - a FK composta de outra tabela para a métrica fica difícil. Hoje não há nenhuma prevista.
- **A favor:** o espaço é devolvido de fato e a remoção é barata (sem vacuum de milhões de linhas). Nenhum papel da aplicação ganha DELETE.
- **Contra:** operação mensal manual (ou um lembrete), DDL recorrente e mudança nos meta-testes.

## Opção B: só limitar a leitura a 12 meses

- A tabela é comum. Nada é removido.
- **A leitura corta em 12 meses:**
  - nas consultas da aplicação, pelo `limiteDeRetencao`;
  - se o Cesar quiser garantia no banco, também na policy (`dia >= current_date - interval '12 months'`). É restrição de visibilidade, não cálculo de negócio, mas fica a critério dele se isso conta como regra no banco.
- **A favor:** sem DDL recorrente, sem operação manual e sem mudança nos meta-testes. É a opção mais simples para a fase 1b.
- **Contra:**
  - o dado antigo continua guardado e o banco cresce sem limite (alguns GB por ano, no tamanho acima);
  - "guardados por 12 meses" vira "visíveis por 12 meses";
  - a remoção de verdade fica para depois, e cai na opção A ou numa limpeza manual.

## Comum às duas

- A agregação mensal (`agregarMesDosAtivos` e `agregarMesDosHoteis`) é pequena: um registro por ativo e por hotel ao mês. O prazo de guarda dela também é decisão do Cesar, no mesmo PR.
- O job nunca apaga. O corte de 12 meses é calculado em `limiteDeRetencao` (`packages/inteligencia/src/agregacao.ts`), com o mês curto tratado.
