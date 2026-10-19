# PRD — Room Quality Intelligence (RQI)
**Versão:** 0.1 · **Data:** 13/10/2026 · **Situação:** proposta pós-MVP; depende de aprovação do produto e, nas regras do Intelligence, de Cesar e Kaio.
**Produto:** HubKeep Intelligence opcional. Especialização para hotelaria, integrada ao HubKeep Core e à governança EasyGov quando disponível.

## 1. Objetivo
Apontar apartamentos e ambientes cuja condição técnica e histórico operacional justifiquem atenção **antes** de novas reclamações. Não é um score de limpeza, nem um detector de hóspede insatisfeito, nem promessa causal de retenção/receita. Os números refletem risco operacional segundo regras explícitas.

### Perguntas
- Que UHs acumulam mais falhas/reaberturas recentes?
- Onde há OS repetidas sem evidência de solução duradoura?
- Quais apartamentos continuam com inspeção operacional pendente (quando EasyGov integrado)?
- Quais queixas vieram diretamente dos hóspedes via Guest Care e quais tiveram confirmação posterior?
- Onde a ação deveria ocorrer primeiro, com base em impacto, recorrência, estado da UH e ocupação informada (se houver integração homologada)?

## 2. Escopo e etapas
**RQI 1.0 (pós Intelligence 1.0):** leitura de sinais do núcleo: chamados por local/UH/ativo, reincidência, prazos, impacto no hóspede registrado, UH indisponível, estados de OS, efetividade observada. Visão por UH com diagnóstico explicável e fila de atenção configurável. Funciona sem EasyGov/PMS e sem LLM.

**RQI 1.1:** fontes opcionais EasyGov (inspeção, governança, status), Guest Care e feedback externo autorizado. Distinguir relato de hóspede, evidência técnica e associação apenas provável.

**RQI 2.0:** evolução com histórico validado de ocupação e intervenções; análise de correlação com reclamações posteriores e qualidade da UH. Não treinar modelos preditivos nem estimar receita incremental como resultado comprovado sem dados suficientes.

### Não objetivos
Gestão de reservas, limpeza completa, pricing, revenue management, comercialização da UH, desativação automática no PMS, investigação de funcionários, classificação pessoal por técnico ou BI genérico.

## 3. Jornada do gestor
1. **Painel de rede:** hotéis com UHs que merecem atenção, filtros por bandeira, hotel, torre, período e gravidade.
2. **Lista de UHs prioritárias:** UH, faixa de atenção, fatores explicáveis, chamados e indisponibilidades; ausência de dados deve ser explícita.
3. **Detalhe UH 360:** histórico de falhas, ativos, linhas do tempo, intervenções, reincidências, acompanhamento de Guest Care e inspeções (somente quando integrados/autorizados).
4. **Ação humana:** abrir investigação ou criar chamado/inspeção conforme permissão; quem executa precisa validar antes de alterar estado operacional.
5. **Verificação posterior:** janelas antes/depois das intervenções, limite de base suficiente e status de evidência.
6. **Visão corporativa:** comparação entre hotéis da mesma bandeira e entre perfis equivalentes, sem rankings injustos por tamanho/ocupação.

## 4. Requisitos e prioridade
| ID | Requisito | Prioridade |
|---|---|---|
| RQI-01 | Ligar módulo por licença/tenant e políticas grupo → bandeira → hotel | P0 |
| RQI-02 | Consulta agregada e lista paginada de UHs com atenção | P0 |
| RQI-03 | Score determinístico 0–100, versionado, explicável; componentes ausentes ≠ zero | P0 |
| RQI-04 | Evidências vinculadas à UH (chamado, OS, ativo, indisponibilidade) respeitando escopo | P0 |
| RQI-05 | Acesso somente aos hotéis/UHs permitidos; proprietário apenas mediante política e autorização definidas | P0 |
| RQI-06 | Ligação de UH a inspeção EasyGov opcional por contrato API | P1 |
| RQI-07 | Ingestão de eventos Guest Care e feedback autorizado; associação possível/confirmada | P1 |
| RQI-08 | Comparativos por hotel/bandeira e identificação de padrões recorrentes | P1 |
| RQI-09 | Fluxo de investigação/ação e acompanhamento da efetividade | P1 |
| RQI-10 | Transparência das fontes, versão do score e período, com dados incompletos marcados | P0 |
| RQI-11 | Exportação agregada para análise corporativa dentro do escopo | P2 |
| RQI-12 | Vínculo com ocupação futura ou bloqueio do PMS somente se homologado e autorizado | P2 |

## 5. Modelo de score proposto — A VALIDAR
Componentes candidatos: reincidência em 90 dias; falhas com impacto no hóspede confirmado; indisponibilidade da UH; OS reabertas; intervenções sem evidência suficiente de eficácia; alertas de inspeção EasyGov; relatos Guest Care confirmados.
- Pesos e limites não estão aprovados. **Não escolher pesos agora.** Submeter fórmula, fontes e estados a Cesar + Kaio (ADRs Intelligence).
- Ausência de histórico não equivale a ausência de risco. Mostrar cobertura e confiança operacional da pontuação, sem inferir probabilidade estatística de reclamação.
- Não confundir gravidade da reclamação com prova de falha técnica.
- Não vincular feedback a ativo só por correspondência textual; `nao_associado`, `possivel`, `confirmado`, com validação humana em caso incerto.
- Uma única função canônica para MTTR, SLA, indisponibilidade e aceites, conforme `docs/referencia/glossario-metricas.md`. Não criar calculadoras paralelas.

## 6. Dados e arquitetura
- Consumir os dados do núcleo pelas portas já utilizadas pelo Intelligence (ADR-037); o núcleo não importa RQI.
- RQI é uma visão/especialização do Intelligence, não um BI paralelo nem um ERP.
- O motor existente usa `packages/inteligencia`, scores puros e métricas versionadas, com APIs e UI na `apps/web`. Engenharia deve fazer gap analysis antes de propor nova tabela.
- A associação com `app.local` que representa UH é obrigatória para score por quarto; para área comum, usar `local` e visualização apropriada.
- EasyGov: integração por adapter/API, sem acesso direto ao banco ou obrigatoriedade de uso. PMS opcional, sem escrita não homologada.
- LGPD: o painel deve usar sinais agregados e mascarar identificadores de hóspedes, salvo necessidade autorizada; respetiva retenção em fonte de feedback.
- Segurança: multi-tenant RLS, FKs por escopo, teste de isolamento, auditoria de decisões e métricas reproduzíveis.

## 7. Critérios de aceite
1. Sem EasyGov, PMS ou Guest Care, a tela funciona com sinais internos e marca as fontes ausentes.
2. O gerente de outro hotel não enxerga dados, notas ou feedback de UHs fora de seu escopo.
3. Reabertura e reincidência aparecem com fonte e momento; sinal não confirmado permanece separado.
4. Toda faixa de atenção tem explicação com componentes, política/fórmula e janela temporal.
5. A mesma entrada produz a mesma pontuação para a mesma versão de regra.
6. A conclusão de OS nunca força score de risco = 0 nem confirma satisfação.
7. Ações executadas por gestor são auditadas e vinculadas a seu usuário.
8. O painel não mostra promessa de aumento de nota, ocupação ou receita sem evidências de piloto.

## 8. Métricas de sucesso
Cobertura de UHs (com dados suficientes), casos recorrentes por 100 UHs, reaberturas, % de intervenções com verificação, dias de indisponibilidade por manutenção, tempo para agir após alerta, reincidência após intervenção e taxa de relatos Guest Care tecnicamente associados. Para índices entre hotéis, controlar porte e cobertura.

## 9. Dependências e decisões
- Intelligence 1.0 e glossário único consistentes; aprovação Cesar+Kaio para fontes, scores, permissões, política e mudanças nos ADRs.
- Origem de dados e contrato com EasyGov definidos, sem desviar a primeira integração pós-MVP aprovada.
- Aprovar se módulos RQI e Guest Care são licenças separadas ou fazem parte do Intelligence.
- A equipe precisa decidir onde mora o painel RQI e como a experiência com áreas comuns se adapta a parques/resorts.
- Nenhuma mudança na fase 1b/1c sem nova aprovação formal.
