# Consolidado — Evoluções de produto propostas (13/10/2026)
**Estado: documentação para avaliação; NÃO representa aprovação de implementação, alteração do MVP ou do cronograma.**
**Fonte de estado:** leitura da `main` em `60c21b1be6536a727ad6ce05bce322e7dfcf5198`, 13/10/2026.

## Decisões que motivaram esta consolidação
1. HubKeep deve continuar sendo um **CMMS de manutenção predial**, para hotéis, resorts, parques e empreendimentos semelhantes. **Não** se tornar ERP.
2. HubKeep Intelligence é diferencial de explicabilidade, reincidência, efetividade e gestão corporativa; a versão 1.0 existente segue sua implantação normal.
3. **Guest Care**: canal PWA público via QR em UH/área, IA assistente com triagem e retorno, encaminhamento à equipe, acompanhamento e verificação pós-solução.
4. **Room Quality Intelligence**: cruzar histórico técnico da UH, recorrência, indisponibilidade, possíveis inspeções EasyGov e manifestações de hóspedes. Diferenciar dado interno e fonte externa.
5. Lacunas de CMMS generalistas identificadas na comparação conceitual com SGMAN/Sankhya: agenda de equipes, capacidade, horímetro/medidores, MTBF/pareto e integrações corporativas. Não replicar ERP, estoque contábil, compras ou financeiro.
6. O **copiloto conversacional executivo** é uma hipótese de experiência do Intelligence posterior ao 1.0, com respostas sobre dados autorizados; não foi confundido com o assistente do Guest Care. A especificação detalhada fica dependente de validação de demanda e fontes.

## Documentos propostos
- [PRD — Guest Care PWA](prd-guest-care-pwa-v0.1.md): QR público seguro, jornada do hóspede, IA, notificações, evento/OS, confirmação e LGPD.
- [PRD — Room Quality Intelligence](prd-room-quality-intelligence-v0.1.md): painel UH 360, prioridade explicável, integração com Guest Care e EasyGov quando disponíveis.
- [PRD — Core PCM enxuto](prd-core-pcm-enxuto-v0.1.md): calendário, capacidade, medidores, MTBF, Pareto e exportações sem ERP.
- [PRD existente — HubKeep Intelligence](prd-hubkeep-intelligence-v1.md): manter como fonte canônica do Intelligence 1.0 e do Guest Impact 1.5. O RQI depende desse documento, não o substitui.

## Estado do código e pendências identificadas
| Área | Situação auditada | Próxima entrega prevista |
|---|---|---|
| Fundação + corretiva (0, 1a) | Na main: multi-tenant/RLS, ativos, QR interno, chamados, OS, PWA offline | Manter testes e fechar o piloto |
| Preventiva (1b) | Planos e checklists avançados; PV3 geração automática ainda pendente no diário | Worker preventivo, migração e testes; implantação por pacotes/QR em lote pendentes |
| SLA, governança (1c) | Calendário/monitor/auditoria/arrendado avançaram; comunicação, painel e outros itens ainda pendentes | E-mail/push, painel, exportações, testes e implantação |
| Intelligence 1.0 | Motor, job/API e telas em main; histórico de teste e carga ainda com decisões/execução em andamento | Concluir demonstração com histórico e medição do job |
| Intelligence 1.5 | Feedback externo planejado | Só após 1.0 e provedor de IA acordado |
| Guest Care | Não há produto na main; proposta | PRD e teste de UX/segurança depois de aprovação |
| Room Quality | Não há score de UH completo na main; proposta | Definição de indicadores e associação de fontes depois de aprovação |
| PCM adicional | Não localizado na fase 1b/1c como entrega fechada | Validar demanda e priorização pós-MVP |
| Ambiente piloto | Staging somente no portão após 1c | Staging, treinamento, deploy, piloto |

**CI na main:** consultar os checks novamente antes do merge; quando esta análise foi feita os workflows banco, segurança e CI de `60c21b1` estavam verdes. **PRs abertos:** nenhum na consulta anterior à criação desta proposta. O trabalho simultâneo de outros agentes pode mudar esse estado.

## Matriz de prioridade para decisão futura
| Proposta | Valor | Dependência | Recomendação |
|---|---|---|---|
| Guest Care PWA | Muito alto em hotelaria | Fluxos do núcleo, segurança pública, notificação | Priorizar validação de UX e piloto controlado |
| RQI 1.0 | Alto em hotelaria | Intelligence 1.0, dados UH/OS | Definir score com Kaio e Cesar após consolidar 1.0 |
| Agenda visual/capacidade | Alto em hotéis e parques | Preventiva e equipes | Descoberta e protótipo no pós-MVP |
| Preventiva por medidor | Alto em ativos críticos | PV3, política e sensor/leitura | Entrar no roadmap pós-MVP |
| APIs corporativas e BI | Alto para redes | Contratos, autorização e governança | Contrato mínimo de exportação |
| MTBF/Pareto | Médio | Glossário e consistência de dados | Evoluir indicador antes de módulo novo |
| Copiloto para gestores | A validar | Métricas e APIs com evidências | Prova de valor sem alterar o motor |

## Portões de aprovação
1. Validar que este material representa o **escopo desejado**, inclusive a fronteira "não ERP".
2. Aprovar **individualmente** o desenvolvimento e a fase de cada novo item; nenhum PRD autoriza implementar.
3. Mudanças nos princípios, fontes, permissões ou fórmulas do Intelligence precisam da aprovação escrita de Cesar e Kaio, conforme `CLAUDE.md`.
4. Mudanças em áreas protegidas ou no MVP exigem ADR/revisão e respeito à fila única de PRs de zona protegida.
5. Dados de hóspede: revisão LGPD e threat model antes de qualquer endpoint público.
6. Nenhuma promessa comercial de ganhos em notas, receita, retenção ou satisfação antes de um piloto que os meça.
