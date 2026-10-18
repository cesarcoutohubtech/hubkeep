# Diário — HubKeep Europa / Integração Mews

## 17/10/2026 — Ponto de retomada: driver técnico V1

- ADR-048 (#315) aprovada e incorporada à `main`.
- Migração 0054 (#313) e migração 0055 (#320, privilégio de lock `hk_worker`) incorporadas à `main`. **Não há confirmação de aplicação no Supabase-dev**. Não executar `db push` sem autorização do Cesar.
- PR #317 em Draft, driver de persistência **não exportado/ligado a API, worker agendado, credenciais ou Mews real**. Banco descartável aprovado em execução anterior: 352 testes db e 1.549 pgTAP.
- Prettier aplicado com runner temporário de permissão **contents:read**, arquivo de workflow temporário eliminado da branch; `main` sincronizada após #321.
- O CI geral identificou erros de teste com TS estrito (todos corrigidos nos helpers/asserções); **novo bloqueio**: `tests/auditoria-entidades.test.ts` recusa o literal `mews_checkpoint` da auditoria do driver por falta na lista central.
- **Reserva de área compartilhada (antes de editar):** registrar a entidade `mews_checkpoint` no catálogo `packages/dominio/src/auditoria-geral.ts` e seu nome nos 4 catálogos `packages/i18n/catalogos/{pt-BR,en,es,fr}.json`, sem mudar permissões de auditoria nem regra de negócio. Revisar risco de exibição ao gestor/gerente na auditoria geral: somente dados técnicos sanitizados (versão, modo e contagens), nunca token, hóspedes ou Notes. Não fazer rollout de Mews nesta PR.
- PR #310 permanece antigo Draft documental; não mergeado. Merges pertencem apenas ao Cesar.
- **Próximo passo:** aplicar paridade de audit entity/I18n na branch #317; rodar CI completa e banco; marcar Ready somente depois de checks verdes; revisão de revinculação, cofre e GDPR antes de ativar.


- **Reserva adicional, antes de editar contratos:** `packages/contratos/src/auditoria-geral.ts` mantém cópia literal de `ENTIDADES_DA_AUDITORIA_API`; precisa acrescentar `mews_checkpoint` na mesma posição para o teste raiz `a lista da API é a do domínio` e a opção de filtro de API. Sem alteração de endpoint nem permissões.

## 18/10/2026 — Preparação de vínculo Mews Demo (sem ativação)

- O Cesar autorizou **preparar código e testes** para a próxima fase Mews Demo → HubKeep-dev. **Não** autorizou escrita no dev, tokens reais, acesso à API Mews nesta etapa ou execução de worker.
- DEV: migrações 0054/0055/0056 aplicadas com pré-voo 32/32 aprovado, acesso visual Admin válido e Gerente negado. Main verificou CI verde antes da branch.
- Entrega: laboratório `ensaio-vinculo-demo.mjs` com cliente injetado, porta de conferência de hotel/vínculo ainda sem implementação real, escopo estrito e resumo agregado sem PII. Testes sintéticos de ponta a ponta offline executados pela CI geral; documentação `ENSAIO-VINCULO-DEMO-V1.md`.
- Mantido **sem rota, job, cron, aplicação de lote, migração, cofre nem credencial de produção**. A primeira execução de API real ou gravação do vínculo exigirá autorização específica posterior.
- **Ponto de retomada:** aguardar CI deste PR, corrigir problemas e liberar para revisão somente com checks verdes. Merge manual pelo Cesar. Após merge, próximo gate é selecionar hotel fictício e propriedade Mews Demo, confirmar escopo e revisar referência de cofre/revogação/GDPR.

## 18/10/2026 — Descoberta read-only de hotel fictício para Mews Demo

- PR #327 já mergeado; `main` com checks gerais e banco ainda executando no início deste trabalho, sem falhas confirmadas. Ambiente HubKeep-dev mantém migrações 0054/0055/0056; pré-voo 32/32 e validação visual Admin/Gerente.
- Próximo gate autorizado: preparar **identificação de candidatos de hotel fictício e critérios de cofre/revogação**. Não houve autorização para criar `app.mews_vinculo`, usar Mews Demo real, ativar cron ou persistir checkpoints.
- Nova branch `claude/eu-mews-selecao-hotel-demo-20261018`: consulta restrita a `--ambiente dev`, valida project ref, abre transação READ ONLY e faz rollback, filtra hotéis de demonstração, exibe apenas identificadores locais necessários e estado de vínculo, sem EnterpriseId/credencial/PII. Classificação pura e teste offline para CI. Guia `SELECAO-HOTEL-E-COFRE-DEMO.md` especifica seleção manual e etapas separadas de cofre, revogação e retenção.
- Próxima ação: abrir PR em Draft, validar CI; depois do merge manual pelo Cesar, o operador poderá executar **somente o script de listagem de candidatos**, enviar a escolha e aprovar uma propriedade Mews específica, sem gravações.
