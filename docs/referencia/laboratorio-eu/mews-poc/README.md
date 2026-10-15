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
Para confirmar conectividade somente com a API de demonstração, copie os
dois tokens públicos informados pela Mews em:
https://docs.mews.com/connector-api/guidelines/environments

```bash
node smoke-demo.mjs --live
```

O script solicita **interativamente** o `ClientToken` e o `AccessToken`
públicos de demo. Os valores digitados **podem aparecer no terminal**, mas não
são gravados pelo laboratório em arquivos ou transmitidos ao HubKeep.
Não utilize tokens de produção neste script. A leitura é limitada a **até três
POSTs**, uma página de empresas, recursos e bloqueios da demo; mostra somente
contagens, sem nomes, hóspedes, payload bruto ou tokens.

**Evidências da rodada** (15/10/2026): 28 testes sintéticos aprovados
localmente. A URL inicial `api.mews-demo.com` carregou no navegador, mas
**nenhuma chamada POST real foi concluída**: o navegador automatizado não
conseguiu executar a requisição, e o contêiner não resolve o DNS externo.
Não marcar autenticação ou homologação como concluída.


### Teste independente no Windows (sem instalar Node.js)

Para quem utiliza Windows, existe também `smoke-windows.ps1`. Ele busca **somente os
tokens públicos Gross Demo diretamente da documentação HTTPS do Mews** e executa
até três POSTs de leitura no host `api.mews-demo.com`. Não acessa Supabase,
GitHub, bancos ou o HubKeep. Não imprime tokens, IDs ou respostas completas;
mostra apenas contagens e estados de execução.

Após clonar/atualizar este PR, abrir o PowerShell na pasta do repositório:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\docs\referencia\laboratorio-eu\mews-poc\smoke-windows.ps1
```

A liberação de execução acima vale apenas para **essa instância do PowerShell**.
Execute apenas depois de verificar o conteúdo do script no GitHub. A documentação
deve estar acessível, e o computador deve ter saída HTTPS para a demo oficial.
O script ainda requer **uma execução real no Windows**: não há PowerShell nem
resolução DNS da API Mews no ambiente de teste desta conversa.


### HTTP 401 na primeira chamada — diagnóstico sem tokens privados

Se `smoke-windows.ps1` retornar `http_401` na primeira chamada,
**não executar repetidamente o mesmo script**. Um 401 significa falta de
autorização (credencial inválida/expirada, integração desabilitada ou
permissão ausente), não erro de DNS.

Use o script `diagnostico-auth-windows.ps1` no Windows. Ele lê **dois pares
públicos** documentados (Gross e Net), realiza primeiramente
`configuration/get` — a operação inicial recomendada oficialmente pela Mews.
Somente se essa autenticação tiver êxito, consulta uma página de
`enterprises/getAll`, `resources/getAll` e `resourceBlocks/getAll`.
No máximo **cinco POSTs read-only**, sem criar dados, sem token de
produção e sem exibir credenciais ou dados de hóspedes. O resultado distingue:

- Configuração autorizada (HTTP 200): o token é válido para a propriedade
  de demo, mesmo que outra operação apresente 401 de permissão.
- Configuração 401 em Gross e Net: investigar validade/permissões dos
  tokens públicos no Mews; não concluir que existe defeito no HubKeep.
- Configuração OK, operação de leitura 401: investigar permissão específica
  do endpoint, e guardar somente o `Request-Id` público para suporte.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\diagnostico-auth-windows.ps1"
```

O script **não foi executado neste ambiente** (sem PowerShell e sem
resolução de rede para a demo). Deve ser baixado e revisado no GitHub,
executado uma única vez e seus resultados compartilhados **sem tokens**.
Se ambos os ambientes negarem autenticação, o próximo passo é solicitar
uma credencial de demonstração dedicada à Mews, com autorização
prévia antes de contatá-la.

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
