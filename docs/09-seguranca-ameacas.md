# 09 — Modelo de ameaças e checklist de segurança

Modelo de ameaças do HubKeep na fase 1a (S1, 29/09/2026; atualizado na S2, com as condições da aprovação do ADR-032). Diz o que se protege (ativos), de quem (atores), por onde se ataca (superfícies) e qual controle responde a cada ameaça, com o status de cada um. No fim estão o checklist do OWASP ASVS nível 2 e as pendências, com o plano de rate limiting, o endurecimento do banco de produção e o pentest antes do rollout.

Este documento acompanha o código. Controle novo, superfície nova ou pendência resolvida atualiza a tabela no mesmo PR. As decisões técnicas continuam no `docs/03`: a S1 registrou o ADR-032. O roteiro de incidente está no `docs/07`, e os acessos às contas, no `docs/08`.

**Status usados:** **atendido** (o controle existe e tem teste ou verificação), **parcial** (existe, mas com lacuna conhecida, apontada) e **pendente** (não existe; a pendência Pn diz o plano).

---

## 1. Ativos

| Id | Ativo | Por que importa |
|---|---|---|
| AT1 | Dados operacionais de cada tenant: hotéis, locais, ativos, chamados, OS, políticas | O produto é multi-tenant; um grupo hoteleiro ver o dado de outro é o pior incidente possível |
| AT2 | Dados pessoais: e-mail e nome dos membros, vínculo do proprietário com a UH | LGPD. O cliente é controlador e a EasyGov é operadora (`docs/07`) |
| AT3 | Sessão do usuário: access token (1 h) e refresh token | Quem tem a sessão age como o usuário, no escopo dele |
| AT4 | Segredos do servidor: secret key do Supabase, senhas dos papéis `hk_*`, `CRON_SECRET`, chaves de assinatura do Auth | Abrem o banco, o Auth ou os jobs por fora das regras |
| AT5 | Credencial do agente conector | Grava lotes de ingestão em nome do tenant |
| AT6 | Fotos e anexos (bucket `anexos`) | Podem mostrar pessoas, documentos e o interior dos hotéis |
| AT7 | Trilha de auditoria e outbox | Prova do que aconteceu; precisa ser íntegra |
| AT8 | Disponibilidade da API e do PWA | Chamado e SLA dependem de a API responder |
| AT9 | Código, pipeline e configuração (repositório, CI, migrações) | Mudança maliciosa aqui vira vulnerabilidade em produção |

## 2. Atores

| Ator | O que já tem | O que buscaria |
|---|---|---|
| **Usuário de outro tenant** | Conta válida e sessão num tenant | Ler ou alterar dado de outro grupo (AT1, AT6), trocando o id do registro ou o tenant do cabeçalho |
| **Técnico mal-intencionado** | Conta de técnico, PWA, fila offline e operações assinadas com o próprio token | Agir fora da OS dele, subir o próprio papel, apagar rastro, subir arquivo malicioso |
| **Proprietário** | Conta de leitura do escopo dele (UH ou hotel inteiro, com vigência) | Ver UH ou hotel de outro proprietário, gravar qualquer coisa |
| **Atacante externo** | Nada além da internet; talvez uma credencial vazada ou um aparelho perdido | Sessão alheia (XSS, CSRF, força bruta), abuso e DoS, segredo no repositório, arquivo malicioso |
| **Agente de código** (Claude Code e outros) | Acesso de escrita ao repositório, máquina do operador e dev; lê conteúdo externo | Por erro ou por instrução injetada: afrouxar regra de segurança, usar a secret key, rodar comando destrutivo, commitar segredo |

O Admin do grupo e o agente conector do cliente aparecem nas tabelas como donos de privilégio legítimo. O risco deles é abuso do próprio papel e está coberto pela auditoria.

## 3. Superfícies

| Superfície | O que é | Autenticação |
|---|---|---|
| **Web** | Telas do CSC e dos gestores (Next.js, `apps/web`) | Cookie de sessão HttpOnly (S1) |
| **API** | `/api/v1` no mesmo Next.js; usada pelo web e pelo PWA | Cookie (web) ou `Authorization: Bearer` (PWA); tenant por cabeçalho ou cookie, conferido no banco |
| **PWA** | App do técnico (`apps/tecnico`), com fila offline no IndexedDB | Supabase Auth no aparelho; Bearer na API |
| **Ingestão** | `POST /api/v1/ingestao/lotes`, chamada pelo agente na rede do cliente | `Authorization: Agent hk_<tenant>_<segredo>` |
| **Storage** | Bucket privado `anexos` no Supabase | URL assinada emitida pela API depois da RLS |
| **Cron** | `/api/cron/*`, chamadas pela Vercel | `Authorization: Bearer CRON_SECRET` |
| **Repositório e CI** | GitHub, workflows, máquina de quem opera | Conta do GitHub; ruleset e zona protegida (ADR-023) |

## 4. Ameaças e controles

### Web

| Id | Ameaça | Ator | Controle | Status |
|---|---|---|---|---|
| WEB-1 | XSS leva a sessão ou age pelo usuário | Externo | O React escapa o texto. O lint proíbe `dangerouslySetInnerHTML`, `innerHTML` e `insertAdjacentHTML` em todo o repositório (S1). CSP com nonce e `strict-dynamic`, sem script inline nem de outra origem (`apps/web/src/seguranca.ts`). A sessão fica em cookie HttpOnly, que a página não lê (S1) | atendido |
| WEB-2 | CSRF: outro site faz a ação com o cookie da vítima | Externo | Cookie SameSite=Lax. O `proxy.ts` recusa, com 403 `origem_recusada`, POST/PUT/PATCH/DELETE com cookie cujo `Origin` (ou `Sec-Fetch-Site`) não seja o próprio site. A recusa vai para o log (S1) | atendido |
| WEB-3 | Login CSRF: a vítima entra na conta do atacante | Externo | `/auth/*` exige a própria origem mesmo sem cookie (S1) | atendido |
| WEB-4 | Clickjacking | Externo | `frame-ancestors 'none'` e `X-Frame-Options: DENY` (S1) | atendido |
| WEB-5 | Rebaixamento para HTTP, sessão interceptada | Externo | HSTS de 2 anos com subdomínios; cookie `Secure` em produção (S1). A Vercel só serve HTTPS. Sem preload, por decisão à parte (ADR-032) | atendido |
| WEB-6 | Link do convite vaza pelo Referer | Externo | `Referrer-Policy: strict-origin-when-cross-origin` (S1); o `token_hash` é de uso único e vence em 1 h | atendido |
| WEB-7 | Força bruta ou senha fraca | Externo | Login direto no Auth, com o limite por IP de quem tenta (ADR-032). Cadastro público desligado. Mínimo de 8 caracteres (S1). Sem CAPTCHA, sem exigência de composição e sem checagem de senha vazada | parcial (P1, P12) |
| WEB-8 | Sessão esquecida aberta em máquina compartilhada do CSC | Externo, interno | Refresh token com rotação. Sem limite absoluto e sem limite por inatividade. Sem MFA | pendente (P4) |

### API

| Id | Ameaça | Ator | Controle | Status |
|---|---|---|---|---|
| API-1 | Ler ou gravar dado de outro tenant: id trocado, tenant forjado | Outro tenant | RLS habilitada e forçada em toda tabela. Contexto por transação (`withContext`). O tenant só vale para membro ativo (`authz.tenant_id()`). FKs compostas com `tenant_id` ou `hotel_id`. 27 meta-testes (`001`) e pgTAP de isolamento por tabela (`002` a `017`) | atendido |
| API-2 | Subir o próprio papel ou conceder além do escopo | Técnico, outro papel | Regra no domínio (`podeConcederPapel` e similares) e RLS de concessão (`concedido_por` igual à sessão, escopo, papéis privilegiados só pelo Admin). Teste de integração e pgTAP | atendido |
| API-3 | Agir fora da própria OS, ou alterar o que o papel não altera | Técnico | Máquina de estados do domínio (`corretiva.ts`): quem pode cada transição, 409 para quem não responde pela OS. RLS de escrita por hotel. Auditoria de toda escrita na unit of work (ADR-006). A C3 e as seguintes continuam por este caminho | atendido |
| API-4 | Ver além do vínculo, ou gravar | Proprietário | Papel somente leitura. `authz.locais_proprietario()` e `hoteis_proprietario()` com vigência (ADR-031). pgTAP `010`, `015` e `017` | atendido |
| API-5 | Token forjado, `alg: none`, token de outro projeto | Externo | Assinatura conferida pelo JWKS, só ES256/RS256, emissor e audiência conferidos, `sub` em formato UUID (`identidade.ts`, ADR-017). O motivo do 401 não sai na resposta | atendido |
| API-6 | Injeção de SQL | Externo | Kysely parametrizado. `sql.raw` e identificador dinâmico proibidos fora de `packages/db` (lint, S1). Kysely só em `packages/db` (ADR-016) | atendido |
| API-7 | Abuso e DoS: corpo grande, rajada de requisições | Externo, conta comprometida | Limite de corpo em toda rota: 256 KiB por padrão na `rota()`, com a leitura interrompida ao passar, e teto de 4 MiB no `proxy.ts` pelo `content-length` (S2). `statement_timeout` e limite de conexões por papel (meta-teste 14). Sem rate limiting | parcial (P1) |
| API-8 | Informação vaza pela mensagem de erro | Externo | Erro sempre como código e parâmetros, sem pilha (ADR-022). O valor recebido não volta nos problemas de validação | atendido |
| API-9 | Resposta com dado de usuário guardada em cache | Externo | `Cache-Control: no-store` em toda resposta da API (S1) | atendido |

### PWA

| Id | Ameaça | Ator | Controle | Status |
|---|---|---|---|---|
| PWA-1 | Aparelho perdido com sessão e dados offline | Externo | A saída envia a fila e apaga a fila e a referência do usuário. Mas a sessão fica no `localStorage`, o IndexedDB não é cifrado, e a sessão não vence por inatividade | parcial (P4, P5) |
| PWA-2 | XSS no PWA leva o token do `localStorage` | Externo | O React escapa o texto e o lint proíbe HTML cru (S1). CSP de script no `vercel.json`, `script-src 'self'` e `worker-src 'self'`, sem inline nem eval, e `connect-src` do build só com a própria origem, a API e o Supabase (SP2, `apps/tecnico/csp.ts`). O token segue no `localStorage` | parcial (P5) |
| PWA-3 | Operação offline reenviada, duplicada ou fora de ordem | Técnico | Chave de idempotência (ADR-025), versão (ADR-029) e 409 quando a OS mudou | atendido |
| PWA-4 | Operação forjada na fila: outro hotel, OS de outro técnico | Técnico | O servidor revalida tudo: é o mesmo caso de uso do web, com o contexto do token e a RLS | atendido |

### Ingestão

| Id | Ameaça | Ator | Controle | Status |
|---|---|---|---|---|
| ING-1 | Credencial do agente vaza na rede do cliente | Externo, interno do cliente | Segredo de 256 bits; o banco guarda só o hash, comparado em tempo constante. O Admin revoga, e mais de uma credencial pode estar ativa para rodízio. Sem validade | parcial (P7) |
| ING-2 | Lote forjado ou reenviado com dado velho | Externo com a credencial | Idempotência pelo hash do conteúdo. O lote vai para `staging` e só vira UH por promoção. Sem carimbo de tempo nem assinatura do lote | parcial |
| ING-3 | DoS sem autenticação | Externo | Limite de 4 MiB e 2.000 registros. `hk_ingestao` limitado a 5 conexões. Mas o corpo é lido e validado antes da credencial | parcial (P1, P7) |
| ING-4 | O agente grava no banco ou escreve no TOTVS | Agente conector | O agente não tem credencial de banco (teste `conector-sem-banco`). O TOTVS é só leitura (regra 8, ADR-008) | atendido |
| ING-5 | Lote trafega em claro | Externo | O conector aceita URL `http://` | parcial (P7) |

### Storage

| Id | Ameaça | Ator | Controle | Status |
|---|---|---|---|---|
| STO-1 | Ler foto de outro tenant | Outro tenant | Bucket privado, sem policy em `storage.objects` (meta-testes 23 e 24). URL assinada de 300 s emitida depois da RLS. O caminho é montado e conferido no servidor (ADR-024) | atendido |
| STO-2 | Subir arquivo que roda no navegador (SVG, HTML) | Externo, técnico | O bucket aceita só JPEG, PNG, WebP e PDF, e a regra vale no próprio Storage (meta-teste 23). A API aceita a mesma lista. O teste `tests/anexos-sem-html.test.ts` prende as quatro listas (S1). O servidor não confere o conteúdo real do arquivo | atendido (tipo), parcial (conteúdo, P8) |
| STO-3 | Sobrescrever o arquivo de outro | Técnico | `upsert: false`; o caminho leva um UUID novo | atendido |
| STO-4 | URL assinada vazada | Externo | Download em 300 s; upload em 2 h (padrão do Supabase) | parcial |
| STO-5 | Localização (GPS) nos metadados da foto | Externo | A compressão no aparelho recodifica em JPEG e descarta o EXIF. O PDF passa como veio | atendido (foto) |

### Cron

| Id | Ameaça | Ator | Controle | Status |
|---|---|---|---|---|
| CRON-1 | Terceiro dispara o job | Externo | `Bearer CRON_SECRET` comparado com `timingSafeEqual`. Sem o segredo configurado, 503 (`servidor/cron.ts`) | atendido |
| CRON-2 | Job com privilégio demais ou no tenant errado | — | Papel `hk_worker`, tenant do job no contexto (`tenant_sistema`), RLS (ADR-021) | atendido |
| CRON-3 | Execução dupla ou concorrente | — | Outbox e jobs idempotentes (ADR-007, ADR-013) | atendido |

### Repositório e CI

| Id | Ameaça | Ator | Controle | Status |
|---|---|---|---|---|
| CI-1 | Regra de segurança afrouxada sem revisão | Agente de código | Zona protegida (ADR-023): migrações, testes do banco, workflows, lint, CLAUDE.md, `docs/03`, `.claude/` e, desde a S1, `.gitleaks.toml` e o Dependabot. Merge só pelo Cesar; `gh pr merge --admin` negado ao agente | atendido |
| CI-2 | Segredo commitado | Agente de código, pessoa | gitleaks no histórico inteiro, a cada PR e toda semana (S1). `.gitignore` de `.env*`. Teste que prende a secret key ao `auth-admin` | atendido |
| CI-3 | Dependência ou action comprometida | Externo | Lockfile congelado, `pnpm audit` alto e crítico, scripts de instalação bloqueados. Actions fixadas por SHA com a versão em comentário, CLI do Supabase em versão fixa e Dependabot das actions (S1); `tests/actions-fixadas.test.ts` reprova tag e imagem sem digest (S2). Semgrep a cada PR (S1). Sem SBOM | atendido, SBOM pendente |
| CI-4 | Comando destrutivo na máquina ou no banco de dev | Agente de código | Regras de comando do CLAUDE.md (incidente 3): `db push` só pelo Cesar, só `&&`, worktree fora da pasta temporária | atendido (processo) |
| CI-5 | Secret key usada para dado de negócio | Agente de código | Fronteiras de import por lint (ADR-019) e teste `secret-key-so-no-auth-admin` | atendido |
| CI-6 | Instrução maliciosa em conteúdo lido (issue, página, log de CI) | Agente de código | Só o Cesar dá instrução; o conteúdo lido é dado. Merge humano da zona protegida | parcial (processo) |

---

## 5. Checklist OWASP ASVS 5.0, nível 2

Avaliação por capítulo e tema, não requisito a requisito. A conferência de cada requisito do nível 2 entra no preparo do pentest (P3).

| Capítulo | Tema | Status | Evidência ou lacuna |
|---|---|---|---|
| V1 Codificação e sanitização | Injeção de SQL | atendido | Kysely parametrizado; lint de `sql.raw` e identificador dinâmico (S1) |
| | Saída no navegador (XSS) | atendido | React; lint de HTML cru; CSP com nonce (S1) |
| | HTML vindo de usuário | n/a | Nenhum campo aceita HTML |
| | E-mail | parcial | O convite usa o template do Supabase. Quando o e-mail próprio entrar (`EMAIL_API_KEY`), conferir o escape dos parâmetros |
| V2 Validação e regra de negócio | Validação de entrada e saída | atendido | Contratos Zod nos dois sentidos (`packages/contratos`) |
| | Regra de negócio fora do cliente | atendido | Domínio e aplicação no servidor; o PWA revalidado (ADR-025) |
| | Limites contra automação | pendente | P1 |
| V3 Segurança do front-end web | Cabeçalhos (CSP, HSTS, nosniff, frame, referrer, COOP) | atendido | S1; CSP de script do PWA na SP2 |
| | Cookies (HttpOnly, Secure, SameSite) | atendido | Sessão HttpOnly (S1); `hk_tenant` e `hk_idioma` sem dado sensível, com `Secure` em HTTPS |
| | CSRF | atendido | Origem conferida no proxy (S1) |
| | CORS | n/a hoje | Nenhuma origem liberada. Quando o PWA for para outra origem, lista fechada (P5) |
| V4 API e web service | Formato de erro, métodos, contrato | atendido | `rota()`, OpenAPI gerado dos contratos |
| | Content-Type e tamanho do corpo | parcial | Tamanho limitado em toda rota (S2); `Content-Type` ainda não exigido (P7) |
| V5 Arquivos | Tipo, tamanho, bucket privado, URL assinada | atendido | ADR-024, meta-testes 23 e 24, teste S1 |
| | Conteúdo real, download seguro | pendente | P8 |
| V6 Autenticação | Cadastro e convite | atendido | Sem cadastro público; membro nasce no convite (ADR-014) |
| | Senha | parcial | Mínimo de 8 (S1); sem composição nem senha vazada (P12) |
| | Força bruta | parcial | Limite por IP do Auth; sem CAPTCHA (P1) |
| | MFA | pendente | P4 |
| | Recuperação de senha | atendido | "Esqueci a senha": 202 sempre, sem revelar conta; link por `/auth/confirmar` (C9, 21/10/2026) |
| V7 Sessão | Token fora do alcance do JavaScript | atendido no web, pendente no PWA | S1; P5 |
| | Rotação e encerramento | atendido | Rotação do refresh token; saída encerra a sessão no Auth (S1) |
| | Tempo absoluto e inatividade | pendente | P4 |
| | Revogação imediata | parcial | Membro desativado perde o acesso na hora (RLS); o access token vale até 1 h (P9) |
| V8 Autorização | Escopo por tenant, hotel e papel | atendido | RLS forçada, domínio, meta-testes, pgTAP |
| | Reautenticação para ação sensível | pendente | Junto com o MFA (P4) |
| V9 Tokens autocontidos | Assinatura, algoritmo, emissor, audiência, validade | atendido | ADR-017. HS256 legado revogado no dev (`docs/08`, S5); em produção, P2 |
| V10 OAuth e OIDC | — | n/a | Sem OAuth no MVP; SSO SAML, se vier, em ADR próprio |
| V11 Criptografia | Aleatoriedade, hash, comparação | atendido | Segredo do agente de 256 bits, SHA-256, tempo constante; nonce por `crypto.getRandomValues` |
| V12 Comunicação | HTTPS e HSTS | atendido | Vercel e Supabase; HSTS (S1) |
| | TLS até o banco | atendido | Certificado conferido contra a CA do Supabase e pelo nome do host, na aplicação, nos scripts, no psql e no `db:types` (S2, P6). "Enforce SSL" no servidor: P2 |
| | Conector | parcial | Aceita `http://` (P7) |
| V13 Configuração | Segredos fora do código | atendido | gitleaks (S1), `.env.example`, teste da secret key |
| | Dependências e pipeline | atendido | `pnpm audit`, lockfile, actions por SHA, Semgrep (S1) |
| | Ambientes separados | pendente | Staging e produção na F0-12; endurecimento em P2 |
| V14 Proteção de dados | Dados pessoais em log e Sentry | atendido | Log sem corpo, token ou e-mail; Sentry com toda coleta desligada |
| | Dados pessoais na auditoria e no outbox | parcial | E-mail e nome guardados sem prazo (P10) |
| | Dados no aparelho | parcial | IndexedDB sem cifra, limpo na saída (P5) |
| V15 Código e arquitetura | Fronteiras, dependências, modelo de ameaças | atendido | ADR-019, este documento |
| V16 Log e erro | Log estruturado com escopo, auditoria na mesma transação | atendido | `servidor/log.ts`, ADR-006 |
| | Eventos de segurança e alertas | parcial | `origem_recusada` e 401 no log; sem alerta nem retenção definida (P11) |
| V17 WebRTC | — | n/a | Não usado |

---

## 6. O que a S1 implementou

Registrado no ADR-032.

- **Cabeçalhos no web:**
  - CSP com nonce por requisição, posta pelo `proxy.ts`; a API recebe a política fechada `default-src 'none'`;
  - `next.config.ts` aplica, em toda resposta: HSTS (fora do dev), `nosniff`, `Referrer-Policy`, `X-Frame-Options`, COOP e `Permissions-Policy`;
  - a API responde com `Cache-Control: no-store`;
  - o PWA ganhou os cabeçalhos que não dependem de nonce (`apps/tecnico/vercel.json`).
- **Sessão em cookie HttpOnly, Secure e SameSite=Lax:**
  - o login continua no navegador, direto no Auth, só em memória. Os tokens seguem na hora para `POST /auth/sessao`, que confere o access token pelo JWKS e grava o cookie;
  - saída (`DELETE /auth/sessao`) e senha nova (`POST /auth/senha`) passam pelo servidor;
  - a página não lê token.
- **CSRF:** o proxy confere a origem (seção 4, WEB-2 e WEB-3).
- **Lint:** proíbe `sql.raw` e identificador dinâmico fora de `packages/db`, e HTML cru em qualquer lugar. A prova está em `tests/fronteiras.test.ts`.
- **CI (`.github/workflows/seguranca.yml`):**
  - gitleaks no histórico inteiro e Semgrep (JS/TS, React, Next.js e GitHub Actions);
  - actions fixadas por SHA, CLI do Supabase em versão fixa e Dependabot das actions.
- **Bucket:** conferido que não aceita SVG nem HTML. O teste `tests/anexos-sem-html.test.ts` prende as listas.
- **Senha:** mínimo de 8 no `config.toml`, igual ao da tela.

### O que a S2 implementou

Condições 1 a 3 da aprovação do ADR-032 (Cesar, 29/09/2026).

- **Certificado do banco conferido (P6):**
  - âncora: a CA raiz do Supabase, baixada do painel pelo Cesar e conferida contra a cadeia que o pooler apresenta (portas 5432 e 6543), em `packages/db/src/ca-supabase.ts`, com a impressão digital fixada por teste;
  - a aplicação (`criarPool`) usa `rejectUnauthorized: true` com essa CA, e o Node confere o nome do host (`*.pooler.supabase.com`). Conferido com o aperto de mão TLS: sem a CA ou com outro nome, a conexão é recusada;
  - a string de conexão com parâmetro de TLS (`sslmode`, `ssl` e afins) é recusada, porque o pg o aplicaria por cima da opção do HubKeep;
  - scripts de operação, `db:fumaca`, psql do `db:testar-dev` (`verify-full`) e `db:types` também conferem. O `db:types` conectava sem TLS: o kysely-codegen cai para conexão aberta quando o TLS falha, e o dev aceita;
  - os dois `nosemgrep` saíram.
- **Limite do corpo em toda rota:** a `rota()` aplica `LIMITE_BYTES_PADRAO` (256 KiB) quando a rota não declara outro. A leitura é em fluxo e para ao passar do limite; o `proxy.ts` recusa com 413 o `content-length` acima de 4 MiB. `tests/corpo-limitado.test.ts` reprova rota que leia o `Request` direto.
- **Actions por SHA:** já fixadas na S1, agora presas por teste. A imagem do Semgrep, fixada por digest, não é atualizada pelo Dependabot: a troca é manual, no mesmo PR que muda a versão.

## 7. Pendências

As três primeiras foram pedidas para planejar agora, sem implementar. As demais apareceram no levantamento da S1. Cada uma vira tarefa própria quando o Cesar decidir. Na aprovação do ADR-032, P1, P4 (MFA) e a CSP de script da P5 viraram tarefas antes do piloto, e a P3 antes do rollout (SP1 a SP4 no `docs/05`).

### P1 — Rate limiting

**Onde limitar e por qual chave:**

| Superfície | Chave | Limite inicial sugerido | Camada |
|---|---|---|---|
| Login (`signInWithPassword`, no Auth) | IP de quem tenta | O do Supabase: hoje 30 tentativas a cada 5 min no `config.toml` da CI. No projeto, pelo painel. CAPTCHA (Turnstile) se houver ataque | Supabase Auth |
| `POST /auth/sessao`, `POST /auth/senha` | IP | 10 por minuto | Borda (Vercel Firewall) |
| `/api/v1`, escrita | Usuário e tenant, depois do token verificado | 60 por minuto | Aplicação (`rota()`) |
| `/api/v1`, leitura | Usuário | 300 por minuto | Aplicação |
| Sincronização offline | Usuário | 120 por minuto, com lote | Aplicação |
| URL assinada de anexo | Usuário | 120 por minuto | Aplicação |
| Convites | Usuário que convida | 50 por hora (cada convite é um e-mail) | Aplicação |
| Ingestão | Prefixo da credencial (tenant), antes de ler o corpo; e IP | 60 lotes por minuto por tenant | Borda (IP) e aplicação (prefixo) |

- **Por que a chave de usuário só depois do token verificado:** no proxy, o `sub` do token ainda não foi conferido. Um atacante poderia forjar o `sub` da vítima e esgotar a cota dela.
- **Falha do contador:**
  - fora de `/auth/*`, a requisição passa e um alerta dispara, porque a disponibilidade do chamado vale mais que o limite;
  - em `/auth/*`, a requisição é recusada.

**Ferramentas e custo** (ordem de grandeza; os preços públicos mudam e se conferem na contratação):

- **Supabase Auth:** limite por IP e CAPTCHA já inclusos. Custo zero.
- **Cloudflare Turnstile:** o CAPTCHA do Auth, sem custo.
- **Vercel Firewall:** regras de rate limit por caminho e IP na borda. Não mexe no código e barra antes de a função subir. No plano Pro, cobrado por requisição avaliada, pela tabela da Vercel.
- **Upstash Redis com `@upstash/ratelimit`:**
  - pela integração da Vercel, com região em São Paulo, para os limites por usuário, tenant e credencial dentro da `rota()`;
  - conta estimada: 1.000 usuários ativos fazem cerca de 150 mil chamadas por dia. Com cerca de 2 comandos por checagem, dá cerca de 9 milhões de comandos por mês, na faixa de **US$ 20 por mês** no plano por uso;
  - no volume do piloto, cabe no plano gratuito.
- **Contador no Postgres:** não recomendado. Põe escrita em toda requisição e carga no banco que atende o chamado.

**Recomendação:**
1. **Borda:** Vercel Firewall em `/auth/*` e na ingestão.
2. **Aplicação:** Upstash na `rota()`.
3. **Auth:** limites do Supabase revistos no painel antes do rollout.

A escolha de fornecedor vira ADR. **Decisão junto com a contratação do Vercel Pro, antes do piloto (SP3 no `docs/05`).**

### P2 — Endurecimento do banco de produção

**Projeto e contas**
- Projeto próprio para produção, sem dado de dev, na região São Paulo.
- MFA em toda conta da organização do Supabase (`docs/08`, S1) e membros com o menor papel.
- Log de auditoria da plataforma ligado.

**Auth**
- Só JWT assimétrico (ES256) e HS256 legado revogado, como no dev.
- Cadastro público desligado. Data API desligada (ADR-002), o que desliga PostgREST e GraphQL para o HubKeep.
- SMTP próprio com SPF, DKIM e DMARC.
- Proteção contra senha vazada (P12).

**Banco**
- "Enforce SSL" ligado e certificado conferido pelo servidor (P6).
- Senha do `postgres` e dos papéis `hk_*` geradas por `pnpm db:papeis`, guardadas no cofre, com rodízio registrado (`docs/07`).
- Limites por papel conferidos com o volume real (meta-teste 14).

**Rede**
- Restrição de rede do Supabase só é viável com IP fixo de saída. A Vercel só tem IP fixo no Secure Compute (Enterprise).
- Sem isso, a proteção é TLS com certificado conferido e senha forte por papel. A decisão vai para ADR.

**Backup**
- PITR (add-on pago do Supabase) ou backup diário do plano.
- Restauração ensaiada antes do rollout, com o tempo medido.

**Monitoramento**
- Security Advisor e Performance Advisor do Supabase limpos.
- Alertas de conexão, CPU e disco.
- Revisão trimestral de acessos (`docs/08`).

**Storage:** transformação de imagem desligada (já no dev) e bucket conferido pelos meta-testes 23 e 24.

**Extensões:** só a lista fechada do meta-teste 25. `pgaudit` fica para avaliar, e só com ADR.

### P3 — Pentest antes do rollout

- **Quando:** depois do congelamento de funcionalidades da fase que vai para o cliente e antes de ligar a Slaviero. Em staging com a configuração de produção (P2), com dois tenants e todos os papéis semeados.
- **Escopo:**
  - web, API, PWA (inclusive a fila offline no aparelho), ingestão com uma credencial de agente, Storage e rotas de cron;
  - isolamento entre tenants e escalada de papel como foco principal;
  - método: OWASP WSTG, com o ASVS nível 2 conferido requisito a requisito (a seção 5 é o ponto de partida).
- **Quem:** empresa externa, em caixa cinza, recebendo este documento, o OpenAPI e as contas de teste. Não é o time nem o agente de código.
- **Entrega:** relatório com severidade, correção dos achados altos e críticos antes do rollout, e reteste.
- **Custo:** ordem de grandeza de R$ 25 mil a R$ 60 mil para web, API e PWA em cerca de duas semanas. Confirmar em cotação.
- **Decidido:** antes do rollout (condição 5 do ADR-032; SP4 no `docs/05`).

### P4 — MFA e limites de sessão

- **MFA (TOTP):**
  - obrigatório para Admin do grupo, Gestor CSC e Implantador, e opcional para os demais. **Decidido, antes do piloto** (condição 4 do ADR-032; SP1 no `docs/05`);
  - a API confere `aal2` nas ações sensíveis: concessão de papel, credencial de agente, configuração.
- **Sessão:** limite absoluto e por inatividade no Auth. No Supabase, é recurso do plano Pro.
- A decisão de papéis e prazos é de produto (Cesar).

### P5 — PWA

- **Sessão:** hoje fica no `localStorage`. Alternativas:
  - cookie HttpOnly no mesmo domínio da API;
  - token só em memória, com o refresh em cookie.
- **CSP de script: feita na SP2 (21/10/2026).** Duas políticas, que o navegador aplica juntas:
  - no cabeçalho do `vercel.json`, fixa: `script-src 'self'; worker-src 'self'`, mais a borda de antes (`frame-ancestors`, `object-src`, `base-uri`, `form-action`). O Vite não gera script inline, e o service worker e os scripts que ele importa são da própria origem;
  - num `<meta>` que o build põe no HTML, logo depois do charset: `connect-src` com a própria origem e as origens de `VITE_API_URL` e `VITE_SUPABASE_URL`, só https (http só em `localhost`). Vai no build porque a origem da API muda entre o staging (`*.vercel.app`) e a produção, e o `vercel.json` não lê variável;
  - o Zod 4 testa `Function('')` ao definir schema de objeto, e a CSP sem `unsafe-eval` registra a tentativa como violação, mesmo com o erro tratado. O PWA liga o modo sem JIT (`@hubkeep/contratos/sem-eval`) como primeiro import do `main.tsx`, e o web, no `src/instrumentation-client.ts`, que o Next roda no navegador antes do código do app. No build de produção do web, a `/` e a `/definir-senha` tinham a violação; com o `sem-eval`, nenhuma;
  - conferido no Chromium com o build de produção e os cabeçalhos do `vercel.json`: nenhuma violação, com rede e sem rede, com o service worker ativo; sem o `sem-eval`, três violações de `script-src eval`. Os testes do `apps/tecnico` prendem o cabeçalho, a política de conexão, o HTML sem script inline e a ordem do import;
  - fora da SP2: `style-src` e `img-src` seguem abertos (o React usa `style` em linha, e as fotos vêm por URL assinada).
- **CORS em lista fechada** (só a origem do PWA) quando o PWA sair do mesmo domínio.
- **Dados offline:** prazo de expiração e limpeza da referência quando a sessão vence sem saída.

### P6 — TLS com certificado conferido até o banco (resolvida na S2)

- **Feito:** o certificado é conferido contra a CA raiz do Supabase e pelo nome do host em toda conexão do HubKeep com o banco (seção 6, S2). A CA é a mesma para todo projeto do Supabase, então staging e produção usam a mesma âncora.
- **Falta:**
  - "Enforce SSL" no servidor, para recusar quem conecta sem TLS. No dev está desligado (lido pela Management API em 29/09/2026). Ligar no dev é decisão do Cesar, pelo painel; em produção, está na P2;
  - trocar a CA antes de 26/04/2031. O `packages/db/test/ca-supabase.test.ts` reprova a partir de um ano antes.

### P7 — Entrada da API e do conector

**API**
- ~~Limite de corpo em todas as rotas, não só na ingestão.~~ Feito na S2.
- `Content-Type: application/json` obrigatório no `r.corpo()`.
- No máximo teórico, o contrato da categoria (100 campos, com até 100 opções e rótulos em quatro idiomas) passa de 256 KiB, e o limite do corpo recusa antes. Categoria real fica muito abaixo; se alguma chegar perto, a rota declara limite próprio.

**Ingestão**
- Conferir a credencial antes de ler o corpo.
- Limite de profundidade e tamanho de `dados` por registro.
- Validade da credencial do agente, com aviso antes de vencer.

**Conector:** exigir `https://` em `CONECTOR_API_URL`.

### P8 — Conteúdo do anexo

- No registro do anexo, conferir no Storage que o objeto existe, com o tamanho e o tipo real pelos primeiros bytes.
- Servir o PDF com `Content-Disposition: attachment`.

### P9 — Revogação de sessão antes do vencimento

- O access token vale até 1 h depois da saída ou da troca de senha. O membro desativado já perde o acesso na hora, pela RLS.
- Opções:
  - baixar o `jwt_expiry`;
  - conferir o `session_id` do token contra as sessões ativas nas ações sensíveis.

### P10 — Dados pessoais na auditoria e no outbox

- E-mail e nome do convidado ficam em `app.auditoria` e no payload do evento, sem prazo.
- Definir retenção e anonimização com o jurídico (LGPD, `docs/07`).

### P11 — Alertas e retenção de logs

- Alertas:
  - rajada de `origem_recusada`, 401 e 403;
  - falha do cron;
  - erro 5xx.
- Log drain da Vercel para retenção além da janela do plano.

### P12 — Política de senha e recuperação

- `password_requirements` e proteção contra senha vazada no Auth (plano Pro).
- **Recuperação de senha: feita em 21/10/2026** (C9 da comunicação da 1c, assumida pela 1b):
  - "Esqueci a senha" no login chama `POST /api/v1/auth/recuperar`, que responde sempre 202, exista ou não a conta;
  - o Auth manda o e-mail do template do catálogo (`supabase/templates/recuperacao.html`), com o link para `/auth/confirmar` (`type=recovery`) e de lá para `/definir-senha`;
  - quem tem o segundo fator confirma o código antes da senha nova;
  - o limite de envios é o do Auth.

### P13 — Checklist de acessos

- O `docs/08` tem itens em aberto, entre eles o 2FA da conta dona do repositório (G1) e o MFA no Supabase (S1).
- É operação, não código, mas é pré-requisito do rollout.
