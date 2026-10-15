# HubKeep EU — PoC Mews somente leitura

Protótipo **isolado**, sem dependências externas e sem imports do monorepo. Preparado para a Hub Tech testar a leitura da Mews Connector API em **demo**. **Não escreve na API, não integra o banco, não recebe webhooks de produção e não cria chamados/OS.**

## Rodar

Requer Node.js 20+; na pasta deste experimento:

```bash
node --test testes.test.mjs
node exemplo.mjs
```

O exemplo usa apenas dados **fictícios** e não chama o Mews. O módulo `client.mjs` recebe `fetchImpl` injetável, permitindo simular as chamadas sem token e sem rede. A PoC só aceita a URL exata `https://api.mews-demo.com` e só chama operações `getAll` allowlisted.

## Funções

- `criarClienteMews({clientToken,accessToken,fetchImpl,...})`: cliente demo, pagination Cursor, rate-limit mínimo, retry em 408/429/5xx, `Retry-After`, timeout e mensagens que não incluem tokens.
- `listarEmpresas()`, `listarRecursos([enterpriseId])`, `listarBloqueios([enterpriseId])`: exclusivamente leitura.
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
