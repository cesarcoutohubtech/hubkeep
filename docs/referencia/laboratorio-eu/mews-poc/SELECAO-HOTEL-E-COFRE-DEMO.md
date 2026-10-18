# Mews Demo — seleção do hotel e referência segura de credenciais

**18/10/2026 · Código de preparação · Nenhum vínculo criado.**

## Contexto e princípio de segurança

O PR #327 já criou um ensaio 100% offline que exige uma identidade de propriedade e confirmação de escopo antes de qualquer leitura. Esta entrega prepara a identificação humana de um **hotel fictício do HubKeep-dev**, mas **não vincula** o hotel à Mews, não busca tokens e não executa sincronização.

A leitura de hotéis é dado de negócio. Por isso **não usar o papel dono do banco nem scripts com `DEV_SESSION_POOLER` para listar hotéis**. A consulta ocorre somente na API autenticada do HubKeep, com `hk_app`, contexto de tenant/usuário na transação (`withContext`), checagem `authz.eh_admin_grupo()` e RLS.

## Como listar os candidatos (após merge deste PR)

1. Na instalação web conectada **somente ao HubKeep-dev**, acesse `/admin/mews` com uma conta **Admin do grupo**.
2. Veja a nova seção **Hotéis candidatos à demonstração Mews**. Ela consulta `GET /api/v1/mews/candidatos` em uma sessão autenticada, limitada ao tenant selecionado.
3. Verifique o nome e o **ID interno do hotel**, o estado cadastral, a existência de vínculo técnico anterior e a marcação **Elegível para revisão humana**.
4. Escolha o hotel fictício desejado **manualmente** e registre a escolha no procedimento de aprovação. Não escolher automaticamente `Hotel Demonstração Centro`, `Praia` ou `Serra` pelo nome; precisam existir no tenant correto.
5. Se o resultado estiver vazio ou truncado (mais de 20 candidatos), **não criar hotel nem associar automaticamente**; revisar a implantação demonstrativa.

### Semântica de elegibilidade

- A lista procura somente hotéis com código de demonstração `DEMO-` ou nome com identificação inequívoca `Demo`/`Demonstração`.
- `Elegível para revisão humana` exige hotel `ativo` e **sem qualquer vínculo Mews**, mesmo revogado. Hotel com vínculo revogado exige procedimento de revinculação e não é reutilizado silenciosamente.
- `Elegível` **não significa autorizado para integração**: ainda faltam validar a identidade da propriedade na Mews, obter autorização do Admin, cofre, retenção e reversibilidade.
- A API expõe apenas `hotelId`, `nome`, `status`, `vinculo` (nenhum/ativo/revogado), `candidato` e `truncado`. Nunca devolve `tenant_id`, `EnterpriseId`, `credencial_ref`, tokens, nomes de hóspedes, Notes ou payload Mews.
- Gerentes, técnicos e outros perfis recebem 403, não uma lista vazia que pareça autorizada. Usuário sem sessão recebe 401. A UI não fornece botão de escrita.

## Identidade da propriedade Mews Demo

A operação de leitura `configuration/get` do laboratório pode devolver o `Enterprise.Id` da propriedade cujas credenciais estão em uso. A evidência anterior obteve HTTP 200 na **Gross Demo**, mas isso não comprova associação com nenhum hotel do HubKeep.

Uma futura aprovação explícita deve registrar **qual hotel fictício no tenant correto** será associado a qual `EnterpriseId`. Não mapear por nome semelhante. Se a credencial apontar para outra propriedade, o ensaio deve falhar antes de buscar recursos/bloqueios.

## Cofre e revogação (proposta, ainda não implementada)

O campo `app.mews_vinculo.credencial_ref` deve guardar **apenas uma referência opaca** a um segredo externo, nunca `ClientToken`, `AccessToken`, URL com senha ou conteúdo da resposta da API.

1. Manter segredos segregados por ambiente: **demo/dev diferente de produção**. Apenas processo servidor autorizado lê o segredo. Nunca browser, logs, PR, arquivos versionados ou saída PowerShell.
2. Referências ao cofre devem ser rotacionáveis sem revelar `EnterpriseId`, projeto, hotel ou token. Validar identidade com `configuration/get` antes de efetivar ou rever o vínculo.
3. O Admin do grupo deve confirmar o tenant e o hotel sob sessão real e RLS. Um `conferidoPorAdmin: true` fornecido pelo navegador, isoladamente, **não é autorização**.
4. Revogação precisa impedir novas consultas/persistências; no banco, o driver de persistência confere a revogação em transação. Revinculação deve ter plano separado, preservando trilha de auditoria, sem alterar credencial silenciosamente.
5. Não assumir disponibilidade da Mews Demo com tokens públicos compartilhados. Em 429, obedecer `Retry-After`; não iniciar loops ou jobs até existir autorização e política de rate limit.
6. Rever retenção de checkpoints/IDs técnicos e GDPR antes da primeira gravação no dev; não persistir hóspedes nem nomes/Notes.

**Isto não é implantação de um cofre.** A gestão de segredos ainda não está ligada ao worker.

## Gates pendentes

- [ ] Cesar escolher uma linha elegível da lista administrativa.
- [ ] Cesar confirmar a correspondência explícita do hotel com a propriedade Gross Demo (sem enviar tokens pelo chat).
- [ ] Implementar e revisar porta de `consultarEscopo` real com sessão e RLS, sem trusts do navegador.
- [ ] Aprovar a custódia de tokens demo, rotação, revogação, retenção e plano de rollback.
- [ ] Receber autorização separada **antes de inserir `app.mews_vinculo`, consultar a API Demo real ou gravar checkpoints**.
- [ ] Sem cron, webhooks, escrita na Mews, geração de OS, alterações de UH ou licença.

**Não executar `supabase db push`**. As migrações Mews 0054/0055/0056 já estão aplicadas no HubKeep-dev e este PR não cria novas.
