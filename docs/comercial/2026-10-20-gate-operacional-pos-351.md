# HubKeep — Gate operacional comercial pós-PR #351
**20/10/2026 — Somente operação comercial; nenhuma autorização de envio ou CRM write.**

## Evidências confirmadas
- PR #351 mergeado (merge commit `99b1ed20b3a1588f008a6b9669744bdc3206b9cb`).
- CRM consultado: 22 Companies no portal, sendo 20 na base HubKeep e 7 P1.
- As descrições atuais das sete P1 foram consultadas em modo leitura. Não há comprador/decisor confirmado.
- A existência do JSON n8n na Biblioteca não comprova execução no workspace; homologação segue pendente.

## Proposta para revisão — **não aplicar ainda**
Somente depois de autorização explícita e de nova leitura dos valores dos campos de destino.
| Company ID | Rede | Campo proposto | Valor proposto (sujeito a aprovação) | Situação atual |
|---|---|---|---|---|
| 59121067805 | Falcon Hotéis | hk_proxima_acao | Validar quem controla CMMS, consolidação de manutenção e alçada de contratação | Próxima descoberta já descrita no campo `description`; valor atual do campo customizado ainda precisa de leitura |
| 59100503688 | Bristol Hotéis & Resorts | hk_proxima_acao | Identificar área corporativa que avalia sistemas de manutenção e confirmar plataforma atual | Próxima descoberta já descrita no `description`; campo customizado a ler |
| 59102366642 | Tri Hotéis | hk_proxima_acao | Confirmar área central de manutenção, software em uso e alçada de compra | Próxima descoberta no `description`; campo customizado a ler |
| 59144772716 | Nord Hotels | hk_proxima_acao | Localizar operação/engenharia corporativa e validar centralização de manutenção | Próxima descoberta no `description`; campo customizado a ler |
| 59122615116 | Rede Pires Hotéis | hk_proxima_acao | Identificar responsável pela contratação entre rede, marcas e unidades | Próxima descoberta no `description`; campo customizado a ler |
| 59113327537 | Master Hotéis | hk_proxima_acao | Confirmar alçada de compra, sistema de manutenção e área de operações | Próxima descoberta no `description`; campo customizado a ler |
| Hot Beach (ID a reconfirmar) | Hot Beach Parques & Resorts | hk_proxima_acao | Identificar engenharia corporativa e manutenção de resorts/parque | ID e valor de campo customizado a conferir |

**Não sobrescrever** `description`, `hk_status_qualificacao`, `hk_cmms_status`, tarefas, prioridade ou evidências existentes sem comparar valor anterior e novo. Se um campo já contiver informação mais completa, manter e marcar como sem alteração.

## Homologação segura do n8n — apenas leitura
1. Conferir workspace autenticado, workflow importado e estado inativo.
2. Comparar nós com o artefato `HubKeep_Missao01_n8n_Fila_Comercial.json`. Bloquear qualquer nó de envio ou atualização de CRM.
3. Testar credencial HubSpot OAuth via GET sem revelar tokens. Nunca trocar por credencial genérica sem verificar o tipo exigido.
4. Validar 20 Companies distintas, sete P1, treze P2; rejeitar erro parcial e divergência de IDs.
5. Gerar saídas com `aprovacao_envio=pendente_de_revisao_humana` e `envio_automatico_habilitado=false`.
6. Executar duas vezes e comparar contagem, ordem, Companies e Tasks: zero writes e zero mensagens.
7. Registrar evidências e só então aprovar a evolução para fila idempotente de revisões — sem envio.

## Controle de aprovação das sete minutas
As minutas revisáveis estão no PR #351; para cada conta, antes de enviar: (a) decisor ou canal corporativo validado; (b) texto aprovado; (c) remetente, destinatário e canal aprovados; (d) canal permite oposição/opt-out; (e) claim do produto alinhado à matriz de recursos entregues. **Nada de envios nesta etapa.**

## Próximo artefato comercial
Criar matriz funcional “já disponível / em validação / previsto” para roteiro de demo e landing page; preço, ROI e integrações só podem ser divulgados depois de validação comercial/técnica.
