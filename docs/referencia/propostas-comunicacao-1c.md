# Proposta de desenho da comunicação (item 5 da 1c)

**Situação:** proposta de 13/10/2026, do agente da 1c. As decisões C1 a C9 foram aprovadas pelo Cesar no mesmo dia, como recomendadas, com os registros da seção "Decisões aprovadas", no fim. O item vem do `docs/13`: e-mail próprio com domínio de envio, notificações, push no celular e recuperação de senha. O mock não tem tela para ele (`paridade-mock-1c.md`, seção 9). A proposta termina com as decisões C1 a C9.

**Fatos do código** (`main` em `108d233`):
- **Outbox:** existe, com o cron de minuto a minuto (ADR-007). Ele só pega os tipos que têm manipulador. Hoje o único manipulador é o `membro.convidado`, que manda o convite pelo Supabase Auth com o template gerado do catálogo (ADR-018 e ADR-022).
- **Portas:**
  - a `EnvioDeConvite`, que a SMTP própria substitui como outro adaptador;
  - a `EnviadorDeEmail`, que existe e não tem adaptador.
- **Monitor de SLA:** já publica o `chamado.sla_alerta`, com o tipo, o nível, o prazo e os destinatários por papel (ADR-043, M3). Ninguém o consome. Os avisos aparecem só no painel e no selo da ficha (M4).
- **Outros eventos** que podem virar aviso:
  - o `os.atribuida`, na triagem e na reatribuição;
  - o `licenca.sem_saldo`;
  - o `os.locador_avisado`, do arrendado (item 6), que ainda não existe.
- **Senha:** não há recuperação. A tela `/definir-senha` existe, para o convite.
- **Push:** não há. O PWA do técnico tem service worker (vite-plugin-pwa), sem inscrição de push.
- **Supabase Auth:**
  - não tem SMTP próprio no `config.toml`, porque o bloco `[auth.email.smtp]` está comentado;
  - o limite de envio é de 30 e-mails por hora.
- **Preferências do membro:** o membro grava o idioma, o formato regional e o fuso, e o worker lê essas preferências "para o e-mail e o push" (ADR-022).
- **Idioma:** a decisão de 25/09 é que e-mail, push e PDF saem em pt-BR no MVP, mas com o texto no catálogo.

---

## 1. Provedor e domínio de envio

O provedor, a conta e o DNS do domínio (SPF, DKIM e DMARC) são da preparação de produção (F0-12) e ficam com o Cesar. O código fica preso só à porta `EnviadorDeEmail`, com um adaptador por API HTTP do provedor. A chave entra como variável de ambiente, adicionada ao `.env.example`.

- **Recomendação:** Amazon SES na região de São Paulo (`sa-east-1`). O conteúdo dos avisos tem nome de pessoa e de hotel, e o envio fica no Brasil, como o banco e a Vercel (`gru1`). O custo é por mensagem, e ele tem limite de envio por conta.
- **Alternativa:** Resend ou Postmark. São mais simples de configurar, mas o envio sai dos EUA.
- **Sem provedor configurado** (dev, preview e CI), o adaptador é o "desligado": o manipulador grava o envio como `sem_provedor` e não manda nada (seção 3). Assim o evento não fica pendente esperando um provedor e não dispara de uma vez, com data antiga, quando ele entrar.

## 2. O que vira e-mail e push no MVP

| Evento | E-mail | Push | Quem recebe |
|---|---|---|---|
| `chamado.sla_alerta`, perto de vencer | Sim | Sim | Os destinatários do nível na política `chamado.escalonamento` (M3) |
| `chamado.sla_alerta`, vencido | Sim | Sim | Idem, com o Gestor CSC |
| `os.atribuida` | Não | Sim | O técnico responsável, ou os técnicos da equipe |
| `os.locador_avisado` (item 6) | Sim | Não | O proprietário do hotel (decisões 6 e 8) |
| Convite | Sim | Não | O convidado, como hoje |
| Recuperação de senha | Sim | Não | Quem pediu |

**Ficam fora do MVP**, como pendências:
- o `licenca.sem_saldo` à EasyGov;
- o aviso de OS concluída ao solicitante;
- o resumo diário;
- o WhatsApp.

O papel vira pessoa na hora do envio, pelas atribuições vigentes no hotel do chamado. O "responsável da OS" é o técnico, ou os técnicos da equipe. Membro sem e-mail ou inativo fica fora, e isso fica registrado (seção 3).

## 3. Registro dos envios

O outbox entrega o mesmo evento mais de uma vez quando o worker cai entre o envio e a marcação (ADR-007). A proposta é a tabela `app.envio_notificacao`, só de inserção, com uma chave única por evento, destinatário e canal. Ela tem:
- o tenant e o hotel;
- o evento;
- o usuário;
- o canal (`email` ou `push`);
- a situação (`enviado`, `sem_provedor`, `sem_endereco` ou `falhou`);
- a hora.

Com ela, o envio não se repete, a hora fica registrada (a decisão 8 do arrendado pede a data do aviso ao locador) e a gestão consegue responder se o aviso saiu. Ela segue o modelo de tabela nova do `docs/02`:
- RLS;
- leitura só da gestão no escopo do hotel;
- escrita só do `hk_worker`;
- os casos de isolamento no pgTAP.

O texto do e-mail não fica gravado, só o tipo e a situação.

## 4. Push no celular

**Como funciona:**
- Web Push com chaves VAPID, no PWA do técnico. O web das telas do CSC fica sem push no MVP.
- O técnico ativa o push na tela de perfil do PWA. A inscrição vai para a tabela `app.inscricao_push`, que guarda o usuário, o endpoint, as chaves, a criação e a revogação.
- Cada um lê e revoga só as próprias inscrições.
- O worker envia o push com a biblioteca `web-push`, que é dependência nova, só no servidor.
- Quando o serviço de push responde 404 ou 410, a inscrição é revogada.

**Restrições:**
- No iPhone, o push só funciona com o PWA instalado na tela inicial (iOS 16.4 ou mais novo). A tela explica isso pelo catálogo.
- O push leva só o título e o código do chamado. O resto o técnico vê no PWA, depois do login, e nada de dado pessoal passa pelo serviço de push.

## 5. Recuperação de senha

**Fluxo:**
1. "Esqueci a senha" na tela de login leva ao `POST /api/v1/auth/recuperar`, que responde sempre 202, exista ou não a conta, para não revelar quem tem cadastro.
2. O servidor chama o `resetPasswordForEmail` do Supabase Auth, com a chave publicável.
3. O link leva à `/definir-senha`, a mesma do convite.

O e-mail sai pelo SMTP do Supabase Auth, apontado para o provedor da seção 1. O template é gerado do catálogo, como o do convite (`tests/i18n-templates.test.ts`). O limite fica no Supabase, de 30 por hora, para revisar no piloto, e no contrato há um limite por e-mail e por IP.

- **Recomendação:** este caminho. Ele não amplia o uso da secret key (regra 5, ADR-024), e o convite passa pelo mesmo SMTP sem código novo, porque o `EnvioDeConvite` atual continua.
- **Alternativa:** gerar o link com `generateLink` no `packages/auth-admin` e mandar pela porta. Ela precisa de adendo ao ADR-024, porque é um uso novo da secret key, e só ganha o template no idioma do usuário.

A recuperação mexe no `supabase/config.toml` (SMTP e template), que é zona protegida, e pede o `config push` do Cesar.

## 6. Idioma dos avisos

Os catálogos já estão nos quatro idiomas.

- **Recomendação:** o aviso sai no idioma do destinatário: a preferência gravada, depois o padrão do tenant. Isso muda a decisão de 25/09, que dizia pt-BR no MVP, e por isso está aqui como decisão.
- **Alternativa:** pt-BR para todos, como está decidido. O texto continua no catálogo.

O e-mail do Supabase Auth (convite e recuperação) fica em pt-BR nas duas opções, porque o template do Supabase é único.

## 7. Quem pode silenciar

- **Recomendação:** no MVP, nenhuma preferência de canal por pessoa. Quem recebe é decidido pela política de escalonamento, por papel e no escopo do hotel. Cada técnico pode desligar o push no próprio aparelho, e o e-mail não tem opção de desligar. A preferência por canal e por tipo fica como pendência.
- **Alternativa:** um interruptor de e-mail por pessoa, para os avisos de "perto de vencer". O "vencido" continua sem opção de desligar.

## 8. Volume

Um Gestor CSC com 40 hotéis pode receber dezenas de avisos num dia ruim.

- **Recomendação:** um e-mail por aviso, na hora, como o monitor emite, e a contagem real medida no piloto.
- **Alternativa:** juntar os avisos da mesma pessoa a cada 15 minutos num e-mail só. É mais código, e pede a tabela da seção 3 com a situação `agrupado`.

## 9. Ordem dos PRs

1. Esta proposta aprovada, e um ADR curto com o que for decidido, com o número seguinte da `main` (hoje, ADR-045).
2. **Migração** (zona protegida, na vez do Cesar): `app.envio_notificacao` e `app.inscricao_push`, com o pgTAP de isolamento e os GRANTs do `hk_worker`.
3. **E-mail dos avisos de SLA** (fora da zona):
   - o adaptador do provedor e o "desligado";
   - o manipulador do `chamado.sla_alerta`;
   - o modelo do e-mail no catálogo;
   - o registro dos envios.
4. **Push** (fora da zona): a inscrição no PWA, a API, o envio pelo worker, o `os.atribuida` e os avisos de SLA ao técnico.
5. **Recuperação de senha:**
   - a tela, a rota e o contrato, fora da zona;
   - o bloco SMTP e o template no `config.toml`, num PR de zona protegida e com o `config push` do Cesar.
6. **Aviso ao locador:** entra com o arrendado mínimo (item 6) e usa o mesmo manipulador.

**Dependências do Cesar:**
- a conta no provedor e o DNS do domínio de envio (F0-12);
- as chaves VAPID e a chave do provedor nas variáveis da Vercel. Elas ficam fora do git e entram no `.env.example` só pelo nome.

## Decisões

| # | Decisão | Recomendação |
|---|---|---|
| C1 | Provedor de e-mail | Amazon SES em `sa-east-1`, atrás da porta `EnviadorDeEmail`; sem provedor, o adaptador "desligado" |
| C2 | Eventos do MVP (tabela da seção 2) | Os avisos de SLA por e-mail e push, a OS atribuída só por push, o aviso ao locador por e-mail, mais o convite e a recuperação |
| C3 | Registro dos envios | A tabela `app.envio_notificacao`, só de inserção, com chave por evento, destinatário e canal |
| C4 | Push | Web Push no PWA do técnico, com a tabela `app.inscricao_push`; o web sem push no MVP |
| C5 | Recuperação de senha | Pelo Supabase Auth com SMTP próprio e template do catálogo, sem uso novo da secret key |
| C6 | Idioma dos avisos | O idioma do destinatário (muda a decisão de 25/09); o e-mail do Supabase Auth fica em pt-BR |
| C7 | Silenciar | Sem preferência por pessoa no MVP; o push se desliga no aparelho |
| C8 | Volume | Um e-mail por aviso; a contagem é medida no piloto |
| C9 | Ordem | A da seção 9 |

## Decisões aprovadas (13/10/2026)

O Cesar aprovou as recomendações de C1 a C9 no chat do agente da 1c ("Comunicação, C1 a C9: aprovo as suas recomendações, com dois registros"). Os registros e os detalhes dele:

- **C1:** a infraestrutura é do Cesar: o domínio, a conta da AWS, a verificação no SES e a saída do sandbox. Até ele configurar, o envio fica desligado e só registrado (`sem_provedor`).
- **C6:** muda a decisão de 25/09. Os avisos saem no idioma de quem recebe, e o convite e a recuperação de senha ficam em pt-BR.
- **C8:** um e-mail por aviso, mas a contagem de envios por destinatário e por dia fica disponível desde o primeiro dia do piloto. Acima de 30 por pessoa e por dia, abre-se o resumo agrupado.
- **C9:** a ordem é esta:
  1. o ADR;
  2. uma única migração com as duas tabelas, na fila de zona protegida depois da parte protegida da PV3;
  3. o e-mail do SLA;
  4. o push;
  5. a recuperação de senha;
  6. o e-mail ao locador.
