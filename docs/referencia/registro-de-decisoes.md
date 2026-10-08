# Registro de decisões de produto

O Registro de decisões de produto é mantido fora do repositório. Este arquivo copia as decisões de 07/10/2026 em diante, para o desenvolvimento ter a mesma referência. Decisão nova de produto entra aqui, com a data, o motivo e o status. As decisões de engenharia ficam nos ADRs do `docs/03`.

## Revisão de 07/10/2026

Fonte: `docs/referencia/documento-projeto.md`, seção "Registro de decisões da revisão".

| Decisão | Motivo | Status |
| --- | --- | --- |
| Entram no MVP: modelo contratual do hotel; edificação como atributo do local; UH indisponível e UH-dias perdidos; pacote da bandeira com implantação em 1 dia; calendário de SLA por categoria; fotos antes e depois e assinatura no aceite; fornecedor mínimo; indicadores ampliados; critérios de aceite do piloto | Itens da proposta inicial sem decisão registrada, baratos e de alto valor | Aprovada |
| Arrendado em versão mínima na 1c | A Slaviero terá hotéis arrendados no piloto | Aprovada |
| Piloto em 4 hotéis cobrindo a matriz: urbano próprio, Slim, administrado e arrendado | Testar a matriz inteira | Aprovada; substitui "2 a 3 hotéis" |
| Reavaliar a conformidade legal como fase 1d, antes do rollout | Maior valor percebido pela central na proposta inicial | Aprovada para reavaliação |
| Integração com o EasyGov e reconciliação do status da UH como primeira entrega pós-MVP | Diferencial competitivo apontado na proposta inicial | Aprovada |
| Componente do ativo na fase 2 | Fora do essencial do piloto | Aprovada |
| Fila de aprovação de ativos cadastrados pelo celular na 1b; tela de auditoria geral na 1c | Telas do mock fora do plano | Aprovada |
| Fase 1b liberada, começando pela instrumentação; teste manual concluído no visual novo | O essencial foi validado; as telas restantes acabaram de ser refeitas | Aprovada |
| P1 de desempenho aprovada, com metas por tela | Diagnóstico com medições | Aprovada |
| ADR-038 (identidade visual do mock) | Mock completo, já usado nas apresentações | Aprovada |
| ADRs da Intelligence com aprovação do Cesar e duas condições (versão de política e fórmula no resultado diário; hash fora da função pura) | Intelligence 1.0 | Aprovada pelo Cesar; aguarda Kaio onde aplicável |
| O documento do projeto é a visão consolidada, atualizada a cada mudança de escopo | Uma referência única para o Cesar, o Kaio e o cliente | Aprovada |

## Ordem da instrumentação (08/10/2026)

Decisão do Cesar de 08/10/2026. A instrumentação vai em oito PRs de zona protegida, um por vez:
1. ativo;
2. hotel e local;
3. fornecedor mínimo;
4. chamado e OS;
5. transições da OS;
6. códigos de falha, causa e solução;
7. `licenca.modulo`;
8. foto antes ou depois e assinatura.

Os itens 2, 3, 4 e 8 só começam depois da aprovação do desenho. Depois do item 7, a fila abre para as tabelas do Intelligence. O detalhe está no `docs/12`.
