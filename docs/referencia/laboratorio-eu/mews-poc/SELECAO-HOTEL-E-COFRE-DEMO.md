# Mews Demo — seleção segura do hotel e referência de credenciais

**18/10/2026 · Preparação somente leitura · Não ativado.**

## Objetivo

Selecionar **um hotel fictício existente** no projeto HubKeep-dev para uma futura prova controlada de Mews Demo. Não associar automaticamente hotéis por nome; `Gross Demo` na Mews não é equivalente a `Hotel Demonstração Centro` no HubKeep sem uma confirmação explícita do Admin e do responsável pelo ensaio.

O PR #327 já oferece o ensaio offline que exige confirmação de escopo, valida `EnterpriseId` no `configuration/get` e descarta toda a projeção sem gravação. **Este PR não conecta nem executa esse ensaio com credenciais ou banco reais.**

## Passo 1 — consulta de candidatos do HubKeep-dev (após merge)

Com o PowerShell aberto na **raiz** do checkout HubKeep e variável `DEV_SESSION_POOLER` existente, confirmar que `supabase/config.toml` mantém o `[remotes.dev]` esperado e executar:

```powershell
git pull --ff-only origin main
node --experimental-strip-types --no-warnings=ExperimentalWarning scripts/ops/mews-candidatos-hotel-dev.mjs --ambiente dev
```

A consulta usa a função `conexaoDono('dev')`, que recusa credenciais de projetos com *ref* diferente de `[remotes.dev]`, verifica apenas **até 20 hotéis potencialmente demonstrativos** e abre `BEGIN TRANSACTION READ ONLY` com `ROLLBACK`. Não faz POST, `INSERT`, `UPDATE`, `DELETE`, fixture nem migração.

A saída inclui somente nome de grupo/hotel, `tenant_id` e `hotel_id` internos, status, presença de vínculo e elegibilidade. **Nunca traz `credencial_ref`, `EnterpriseId`, informações de hóspedes ou dados de usuários.**

**Um candidato marcado SIM não é uma autorização de vínculo.** A indicação exige hotel com identificação fictícia explícita, estado `ativo` e nenhum vínculo Mews já existente. Hotel em implantação, sem evidência de que é fictício ou com vínculo ativo/revogado fica marcado NÃO. O usuário escolhe o candidato e confirma manualmente a correspondência com a propriedade Mews Demo antes de prosseguir.

Se o script retornar 0 hotéis ou limite excedido, **não criar automaticamente** hotéis; revisar filtros e cadastros por procedimento separado. O script não consulta grupos/tenants de produção ou staging.

## Passo 2 — identidade da propriedade Mews

A operação de leitura `configuration/get` pode devolver um único `Enterprise.Id` para credenciais de uma propriedade. O laboratório obteve HTTP 200 na Gross Demo em teste anterior, porém isso **não comprova a correspondência com o hotel HubKeep selecionado**.

Antes de associar, registrar em uma aprovação humana específica:
- Grupo e hotel do HubKeep-dev escolhidos (IDs internos, **não** IDs de clientes reais);
- Nome reconhecível da propriedade de demonstração, `Gross Demo`, e evidência de correspondência de `EnterpriseId`, sem colar tokens;
- Identidade/permissão do Admin do grupo que fez a conferência e data;
- Comportamento de revogação/revinculação (sem substituir silenciosamente um vínculo já existente);
- Escopo limitado a `Space` e `ResourceBlock` de `OutOfOrder`/`InternalUse`, sem mapear automaticamente UH ou OS.

## Passo 3 — cofre (proposta de desenho, ainda não implementada)

O campo `app.mews_vinculo.credencial_ref` contém **somente identificador opaco de referência**, jamais `ClientToken`, `AccessToken`, URL contendo segredo, senha ou payload.

Regras de implantação futura:
1. Tokens de demonstração/produção ficam em gerenciador de segredos com segregação **dev vs. produção** e controle de acesso mínimo para um processo servidor autorizado. O painel web e o navegador nunca recebem os tokens.
2. Usar referência opaca e rotacionável, sem inferir projeto, hotel, EnterpriseId ou qualquer dado protegido por inspeção do valor. Nunca colocar tokens no Git, em PR, logs, testes, variáveis públicas do navegador ou resultados do PowerShell.
3. A criação de vínculo requer Admin do grupo autenticado, validação tenant/hotel e consulta `configuration/get` à propriedade com credencial já sob custódia do cofre. Nunca aceitar `conferidoPorAdmin` enviado diretamente do cliente como evidência.
4. Revogação deve bloquear a leitura e a persistência no mesmo escopo; o worker checa o vínculo ativo durante a transação de escrita. Rotação exige conferir novamente a propriedade, com procedimento de rollback e auditoria técnica sem segredos.
5. A Mews Demo pública possui limites de tráfego compartilhados. Em HTTP 429, obedecer `Retry-After`, sem criar loops automáticos. Para integração controlada com persistência, preferir acesso de demonstração dedicado, sem dependência de tokens públicos.
6. Retenção de checkpoints e identificadores externos e proteção de dados/GDPR precisam de revisão e aceite antes do primeiro vínculo persistido, mesmo com hotel fictício.

**Isto não é uma implementação de cofre ou OAuth.** Credenciais continuam fora do HubKeep-dev, e não existe processo autorizado para consumir segredos nesta etapa.

## Gates de ativação ainda pendentes

- [ ] Cesar selecionar um hotel fictício a partir do inventário do dev;
- [ ] Cesar confirmar a propriedade Gross Demo e a associação hotel ↔ `EnterpriseId`;
- [ ] Especificar e revisar implementação de cofre e política de revogação;
- [ ] Implementar porta de `consultarEscopo` real no servidor com autenticação e RLS;
- [ ] Aprovação específica antes de **criar vínculo**, gravar `app.mews_checkpoint`/`mews_recurso`/`mews_bloqueio`, ou executar primeira chamada real à Mews Demo;
- [ ] Sem cron, webhooks, atualização de UH/OS/licença, ou gravação na Mews.

**Não executar `supabase db push`**: a migração 0056 já está aplicada e este PR não adiciona migrações.
