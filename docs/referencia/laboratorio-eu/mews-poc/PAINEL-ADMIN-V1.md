# Painel Mews V1 — leitura administrativa isolada (PR de interface)

## Escopo aprovado

A ADR-048 e o adendo aprovado pelo Cesar em 17/10/2026 autorizam somente a visualização administrativa dos **horários e versão do checkpoint, quantidades de recursos Space ativos e bloqueios técnicos OutOfOrder/InternalUse**, sem modificar dados da Mews, OS, UHs ou licença. Migração 0056 (PR #323) está versionada na main; **a aplicação em Supabase-dev NÃO foi conferida nem autorizada**.

## Implementação proposta

- Nova porta `packages/db/src/mews-admin.ts`, acesso via `hk_app` e `withContext` apenas.
- Verifica `authz.eh_admin_grupo()` e devolve 403 para usuário sem papel Admin vigente.
- Lista somente vínculos não revogados; todas as consultas às projeções seguem RLS FORCE e grants por coluna da 0056.
- Os identificadores externos de recursos, bloqueios, enterprise, digests, credenciais e payloads Mews não integram o SELECT, contrato ou HTML.
- GET `/api/v1/mews/status` autenticado, com esquema Zod/OpenAPI e **sem método POST/PUT/PATCH/DELETE**.
- Página `/admin/mews` com colunas técnico-administrativas; item de menu somente após a API autorizar.
- Quatro idiomas: pt-BR, en, es, fr. Sem botões de sincronização nem cron, worker, jobs, triggers ou credenciais.
- Uma propriedade com vínculo ativo e ainda sem checkpoint é exibida como **ainda não sincronizada**, não como erro ou sincronização concluída.
- As contagens consideram `ativo = true`; não representam disponibilidade operacional real da UH.

## Gates de aceitação

- CI verde, incluindo lint/Prettier, typecheck, testes e segurança. Confirmar `main` verde antes do merge manual do Cesar.
- O contrato rejeita contagens negativas e elimina campos não aprovados.
- Teste de menu restrito e tela inicial em quatro idiomas.
- A implantação real precisa de `supabase migration list`, backup/rollback e **autorização específica para aplicar a 0054/0055/0056**, além de validação de vínculo, GDPR e cofre.
- Sem vínculos reais/credenciais e sem aplicação de migrações nesta etapa.

## Limitação intencional

O painel não informa sucesso de uma sincronização em andamento nem permite reconciliar ou buscar Mews; mostra exclusivamente o último checkpoint persistido e projeções que já existirem no banco. Por segurança, erros de autorização/ausência de migração não são disfarçados como dados vazios.
