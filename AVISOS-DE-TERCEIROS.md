# Avisos de terceiros

Componentes de terceiros que o HubKeep usa e que pedem atribuição ou aviso de licença.

## date-holidays

- **Uso:** feriados nacionais e regionais do calendário de SLA (ADR-042), só no servidor do web (`apps/web/src/servidor/feriados-oficiais.ts`). Os dados não são alterados nem redistribuídos: o servidor só lê as datas para calcular os prazos.
- **Versão:** 3.37.0, fixada em `apps/web/package.json`.
- **Projeto:** <https://github.com/commenthol/date-holidays>
- **Código:** Copyright (c) 2015-present, commenthol. Licença ISC.
- **Dados** (`data/holidays.json` e `data/countries/*.yaml`): licença [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), conforme o arquivo `LICENSE` do pacote, com base em artigos da Wikipédia. As fontes dos feriados do Brasil são:
  - <https://pt.wikipedia.org/wiki/Feriados_no_Brasil>
  - <https://en.wikipedia.org/wiki/Public_holidays_in_Brazil>
  - A lista completa das atribuições está no arquivo `LICENSE` e no cabeçalho de cada `data/countries/*.yaml` do pacote.
- **Dependências do pacote:**
  - MIT: `date-holidays-parser`, `astronomia`, `date-bengali-revised`, `date-chinese`, `date-easter`, `jalaali-js`, `moment`, `moment-timezone` e `lodash`;
  - ISC: `caldate`;
  - Unlicense: `prepin`;
  - Python-2.0: `js-yaml` 5 e a `argparse`, dependência dele.
