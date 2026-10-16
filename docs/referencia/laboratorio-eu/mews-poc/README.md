# HubKeep EU — PoC Mews somente leitura

Protótipo **isolado**, sem dependências externas e sem imports do monorepo. Preparado para a Hub Tech testar a leitura da Mews Connector API em **demo**. **Não escreve na API, não integra o banco, não recebe webhooks de produção e não cria chamados/OS.**

## Evidências reais — 16/10/2026

**Gate de leitura básica da demo concluído no Windows:**

- `configuration/get`: **HTTP 200** no Gross Demo; identidade da propriedade obtida.
- `resources/getAll`: **HTTP 200**, primeira página com 5 recursos.
- `resourceBlocks/getAll`: **HTTP 200**, primeira página com **5 bloqueios** e
  `CursorPresente=true`, usando o **segundo conjunto público Gross Demo**
  e uma única chamada POST, somente leitura.
- A consulta anterior de bloqueios com apenas `Limitation` retornou HTTP 400,
  Request-Id `c0a18460-c339-4b76-a12a-8508a7edcf1d`, informando que é
  necessário pelo menos um de `CreatedUtc`, `UpdatedUtc`, `CollidingUtc`.
  **Correção validada:** `CollidingUtc` entre 00:00 UTC do dia de execução
  e 30 dias depois, somado a `Limitation.Count=5`.
- `enterprises/getAll` retornou HTTP 401 em teste anterior, embora
  `configuration/get` tenha funcionado. Em conectores de hotel único,
  obter a propriedade de `configuration/get`; não exigir listagem global.
- As credenciais de demo são públicas e compartilhadas: se houver HTTP 429,
  respeitar `Retry-After` e **não repetir automaticamente o diagnóstico**.

O resultado prova **autorização e leitura da primeira página** no ambiente
Mews Demo. **Não comprova** leitura de todas as páginas, reconciliação
incremental, associação com hotéis/quartos reais, produção, webhooks,
persistência, sincronização de OS ou segurança fim a fim em um tenant real.

O script validado no Windows é `diagnostico-bloqueios-windows.ps1`:
máximo **2 POSTs**, nenhum retry, apenas tokens públicos; normalmente conclui
com **1 POST** quando a leitura funciona. Saída apenas com códigos HTTP,
contagens e presença de cursor; nenhum payload nem token exibido.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\diagnostico-bloqueios-windows.ps1"
```

Os testes sintéticos Node do laboratório estão declarados em
`testes.test.mjs`; os checks gerais GitHub não devem ser confundidos com
execução local comprovada de todos os casos do laboratório.
Para essa suíte, executar `node --test testes.test.mjs`.

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
POSTs**, de configuração, recursos e bloqueios da demo; mostra somente
contagens, sem nomes, hóspedes, payload bruto ou tokens.

**Evidências da primeira rodada local** (15/10/2026): 28 testes sintéticos
aprovados. Naquela rodada, nenhum POST real foi concluído por limitações de
DNS e navegador. **Depois houve chamadas reais do Windows com HTTP 200**,
conforme o estado de evidências acima. Não marcar o conector completo como
homologado sem validar bloqueios, sincronização e isolamento.


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
Somente se essa autenticação tiver êxito, usa **o Enterprise.Id de `configuration/get`**
para ler recursos. A listagem `enterprises/getAll` deixou de ser pré-requisito:
no teste real de 15/10/2026 ela respondeu HTTP 401 apesar da autenticação bem-sucedida.
O diagnóstico consulta também `resourceBlocks/getAll` com
**`Limitation` e `CollidingUtc` de 30 dias**; acrescenta os filtros de
propriedade/atividade somente após essa leitura funcionar.
No máximo **cinco POSTs read-only**, sem dados de hóspedes.
O campo `Message` do erro HTTP, quando disponível, é sanitizado e limitado a
160 caracteres (sem tokens, IDs, detalhes ou corpo bruto). O resultado distingue:

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

### HTTP 429 da demo publica — controle de capacidade

Em 15/10/2026 uma nova execução do diagnóstico parou **na primeira chamada**:
`configuration/get` respondeu `HTTP 429`, Request-Id
`3ec4cb6b-81f5-4ce5-b5ed-e1e56215ad78`. Isso **não invalida** os
resultados anteriores da mesma demo (`configuration/get` e
`resources/getAll` com HTTP 200).

Os tokens da demo são públicos e o limite (atualmente anunciado como 200
requisições por AccessToken em 30 segundos) é compartilhado por quem utiliza
aquele token. Portanto, um único POST do HubKeep pode receber 429 devido ao
tráfego de terceiros. A Mews recomenda o cabeçalho `Retry-After` e um
backoff conservador: https://docs.mews.com/connector-api/guidelines/requests

A versão atual de `diagnostico-auth-windows.ps1`:
- apresenta o `RetryAfterSegundos` quando a Mews enviar o cabeçalho e
  **não refaz a chamada automaticamente**;
- trata `429` na autenticação como `limite_temporario_429` /
  `AutenticacaoNestaExecucao=nao_avaliada`;
- interrompe a sequência ao receber 429 em um endpoint, preservando a
  contagem efetiva de requisições e as evidências já obtidas.

**Não testar de novo em sequência.** Aguardar o intervalo indicado pela
Mews e fazer somente uma execução posterior. Se o cabeçalho estiver ausente,
usar espera progressiva e não repetir em ciclos curtos. O HTTP 400 sem filtro temporal foi esclarecido e corrigido; a leitura
da primeira página de bloqueios retornou HTTP 200 no teste de 16/10.

### Evidência real do Windows (15/10/2026)

- Gross `configuration/get`: HTTP 200, identidade da propriedade recuperada.
- `resources/getAll`: HTTP 200, primeira página com **5 recursos**.
- `enterprises/getAll`: HTTP 401 — permissão do endpoint não confirmada;
  não necessário para o conector single-property.
- `resourceBlocks/getAll` com filtros opcionais: HTTP 400. Em 16/10 o
  filtro temporal ausente foi identificado por resposta oficial da API.
  Reteste corrigido usa `Limitation` e `CollidingUtc`, primeiro sem
  `EnterpriseIds` nem `ActivityStates`.
- Request-Ids para eventual suporte Mews:
  empresas `874d5fac-d8df-4eb7-af73-5744b598d24b`;
  bloqueios `31b04475-bd79-47e0-af73-c22fc6cf21c6`.

A configuração, a leitura de recursos e a **primeira página de bloqueios**
estão confirmadas no Mews Demo. A etapa seguinte é validar paginação,
reconciliação, escopo por propriedade e execução dos testes sintéticos antes
de qualquer integração produtiva.

## Funções

- `criarClienteMews({clientToken,accessToken,fetchImpl,...})`: cliente demo, pagination Cursor, rate-limit mínimo, retry em 408/429/5xx, `Retry-After`, timeout e mensagens que não incluem tokens.
- `listarEmpresas()`, `listarRecursos([enterpriseId])`, `listarBloqueios([enterpriseId], {CollidingUtc})`: exclusivamente leitura paginada.
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
- Evidência operacional: HTTP 400 com mensagem de filtro obrigatório; esta regra prevalece para o laboratório.
- https://docs.mews.com/connector-api/guidelines/pagination
- https://docs.mews.com/connector-api/guidelines/requests
- https://docs.mews.com/connector-api/events/wh-general

Coordenação e decisão de produto: issue #284. A futura integração depende dos critérios e aprovações do projeto EU.
