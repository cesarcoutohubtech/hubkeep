# Propostas de desenho da preventiva e da implantação (PV1 a PV3, M1 a M4, PB1)

**Situação:** proposta de 12/10/2026, do agente do núcleo, para a aprovação do Cesar. Nada disto está implementado. Os itens são os das etapas PV, M e PB do `docs/12`, na ordem da fila nova do Cesar (12/10/2026): checklist (PV1), planos (PV2), geração de OS (PV3), implantação de ativos (M2 e M4, com o M1, de que o pacote depende), pacote da bandeira (PB1) e QR em lote (M3).

**Dois ADRs novos**, que param aqui para a aprovação:
- **ADR-040**, checklist tipado, com modelo versionado e cópia na OS (PV1);
- **ADR-041**, preventiva por tempo e geração idempotente pelo worker (PV2 e PV3).

O texto de cada ADR entra no `docs/03` no PR de zona protegida da migração correspondente, com o status "aguarda aprovação" até o Cesar aprovar o texto. M2 e M4 não pedem ADR: as decisões ficam registradas aqui e no diário.

Valem para todos os itens:
- regra 7: exigência vira política, desligada por padrão;
- tabela nova com o modelo do `docs/02` e os seis casos de isolamento;
- texto pelo catálogo, nos quatro idiomas;
- gravação pela unit of work, com auditoria e evento;
- operação do técnico pela fila offline (ADR-025), sem quebrar a operação antiga que já está na fila.

**Fatos do código** que pesam no desenho (levantados em 12/10/2026):
- `app.os.chamado_id` e `app.os.criado_por` são `not null`. O `local_id` da OS só tem FK pelo chamado. A OS não tem `ativo_id`: a corretiva chega ao ativo pelo chamado.
- `app.os_transicao.usuario_id` é `not null`, e o repositório lança erro sem usuário (`registrarTransicao`, `gerarOs`).
- O `hk_worker` não grava `app.os` nem `app.os_transicao`. Ele grava auditoria só com `usuario_id` nulo, e o outbox, no tenant do job.
- As transições offline levam a versão da OS (`os.iniciar` com `versao`; ADR-029). Uma gravação que suba a versão da OS no meio da fila recusa as operações seguintes do aparelho.
- O hotel tem `status` (`em_implantacao`, `ativo`, `desativado`) e `fuso` obrigatório.
- A rota `/api/cron/preventiva` existe, vazia, e está fora do `vercel.json` (B9 do `docs/11`).

---

## PV1 — Checklist tipado (ADR-040)

**Modelo de checklist (`app.checklist_modelo`), do grupo,** como as categorias e os códigos de manutenção:
- **Colunas:**
  - `nomes` (rótulos por idioma, ao menos um);
  - `categoria_id`, anulável, com FK composta: só sugere e filtra o modelo;
  - `itens` (`jsonb`), uma lista de definições de campo tipado (ADR-028: texto, número com unidade, data, lista e sim/não), validada por `validarDefinicoes`, com o limite de 50 itens;
  - `versao`, `ativa`, `criado_em`, `atualizado_em`.
- **Versão:** cada gravação dos itens sobe a versão. Mudar o tipo de um item que já existe continua proibido (`campo_muda_de_tipo`), para as respostas de OS diferentes continuarem comparáveis; o item de outro tipo entra com uma chave nova.
- **Quem cadastra:** o Admin do grupo. Leem a gestão (Admin, Gestor CSC, Gerente do hotel) e o Implantador. O técnico não lê o modelo, só a cópia na OS dele.
- **Item de conformidade:** atalho na tela que cria uma lista com "Conforme", "Não conforme" e "Não se aplica". Os rótulos das três opções vêm do catálogo, nos quatro idiomas, no momento da criação.
- **Fase 2:** faixa numérica com alerta e OS automática por não conformidade, que são as inspeções com OS automática.

**Cópia na OS (`app.os_checklist`), uma por OS:**
- **Colunas:**
  - `os_id`, com FK `(hotel_id, os_id)` e único;
  - `modelo_id` e `modelo_versao`;
  - a cópia de `nomes` e `itens`;
  - `respostas` (`jsonb`: por item, o valor, a hora no aparelho e quem respondeu);
  - `criado_por` e as datas.
- **Cópia, e não tabela de versões** (ADR-026): mudar o modelo não altera OS que já tem checklist, e a OS fica completa sozinha para a impressão da 1c.
- **Tabela à parte, e não colunas em `app.os`:** responder o checklist não sobe a versão da OS. Se subisse, a conclusão que vem depois na fila do aparelho seria recusada por conflito.
- **GRANTs e policies:** só `respostas` e `atualizado_em` recebem UPDATE. Leem os mesmos que leem a OS. Inserem a gestão e, na PV3, o worker. Atualizam o responsável pela OS e a gestão.

**Aplicar o checklist (antes da PV3):** quem tria escolhe um modelo ativo ao gerar a OS corretiva, ou depois, enquanto a OS está atribuída, em execução ou pausada. Trocar o modelo só vale enquanto não há resposta. Na PV3, a OS preventiva recebe o checklist do plano.

**Responder, no PWA e offline:**
- **Operação nova `os.responder_checklist`:** `{ chave, osId, respostas: { item: valor ou null }, feitaEm? }`.
  - O domínio confere cada valor contra a cópia da OS. Valor fora do tipo dá 422 `checklist_resposta_invalida`, com o item e o motivo.
  - `null` limpa a resposta.
  - O servidor mescla item a item, e a última operação processada vence.
  - A hora do aparelho é ajustada como na I9.
- **Sem a versão da OS**, para não competir com as transições. A chave da operação (ADR-025) garante que um dia offline sincroniza sem duplicar.
- **Quem responde:** o responsável, com a OS em execução ou pausada (a regra das horas e do material). No web, as respostas aparecem só para leitura no MVP.

**Obrigatoriedade:** cada item tem a marca "obrigatório". A política `os.checklist_completo_obrigatorio`, por hotel e desligada por padrão:
- **ligada:** a conclusão sem os itens obrigatórios é recusada com `checklist_incompleto` (com a lista dos itens que faltam). O PWA avisa antes de pôr a conclusão na fila, como na foto "depois" da I8;
- **desligada:** o PWA mostra os obrigatórios em aberto como aviso e deixa concluir;
- a OS sem checklist não exige nada.

**Telas:**
- Admin: modelos de checklist, com o editor de itens das categorias;
- triagem: aplicar o modelo na OS;
- PWA: o checklist na tela da OS, offline;
- web: as respostas no detalhe da OS.

**Kit:** um modelo "Inspeção de ar-condicionado" aplicado à OS em execução do Centro.

**Migração (0042):** as duas tabelas, as policies, os meta-testes 28 e 30 e o pgTAP de isolamento e por papel. O agente do Intelligence recebe os nomes pelo diário.

**Texto proposto do ADR-040:** checklist como modelo do grupo, versionado por contador, com os tipos do ADR-028. A OS guarda a cópia dos itens e da versão aplicada, numa tabela própria, para as respostas não disputarem a versão da OS. Respostas por item, mescladas, pela fila offline. A obrigatoriedade é política por hotel.

**Decisões:**
1. Checklist também na corretiva, aplicado por quem tria, já na PV1? (proposta: sim; o mesmo caminho serve depois à preventiva, e a PV1 já entrega valor sem a PV3)
2. Modelos do grupo, cadastrados só pelo Admin do grupo? (proposta: sim, como as categorias e os códigos)
3. Cópia na OS, e não tabela de versões do modelo? (proposta: cópia, ADR-026)
4. Respostas só pelo PWA, com o web só lendo, no MVP? (proposta: sim)
5. A marca "obrigatório" no item, mais a política que bloqueia a conclusão, desligada por padrão? (proposta: sim)

---

## PV2 — Planos preventivos (ADR-041, com a PV3)

**Plano (`app.plano_preventivo`), do hotel:**
- **Alvo:** `ativo_id` ou `categoria_id`, exatamente um dos dois (check). FKs `(hotel_id, ativo_id)` e `(tenant_id, categoria_id)`.
- **Periodicidade:** `intervalo` (inteiro) e `unidade` (`dia`, `semana` ou `mes`; check com os valores do domínio e teste de paridade). Limites no domínio: até 366 dias, 52 semanas e 24 meses. Fora disso, 422 `periodicidade_invalida`.
- **`inicio`:** a primeira data prevista.
- **`checklist_modelo_id`,** anulável: o plano sem checklist gera OS sem checklist.
- **Responsável padrão:** `tecnico_id` ou `equipe_id`, no máximo um no banco. O domínio exige um para ativar.
- **`situacao`:** `ativo`, `pausado` ou `encerrado`. Encerrar é a desativação lógica e não volta. Pausar não apaga nada.
- **`nome`** (texto de quem cadastra, até 120 caracteres), `versao` (ADR-029), `criado_por` e as datas.

**Calendário fixo, ancorado no início:** a ocorrência k é `inicio + k × intervalo`, e não a partir da última conclusão. No mês, o dia que não existe cai no último dia do mês, sem deslizar: 31/01, 28/02 (ou 29/02), 31/03. Atraso numa OS não empurra as seguintes. É o modelo das rotinas legais, como o PMOC do ar-condicionado (Lei 13.589/2018). As funções `ocorrencias` e `proximaOcorrencia` ficam no domínio, testadas sem banco.

**Quem cadastra:** a gestão do hotel (Admin, Gestor CSC no escopo dele e Gerente) e o Implantador no hotel dele. O plano de outro hotel dá 404 pela RLS.

**Telas:**
- planos do hotel, com a próxima data;
- formulário com a prévia das próximas cinco datas;
- pausar, ativar e encerrar;
- os planos de cada ativo na ficha dele.

**Migração (0043):** a tabela, o pgTAP e os casos de isolamento.

**Decisões:**
6. Calendário fixo, ancorado no início, e não a partir da última conclusão? (proposta: fixo)
7. Periodicidade só em dias, semanas e meses (por uso fica para depois do MVP, pergunta 22 ao cliente)? (proposta: sim)
8. O Implantador também cadastra planos no hotel dele? (proposta: sim, porque é ele quem implanta; o pacote da bandeira, PB1, usa esse caminho)

---

## PV3 — Geração automática de OS (ADR-041)

**Migração (0044), em `app.os`:**
- **Colunas novas:**
  - `plano_id`, com FK `(hotel_id, plano_id)`;
  - `ativo_id`, com FK `(hotel_id, ativo_id)`: o ativo da OS preventiva;
  - `data_prevista`;
  - `plano_aplicado` (`jsonb`): a cópia do nome, da periodicidade e da versão do plano, pelo ADR-026.
- **`chamado_id` passa a ser anulável.** Um check exige que a OS seja de um tipo só:
  - corretiva: com chamado e sem plano;
  - preventiva: sem chamado e com plano, ativo e data prevista.
- **FK nova `(hotel_id, local_id)` → `app.local`:** a preventiva não tem chamado. A FK antiga pelo chamado continua valendo para a corretiva; com o chamado nulo, ela não é conferida.
- **`criado_por` anulável,** só na preventiva (check), porque quem gera é o job.
- **Índice único `(hotel_id, plano_id, ativo_id, data_prevista)` na preventiva:** é a idempotência. Inclui a OS cancelada, então a ocorrência cancelada não volta.

**Outras tabelas:**
- `app.os_transicao.usuario_id` passa a ser anulável, só na ação `gerar` (check). O agente do Intelligence é avisado: a transição de geração da preventiva vem sem usuário.
- O `hk_worker` ganha INSERT em `app.os`, `app.os_transicao` e `app.os_checklist`, com policies no tenant do job. A de `app.os` aceita só a OS com plano: o worker não cria corretiva.
- O `hk_worker` ganha SELECT em `app.plano_preventivo` e em `app.checklist_modelo`.
- Os meta-testes 18, 21, 28 e 32 mudam junto.

**O job:**
- **Quando:** a rota `/api/cron/preventiva` volta ao `vercel.json` uma vez por dia, às 05:00 de Brasília (`0 8 * * *`), antes do primeiro turno, com teste (B9).
- **O que roda:** os planos ativos dos hotéis com status `ativo`.
  - O dia é o do fuso do hotel.
  - No plano por categoria, os ativos da categoria no hotel, não desativados e não pendentes de aprovação (M4), resolvidos no dia da geração: um ativo novo da categoria entra sozinho.
- **O que grava:** a OS `atribuida` ao responsável padrão, no local atual do ativo, com a cópia do checklist. Junto, a transição `gerar` sem usuário, a auditoria `os/gerar` e o evento `os.atribuida`. Os eventos ficam no outbox até as notificações da 1c.
- **Uma transação por hotel**, e não por tenant: num grupo de 40 hotéis, o dia 1º do mês pode gerar milhares de OS, e o `hk_worker` tem `statement_timeout` de 30 s. O plano é travado com `for update skip locked`, e o índice único segura uma segunda execução. Esta é a diferença para o ADR-005, que o ADR-041 registra.
- **O resultado** volta por tenant, com geradas e puladas (OS anterior aberta, ocorrência antiga, sem responsável válido, sem ativo). O registro segue o padrão dos outros crons.

**Atraso e acúmulo** (pergunta 23 ao cliente, com a proposta):
- **Não acumula:** se a OS da ocorrência anterior do mesmo plano e ativo ainda está aberta, a nova não é gerada e conta como pulada.
- **Sem avalanche:** com várias ocorrências vencidas (o job ficou parado, ou o plano foi criado com início no passado), só a mais recente é gerada.
- **Responsável inválido** (desativado ou sem papel de Técnico no hotel): o plano não gera e aparece com a pendência na lista de planos.

**A OS preventiva na máquina de estados:**
- **As mesmas transições da corretiva.** O domínio passa a aceitar a OS sem chamado: `decidirNaOs` sem `ChamadoParaRegra`, e nada se reflete em chamado.
- **Aceite** (pergunta 2 do `docs/12`): o Gerente do hotel; sem Gerente, o Gestor CSC ou o Admin, como na C6 sem "quem abriu". A política `os.aceite_automatico` vale igual.
- **Cancelar:** a gestão cancela com motivo. A ocorrência não volta.

**PWA:**
- **O contrato da fila do dia muda:** `chamado` passa a anulável, e entra `preventiva` (plano, data prevista e ativo).
- **O PWA antigo não quebra:** a fila do dia só traz OS preventiva quando o pedido diz que entende (`?preventiva=1`). O PWA que ainda está com o código antigo no aparelho continua lendo a lista, sem ver as preventivas, até atualizar. Um item sem chamado derrubaria a lista inteira no contrato antigo.
- **Na tela:** a OS preventiva mostra o plano, a data prevista e o checklist.

**Web:**
- a página da OS sem chamado (`/os/{id}`), com checklist, fotos e aceite;
- a lista de preventivas do hotel: abertas e atrasadas (data prevista no passado e não concluída).

**Texto proposto do ADR-041:** preventiva por tempo, com calendário fixo ancorado no início. A geração é diária, pelo worker, uma transação por hotel, idempotente pelo índice único (plano, ativo, data prevista), e sem acúmulo: só a ocorrência mais recente, e nenhuma enquanto a anterior estiver aberta. A OS preventiva não tem chamado e guarda a cópia do plano e do checklist. O worker cria só OS com plano.

**Decisões:**
9. Plano por categoria gera uma OS por ativo? (proposta: sim, porque o histórico por ativo alimenta os indicadores e o Intelligence. A "rota" com vários ativos numa OS fica para depois do MVP)
10. Sem acúmulo: não gerar enquanto a anterior está aberta, e, com várias vencidas, só a mais recente? (proposta: sim, até a resposta do cliente à pergunta 23)
11. A OS nasce no dia previsto, sem antecedência? (proposta: sim; antecedência por plano, depois)
12. Aceite da preventiva pelo Gerente, ou pelo Gestor CSC ou pelo Admin sem Gerente? (proposta: sim)
13. Uma transação por hotel no job, e não por tenant? (proposta: sim)

---

## M1 — Modelos de ativo por categoria

- **Tabela `app.modelo_ativo`, do grupo:**
  - a categoria, obrigatória;
  - nome, fabricante e modelo;
  - `campos` pré-preenchidos, validados contra a definição da categoria;
  - `checklist_modelo_id`, anulável;
  - `plano_sugerido` (`jsonb`: só a periodicidade), anulável;
  - `ativa` e `versao`.
- **Quem mexe:** cadastra o Admin do grupo. Leem todos os que cadastram ativo, inclusive o técnico, porque o PWA baixa os modelos com os dados de referência para usar offline.
- **No cadastro do ativo (web e PWA):** escolher o modelo preenche só o que está vazio e nunca sobrescreve. `app.ativo` ganha `modelo_id`, anulável, para a sugestão de plano e os relatórios.
- **Plano sugerido:** nasce pausado, por ativo, no cadastro (aprovado em 08/10/2026), sem responsável. A gestão escolhe o responsável e ativa. Se o hotel já tem um plano da mesma categoria, a sugestão não nasce, para não duplicar.
- **Migração (0045):** a tabela, `app.ativo.modelo_id`, o pgTAP e o isolamento.

**Decisões:**
14. O plano sugerido nasce pausado no cadastro, inclusive pelo PWA, com a auditoria em nome de quem cadastrou? (proposta: sim, como aprovado; a alternativa é a gestão criar pela lista de sugestões)

---

## M2 e M4 — Implantação de ativos: planilha e fila de aprovação

### M2, importação por planilha

- **Formato:** CSV em UTF-8 (com ou sem BOM), separado por ponto e vírgula ou vírgula (o separador sai do cabeçalho), com até 2.000 linhas e 2 MB por envio (`importacao_limite`). XLSX fica para depois: o Excel salva em CSV (pergunta 4 do `docs/12`).
- **Modelo baixado na tela:**
  - colunas fixas: local, edificação, categoria, modelo (M1), nome, fabricante, modelo do fabricante, número de série, data de compra, garantia, criticidade e QR (código reservado, M3, opcional);
  - uma coluna por campo estendido (`campo.<chave>`). Um arquivo pode misturar categorias; preencher campo de outra categoria dá erro na linha.
- **Local que não existe:** recusa a linha (`importacao_local_nao_encontrado`). As UHs vêm do sistema hoteleiro, e as áreas comuns se cadastram antes, na tela (pergunta 5 do `docs/piloto/README.md`).
- **Prévia, depois gravação:**
  - a prévia valida todas as linhas sem gravar e devolve, por linha, os erros com código, coluna e parâmetros;
  - a gravação grava só as linhas válidas, uma unit of work por linha, com auditoria e o evento `ativo.criado`.
- **Sem duplicar:** `app.ativo.chave_importacao`, única por hotel. A chave é o resumo da linha normalizada (local, categoria, nome e série). Reenviar a mesma planilha, ou a planilha com uma linha corrigida, não duplica o que já entrou.
- **Quem importa:** o Implantador e a gestão do hotel. Os ativos importados nascem aprovados.
- **O leitor de CSV fica no domínio,** puro e sem biblioteca externa.
- **Migração:** só a coluna `chave_importacao`, que pode ir junto com a da M4.

### M4, aprovação do cadastro pelo celular

- **`app.ativo.situacao_cadastro`** (`pendente` ou `aprovado`, padrão `aprovado`), sem GRANT de UPDATE. Os ativos que já existem ficam aprovados.
- **A decisão vai numa tabela só de inserção, `app.ativo_decisao_cadastro`:** ativo (único), decisão (`aprovado` ou `recusado`), motivo, quem e quando.
  - O INSERT é só da gestão do hotel. Assim, o técnico, que pode alterar o ativo, não consegue se aprovar (pgTAP por papel).
  - A situação efetiva é o cadastro com a decisão.
- **Política `ativo.aprovacao_do_cadastro`,** por hotel. Ligada, o ativo que chega pela operação `ativo.cadastrar` do PWA nasce pendente. O cadastro no web e a importação nascem aprovados.
- **Recusa:** exige motivo (422 `motivo_obrigatorio`) e desativa o ativo (exclusão lógica) na mesma unit of work. O técnico vê o motivo no PWA.
- **Fila de aprovação:** uma tela por hotel, com aprovar e recusar, e o histórico na ficha do ativo.

**Decisões (as que o `docs/12` manda mostrar antes):**
15. O padrão da política: desligada? (proposta: desligada, como as outras; o Implantador liga no hotel em implantação, se quiser)
16. Quem aprova: Admin do grupo, Gestor CSC e Gerente do hotel, sem o Implantador? (proposta: sim; o Implantador é quem mais cadastra pelo celular)
17. O ativo pendente já recebe chamado? (proposta: sim, porque o defeito é real; ele só fica fora dos planos preventivos até a aprovação)
18. O local que falta na planilha recusa a linha, sem criar o local? (proposta: recusa)
19. Só CSV no MVP? (proposta: sim)

---

## PB1 — Pacote da bandeira (desenho aprovado em 08/10/2026)

Um ajuste de implementação para aprovar: o plano do hotel tem `hotel_id` obrigatório. Por isso, os planos do pacote, por categoria e da bandeira ou do grupo, ficam numa tabela própria (`app.plano_padrao`, com categoria, periodicidade, checklist e `bandeira_id` anulável), copiada para `app.plano_preventivo` ao aplicar o pacote. Os modelos de checklist e de ativo ganham `bandeira_id`, como aprovado.

**Decisões:**
20. Planos do pacote em `app.plano_padrao`, e não um plano com hotel nulo? (proposta: sim)

---

## M3 — QR em lote

- **Folha de etiquetas no web:** escolher o hotel, o local, a categoria ou a importação. A folha é gerada no navegador, como o QR individual (B5), com o código e o nome do ativo, e nunca o id. Tem três tamanhos de etiqueta até a resposta do cliente (pergunta 24). Não pede migração.
- **Códigos reservados (`app.qr_reservado`):** gerar um lote de códigos antes do cadastro, colar as etiquetas e cadastrar o ativo pelo PWA a partir delas.
  - O código não pode coincidir com o de nenhum ativo do grupo: a geração confere as duas tabelas.
  - Offline, o código desconhecido abre "cadastrar ativo com este código". O servidor confere que o código está reservado no hotel e livre (`qr_nao_reservado`, `qr_ja_ligado`).
- **Ativo que já existe:** `app.ativo.codigo_qr` não tem UPDATE. A etiqueta reservada serve só para ativo novo, a menos que se libere a troca do código, que serviria também para a etiqueta danificada.

**Decisões:**
21. Etiqueta reservada só para ativo novo, sem troca do código do ativo existente? (proposta: só para ativo novo no MVP)

---

## Ordem dos PRs

Cada migração vai num PR de zona protegida, um por vez no repositório, combinado pelo diário com o agente do Intelligence. As telas grandes vão num segundo PR, fora da zona protegida, como na I4b e na I8b.

| Ordem | PR de zona protegida | Migração | ADR |
|---|---|---|---|
| 1 | PV1 checklist | 0042 | ADR-040 |
| 2 | PV2 planos | 0043 | ADR-041 (início) |
| 3 | PV3 geração | 0044 | ADR-041 (fim) |
| 4 | M1 modelos de ativo | 0045 | — |
| 5 | M4 e M2 situação do cadastro e chave de importação | 0046 | — |
| 6 | PB1 pacote da bandeira | 0047 | — |
| 7 | M3 códigos reservados | 0048 | — |

A numeração supõe a I8 (0041) mergeada antes. O adendo ao ADR-024 (provisionamento e kit no staging) entra na fila quando o Cesar quiser, entre dois destes.
