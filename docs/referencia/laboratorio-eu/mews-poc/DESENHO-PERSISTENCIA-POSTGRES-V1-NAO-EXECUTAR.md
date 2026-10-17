# HubKeep Europa — desenho V1 de persistência Mews (NÃO EXECUTAR)

> **Estado: PROPOSTA para aprovação.** Este arquivo é documentação. Não é migração, não foi aplicado no Supabase, não cria worker, não importa dados reais, não aprova a ADR e não altera os módulos operacionais.
>
> Base: PRs #304 e #305 já incorporados à `main`. Contratos offline: `checkpoint-contrato.mjs` e `recuperacao-lab.mjs`. Aprovação pendente da `ADR-CHECKPOINTS-DURAVEIS-PROPOSTA.md`.

## Objetivo e fronteiras

Persistir, por tenant e por hotel validado, **somente** recursos técnicos (Space) e bloqueios (OutOfOrder e InternalUse) obtidos da Mews em leitura. O HubKeep não envia escrita à Mews, não cria OS, não altera room status/UH, não altera licença e não armazena hóspedes, notas, payload bruto ou tokens.

**Fonte única de verdade do commit:** a projeção sanitizada de `prepararLote`, aplicada com compare-and-swap, checkpoint e itens **na mesma transação**. `recuperacao-lab.mjs` continua protótipo sintético; **não** valida recursos reais.

### Aprovações pendentes

1. Aprovar a ADR de checkpoints e a fronteira read-only. O merge dos PRs anteriores **não é aprovação formal da ADR**.
2. Confirmar o que ficará visível a usuário: sugestão V1 **somente integração administrativa e estado técnico**, sem exposição dos bloqueios em telas operacionais; qualquer UI é decisão posterior.
3. Confirmar quem autoriza/revoga um vínculo hotel ↔ EnterpriseId (sugestão: Admin do grupo via caso de uso auditado).
4. Confirmar política GDPR/retenção/tombstones e provedor de segredo; credencial opaca não pode ser token.
5. Revisar com os responsáveis 1b/1c/Intelligence; coordenação de zona protegida antes de abrir migração.

## Modelo físico proposto (sem migração executável)

**Chave de escopo:** `(tenant_id uuid, hotel_id uuid, enterprise_id text)`, sempre a mesma e nunca aceita sem vínculo humano validado. `hotel_id` aponta a `app.hotel(tenant_id,id)`. Todos os IDs de recursos e bloqueios pertencem a EnterpriseId. Uma propriedade Mews não pode ser vinculada a dois hotéis do mesmo tenant sem decisão explícita.

| Tabela | Chave composta | Colunas principais e integridade |
| --- | --- | --- |
| `app.mews_vinculo` | PK `tenant_id,hotel_id,enterprise_id` | `credencial_ref` opaca, `validado_em`, `validado_por`, `revogado_em`, `criado_em`; FK tenant/hotel; UNIQUE tenant/hotel para um PMS por hotel, sujeita a decisão de negócio |
| `app.mews_checkpoint` | PK/FK para vínculo | `versao bigint`, `ultimo_updated_utc`, `ultimo_sweep_utc`, `digest_incremental`, `digest_sweep`, `concluido_em`; dois watermarks independentes |
| `app.mews_recurso` | PK `tenant_id,hotel_id,enterprise_id,resource_id` | `ativo`, `updated_utc`, `deleted_utc` e tipo técnico Space; FK para vínculo; **sem mapear automaticamente** `app.local` |
| `app.mews_bloqueio` | PK `tenant_id,hotel_id,enterprise_id,block_id` | `resource_id`, `tipo`, `inicio_utc`, `fim_utc`, `ativo`, `updated_utc`, `deleted_utc`; FK composta para o recurso pertencente ao mesmo hotel/EnterpriseId |

**Decisão proposta para o piloto:** cadastro de vínculo administrado exclusivamente no servidor; leituras e gravações de checkpoint/recurso/bloqueio exclusivamente pelo `hk_worker`. Não conceder a `hk_app` acesso direto às três tabelas técnicas até definir uma API de leitura administrativa. Nenhum GRANT para `anon`, `authenticated` ou `public`, nem DELETE para papéis `hk_*`.

### Rascunho ilustrativo de DDL (NÃO colar no banco)

A SQL abaixo é um **esboço para code review**, não uma migração pronta: precisa ser encaixada na próxima numeração da `main`, nas políticas de autorização e nos meta-testes antes de qualquer execução.

```sql
-- Esboço NÃO EXECUTÁVEL no fluxo de deploy atual. Nenhum desses comandos foi aplicado.
create table app.mews_vinculo (
  tenant_id uuid not null,
  hotel_id uuid not null,
  enterprise_id text not null check (length(enterprise_id) between 1 and 200),
  credencial_ref text not null check (length(credencial_ref) between 1 and 250),
  validado_em timestamptz not null,
  validado_por uuid not null,
  revogado_em timestamptz,
  criado_em timestamptz not null default now(),
  primary key (tenant_id, hotel_id, enterprise_id),
  unique (tenant_id, hotel_id),
  unique (tenant_id, enterprise_id),
  foreign key (tenant_id, hotel_id) references app.hotel (tenant_id, id),
  foreign key (tenant_id, validado_por) references app.membro (tenant_id, usuario_id)
);

create table app.mews_checkpoint (
  tenant_id uuid not null,
  hotel_id uuid not null,
  enterprise_id text not null,
  versao bigint not null default 0 check (versao >= 0),
  ultimo_updated_utc timestamptz,
  ultimo_sweep_utc timestamptz,
  digest_incremental text check (digest_incremental is null or length(digest_incremental) = 64),
  digest_sweep text check (digest_sweep is null or length(digest_sweep) = 64),
  concluido_em timestamptz,
  primary key (tenant_id, hotel_id, enterprise_id),
  foreign key (tenant_id, hotel_id, enterprise_id)
    references app.mews_vinculo (tenant_id, hotel_id, enterprise_id)
);

create table app.mews_recurso (
  tenant_id uuid not null,
  hotel_id uuid not null,
  enterprise_id text not null,
  resource_id text not null check (length(resource_id) between 1 and 200),
  tipo text not null default 'Space' check (tipo = 'Space'),
  ativo boolean not null,
  updated_utc timestamptz,
  deleted_utc timestamptz,
  primary key (tenant_id, hotel_id, enterprise_id, resource_id),
  foreign key (tenant_id, hotel_id, enterprise_id)
    references app.mews_vinculo (tenant_id, hotel_id, enterprise_id)
);

create table app.mews_bloqueio (
  tenant_id uuid not null,
  hotel_id uuid not null,
  enterprise_id text not null,
  block_id text not null check (length(block_id) between 1 and 200),
  resource_id text not null,
  tipo text not null check (tipo in ('OutOfOrder', 'InternalUse')),
  inicio_utc timestamptz not null,
  fim_utc timestamptz not null,
  ativo boolean not null,
  updated_utc timestamptz not null,
  deleted_utc timestamptz,
  primary key (tenant_id, hotel_id, enterprise_id, block_id),
  foreign key (tenant_id, hotel_id, enterprise_id, resource_id)
    references app.mews_recurso (tenant_id, hotel_id, enterprise_id, resource_id),
  check (fim_utc > inicio_utc)
);

-- Na migração real, após revisar o schema: ENABLE + FORCE RLS em CADA tabela.
-- Grants explícitos, limitados e por coluna; policies separadas para hk_app/hk_worker.
-- Nada de função SQL nova ou trigger. Conceder apenas os privilégios necessários.
```

## Políticas RLS e autorização a implementar

- `app.mews_vinculo`: `hk_app` recebe **SELECT por coluna apenas** para `tenant_id,hotel_id,enterprise_id,validado_em,revogado_em` (não para `credencial_ref`) e INSERT/UPDATE **somente por colunas expressamente concedidas**, sem escopo mutável; policies com `tenant_id = (select authz.tenant_id())` **e** `(select authz.eh_admin_grupo())`. Autorização de ação e revogação via caso de uso/UoW auditado. `hk_worker` pode SELECT de vínculo no `tenant_id = (select authz.tenant_sistema())`, sem UPDATE/DELETE; o cofre de segredo é separado e controlado no servidor.
- `app.mews_checkpoint`, `app.mews_recurso`, `app.mews_bloqueio`: somente `hk_worker` com SELECT/INSERT e UPDATE das colunas mutáveis; policies por `authz.tenant_sistema()` **e vínculo vigente** nas operações de escrita. RLS com `FORCE` e FKs compostas. Nenhuma policy `hk_app` de leitura operacional por enquanto.
- `credencial_ref` é uma referência de segredo de cofre, **não** credencial da Mews. Nunca incluir em listagens, logs ou resposta API. O acesso a segredos requer autorização adicional fora do banco.
- Validação de vínculo vigente no início **e dentro do commit transacional**, após bloqueio da linha `mews_vinculo`. Somente RLS por tenant não protege contra um worker mapeando hotel errado dentro do mesmo tenant: o backend precisa validar hotel e EnterpriseId.
- Não aplicar `DELETE` físico por ausência em página. Revogação é lógica e impede **novas escritas**, sem apagar auditoria.

## Fluxo transacional proposto para `packages/db`

1. Resolver vínculo autorizado e validar a propriedade `EnterpriseId` ainda no serviço. Buscar páginas completas Mews **fora da transação**; abortar em 401/429 esgotado, cursor inconsistente, payload truncado, tenant/property divergente.
2. Normalizar com allowlist e recurso `Space` previamente confirmado em `resources/getAll`; usar `prepararLote` como contrato. Não inferir recurso a partir do bloqueio; isso só existe no teste sintético.
3. `acesso.withSistema({ tenantId }, async tx => ...)`: bloquear linha do vínculo com `SELECT FOR UPDATE`, rejeitar revogação e obter/bloquear checkpoint (bootstrap requer serializar criação sob o mesmo bloqueio do vínculo).
4. Comparar a versão CAS **comum** e o watermark/digest específico do modo. Mesmo lote confirmado: replay idempotente. Mesmo checkpoint mas digest diferente: conflito. Divergência da versão: replanejar.
5. UPSERT de recursos e bloqueios com FKs compostas. Substituir registro somente se `incoming.updated_utc > stored.updated_utc` ou empate com novo tombstone e anterior ativo. Nunca ressuscitar tombstone em empate.
6. Avançar **somente** `ultimo_updated_utc` OU `ultimo_sweep_utc`; preservar a outra marca, atualizar digest do modo e incrementar `versao` no **mesmo commit** que os upserts.
7. Erro no meio: rollback completo. Emitir métricas técnicas sanitizadas após confirmação, sem efeitos operacionais.
8. **Unit of work:** decidir com equipe se a escrita de integração exige auditoria/outbox por evento (princípio #6 do `CLAUDE.md`); não bypassar `executarComoSistema` em código definitivo sem decisão.

## Questões a fechar antes de migração executável

- Uma propriedade por hotel é restrição permanente? Como revincular sem perder histórico e auditoria?
- Recurso `Space` tem `UpdatedUtc` sempre disponível? Se não, tratar separadamente o fluxo de recursos, sem fabricar timestamps.
- O que mostrar no produto: apenas status administrativo da integração, ou também bloqueios? Para V1, a sugestão é **não expor bloqueios ao módulo operacional**.
- Como registrar mudança legítima posterior de um tombstone e garantir ordenação determinística do mesmo timestamp? A regra V1 prefere tombstone em empate e exige atualização estritamente posterior para reativação.
- Retenção de tombstones, criptografia/revogação de segredo, métricas e GDPR.

## Gates

- [ ] Aprovação **escrita** da ADR e do escopo V1
- [ ] Revisão 1b/1c/Intelligence e da fila de migrações
- [ ] Abrir outro PR que edite `supabase/migrations` + `supabase/tests` (zona protegida, só um PR por vez)
- [ ] Atualizar lista fechada dos meta-testes e incluir um arquivo pgTAP de isolamento **por tabela**
- [ ] CI descartável com `supabase db reset`, pgTAP, lint, testes de transação e tipos
- [ ] Só após CI e autorização, aplicar `supabase db push` no DEV com salvaguardas; nunca produção ou demo reais nesta etapa
