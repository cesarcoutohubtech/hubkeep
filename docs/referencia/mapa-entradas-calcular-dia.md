# Mapa das entradas do `calcularDia`

**Situação:**
- **Levantamento de 06/10/2026,** feito pelo agente do Kaio sobre a `main` no `a27e961`. Os tipos do banco vêm de `packages/db/src/tipos-banco.ts`, e as ações da auditoria, dos repositórios de `packages/db`.
- **Revisto no mesmo dia** com as decisões do Cesar: o fim de `docs/referencia/lacunas-instrumentacao-intelligence.md` e a etapa I de `docs/12-plano-fase-1b.md`.
- **Revisto em 09/10/2026:** a numeração da etapa I passou a oito tarefas (aviso do núcleo de 08/10) e I1, I2, I3 e I5 já estão na `main`. As colunas conferidas estão em `docs/diario-intelligence.md`, seção "Etapa I na `main`".
- **Revisto em 07/10/2026** com a revisão do escopo do Cesar (`docs/referencia/HubKeep — Documento do projeto.md`): fornecedor como tabela, UH indisponível no chamado e modelo contratual do hotel, e com as versões gravadas em cada resultado diário. Os nomes exatos das colunas novas vêm das propostas de desenho do agente do núcleo, que ainda não saíram no diário dele: onde a coluna aparece abaixo, o nome é provisório.

**Para quê:** saber, para cada dado que o `calcularDia` (`packages/inteligencia/src/dia.ts`) usa:
- de que coluna da `main` ele vem;
- ou qual tarefa da etapa I da 1b vai criá-lo;
- ou se fica sem origem.

**Legenda:**
- **Existe:** a coluna está na `main`.
- **I1 a I8:** as tarefas da etapa I da 1b, na numeração de 08/10/2026 (a anterior tinha cinco):
  - I1: ativo (compra, garantia e criticidade), **na `main`**;
  - I2: modelo contratual do hotel e edificação do local, **na `main`**;
  - I3: fornecedor mínimo do grupo, **na `main`**;
  - I4: chamado e OS (executado por, custo, impacto no hóspede, UH indisponível), **na `main`**;
  - I5: transições da OS, **na `main`**;
  - I6: códigos de manutenção;
  - I7: módulos contratados (`licenca.modulo`);
  - I8: fotos e assinatura (sem entrada para o Intelligence).
- **Itens novos da 1b** do documento consolidado de 07/10 (a ordem de lá: ativo; hotel e local; chamado e OS; fornecedor; transições; códigos; módulos):
  - hotel e local: modelo contratual do hotel e edificação do local;
  - chamado e OS: período de UH indisponível, e o `executado por` passa a ser equipe interna ou fornecedor;
  - fornecedor: cadastro mínimo (nome, CNPJ, contato), no lugar do nome em texto livre.
- **Sem origem:** nem a `main` nem a etapa I trazem o dado.

## Entrada geral

| Campo | Origem | Situação |
|---|---|---|
| `agora` | Relógio do job (porta `Relogio`). Para recalcular um dia passado, o fim dele (`fimDoDia`). | Existe |
| `sistemico` (configuração) | A chave `inteligencia.sistemico` de `app.politica`, no escopo de grupo, resolvida pelo `registroDePoliticas` do núcleo (#106). | A extensão é registrada com I7 |

## Hotel (`HotelDoDia`)

| Campo | Origem | Situação |
|---|---|---|
| `hotelId` | `app.hotel.id` | Existe |
| `bandeiraId` | `app.hotel.bandeira_id` | Existe |
| `versaoPolitica` | O que identifica as linhas de `app.politica` que resolveram as duas políticas do hotel (id e `atualizado_em` de cada uma), montado pela ligação do servidor. `padrao` sem política gravada. É o que o ADR-036 grava em cada resultado diário (condição do Cesar de 07/10/2026). | Existe (`app.politica.id`, `atualizado_em`) |
| Modelo contratual (próprio, administrado, arrendado, afiliado) | O atributo novo do hotel, na 1b. **Registrado como dimensão** das comparações de rede da versão 2.0, sem uso no 1.0: o `HotelDoDia` não o carrega. Ver a seção abaixo. | Existe (I2): `app.hotel.modelo_contratual`, com os valores de `MODELOS_CONTRATUAIS` do domínio; nulo é "não informado" |
| `reincidencia`, `atencao` (configurações) | As chaves `inteligencia.reincidencia` e `inteligencia.atencao_ativo`, resolvidas pelo registro do núcleo (hotel → bandeira → grupo → padrão). O valor com escopo de bandeira só entra na 1c. O limite do insight é campo da `inteligencia.atencao_ativo` (`limiteInsight`, padrão 70). | A extensão é registrada com I7. Até lá, valem os `PADRAO_*` |

## Ativo (`AtivoDoDia`)

| Campo | Origem | Situação |
|---|---|---|
| `id`, `hotelId` | `app.ativo.id`, `app.ativo.hotel_id` | Existe |
| `categoriaId` | `app.ativo.categoria_id` | Existe |
| `fabricante`, `modelo` | `app.ativo.fabricante`, `app.ativo.modelo` | Existe |
| `criticidade` | `app.ativo.criticidade`, de 1 a 5, fixa (`check` no banco). A política `ativo.criticidade` só troca os nomes dos níveis. | I1 |
| `paradas` | `app.parada_ativo.inicio` e `fim`, por `ativo_id` | Existe |
| `garantiaAte` | `app.ativo.garantia_ate` (último dia da garantia). Atenção v2: garantia vencida, 5%. Sem a data, conta como não vencida (0), com peso (respostas de 10/10/2026). | I1 |
| `preventivaAtrasada` | O plano de preventiva da 1b. Atenção v2: preventiva atrasada, 10%. | Sem origem até a etapa P |
| `medicoes` | `{ foraDaFaixa, total }` das medições do checklist tipado na janela. Atenção v2: medições fora da faixa, 10%. Só conta no ativo cuja categoria está em `categoriasComMedicao` (entrada do dia: as categorias com item de medição no plano); fora delas, sem dado. Abaixo do mínimo da política (`minMedicoes`, padrão 3), o ativo contribui 0. | Sem origem até a PV1 (antes P1) |

## Corretiva (`Corretiva`)

| Campo | Origem | Situação |
|---|---|---|
| `id` | `app.chamado.id` | Existe |
| `hotelId`, `localId` | `app.chamado.hotel_id`, `app.chamado.local_id` | Existe |
| `ativoId` | `app.chamado.ativo_id`. A OS não tem ativo próprio. | Existe |
| `abertaEm` | `app.chamado.criado_em` | Existe |
| `concluidaEm`, `reaberturas` | `app.os_transicao` (de, para, quando, quem e a ação), lida pelo `hk_worker` no tenant do job. As transições até a data do cálculo passam por `conclusaoEReaberturas`. O worker não lê a auditoria (decisão de 06/10/2026). As colunas são `acao`, `de`, `para`, `quando` e `usuario_id`; o motor lê `acao`, `para` e `quando`. | Existe (I5) |
| `codigoFalha` | `app.os.codigo_falha_id` | I6 |
| `executadoPor` | `app.os.executado_por`: `equipe_interna` ou `fornecedor` (o documento de 07/10 trocou `terceiro` por `fornecedor`). `not null default 'equipe_interna'`: as OS anteriores à 0034 ficaram com o padrão. Tipo `ExecutadoPor` e lista `EXECUTORES_DA_OS` do domínio. | Existe (I4) |
| `fornecedorId` | A chave do cadastro de fornecedor (`app.fornecedor`), que substitui o nome digitado (`terceiro_nome`). A regra do mesmo fornecedor compara este id. `app.os.fornecedor_id`, FK composta para `app.fornecedor` (I3); o check `os_fornecedor_quando_externo` só aceita o id com `executado_por = 'fornecedor'`. O worker lê a coluna da OS, não a tabela do fornecedor. | Existe (I4) |
| `custoInformado` | `app.os.custo_informado`, `numeric(12,2)`, não negativo, gravado no aceite. Chega como texto pelo driver: quem lê converte para número. O vazio precisa chegar como null, e não 0: a atenção conta as corretivas encerradas com e sem o custo (regra dos 50% do tenant). Para isso, o `calcularDia` precisa receber as corretivas encerradas do tenant inteiro na janela de 12 meses, e não só as dos hotéis do cálculo. | Existe (I4) |
| `impactoHospede` | `app.chamado.impacto_hospede`, boolean; nulo é "não informado" na tela, e a atenção conta como "não teve". | Existe (I4) |
| `aposPreventiva` | A OS preventiva da 1b, reconhecida pelo plano. | Sem origem até a etapa P |
| Período de UH indisponível (`PeriodoDeUhIndisponivel` do domínio: `hotelId`, `localId`, `chamadoId`, `inicio`, `fim`, `chamadoCancelado`) | `app.uh_indisponivel` (`hotel_id`, `local_id`, `chamado_id`, `inicio`, `fim`), lida pelo `hk_worker` no tenant do job; `chamadoCancelado` vem de `app.chamado.estado = 'cancelado'`. `uhDiasPerdidos` mora no `@hubkeep/dominio` desde a I4, e a cópia do módulo saiu. Componente UH-dias da atenção, com peso 0: o `calcularDia` ainda não a chama. | Existe (I4) |

## Local (`LocalAnalisado`)

| Campo | Origem | Situação |
|---|---|---|
| `id`, `hotelId` | `app.local.id`, `app.local.hotel_id` | Existe |
| `andar` | `app.local.andar` | Existe |
| `tipo` | `app.local.tipo` (`uh` ou `area_comum`) | Existe |

## O que mudou com as decisões do Cesar (06/10/2026)

1. **Políticas:** o `registroDePoliticas` do núcleo (#106) tem uma resolução só, e o módulo não tem resolução própria. A extensão do Intelligence (`EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE`) é registrada em `montarInteligencia` junto com o filtro por módulo contratado (I7). Até lá, o job usa os `PADRAO_*`.
2. **Criticidade:** escala fixa de 1 a 5, sem máximo por política.
3. **Limite do insight:** campo `limiteInsight` da `inteligencia.atencao_ativo`, padrão 70.
4. **Conclusão e reaberturas:** vêm das transições da OS (I5), e não da auditoria. Com elas, o recálculo de um dia passado vê a conclusão e as reaberturas como estavam naquele dia.
5. **Módulo contratado por tenant:** `licenca.modulo` (I7), lida pelo `hk_worker` no próprio tenant. É assim que o job sabe em quais tenants rodar.

## O que o job grava de volta (ADR-036, condição do Cesar de 07/10/2026)

Cada resultado diário (`LinhaDaMetricaDiaria`) leva, além dos scores:
- `versaoFormulaReincidencia` e `versaoFormulaAtencao`: vêm do próprio score (`Score.versao`);
- `versaoPolitica`: a do hotel (`HotelDoDia.versaoPolitica`);
- `recalculo` e `calculo`: o recálculo é outra linha, com o número de cálculo seguinte, marcada;
- a configuração usada vai no detalhamento de cada score (`Score.configuracao`).

O rascunho da tabela está no branch `int-rascunhos` (`rascunhos/metrica/`).

## Mudanças de 07/10/2026 (revisão do escopo do Cesar)

1. **Fornecedor como tabela:** a regra do mesmo fornecedor passa a usar o id do cadastro (`fornecedorId`), e não o nome digitado. A comparação de nomes normalizados (`chaveDeTerceiro`) saiu do motor. A OS executada por fornecedor sem o id não entra na regra.
2. **UH indisponível:** o período vem do chamado. Proposta de como entra, em `docs/referencia/proposta-uh-indisponivel-intelligence.md`: **sinal próprio, e não componente da atenção**, a aprovar. **Superado em 07/10/2026:** componente da atenção, com peso 0 (diário do Intelligence).
3. **Modelo contratual do hotel:** dimensão das comparações de rede da versão 2.0 (próprio, administrado, arrendado, afiliado). **Não implementado agora:** o 1.0 compara hotéis e bandeiras como estão. Quando a 2.0 vier, entram o campo em `HotelDoDia`, o recorte nas agregações (`agregarMesDosHoteis` por modelo) e a regra de que insight de rede não mistura modelos sem dizer. Registrado aqui para o desenho não precisar de migração de volta.

## Ainda sem origem

- **Preventiva:** `preventivaAtrasada` (antes `preventivaOuCompliance`, até a atenção v1) e `aposPreventiva` esperam a etapa P da 1b. Até lá, ficam ausentes, e o peso deles vai para os outros componentes, como o ADR-034 prevê.
- **Valor antigo dos campos editáveis e da política:** o recálculo de um dia passado usa o valor atual. O resultado gravado de cada dia é a fonte de verdade do histórico (decisão de 06/10/2026).

## A conferir quando a porta de leitura for escrita

- **Que chamado conta como corretiva:**
  - excluir o chamado cancelado sem OS (proposta);
  - quando o chamado tem mais de uma OS (OS cancelada e outra gerada), usar a OS que não foi cancelada.
- **Ativo desativado** (`app.ativo.desativado_em`): sai do cálculo a partir da data da desativação (proposta). Assim, o ativo trocado não fica gerando insight.
- **Hotel desativado ou em implantação** (`app.hotel.status`): proposta de calcular só os hotéis `ativo`.
