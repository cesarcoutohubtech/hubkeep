# Plano de testes PostgreSQL/pgTAP — persistência Mews (proposta)

**Status:** planejamento, não há banco conectado, testes SQL criados ou executados. A migração e a suíte pgTAP somente serão produzidas após a aprovação da ADR e a revisão do desenho.

## Padrões que devem ser mantidos

- Uma migração nova em `supabase/migrations`, respeitando numeração **da `main` no momento da criação**; migrações aplicadas não podem ser editadas.
- Quatro arquivos novos separados de `supabase/tests/database/0NN_isolamento_mews_<tabela>.test.sql`, com testes de identidade/autorização que façam rollback no final.
- Atualizar a lista fechada de tabelas no meta-teste 28; meta-testes 1, 2, 3, 7–11, 18, 21, 29 e 30 pertinentes conforme estrutura vigente no momento de implementar.
- Não criar trigger, função SQL de negócio ou permissão de DELETE. Role `hk_worker` opera sempre por `withSistema` no tenant autorizado, nunca via service_role.
- Rodar `supabase test db` na CI descartável e conferir o fluxo transacional em `packages/db` com integração adequada, não apenas simulação em memória.

## Matriz de isolamento obrigatória

| Caso | Vínculo | Checkpoint | Recurso | Bloqueio |
| --- | --- | --- | --- | --- |
| Tenant A não enxerga ou altera tenant B | Admin B não vê vínculo de A | worker B não acessa linha A | worker B não acessa A | worker B não acessa A |
| Hotel A não recebe recurso/bloqueio de hotel B do mesmo tenant | único vínculo validado | FK para vínculo | FK para vínculo | FK completa para recurso |
| `hk_app` sem privilégio fora Admin grupo | gerente, proprietário e implantador negados | leitura/escrita negadas a todo hk_app | idem | idem |
| Sem contexto `app.tenant_id` | nenhum vínculo visível | nenhuma linha | nenhuma linha | nenhuma linha |
| `hk_worker` de tenant B | não lê vínculo A | não lê/escreve A | não lê/escreve A | não lê/escreve A |
| FK composta cross-tenant | hotel A em tenant B rejeitado | vínculo inexistente rejeitado | vínculo inexistente rejeitado | recurso de outro hotel/EnterpriseId rejeitado |
| Vínculo revogado | não autoriza novas sincronizações | commit recusado | gravação recusada | gravação recusada |
| Privilegios de coluna | escopo/credencial_ref imutáveis no UPDATE | escopo imutável | escopo/resource_id imutáveis | escopo/block_id imutáveis |
| FORCE RLS e grants mínimos | obrigatório | obrigatório | obrigatório | obrigatório |

Para tabelas técnicas sem leitura ao `hk_app`, os casos de gerente/proprietário/implantador são **negação integral**, em vez de leitura parcial. Especificar isso nos cabeçalhos dos testes, conforme `docs/02-seguranca-multitenant-rls.md`.

## Testes de commit/recuperação além dos pgTAP de isolamento

1. Bootstrap concorrente do mesmo hotel: duas transações competem por bloqueio do vínculo; somente um checkpoint é publicado e nenhum lote parcial.
2. Replay do mesmo lote/digest não duplica linhas nem avança versão indevidamente.
3. Mesmo checkpoint com digest diferente falha fechado.
4. CAS de revisão entre `UpdatedUtc` e `CollidingUtc`: se o sweep atualizar a versão, o incremental planejado com versão velha falha e é refeito.
5. Um sweep não avança `ultimo_updated_utc`; um incremental não avança `ultimo_sweep_utc`.
6. Quando um UPSERT falha após outros terem executado na transação, `ROLLBACK` mantém blocos, recursos e checkpoint anteriores.
7. Um evento ativo mais antigo não pode reativar tombstone; com `UpdatedUtc` igual, tombstone prevalece. Com `UpdatedUtc` mais novo, decidir política explícita.
8. Delta/página incremental vazia não representa exclusão.
9. Recurso sem vínculo com propriedade ou sem `Space` real validado é rejeitado antes do commit.
10. Worker perde conexão após o banco confirmar: replay idempotente do digest confirma estado sem duplicar.
11. Revogação do vínculo concorrendo com worker bloqueado: a serialização impede sincronização após revogação confirmada.
12. Retry/limite de cursor e falhas Mews não iniciam transação de gravação; logs não contêm tokens/PII.

## Critérios de aceite do PR de migração

**Um PR de zona protegida por vez**; revisar PRs abertos antes de criar o da migração. O check `zona protegida` é esperado como bloqueante, por desenho; somente o mantenedor autorizado faz merge com bypass, após as demais verificações aprovadas.

- [ ] Todos os 4 arquivos pgTAP criados, um por tabela, com a matriz acima
- [ ] Tabela listada no meta-teste 28 e meta-testes de FKs/RLS/grants passando
- [ ] Schema sem tokens em claro, notas, hóspedes ou JSON bruto
- [ ] Driver com transação no `packages/db`, testes para os 12 cenários
- [ ] Logs sanitizados, revisão de retenção/GDPR e cofre de segredo
- [ ] Revisão por responsável dos módulos existentes e ADR aprovada por escrito
- [ ] CI verde, sem alteração em ambiente real
- [ ] `db push` em HubKeep-dev autorizado separadamente e com plano de retorno confirmado

**Não confundir aprovação de um PR/documento com autorização de `supabase db push` ou de leitura de clientes reais da Mews.**
