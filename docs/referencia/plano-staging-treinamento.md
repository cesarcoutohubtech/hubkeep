# Plano do staging para o treinamento dos hotéis

**Situação:** proposta de 12/10/2026, do agente do núcleo. **Adiada pelo Cesar em 12/10/2026** para o portão do staging, o ponto em que não dá mais para avançar sem ele: o fim da 1c no dev, antes do treinamento (`docs/13`). As cinco decisões abaixo e o adendo ao ADR-024 voltam ao Cesar nesse momento, e nada deste plano é criado nem contratado antes. É a parte de staging da F0-12 (`docs/04`, `docs/13`), que vem antes do treinamento: o treinamento acontece no staging, e não no dev (resposta 2 do Cesar, 08/10/2026). A produção fica para a preparação do piloto, com o mesmo roteiro.

**Como ler:** cada passo diz quem faz.
- **Cesar:** conta, pagamento, DNS, segredo, `db push`, `config push` e merge de zona protegida;
- **agente:** código, PR, documento e conferência sem segredo.

Nenhum segredo passa pelo agente: o Cesar cola as chaves direto no painel da Vercel e do GitHub, e no `.env` local dele.

## Custos (por mês, salvo indicação)

Valores de outubro de 2026, a conferir na página de cada serviço antes de contratar. Os do Supabase vêm de páginas de terceiros, porque a página oficial não abriu na consulta.

| Item | Para quê | Custo | Obrigatório para o treinamento? |
|---|---|---|---|
| Supabase Pro | Projeto HubKeep-staging, em São Paulo, sem pausa por inatividade e com backup diário | US$ 25 por organização, mais o compute por projeto (Micro ≈ US$ 10, coberto pelo crédito de US$ 10 quando é o único projeto pago da organização) | Sim |
| Vercel Pro | Os crons por minuto (o outbox) e o uso comercial; o plano Hobby só agenda cron diário e não permite uso comercial | US$ 20 por membro (um membro), com US$ 20 de uso incluídos | Sim |
| Domínio `.com.br` | `staging.hubkeep.com.br` e, depois, a produção e o remetente de e-mail | ≈ R$ 40 por ano (Registro.br) | Não: o staging funciona no endereço `*.vercel.app`. É obrigatório para o e-mail de produção |
| E-mail transacional (Resend, ou SES) | Convites e recuperação de senha com domínio próprio (SPF, DKIM e DMARC) | Grátis até 3.000 e-mails por mês e 100 por dia; Pro a US$ 20 por 50 mil | Não: as contas do kit entram com senha, sem e-mail. É obrigatório para convidar pessoas de verdade |
| Sentry | Erros do servidor no staging | Grátis no plano Developer (5 mil erros por mês, um usuário); Team a US$ 26 | Não (M3 do `docs/11`: o Sentry entra antes do piloto) |
| PITR do Supabase | Recuperação a um ponto no tempo | Complemento pago, só na produção | Não |

**Mínimo para o treinamento:** cerca de US$ 45 a 55 por mês (Supabase Pro com o staging, mais Vercel Pro), sem domínio e sem e-mail próprio. Com domínio e e-mail no plano grátis, soma ≈ R$ 40 por ano.

## Passos, em ordem

| # | Passo | Quem | Depende de |
|---|---|---|---|
| 1 | Aprovar este plano e o adendo ao ADR-024 (kit e provisionamento no staging) | Cesar | — |
| 2 | Criar o projeto **HubKeep-staging** no Supabase (organização EasyGov, região São Paulo, plano Pro), guardar a senha do banco no cofre e passar ao agente só o **project ref** | Cesar | 1 |
| 3 | PR de zona protegida: o bloco `[remotes.staging]` no `supabase/config.toml` (ref, `site_url`, URLs de retorno, TOTP e confirmação de e-mail, como no dev) e o texto do adendo ao ADR-024 no `docs/03` | Agente | 2 |
| 4 | Merge do PR do passo 3, `supabase link` no staging, `supabase db push` (todas as migrações) e `supabase config push` | Cesar | 3 |
| 5 | Papéis de banco: `pnpm db:papeis --ambiente staging` (a senha é digitada no terminal; o script já confere o ref do `[remotes.staging]`, #196) e o aceite da F0-03 com `pnpm db:verificar-papeis --ambiente staging`, se o Cesar liberar (decisão 5) | Cesar roda; agente prepara | 4 |
| 6 | pgTAP contra o staging, com rollback (o agente estende o `db:testar-dev` para aceitar o staging) | Cesar roda; agente prepara | 4 |
| 7 | Assinar o Vercel Pro | Cesar | 1 |
| 8 | Criar dois projetos na Vercel, `hubkeep-web-staging` e `hubkeep-tecnico-staging`, ligados ao repositório, em `gru1`, com o branch de produção `main`. Os previews de PR também apontam para o staging, nunca para a produção (M2 do `docs/11`) | Cesar cria; agente passa a lista | 7 |
| 9 | Variáveis de ambiente dos dois projetos (a lista com nome, onde pegar e em qual projeto vai num anexo do PR do passo 3): Supabase do staging, as três URLs de banco dos papéis, a secret key, o `CRON_SECRET`, o `HK_REF_PRODUCAO` (trava contra a produção), a URL do site e a do PWA | Cesar cola; agente confere os nomes | 5 e 8 |
| 10 | Primeiro deploy, crons ligados (outbox, promoção e Intelligence; a preventiva quando a PV3 existir) e conferência das rotas | Agente confere; Cesar aprova | 9 |
| 11 | (Opcional) DNS: `staging.hubkeep.com.br` e `tecnico.staging.hubkeep.com.br`, em CNAME para a Vercel, e as URLs de retorno do Auth atualizadas (`config push`) | Cesar | 8 |
| 12 | (Opcional para o treinamento) E-mail: conta no provedor, domínio de envio com SPF, DKIM e DMARC, e o SMTP no Auth do staging (o adaptador SMTP próprio é da 1c) | Cesar; agente prepara o `config.toml` | 11 |
| 13 | Kit por turma: `pnpm demo:dados --ambiente staging --turma 1` na máquina do Cesar, com o `apps/web/.env.staging.local` e a `DATABASE_URL_OWNER` do staging. Cria o "Grupo Demonstração — Turma 1", com e-mails `@turma1.demo.hubkeep.test`, sem apagar nada; cada turma nova ganha o próprio grupo | Cesar roda; agente prepara (#196, fora da zona protegida) | 6 e 10 |
| 14 | Conferência do roteiro de treinamento no navegador, papel por papel (`docs/piloto/roteiro-treinamento.md`), no staging | Cesar, com o agente | 13 |
| 15 | Datas das turmas | Cesar | 14 |

## O que muda no código (preparado pelo agente)

- **Fora da zona protegida (PR do provisionamento e do kit por turma):**
  - o kit com `--turma`;
  - os scripts aceitando o staging só quando o `config.toml` tiver o `[remotes.staging]`, com o ref conferido em todas as conexões, como no dev;
  - o script de provisionamento de cliente.
- **Zona protegida (passo 3):** o `[remotes.staging]` e o adendo ao ADR-024. Uma migração automática para o staging pela CI (`docs/04`) pede um workflow novo e um Environment `staging` no GitHub, com o segredo colado pelo Cesar. A proposta é deixar isso para depois do treinamento: até lá, o `db push` no staging é manual, pelo Cesar, como no dev.
- **Travas que continuam:**
  - a conta do kit nunca roda na Vercel (`VERCEL_ENV`) e só aceita e-mail `.test`;
  - o token `sbp_` nunca vai contra o staging;
  - produção continua exigindo `--confirmar-producao`, e os scripts do kit não aceitam produção.

## Decisões para o Cesar

1. Staging em projetos próprios na Vercel (crons só rodam no ambiente de produção de cada projeto), e não como preview? (proposta: projetos próprios)
2. Treinamento no endereço `*.vercel.app`, com o domínio só quando vier o e-mail? (proposta: sim, se o domínio ainda não estiver registrado)
3. `db push` no staging manual até o treinamento, sem workflow de migração automática? (proposta: sim)
4. Sentry só a partir do piloto? (proposta: sim, como no `docs/11`)
5. Liberar o `db:verificar-papeis` e o pgTAP no staging? O primeiro grava uma fixture fictícia e a apaga no fim; o segundo grava dentro de transação e faz rollback. Hoje os dois só rodam no dev e na CI. (proposta: sim, só no staging, nunca na produção)
