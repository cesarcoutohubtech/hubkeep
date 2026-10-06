# Rascunho do PR da app.metrica_ativo_diaria (local, sem PR)

Vale a decisão de 06/10/2026: **opção B, janela de leitura de 180 dias, configurável por política, nada apagado.** Está aprovada por Kaio e aguarda o Cesar, porque muda o ADR-036.
- A primeira decisão foi de 60 dias. Ela foi revista no mesmo dia: a janela precisa comportar a efetividade do PRD, de 90 dias antes e 90 depois.
- O texto revisto do ADR-035 e do ADR-036 está no #113, um PR de zona protegida.

O PR da tabela só abre:
- depois das migrações da etapa I da 1b;
- depois do PR da `app.insight`;
- com a fila de zona protegida livre.

## 1. Troca no `packages/inteligencia/src/agregacao.ts`

Sai o `limiteDeRetencao(agora, meses = 12)`, que cortava a guarda em 12 meses. Entra a janela de leitura:

```ts
/** Janela de leitura da métrica diária (ADR-036, revisão de 06/10/2026): 180 dias, por política. */
export const JANELA_DE_LEITURA_PADRAO_DIAS = 180;

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

- O comentário do topo do arquivo troca "Os dias guardam 12 meses" por "telas e consultas leem os últimos 180 dias; nada é apagado".
- Os testes do `limiteDeRetencao` (fim de mês curto) dão lugar aos da janela:
  - 180 dias contando hoje;
  - a virada de mês e de ano;
  - o valor da política no lugar do padrão.
- `mesAFechar` não muda. A agregação mensal lê só o mês que fecha, que fica dentro da janela.

## 2. A política da janela

- A chave nova `inteligencia.metrica_janela_leitura`, com o formato `{ dias: number }`:
  - inteiro de 180 a 730;
  - o mínimo de 180 cobre a efetividade de 90 dias antes e 90 depois;
  - o padrão é `{ dias: 180 }`.
- **Ponto a conferir:** se a política da efetividade subir a janela dela acima de 90 dias, 180 deixa de bastar. Opções: a tela usa o maior entre a janela e o dobro da janela da efetividade, ou o mínimo passa a acompanhar a efetividade. A validação de uma chave não enxerga a outra no registro do núcleo.
- É a sexta chave do ADR-035 (#113). Ela entra no registro do núcleo pela `EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE`, com o filtro por módulo contratado (I5). Até lá, vale o padrão.
- O formato e a validação ficam em `packages/inteligencia/src/politicas.ts`, como as outras cinco.

## 3. O ADR-036 no `docs/03`

O texto revisto está no #113:
- nada é apagado;
- a janela de leitura é de 180 dias;
- o limite do recálculo;
- a pendência de particionamento.

Se o #113 entrar antes, o PR da tabela não muda o ADR. Senão, leva o texto junto.

O prazo de guarda da agregação mensal continua a decidir no PR da tabela.

## 4. A tabela

Ainda sem rascunho de SQL. Ela segue o modelo do `docs/02`, com os seis casos mínimos. Não tem policy de data: o corte de 180 dias é feito nas consultas, pela política.

**Pendência de particionamento** (ADR-036, #113): se o volume pedir antes do piloto, a tabela já nasce particionada por mês, com o ajuste dos meta-testes 1, 2 e 28. A decisão é do Cesar.
