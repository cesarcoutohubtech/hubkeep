# PRD — HubKeep Guest Care | PWA do hóspede
**Versão:** 0.1 · **Data:** 13/10/2026 · **Situação:** proposta para análise e aprovação, NÃO autorizada para implementação
**Produto:** HubKeep (módulo opcional) · **Público:** hotéis, resorts e ambientes com visitantes
**Referências:** `docs/00-contexto-produto.md`, `docs/referencia/prd-hubkeep-intelligence-v1.md`, ADR-002, ADR-006, ADR-022, ADR-025, ADR-033–037 e `CLAUDE.md`.

## 1. Problema e oportunidade
Falhas percebidas durante a permanência podem se tornar reclamações posteriores mesmo quando o hotel mantém ordens de serviço e SLAs. O hóspede precisa de um canal de baixo atrito, sem baixar aplicativo e sem criar conta, para notificar o hotel, receber retorno confiável e acompanhar a solução. A equipe precisa receber a ocorrência diretamente no seu fluxo de manutenção; os gestores precisam aprender com reincidências e a efetividade do atendimento.

**Tese a validar:** identificar e tratar problemas durante a estadia pode melhorar a experiência e reduzir reincidências de reclamações. Não prometer aumento de notas, retenção ou receita sem piloto e comparação metodologicamente válidos.

## 2. Metas, público e escopo
- **Meta principal:** reduzir o intervalo entre percepção do problema, registro, reconhecimento humano, intervenção e confirmação do hóspede.
- **Usuários:** hóspede/visitante, recepção, gerente do hotel, técnico, CSC corporativa.
- **Produto independente do PMS e EasyGov:** essas integrações oferecem contexto, mas não bloqueiam a jornada essencial.
- **Foco:** problemas físicos, instalações, manutenção e conservação em UH e áreas comuns. Pedidos não técnicos podem ser direcionados a uma fila humana configurada, sem transformar HubKeep em CRM/concierge universal.
- **Primeira entrega pós-MVP:** não entra na fase 1b/1c nem altera o escopo fechado do piloto. `CLAUDE.md` proíbe IA no MVP atual.
- **Não objetivos:** reservas, check-in, faturamento, compras, marketing, reputação, resposta a avaliações externas, pesquisa pública indiscriminada ou gestão completa de relacionamento com hóspedes.

## 3. Jornada navegável
1. **QR público da UH ou ambiente:** abre PWA responsivo, com nome do hotel e ambiente associado. Não pressupõe ocupação confirmada, identidade nem autorização do leitor.
2. **Acolhimento:** opções "Informar problema", "Acompanhar solicitação" e "Preciso de ajuda urgente"; opção de idioma pt-BR/en/es/fr (ou fallback configurável).
3. **Relato:** texto livre, categorias em botões, foto opcional, confirmação do local e informação mínima para retorno. Não exigir nome, número de reserva ou cadastro por padrão.
4. **Resposta imediata da IA:** confirma recebimento somente depois da persistência; faz, no máximo, perguntas objetivas que realmente melhorem o encaminhamento. Não inventa prazo nem profissional designado.
5. **Registro operacional:** caso de atendimento do hóspede gera/associa chamado do núcleo quando classificado como manutenção; o sistema usa políticas do hotel e evita duplicações verificáveis, sem suprimir relatos distintos.
6. **Acompanhamento:** número de protocolo, estados públicos coerentes e atualizações quando eventos do núcleo forem persistidos; possibilidade de enviar informação adicional.
7. **Conclusão declarada pela equipe:** avisar "A equipe informou que finalizou"; perguntar ao hóspede se o problema foi resolvido. Encerramento operacional e confirmação do hóspede são estados distintos.
8. **Pós-solução:** confirmar, reabrir ou indicar que o atendimento não resolveu; registrar percepção opcional com finalidade operacional, sem manipular a coleta de avaliações públicas.
9. **Sem retorno ou prazo ameaçado:** escalonamento configurável para gerente/recepção/CSC e opção clara de contato humano.

### Exemplo de conversa — ilustração
- Hóspede: "O ar-condicionado está fazendo muito barulho".
- Assistente: "Recebi sua mensagem sobre o barulho do ar-condicionado na UH 304. Vou encaminhar ao hotel e acompanhar por aqui. Posso perguntar se o aparelho ainda está funcionando?"
- Sistema, depois do registro: "Solicitação #GC-1042 registrada."
- Equipe conclui a OS: "A equipe registrou que o atendimento foi concluído. O problema foi resolvido?"
- Hóspede: "Não." → caso reaberto ou encaminhado à triagem, sem informar resolução efetiva.

## 4. Requisitos funcionais
| ID | Requisito | Prioridade |
|---|---|---|
| GC-01 | Configuração de canal do hóspede por hotel, com políticas herdáveis; desligado por padrão | P0 |
| GC-02 | QR público próprio por ambiente, distinto do QR autenticado dos ativos | P0 |
| GC-03 | Landing PWA responsiva, WCAG AA e quatro idiomas, sem login obrigatório | P0 |
| GC-04 | Registro do relato e anexos opcionais com protocolo e idempotência | P0 |
| GC-05 | Triagem determinística de urgência/roteamento disponível sem IA | P0 |
| GC-06 | Assistente IA opcional para acolher, classificar, resumir e pedir detalhes | P0 pós-MVP |
| GC-07 | Encaminhar com rastreabilidade a chamado de manutenção ou fila humana | P0 |
| GC-08 | Visão da equipe com origem "hóspede" e vínculo ao caso, preservando auditoria | P0 |
| GC-09 | Notificar responsável por evento/outbox, com escalonamento configurável | P0 |
| GC-10 | Atualizações ao hóspede baseadas em eventos reais do sistema | P0 |
| GC-11 | Token de acompanhamento limitado a um caso; expiração e revogação | P0 |
| GC-12 | Separar conclusão técnica, aceite operacional e confirmação de percepção do hóspede | P0 |
| GC-13 | Reabertura/insatisfação pós-solução com nova triagem e histórico | P0 |
| GC-14 | Canal de emergência com instrução de procurar atendimento humano imediato | P0 |
| GC-15 | Análise de reincidência do caso por UH/ativo quando associação confirmada | P1 |
| GC-16 | Foto/áudio opcionais quando houver consentimento e armazenamento seguro | P1 |
| GC-17 | Vínculo com reserva ou ocupação por PMS homologado, sem dependência | P2 |
| GC-18 | Canais complementares (WhatsApp, SMS, push) por política e consentimento | P2 |
| GC-19 | Pesquisa de satisfação contextual após encerramento, separada de review público | P1 |
| GC-20 | Relatório agregado e exportação com controles de acesso | P1 |

## 5. Máquina de estados e eventos
**Caso público:** `recebido` → `em_triagem` → `encaminhado` → `em_atendimento` → `conclusao_informada` → (`confirmado_resolvido` | `nao_resolvido` | `sem_resposta`).
- `nao_resolvido` habilita reabertura/triagem segundo política, com histórico imutável.
- `sem_resposta` não equivale a `confirmado_resolvido`.
- Estados da OS/chamado do núcleo NÃO são substituídos; o caso guarda sua projeção pública e vincula os IDs que existirem.
- Eventos de entrada, roteamento, resposta humana, conclusão e feedback sempre com auditoria e outbox em unit of work.
- Não usar IA para alterar prioridade crítica ou fechar uma OS sem política e confirmação humana.

## 6. Segurança, privacidade e LGPD (críticos)
- QR da UH é **localizador não autenticado**, não prova de hospedagem. Nunca revelar nome do ocupante, reserva, histórico técnico, número de telefone ou casos anteriores ao abrir o QR.
- Separar permissões públicas de papéis internos. **Não criar "solicitante" interno por hóspede nem abrir RLS de `app` ao `anon`**. O tráfego público entra por endpoint próprio com token de escopo limitado e serviço autenticado com privilégio mínimo; desenho de autenticação/autorização exige ADR e testes de isolamento entre tenants, hotéis, UHs e casos.
- Proteção contra QR adulterado, bots, spam e enumeração: domínio oficial exibido na etiqueta, token não sequencial, validação de origem/contexto, rate limit por IP/contexto, CAPTCHA adaptativo quando necessário, antirreplay, idempotência.
- Rate limiting também no provedor LLM; sanitizar entrada, tratar prompt injection, proibir acesso livre a ferramentas, política de conteúdo e escalonamento humano.
- Fotos em bucket privado, acesso via URL assinada só depois de autorização. Remover metadados sensíveis quando apropriado e prevenir vazamento de imagens.
- Dado mínimo, aviso de privacidade, fundamento legal por finalidade, política de retenção e descarte lógico, trilha de acesso e resposta a titulares; acesso aos dados da hospedagem estritamente delimitado.
- Não enviar dados pessoais ou conversas integrais ao modelo sem necessidade e acordo adequado com fornecedor; decisões de hospedagem não podem ser inferidas por quem só leu QR.
- Formulários de emergência não substituem telefone da recepção, brigada nem serviços de emergência.

## 7. Arquitetura sugerida (sujeita a gap analysis)
- PWA do hóspede separado das rotas autenticadas de `apps/tecnico`; avaliar uso de `apps/web` com uma rota pública isolada ou app próprio; nunca reutilizar automaticamente `/q/:codigo` de ativo.
- Casos de uso e domínio no núcleo para `caso_hospede`, mensagens, correlação e roteamento; a camada Intelligence consome eventos/sinais pelas portas, sem importação inversa (ADR-037).
- Novas tabelas propostas: `app.canal_hospede`, `app.caso_hospede`, `app.mensagem_caso_hospede`, `app.acesso_caso_hospede`, todas multi-tenant, sem privilégios públicos ao schema, RLS forçada, FKs compostas. Nomes NÃO são decisão de esquema.
- Integração opcional via porta com EasyGov (governança) e PMS, jamais gravação direta em PMS não homologado.
- Contratos API Zod, textos no `packages/i18n`, observabilidade e redaction de logs; IA externa atrás de adaptador substituível.
- Resposta pública rápida: falha do LLM não impede registrar o relato e enviar confirmação determinística; fallback para operador humano.
- Análise de custo por caso, latência e resiliência antes do piloto.

## 8. Indicadores e medição
Medir por hotel e grupo com período e denominadores explícitos: taxa de relatos por 100 estadias (somente se houver denominador autorizado), % de relatos com atendimento humano, tempo para reconhecer, tempo para primeiro encaminhamento, tempo para conclusão técnica, confirmação do hóspede, % não resolvido, % reaberturas, % de casos com associação confirmada UH/ativo, e reincidências após intervenção. Não inferir NPS/RevPAR causal ou taxa de reclamações evitadas a partir de solicitações encerradas.

## 9. Critérios de aceite (testáveis)
1. QR da UH 304 não expõe qualquer histórico e não permite ler ou modificar caso de outra UH/hotel/tenant.
2. Ao falhar o LLM, o relato persiste e entra na triagem, com retorno textual padrão.
3. Submissão repetida por perda de rede não cria chamados/casos duplicados.
4. Texto que tenta instruir a IA a consultar outras UHs não obtém dados ou ações indevidas.
5. SLA vencido dispara evento e escalonamento; notificação registra entrega/tentativa, não promete chegada do técnico.
6. Conclusão da OS não confirma automaticamente a satisfação do hóspede.
7. Hóspede pode indicar "não resolvido" e a equipe recebe a reabertura rastreável.
8. Bloqueios de hotel, módulo e políticas desativadas não expõem o portal.
9. Diferenças de fuso e idioma da UH/hotel ficam corretas.
10. Logs e exports não revelam identificadores ou fotos fora do escopo.

## 10. Dependências, responsáveis e aprovação
- **Produto/direção:** aprovar o novo módulo e o limite entre manutenção e serviços de recepção.
- **Núcleo (agente 1b/admin):** contratos de caso, QR público, autenticação segura, fila humana, vínculo a chamados/OS.
- **Agente 1c:** avaliar reaproveitamento de notificações, SLA e escalonamento sem quebrar a 1c.
- **Intelligence (Kaio):** consumir sinais de feedback e associar a UH/ativo, sem mudar os scores atuais sem aprovação de Cesar e Kaio.
- **Segurança/LGPD:** threat model público, privacidade, fornecedores, retenção.
- **Engenharia:** análise de lacunas e divisão em PRs pequenos, cada um com testes de isolamento, auditoria e aceitação.
- **Portão de implementação:** **NÃO iniciar** sem aceite escrito de produto, decisão de fase, ADR de acesso público e alinhamento entre agentes. Este PRD é somente proposta.

## 11. Questões em aberto
A) Permitir relatos sem confirmação de estadia? Proposta: sim, com escopo público mínimo e antiabuso. B) Que tipos de pedido não técnico serão encaminhados à recepção? C) Quem confirma solução e em quanto tempo a sessão expira? D) Quem é controlador dos dados e como se registra a base legal? E) Qual provedor de IA e estratégia de custo? F) Que hotéis participarão do teste? G) Como disponibilizar contato humano 24x7 onde exigido?
