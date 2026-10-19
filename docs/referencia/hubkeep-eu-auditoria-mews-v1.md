# HubKeep EU — auditoria técnica e preparação Mews v1

**Data:** 15/10/2026 · **Frente:** EU · **Prioridade:** máxima · **Responsável comercial europeu:** **Hub Tech**
**Status:** proposta técnica **para revisão**, não representa aprovação de ADR, implementação, certificação ou contratação.
**Issue de coordenação:** #284. **Ordem PMS aprovada:** Mews → apaleo → Oracle OPERA Cloud.
**Regras:** HubKeep funciona sem PMS; read-only primeiro; não alterar produção, `main`, infraestrutura, segredos ou terceiros sem aprovação específica do Cesar.

## 1. Diagnóstico rastreável da `main`

| Tema | Evidência no repositório | Resultado e consequência |
|---|---|---|
| Back-end e segurança | `CLAUDE.md`, `docs/01-arquitetura.md`, `docs/02-seguranca-multitenant-rls.md` | API `/api/v1`, autenticação, `hk_app`/RLS, `withContext`, UoW/auditoria/outbox. Preservar isolamento por tenant e hotel. |
| Ingestão | `packages/contratos/src/ingestao.ts` | `FONTES=['totvs_cm','planilha']`; `ENTIDADES_EXTERNAS=['hotel','uh']`. Não suporta Mews, estados nem bloqueios. `DadosDeUh` contém somente `hotel`, `nome`, `andar`. |
| Lotes | `packages/aplicacao/src/casos-de-uso/ingestao.ts`, `packages/db/src/repositorios/staging.ts` | Hash canônico do lote, upsert por `(tenant,fonte,entidade,chave)`; útil para snapshot e reconciliação, mas não substitui um cursor incremental/eventos. |
| Promoção | `packages/db/src/repositorios/promocao.ts` | Identifica hotel por `fonte|cod_externo`; local por `hotel_id|cod_externo`; worker cria e atualiza apenas nome/andar da UH. Atenção a códigos repetidos entre propriedades e à imutabilidade do vínculo. |
| Status internos | `packages/contratos/src/locais.ts`, `packages/contratos/src/uh-indisponivel.ts` | `local.status = ativo/pendente_licenca/inativo` é **estado de cadastro/licença**, NÃO estado operacional do quarto. `uh_indisponivel` são períodos operacionais ligados ao fluxo de manutenção. Não sobrescrever automaticamente. |
| Adaptador anterior | `apps/conector/src/adaptadores/totvs.ts`, `apps/conector/src/index.ts` | TOTVS é esqueleto SELECT de views; `executorTotvsNaoConfigurado` falha intencionalmente. Não há API PMS SaaS pronta. |
| Regionalização | `packages/i18n/src/idiomas.ts`, `docs/01-arquitetura.md` | Catálogos `pt-BR/en/es/fr`, formato `pt-PT/en-GB/es-ES/fr-FR` parcialmente previsto; instalações atuais em Vercel `gru1` e Supabase São Paulo. |
| Portão de staging | `docs/referencia/plano-staging-treinamento.md` | Planejamento do staging BR foi adiado pelo Cesar. Não adiantar/alterar esse portão para atender ao projeto UE. |
| Governança | `CLAUDE.md` | Agentes 1b, 1c e Intelligence ativos; PR `eu:` de documentação isolada. Apenas Cesar faz merge, `db push`, `config push` e aprova ADR. |

**Limite da auditoria:** inspeção estática do código e da documentação, **sem executar testes, chamadas autenticadas ao Mews, deploy ou verificação de ambiente**. Não afirmar que algo está pronto ou homologado somente porque consta no desenho.

## 2. Contrato funcional mínimo Mews → HubKeep

### 2.1 Entidades oficiais disponíveis
| Recurso Mews | Endpoint Connector API | Informação | Escopo v1 |
|---|---|---|---|
| Enterprise | `POST /api/connector/v1/enterprises/getAll` | `EnterpriseId` = propriedade PMS | Importar/vincular hotel, controlado pelo Admin HubKeep |
| Resources | `POST /api/connector/v1/resources/getAll` | `Id`, `EnterpriseId`, `Name`, `State`, `Data.Discriminator`, `FloorNumber`, `UpdatedUtc`, `IsActive` | Importar quartos/espaços *elegíveis* após filtro de tipo/categoria e decisão de vínculo |
| Resource blocks | `POST /api/connector/v1/resourceBlocks/getAll` | `AssignedResourceId`, `Type` (`OutOfOrder`, `InternalUse`), `StartUtc`, `EndUtc`, `IsActive` | Mostrar bloqueios separadamente, sem abrir chamado, bloquear quarto ou computar UH-dia automaticamente |
| General webhooks | `ResourceUpdated`, `ResourceBlockUpdated` | Identificadores das entidades alteradas, `EnterpriseId`/`IntegrationId` | Atualização assíncrona com `getAll`; reconciliar periodicamente |

**Sem hóspedes e reservas na v1.** Consultar reservas/ocupação exige finalidade, base legal, autorização explícita e validação de necessidade. Os estados `Dirty`, `Clean`, `Inspected`, `OutOfService`, `OutOfOrder` são de operação do recurso; não trazem por si só a situação de ocupação.

### 2.2 Regras de domínio NÃO negociáveis
1. `app.local.status` continua como status de licença/cadastro (`ativo`, `pendente_licenca`, `inativo`); nunca receber `Clean/Dirty/OutOfOrder`.
2. Estado físico/limpeza Mews ≠ bloqueio do PMS ≠ período `uh_indisponivel` aberto por manutenção. Manter três conceitos separados na apresentação e no armazenamento.
3. Bloqueio `OutOfOrder` no Mews pode ser **sinal para conferência humana**, não prova de causa técnica. `InternalUse` não significa falha.
4. Não escrever de volta no Mews (não usar `resources/update`, `resourceBlocks/add` nem delete), nem criar automaticamente OS, chamado ou fechamento de períodos.
5. Filtrar `Data.Discriminator=Space` e categorias de recursos; um `Resource` também pode ser objeto/serviço. Não cadastrar objetos como UHs.
6. Chaves de vínculo estáveis, por **tenant + origem + enterprise + resource**. Proposta de chave externa `EnterpriseId|ResourceId`; compatibilizar com o limite de 200 caracteres do contrato e a chave de hotel existente. Não confiar somente no número do quarto ou no nome.
7. Reprocessar webhooks duplicados, fora de ordem e perdidos sem alteração indevida; `UpdatedUtc` e reconciliação por consulta completa ou delta conforme API.
8. Remoção/inativação de `Resource` Mews não apaga `app.local` nem históricos; qualquer desativação interna exige regra e decisão próprias.

### 2.3 Desenho proposto, sujeito a ADR
```text
Mews Connector API  ---- pull incremental/paginado ----Mews General Webhooks --- apenas notificação de IDs ---> adaptador cloud read-only
                                                     |
                                           mapeamento e validação
                                                     |
                                            ingestão autenticada
                                                     |
                                        staging (fonte mews)
                                                     |
                                    promoção existente de hotéis/UHs
                                                     |
                                      projeção de estado PMS separada
                                                     |
                                       CSC / Manutenção / Intelligence
```
- Preferir **worker cloud independente**, com tokens Mews guardados em serviço de segredos, nunca no browser/PWA, banco exposto, repositório ou URL pública. Decidir infraestrutura e fluxo de credenciais antes do código.
- É necessário ampliar `FONTES`, possivelmente `ENTIDADES_EXTERNAS`, contratos Zod, promoção e testes; o detalhe depende de ADR, sobretudo novas tabelas/migrações em zona protegida.
- Se o modelo `(tenant, fonte, entidade, chave)` continuar, compor a chave remota com `EnterpriseId` para evitar colisão. Um portfolio token não elimina a validação da empresa proprietária do hotel.
- A API do Mews usa **HTTP POST JSON** com `ClientToken`, `AccessToken` e `Client` no corpo. **Tokens demo e produção são diferentes**.
- Limite documentado: ~200 requisições por `AccessToken` em 30 s (variável); em `429`, obedecer `Retry-After` e backoff com jitter; implementar timeout, circuito de falha e reconciliação.
- `resources/getAll` e `resourceBlocks/getAll` usam paginação/`Limitation.Cursor`; carregar tudo por páginas e tratar janela `UpdatedUtc` com overlap/deduplicação.
- General Webhooks dependem de registro junto ao suporte Mews (APROVAÇÃO DO CESAR antes de qualquer contato), exigem resposta em até **5 segundos**, entrega pode atrasar e falhar, e devem entrar em fila antes do fetch.
- **Autenticação de webhook**: documentação Mews descreve segredo compartilhado **na URL**, não assinatura HMAC nativa. Não presumir HMAC ou assinatura inexistente. Adotar token de alta entropia (validado em tempo constante), URL com mínimo de log, segredo por ambiente/integração, restrição de acesso, replay/dedup e rotação; submeter desenho à revisão de segurança.
- Evitar dados de hóspedes, reservas, descrição livre e `Notes` de bloqueios sem necessidade aprovada, pois podem conter dados pessoais.
- Tratar `IntegrationDisabled`, `IntegrationCanceled`, `IntegrationDeleted` e troca de token como bloqueios/rotinas de reconexão em etapa posterior.

## 3. Critérios de aceite da prova de conceito Mews
1. **Sem dados reais** na demo Mews (ambiente público).
2. Com payloads sintéticos offline, provar parsing Zod/normalização de `Enterprise`, `Space` e blocos, sem chamadas externas.
3. Simular dois tenants com mesmo nome de hotel/quarto; nenhum dado de A em B.
4. Simular dois hotéis do mesmo tenant com quarto `101`; não misturar IDs/históricos.
5. Provar que `Dirty` não muda licença da UH nem gera OS; `OutOfOrder` não encerra/abre período automaticamente.
6. Páginas, recursos inativos, remoção de bloqueio, `UpdatedUtc` fora de ordem, duplicação e retry não duplicam nada.
7. Simular 429 + `Retry-After`, 401 credencial inválida, 5xx, timeout e perda de webhook; preservar última informação confiável e indicar sincronização desatualizada.
8. Webhook desconhecido, sem segredo, segredo errado, tenant errado ou replay não acessa dados do cliente.
9. Eventos recebidos respondem em menos de 5 s apenas após durabilidade da notificação; processamento fora da requisição.
10. Reconciliação e reativação após desconexão demonstradas; nenhum token aparece em log, erro, URL exportada ou relatório.
11. CI com testes verdes, lint, typecheck e testes de RLS/pgTAP quando houver schema novo; qualquer resultado só é considerado comprovado quando executado.
12. O HubKeep continua utilizável sem PMS conectado.

## 4. Gate de homologação comercial e critérios de custo
- **Gate A, agora:** contrato técnico, segurança e requisitos; pesquisa de mercado e cliente-alvo sem contato externo. **Sem custo ou cadastro**.
- **Gate B, PoC demo:** depois de autorizar a implementação, executar contra `https://api.mews-demo.com` com credenciais públicas de demo; sem produção, nunca usando dados de cliente.
- **Gate C, certificação:** o Mews fornece uma demo self-service e orienta cadastro de parceiro e envio de formulário de certificação; **para credenciais de produção é necessária certificação**. Contato/cadastro pela Hub Tech só com autorização.
- **Gate D, piloto e operação:** validação com cliente real, obrigações de suporte e publicação no Marketplace conforme os termos vigentes; custos, prazos e requisitos de piloto devem ser reconfirmados diretamente com Mews antes de assumir compromisso.

## 5. Preparação europeia paralela (sem implementações no ambiente BR)
| Prioridade | Verificação | Critério para encerrar |
|---|---|---|
| P0 | Mapa regional de dados: Supabase DB/Auth/Storage, Vercel, Sentry, logs, e-mail, backups, IA e suboperadores | Diagrama de fluxo, locais de armazenamento e acessos transfronteiriços confirmado |
| P0 | GDPR: DPA art. 28, minimização, base legal, retenção, direitos dos titulares, registros, prazos de incidente, suboperadores e art. 27 quando aplicável | Revisão jurídica local documentada e ações atribuídas |
| P0 | Segurança de APIs/webhooks, rotação/revogação tokens, escopo por propriedade | Plano de testes e desenho de cofre de segredos aprovados |
| P1 | Célula UE de produção e domínio regional | Decisão técnica de residência, backup e latência; Brasil continua isolado |
| P1 | Qualidade de FR/ES/EN e fluxo de PWA, avisos, exportação e documentação | Teste por idioma e revisão humana das terminologias |
| P1 | SaaS comercial: Hub Tech, contrato, cobrança EUR/IVA e suporte em fuso europeu | Matriz por país aprovada |
| P2 | Extensão apaleo e Oracle pela mesma interface lógica | Somente após gate comercial ou validação técnica que justifique |

**Nota legal:** decisão de adequação da Comissão Europeia `(UE) 2026/179`, de 26/01/2026, está em vigor e facilita transferências UE→Brasil ao abrigo do art. 45 do GDPR. **Não** substitui DPA, bases legais, gestão de suboperadores, nem eventual requisito contratual de hospedagem UE.

## 6. Colaboração com agentes Claude
- **Propriedade EU:** este documento, documentação de contrato Mews e futura implementação isolada (proposta de PRs `eu:`), sempre partindo de `main`.
- **Núcleo 1b/1c:** domínio, `packages/contratos`, `packages/db`, app web, migrações e novos endpoints são áreas compartilhadas. Abrir pedido de coordenação e ADR antes de tocar; não disputar zona protegida.
- **Intelligence:** nenhuma alteração por esta frente; dados PMS podem ser fonte contextual depois que houver contratos e privacidade aprovados.
- **Somente Cesar:** aprovar ADR, alterações sensíveis, merge, `db push`/`config push`, credenciais, novas despesas, empresas externas e comunicação com Mews ou clientes.
- **Não é trabalho automático em segundo plano:** este registro permite continuidade em sessões futuras, com retomada pelo contexto e pela issue #284.

## Fontes oficiais verificadas
- Resources: https://docs.mews.com/connector-api/operations/resources
- Resource blocks: https://docs.mews.com/connector-api/operations/resourceblocks
- Enterprises: https://docs.mews.com/connector-api/operations/enterprises
- General Webhooks: https://docs.mews.com/connector-api/events/wh-general
- FAQ Webhooks (autenticação/tempo): https://docs.mews.com/connector-api/events/wh-faq
- API Authentication: https://docs.mews.com/connector-api/guidelines/authentication
- API Environments: https://docs.mews.com/connector-api/guidelines/environments
- Request limits: https://docs.mews.com/connector-api/guidelines/requests
- Certification: https://docs.mews.com/connector-api/your-journey/certification
- GDPR adequação BR: https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32026D0179

## Próximas decisões a submeter ao Cesar (não aprovadas ainda)
1. Implementação da **PoC de leitura Mews em branch exclusiva**, inicialmente com payloads sintéticos e posteriormente demo pública?
2. Contrato de integração: persistir status operacional do PMS e bloqueios em tabela/projeção separada (migração/ADR, zona protegida)?
3. Permissão para realizar cadastro **oficial** da Hub Tech como parceira Mews (não necessário para desenvolver com demo pública)?
