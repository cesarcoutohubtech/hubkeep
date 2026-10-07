# Rascunho do PR da app.metrica_ativo_diaria (local, sem PR)

- `AAAAMMDDHHMMSS_metrica_ativo_diaria.sql`: a migração. Vai para `supabase/migrations` num branch `int-*` novo, depois da `app.insight`, com a fila de zona protegida livre e as migrações da etapa I de que depende.
- `0NN_isolamento_metrica_ativo_diaria.test.sql`: o pgTAP, com os seis casos mínimos e 28 testes. **Ainda não rodou:** sem Docker local, só roda na CI do PR.

Valem o ADR-035 e o ADR-036 do `docs/03`, aprovados por Kaio (05 e 06/10/2026) e por Cesar (07/10/2026): opção B de retenção, janela de leitura de 180 dias por política, nada apagado. O ADR-036 tem a condição do Cesar, aceita por Kaio em 07/10/2026 (abaixo).

## 1. A condição do Cesar no ADR-036: versões e recálculo

Cada linha grava:
- `versao_formula_reincidencia` e `versao_formula_atencao`: a versão da fórmula de cada score (`VERSAO_REINCIDENCIA` e `VERSAO_ATENCAO`, que vêm no próprio `Score.versao`). Mudou a fórmula, sobe a versão, e a linha antiga continua com a dela;
- `versao_politica`: texto que identifica as linhas de `app.politica` que resolveram as duas políticas do hotel (por exemplo, o id e o `atualizado_em` de cada uma). A ligação do servidor o monta e o entrega em `HotelDoDia.versaoPolitica`, e o motor só o carrega. `padrao` quando valem só os padrões do código;
- `detalhe_reincidencia` e `detalhe_atencao`: os scores com os componentes e a **configuração usada** (`Score.configuracao`), que é a cópia do que valeu naquele dia;
- `recalculo` e `calculo`: um recálculo é outra linha do mesmo ativo e dia, com `calculo` maior (o job soma 1 ao maior já gravado) e `recalculo = true`, com as versões de hoje. Recálculo de um dia que nunca foi gravado entra com `calculo = 1` e `recalculo = true`.

No motor (`packages/inteligencia`):
- `LinhaDaMetricaDiaria` tem todos esses campos, e `calcularDia` os preenche;
- `executarDiaDoTenant` numera o cálculo, não grava de novo um dia já gravado e, no recálculo, só grava métrica: não abre nem atualiza insight;
- `fimDoDia('AAAA-MM-DD')` dá o `agora` para recalcular um dia passado.

**A leitura mostra o cálculo de maior número de cada dia** (`agregarMesDosAtivos` já faz assim). Os anteriores seguem guardados. É a escolha do rascunho; se o Cesar preferir que a leitura mostre o original, muda só a agregação e a consulta.

## 2. A tabela

- Só INSERT, e só para o `hk_worker`: nenhum papel atualiza ou apaga. O `hk_app` só lê, no escopo de `authz.hoteis_leitura()`. O proprietário não lê.
- Uma linha por `(hotel_id, ativo_id, dia, calculo)`, com FK composta ao hotel e ao ativo.
- Checks de formato: `calculo >= 1`, scores de 0 a 100, versões de fórmula a partir de 1, versão da política de 1 a 2000 caracteres.
- A janela de leitura **não é policy**: as consultas a aplicam, pela política. O banco não esconde por data.

## 3. A janela de leitura (implementada)

`inicioDaJanelaDeLeitura(agora, dias = 180)` e `JANELA_DE_LEITURA_PADRAO_DIAS` substituem o `limiteDeRetencao` de 12 meses, que saiu do motor.

A sexta chave `inteligencia.metrica_janela_leitura` (`{ dias }`, inteiro de 180 a 730) está em `politicas.ts`:
- **validação entre chaves:** `validarJanelaDeLeitura` recusa, ao gravar qualquer das duas, a janela menor que o dobro da janela da efetividade (erro `janela_de_leitura_curta`, nos quatro catálogos);
- **conferência na leitura:** `janelaDeLeituraEfetiva` devolve o dobro e um aviso de configuração quando a janela resolvida ficou curta, para o job registrar. O job diário ainda não lê a janela: quem lê a métrica (telas e consultas) usa a função.

## 4. Pendências

- **Particionamento por mês** (ADR-036): se o volume pedir antes do piloto, a tabela nasce particionada, com o ajuste dos meta-testes 1, 2 e 28. A decisão é do Cesar.
- **O prazo de guarda da agregação mensal** continua a decidir no PR das tabelas.
- **As tabelas do resumo mensal** (por ativo e por hotel) não têm rascunho: o `agregarMesDosAtivos` e o `agregarMesDosHoteis` já existem, e o formato da tabela sai depois da tela de rede.
