# HubKeep Europa — prévia de sincronização incremental Mews (somente leitura)

**Status: laboratório sintético, não liberado para produção.**
Referência: issue #284 e leitura real de `configuration/get`, `resources/getAll`
e `resourceBlocks/getAll` no Mews Gross Demo (16/10/2026).

## Entrega
- `sincronizacao-preview.mjs`: orquestra **um hotel e um tenant explícitos**
  e recebe um cliente injetado; não importa módulos do HubKeep, não abre
  conexão própria nem faz POST direto. É exclusivamente read-only.
- `sincronizacao-preview.test.mjs`: dez testes offline cobrindo isolamento,
  bootstrap, janela `UpdatedUtc` com sobreposição, erro sem avanço de
  checkpoint, tombstone, ausência de exclusão por omissão, concorrência e
  rejeição de dados pertencentes a outra propriedade.
- `client.mjs`: passa a percorrer a próxima página sempre que o Cursor
  indicar continuação, mesmo se a página vier com menos itens que `Count`.
  Mantém defesa contra cursor repetido, limite de páginas e Retry-After.
- `testes.test.mjs`: acompanha a nova regra de cursor e inclui regressão
  de página curta com Cursor presente.

## Como validar, sem acesso externo
Execute da raiz do repositório, com Node.js 22+:

```powershell
node --test docs/referencia/laboratorio-eu/mews-poc/testes.test.mjs docs/referencia/laboratorio-eu/mews-poc/sincronizacao-preview.test.mjs
```

**44 casos definidos** (34 do cliente/normalização e 10 da prévia).
Os dez casos da prévia passaram na validação offline do desenvolvimento.
Não confundir a CI geral do GitHub com execução da suíte independente.
Não é necessário repetir o teste na API Mews.

## Contrato do orquestrador

```js
import { criarClienteMews } from './client.mjs';
import { criarSincronizadorPreview } from './sincronizacao-preview.mjs';

// Exemplo conceitual: credenciais de demo só na memória, não imprimir tokens.
const cliente = criarClienteMews({
  clientToken: process.env.MEWS_DEMO_CLIENT_TOKEN,
  accessToken: process.env.MEWS_DEMO_ACCESS_TOKEN,
  maxRetries: 0,
});
const sync = criarSincronizadorPreview({
  cliente,
  tenantId: 'tenant-previamente-validado',
  vinculos: [{ hotelId: 'hotel-validado', enterpriseId: 'enterprise-validada' }],
});
const preview = await sync.executar({
  tenantId: 'tenant-previamente-validado',
  hotelId: 'hotel-validado',
  enterpriseId: 'enterprise-validada',
  ateUtc: '2026-10-16T14:00:00Z',
});
```

**Este trecho é ilustrativo, não deve ser rodado com identificadores fictícios
nem com credenciais de produção.** Sem vinculação humana dos hotéis, a execução
precisa falhar fechada. Os testes usam apenas clientes fictícios e nenhuma rede.

## Regras de segurança
1. Primeiro ciclo: consulta recursos da propriedade e bloqueios com
   `CollidingUtc` de `ateUtc` até `ateUtc + 30 dias`.
2. Rodadas seguintes: `UpdatedUtc` entre último checkpoint menos **5 min**
   (sobreposição configurável até 60 min) e `ateUtc`. O intervalo máximo é
   de 30 dias; gaps maiores exigem reprocessamento por janelas.
3. **Checkpoint só avança ao fim de todas as páginas e da projeção válida**.
   Erro de API, cursor repetido, payload malformado ou propriedade divergente
   rejeita a rodada sem publicar snapshot/checkpoint parcial.
4. IDs do tenant/hotel/EnterpriseId são validados antes de consultar a API.
   Não aceita vínculo duplicado de hotel ou propriedade.
5. Campos retidos em memória são allowlisted: IDs, estado técnico,
   tipo, horário e `FloorNumber`. Não copia `Notes`, dados de hóspedes ou
   outros campos inesperados.
6. Um bloqueio marcado como excluído/inativo permanece como tombstone. A
   ausência em uma página incremental **nunca significa exclusão**.
7. **Nunca grava no HubKeep, banco ou Mews**; não altera room status/licenças,
   não cria OS e não modifica os sistemas Claude.

## Limites conhecidos / gates antes da integração real

- Checkpoints e tombstones ficam **exclusivamente na memória do processo**:
  reiniciar descarta o estado. Isso **não é durabilidade de produção**.
- O bootstrap com `CollidingUtc` cobre apenas a janela escolhida. É preciso
  definir uma **varredura periódica da janela futura** para captar bloqueios
  criados anteriormente, mas que só entrem na janela com o passar do tempo.
- Uma interrupção após resposta parcial da Mews exige replay idempotente;
  essa prévia não escreve checkpoints transacionais em banco.
- Futuro armazenamento exigirá chaves únicas
  `tenantId/hotelId/EnterpriseId/ResourceId`, segregação RLS, criptografia
  de credenciais, observabilidade sem PII, fila de retries e reconciliação
  de itens excluídos, sem efeitos operacionais automáticos.
- É necessário testar contas com várias propriedades e mudanças de
  autorização; não tratar `enterprises/getAll` como dependência universal.
- Até estes gates serem aprovados, **não conectar Supabase, webhooks ou
  qualquer sincronização automática**, e não implantar em produção.

Documentação Mews: https://docs.mews.com/connector-api/guidelines/pagination
e https://docs.mews.com/connector-api/operations/resourceblocks .
