# PR-I1 — Lacunas de instrumentação do HubKeep Intelligence

**Situação:** análise de 05/10/2026, com as decisões do Cesar do mesmo dia (seção "Decisões do Cesar"). Sem código nem migração por enquanto. As três migrações entram no começo da fase 1b, antes de qualquer outra tarefa dela, cada uma num PR de zona protegida do fluxo do agente do núcleo, um de cada vez. A instrumentação é do núcleo, não do agente do Intelligence (decisão de 30/09/2026). A 1b só começa com o aval do Cesar, depois do teste do kit.
**Base:**
- `docs/referencia/prd-hubkeep-intelligence-v1.md`, seção 32 (dados que precisam existir desde o MVP) e seções 21 a 31;
- o schema da `main` no `be08194` (migrações até a 0028, tipos em `packages/db/src/tipos-banco.ts`);
- o motor do Intelligence em `packages/inteligencia` (#82), que já espera alguns destes campos marcados como "(fase A)" em `historico.ts`.

**Para quem:** o Cesar, que decide o que entra e quando, e o agente do Kaio, que ajusta o `historico.ts` aos nomes reais quando as migrações entrarem.

## Resumo

Dos 17 campos da seção 32:
- **5 já existem:** fabricante, modelo e número de série do ativo, e o início e o fim do tempo parado (`app.parada_ativo`).
- **1 se deriva sem migração:** a reabertura. No HubKeep, reabrir é a mesma OS voltar à execução (Cesar, 29/09/2026), e a auditoria conta as reaberturas.
- **7 faltam e entram no MVP com migração pequena:** os três códigos (falha, causa e solução), a data de compra, a garantia, a origem do trabalho e o impacto no hóspede.
- **4 são de fase 2 pelo `docs/00`:** fornecedor, custo estimado, custo real e custo estimado de substituição. Por decisão do Cesar, dois ganham uma **versão mínima no MVP, fora do PWA**:
  - na triagem, quem executa: equipe interna ou terceiro, com o nome do terceiro (cobre o fornecedor por nome);
  - no aceite, o custo informado: valor opcional em reais, sem aprovação nem alçada (cobre o custo real).
  - O módulo de custos e fornecedores segue na fase 2, com o custo estimado e o de substituição.

Fora da seção 32, o motor pede ainda a **criticidade do ativo** (PRD, seção 13; `Criticidade` em `historico.ts`). Ela entra na proposta junto com os campos do ativo.

Tudo o que é novo é opcional no banco (coluna anulável). A obrigatoriedade, quando o cliente quiser, vira política por hotel (regra 7, ADR-026), conferida no domínio, nunca `NOT NULL` nem check no banco.

## Campo a campo (seção 32)

| Campo do PRD | Situação | Onde está, ou o que falta | Menor migração |
|---|---|---|---|
| `failure_code` | Falta | Nada no chamado nem na OS. O chamado tem só a descrição livre; a categoria é do ativo, não da falha. | Catálogo `app.codigo_manutencao` (abaixo) e `codigo_falha_id` na OS. |
| `cause_code` | Falta | Nada. | `codigo_causa_id` na OS, do mesmo catálogo. |
| `resolution_code` | Falta | Nada. A conclusão da OS não guarda o que foi feito, além das horas, do material em texto livre e das fotos. | `codigo_solucao_id` na OS, do mesmo catálogo. |
| `downtime_start` | Existe | `app.parada_ativo.inicio`, por ativo e chamado, com a OS opcional (C5). | Nenhuma. |
| `downtime_end` | Existe | `app.parada_ativo.fim`. O tempo parado total sai de `tempoParadoTotal` no domínio. | Nenhuma. |
| `reopened_from_os_id` | Deriva | Reabrir é a mesma OS (`corretiva.ts`, ação `reabrir`, com `motivo_reabertura`); não nasce outra OS para apontar a anterior. A auditoria (`acao = 'reabrir'`) dá a contagem, como o motor já espera (`Corretiva.reaberturas`). | Nenhuma. O retorno do mesmo defeito num chamado novo é reincidência, que o motor calcula por ativo e janela. |
| `supplier_id` | Versão mínima | Não há fornecedor no MVP (`docs/00`: "fornecedores, custos e alçadas" na fase 2). Versão mínima (05/10/2026): na triagem, quem executa, equipe interna ou terceiro, com o nome do terceiro em texto livre. | `executado_por` e `terceiro_nome` em `app.os` (migração 2). O cadastro de fornecedores, com `fornecedor_id`, segue na fase 2. |
| `estimated_cost` | Falta, fase 2 | O material é texto livre, sem quantidade nem valor (`app.os_material.descricao`). | Fora do MVP (05/10/2026): fica com o módulo de custos, na fase 2. |
| `actual_cost` | Versão mínima | Idem. Versão mínima (05/10/2026): no aceite, o custo informado, valor opcional em reais, sem aprovação nem alçada. | `custo_informado numeric(12,2)` em `app.os` (migração 2). |
| `asset_manufacturer` | Existe | `app.ativo.fabricante`, texto livre. | Nenhuma. A comparação entre hotéis usa `chaveDeModelo` (sem caixa e sem espaço sobrando). Um catálogo de modelos é fase 2. |
| `asset_model` | Existe | `app.ativo.modelo`, texto livre. | Nenhuma. |
| `asset_serial_number` | Existe | `app.ativo.numero_serie`. | Nenhuma. |
| `purchase_date` | Falta | Hoje só como campo estendido da categoria (tipo `data`), que fica em `campos` (jsonb) e muda de chave conforme a categoria, o que não serve para comparar. | `data_compra date` em `app.ativo`. |
| `warranty_until` | Falta | Idem. | `garantia_ate date` em `app.ativo`. |
| `replacement_estimated_cost` | Falta, fase 2 | Custo, idem. | Fora do MVP (05/10/2026): fica com o módulo de custos, na fase 2. |
| `work_source` | Falta | O chamado não guarda a origem. A IX2 (pós-piloto) já prevê a migração "origem do chamado". A preventiva da 1b vai gerar OS sem chamado, e a origem dela é o plano. | `origem text` em `app.chamado`, com os valores canônicos no domínio (`interno` e, depois, `integracao`), já com o formato que a IX2 vai usar. A OS preventiva se reconhece pelo plano, na 1b. |
| `guest_impact_flag` | Falta | Nada. | `impacto_hospede boolean` em `app.chamado`, anulável: `null` é "não informado", que o score trata como ausente. |

## Migrações propostas

Três migrações, no começo da 1b, cada uma num PR de zona protegida, nesta ordem. Nenhuma cria função nem trigger.

1. **Ativo** (a menor):
   - `app.ativo` ganha `data_compra date`, `garantia_ate date` e `criticidade smallint`, todas anuláveis;
   - `grant update (data_compra, garantia_ate, criticidade)` ao `hk_app`, junto das colunas que a edição já atualiza;
   - a escala da criticidade é fixa, de 1 a 5 (decisão do Cesar de 06/10/2026), com `check (criticidade between 1 and 5)`, que é formato e não regra configurável. Os nomes de cada nível vêm do catálogo nos quatro idiomas, e o tenant troca os nomes pela política `ativo.criticidade`, como nas situações (ADR-027). Não há máximo configurável;
   - pgTAP: as colunas novas não abrem escrita para quem não escreve no hotel (casos de UPDATE por papel no 003).
2. **Chamado e OS** (abertura, triagem e aceite):
   - `app.chamado` ganha `origem text not null default 'interno'` e `impacto_hospede boolean`;
   - a origem não recebe GRANT de UPDATE: é gravada na abertura e não muda;
   - `grant update (impacto_hospede)` ao `hk_app`, para a triagem corrigir;
   - `app.os` ganha `executado_por text not null default 'equipe_interna'` e `terceiro_nome text`, gravados na triagem que gera a OS, com `grant update` das duas para corrigir enquanto a OS não for concluída (o quando é regra do domínio);
   - `app.os` ganha `custo_informado numeric(12,2)`, anulável, gravado no aceite por quem aceita, com `grant update`;
   - os valores de origem e de `executado_por` (`equipe_interna` e `terceiro`) ficam no domínio, como os estados (ADR-027), com teste de paridade para não repetir o caso do `cancelada` (achado B6 do `docs/11`);
   - no domínio, e não no banco: o nome do terceiro é exigido quando `executado_por = 'terceiro'` e some quando volta a ser interno; o custo não aceita valor negativo;
   - o custo é em reais nesta versão; o hotel com outra moeda (`app.hotel.moeda`) fica para o módulo de custos;
   - o responsável da OS (técnico ou equipe) continua sendo quem acompanha no HubKeep; o terceiro não ganha acesso;
   - pgTAP: UPDATE das colunas novas por papel (quem tria, quem aceita, quem só lê).
3. **Códigos de manutenção** (a maior, com tabela nova):
   - `app.codigo_manutencao`: `id`, `tenant_id NOT NULL`, `tipo` (`falha`, `causa` ou `solucao`), `categoria_id` anulável (o código vale para uma categoria de ativo ou para todas), `nomes jsonb`, `chave_padrao` e `ativa`;
   - o mesmo modelo da situação e da prioridade (ADR-027): os códigos padrão por categoria têm nome no catálogo (`resolverNome`), e o Admin do grupo cria os próprios, com nome por idioma, e desativa os padrões que não usa;
   - segue o "Modelo para tabela nova" do `docs/02`: RLS forçada, policies por papel (lê quem lê o tenant; escreve o Admin do grupo), `unique (tenant_id, id)`, os seis casos mínimos de isolamento e a entrada no meta-teste;
   - `app.os` ganha `codigo_falha_id`, `codigo_causa_id` e `codigo_solucao_id`, anuláveis, com FK composta `(tenant_id, …)`, e `grant update` dessas três colunas ao `hk_app`;
   - a coerência entre o código e a categoria do ativo fica no domínio, não no banco;
   - a obrigatoriedade é a política `os.codigos_obrigatorios`, por hotel, com herança grupo → bandeira → hotel (ADR-026), desligada por padrão.

Cada uma entra no kit de teste (`scripts/ops/dados-demonstracao.ts` e o roteiro do `docs/10`) no mesmo PR, como o Cesar pediu para a etapa D.

## Impacto na tela do técnico (PWA)

Tudo opcional para o técnico. "Executado por" e o custo informado ficam fora do PWA: são da triagem e do aceite, nas telas do web.

| Tela | O que muda | Offline |
|---|---|---|
| `Os.tsx`, conclusão | Falha, causa e solução apresentadas como sugestão: os códigos da categoria do ativo primeiro, sem nenhum marcado. O técnico escolhe ou deixa em branco, e a conclusão no PWA nunca é recusada por falta de código, mesmo com a política ligada. | O catálogo de códigos entra na referência local (`referencia/banco.ts`), como as situações. A conclusão leva os ids escolhidos na operação da fila; o servidor confere só se o código existe e serve para a categoria. |
| `AbrirChamado.tsx` | Uma pergunta opcional "afeta hóspede?" (sim, não, não sei). A origem é gravada pelo servidor como `interno`, sem campo na tela. | Vai na operação de abertura que já existe. |
| `Ativos.tsx`, cadastro e edição pelo celular | Data de compra, garantia e criticidade, opcionais, na parte recolhida do formulário, para não alongar o cadastro rápido da implantação (1b). | Vão na operação de cadastro e edição. |
| Parada | Nada: o registro e o encerramento já existem (C5). | — |

**Telas do web, fora do PWA:**
- **Triagem:** "executado por", equipe interna ou terceiro, com o nome do terceiro, e o impacto no hóspede, para corrigir.
- **Aceite:** o custo informado, opcional, em reais. Com a política `os.codigos_obrigatorios` ligada no hotel, é aqui que os códigos são cobrados: quem aceita completa o que o técnico deixou em branco antes de aceitar. Assim a regra não recusa uma conclusão feita offline.
- **Admin do grupo:** o cadastro dos códigos, com os padrões por categoria.

Os textos novos (rótulos, opções e códigos de erro) vão para os quatro catálogos (regra 11). O contrato da fila (`packages/contratos`) ganha os campos opcionais, e uma operação antiga, sem eles, continua válida.

## Conflitos do PRD com as regras do HubKeep

| Onde no PRD | O que diz | Regra | Encaminhamento |
|---|---|---|---|
| Seção 28 | Tabela `metric_definition` com `formula` | Regra 2 (sem regra de negócio no banco) | Fórmula no código, versionada (ADR-INT-2). O banco guarda o resultado e a versão. |
| Seção 29 | Views materializadas para as agregações | Regras 2 e 4 | Job diário do worker grava as tabelas de resultado (ADR-INT-4). Sem view materializada nem função nova. |
| Seção 30 | "Eventos urgentes podem disparar recálculo pontual" | Regra 3 (sem trigger) | Handler do outbox, nunca trigger (ADR-INT-4). |
| Seções 21, 29 e 32 | Tabelas, campos e status em inglês (`intelligence_insight`, `NEW`, `failure_code`) | Convenção do `CLAUDE.md` (português sem acento) e ADR-027 | Nomes em português (`app.insight`, `codigo_falha_id`); estados canônicos no domínio (ADR-INT-1). |
| Seção 21 | `title` e `summary` gravados no insight | Regra 11 (texto pelo catálogo) | O insight guarda tipo, chaves e números; a frase sai do catálogo nos quatro idiomas. |
| Seções 21 e 22 | `intelligence_signal` copia chamado, OS, parada e reabertura | Regra 6 e o desenho de portas | O motor lê o núcleo pelas portas, sem cópia (ADR-INT-1). A tabela de sinais só na 1.5, para o feedback externo. |
| Seção 31 | Entidades analíticas com `hotel_id` "quando aplicável" | Regra 1 | `tenant_id NOT NULL` em toda tabela; o insight de rede sem hotel só é lido por quem tem escopo de grupo ou bandeira, com caso no pgTAP. |
| Seções 10, 17 e 23 | Classificação de texto, resumo e agrupamento por IA | Regra 9 (sem IA no MVP) | Só na 1.5, depois do MVP, e com o provedor decidido. |
| Seções 14, 18 e 32 | Custo, fornecedor, Repair vs Replace e Portfolio | Regra 10 (escopo fechado; fase 2 no `docs/00`) | Versão mínima no MVP, fora do PWA: "executado por" e o custo informado (05/10/2026). O custo estimado, o de substituição, o cadastro de fornecedores, o Repair vs Replace com custo e o Portfolio seguem na fase 2. |
| Seção 25 | Alerta por WhatsApp | Regra 10 (WhatsApp é fase 2) | Fica para a fase 2; in-app, e-mail e push usam o que já existe. |
| Seção 26 | `POST /api/v1/intelligence/feedback-signals`, com CSV, API e webhook genéricos | Convenção de nomes e base comum das integrações (IX1 a IX3) | Rota em português, na 1.5, sobre a mesma credencial por tenant e a mesma entrega assinada das IX1 a IX3, sem um segundo mecanismo. |
| Seção 27 | Adaptadores de PMS (TOTVS, Oracle) para ocupação e UH | Regra 8 (TOTVS só leitura) | Compatível, desde que só leitura e sem PII além do necessário; ocupação é fase 2 (`docs/00`, contexto da UH). |
| Seção 10 | Texto do hóspede, `room_hint` | LGPD e ADR-025 (dados no aparelho) | Na 1.5: minimizar, não levar ao PWA, prazo de retenção definido antes. |

## Decisões do Cesar (05/10/2026)

1. **Quando:** as três migrações entram no começo da 1b, antes de qualquer outra tarefa dela, na ordem proposta.
2. **Custo e fornecedor:** versão mínima, fora do PWA. "Executado por" na triagem (equipe interna ou terceiro, com o nome do terceiro) e "custo informado" no aceite (valor opcional em reais, sem aprovação nem alçada). O módulo de custos e fornecedores segue na fase 2.
3. **Códigos:** cadastrados pelo Admin do grupo, com padrões por categoria.
4. **Obrigatoriedade dos códigos:** política por hotel, desligada por padrão. No PWA, os códigos aparecem como sugestão.

**A confirmar com o Cesar na 1b:** com a política ligada, a cobrança dos códigos fica no aceite, e não na conclusão do técnico (seção do PWA). É a leitura que concilia "sugestão no PWA" com a obrigatoriedade.

**Para o agente do Kaio**, quando as migrações entrarem, os campos "(fase A)" de `packages/inteligencia/src/historico.ts` trocam pelos nomes reais:
- `codigoFalha` → `app.os.codigo_falha_id`;
- `Criticidade` → `app.ativo.criticidade`, na escala fixa de 1 a 5 (decisão de 06/10/2026);
- o custo deixa de ser componente ausente quando houver `custo_informado`;
- a regra do mesmo fornecedor pode usar `terceiro_nome`, normalizado como o `chaveDeModelo`.

## Decisões do Cesar (06/10/2026)

Sobre o mapa das entradas do `calcularDia` (`docs/referencia/mapa-entradas-calcular-dia.md`) e a proposta de extensão das políticas (`docs/referencia/proposta-extensao-politicas.md`), do agente do Kaio:

1. **Transições da OS:** tabela `app.os_transicao` (de, para, quando, quem e a ação), gravada pelo caso de uso na mesma unit of work que muda o estado, só com INSERT, legível pelo `hk_app` no recorte da OS e pelo `hk_worker` no tenant do job. Serve ao MTTR da 1c e dá ao job a conclusão e as reaberturas, sem abrir a auditoria ao worker. Sem colunas de conveniência na OS por enquanto. Entra como migração própria logo depois da 2 (chamado e OS).
2. **Ponto de extensão das políticas** por registro de formatos, montado no ponto de composição. Uma resolução só, a do registro. O nível bandeira entra na 1c; até lá, valor com escopo de bandeira é recusado na gravação.
3. **Módulos contratados** em `licenca.modulo` (tenant, módulo, vigência), gravados pelo backoffice e lidos pelo `hk_app` e pelo `hk_worker` no próprio tenant. Até o backoffice existir, a gravação é por script de operação.
4. **Criticidade fixa de 1 a 5,** com os nomes configuráveis nos quatro idiomas (migração 1, acima).
5. **O limite que faz o score sugerir insight** vira campo da política `inteligencia.atencao_ativo`, com padrão 70.
6. **Liberação estreita no lint:** só a pasta do módulo no servidor do web (`apps/web/src/servidor/modulos/inteligencia/`) e as rotas e telas `inteligencia` do `apps/web` importam `@hubkeep/inteligencia`. A composição chega ao módulo por uma única função de montagem, e os pacotes do núcleo continuam proibidos.
