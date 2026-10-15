# PRD — Evolução enxuta do HubKeep Core (PCM predial e hoteleiro)
**Versão:** 0.1 · **Data:** 13/10/2026 · **Situação:** proposta pós-MVP, sem autorização de implementação.
**Mercado-alvo:** hotéis, resorts, parques, condomínios corporativos e outros empreendimentos com manutenção predial.
**Premissa aprovada na discussão de produto:** HubKeep **não é ERP**. Deve resolver o trivial da manutenção, com operação simples, registro consistente e integração opcional com sistemas existentes.

## 1. Fronteira funcional
**Core:** ativos/locais, chamados, OS corretiva e preventiva, checklists, inspeções, QR, execução mobile/offline, equipe e terceiros, calendário básico, SLA, histórico, indicadores e administração de várias unidades.
**Integrações opcionais:** PMS, EasyGov, ERP de compras/estoque, sistemas de BI, sensores (posteriormente). Nenhuma dependência é condição para abrir ou executar OS.
**Expressamente fora:** contabilidade, fiscal, faturamento, folha, compras e aprovações financeiras complexas, requisições de compra, contas a pagar, planejamento financeiro empresarial, estoque/almoxarifado como ERP, CRM, reservas e revenue management.
**O mínimo tolerado na OS:** registrar materiais usados em texto/quantidade (quando necessário), fornecedor/serviço executado, horas e custo informado; não fazer contabilização, valorização fiscal, saldos ou suprimento corporativo. Rever os itens de estoque/compras da fase 2 antes de implementá-los.

## 2. Status da base já existente
- Fase 0 e 1a estão na main; fase 1b e 1c seguem em execução; Intelli 1.0 já tem motor e telas mas precisa de consolidação, integração e pilotos.
- Não duplicar chamado, OS, instrumentos, checklist, SLA, QR, histórico, multi-tenant, app do técnico, indicadores já aprovados.
- Este documento **não reabre** o MVP; é catálogo de lacunas para priorização depois do piloto.

## 3. Melhorias candidatas
| ID | Iniciativa | Experiência mínima desejada | Valor | Fase candidata |
|---|---|---|---|---|
| PCM-01 | Agenda visual de serviços | Visão dia/semana por hotel/equipe/técnico com OS prevista e vencimentos, filtros e drag-and-drop somente se auditado | Alto | Pós-MVP 2 |
| PCM-02 | Capacidade de equipe | Carga prevista por equipe/turno a partir de duração estimada, sem RH, ponto ou folha | Alto | Pós-MVP 2 |
| PCM-03 | Preventiva por horímetro/medidor | Medidor por ativo, leitura manual, unidade, limite e regra de disparo, geração idempotente de OS | Alto para ativos críticos | Pós-MVP 2 |
| PCM-04 | Indicadores MTBF e disponibilidade | MTBF com critérios de base amostral, intervalo, denominação e fonte únicos; sem fingir probabilidade preditiva | Médio-alto | Intelligence 2 |
| PCM-05 | Pareto de falhas | Gráfico por categoria/causa/local/ativo, corte temporal, universo e fonte transparentes | Médio | Painéis |
| PCM-06 | Custo básico técnico na OS | Quantidade/descrição simples de peças, horas, fornecedor e custo informado; sem saldo ou transação financeira | Médio | Extensão do Core |
| PCM-07 | Exportação/integração corporativa | APIs com escopo, paginação, limites, exports e webhooks assinados de OS/ativos; BI consome sem acesso ao banco | Alto para redes | Enterprise |
| PCM-08 | Confiabilidade avançada | Avaliar R(t) apenas se histórico e premissas estatísticas permitem | Baixo no início | Pós-MVP 3 |
| PCM-09 | IoT/leituras automáticas | Adapter opcional para leituras e regras, sem criar plataforma industrial de sensores | Baixo no início | Pós-MVP 3 |

## 4. Requisitos essenciais e critérios de aceite
### PCM-01 / PCM-02
- Consultar OS e preventivas de um ou vários hotéis segundo papéis; preservar prioridades e políticas SLA existentes.
- Calendário por técnico/equipe considera fuso do hotel e jornada parametrizada, sem folha/RH.
- Filtro por categoria, local, status, capacidade e criticidade; drag-and-drop, se existir, requer checagem de permissão, versão, auditoria e aviso de conflito.
- Trabalho sem duração estimada deve aparecer como sem estimativa, nunca como carga zero.
- Não designar equipe automaticamente pela IA sem autorização humana/política.

### PCM-03
- Tipos de medidor configuráveis: horas, ciclos, distância ou leitura numérica com unidade; número válido, sequência e correções auditadas.
- Leitura por técnico autenticado, inclusive fila offline, com controle de duplicação e conflitos.
- Plano por medidor é **alternativa ou complemento** ao plano por tempo; escolher política para disparo combinado.
- Geração idempotente de OS por limiar alcançado. Falha de leitura não cria falsos atrasos.
- O módulo não exige hardware conectado; integração externa pode vir depois.
- Medidor ligado a ativo do hotel, e nenhuma leitura de outro tenant passa na autorização.

### PCM-04 / PCM-05
- MTBF só é publicado após definição formal no glossário e aprovação de limiar de histórico; separar reparáveis e não reparáveis.
- Pareto tem período, universo e dimensão explícitos; código de causa ausente fica como "não informado".
- Métricas corporativas normalizadas por base relevante (ativos, hotéis, UHs, horas) quando disponíveis.

### PCM-06 / PCM-07
- Materiais e custos são **campos da intervenção**; não são estoque, pedido ou contas a pagar.
- Webhooks assinados, idempotência/reenvio, logs sem PII e contrato versionado; acesso por escopo tenant/hotel; nenhuma escrita automática em ERP/PMS sem adapter autorizado.
- Não conceder acesso direto público a `app` ou à Data API.

## 5. Não objetivos e salvaguardas
A agenda não vira gestão de RH. O registro de materiais não vira WMS. O valor da OS não vira contabilidade. Não adicionar compra, cotação ou aprovação financeira complexa para igualar SGMAN/Sankhya. A integração deve ser a ponte.
Preditiva com ML/IoT permanece fora do MVP por regra do `CLAUDE.md`.

## 6. Governança e próximos passos
1. Validar estas lacunas em entrevistas com equipes de manutenção de hotel, resort e parque.
2. Comparar com o que já está em `docs/12`, `docs/13` e no Intelligence; fazer gap analysis em vez de criar recurso duplicado.
3. Medir esforço, qualidade dos dados e dependências, com protótipos antes de aprovar implementação.
4. Validar explicitamente a **redução de escopo** dos itens de compras/estoque presentes no documento de projeto; não apagar decisões aprovadas sem um novo registro.
5. Um PR por melhoria aprovada, com testes de domínio, banco, RLS, autorização e UX.
