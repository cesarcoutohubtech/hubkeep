# HubKeep Europa — pré-requisito de bloqueio transacional Mews (não executar)

**17/10/2026 · Fase 2 · estado: diagnóstico confirmado no banco descartável; implementação ainda bloqueada.**

## Evidência

No CI do PR #317, a migração 0054 foi aplicada em banco efêmero e os 1.532 testes pgTAP existentes passaram. A primeira consulta real do driver sobre `app.mews_vinculo`, com `SELECT ... FOR UPDATE` sob `hk_worker`, falhou com PostgreSQL `42501 permission denied for table mews_vinculo`. O schema 0054 concede `SELECT`, mas não `UPDATE` sobre o vínculo ao worker. A linha `FOR UPDATE` exige privilégio de UPDATE e, com RLS FORCE, também uma policy UPDATE que permita bloquear o registro no tenant.

**Não enfraquecer RLS, nem usar dono, service_role, BYPASSRLS ou UPDATE geral. Não mudar retroativamente a 0054.**

## Correção proposta para uma NOVA migração, após conclusão dos PRs #316 e #315

1. Acrescentar `lock_versao bigint NOT NULL DEFAULT 0` à `app.mews_vinculo`, coluna técnica que **não** é identidade, segredo, revogação ou campo operacional.
2. Conceder **somente** `UPDATE (lock_versao)` a `hk_worker`; manter todos os UPDATEs dos demais campos indisponíveis para o worker.
3. Criar policy `worker_lock` de UPDATE para `hk_worker`, `USING (tenant_id = (select authz.tenant_sistema()) AND revogado_em IS NULL)` e `WITH CHECK` equivalente.
4. Exigir pgTAP positivo para leitura/bloqueio de vínculo ativo no tenant e negativos para: outro tenant, vínculo revogado, UPDATE de `revogado_em`, `credencial_ref`, `enterprise_id`, `hotel_id` ou `validado_por`.
5. Testar transação concorrente de revogação administrativa versus commit de lote e transação concorrente de dois workers com a *mesma* versão CAS.
6. Se aprovado, regenerar tipos Kysely no banco efêmero; todo merge de migração é manual do mantenedor e **não autoriza** `db push`.

## Observações adicionais

- A revogação no produto deve gravar `revogado_em` por UoW `hk_app` e participar do bloqueio de linha PostgreSQL; essa rota/caso de uso ainda não está ativada.
- A validação de `Space` como recurso real e do `EnterpriseId` correspondente ao hotel deve ocorrer **antes** de construir o lote. Um payload artificial não constitui autorização.
- Não conectar job, API, endpoint administrativo, credenciais reais ou banco Supabase-dev até passar todos os testes.
- A falha `42P08` no teste `job-inteligencia.test.ts` é independente; PR #316 é a correção que deve entrar primeiro na `main`.
- Este registro é desenho de correção, **não** um arquivo SQL a executar. Abrir o próximo PR protegido só após a liberação do PR #315, conforme `CLAUDE.md`.

Referências: PRs #313 (0054), #315 (ADR-048), #316 (correção da main), #317 (driver transacional); PostgreSQL, `SELECT ... FOR UPDATE`, privileges e row security.
