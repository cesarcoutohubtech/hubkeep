# 11 — Conferência de conformidade da fase 1a

**Data:** 05/10/2026, fechamento da etapa D (pedido do Cesar de 30/09/2026).
**O que foi conferido:** a `main` contra o `CLAUDE.md` e as regras inegociáveis, só por leitura. Nada foi alterado nem executado contra o banco. Três frentes leram o `9c070fd` (antes da D1); a de textos leu o `3570da8` (com a D1).
**Como:** quatro frentes:
1. banco e RLS;
2. arquitetura e acesso aos dados;
3. textos e idiomas;
4. segredos, configuração e processo.

Os achados de severidade média e alguns dos baixos foram conferidos de novo, um a um, antes de entrar aqui.

## Resultado

**Nenhuma violação das regras inegociáveis.** O isolamento por tenant, a RLS, a proibição de gatilho e de função nova, o acesso só pelo servidor com contexto, a unit of work com auditoria e outbox, a chave secreta restrita ao `auth-admin`, o TOTVS só leitura e o texto de interface pelo catálogo estão cumpridos no código.

Os achados são de dois tipos:
- **guardas incompletas:** lint, meta-teste ou teste que não pegaria uma regressão futura;
- **pendências de operação:** coisas que pesam quando staging e produção existirem.

Três pedem decisão do Cesar antes do piloto: o uso da chave secreta pela identidade de demonstração, a falta de trava contra preview no banco de produção e o `hotel_id` nos logs.

## Por regra

| Regra | Situação | Observação |
|---|---|---|
| 1. Isolamento no banco | Cumprida | As 31 tabelas têm `tenant_id NOT NULL`, RLS habilitada e forçada, e policy por comando concedido. Nenhum `using (true)` para o `hk_app`. Os meta-testes cobrem só parte da regra (achado B1). |
| 2. Sem regra de negócio no banco | Cumprida | As 11 funções são as do meta-teste 11, com md5 conferido. O estado `cancelada` aparece fixo em índice e policies (achado B6). |
| 3. Sem gatilho | Cumprida | Nenhum `CREATE TRIGGER`. |
| 4. Função nova só por ADR | Cumprida | `authz.hoteis_proprietario` tem o ADR-031. |
| 5. Acesso pelo servidor, chave secreta só no `auth-admin` | Cumprida, com ressalva | O navegador só usa o Auth. A chave secreta é lida só no `auth-admin`, mas ganhou um uso sem ADR (achado M1). |
| 6. Escrita por unit of work | Cumprida | Toda escrita de negócio audita. As exceções são de desenho e estão documentadas: a chave offline, o processamento do outbox e o staging (ADR-008). |
| 7. Exigência de cliente como configuração | Cumprida | "Slaviero" aparece só em testes; não há `tenant ===` no código. |
| 8. TOTVS só leitura | Cumprida | O conector só faz SELECT e POST HTTPS, sem credencial do banco, com teste dedicado. Ainda não há Dockerfile (achado B10). |
| 9. Sem ML, IoT ou IA | Cumprida | Nenhuma dependência desse tipo. |
| 10. Escopo fechado | Cumprida | Os crons de SLA e preventiva existem vazios, agendados (achado B9). |
| 11. Texto pelo catálogo | Cumprida | 635 chaves nos quatro idiomas, e os 156 códigos de erro com mensagem. A API devolve só código e parâmetros. As guardas têm lacunas (achados B3 a B5). |

## Achados de severidade média

**M1. Identidade de demonstração usa a chave secreta sem ADR.**
- **Onde:** `criarIdentidadeDeDemonstracao` (`packages/auth-admin/src/index.ts:139`) cria a conta já confirmada e com senha para o kit de teste. A regra 5 e o ADR-024 autorizam a chave secreta só para convite e URL assinada; este uso está registrado só no diário.
- **Risco:** uso da `service_role` fora da decisão formal.
- **Proposta:**
  - adendo ao ADR-024 com o uso de demonstração, restrito a quando não há `VERCEL_ENV`, como o código já faz;
  - ajustar o texto da regra 5 do `CLAUDE.md`.
  - Os dois arquivos são zona protegida.

**M2. Nada impede o preview de apontar para o banco de produção.**
- **Onde:** a regra existe só em documento (`CLAUDE.md`, `docs/01`). A `composicao.ts` não confere o ambiente.
- **Risco:** na F0-12, uma variável marcada para todos os ambientes da Vercel põe o preview no banco de produção sem alarme.
- **Proposta:**
  - falhar fechado na inicialização quando `VERCEL_ENV=preview` e a URL do banco for a de produção, com teste;
  - incluir o item no checklist da F0-12.

**M3. O `hotel_id` nunca chega ao log.**
- **Onde:** o campo existe no formato (`apps/web/src/servidor/log.ts:12`), mas nenhum lugar de `apps/web/src` o preenche. O Sentry só roda no servidor do web; o PWA e o cliente do web não reportam erro.
- **Risco:** não dá para filtrar incidente por hotel, como a stack pede.
- **Proposta:**
  - marcar o hotel na `rota()` (por exemplo, `r.marcarHotel(hotelId)`) nos handlers que recebem hotel, com o campo indo também às marcas do Sentry;
  - decidir antes do piloto se o PWA reporta erro.

**M4. `pnpm dev` não existe na raiz.**
- **Onde:** o `CLAUDE.md` documenta o comando, mas o `package.json` da raiz não tem o script e o `turbo.json` não tem a tarefa. O roteiro do `docs/10` usa os comandos por app, que funcionam.
- **Proposta:** `"dev": "turbo run dev"` com a tarefa `dev` persistente e sem cache, ou corrigir o `CLAUDE.md`.

## Achados de severidade baixa

**Banco**
- **B1. Meta-teste não exige teste de isolamento por tabela nem policy por papel.** Os testes 1, 2 e 19 cobrem RLS, `tenant_id` e o `true` literal, mas não pegam uma tabela nova sem teste nem uma condição sempre verdadeira. Proposta:
  - lista fechada de tabelas, no estilo do teste 11;
  - exigir `authz.tenant_id()` em toda policy do `hk_app`.
- **B2. "Implantador vencido" falta em quatro arquivos de teste:** 004, 005, 019 e 020, sem justificativa no cabeçalho.
- **B6. Estado `cancelada` fixo no banco.** Ele aparece no índice `os_uma_ativa_por_chamado` e nas policies das migrações 0023, 0025 e 0026. Proposta: teste de paridade com `ESTADOS_DA_OS` do domínio.
- **B7. Modelo de tabela nova incompleto em partes da fase 0 e da 1a.**
  - Sem `unique (tenant_id, id)`: `local_proprietario`, `auditoria`, `credencial_agente`, `carga`, `ativo_movimentacao` e `anexo`.
  - Sem índice `(tenant_id, hotel_id)`: algumas tabelas de execução.
  - Não há risco hoje; pesa numa FK futura.
- **B8.** O meta-teste 21 confere só as colunas de quem referencia, não a coluna de destino. Nenhum meta-teste confere que o `service_role` não tem USAGE nos schemas do HubKeep. A policy de INSERT de `atribuicao_escopo` não exige `revogado_por is null`.

**Textos e idiomas**
- **B3. O lint de texto fixo não vê tudo.** Escapam:
  - arquivos `.ts`;
  - literal guardado em variável e depois renderizado;
  - props como `rotulo`, `titulo` e `mensagem`;
  - `alert()`, `confirm()` e `document.title`.
  - Hoje não há violação; a lacuna é para o futuro.
- **B4. Os testes de catálogo não cobrem tudo.**
  - `tests/i18n-codigos.test.ts` só reconhece código literal e só confere o pt-BR; não vê o template `${tipo}_nome_invalido`.
  - `packages/i18n/test/catalogos.test.ts` exige completo só o en. Pelo ADR-022, es e fr deveriam ser exigidos antes do piloto.
- **B5.** O `index.html` do PWA fixa `lang="pt-BR"`, e o leitor de tela lê en, es e fr como português. A rota `auth/confirmar` aceita `recovery` e `magiclink`, mas só o convite tem modelo do catálogo, e uma recuperação de senha sairia com o texto padrão do Supabase, em inglês.

**Arquitetura e processo**
- **B9. Crons vazios agendados.** `/api/cron/sla` e `/api/cron/preventiva` não fazem nada por tenant, mas estão no `vercel.json` (a cada 5 minutos e uma vez por dia). Proposta: tirar do agendamento até a 1b e a 1c.
- **B10.** O conector não tem Dockerfile, embora a stack diga que roda em Docker. É pendência de fase.
- **B11. O lint de fronteiras tem duas brechas:** proíbe `pg` só nos apps, e `node:*` não é proibido em `packages/aplicacao`.
- **B12. `.env.example` desalinhado.**
  - `SENTRY_DSN` aparece duas vezes.
  - Seis variáveis não são lidas por nenhum código (e-mail, web push, TOTVS, ref do dev).
  - O `tests/env-example.test.ts` não vê `import.meta.env.*` nem as chamadas `exigir('X')`.
- **B13. Ruleset e zona protegida.**
  - Gitleaks e Semgrep não são obrigatórios no ruleset (pelo diário da fase 0).
  - O padrão da zona protegida não inclui `packages/auth-admin/` nem os testes que guardam a chave secreta, o `.env.example` e as actions fixadas.
  - O `ci.yml` não tem `timeout-minutes`.

## Fatos da fase registrados aqui

- **A D1 (#81) entrou na `main` com um teste de integração vermelho.** A linha do tempo do proprietário ainda era esperada vazia. A correção está no #83.
- **No mesmo dia, o `pnpm audit` passou a reprovar todos os PRs** por um alerta alto novo no `braces` (GHSA-vfj7-8cjw-p6xm), sem versão corrigida. O `braces` só entra por ferramentas de desenvolvimento. A exceção, com o motivo, está no #83 para revisão.

## O que fazer com isto

Nenhum achado bloqueia o teste do kit nem o fechamento da 1a.

Proposta de ordem, cada item num PR próprio e só com o aval do Cesar:
1. **Antes do piloto:**
   - M1: adendo ao ADR-024 e ajuste da regra 5;
   - M2: trava contra preview no banco de produção, junto com a F0-12;
   - M3: `hotel_id` no log;
   - B4: es e fr exigidos no teste de catálogo, como o ADR-022 já prevê;
   - B5: modelos de e-mail de recuperação, se a recuperação de senha entrar.
2. **Junto com a próxima mexida em cada área:**
   - M4;
   - B1, B2, B6 a B8, que são zona protegida;
   - B3, B11 e B13, que tocam o `eslint.config.mjs` e os workflows e também são zona protegida;
   - B12.
3. **Na fase certa:**
   - B9: religar os crons na 1b e na 1c;
   - B10: Dockerfile do conector, com as views reais do TOTVS.

## Decisão do Cesar (05/10/2026)

- **Aprovados o agrupamento e as recomendações acima**, com uma mudança no B5:
  - a recuperação de senha entra no piloto, na fase 1c, junto com o e-mail próprio;
  - até lá, a rota `auth/confirmar` recusa `recovery` e `magiclink`.
- **B13:** o Cesar torna o Gitleaks e o Semgrep obrigatórios no GitHub. O resto do B13 (padrão da zona protegida e `timeout-minutes`) vai em PR.
- **Ordem:**
  - **zona protegida, um PR de cada vez:**
    1. ESLint: fronteira do `packages/inteligencia`, B11 e B3;
    2. meta-testes: B1, B2, B6 e B8;
    3. M1;
    4. B13.
  - **em paralelo, fora da zona protegida, cada um no seu PR:** M2, M3, M4, B4, B5, B9 e B12.
- **Ficam como estão:** B7 (adiado até surgir FK para essas tabelas) e B10 (Dockerfile do conector com as views reais do TOTVS).
