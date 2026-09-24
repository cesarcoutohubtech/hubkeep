# 06 — Criar o projeto Supabase de dev

Checklist para criar o ambiente de dev na nuvem (ADR-015). Não precisa de Docker. Staging e produção seguem o mesmo roteiro depois, cada um em projeto próprio.

## 1. Organização e projeto

- [ ] Use uma **organização da EasyGov**, não uma conta pessoal. Staging e produção vão morar nela, e o acesso de cada pessoa é gerenciado ali.
- [ ] Ative **MFA** na sua conta e exija MFA dos membros da organização.
- [ ] Crie o projeto com o nome `HubKeep-dev`, na região **South America (São Paulo)**.
- [ ] Gere a senha do banco pelo próprio painel e guarde num gerenciador de senhas. É a senha do papel `postgres`, ou seja, o `DATABASE_URL_OWNER` do dev. Nunca vai para o git nem para a Vercel.
- [ ] Plano: o gratuito serve para dev, mas confira a política de pausa por inatividade. Staging e produção vão em plano pago (PITR, SSO).
- [ ] Na tela de criação, em *Security*: **desmarque** *Enable Data API* (o HubKeep não usa; Auth e Storage continuam funcionando), **desmarque** *Automatically expose new tables* e **deixe desmarcado** *Enable automatic RLS* (cria um event trigger, contra o ADR-005; a RLS do HubKeep vem das migrações).
- [ ] *GitHub (optional)*: não conecte agora. A integração pode aplicar migrações automaticamente a partir do repositório, o que contraria o fluxo do ADR-015 (migração só depois da CI). A decisão fica para a F0-12.

## 2. Configurações antes de aplicar qualquer coisa

- [ ] **Data API:** em *Exposed schemas*, deixe só os padrões (`public`, `graphql_public`). Nunca adicione `app`, `authz`, `staging` ou `licenca`. Se o painel permitir desligar a Data API por completo, pode desligar: o HubKeep não usa, e o Auth continua funcionando.
- [ ] **Auth → cadastro público desligado** (*Allow new users to sign up* = off). No HubKeep, usuário só entra por convite.
- [ ] **Auth → URL do site:** `http://localhost:3000` no dev. Em *Redirect URLs*, acrescente `http://localhost:3000/auth/confirmar`. As URLs dos previews da Vercel entram na F0-12.
- [ ] **Auth → chaves de assinatura (JWT Signing Keys):** a chave em uso tem de ser **assimétrica** (ECC P-256/ES256 ou RSA). A API valida o token pelo JWKS público e recusa HS256 (ADR-017). O HubKeep-dev já nasceu com ES256.
- [ ] **Auth → Email Templates → Invite user:** assunto `Convite para o HubKeep` e o conteúdo de `supabase/templates/convite.html`. O link tem de ser `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite`; com o template padrão, o aceite não funciona (o token vem no fragmento da URL, que o servidor não lê).
- [ ] **E-mail padrão do Supabase:** serve para o dev, mas tem limite baixo de envio por hora e só entrega para e-mails da equipe do projeto. Por isso o convite está atrás da porta `ProvedorDeConvite`: SMTP próprio entra como outro adaptador, sem retrabalho.
- [ ] **Realtime:** não habilite em nenhuma tabela.
- [ ] Anote, no gerenciador de senhas: *Project ref*, *Project URL*, *publishable key* (anon) e *secret key* (service_role). A secret key só vai para `packages/auth-admin`, pela variável `SUPABASE_SECRET_KEY`.

## 3. Aplicar a migração de fundação

Pela CLI, que registra o histórico de migrações. **Não cole a migração no SQL Editor**: ela não entraria no histórico e o próximo `db push` tentaria aplicá-la de novo.

Na raiz do repositório:

```bash
npx supabase login
npx supabase init                          # já rodado neste repositório; não repita
npx supabase link --project-ref <ref-do-dev>
npx supabase db push
```

Se o `db push` falhar, anote a mensagem. Os pontos mais prováveis eram o `grant ... to postgres` e o `alter function ... owner to hk_authz` (item 2 da verificação abaixo); o segundo já falhou no Supabase local e a migração foi corrigida (ver "Resultado no Supabase local" em `02-seguranca-multitenant-rls.md`).

## 4. Rodar os testes pgTAP contra o dev

O `supabase test db` da CLI depende de Docker para executar o pg_prove. Sem Docker, os arquivos rodam com `psql`, usando a string de conexão **Session pooler** do botão *Connect* (é IPv4 e funciona na maioria das redes). Guarde essa string na variável de ambiente `DEV_SESSION_POOLER` e rode:

```bash
pnpm db:testar-dev
```

O script (`scripts/ops/testar-banco-dev.mjs`) roda cada arquivo de `supabase/tests/database`, confere o total de `ok` contra o plano declarado e sai com erro se algo falhar. A string contém a senha: o script a entrega ao `psql` pelas variáveis `PG*`, nunca pela linha de comando (que fica visível na lista de processos), e recusa o Transaction pooler (porta 6543), onde o `SET LOCAL ROLE` dos testes não funciona.

O esperado é `1..15` com 15 linhas `ok`, e `1..30` com 30 linhas `ok`. Os testes fazem rollback; não sobra dado no banco. No Windows, o `psql` vem no instalador do cliente PostgreSQL (dá para instalar só as ferramentas de linha de comando).

## 5. Verificações a registrar

Rode no SQL Editor e anote o resultado:

```sql
-- Ponto 1: o papel postgres ignora RLS? (os fixtures dos testes dependem disso)
select rolname, rolsuper, rolbypassrls from pg_roles where rolname = 'postgres';

-- Ponto 2: posse das funções de autorização
select p.proname, r.rolname as dono
from pg_proc p join pg_roles r on r.oid = p.proowner
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('authz', 'licenca');

-- Ponto 4: a chave pública não enxerga nada do HubKeep
select has_schema_privilege('anon', 'app', 'usage')          as anon_app,
       has_schema_privilege('authenticated', 'app', 'usage') as auth_app;
```

- Ponto 1: se `rolbypassrls` for `false` e o teste 002 falhar nos fixtures, o ajuste vai para a F0-02 (papel de teste só no dev e na CI).
- Ponto 2: todas as funções com `SECURITY DEFINER` devem ter `hk_authz` como dono.
- Ponto 3 (login dos papéis pelo Supavisor): fica para a F0-03, quando os papéis recebem LOGIN.
- Ponto 4: as duas colunas devem ser `false`.

## Não faça no dev

- Criar tabela ou coluna pelo Table Editor. Toda mudança de schema é migração no git.
- Colocar dados reais da Slaviero, nem para teste.
- Compartilhar a secret key ou a senha do banco por chat ou e-mail.
