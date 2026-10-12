# 13 — Plano da fase 1c (SLA, notificações, indicadores e arrendado) e preparação do piloto

Primeira versão de 08/10/2026, a partir da revisão de escopo de 07/10/2026 (`docs/referencia/documento-projeto.md`). Lista o que entra, sem o detalhe de tarefa: o detalhe, com aceite, migrações e ADRs, sai numa proposta para a aprovação do Cesar quando a 1b estiver perto do fim, como foi com o `docs/12`.

## Fase 1c

| Item | Conteúdo | Origem |
| --- | --- | --- |
| Políticas | Nível bandeira na herança grupo → bandeira → hotel | Plano original |
| Calendário de SLA | Por categoria ou prioridade (24x7 ou horário de atendimento), no fuso do hotel, com feriados nacionais, regionais e do hotel | Plano original; o recorte por categoria é novo (07/10) |
| Monitor de SLA | Alerta de prazo perto de vencer e escalonamento à central | Plano original |
| Comunicação | E-mail próprio com domínio de envio, notificações, push no celular, recuperação de senha | Plano original |
| Painel de indicadores | Backlog e backlog por idade, % de SLA, MTTR, % de preventiva em dia, razão preventiva/corretiva, UH-dias perdidos, comparação entre hotéis da mesma bandeira, produtividade por equipe e hotel | Plano original; razão, backlog por idade, UH-dias e comparação são novos (07/10) |
| Impressão e exportação | OS com fotos, checklist e assinatura; exportação CSV respeitando o escopo | Plano original (26/09) |
| Auditoria geral | Tela só de leitura com filtros e exportação (detalhe abaixo) | Decisão de 07/10 |
| Arrendado mínimo | Matriz de responsabilidade por hotel e categoria (arrendatária ou locador), OS marcada com o responsável, locador com acesso de leitura, notificação com registro de data | Novo (07/10) |
| Idiomas | Catálogo completo nos quatro idiomas, com tradução profissional | Plano original |

### Decisões da paridade com o mock (Cesar, 10/10/2026)

As sete decisões de `docs/referencia/paridade-mock-1c.md` ("Decididas antes de implementar"), aprovadas pelo Cesar em 10/10/2026 conforme as recomendações. Valem quando a 1c começar e entram no detalhe de tarefa da proposta da 1c.

| # | Decisão | Onde entra |
|---|---|---|
| 1 | MTTR da abertura até o serviço concluído, pelas transições da OS (`app.os_transicao`, I5). O tempo até o aceite pode virar indicador à parte. | Painel de indicadores |
| 2 | "Aguardando peça" não pausa o SLA por padrão. A pausa é opção da política por categoria, e a ficha mostra o tempo pausado. Segue o adendo ao ADR-027, aprovado pelo Cesar em 10/10/2026: a pausa lê o estado da OS, e não a situação. | Calendário de SLA |
| 3 | Escalonamento com herança completa: hotel, bandeira e grupo. | Monitor de SLA; Políticas |
| 4 | Meta de SLA como política, com padrão de 90%. | Painel; Painel de indicadores |
| 5 | "Últimos eventos" lidos da auditoria ao abrir o painel e a cada 60 segundos, sem o selo "ao vivo". O escopo é o da auditoria (ADR-021): sem adendo, o proprietário e o locador não leem auditoria. | Painel |
| 6 | Gráficos do painel (abertos por dia, abertos × encerrados, onde mais quebra) e "chamados por 100 UHs" entram na 1c. | Painel; Painel de indicadores |
| 7 | Separador do CSV pelo formato regional de quem exporta, mantendo o BOM. | Impressão e exportação; Auditoria geral |

### Auditoria geral (decisão do Cesar de 07/10/2026)

| O quê | Aceite |
|---|---|
| Tela só de leitura com toda a auditoria que o usuário enxerga. Filtros por período, hotel, tipo de registro, ação e pessoa, com paginação e exportação CSV. Reaproveita a tradução de ações e campos do histórico por registro (D1, `packages/dominio/src/auditoria.ts`). | O escopo de cada papel continua vindo da RLS: auditoria com hotel, só dos hotéis do usuário; auditoria sem hotel, só para o Admin do grupo e o Implantador, como no ADR-021. O CSV traz o mesmo que a tela, nos mesmos filtros. Paginação estável por cursor. Ações e campos traduzidos nos quatro idiomas. |

## Preparação do piloto

O piloto só começa depois da 1c, que traz o e-mail próprio e a recuperação de senha (`docs/piloto/README.md`, respostas do Cesar de 08/10/2026).

- **Segurança:** MFA obrigatório para Admin do grupo, Gestor CSC e Implantador; CSP de script no app do técnico; limite de requisições.
- **Desempenho:** metas da P1 cumpridas no build de produção.
- **Produção (F0-12):** domínio, Vercel Pro, Supabase de staging e produção, deploy, e-mail com DNS, PITR, SSL obrigatório.
  - A parte de **staging** vem antes do treinamento dos hotéis, e não só antes do piloto: o treinamento acontece no staging, e não no dev (resposta 2 do Cesar, 08/10/2026). Quando, exatamente, está no portão do staging, abaixo.
- **Provisionamento de cliente:** script do backoffice que cria o grupo, o contrato de licença, o primeiro Admin e os padrões (situações, prioridades, categorias e políticas). Reaproveita o primeiro passo do kit de teste (resposta 4 do Cesar, 08/10/2026).
- **Kit de teste por turma:** opção que cria um grupo de demonstração novo por turma, com e-mails próprios, sem apagar nada (resposta 3 do Cesar, 08/10/2026).
  - O kit e o script de provisionamento aceitam o staging (pergunta 10 do `docs/piloto/README.md`, confirmada pelo Cesar em 08/10/2026). Hoje o script do kit recusa o que não é o dev, e o ADR-024 limita a secret key fora da Vercel: o ajuste entra com um adendo ao ADR-024.
- **Implantação:** agente instalado na rede do cliente, carga dos ativos críticos, etiquetas, treinamento por papel (`docs/piloto/`).
- **Ajustes do teste manual do Cesar:** lista de responsáveis só com técnicos do hotel. As prioridades realistas nos dados de demonstração já entraram (7bac32e).

### Portão do staging (decisão do Cesar de 12/10/2026)

O staging fica para o ponto do projeto em que não dá mais para avançar sem ele (Cesar, 12/10/2026). Esse ponto é **o fim da 1c no dev, antes de qualquer passo que precise de um endereço publicado**. Até lá, só existe o dev, e nada é criado na Vercel nem no Supabase além dele. Os custos do staging (cerca de US$ 45 a 55 por mês) também só começam no portão.

**O que anda sem o staging:**
- toda a 1b e toda a 1c, no dev, com o app rodando no notebook;
- os scripts de provisionamento e do kit por turma (#196), que já aceitam o staging assim que o `[remotes.staging]` existir no `supabase/config.toml`, sem mudança de código.

**O que para no portão, porque precisa do staging:**
- o treinamento dos hotéis, que acontece no staging (resposta 2 do Cesar, 08/10/2026), com o kit por turma;
- a instalação do PWA no Android e no iOS, que pede HTTPS fora do `localhost` (F0-11, ADR-025), e o push no celular conferido no aparelho;
- os crons rodando sozinhos num ambiente publicado (outbox, promoção, Intelligence, preventiva da PV3 e monitor de SLA da 1c). No dev, eles são chamados à mão;
- o e-mail com links para um endereço público (convite e recuperação de senha), com o domínio e o DNS.

**Ordem a partir do fim da 1c:**
1. portão do staging: os passos 1 a 15 de `docs/referencia/plano-staging-treinamento.md`, começando pela aprovação das cinco decisões do plano e do adendo ao ADR-024, e pelo PR de zona protegida com o `[remotes.staging]`;
2. conferência do roteiro e do PWA no aparelho, no staging;
3. treinamento das turmas;
4. produção e piloto, com o mesmo roteiro.

Se alguma tarefa antes do fim da 1c passar a depender de um endereço publicado, o agente para e avisa o Cesar, em vez de antecipar o staging.

**Propostas de 12/10/2026, para a aprovação do Cesar:** o desenho do calendário de SLA, do arrendado mínimo, dos indicadores e da auditoria geral está em `docs/referencia/propostas-desenho-1c.md`; o plano do staging do treinamento, com os custos, em `docs/referencia/plano-staging-treinamento.md`, para o portão do staging.
