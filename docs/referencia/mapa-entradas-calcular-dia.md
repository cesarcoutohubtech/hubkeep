# Mapa das entradas do `calcularDia`

**Situação:** levantamento de 06/10/2026, feito pelo agente do Kaio, sobre a `main` no `a27e961`. Os tipos do banco vêm de `packages/db/src/tipos-banco.ts`, e as ações da auditoria, dos repositórios de `packages/db`.

**Para quê:** saber, para cada dado que o `calcularDia` (`packages/inteligencia/src/dia.ts`) usa:
- de que coluna da `main` ele vem;
- ou qual das três migrações da instrumentação vai criá-lo (`docs/referencia/lacunas-instrumentacao-intelligence.md`);
- ou se fica sem origem.

**Legenda:**
- **Existe:** a coluna está na `main`.
- **Deriva:** sai da `main` sem coluna nova.
- **M1, M2, M3:** as migrações da instrumentação (ativo; chamado e OS; códigos de manutenção).
- **Sem origem:** nem a `main` nem as três migrações trazem o dado.

## Entrada geral

| Campo | Origem | Situação |
|---|---|---|
| `agora` | Relógio do job (porta `Relogio`). | Existe |
| `limiteInsight` | Nenhuma chave de política. Hoje vale a constante `LIMITE_INSIGHT_PADRAO` (70). | Sem origem configurável (abaixo) |
| `sistemico` (configuração) | `app.politica` com `chave = 'inteligencia.sistemico'` e escopo de grupo. | Sem origem: o núcleo ainda não aceita a chave (abaixo) |

## Hotel (`HotelDoDia`)

| Campo | Origem | Situação |
|---|---|---|
| `hotelId` | `app.hotel.id` | Existe |
| `bandeiraId` | `app.hotel.bandeira_id` | Existe |
| `reincidencia`, `atencao` (configurações) | `app.politica` com as chaves `inteligencia.reincidencia` e `inteligencia.atencao_ativo`. A tabela já tem `escopo_tipo`, `bandeira_id` e `hotel_id`. | Sem origem: o núcleo ainda não aceita as chaves, e a resolução do domínio não lê a bandeira |

## Ativo (`AtivoDoDia`)

| Campo | Origem | Situação |
|---|---|---|
| `id`, `hotelId` | `app.ativo.id`, `app.ativo.hotel_id` | Existe |
| `categoriaId` | `app.ativo.categoria_id` | Existe |
| `fabricante`, `modelo` | `app.ativo.fabricante`, `app.ativo.modelo` | Existe |
| `criticidade.nivel` | `app.ativo.criticidade` | M1 |
| `criticidade.maximo` | A política `ativo.criticidade` do núcleo. Ela ainda não está no `POLITICAS` do domínio, e a M1 cria só a coluna. | Sem origem até o núcleo criar a política |
| `paradas` | `app.parada_ativo.inicio` e `fim`, por `ativo_id` | Existe |
| `preventivaOuCompliance` | O plano de preventiva da 1b. | Sem origem: fica ausente até a 1b |

## Corretiva (`Corretiva`)

| Campo | Origem | Situação |
|---|---|---|
| `id` | `app.chamado.id` | Existe |
| `hotelId`, `localId` | `app.chamado.hotel_id`, `app.chamado.local_id` | Existe |
| `ativoId` | `app.chamado.ativo_id`. A OS não tem ativo próprio. | Existe |
| `abertaEm` | `app.chamado.criado_em` | Existe |
| `concluidaEm` | A última linha de `app.auditoria` com `entidade = 'os'` e `acao = 'concluir'`, campo `em`. A OS não tem coluna de conclusão. | Deriva para o `hk_app`; sem origem para o job (abaixo) |
| `reaberturas` | As linhas de `app.auditoria` com `entidade = 'os'` e `acao = 'reabrir'`, contadas. | Deriva para o `hk_app`; sem origem para o job (abaixo) |
| `codigoFalha` | `app.os.codigo_falha_id` | M3 |
| `executadoPor`, `terceiroNome` | `app.os.executado_por`, `app.os.terceiro_nome` | M2 |
| `custoInformado` | `app.os.custo_informado` | M2 |
| `impactoHospede` | `app.chamado.impacto_hospede` | M2 |
| `aposPreventiva` | A OS preventiva da 1b, reconhecida pelo plano. | Sem origem: fica ausente até a 1b |

## Local (`LocalAnalisado`)

| Campo | Origem | Situação |
|---|---|---|
| `id`, `hotelId` | `app.local.id`, `app.local.hotel_id` | Existe |
| `andar` | `app.local.andar` | Existe |
| `tipo` | `app.local.tipo` (`uh` ou `area_comum`) | Existe |

## Sem origem

1. **As cinco chaves `inteligencia.*` em `app.politica`:**
   - a tabela comporta as chaves, mas o `validarPolitica` do núcleo recusa o que não está no `POLITICAS`;
   - a resolução do domínio vai do hotel para o grupo, sem passar pela bandeira;
   - depende do ponto de extensão das políticas (proposta em `docs/referencia/proposta-extensao-politicas.md`). Até lá, o job usa os `PADRAO_*`.
2. **O máximo da escala da criticidade:** a política `ativo.criticidade` ainda não existe no domínio. Sem ela, o nível da M1 não vira componente, e a criticidade fica ausente no score.
3. **O limite que faz o score sugerir insight:** não há chave de política. Ou ele entra como campo da `inteligencia.atencao_ativo` (versão nova do formato), ou fica fixo em 70 no 1.0. Decisão do Cesar ou do Kaio.
4. **Preventiva:** `preventivaOuCompliance` e `aposPreventiva` dependem do plano de preventiva da 1b. Até lá, ficam ausentes, e o peso deles vai para os outros componentes, como o ADR-034 prevê.
5. **A conclusão e as reaberturas da OS no job:**
   - o job roda como `hk_worker`, que só tem INSERT em `app.auditoria` (`20260924000001_fundacao.sql`, linha 462), sem SELECT nem policy de leitura;
   - sem isso, o motor perde a conclusão (base do componente `apos_corretiva` e do custo na janela) e as reaberturas;
   - aproximação sem migração: o maior `app.os_apontamento.fim` da OS concluída (o worker lê a tabela). Ela erra quando a conclusão não tem apontamento;
   - **decisão de 06/10/2026:** o `hk_worker` não ganha leitura da auditoria. A conclusão e as reaberturas, cada uma com data, vão ao Cesar como pedido ao núcleo, para virem da própria OS, gravadas pela unit of work (registrado no `docs/diario-intelligence.md`). A forma é decisão do núcleo.
6. **O Intelligence contratado por tenant (ADR-037):** não há coluna nem política que diga se o tenant tem o módulo. O job precisa disso para saber em quais tenants rodar. A métrica de cobrança continua pendente.

## A conferir quando a porta de leitura for escrita

- **Que chamado conta como corretiva:**
  - excluir o chamado cancelado sem OS (proposta);
  - quando o chamado tem mais de uma OS (OS cancelada e outra gerada), usar a OS que não foi cancelada.
- **Ativo desativado** (`app.ativo.desativado_em`): sai do cálculo a partir da data da desativação (proposta). Assim, o ativo trocado não fica gerando insight.
- **Hotel desativado ou em implantação** (`app.hotel.status`): proposta de calcular só os hotéis `ativo`.
