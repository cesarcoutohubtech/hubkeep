# HubKeep — Gate operacional comercial pós-PR #351
**20/10/2026 — Somente operação comercial; nenhuma autorização de envio ou CRM write.**

## Evidências confirmadas
- PR #351 mergeado (merge commit `99b1ed20b3a1588f008a6b9669744bdc3206b9cb`).
- CRM consultado: 22 Companies no portal, sendo 20 na base HubKeep e 7 P1.
- As descrições e os campos customizados `hk_proxima_acao`, `hk_evidencia_url` e `hk_status_qualificacao` das sete P1 foram consultados em modo leitura. Não há comprador/decisor confirmado.
- A existência do JSON n8n na Biblioteca não comprova execução no workspace; homologação segue pendente.

## Comparativo real de CRM — **não aplicar alterações sem aprovação**
Todos os valores de `hk_status_qualificacao` são `pesquisa`; todas as sete empresas possuem `hk_evidencia_url` preenchida. Não há motivo para substituir URLs oficiais válidas automaticamente.

| Rede / ID | `hk_proxima_acao` atual (lido do CRM) | Proposta | Decisão recomendada |
|---|---|---|---|
| Falcon / 59121067805 | Confirmar CMMS, centralização e alçada tecnológica. | Identificar decisor e alçada de compra antes de abordagem | Complementar só se aprovado |
| Bristol / 59100503688 | Confirmar software de manutenção; propor medição de recorrência e avaliações. | Remover promessa implícita de mensuração antes de validar o produto; identificar decisor | Revisar com aprovação |
| Tri / 59102366642 | Confirmar central de manutenção e CMMS; contagem de hotéis discrepante. | Acrescentar identificação da área central e responsável de compras | Manter até haver contato validado |
| Nord / 59144772716 | Priorizar rede independente; validar gestão de manutenção e custos. | Identificar quem decide solução para vários empreendimentos | Complementar se aprovado |
| Rede Pires / 59122615116 | Confirmar se decisões de engenharia são da Rede Pires ou das marcas. | Manter investigação da alçada sem pressupor comprador | Sem alteração |
| Master / 59113327537 | Confirmar grupo comprador e autonomia de aquisição; verificar CMMS. | Manter pergunta objetiva sobre grupo comprador | Sem alteração |
| Hot Beach / 59122146165 | Foco Guest Impact em piscinas, água quente, climatização e indisponibilidade. | Identificar responsável pela manutenção e confirmar escopo antes de alegar impacto | Revisar com aprovação |

**Dado confirmado para Hot Beach:** `hk_rede_id=HK-R060`, `hk_evidencia_url=https://hotbeach.com.br/nossos-resorts/`. Nenhuma propriedade alterada na consulta. Em todos os casos, realizar nova leitura imediatamente antes de eventual write e apresentar valor antigo e valor novo exatos.

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
