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

### Auditoria geral (decisão do Cesar de 07/10/2026)

| O quê | Aceite |
|---|---|
| Tela só de leitura com toda a auditoria que o usuário enxerga. Filtros por período, hotel, tipo de registro, ação e pessoa, com paginação e exportação CSV. Reaproveita a tradução de ações e campos do histórico por registro (D1, `packages/dominio/src/auditoria.ts`). | O escopo de cada papel continua vindo da RLS: auditoria com hotel, só dos hotéis do usuário; auditoria sem hotel, só para o Admin do grupo e o Implantador, como no ADR-021. O CSV traz o mesmo que a tela, nos mesmos filtros. Paginação estável por cursor. Ações e campos traduzidos nos quatro idiomas. |

## Preparação do piloto

O piloto só começa depois da 1c, que traz o e-mail próprio e a recuperação de senha (`docs/piloto/README.md`, respostas do Cesar de 08/10/2026).

- **Segurança:** MFA obrigatório para Admin do grupo, Gestor CSC e Implantador; CSP de script no app do técnico; limite de requisições.
- **Desempenho:** metas da P1 cumpridas no build de produção.
- **Produção (F0-12):** domínio, Vercel Pro, Supabase de staging e produção, deploy, e-mail com DNS, PITR, SSL obrigatório.
  - A parte de **staging** vem antes do treinamento dos hotéis, e não só antes do piloto: o treinamento acontece no staging, e não no dev (resposta 2 do Cesar, 08/10/2026).
- **Provisionamento de cliente:** script do backoffice que cria o grupo, o contrato de licença, o primeiro Admin e os padrões (situações, prioridades, categorias e políticas). Reaproveita o primeiro passo do kit de teste (resposta 4 do Cesar, 08/10/2026).
- **Kit de teste por turma:** opção que cria um grupo de demonstração novo por turma, com e-mails próprios, sem apagar nada (resposta 3 do Cesar, 08/10/2026).
  - O kit e o script de provisionamento aceitam o staging (pergunta 10 do `docs/piloto/README.md`, confirmada pelo Cesar em 08/10/2026). Hoje o script do kit recusa o que não é o dev, e o ADR-024 limita a secret key fora da Vercel: o ajuste entra com um adendo ao ADR-024.
- **Implantação:** agente instalado na rede do cliente, carga dos ativos críticos, etiquetas, treinamento por papel (`docs/piloto/`).
- **Ajustes do teste manual do Cesar:** lista de responsáveis só com técnicos do hotel; prioridades realistas nos dados de demonstração.
