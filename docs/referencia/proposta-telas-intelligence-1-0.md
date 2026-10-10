# Proposta: as telas do Intelligence 1.0

**Situação:** proposta de 07/10/2026, do agente do Kaio. As seis decisões foram **aprovadas por Kaio em 10/10/2026, aguardando Cesar** (seção "Decisões de 10/10/2026"). Nada foi implementado nas apps.

**Referência visual:** a tela "HubKeep Intelligence" do mock oficial (`docs/referencia/design/csc-mock`, rota `#/inteligencia`), na `main`, já com as respostas de 10/10 (#160). As imagens de 07/10, tiradas de uma vitrine descartável, saíram do repositório em 10/10/2026: seriam uma terceira fonte, além do mock e do código, e já estavam defasadas. O que o mock ainda não tem (seção "O que falta no mock") entra primeiro no mock, num PR com a revisão do Cesar. O código das telas vem depois.

## As três telas

### 1. Lista de insights

- **Rota:** `apps/web/src/app/(painel)/inteligencia/insights/`, em pasta `inteligencia`, como a liberação do lint exige (ADR-026, adendo).
- **Menu:** um único item, "HubKeep Intelligence" (o nome do mock), que abre esta lista, com a contagem dos abertos.
- **Quatro indicadores:** abertos, em alta atenção ou crítico, possíveis problemas sistêmicos e sem responsável. A cor da borda reforça, e o texto diz o mesmo.
- **Filtros:** estado (abertos por padrão), tipo, escopo e faixa. O filtro por tipo e faixa entrega a lista dos ativos com mais atenção, sem tela própria.
- **Tabela:** faixa, número do insight, o que é, escopo, score, estado, responsável e última detecção. O insight sistêmico não tem score (traço) e entra na faixa Atenção. O insight de rede mostra o escopo como "3 hotéis da bandeira Aurora".
- **Substituição:** "Substitui o insight X" e "Substituído pelo insight X", calculado pelo vínculo (`substituidoPor`, no motor).
- **Quem vê:** cada pessoa vê só o insight cujos hotéis todos ela lê (RLS da `app.insight`). Sem o módulo contratado (`licenca.modulo`), o menu e as rotas não existem.

### 2. Página do insight (painel de investigação)

Todo insight abre aqui. No sistêmico, a página mostra a regra e os chamados; no de atenção, o resumo do ativo no lugar da tabela de chamados por regra.

- **Cabeçalho:** o que é, o escopo, as datas e, quando há, o aviso de substituição ("este insight substitui o INS-0133, que continua em revisão").
- **Por que estou vendo isso?** Os números que a regra encontrou e o limite dela, e o aviso de que é um sinal e não uma conclusão (PRD, princípio 7).
- **Série:** chamados por semana, nas últimas 12 semanas.
- **Chamados que levaram ao insight:** tabela com link para cada chamado, **só dos hotéis do escopo de quem lê**. O detalhamento nunca cita hotel fora desse escopo (a evidência guarda ids, e a RLS da origem filtra).
- **Decisão (coluna lateral):** as ações que o estado atual permite (de "novo": revisar, aceitar ou descartar). O descarte pede o motivo (não relevante, ou substituído por outro insight) e a nota, obrigatória. O texto avisa que "não relevante" silencia o problema por 30 dias, a menos que a faixa suba.
- **Quem decide:** o texto da regra do escopo. No insight de rede, só o Admin do grupo e o Gestor CSC que cobrem todos os hotéis.
- **Histórico:** a linha do tempo do insight.
- **Recálculo:** só aqui, sob demanda e identificado como recálculo (decisão de 07/10/2026, abaixo).

### 3. Detalhe do ativo, com "Por que estou vendo isso?"

- **Indicadores:** a atenção (com a faixa e o limite do insight), a criticidade, as horas paradas e o impacto em hóspedes.
- **Por que estou vendo isso?** Os três fatores que mais pesaram, em frases do catálogo (`explicacaoDoScore`). O aviso diz que o score mostra o que pesou, e não a causa.
- **Atenção nos últimos 90 dias:** uma linha por dia calculado, sobre as faixas e a linha do limite do insight. Os números do gráfico também aparecem em texto, para o leitor de tela e para o celular, onde o gráfico fica pequeno.
- **Como o score foi composto:** os oito componentes com peso, com valor, peso, peso usado, pontos e a nota da linha (por exemplo, "custo informado em X de Y corretivas", medições abaixo do mínimo, garantia sem data). O componente sem dado aparece com traço, e um aviso diz que o peso dele foi dividido entre os outros (ADR-034). Os UH-dias ficam numa linha discreta no fim da tabela: "Ainda sem dado: UH-dias (peso 0)".
- **Como este resultado foi gravado:** quando foi calculado, o número do cálculo (original ou recálculo), a versão da fórmula e a da política. É a condição do Cesar no ADR-036 aparecendo na tela.
- **Insights deste ativo,** com link para a página do insight.

## Como as telas se ligam

- O insight de atenção abre a **página do insight**. A página do ativo é a vista do score, aberta pelo link do insight ou pelo cadastro de ativos, e leva ao insight.
- Decidir (revisar, aceitar, agir, monitorar, resolver, descartar) só existe na página do insight: um único lugar de decisão e de auditoria. A página do ativo não decide nada.
- A página do insight leva à ficha do ativo, e de lá o fluxo de abrir chamado já existe. O 1.0 não ganha atalho para isso.

## O que muda no `packages/ui`

Dois acréscimos pequenos, num PR do `packages/ui` (não é zona protegida):
- `hk-indicadores`: a fileira de indicadores (grade com colunas que se ajustam à largura), que cada tela hoje improvisaria;
- `hk-dados`: pares de rótulo e valor (`dl`), para o bloco "como este resultado foi gravado".

Os gráficos são SVG simples nas próprias telas, sem biblioteca, com `role="img"` e o resumo no `aria-label`. Os números do gráfico também aparecem em texto, e a tabela de componentes e a tabela de chamados completam a alternativa.

## Textos novos nos catálogos

Já existem, nos quatro idiomas: as frases dos motivos, os nomes dos scores e das faixas, os estados, ações e tipos do insight, o motivo do descarte, o "substituído pelo insight", as notas por linha do detalhamento e os erros. Faltam, e entram junto com as telas:
- o menu ("HubKeep Intelligence") e os títulos das três páginas;
- os rótulos dos filtros, dos indicadores e das colunas;
- os títulos dos painéis, os avisos ("é um sinal, e não uma conclusão", "o score mostra o que pesou, e não a causa", "o peso foi dividido", "ainda sem dado") e o texto de quem decide por escopo;
- os nomes dos nove componentes da atenção e as frases das regras sistêmicas na página do insight (a regra e os números da evidência);
- o texto dos números do gráfico de 90 dias.

## Decisões de 10/10/2026 (aprovadas por Kaio, aguardando Cesar)

1. **Estrutura das três telas** aprovada. A referência visual é a tela do Intelligence do mock na `main`, e não as imagens de 07/10, que saíram. O que o mock ainda não tem entra primeiro no mock, num PR com a revisão do Cesar; o código vem depois.
2. **Decidir só na página do insight.** A página do ativo mostra o score e leva ao insight.
3. **Menu só com a lista de insights**, com o nome de menu do mock, "HubKeep Intelligence". O "Top ativos por atenção" do PRD (seção 19) sai do filtro por tipo e faixa.
4. **Fora do 1.0:** abrir chamado, criar preventiva, vincular feedback e pedir orçamento (PRD, seção 20). O 1.0 decide o insight e mostra a evidência.
5. **UH-dias** numa linha discreta no fim da tabela de composição: "Ainda sem dado: UH-dias (peso 0)". Dar peso aos UH-dias é decisão para depois do piloto, com dados reais; a origem (`app.uh_indisponivel`) já existe desde a I4.
6. **Gráfico de 90 dias** pequeno no celular, com os números também em texto.

**Decisão de 07/10/2026 sobre o que o painel mostra (aprovada por Kaio, aguardando Cesar):** o resultado original gravado de cada dia. O recálculo com a política atual aparece só no painel de investigação, sob demanda e identificado como recálculo.

## O que falta no mock

Levantamento de 10/10/2026, contra a tela `#/inteligencia` da `main`. Hoje o mock tem uma página só: os cartões de atenção por ativo (score, "pesou mais" e a tabela de composição), o painel do padrão sistêmico, a tabela de efetividade e quatro indicadores de módulo (abertos, ativos avaliados, janela e último cálculo). O mock calcula na hora e não guarda insight.

- **Em todas as telas:**
  - o insight como registro, com número, estado, responsável, datas, substituição e histórico, guardado no estado local do mock;
  - o resultado diário gravado (original), em vez do cálculo na hora.
- **Lista de insights:** a tabela, os quatro indicadores da proposta, os filtros por estado, tipo, escopo e faixa, o escopo do insight de rede e a contagem no menu.
- **Página do insight:** não existe.
  - Faltam a rota por insight, o cabeçalho, a série de 12 semanas e os chamados filtrados pelo escopo de quem lê.
  - Faltam também a coluna de decisão com as ações por estado, o descarte com motivo e nota, o aviso dos 30 dias, a regra de quem decide e o recálculo sob demanda.
- **Detalhe do ativo:** hoje a ficha do ativo só mostra o selo "Atenção N/100" quando o ativo passa do limite, e o selo leva à lista.
  - Faltam os indicadores, os três fatores, o gráfico de 90 dias com os números em texto, o bloco "como foi gravado" e os insights do ativo.
  - A tabela de composição já existe no cartão. O UH-dias aparece nela como linha comum, com traço e 0%, e precisa virar a linha discreta da decisão 5.

**Fica para decidir:** a tabela de efetividade e o quadro "Próximas versões" do mock não têm lugar nas três telas. A efetividade não é tipo de insight no motor (só `atencao_ativo` e `sistemico`).
