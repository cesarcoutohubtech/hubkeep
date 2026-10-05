# PRD — HubKeep Intelligence
## Camada de Inteligência de Negócios para Manutenção Hoteleira

**Produto:** HubKeep / CSC  
**Módulo:** HubKeep Intelligence  
**Versão:** 1.0  
**Data:** 30/09/2026  
**Mercado inicial:** hotéis independentes e redes hoteleiras no Brasil  
**Status:** proposta para implementação no Claude  
**Natureza:** inteligência integrada ao HubKeep — não é um produto independente de reputation management

> **No repositório do HubKeep:** proposta, publicada em 05/10/2026 pela decisão do Cesar de 30/09/2026 (o Intelligence entra como módulo opcional do HubKeep). O texto é o original, sem edição. Onde ele conflita com as regras do `CLAUDE.md`, valem as regras; os conflitos estão no relatório de lacunas (`docs/referencia/lacunas-instrumentacao-intelligence.md`) e nas propostas de ADR (`docs/referencia/propostas-adr-inteligencia.md`).

---

# 1. Decisão de produto

O HubKeep Intelligence deve transformar dados operacionais de manutenção em informação de decisão.

A proposta **não** é criar dentro do HubKeep uma plataforma completa de reputation management. Feedback de hóspedes, pesquisas, reviews, PMS e outras fontes externas serão tratados como **sinais adicionais** que enriquecem os dados já existentes de:

- ativos;
- chamados;
- ordens de serviço;
- manutenção preventiva;
- reincidência;
- criticidade;
- downtime;
- custos;
- compliance;
- hotel/UH/local;
- fornecedores;
- equipe.

A tese central é:

> **O HubKeep não deve apenas dizer o que quebrou. Deve mostrar quais falhas mais se repetem, quais ativos mais consomem recursos, quais problemas realmente impactam os hóspedes e onde a gestão deveria agir primeiro.**

O módulo deve ajudar o gestor a responder:

1. Quais ativos estão causando mais problemas?
2. Quais falhas estão se repetindo?
3. Quais problemas estão afetando hóspedes?
4. Quais hotéis/UHs/áreas concentram ocorrências?
5. Quais modelos/fabricantes apresentam pior comportamento?
6. Quanto está custando manter determinados ativos?
7. A manutenção realizada resolveu definitivamente o problema?
8. Quando vale investigar substituição em vez de continuar reparando?
9. Existem sinais de problema sistêmico?
10. Existem reclamações externas relacionadas a manutenção ou compliance que ainda não apareceram nos chamados internos?

---

# 2. Restrições herdadas do CSC

O módulo deve respeitar as decisões existentes do produto:

- arquitetura em monólito modular;
- PostgreSQL multi-tenant;
- RLS por escopo;
- grupo → bandeira → hotel → local/UH → ativo;
- políticas configuráveis;
- exigências de clientes não viram regras fixas no código;
- integração com PMS e sistemas externos por adapters/APIs;
- TOTVS em modo somente leitura enquanto não houver escrita homologada;
- PWA/offline permanece isolado da camada analítica;
- preditiva por ML e IoT continuam fora das fases iniciais;
- o HubKeep deve continuar funcionando quando uma fonte externa estiver indisponível.

O Intelligence deve **aproveitar a arquitetura existente**, não criar uma segunda plataforma de BI paralela.

---

# 3. Problema

Um CMMS tradicional responde bem:

- quantas OS estão abertas;
- quem está responsável;
- prazo/SLA;
- MTTR;
- preventivas em dia;
- histórico do ativo.

Mas normalmente não responde bem:

> **Qual desses problemas está realmente prejudicando a operação e a experiência do hóspede?**

Nem:

> **Estamos gastando repetidamente em um equipamento que continua falhando?**

Nem:

> **Várias reclamações diferentes representam a mesma causa técnica?**

Nem:

> **Depois que fizemos uma intervenção, o problema realmente deixou de ocorrer?**

O HubKeep Intelligence deve preencher essa lacuna.

---

# 4. Proposta de valor

## 4.1 Posicionamento interno

> **Business Intelligence para engenharia e manutenção hoteleira.**

## 4.2 Posicionamento comercial

> **O HubKeep mostra onde a manutenção está impactando hóspedes, custos e operação — e ajuda a gestão a decidir onde agir primeiro.**

## 4.3 O que não vender

Não vender apenas:

- “temos dashboards”;
- “temos IA”;
- “criamos chamados a partir de reviews”.

O valor deve ser:

> **Conectar ativo + falha + reincidência + custo + operação + experiência do hóspede para revelar problemas que um CMMS tradicional não mostra.**

---

# 5. Personas

## Diretor de Operações
Quer saber onde a manutenção está prejudicando a operação da rede e onde investir.

## Diretor/Coordenador de Engenharia
Quer priorizar ativos, equipes, substituições e planos preventivos.

## Gerente Geral
Quer entender quais problemas técnicos estão chegando aos hóspedes.

## Gerente de Manutenção
Quer identificar reincidências, gargalos, ativos problemáticos e eficiência das intervenções.

## Controller / Financeiro
Quer visualizar custo acumulado por ativo, categoria, hotel e fornecedor.

## Gestor corporativo de rede
Quer comparar propriedades, detectar padrões entre hotéis e identificar problemas sistêmicos.

---

# 6. Princípios

1. **Explicável antes de “inteligente”.**
2. IA sugere e correlaciona; não toma decisões finais.
3. Scores devem mostrar seus componentes.
4. Nenhuma recomendação deve esconder os dados que a originaram.
5. A ausência de feedback externo não pode impedir o funcionamento.
6. Feedback externo é sinal, não prova de falha.
7. Correlação não deve ser apresentada como causa confirmada.
8. Dados de hóspedes devem ser minimizados.
9. Integrações devem ser opcionais.
10. Métricas devem poder ser comparadas por hotel, categoria, ativo, modelo e período.

---

# 7. Estrutura funcional

O módulo terá seis blocos:

1. **Operational Intelligence**
2. **Asset Intelligence**
3. **Guest Impact Intelligence**
4. **Recurring & Systemic Issues**
5. **Cost / Repair vs Replace**
6. **Portfolio Intelligence**

---

# 8. Operational Intelligence

Baseada apenas em dados que o HubKeep já possui.

## Indicadores

- backlog;
- backlog por idade;
- SLA;
- MTTR;
- MTBF quando houver histórico suficiente;
- preventivas vencidas;
- preventivas executadas;
- corretivas por ativo;
- reincidência após encerramento;
- reabertura;
- reprogramações;
- downtime;
- tempo sem responsável;
- tempo entre chamado e início da execução;
- tempo entre execução e aceite.

## Visões

- hotel;
- departamento;
- local;
- UH;
- categoria;
- ativo;
- técnico;
- fornecedor;
- fabricante;
- modelo.

---

# 9. Asset Intelligence

Cada ativo deve possuir uma visão analítica com:

- criticidade;
- idade;
- fabricante;
- modelo;
- série;
- categoria;
- hotel/local;
- quantidade de OS;
- quantidade de corretivas;
- preventivas;
- custo acumulado;
- custo últimos 12 meses;
- downtime;
- reincidência;
- última falha;
- tempo desde última preventiva;
- reclamações externas associadas;
- UHs impactadas;
- Asset Attention Score;
- sinal Repair vs Replace.

---

# 10. Guest Impact Intelligence

## 10.1 Objetivo

Usar a voz do hóspede como uma fonte adicional para identificar impactos que podem não aparecer nos chamados internos.

Fontes possíveis:

- pesquisa própria;
- NPS/CSAT;
- importação CSV;
- API;
- plataforma de reputation;
- Google;
- Booking;
- PMS/CRM;
- formulários;
- central de atendimento.

Não é requisito integrar todas as fontes inicialmente.

## 10.2 Entrada mínima normalizada

```ts
interface GuestFeedbackSignal {
  externalId?: string;
  tenantId: string;
  hotelId: string;
  occurredAt: string;
  source: string;
  rating?: number;
  ratingScale?: number;
  text?: string;
  language?: string;
  reservationExternalId?: string;
  roomExternalId?: string;
  roomId?: string;
  rawReference?: string;
}
```

## 10.3 Classificação por IA

A IA pode extrair:

- manutenção / não manutenção;
- categoria;
- subcategoria;
- sintoma;
- severidade percebida;
- sentimento;
- local/UH citado;
- possível ativo;
- evidência textual;
- confiança.

Exemplo:

```json
{
  "is_maintenance_related": true,
  "category": "HVAC",
  "subcategory": "NOISE",
  "severity": "HIGH",
  "summary": "Hóspede relata ruído excessivo do ar-condicionado.",
  "room_hint": "412",
  "asset_hint": "air_conditioner",
  "confidence": 0.94,
  "evidence": "o ar-condicionado fazia muito barulho"
}
```

## 10.4 Regra crítica

O sistema nunca deve afirmar que um ativo causou a reclamação apenas com inferência.

Estados:

- `UNMATCHED`
- `POSSIBLE_MATCH`
- `CONFIRMED_MATCH`

O usuário pode confirmar a associação.

---

# 11. Guest Impact Score

Score 0–100 para representar o quanto uma falha/ativo está chegando ao hóspede.

Primeira versão determinística e explicável.

Componentes sugeridos:

- volume de feedback associado;
- severidade média;
- quantidade de UHs afetadas;
- recorrência;
- proximidade temporal;
- impacto operacional quando PMS disponível.

Exemplo conceitual:

```text
GuestImpact =
  30% volume normalizado
+ 25% severidade média
+ 20% recorrência
+ 15% amplitude de UHs
+ 10% impacto operacional
```

Pesos configuráveis e versionados.

A UI deve explicar:

> Guest Impact: 82/100 — Alto

**Por quê?**
- 9 reclamações em 30 dias;
- 6 UHs diferentes;
- 5 classificadas como alta severidade;
- 4 reincidências após reparo.

---

# 12. Recurring Failure Score

Objetivo: mostrar se um ativo/problema volta após intervenções.

Componentes:

- corretivas no período;
- intervalo entre falhas;
- reaberturas;
- mesma categoria de falha;
- falha após preventiva;
- falha após corretiva recente.

Score 0–100, sempre com breakdown.

---

# 13. Asset Attention Score

Objetivo: criar uma fila gerencial de ativos que merecem investigação.

Combina:

- criticidade;
- reincidência;
- downtime;
- custo;
- Guest Impact;
- preventiva atrasada;
- compliance associado;
- falha recente.

Exemplo:

```text
AssetAttention =
  20% criticidade
+ 20% recurring failure
+ 15% downtime
+ 15% custo
+ 20% guest impact
+ 10% compliance/preventiva
```

Faixas sugeridas:

- 0–29 Normal
- 30–49 Observar
- 50–69 Atenção
- 70–84 Alta atenção
- 85–100 Crítico para investigação

Faixas e pesos configuráveis.

---

# 14. Repair vs Replace Signal

Objetivo: sinalizar que um ativo merece análise de substituição.

Não decidir automaticamente.

Critérios possíveis:

- custo corretivo acumulado;
- número de falhas;
- downtime;
- idade;
- valor estimado de reposição;
- Guest Impact;
- criticidade;
- garantia;
- reincidência após reparo.

Estados:

- `NO_SIGNAL`
- `WATCH`
- `EVALUATE_REPLACEMENT`
- `REVIEW_REQUIRED`

Exemplo:

> **Avaliar substituição**

Motivos:
- R$ 18.200 gastos em 12 meses;
- 7 corretivas;
- 46h de downtime;
- 5 reclamações de hóspedes;
- ativo com 11 anos;
- custo estimado de substituição: R$ 31.000.

O sistema não deve afirmar ROI sem dados suficientes.

---

# 15. Detecção de problema sistêmico

Primeira versão por regras determinísticas.

## Mesmo modelo

```text
>= X ativos do mesmo modelo
com mesma falha
em Y dias
```

## Mesmo andar/área

```text
>= X ocorrências da mesma categoria
na mesma área
em Y dias
```

## Mesmo fornecedor

```text
taxa de reincidência do fornecedor
> limiar configurável
```

## Crescimento de categoria

```text
crescimento > X%
vs período anterior
```

## Feedback externo

```text
>= X reclamações
mesma categoria
mesmo hotel/área
em Y dias
```

Resultado sempre:

> **Possível problema sistêmico**

Nunca “problema sistêmico confirmado” sem validação humana.

---

# 16. Efetividade da intervenção

Uma das funções centrais.

Pergunta:

> **Depois que corrigimos, o problema realmente diminuiu?**

Comparar 30/60/90 dias antes e depois.

Métricas:

- chamados;
- reincidência;
- downtime;
- reclamações;
- custos.

Exemplo:

```text
Troca dos aparelhos — 4º andar

90 dias antes:
23 chamados
11 reclamações
R$ 9.800 em corretivas

90 dias depois:
5 chamados
2 reclamações
R$ 1.900 em corretivas
```

Exibir:

> Redução observada de ocorrências após intervenção.

Evitar declarar causalidade absoluta.

---

# 17. Compliance Intelligence

Feedback pode gerar **sinal de investigação**, nunca não conformidade automática.

Exemplos:

### “Cheiro forte de mofo”
Relacionar a HVAC/umidade e mostrar histórico relacionado ao PMOC quando aplicável.

### “Baratas no restaurante”
Relacionar a A&B/controle de pragas e mostrar última execução/documentação.

### “Água com odor”
Relacionar a reservatório/última higienização/inspeção.

Tipo de sinal:

`COMPLIANCE_INVESTIGATION_SIGNAL`

---

# 18. Portfolio Intelligence

Para redes.

Dashboard corporativo deve mostrar:

- hotéis com maior backlog;
- hotéis com maior reincidência;
- hotéis com maior Guest Impact;
- custo de manutenção por hotel;
- custo por UH;
- ativos críticos;
- ativos com maior Attention Score;
- falhas sistêmicas;
- modelos problemáticos;
- fornecedores com maior reincidência;
- categorias com maior crescimento;
- compliance investigations.

Comparações:

- hotel vs rede;
- marca vs grupo;
- período vs período;
- fabricante;
- modelo;
- categoria;
- fornecedor.

---

# 19. Intelligence Command Center

Filtros:

- grupo;
- bandeira;
- hotel;
- período;
- categoria;
- criticidade.

Bloco principal:

## Situações que merecem investigação

Exemplo:

**HVAC — modelo Carrier X**
- 18 reclamações
- 31 OS
- R$ 22.400 em 12 meses
- 7 ativos afetados
- Attention Score 91
- ação: `Investigar lote`

**Água quente — 6º andar**
- 11 ocorrências em 14 dias
- 8 UHs
- provável concentração sistêmica
- ação: `Abrir investigação`

**UH 428**
- 4 falhas em 60 dias
- 3 reclamações
- 2 reparos recentes
- ação: `Revisar histórico`

Demais blocos:

- Guest Impact por categoria;
- Top ativos por atenção;
- Recorrências;
- Custo;
- Preventiva;
- Compliance signals;
- Tendências.

---

# 20. Investigation View

Cada insight deve abrir uma tela de investigação contendo:

- resumo;
- score;
- dados que levaram ao insight;
- séries históricas;
- ativos;
- OS;
- chamados;
- feedbacks;
- custos;
- fornecedores;
- ações sugeridas.

Ações:

- criar investigação;
- vincular a ativo;
- vincular feedback;
- abrir chamado;
- criar preventiva;
- marcar falso positivo;
- solicitar orçamento;
- registrar decisão;
- acompanhar resultado.

---

# 21. Modelo de dados

## `intelligence_insight`

```text
id
tenant_id
hotel_id nullable
scope_type
scope_id
insight_type
title
summary
severity
confidence
status
score nullable
score_breakdown jsonb
evidence jsonb
first_detected_at
last_detected_at
assigned_to nullable
resolved_at nullable
resolution_note nullable
created_at
updated_at
```

Status:

- NEW
- REVIEWING
- ACCEPTED
- ACTIONED
- MONITORING
- RESOLVED
- DISMISSED

## `intelligence_signal`

```text
id
tenant_id
hotel_id
signal_type
source
source_entity_type
source_entity_id
category
subcategory
asset_id nullable
local_id nullable
occurred_at
severity nullable
value_numeric nullable
value_json nullable
created_at
```

Tipos:

- WORK_ORDER
- CORRECTIVE_FAILURE
- PREVENTIVE_OVERDUE
- DOWNTIME
- COST
- GUEST_FEEDBACK
- COMPLIANCE
- PMS_OPERATIONAL
- REOPEN
- RESCHEDULE
- INSPECTION_FAILURE

## `feedback_signal`

```text
id
tenant_id
hotel_id
source
external_id nullable
occurred_at
rating nullable
rating_scale nullable
text nullable
language nullable
maintenance_related
category nullable
subcategory nullable
severity nullable
confidence nullable
room_hint nullable
room_id nullable
asset_hint nullable
asset_id nullable
match_status
raw_reference nullable
created_at
```

Não criar módulo de resposta a review dentro deste PRD.

---

# 22. Pipeline

```text
Dados HubKeep
  ├─ chamados
  ├─ OS
  ├─ preventiva
  ├─ ativos
  ├─ custos
  ├─ compliance
  └─ fornecedores

Fontes externas
  ├─ feedback
  ├─ pesquisas
  ├─ PMS
  └─ APIs

        ↓
Signal Normalization
        ↓
Metric Engine
        ↓
Rule / Pattern Engine
        ↓
AI Enrichment (quando necessário)
        ↓
Insight Engine
        ↓
Command Center / Alerts / Investigation
```

---

# 23. Regras versus IA

## Usar regras para:

- contagens;
- percentuais;
- recorrência;
- crescimento/redução;
- thresholds;
- scores;
- SLA;
- custos;
- detecção por janela;
- alertas determinísticos.

## Usar IA para:

- classificar texto;
- resumir;
- extrair sintomas;
- agrupar descrições semanticamente;
- sugerir possível relação;
- explicar um insight em linguagem natural.

IA não deve:

- alterar prioridade automaticamente sem política;
- afirmar causa técnica;
- decidir substituição;
- gerar não conformidade regulatória;
- excluir dados;
- fechar investigação.

---

# 24. Explainability

Todo insight deve responder:

> **Por que estou vendo isso?**

Exemplo:

- 6 corretivas em 90 dias;
- 4 falhas da mesma categoria;
- 29h de downtime;
- 3 reclamações associadas;
- custo 12m aumentou 42%.

Obrigatório em todas as telas de score/insight.

---

# 25. Alertas

Tipos:

- ativo com alta reincidência;
- possível falha sistêmica;
- Guest Impact elevado;
- custo anormal;
- aumento de corretivas;
- falha pós-preventiva;
- recorrência pós-reparo;
- compliance investigation;
- fornecedor com reincidência elevada;
- insight sem tratamento.

Canais:

- in-app;
- e-mail;
- push;
- WhatsApp futuramente.

---

# 26. Integração de feedback

Não construir 10 conectores para validar o módulo.

Primeira fase:

1. CSV;
2. API genérica;
3. webhook genérico;
4. pesquisa interna, se disponível.

Endpoint sugerido:

```http
POST /api/v1/intelligence/feedback-signals
```

Depois, adapters para Google, Booking, plataformas de reputation, CRM e PMS.

O HubKeep deve aceitar dados de um cliente que já usa MARA, TrustYou, ReviewPro, myHotel etc., sem obrigar substituição.

---

# 27. Integração com PMS

Objetivos:

- mapear feedback para UH/reserva quando houver identificador confiável;
- conhecer ocupação;
- identificar janela operacional;
- medir UHs indisponíveis;
- enriquecer Guest Impact.

Não persistir PII desnecessária.

Manter adapters independentes para TOTVS, Oracle e outros.

---

# 28. Metric Engine

Criar serviço dedicado.

Exemplos:

```ts
calculateMttr()
calculateFailureRate()
calculateRecurringFailureScore()
calculateGuestImpactScore()
calculateAssetAttentionScore()
calculateCostTrend()
calculateDowntime()
calculateInterventionEffectiveness()
```

Scores devem ser versionados.

Tabela `metric_definition`:

- key;
- version;
- formula/config;
- config_schema;
- enabled.

---

# 29. Snapshots analíticos

Não recalcular tudo em tempo real.

Agregações sugeridas:

- `asset_metric_daily`
- `hotel_metric_daily`
- `category_metric_daily`

Campos típicos:

```text
date
tenant_id
hotel_id
asset_id/category_id
corrective_count
preventive_count
downtime_minutes
maintenance_cost
guest_feedback_count
guest_negative_count
reopen_count
mttr
attention_score
```

Usar views/materialized views ou jobs conforme arquitetura atual.

---

# 30. Performance

Metas iniciais:

- dashboard da propriedade: < 2s para métricas agregadas;
- rede com 100 hotéis: < 3s para visão consolidada normal;
- drill-down pode carregar assíncrono;
- insights recalculados por job;
- eventos urgentes podem disparar recalculo pontual.

Evitar IA em request síncrono de dashboard.

---

# 31. RLS, segurança e auditoria

Todas as entidades analíticas devem possuir `tenant_id` e `hotel_id` quando aplicável.

Auditar:

- score recalculado;
- insight criado;
- insight descartado;
- associação manual feedback↔ativo;
- mudança de status;
- decisão Repair vs Replace registrada;
- ação criada a partir de insight;
- mudança de política/peso.

---

# 32. Dados que precisam existir desde o MVP operacional

Mesmo que algumas telas só venham depois, modelar desde cedo:

```text
failure_code
cause_code
resolution_code
downtime_start
downtime_end
reopened_from_os_id
supplier_id
estimated_cost
actual_cost
asset_manufacturer
asset_model
asset_serial_number
purchase_date
warranty_until
replacement_estimated_cost
work_source
guest_impact_flag
```

Campos opcionais onde a operação ainda não possuir dado.

---

# 33. Fases

## Fase A — Instrumentação
**Nasce junto com o produto.**

Garantir captura dos dados necessários em chamados/OS/ativos.

## Intelligence 1.0 — Dados internos

Entregar:

- Recurring Failure;
- Asset Attention;
- Command Center;
- insights;
- comparativo por ativo/hotel/categoria;
- intervenção antes/depois;
- Rule Engine.

Sem dependência externa.

## Intelligence 1.5 — Guest Impact

Entregar:

- `feedback_signal`;
- CSV/API/webhook;
- IA de classificação;
- associação a hotel/UH/ativo;
- Guest Impact Score;
- recorrência combinando OS + feedback.

## Intelligence 2.0 — Cost / Network

Entregar:

- custos;
- Repair vs Replace;
- modelos/fabricantes;
- fornecedor;
- Portfolio Intelligence;
- PMS enrichment;
- dashboards executivos.

## Intelligence 3.0 — Advanced

Somente com dados suficientes:

- clustering semântico;
- anomalias;
- previsão;
- IoT;
- condition monitoring;
- preditiva.

---

# 34. Histórias de usuário prioritárias

## US-I01 — Reincidência
Como gerente de manutenção, quero saber quais ativos apresentam maior reincidência.

**Aceite**
- filtrar período;
- visualizar score;
- visualizar ocorrências;
- entender cálculo.

## US-I02 — Impacto no hóspede
Como gerente geral, quero saber quais falhas técnicas estão chegando aos hóspedes.

**Aceite**
- feedback associado;
- categoria;
- quantidade;
- tendência;
- drill-down.

## US-I03 — Modelo problemático
Como diretor corporativo, quero identificar um modelo de equipamento problemático na rede.

**Aceite**
- agrupar por fabricante/modelo;
- comparar falhas;
- custo;
- downtime;
- Guest Impact.

## US-I04 — Efetividade
Como engenheiro, quero saber se uma intervenção funcionou.

**Aceite**
- selecionar intervenção;
- comparar antes/depois;
- mostrar janela;
- ocorrências e custos;
- ressalvar correlação.

## US-I05 — Padrão sistêmico
Como gestor, quero ser alertado quando várias UHs apresentarem a mesma falha.

**Aceite**
- política configurável;
- insight sistêmico;
- evidências;
- ação de investigação.

## US-I06 — Repair vs Replace
Como financeiro, quero identificar ativos que merecem análise de substituição.

**Aceite**
- custo;
- falhas;
- downtime;
- idade;
- custo de reposição quando disponível;
- sinal explicável.

---

# 35. Critérios de aceite — Intelligence 1.0

1. Existe dashboard Intelligence.
2. Dados respeitam RLS.
3. Existe Recurring Failure Score.
4. Existe Asset Attention Score.
5. Cada score exibe breakdown.
6. Insights são gerados por regras configuráveis.
7. Usuário pode aceitar/descartar insight.
8. Usuário pode abrir investigação/chamado.
9. Existe comparação antes/depois.
10. Jobs são idempotentes.
11. Recalculo não bloqueia operação.
12. Existem testes unitários.
13. Existem testes de isolamento.
14. Existe auditoria.

---

# 36. Critérios de aceite — Guest Impact

1. Importar CSV.
2. Receber feedback por API.
3. Deduplicar.
4. IA retornar JSON estruturado.
5. Mostrar confiança.
6. Permitir corrigir classificação.
7. Permitir associar hotel/UH/ativo.
8. Diferenciar associação sugerida de confirmada.
9. Calcular Guest Impact.
10. Feedback aparecer no Asset 360.
11. Combinar recorrência operacional + feedback.
12. Não exigir dados pessoais desnecessários.

---

# 37. Casos de teste

## Recorrência
Mesmo ativo: 5 OS HVAC em 60 dias.

Esperado:
- score alto;
- insight;
- breakdown.

## Problema sistêmico
8 UHs no mesmo andar com água fria em 10 dias.

Esperado:
- possível problema sistêmico.

## Modelo problemático
17 equipamentos iguais em hotéis diferentes com mesma falha.

Esperado:
- insight por modelo.

## Guest Impact
Review: “Ar do 304 muito barulhento.”

Esperado:
- maintenance=true;
- HVAC/noise;
- UH hint 304;
- associação não confirmada sem evidência adicional.

## Compliance
“Baratas no restaurante.”

Esperado:
- compliance investigation signal;
- não criar não conformidade automaticamente.

## Repair vs Replace
Ativo com 8 falhas, alto downtime, custo 12m elevado, idade alta e guest impact elevado.

Esperado:
- `EVALUATE_REPLACEMENT`;
- justificativa.

---

# 38. UI — navegação

```text
Inteligência
 ├─ Command Center
 ├─ Ativos
 ├─ Recorrências
 ├─ Impacto no Hóspede
 ├─ Custos
 ├─ Rede
 └─ Investigações
```

Itens exibidos conforme licença/capabilities.

---

# 39. IA conversacional — fase posterior

Exemplos:

> “Quais ativos estão causando mais reclamações este mês?”

> “Por que o Hotel Goiânia apareceu em atenção?”

> “Quais aparelhos Carrier tiveram mais de 3 falhas no último semestre?”

> “Compare HVAC entre Brasília e Goiânia.”

> “O que mudou após a troca dos equipamentos do 4º andar?”

A IA deve consultar métricas/queries autorizadas, não responder baseada somente em embeddings.

---

# 40. KPIs de sucesso

Uso:

- gestores ativos;
- insights visualizados;
- insights aceitos;
- investigações abertas;
- ações geradas.

Qualidade:

- falso positivo;
- associação confirmada;
- correções de classificação.

Negócio:

- redução de reincidência;
- redução de downtime;
- redução de custo corretivo;
- aumento de preventiva;
- redução de reclamações técnicas;
- decisões Repair vs Replace suportadas por dados.

Não afirmar causalidade comercial automaticamente.

---

# 41. Riscos

## Dados insuficientes
Mitigação: instrumentação desde o MVP.

## Cadastro de ativo ruim
Mitigação: Asset Capture / QR / qualidade do inventário.

## Usuário não registra causa/resolução
Mitigação: campos simples, sugestões e obrigatoriedade configurável.

## IA associa feedback errado
Mitigação: confidence + confirmação.

## Scores viram caixa-preta
Mitigação: breakdown obrigatório.

## Dashboard vira BI genérico
Mitigação: cada insight precisa levar a investigação/ação.

## Escopo explode
Mitigação: fontes externas entram por fases.

---

# 42. Fora de escopo

No Intelligence 1.0:

- plataforma completa de reputation;
- resposta a reviews;
- social media;
- marketing;
- CRM;
- chatbot para hóspedes;
- IoT;
- manutenção preditiva;
- recomendação autônoma de compra;
- decisão automática de substituir ativo.

---

# 43. Instruções para o Claude

Antes de codificar:

1. Ler o Registro de Decisões atual.
2. Verificar os módulos reais existentes.
3. Não assumir nomes de tabelas/endpoints.
4. Identificar quais campos necessários já existem.
5. Produzir gap analysis.
6. Dividir em PRs pequenos.
7. Cada PR deve conter migration, RLS, service, testes, auditoria e critérios de aceite.
8. Não implementar feedback externo antes do Intelligence 1.0.
9. Não adicionar dependência de LLM ao dashboard básico.
10. Não introduzir microserviços.
11. Reutilizar fila/jobs existentes.
12. Reutilizar arquitetura de políticas.
13. Reutilizar Integration Hub para fontes externas.
14. Toda nova regra deve ser configurável por tenant/marca/hotel quando aplicável.

---

# 44. Sequência de PRs sugerida

## PR-I1 — Instrumentation Audit
- mapear dados existentes;
- failure/cause/resolution;
- downtime;
- custo;
- fabricante/modelo;
- migrations mínimas.

## PR-I2 — Intelligence Domain
- `intelligence_signal`;
- `intelligence_insight`;
- RLS;
- enums;
- APIs.

## PR-I3 — Metric Engine
- métricas básicas;
- snapshots;
- jobs;
- testes.

## PR-I4 — Recurring Failure
- score;
- regras;
- insights;
- UI.

## PR-I5 — Asset Attention
- score;
- breakdown;
- Asset 360 Intelligence.

## PR-I6 — Command Center
- cards;
- filtros;
- investigação;
- ações.

## PR-I7 — Intervention Effectiveness
- before/after;
- timeline;
- métricas.

## PR-I8 — Guest Signal Foundation
- `feedback_signal`;
- CSV;
- API;
- dedupe.

## PR-I9 — AI Feedback Classification
- schema;
- prompt versionado;
- confidence;
- correção humana.

## PR-I10 — Guest Impact
- score;
- associações;
- dashboard.

## PR-I11 — Cost / Repair vs Replace
- custo;
- sinais;
- decisão registrada.

## PR-I12 — Portfolio Intelligence
- rede;
- modelos;
- fornecedores;
- benchmark interno.

---

# 45. Decisões propostas para o Registro de Decisões

```text
D-XX | 30/09/2026 | Criar HubKeep Intelligence como camada de inteligência de negócios integrada ao CSC/HubKeep, e não como produto separado de Reputation | Concentrar diferenciação em manutenção, ativos e impacto operacional | Proposta

D-XX | 30/09/2026 | Feedback de hóspedes será tratado como sinal adicional da manutenção, não como domínio de reputation management | Evitar competir diretamente com plataformas maduras de reputação | Proposta

D-XX | 30/09/2026 | Scores de inteligência serão determinísticos, versionados, configuráveis e explicáveis | Evitar caixa-preta e permitir auditoria | Proposta

D-XX | 30/09/2026 | IA será utilizada para classificação, resumo e correlação de dados não estruturados; decisões de manutenção permanecerão humanas/políticas | Segurança e confiabilidade | Proposta

D-XX | 30/09/2026 | O modelo operacional deverá capturar desde o MVP os campos necessários à inteligência futura, ainda que as telas avançadas sejam implementadas depois | Evitar histórico pobre e retrabalho estrutural | Proposta

D-XX | 30/09/2026 | Integrações externas de feedback serão opcionais e entrarão depois do Intelligence 1.0; CSV/API genérica precedem conectores específicos | Reduzir escopo e dependência de terceiros | Proposta
```

---

# 46. Resultado esperado

O HubKeep deve evoluir de:

> **“software para controlar manutenção”**

para:

> **“plataforma que transforma dados de manutenção em decisões de engenharia e operação.”**

A inteligência não substitui o trabalho do gestor. Ela reduz o tempo necessário para descobrir:

- onde está o problema;
- se é recorrente;
- quanto custa;
- quem está sendo impactado;
- se a intervenção funcionou;
- quais ativos merecem atenção primeiro.

Esse é o valor agregado esperado do HubKeep Intelligence.