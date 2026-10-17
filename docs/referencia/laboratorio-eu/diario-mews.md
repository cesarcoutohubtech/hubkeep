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

