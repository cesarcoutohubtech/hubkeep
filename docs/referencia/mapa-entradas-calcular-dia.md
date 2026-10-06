# Mapa das entradas do `calcularDia`

**Situação:**
- **Levantamento de 06/10/2026,** feito pelo agente do Kaio sobre a `main` no `a27e961`. Os tipos do banco vêm de `packages/db/src/tipos-banco.ts`, e as ações da auditoria, dos repositórios de `packages/db`.
- **Revisto no mesmo dia** com as decisões do Cesar: o fim de `docs/referencia/lacunas-instrumentacao-intelligence.md` e a etapa I de `docs/12-plano-fase-1b.md`.

**Para quê:** saber, para cada dado que o `calcularDia` (`packages/inteligencia/src/dia.ts`) usa:
- de que coluna da `main` ele vem;
- ou qual tarefa da etapa I da 1b vai criá-lo;
- ou se fica sem origem.

**Legenda:**
- **Existe:** a coluna está na `main`.
- **I1 a I5:** as tarefas da etapa I da 1b:
  - I1: ativo (compra, garantia e criticidade);
  - I2: chamado e OS;
  - I3: transições da OS;
  - I4: códigos de manutenção;
  - I5: módulos contratados.
- **Sem origem:** nem a `main` nem a etapa I trazem o dado.

## Entrada geral

| Campo | Origem | Situação |
|---|---|---|
| `agora` | Relógio do job (porta `Relogio`). | Existe |
| `sistemico` (configuração) | A chave `inteligencia.sistemico` de `app.politica`, no escopo de grupo, resolvida pelo `registroDePoliticas` do núcleo (#106). | A extensão é registrada com I5 |

## Hotel (`HotelDoDia`)

| Campo | Origem | Situação |
|---|---|---|
| `hotelId` | `app.hotel.id` | Existe |
| `bandeiraId` | `app.hotel.bandeira_id` | Existe |
| `reincidencia`, `atencao` (configurações) | As chaves `inteligencia.reincidencia` e `inteligencia.atencao_ativo`, resolvidas pelo registro do núcleo (hotel → bandeira → grupo → padrão). O valor com escopo de bandeira só entra na 1c. O limite do insight é campo da `inteligencia.atencao_ativo` (`limiteInsight`, padrão 70). | A extensão é registrada com I5. Até lá, valem os `PADRAO_*` |

## Ativo (`AtivoDoDia`)

| Campo | Origem | Situação |
|---|---|---|
| `id`, `hotelId` | `app.ativo.id`, `app.ativo.hotel_id` | Existe |
| `categoriaId` | `app.ativo.categoria_id` | Existe |
| `fabricante`, `modelo` | `app.ativo.fabricante`, `app.ativo.modelo` | Existe |
| `criticidade` | `app.ativo.criticidade`, de 1 a 5, fixa (`check` no banco). A política `ativo.criticidade` só troca os nomes dos níveis. | I1 |
| `paradas` | `app.parada_ativo.inicio` e `fim`, por `ativo_id` | Existe |
| `preventivaOuCompliance` | O plano de preventiva da 1b. | Sem origem até a etapa P |

## Corretiva (`Corretiva`)

| Campo | Origem | Situação |
|---|---|---|
| `id` | `app.chamado.id` | Existe |
| `hotelId`, `localId` | `app.chamado.hotel_id`, `app.chamado.local_id` | Existe |
| `ativoId` | `app.chamado.ativo_id`. A OS não tem ativo próprio. | Existe |
| `abertaEm` | `app.chamado.criado_em` | Existe |
| `concluidaEm`, `reaberturas` | `app.os_transicao` (de, para, quando, quem e a ação), lida pelo `hk_worker` no tenant do job. As transições até a data do cálculo passam por `conclusaoEReaberturas`. O worker não lê a auditoria (decisão de 06/10/2026). | I3 |
| `codigoFalha` | `app.os.codigo_falha_id` | I4 |
| `executadoPor`, `terceiroNome` | `app.os.executado_por`, `app.os.terceiro_nome` | I2 |
| `custoInformado` | `app.os.custo_informado` | I2 |
| `impactoHospede` | `app.chamado.impacto_hospede` | I2 |
| `aposPreventiva` | A OS preventiva da 1b, reconhecida pelo plano. | Sem origem até a etapa P |

## Local (`LocalAnalisado`)

| Campo | Origem | Situação |
|---|---|---|
| `id`, `hotelId` | `app.local.id`, `app.local.hotel_id` | Existe |
| `andar` | `app.local.andar` | Existe |
| `tipo` | `app.local.tipo` (`uh` ou `area_comum`) | Existe |

## O que mudou com as decisões do Cesar (06/10/2026)

1. **Políticas:** o `registroDePoliticas` do núcleo (#106) tem uma resolução só, e o módulo não tem resolução própria. A extensão do Intelligence (`EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE`) é registrada em `montarInteligencia` junto com o filtro por módulo contratado (I5). Até lá, o job usa os `PADRAO_*`.
2. **Criticidade:** escala fixa de 1 a 5, sem máximo por política.
3. **Limite do insight:** campo `limiteInsight` da `inteligencia.atencao_ativo`, padrão 70.
4. **Conclusão e reaberturas:** vêm das transições da OS (I3), e não da auditoria. Com elas, o recálculo de um dia passado vê a conclusão e as reaberturas como estavam naquele dia.
5. **Módulo contratado por tenant:** `licenca.modulo` (I5), lida pelo `hk_worker` no próprio tenant. É assim que o job sabe em quais tenants rodar.

## Ainda sem origem

- **Preventiva:** `preventivaOuCompliance` e `aposPreventiva` esperam a etapa P da 1b. Até lá, ficam ausentes, e o peso deles vai para os outros componentes, como o ADR-034 prevê.
- **Valor antigo dos campos editáveis e da política:** o recálculo de um dia passado usa o valor atual. O resultado gravado de cada dia é a fonte de verdade do histórico (decisão de 06/10/2026).

## A conferir quando a porta de leitura for escrita

- **Que chamado conta como corretiva:**
  - excluir o chamado cancelado sem OS (proposta);
  - quando o chamado tem mais de uma OS (OS cancelada e outra gerada), usar a OS que não foi cancelada.
- **Ativo desativado** (`app.ativo.desativado_em`): sai do cálculo a partir da data da desativação (proposta). Assim, o ativo trocado não fica gerando insight.
- **Hotel desativado ou em implantação** (`app.hotel.status`): proposta de calcular só os hotéis `ativo`.
