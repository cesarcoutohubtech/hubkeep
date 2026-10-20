# HubKeep — operação comercial HubSpot + n8n: auditoria e gates

**20/10/2026 · Responsável: Agente MKT/Comercial · Trabalho interno, nenhum disparo autorizado**

## Auditoria comprovada no HubSpot

Portal consultado por conector autorizado:

| Indicador | Evidência observada |
|---|---|
| Empresas no CRM | 22 registros (20 da base HubKeep `HK-R###`, além de dois registros corporativos do portal) |
| P1 / P2 HubKeep | 7 / 13 |
| Contatos pessoais | 3 (1 interno, 2 exemplos do HubSpot; **nenhum decisor P1 validado**) |
| Negócios (`DEAL`) | 0 — não criar negócios fictícios durante pesquisa |
| Tarefas | 22 (20 de descoberta do HubKeep, 2 amostras), **todas com status NOT_STARTED**; as vinte de descoberta tinham prazo 19/10 |
| Pipeline | `HubKeep Comercial`, 11 etapas: Pesquisa, Qualificação, Decisor encontrado, Abordagem aprovada, Contatado, Descoberta, Demo, Proposta, Negociação, Ganho, Perdido |
| Campos personalizados | `hk_rede_id`, `hk_prioridade_pesquisa`, `hk_cmms_status`, `hk_evidencia_url`, `hk_status_qualificacao`, `hk_proxima_acao` e outros verificados |
| Landing pages | 0 no portal consultado |
| Campanhas comerciais efetivas | Nenhuma constatada nesta auditoria; 2 e-mails publicados pertencem a tickets de suporte, não a prospecção HubKeep |

**Interpretação:** CRM e tarefas estão implantados; nenhum avanço do primeiro contato está comprovado. Não inferir que houve conversa, demo ou negociação por existir uma tarefa.

## Fluxo n8n preparado — sem prova de homologação

Artefato anterior na Biblioteca: `HubKeep_Missao01_n8n_Fila_Comercial.json` (workflow `HubKeep Missao 01 - Fila comercial e minutas para revisao`).

Inspeção do arquivo:
1. Acionamento `manualTrigger`; nó Code com 20 pares `hk_rede_id` / `company_record_id` e referências de tarefas.
2. `HTTP Request` autenticado pelo tipo `hubspotOAuth2Api`, executando **GET** de Companies — sem nós de atualização.
3. Nó Code exige 20 empresas distintas, `HK-R###` correspondente, `P1/P2` válido e ordena P1 antes de P2.
4. Saída gera minutas **sem destinatário confirmado** e com `aprovacao_envio=pendente_de_revisao_humana`, `envio_automatico_habilitado=false`, `crm_write_executed=false`, `external_send_executed=false`.
5. `active=false`. Não há nó SMTP, Gmail, WhatsApp ou transmissão externa.

**Riscos detectados antes de implantação**:
- IDs de Companies e Tasks estão fixos no arquivo; são adequados como referências para validar a onda 1, **não** para crescer para 100 contas sem busca/deduplicação confiável.
- A credencial esperada pelo workflow (`hubspotOAuth2Api`) precisa ser compatível com a credencial efetivamente aprovada/salva no n8n; não colar segredo no GitHub, no chat ou no arquivo exportado.
- O workflow foi localizado como **artefato preparado**; não há prova nesta auditoria de importação, execução real no workspace ou 20/20 leituras com saída revisada.
- O projeto n8n `hubkeep` existe (comprovado por comunicações de ativação e manutenção da instância), mas **a existência da instância não comprova que este workflow esteja ativo ou homologado**.
- Como `GET` não tem efeitos de CRM, a fila gera apenas um snapshot local. Upsert de Companies, atualização de Tasks e registro de aprovação **não** estão implementados nesse fluxo e exigem desenho separado.

## Gates antes da primeira execução no workspace

- [ ] Operador verificar que o workflow importado tem **apenas** os quatro nós de leitura/preparação descritos; nenhuma chamada de envio/CRM write.
- [ ] Validar a credencial do tipo esperado contra o HubSpot conectado, **sem copiar tokens**, somente com teste GET de registro autorizado.
- [ ] Verificar leitura de **20 empresas distintas**: 7 P1 e 13 P2; rejeitar arquivadas, ids divergentes e falhas parciais (não tratar erro como sucesso).
- [ ] Conferir que nenhuma minuta possui destinatário confirmado e que **todas** mantêm aprovação pendente.
- [ ] Rodar o fluxo duas vezes e confirmar ausência de alterações em Companies/Tasks, sem envio.
- [ ] Registrar no HubSpot (após autorização para alterações do CRM) evidências, próximos passos e datas; não atualizar campos automaticamente sem supervisão.
- [ ] Para a versão escalável: dados por consulta filtrada no CRM, cursor/paginação, checkpoint de processamento, fila durável idempotente, gestão de consentimento/opt-out e aprovação individual antes do nó de envio.

**Se o n8n ainda não estiver autenticado, não tentar login automatizado por sessões presumidas.** Solicitar autenticação manual segura do operador em perfil apropriado, sem compartilhar credenciais.

## Proposta de alterações no CRM — AGUARDA aprovação explícita

Em vez de criar novos contatos/deals, propor somente enriquecer **as sete Companies P1 existentes**:
- atualizar `hk_evidencia_url` com **URL institucional oficial**, verificando primeiro o valor atual;
- registrar `hk_proxima_acao` como pergunta precisa de descoberta, sem atribuir dor ou orçamento não verificados;
- atualizar data de conferência **apenas depois** de efetivar a validação;
- preservar `hk_status_qualificacao=pesquisa`, `hk_cmms_status` não confirmado e a prioridade P1;
- manter tarefas existentes vinculadas, **sem duplicatas** e sem disparos.

A ferramenta de escrita do HubSpot exige tabela de **valor atual → novo valor** e confirmação explícita do usuário antes de atualizar qualquer registro. Esta PR **não escreve nada no HubSpot**.

## Checklist de oferta — faltas para começar a vender

- [ ] Aprovação do **ICP final**, argumentos de venda e matriz de recursos já disponíveis **vs. planejados**.
- [ ] Página comercial em domínio público, voltada à rede e ao hotel independente; formulário e atribuição ao CRM com consentimento.
- [ ] Demonstração guiada com dados fictícios, revisão de marca e claims; **mock ≠ produto em produção**.
- [ ] Planos e precificação comercial aprovados, proposta e contrato; integração PMS opcional.
- [ ] Pipeline: primeiro contato aprovado, resposta, reunião, demo, proposta, ganho/perdido; dashboard de contas, CAC e MRR.
- [ ] Ampliar amostra a 100 contas: 70 redes + 30 independentes, evitando contatos falsos e scraping não autorizado.
- [ ] Estudos de caso: somente números de pilotos efetivamente medidos e com autorização de uso de marca.
- [ ] Para avaliações de hóspedes, fonte licenciada/autorizada e análise jurídica/LGPD antes de armazenamento/classificação por IA; nenhuma inferência causal de ROI.

## Ponto de retomada

1. PR de documentação comercial revisado, main verde e merge aprovado/concluído.
2. Preparar quadro de mudanças proposto para as **sete Companies P1**, mostrando diffs por propriedade para confirmação do Cesar.
3. Concluir acesso autenticado ao n8n e executar **somente** o workflow manual de leitura, sem CRM writes/envios.
4. Validar individualmente decisores e canais por fontes públicas, apresentar as sete minutas para aprovação antes de eventual contato.
5. Nenhuma etapa de Mews/TOTVS, migração, trabalho de CTO ou alteração técnica do HubKeep faz parte desta missão.
