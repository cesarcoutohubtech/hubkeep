# 07 — Resposta a incidente de vazamento

Roteiro para quando houver suspeita ou confirmação de que dado do HubKeep ou uma credencial saiu de onde devia (F0-13). Vale para os ambientes que existirem. Hoje só existe o dev, sem dado real de cliente (ADR-015). Staging e produção entram na F0-12 (`docs/04`).

Os dois incidentes da fase 0 (`docs/diario-fase-0.md`, 24/09/2026) seguiram este caminho e servem de exemplo: conter primeiro, registrar tudo, revogar o que vazou e só então ajustar o processo.

## Papéis

| Papel | Quem | O que faz |
|---|---|---|
| Responsável pelo incidente | Cesar (responsável técnico) | Decide contenção, revogações e comunicação; mantém o registro |
| Apoio técnico | Equipe de desenvolvimento, Claude Code | Levanta evidências e escopo, prepara correções. **Não** executa revogação, `db push`, `config push` nem nada em staging ou produção |
| Jurídico / encarregado (DPO) da EasyGov | A definir | Avalia obrigação de comunicar e redige a comunicação |
| Cliente (controlador dos dados) | Contato de segurança do cliente, a definir no contrato | Recebe a comunicação da EasyGov e decide a comunicação à ANPD e aos titulares |

Na LGPD, para os dados operacionais de um grupo hoteleiro, o cliente é o **controlador** e a EasyGov é **operadora**. Quem comunica a ANPD e os titulares é o controlador (art. 48). A obrigação da EasyGov é avisar o cliente sem demora, com o que se sabe até ali. O Regulamento de Comunicação de Incidente da ANPD (Resolução CD/ANPD nº 15/2024) dá **3 dias úteis** ao controlador, contados do conhecimento do incidente com dado pessoal. **Os prazos e o texto do aviso ao cliente ficam para o jurídico e o contrato.**

## 1. Detectar e abrir o registro (primeira hora)

1. Abra uma entrada no diário ou no log de operação, com:
   - data e hora;
   - quem percebeu e como;
   - o que se sabe;
   - ambiente (dev, staging, produção).
2. Classifique a suspeita:
   - **credencial** (chave, senha, token);
   - **dado de negócio** (linhas de um tenant visíveis a quem não devia);
   - **dado pessoal** (nome, e-mail ou outro dado de pessoa física);
   - **acesso indevido** (conta ou painel usado por quem não devia).
3. Não apague nada que sirva de evidência, nem "arrume" antes de registrar o estado.

## 2. Conter (primeiras horas)

Revogue primeiro o que pode estar em mãos erradas. Estas são as credenciais que existem hoje:

| Credencial | Onde mora | Como revogar | Quem |
|---|---|---|---|
| Secret key do Supabase (`SUPABASE_SECRET_KEY`) | `packages/auth-admin`, variável do servidor | Painel do Supabase → API Keys: gerar nova e revogar a antiga; atualizar a variável | Cesar |
| Chaves de assinatura do JWT (ES256) | Supabase Auth | Painel → JWT Signing Keys: rotacionar. As sessões antigas deixam de valer | Cesar |
| Senhas dos papéis `hk_app`, `hk_worker`, `hk_ingestao` | Strings de conexão (`DATABASE_URL_*`) | `pnpm db:papeis --ambiente <amb>`, com senha nova (ADR-020); atualizar as variáveis | Cesar |
| Senha do `postgres` (dono) | `DEV_SESSION_POOLER` (dev) | Painel → Database → Reset password | Cesar |
| `CRON_SECRET` | Variável do servidor | Gerar nova e atualizar. Sem ela, as rotas de cron respondem 503 (falha fechada) | Cesar |
| Credencial do agente conector (`hk_<tenant>_<segredo>`) | Rede do cliente | `POST /api/v1/credenciais-agente/{id}/revogacao`, pelo Admin do grupo, e emitir outra | Admin do grupo |
| Access token pessoal do Supabase (`sbp_…`) | Máquina de quem opera | Painel da conta → Access Tokens: revogar | Dono do token |
| Token do GitHub (conta do Cesar; conta de máquina na F0-12) | `gh` na máquina; `GH_TOKEN` local | GitHub → Settings → Tokens: revogar | Dono do token |
| Sessão de um usuário | Supabase Auth | Remover do tenant (`app.membro.ativo = false`), que corta o acesso pela RLS na hora; se preciso, forçar a saída no painel do Auth | Admin do grupo / Cesar |

Depois da revogação:
- **Acesso indevido de um membro:** desative o membro. A RLS corta o acesso na transação seguinte, porque `authz.tenant_id()` só aceita membro ativo.
- **Suspeita de falha de isolamento (RLS):** rode `pnpm db:testar-dev` no dev e a CI no ramo em questão. Se o problema estiver numa policy, a correção é migração nova, pela zona protegida.
- **Arquivo exposto no Storage:** a URL assinada expira sozinha (5 minutos no download, ADR-024). Se o próprio caminho estiver comprometido, rotacione a secret key, e as URLs novas deixam de ser emitidas com a chave antiga.

## 3. Preservar evidências

Guarde cópia antes que a retenção apague:
- **`app.auditoria`**: quem escreveu o quê, por registro. **Leitura não é auditada hoje** (pendência no `docs/04`);
- **logs do Supabase** (Postgres, Auth, API): a retenção depende do plano, então exporte logo;
- **logs estruturados da aplicação** (`request_id`, `tenant_id`, `usuario_id`): na Vercel, quando existir; no dev, a saída do `pnpm dev`;
- **log de auditoria do GitHub** (organização ou conta) e histórico do repositório.

## 4. Avaliar o alcance

Responda, com evidência, no registro:
- Quais tenants e hotéis? Quais tabelas e registros?
- Havia dado pessoal? De quem (técnicos, gestores, hóspedes)? Quantos titulares?
- Desde quando a exposição existia e quando foi contida?
- O dado foi de fato acessado, ou só ficou acessível?

## 5. Comunicar

1. **Cliente (controlador):** o Cesar avisa o contato de segurança do cliente sem demora, por escrito. O aviso diz o que aconteceu, os dados e tenants afetados, o período, o que já foi contido e os próximos passos. O jurídico revisa o texto.
2. **ANPD e titulares:** a decisão e a comunicação são do cliente, com o apoio da EasyGov e os dados levantados nas etapas 3 e 4.
3. **Interno:** a equipe e a EasyGov ficam sabendo pelo registro, sem cópia de dado vazado em chat ou e-mail.

## 6. Corrigir e recuperar

- A causa vira correção com teste: um meta-teste ou caso de isolamento que falharia se a falha voltasse.
- Dado corrompido ou apagado em produção volta pelo PITR (F0-13, quando existir produção).
- As credenciais novas são conferidas: aceite da F0-03 (`pnpm db:verificar-papeis`) e fumaça.

## 7. Fechar

Registre no diário ou no log de operação:
- cronologia;
- causa;
- alcance;
- o que foi revogado;
- comunicações feitas, com data;
- o que mudou no processo.

Revise este documento se ele não bastou.
