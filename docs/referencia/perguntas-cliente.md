# Perguntas para a reunião com o cliente

Perguntas ao grupo Slaviero reunidas dos docs e dos diários (29/09/2026), agrupadas por tema. Cada uma diz o que o MVP faz hoje, que é o padrão enquanto não houver resposta, e onde o assunto está registrado. Resposta que virar exigência entra como configuração ou política, nunca como regra fixa para um cliente (regra 7 do `CLAUDE.md`).

Pergunta nova para o cliente entra aqui, e não espalhada pelos docs.

## Proprietários e condo-hotel

1. **Equipamento do proprietário na UH.** Em condo-hotel, os equipamentos da UH podem ser do proprietário. Quando um deles sai da UH, o proprietário precisa ver a movimentação?
   - Hoje: o proprietário não lê o histórico de movimentações; o ativo só deixa de aparecer para ele (Cesar, 28/09/2026).
   - Fontes: `docs/05-plano-fase-1a.md` (perguntas para a reunião), `docs/03-decisoes-tecnicas.md` (adendo ao ADR-011), `docs/diario-fase-1a.md` (B3c).
2. **Anexos e políticas do hotel.** O proprietário deve ver os anexos do hotel (fotos e documentos que não são da UH nem dos ativos dele) e as políticas?
   - Hoje: vê só os anexos dos locais e ativos dele e não lê políticas (decisão do Cesar, por falta de uso concreto).
   - Fontes: `docs/03-decisoes-tecnicas.md` (ADR-024 e ADR-031), `docs/diario-fase-1a.md` (B4).

## Idiomas e regionalização

3. **Espanhol e francês no piloto.** Quem vai usar espanhol e francês, e quando: já no piloto ou só no rollout? Em quais hotéis?
   - Hoje: a interface sai em pt-BR, en, es e fr, com traduções provisórias até a revisão. Antes do piloto, a CI passa a exigir os quatro catálogos completos.
   - Prazo estimado no levantamento: +1 a +3 semanas se es e fr entrarem no piloto.
   - Fontes: `docs/04-plano-fase-0.md` (pendências), `docs/referencia/i18n-levantamento.md`, `docs/03-decisoes-tecnicas.md` (ADR-022).
4. **Variante e tradução.** Qual variante de cada idioma (en-US, es-419, fr-FR)? Tradução profissional (estimativa de R$ 8 mil a 26 mil) ou automática com revisão interna?
   - Fontes: `docs/referencia/i18n-levantamento.md`, `docs/04-plano-fase-0.md`.
5. **Comunicação em pt-BR.** Quem usa outro idioma aceita receber e-mail, push, PDF e CSV em pt-BR no MVP?
   - Fontes: `docs/00-contexto-produto.md`, `docs/03-decisoes-tecnicas.md` (ADR-022), `docs/referencia/i18n-levantamento.md`.
6. **Fuso, feriados e horário.** Quais hotéis ficam fora do fuso de Brasília (o levantamento cita Cuiabá, Rondonópolis e Porto Velho)? Quais os feriados municipais e o horário de atendimento de cada hotel?
   - Hoje: fuso IANA por hotel; feriados do hotel na fase 1c.
   - Fontes: `docs/referencia/i18n-levantamento.md`, `docs/03-decisoes-tecnicas.md`.

## Licença e contrato

7. **Métrica da licença.** O que conta como UH licenciada?
   - Hoje (métrica provisória): UH ativa conta, área comum não conta, hotel em implantação não consome licença. A licença de hotéis é separada.
   - Fontes: `docs/00-contexto-produto.md`, `docs/01-arquitetura.md`, `docs/05-plano-fase-1a.md`.
8. **Hotel desativado.** Desativar um hotel deve liberar a licença dele?
   - Hoje: não libera (não implementado).
   - Fonte: `docs/diario-fase-1a.md` (etapa A).

## Acesso, login e e-mail

9. **SSO.** A Slaviero usa login corporativo (Entra ID, Google) e quer SSO no HubKeep?
   - Hoje: convite por e-mail. SSO SAML depende do plano do Supabase.
   - Fontes: `docs/03-decisoes-tecnicas.md` (a confirmar), `docs/01-arquitetura.md`, `docs/04-plano-fase-0.md`.
10. **Domínio do e-mail.** O cliente aceita e-mails saindo do domínio da EasyGov, ou espera outro domínio? Precisa liberar algo no servidor de e-mail dele (lista de remetentes, filtro)?
    - Antes do piloto são necessários o provedor de e-mail de produção e o domínio de envio com SPF, DKIM e DMARC.
    - Fontes: `docs/04-plano-fase-0.md`, `docs/diario-fase-0.md`.
11. **Aparelhos dos técnicos.** Qual a proporção de Android e iOS? Pesa no push do iOS.
    - Fonte: `docs/04-plano-fase-0.md`.

## Integração com o TOTVS CM

12. **Views e agente.** Quais views e campos do CM serão liberados (hotéis, UHs e status)? Quem cria o usuário somente leitura, e onde roda o agente Docker na rede do cliente?
    - Fontes: `docs/00-contexto-produto.md`, `docs/01-arquitetura.md`, `docs/04-plano-fase-0.md`, `docs/05-plano-fase-1a.md`.

## Operação

13. **SLA e escalonamento.** Quais regras de SLA, horário de atendimento, escalonamento e prioridade padrão por categoria o cliente quer? E o aceite automático do chamado em N dias (vem desligado)?
    - Fontes: `docs/05-plano-fase-1a.md`, `docs/diario-fase-1a.md`.
14. **Produtividade individual.** O cliente quer ligar a produtividade por técnico?
    - Hoje: desligada por padrão; quem liga é o cliente. Há questão trabalhista associada.
    - Fontes: `docs/00-contexto-produto.md`, `docs/referencia/i18n-levantamento.md`.

15. **Um problema com duas especialidades.** No MVP, cada chamado tem no máximo uma ordem de serviço em andamento, com um responsável (um técnico ou uma equipe). Um problema que pede duas especialidades (por exemplo, elétrica e hidráulica no mesmo banheiro) vira dois chamados. Isso atende?
   - Hoje: dois chamados, um por especialidade. A OS cancelada libera o chamado para outra, e o aceite recusado reabre a mesma OS (Cesar, 29/09/2026).
   - Fontes: `docs/03-decisoes-tecnicas.md` (adendo ao ADR-027), `docs/diario-fase-1a.md` (C3).

16. **Aceite da OS aberta e executada pelo próprio técnico.** Um problema que o técnico acha e resolve sozinho (por exemplo, numa ronda) vira chamado aberto e OS executada por ele. Essa OS precisa do aceite de outra pessoa, ou pode ter aceite automático com a foto de depois?
    - Hoje: quem abriu e executa não aceita nem reabre; decide o Gerente do hotel e, sem Gerente ativo no hotel, o Gestor CSC ou o Admin do grupo (Cesar, 30/09/2026). Se o cliente quiser o aceite automático, ele entra como política configurável, desligada por padrão.
    - Fontes: `docs/03-decisoes-tecnicas.md` (ADR-027, bloco da C6, item 8), `docs/05-plano-fase-1a.md` (C6 e perguntas para a reunião), `docs/diario-fase-1a.md` (Gerente único no aceite).

## Piloto e implantação

17. **Datas e hotéis do piloto.** Quais hotéis e quando? O plano prevê 2 a 3 hotéis e rollout em ondas de cerca de 10; a confirmação é depois de 01/10.
    - Fontes: `docs/00-contexto-produto.md`, `docs/04-plano-fase-0.md`, `docs/diario-fase-0.md`.
18. **Protótipo.** Validar o protótipo de telas, feito fora do repositório, de onde vem o layout definitivo.
    - Fontes: `docs/05-plano-fase-1a.md`, `docs/diario-fase-0.md`.

## Jurídico e dados

19. **Contato de segurança.** Quem é o contato de segurança do cliente para incidentes? Quais prazos e texto de aviso entram no contrato (cliente controlador, EasyGov operadora)?
    - Fonte: `docs/07-resposta-a-incidente.md`.
20. **Leitura de dados do proprietário.** A leitura de dados pessoais do proprietário (pessoa física) precisa ficar registrada?
    - Hoje: só a escrita é auditada; a leitura aparece nos logs, com a retenção do plano.
    - Fontes: `docs/04-plano-fase-0.md`, `docs/diario-fase-0.md`.
21. **Termos e privacidade.** Termos de uso e política de privacidade só em pt-BR, ou também nos outros idiomas?
    - Fontes: `docs/referencia/i18n-levantamento.md`, `docs/04-plano-fase-0.md`.

## Preventiva e implantação (fase 1b)

22. **Periodicidade da preventiva.** Quais periodicidades o cliente usa hoje (dias, semanas, meses)? Existe preventiva por uso, como horas de funcionamento?
    - Hoje: o plano da 1b prevê só a preventiva por tempo, como no `docs/00`. A preventiva por uso ficaria para depois do MVP.
    - Fonte: `docs/12-plano-fase-1b.md` (P2).
23. **Preventiva atrasada.** Quando uma OS preventiva atrasa, o sistema gera de novo a que passou ou só a próxima?
    - Fonte: `docs/12-plano-fase-1b.md` (P3).
24. **Etiqueta de QR.** Qual o tamanho da etiqueta, o que vai impresso nela e que impressora a equipe usa na implantação?
    - Fonte: `docs/12-plano-fase-1b.md` (M3).

## Fora da reunião

- Vender fora do Brasil (GDPR, parecer jurídico local, `docs/referencia/i18n-levantamento.md`) é decisão comercial da EasyGov e não depende do piloto da Slaviero.
