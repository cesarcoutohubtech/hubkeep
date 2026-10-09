# 12 — Plano da fase 1b (preventiva e implantação)

Proposta de 06/10/2026, aprovada e liberada pelo Cesar em 07/10/2026. Revista em 08/10/2026 com a revisão de escopo de 07/10 (`docs/referencia/documento-projeto.md`): a etapa I passou de cinco para oito migrações, e entrou o pacote da bandeira. Depois do aval, a execução segue com autonomia, uma etapa por vez, com parada e resumo ao fim de cada etapa. Migração e ADR param no PR para aprovação. Os PRs de zona protegida vão um por vez no repositório inteiro, e `db push` e `config push` são do Cesar.

Fonte do escopo:
- `docs/00`: fase 1b, com planos, checklist tipado, geração de OS, importação e QR em lote, e a implantação de ativos por planilha, celular, modelos por categoria e QR em lote;
- o relatório de lacunas do Intelligence (`docs/referencia/lacunas-instrumentacao-intelligence.md`), com as decisões do Cesar de 05 e 06/10/2026;
- as pendências da 1a que apontam para a 1b, no `docs/05` e no `docs/03`;
- a revisão de 07/10/2026 e a ordem da instrumentação de 08/10/2026 (`docs/referencia/registro-de-decisoes.md`).

## Regras da fase

- **As mesmas da 1a** (`docs/05`):
  - telas funcionais, sem acabamento visual;
  - configuração em vez de código;
  - toda tabela nova com o modelo do `docs/02` e os seis casos de isolamento;
  - todo texto pelo catálogo nos quatro idiomas;
  - toda operação do técnico pela fila offline (ADR-025).
- **Kit de teste:** cada tarefa que muda o que o usuário vê entra no script de demonstração (`scripts/ops/dados-demonstracao.ts`) e no roteiro do `docs/10`, no mesmo PR.
- **Instrumentação antes de tudo** (Cesar, 05/10/2026; ordem revista em 08/10/2026): as oito migrações da etapa I entram antes de qualquer outra tarefa da 1b, na ordem abaixo.
- **Fora da 1b:**
  - SLA com herança de políticas, notificações, indicadores, impressão da OS e CSV (fase 1c);
  - o nível bandeira das políticas (1c, com o SLA);
  - preventiva por uso ou por medidor: o `docs/00` fala em preventiva por tempo;
  - nada de fase 2: custos e alçadas, portal do fornecedor, estoque, inspeções com OS automática. O fornecedor mínimo (nome, CNPJ, contato) entrou no MVP em 07/10/2026 (I3).
- **Ambiente:** só o dev. O staging chega com a F0-12, na preparação do piloto (`docs/13`).

## Decisões transversais (antes das etapas)

| Decisão | Proposta | Usada em |
|---|---|---|
| **Campos tipados comuns** (ADR-028, aprovado) | O checklist usa os mesmos tipos do campo estendido do ativo (`packages/dominio/src/campos-tipados.ts`): texto curto, número com unidade, data, lista e sim/não, com rótulos nos quatro idiomas. | PV1, PV2, M1 |
| **Cópia no registro** (ADR-026, aprovado) | A OS preventiva guarda a cópia do checklist e do plano que a geraram. Mudar o modelo ou o plano não altera OS já gerada. | PV1, PV3 |
| **Preventiva gerada pelo worker** (ADR-005, aprovado) | A geração roda uma vez por dia, no `hk_worker`, um tenant por transação, com `for update skip locked`. A rota de cron volta ao `vercel.json` só quando a tarefa PV3 existir (B9 do `docs/11`). | PV3 |
| **Origem da OS** (relatório de lacunas) | A OS preventiva não tem chamado; ela se reconhece pelo plano (`plano_id`). Hoje `app.os.chamado_id` é `not null`, e a PV3 muda isso com a exigência de um dos dois. | PV3 |
| **Política por hotel, herança hotel → grupo** (ADR-026 e o adendo de 06/10/2026) | As obrigatoriedades novas (códigos na OS, checklist completo) são políticas desligadas por padrão, resolvidas pelo registro de políticas. | I6, PV1 |

## Etapa I — Instrumentação

As oito migrações da fila de zona protegida, nesta ordem (Cesar, 05 e 06/10/2026; ordem revista em 08/10/2026). Cada uma vai num PR de zona protegida, um por vez, com a migração, o pgTAP e os tipos do banco. O uso de cada coluna vai no mesmo PR: domínio, caso de uso, contrato, tela e kit. O detalhe das originais está no relatório de lacunas.

- **Desenho antes do código:** I2, I3, I4 (na parte nova: UH indisponível e fornecedor) e I8 só começam depois da aprovação do desenho pelo Cesar. As propostas vão curtas, uma por item.
- **Depois da I7,** a fila de zona protegida abre para as tabelas do Intelligence (agente do Kaio: `app.insight`, `app.metrica_ativo_diaria` e a ligação do job), combinado pelo diário.
- **Numeração nova (08/10/2026).** A antiga I2 (chamado e OS) é a I4; a antiga I3 (transições) é a I5; a antiga I4 (códigos) é a I6; a antiga I5 (`licenca.modulo`) é a I7. Os diários anteriores a 08/10 usam a numeração antiga.

| Tarefa | O quê | Aceite | Migração | ADR |
|---|---|---|---|---|
| **I1** Ativo: compra, garantia e criticidade | `app.ativo` ganha `data_compra`, `garantia_ate` e `criticidade` (1 a 5, `check`), todas anuláveis, com UPDATE para quem já edita o ativo. Os nomes dos níveis vêm do catálogo, e o tenant troca os nomes pela política `ativo.criticidade`. No PWA, os três campos ficam na parte recolhida do cadastro. | Criticidade fora de 1 a 5 é recusada pelo banco e, antes, pelo domínio, com código. Quem não escreve no hotel não altera as colunas novas (pgTAP, por papel). O nome do nível cai para o catálogo quando a política não tem o idioma. | Sim | — |
| **I2** Hotel e local: modelo contratual e edificação (novo, 07/10) | `app.hotel.modelo_contratual`, anulável, com `check` em `proprio`, `administrado`, `arrendado` e `afiliado`: nulo quer dizer "não informado", e o painel de implantação mostra a pendência. Grava o Admin do grupo; o conector não mexe. No MVP, só rótulo e filtro. `app.local.edificacao`, texto opcional de até 60 caracteres, com sugestão das edificações que já existem no hotel; vale para UH e área comum, e o conector não sobrescreve. Desenho aprovado em 08/10/2026 (`docs/referencia/propostas-desenho-1b.md`, item 1). | Valores canônicos no domínio, com teste de paridade. Hotéis existentes ficam nulos. Só o Admin do grupo grava o modelo (pgTAP, por papel). A edificação entra na busca do local. Operação offline antiga continua válida. | Sim | — |
| **I3** Fornecedor mínimo (novo, 07/10) | `app.fornecedor`, do grupo: nome, CNPJ opcional (único no grupo quando informado, com o dígito conferido no domínio), contato opcional (nome, telefone e e-mail) e desativação lógica. Lê quem lê algum hotel do grupo, menos o proprietário; cadastram o Admin do grupo, o Gestor CSC e o Gerente do hotel. Portal, contrato, avaliação e custos ficam para a fase 2. Desenho aprovado em 08/10/2026 (item 2). | CNPJ inválido dá 422 com código; repetido no grupo, 409. Os seis casos de isolamento; o proprietário não lê. O contato entra na auditoria. | Sim: tabela nova | — |
| **I4** Chamado e OS: origem, impacto no hóspede, UH indisponível, quem executa e custo | `app.chamado` ganha `origem` (`interno` por padrão, sem UPDATE) e `impacto_hospede` (anulável). `app.os` ganha `executado_por` (`equipe_interna` ou fornecedor, ligado à I3) e `custo_informado` (`numeric(12,2)`, em reais). Novo: `app.uh_indisponivel` (UH, chamado, início e fim), no modelo da parada do ativo: a pergunta "a UH ficou indisponível?" na abertura, no web e no PWA; o fim marcado por quem conclui a OS ou pela gestão do hotel, e não automático; o chamado cancelado encerra o período e fica fora dos UH-dias. A função `uhDiasPerdidos` passa para o `packages/dominio`. Triagem e aceite no web; a pergunta "afeta hóspede?" na abertura, também no PWA. Desenho da parte nova aprovado em 08/10/2026 (itens 2 e 3). Em dois PRs (09/10/2026): a I4, de zona protegida, com a migração, o domínio, a API e os testes; e a I4b, fora dela, com as telas do web e do PWA. | Os valores canônicos ficam no domínio, com teste de paridade com o banco. O fornecedor é exigido quando quem executa não é a equipe interna. Custo negativo é recusado com código. O UPDATE das colunas novas segue quem tria e quem aceita (pgTAP, por papel). Operação offline antiga, sem os campos, continua válida. | Sim | — |
| **I5** Transições da OS | `app.os_transicao` (de, para, quando, quem e a ação), só com INSERT, gravada pelo caso de uso na mesma unit of work que muda o estado da OS. Lida pelo `hk_app` no recorte da OS e pelo `hk_worker` no tenant do job. Fonte do MTTR e do Intelligence. | Toda transição da corretiva grava uma linha, com teste de integração. Ninguém altera nem apaga uma transição (sem UPDATE nem DELETE, meta-testes). Os seis casos de isolamento. O worker lê só o tenant do contexto. | Sim: tabela nova | — |
| **I6** Códigos de falha, causa e solução | `app.codigo_manutencao` (tipo, categoria opcional, nomes por idioma, chave padrão e ativa), cadastrada pelo Admin do grupo, com os padrões por categoria no catálogo. `app.os` ganha os três códigos, com FK composta. A política `os.codigos_obrigatorios`, por hotel, fica desligada por padrão. No PWA, os códigos são sugestão. | A conclusão no PWA nunca é recusada por falta de código. Com a política ligada, o aceite cobra os códigos (a confirmar com o Cesar, abaixo). Código de outra categoria é recusado pelo domínio. Os seis casos de isolamento; só o Admin do grupo grava. | Sim: tabela nova | — |
| **I7** Módulos contratados | `licenca.modulo` (tenant, módulo e vigência), gravada pelo `hk_backoffice` e lida pelo `hk_app` e pelo `hk_worker` no próprio tenant. Até o backoffice existir, a gravação é por script de operação. A montagem do Intelligence passa a registrar a extensão das políticas só para quem tem o módulo contratado. | O tenant sem o módulo não vê nem grava as chaves `inteligencia.*` (teste de integração). O `hk_app` não grava a tabela. Os seis casos de isolamento. A tabela entra nas exceções e na lista fechada do meta-teste. | Sim: tabela nova | Talvez: o filtro por módulo no adendo ao ADR-026 |
| **I8** Foto antes ou depois e assinatura (novo, 07/10) | `app.anexo.momento`, anulável, com `check` em `antes` e `depois`, só para anexo de OS; no PWA, a sugestão segue o estado da OS, e o técnico pode trocar. A política `os.foto_depois_obrigatoria`, por hotel, desligada por padrão, pede uma foto "depois" na conclusão (sem rede, a foto vai pela fila). A assinatura é desenhada no aceite, no web, por quem aceita, e gravada como anexo imutável da OS do tipo `assinatura`; o aceite guarda o id. A política `os.assinatura_no_aceite`, por hotel, desligada por padrão. É evidência do aceite, e não assinatura digital ICP-Brasil. Desenho aprovado em 08/10/2026 (item 4). | Com as políticas desligadas, nada muda. Com a da foto ligada, a conclusão sem foto "depois" é recusada com código; com a da assinatura ligada, o aceite sem assinatura também. Fotos existentes ficam sem momento. Operação offline antiga continua válida. | Sim | — |
| **I9** Hora do aparelho nas transições feitas sem rede (novo, 08/10) | As operações offline de início, pausa, retomada e conclusão mandam a hora em que foram feitas no aparelho. A transição grava essa hora em `quando`. O domínio ajusta, sem recusar (uma recusa travaria a fila do aparelho): a hora no futuro vira a do servidor, e a anterior à última transição da OS vira a dela. Sem a hora (operação antiga na fila), vale a do servidor. Decisão do Cesar de 08/10/2026. | Um dia offline grava as transições com as horas do aparelho, em ordem. Relógio adiantado ou atrasado não desordena nem põe transição no futuro. Operação offline antiga continua válida. | Não | — |

Fim da etapa I: resumo e aviso ao agente do Kaio, no diário, com os nomes reais dos campos para o `historico.ts`.

## Etapa PV — Preventiva

| Tarefa | O quê | Aceite | Migração | ADR |
|---|---|---|---|---|
| **PV1** Checklist tipado | Modelo de checklist do tenant: itens com os tipos comuns (ADR-028), rótulo nos quatro idiomas, marca de obrigatório e versão. A OS guarda a cópia do checklist aplicado e as respostas. Respondido no PWA, offline, com a operação `os.responder_checklist`. A obrigatoriedade de completar o checklist antes da conclusão é política por hotel, desligada por padrão. | Resposta fora do tipo do item dá 422 com código. Mudar o modelo não altera a OS que já tem o checklist. Um dia offline sincroniza as respostas sem duplicar. Com a política ligada, a conclusão sem os itens obrigatórios é recusada com código. Isolamento. | Sim: modelo e respostas | Novo: checklist tipado (modelo versionado e cópia na OS) |
| **PV2** Planos preventivos | Plano por ativo ou por categoria num hotel: periodicidade por tempo (dias, semanas, meses), checklist, responsável padrão (técnico ou equipe) e data de início. Ativar, pausar e encerrar, com desativação lógica. Quem gere o hotel cadastra. | Periodicidade inválida dá 422 com código. O plano de outro hotel dá 404. Pausar não apaga o histórico. Isolamento. | Sim: `app.plano_preventivo` | Novo: preventiva por tempo (com PV3) |
| **PV3** Geração automática de OS | O job diário do worker gera a OS preventiva de cada plano vencido, com a cópia do plano e do checklist, atribuída ao responsável padrão e com o evento `os.atribuida` no outbox. A geração é idempotente por plano e por data prevista. A OS preventiva não tem chamado. | Rodar o job duas vezes no mesmo dia não duplica a OS. Plano pausado não gera. Hotel desativado ou em implantação não gera. A OS preventiva segue a mesma máquina de estados da corretiva, sem o aceite do solicitante. O worker só grava no tenant do contexto. A rota volta ao `vercel.json` com teste. | Sim: `plano_id` e `data_prevista` em `app.os`, `chamado_id` anulável com a exigência de um dos dois, e GRANT do worker | O mesmo de PV2 |

Fim da etapa PV: resumo.

## Etapa M — Implantação

| Tarefa | O quê | Aceite | Migração | ADR |
|---|---|---|---|---|
| **M1** Modelos por categoria | Modelo de ativo por categoria: fabricante, modelo, campos estendidos preenchidos, checklist e plano preventivo sugeridos. No cadastro (web e PWA), escolher o modelo preenche o formulário, e o plano sugerido nasce pausado, para quem gere o hotel ativar. | O modelo nunca sobrescreve o que já foi digitado. O plano sugerido só passa a gerar OS depois de ativado. Rótulos nos quatro idiomas. Isolamento. | Sim: `app.modelo_ativo` | — |
| **M2** Importação de ativos por planilha | O Implantador ou quem gere o hotel envia uma planilha (CSV com o cabeçalho do modelo baixado na tela) com local, categoria, modelo, campos estendidos e QR opcional. Primeiro uma prévia linha a linha, com os erros por código, depois a gravação por unit of work, com auditoria. | Linha inválida não grava nada daquela linha, e a prévia diz o porquê com código. Enviar a mesma planilha de novo não duplica ativo (chave de importação por linha). Local de outro hotel é recusado. Limite de linhas por envio, com código. | Talvez: chave de importação | Talvez: formato e limites da importação |
| **M3** QR em lote | Gerar e imprimir os QR de vários ativos de uma vez (por hotel, local ou importação), com o código e o nome do ativo na etiqueta. A imagem e a folha de impressão são geradas no cliente, como o QR individual (B5). Também é possível gerar códigos antes de cadastrar e ligar a etiqueta ao ativo pelo PWA. | O lote só traz ativos do escopo do usuário. A etiqueta não revela o id do ativo. O código pré-gerado e ainda não ligado abre a tela de ligação no PWA, e não um ativo. | Talvez: código reservado sem ativo | — |
| **M4** Aprovação de ativos cadastrados pelo celular | Junto com a M2. O ativo cadastrado pelo PWA entra como pendente de aprovação, e a central aprova ou recusa, a recusa com motivo, tudo com auditoria. A exigência de aprovação é política por hotel (regra 7). Os ativos que já existem passam a aprovados. **Antes de codificar, mostrar ao Cesar as propostas:** o padrão da política, quem aprova (entre Admin do grupo, Gestor CSC, Gerente do hotel e Implantador) e se o ativo pendente já pode receber chamado. | Ativo do PWA com a política ligada nasce pendente; com ela desligada, aprovado. Recusa sem motivo dá 422 com código. Quem não aprova no hotel não aprova (pgTAP, por papel). Os ativos anteriores à migração ficam aprovados. Operação offline antiga continua válida. | Sim: situação do cadastro no ativo | Talvez: aprovação do cadastro |

Fim da etapa M: resumo.

**M4, o que já existe no ativo (conferido em 07/10/2026):** `app.ativo` não tem situação de cadastro. Tem só `desativado_em` (exclusão lógica) e `versao` (concorrência), e nenhum dos dois serve para pendente ou recusado sem confundir com desativado. O modelo mais próximo é o `status` de `app.local` (`ativo`, `pendente_licenca`, `inativo`), com `check` e valores canônicos no domínio, que a M4 pode seguir numa coluna nova.

## Etapa PB — Pacote da bandeira (novo, 07/10/2026; depois da M1, decisão do Cesar de 08/10/2026)

| Tarefa | O quê | Aceite | Migração | ADR |
|---|---|---|---|---|
| **PB1** Pacote da bandeira | Sem tabela de pacote: modelos de ativo (M1), checklists (PV1) e planos por categoria (PV2) ganham `bandeira_id` opcional, e nulo vale para o grupo inteiro. "Aplicar o pacote ao hotel": modelos e checklists só ficam filtrados pela bandeira do hotel; os planos por categoria são copiados para o hotel, pausados, e reaplicar só acrescenta o que falta. O Admin do grupo mantém o pacote; o Implantador aplica pelo painel de implantação, que registra quando o hotel entrou em implantação e quando ficou pronto, para medir a meta de 1 dia sem o levantamento de ativos. Desenho aprovado em 08/10/2026 (item 5). | A cópia segue o ADR-026: mudar o pacote não altera o hotel já implantado. Reaplicar não duplica nem sobrescreve. Os planos copiados nascem pausados. Isolamento. | Sim: `bandeira_id` nos modelos, checklists e planos | — |

Fim da etapa PB e da fase 1b: resumo, com a lista do que ficou para a 1c.

## Dependente do cliente: conector real do TOTVS

| Tarefa | O quê | Depende de |
|---|---|---|
| **T1** Conector real | O agente lê as views reais do CM (`vw_hubkeep_hoteis` e a de UHs) e envia os lotes pela rota de ingestão que já existe (F0-08). Nada é escrito no CM (regra 8). | **As views do cliente.** Sem elas no ambiente do cliente, a tarefa não começa. Até lá, o fallback por planilha segue valendo. |

## Resumo de migrações e ADRs

- **Migrações previstas** (cada uma para no PR):
  - I1 a I8, uma por PR, na ordem da etapa I (I1, I2, I3 e I5 já no main; a I9 não tem migração);
  - PV1, PV2 e PV3;
  - M1;
  - PB1, depois da M1;
  - M4 (situação do cadastro no ativo);
  - talvez M2 e M3.
- **ADRs:**
  - novo: checklist tipado, com modelo versionado e cópia na OS (PV1);
  - novo: preventiva por tempo e geração idempotente pelo worker (PV2 e PV3);
  - talvez: formato e limites da importação (M2);
  - talvez: aprovação do cadastro de ativo (M4);
  - talvez: o filtro por módulo contratado no adendo ao ADR-026 (I7);
  - ADR-039 (P1b), aprovado em 08/10/2026;
  - os desenhos de I2, I3, I4 (parte nova), I8 e PB1 foram aprovados em 08/10/2026 sem ADR novo; um ADR entra se a implementação pedir.
- **Os ADR-033 a 037** (Intelligence) e o texto do adendo ao ADR-026 foram aprovados pelo Cesar em 07/10/2026, com duas condições no ADR-036 e no insight de rede que aguardam o aceite do Kaio (`docs/03`).

## Registrado para a fase 1c

O plano da 1c está no `docs/13-plano-fase-1c.md`, com a auditoria geral registrada aqui em 07/10/2026.

## A confirmar com o Cesar

1. **Cobrança dos códigos (I6):** com a política `os.codigos_obrigatorios` ligada, os códigos são cobrados no aceite, e não na conclusão do técnico (relatório de lacunas, decisões de 05/10/2026).
2. **Aceite da OS preventiva:** quem aceita, já que ela não tem quem abriu. A proposta é o Gerente do hotel, ou, sem Gerente, o Gestor CSC, como na C6.
3. **Modelos por categoria (M1):** a leitura deste plano é modelo de ativo para acelerar a implantação, com checklist e plano sugeridos. Se o cliente pensava em modelo de checklist por categoria apenas, a M1 encolhe.
4. **Planilha (M2):** só CSV no MVP, com o modelo baixado na tela, ou também XLSX.

## Perguntas para a reunião com o cliente

Entraram em `docs/referencia/perguntas-cliente.md` (22 a 24):
- As periodicidades usadas hoje (dias, semanas, meses) e se existe preventiva por uso (horas de funcionamento), que ficaria para depois do MVP.
- Se a OS preventiva atrasada pode ser gerada de novo, ou só a próxima.
- O formato da etiqueta de QR (tamanho e o que vai impresso) e a impressora usada na implantação.
