# HubKeep EU — PoC Mews somente leitura

Protótipo **isolado**, sem dependências externas e sem imports do monorepo. Preparado para a Hub Tech testar a leitura da Mews Connector API em **demo**. **Não escreve na API, não integra o banco, não recebe webhooks de produção e não cria chamados/OS.**

## Rodar

Requer Node.js 22+; na pasta deste experimento:

```bash
node --test testes.test.mjs
node exemplo.mjs
node smoke-demo.mjs  # sem --live: NÃO faz requisições
```

O exemplo usa apenas dados **fictícios** e não chama o Mews. O módulo `client.mjs` recebe `fetchImpl` injetável, permitindo simular as chamadas sem token e sem rede. A PoC só aceita a URL exata `https://api.mews-demo.com` e só chama operações `getAll` allowlisted.


## Validar leitura Mews demo (opt-in)

Este experimento inclui `smoke-demo.mjs`. **Sem `--live` não há requisições**.
Para confirmar a conectividade com a API Mews sem acesso a produção, preencher **apenas
no ambiente do processo local** os dois tokens de **demo pública** descritos em:
https://docs.mews.com/connector-api/guidelines/environments

```bash
# No terminal local, definir as variáveis (NUNCA gravar no Git):
# MEWS_DEMO_CLIENT_TOKEN e MEWS_DEMO_ACCESS_TOKEN
node smoke-demo.mjs --live
```

O script realiza **até três chamadas POST**, usando a primeira página de `enterprises/getAll`,
`resources/getAll` e `resourceBlocks/getAll` de uma empresa demo; informa **somente
contagens** e se existem mais páginas. Não mostra nomes, token ou payload bruto, não
persiste e não altera status de UH/chamados. A ausência de propriedade retorna
`sem_dados`. Uma resposta de erro não prova disponibilidade da API. O uso
de tokens públicos da demo não caracteriza certificação nem acesso à produção.

**Evidências coletadas nesta rodada** (15/10/2026): 25 testes locais com dados simulados
aprovados. Foi possível acessar a página inicial de `api.mews-demo.com` pelo
navegador, mas **nenhuma chamada real POST de API foi executada**: o navegador
automatizado não expôs o console e este ambiente de execução não resolve o
DNS do host externo. Não marcar o gate de autenticação/demo como concluído.

## Funções

- `criarClienteMews({clientToken,accessToken,fetchImpl,...})`: cliente demo, pagination Cursor, rate-limit mínimo, retry em 408/429/5xx, `Retry-After`, timeout e mensagens que não incluem tokens.
- `listarEmpresas()`, `listarRecursos([enterpriseId])`, `listarBloqueios([enterpriseId])`: exclusivamente leitura paginada.
- `lerPrimeiraPaginaDeEmpresas()`, `lerPrimeiraPaginaDeRecursos([enterpriseId])`, `lerPrimeiraPaginaDeBloqueios([enterpriseId])`: leitura LIMITADA a uma página por tipo, usada no smoke.
- `criarEscopo({tenantId,vinculos})`: vínculo explícito `enterpriseId` → `hotelId`; nenhuma autoassociação pelo nome do hotel.
- `montarProjecao(escopo,recursos,bloqueios)`: candidatos de espaços e bloqueios, sem notas, sem contato de hóspede, sem efeitos no domínio.

## Cuidados antes de se tornar integração real

1. O recurso `Space` da Mews pode ser UH **ou** espaço comum: validar categoria e vínculo humano antes de cadastrar no HubKeep.
2. O campo `local.status` do HubKeep é licença/cadastro, não limpeza, não bloqueio comercial. Jamais sobrescrevê-lo com `State` Mews.
3. `ResourceBlock` de tipo `OutOfOrder` não deve automaticamente virar `uh_indisponivel` ou criar OS. `InternalUse` não denota manutenção.
4. Para produção serão necessários design de cofre de segredos, autenticação de webhooks, rotinas duráveis, cursor/checkpoint, reconciliação e idempotência persistente, instrumentação, revisão jurídica, migrações com RLS e ADR de arquitetura.
5. Evitar qualquer token real no Git, logs e erros. `ClientToken` + `AccessToken` estão no **corpo** POST da Connector API; não confundir com OAuth.
6. Respeitar os limites por AccessToken; demo usa tokens compartilhados e não há garantia de disponibilidade. Esta PoC implementa janela conservadora, mas não uma limitação distribuída de requisições multi-instância.

## Referências oficiais verificadas (15/10/2026)

- https://docs.mews.com/connector-api/operations/enterprises
- https://docs.mews.com/connector-api/operations/resources
- https://docs.mews.com/connector-api/operations/resourceblocks
- https://docs.mews.com/connector-api/guidelines/pagination
- https://docs.mews.com/connector-api/guidelines/requests
- https://docs.mews.com/connector-api/events/wh-general

Coordenação e decisão de produto: issue #284. A futura integração depende dos critérios e aprovações do projeto EU.
