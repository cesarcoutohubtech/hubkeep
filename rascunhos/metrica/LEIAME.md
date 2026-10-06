# Rascunho do PR da app.metrica_ativo_diaria (local, sem PR)

Vale a decisão de 06/10/2026: **opção B, janela de leitura de 60 dias, configurável por política, nada apagado.** Está aprovada por Kaio e aguarda o Cesar, porque muda o ADR-036. O PR da tabela só abre:
- depois das três migrações da instrumentação do núcleo;
- depois do PR da `app.insight`;
- com a fila de zona protegida livre.

## 1. Troca no `packages/inteligencia/src/agregacao.ts`

Sai o `limiteDeRetencao(agora, meses = 12)`, que cortava a guarda em 12 meses. Entra a janela de leitura:

```ts
/** Janela de leitura da métrica diária (decisão de 06/10/2026): 60 dias, por política. */
export const JANELA_DE_LEITURA_PADRAO_DIAS = 60;

/**
 * Primeiro dia (UTC, `AAAA-MM-DD`) que telas e consultas leem da métrica
 * diária: `dias` dias antes de `agora`, contando o dia de hoje como o último.
 * Nada é apagado: o resultado gravado de cada dia é a fonte de verdade do
 * histórico.
 */
export function inicioDaJanelaDeLeitura(
  agora: Date,
  dias: number = JANELA_DE_LEITURA_PADRAO_DIAS,
): string {
  const hoje = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  return new Date(hoje - (dias - 1) * DIA_MS).toISOString().slice(0, 10);
}
```

- O comentário do topo do arquivo troca "Os dias guardam 12 meses" por "telas e consultas leem os últimos 60 dias; nada é apagado".
- Os testes do `limiteDeRetencao` (fim de mês curto) dão lugar aos da janela:
  - 60 dias contando hoje;
  - a virada de mês e de ano;
  - o valor da política no lugar do padrão.
- `mesAFechar` não muda. A agregação mensal lê só o mês que fecha, que fica dentro dos 60 dias.

## 2. A política da janela

- A chave nova `inteligencia.metrica_janela_leitura`, com o formato `{ dias: number }`:
  - inteiro de 31 a 366;
  - o mínimo de 31 cobre o mês que a agregação fecha;
  - o padrão é `{ dias: 60 }`.
- É a sexta chave do ADR-035, então o texto dele ganha a chave no mesmo PR. Ela depende do ponto de extensão das políticas (`docs/referencia/proposta-extensao-politicas.md`). Até ele existir, vale o padrão.
- O formato e a validação ficam em `packages/inteligencia/src/politicas.ts`, como as outras cinco.

## 3. Texto novo do ADR-036 no `docs/03`

Substitui os itens "Resultados diários" e "No PR das tabelas":

> - **Resultados diários** em `app.metrica_ativo_diaria` (e `app.metrica_hotel_diaria`, se a performance pedir). **Nada é apagado:** o resultado gravado de cada dia, com a configuração usada, é a fonte de verdade do histórico. Recalcular um dia passado usa os valores atuais da origem e não reproduz exatamente o que foi gravado.
> - **Janela de leitura de 60 dias:** telas e consultas leem só os últimos 60 dias da métrica diária. O valor é a política `inteligencia.metrica_janela_leitura`. Nenhuma regra lê a métrica diária além da janela: a agregação mensal lê o mês que fecha, e o custo informado de 12 meses vem da OS.
> - **Status desta mudança:** aprovada por Kaio em 06/10/2026, aguardando Cesar (substitui os 12 meses de guarda da versão aprovada em 05/10/2026).

O prazo de guarda da agregação mensal continua a decidir no mesmo PR.

## 4. A tabela

Ainda sem rascunho de SQL. Ela segue o modelo do `docs/02`, com os seis casos mínimos. Não tem policy de data: o corte de 60 dias é feito nas consultas, pela política.
