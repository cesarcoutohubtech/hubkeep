# 00 — Contexto de produto

Resumo para o desenvolvimento. A visão consolidada do projeto está no `docs/referencia/documento-projeto.md`, revisada em 07/10/2026 e atualizada a cada mudança de escopo. As decisões de produto estão no Registro de decisões, que fica fora do repositório. As decisões de 07/10/2026 em diante também estão em `docs/referencia/registro-de-decisoes.md`. As decisões de engenharia ficam nos ADRs do `docs/03`.

## O que é

O HubKeep é a plataforma de operação de manutenção para redes hoteleiras multi-propriedade, oferecida pela EasyGov. O pacote de fundação o chamava de "Central de Manutenção EasyGov — CSC"; o nome mudou pelo ADR-012. O produto não é "um sistema de OS melhorado". O que ele vende é a central de manutenção da rede enxergando e governando todos os hotéis, cada um com as suas regras.

O primeiro cliente é o grupo Slaviero, com mais de 40 hotéis em 28 cidades, tratado como design partner. Toda exigência dele vira configuração ou política (regra 7 do `CLAUDE.md`). O produto funciona sem nenhuma integração: o sistema hoteleiro, o EasyGov e as fontes de feedback só acrescentam contexto.

**Piloto:** 4 hotéis escolhidos para cobrir a matriz de modelos: um urbano próprio, um Slim, um administrado e um arrendado (decisão de 07/10/2026, que substitui "2 a 3 hotéis"). Depois do piloto vem o rollout em ondas. Os critérios de aceite do piloto, medidos e não declarados, estão no documento do projeto.

## Objetivos do MVP

- Acompanhar cada chamado corretivo da abertura ao aceite, com SLA medido por hotel e calendário por categoria.
- Executar planos preventivos por ativo, com geração automática de ordens de serviço.
- Dar à central visão consolidada do grupo e a cada hotel, proprietário ou locador só o que é dele.
- Governar de forma diferente cada modelo de empreendimento: próprio, administrado e arrendado (o arrendado em versão mínima).
- Medir o impacto da manutenção na operação, com UH indisponível e UH-dias perdidos.
- Implantar um hotel novo a partir do pacote da bandeira em até 1 dia, sem contar o levantamento de ativos.
- Aproveitar hotéis e UHs do sistema hoteleiro (TOTVS) sem recadastro, só com leitura.

## Hierarquia e papéis

**CSC**, neste documento, é a equipe central de manutenção do grupo cliente (papel `gestor_csc`), e não o produto.

Grupo (tenant) → bandeira → hotel → local (UH ou área comum) → ativo. O proprietário ou locador se liga a UHs específicas (condo-hotel) ou a um hotel inteiro.

Na revisão de 07/10/2026 entraram dois atributos:
- o **modelo contratual** do hotel: próprio, administrado, arrendado ou afiliado;
- a **edificação** do local (torre, bloco).

O componente, abaixo do ativo, fica para a fase 2.

| Modelo | Papel da central | No MVP |
|---|---|---|
| Próprio | Despacho, SLA, preventiva | Sim |
| Administrado | Igual ao próprio, com prestação de contas; o proprietário vê só o seu ativo | Sim; a aprovação do proprietário fica para a fase 2 |
| Arrendado | Despacho e matriz de responsabilidade entre arrendatária e locador | Versão mínima na 1c |
| Afiliado | Auditoria de padrão e conformidade | Depois do MVP |

| Papel | Escopo | Resumo |
|---|---|---|
| Admin do grupo | Grupo | Ativa hotéis (consome licença), gerencia bandeiras, usuários, papéis e políticas; é o único que desativa membros |
| Gestor CSC | Grupo ou bandeira | Triagem, despacho, acompanhamento e indicadores; decide o aceite quando não há outro gerente |
| Implantador | Hotel, com validade obrigatória | Cadastra locais, ativos, QR e usuários abaixo do próprio papel; não ativa hotel nem libera licença |
| Gerente do hotel | Hotel | Operação do hotel, triagem, aceite e reabertura |
| Técnico | Hotel | Executa a OS no PWA, inclusive sem rede |
| Solicitante | Hotel | Abre chamados e aceita o serviço do chamado que abriu |
| Proprietário ou locador | UHs próprias ou hotel inteiro | Somente leitura do que é dele |

## Fonte de verdade dos dados

| Dado | Quem cadastra | Origem |
|---|---|---|
| Hotéis | Admin do grupo | Staging do sistema hoteleiro (`vw_hubkeep_hoteis`), com fallback por planilha |
| UHs e status | Automático | Sistema hoteleiro, pelo agente conector |
| Bandeiras | Admin do grupo | Manual |
| Usuários e papéis | Admin do grupo e Implantador | Convite por e-mail ou SSO da Slaviero |
| Limite de hotéis e UHs | EasyGov (backoffice) | `licenca.contrato` |

O HubKeep é o sistema de registro da manutenção. A integração com o sistema hoteleiro é só de leitura. Escrever nele (por exemplo, bloquear UH) só entra com mecanismo homologado pela TOTVS, por escrito. No MVP não há integração com o EasyTools. A coluna `app.hotel.easytools_hotel_id` fica reservada (decisão de 24/09/2026, nota no ADR-011) e não é usada.

## Licença

- O conector grava tudo em staging, sem limite.
- A ativação do hotel pelo Admin do grupo checa o saldo. Sem saldo, bloqueia com mensagem clara e avisa a EasyGov.
- UH nova em hotel ativo sem saldo fica `pendente_licenca`: aparece para o admin e não recebe chamados.
- Métrica provisória: UH ativa conta, área comum não conta (pendência comercial).
- Módulos opcionais, como o Intelligence, são contratados por tenant (`licenca.modulo`, fase 1b).

## Escopo do MVP

Multi-idioma desde o MVP (ADR-022):
- interface em pt-BR (idioma-fonte), inglês, espanhol e francês;
- formato regional separado do idioma, e fuso por hotel;
- conteúdo cadastrado e texto livre ficam no idioma em que foram escritos;
- e-mail, push, PDF e exportações saem em pt-BR no MVP.

| Fase | Situação | Conteúdo |
|---|---|---|
| 0 — Fundação | Concluída | Monorepo, RLS com meta-testes, autenticação, API, ingestão, fila de eventos, arquivos, quatro idiomas, PWA offline |
| 1a — Corretiva | Concluída | Ativação de hotel com licença, cadastros, ativos com campos estendidos, anexos, QR, chamado, triagem, OS sem rede, equipamento parado, aceite, histórico; identidade visual (ADR-038) |
| 1b — Instrumentação, preventiva e implantação | Em andamento desde 07/10/2026 | Ver `docs/12` |
| 1c — SLA, notificações, indicadores e arrendado | Planejada | Ver `docs/13` |
| Preparação do piloto | Planejada | Segurança, desempenho, staging e produção (F0-12), implantação e treinamento; ver `docs/13` |

Itens que entraram no MVP na revisão de 07/10/2026:
- modelo contratual do hotel e edificação do local;
- UH indisponível e UH-dias perdidos;
- pacote da bandeira, com implantação em 1 dia;
- calendário de SLA por categoria;
- fotos antes e depois, e assinatura no aceite;
- fornecedor mínimo;
- indicadores ampliados;
- critérios de aceite do piloto.

Decisões de escopo de 26/09/2026 (Cesar), as duas na fase 1c:
- **Impressão da OS**, com fotos, checklist e assinatura, e **exportação CSV** de listas e indicadores. As duas respeitam o escopo do usuário: só sai o que ele enxerga na tela.
- **Indicador de produtividade por equipe e por hotel**, visível para o Gestor CSC e o Gerente do hotel. A visão individual por técnico existe como política e vem **desligada por padrão**; quem liga é o cliente, na configuração.

## Depois do MVP

- **Fase 1d — conformidade legal (a reavaliar antes do rollout):** PMOC, AVCB, SPDA, NR-13, elevadores, reservatórios e afins, com vencimento, responsável e evidência. O formato é um motor genérico de obrigações, mais um catálogo federal e pacotes por estado e município.
- **Primeira integração pós-MVP:** EasyGov e status da UH. A camareira abre o chamado na rotina dela, e a UH volta para inspeção quando a OS fecha.
- **Fase 2:**
  - contexto da UH (ocupação prevista), inspeções com OS automática, WhatsApp;
  - portal do fornecedor, custos e alçadas (inclusive a aprovação do proprietário no administrado), estoque e compras;
  - componente do ativo e histórico completo, relatório ao proprietário;
  - IA de apoio, afiliados;
  - escrita no sistema hoteleiro, só se homologada.
- **Fase 3:** utilidades com sensores, plano de CAPEX, preditiva sobre o histórico acumulado. A preditiva por aprendizado de máquina não é vendida antes disso.

O **HubKeep Intelligence** é um módulo opcional, conduzido pelo Kaio com o agente dele (ADR-033 a 037). A versão 1.0 vem depois da fase 1c e depende da instrumentação do início da 1b.

## Calendário

No ritmo de 07/10/2026, o código do MVP que falta leva de 5 a 8 semanas, contando os itens que entraram nessa data. O calendário real depende de três coisas: a revisão do responsável, o limite de uso do Claude e as respostas do cliente. A pendência que mais pesa é o acesso ao sistema hoteleiro da Slaviero (`docs/referencia/perguntas-cliente.md`).
