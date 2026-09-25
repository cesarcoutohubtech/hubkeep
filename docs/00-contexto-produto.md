# 00 — Contexto de produto

Resumo para o desenvolvimento. A fonte de verdade de produto é o `contexto-central-manutencao.md` e o Registro de decisões, mantidos fora do repositório.

## O que é

O HubKeep é a plataforma de manutenção preventiva e corretiva para redes hoteleiras multi-propriedade. (O pacote de fundação o chamava de "Central de Manutenção EasyGov — CSC"; o nome mudou pelo ADR-012.) Posicionamento: plataforma de manutenção para a operação hoteleira brasileira, simples para quem executa e completa para quem gerencia.

Primeiro cliente: grupo Slaviero (40+ hotéis). Implantação com piloto em 2 a 3 hotéis e rollout em ondas de cerca de 10.

## Objetivos do MVP

- Acompanhar cada chamado corretivo da abertura ao aceite, com SLA medido por hotel.
- Executar planos preventivos por ativo, com geração automática de ordens de serviço.
- Dar ao CSC visão consolidada do grupo e a cada hotel ou proprietário só o que é dele.
- Aproveitar hotéis e UHs do TOTVS CM sem recadastro, em modo somente leitura.

## Hierarquia e papéis

**CSC**, neste documento, é a equipe central de manutenção do grupo cliente (papel `gestor_csc`), e não o produto.

Grupo (tenant) → bandeira → hotel → local (UH ou área comum) → ativo. O proprietário ou locador se liga a UHs específicas (condo-hotel) ou a um hotel inteiro.

| Papel | Escopo | Resumo |
|---|---|---|
| Admin do grupo | Grupo | Ativa hotéis (consome licença), gerencia bandeiras, usuários e papéis |
| Gestor CSC | Grupo ou bandeira | Triagem, acompanhamento, indicadores |
| Implantador | Hotel, com validade obrigatória | Cadastra usuários abaixo do próprio papel, ativos, QR, locais; não ativa hotel nem libera licença |
| Gerente do hotel | Hotel | Operação do hotel |
| Técnico | Hotel | Executa OS no PWA |
| Solicitante | Hotel | Abre chamados |
| Proprietário | UHs próprias ou hotel inteiro | Somente leitura |

## Fonte de verdade dos dados

| Dado | Quem cadastra | Origem |
|---|---|---|
| Hotéis | Admin do grupo | Staging do TOTVS (`vw_hubkeep_hoteis`), fallback por planilha |
| UHs e status | Automático | TOTVS CM via agente conector |
| Bandeiras | Admin do grupo | Manual |
| Usuários e papéis | Admin do grupo e Implantador | Convite por e-mail ou SSO da Slaviero |
| Limite de hotéis e UHs | EasyGov (backoffice) | `licenca.contrato` |

O HubKeep é o sistema de registro da manutenção. No MVP não há integração com o EasyTools; a coluna `app.hotel.easytools_hotel_id` fica reservada para ela (decisão de 24/09/2026, nota no ADR-011) e não é usada. No futuro, o EasyTools consome os eventos `hotel.criado` e `hotel.alterado` do HubKeep.

## Licença

- O conector grava tudo em staging, sem limite.
- A ativação do hotel pelo Admin do grupo checa o saldo. Sem saldo, bloqueia com mensagem clara e avisa a EasyGov.
- UH nova em hotel ativo sem saldo fica `pendente_licenca`: aparece para o admin e não recebe chamados.
- Métrica provisória: UH ativa conta, área comum não conta (pendência comercial).

## Escopo do MVP (fase 1)

Multi-idioma desde o MVP: interface em pt-BR (idioma-fonte), inglês, espanhol e francês, com formato regional separado do idioma e fuso por hotel; conteúdo cadastrado e texto livre ficam no idioma em que foram escritos, e e-mail, push, PDF e exportações saem em pt-BR no MVP (ADR-022). Identidade e escopo; cadastros (hotéis e UHs do CM, ativos com campos estendidos e anexos, QR); implantação de ativos (planilha, cadastro pelo celular, modelos por categoria, QR em lote); chamados corretivos com abertura mínima, prioridade padrão por política, registro de equipamento parado e aceite; OS com checklist tipado, horas, fotos e materiais em texto livre; preventiva por tempo com geração automática de OS; políticas com herança grupo → bandeira → hotel; PWA do técnico offline; notificações por e-mail e push; indicadores (backlog, % SLA, MTTR, % preventiva em dia); auditoria; impressão de OS e exportação CSV (proposta).

## Fora do MVP

Fase 2: contexto da UH (ocupação prevista), inspeções com OS automática, WhatsApp, painel de ações, conformidade legal, fornecedores, custos e alçadas, estoque, histórico completo do ativo, saúde por hotel, IA de apoio, escrita no CM (só se homologada). Fase 3: CapEx, automação predial, sensores, preditiva.

## Fases

| Fase | Duração | Foco |
|---|---|---|
| 0 — Descoberta e fundação | 5 a 7 semanas | Fundação técnica, RLS com testes, conector, fila de eventos, protótipo |
| 1a — Corretiva | 5 a 6 semanas | Ativos, chamados, OS, parada, aceite, auditoria, telas de administração |
| 1b — Preventiva e implantação | 5 a 6 semanas | Planos, checklist tipado, geração de OS, importação, QR em lote |
| 1c — SLA, app e indicadores | 4 a 5 semanas | Políticas, notificações, PWA offline, painéis, impressão e CSV |
| Piloto | 4 semanas | 2 a 3 hotéis |

Prazo até o piloto: 19 a 24 semanas. Equipe: 3 desenvolvedores, 1 PO com apoio de UX e QA parcial.
