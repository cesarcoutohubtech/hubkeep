# 12 — Plano da fase 1b (preventiva e implantação)

Proposta de 06/10/2026, para a aprovação do Cesar. A fase 1b só começa com o aval dele, depois do teste do kit. Depois do aval, a execução segue com autonomia, uma etapa por vez, com parada e resumo ao fim de cada etapa. Migração e ADR param no PR para aprovação. Os PRs de zona protegida vão um por vez no repositório inteiro, e `db push` e `config push` são do Cesar.

Fonte do escopo:
- `docs/00`: fase 1b, com planos, checklist tipado, geração de OS, importação e QR em lote, e a implantação de ativos por planilha, celular, modelos por categoria e QR em lote;
- o relatório de lacunas do Intelligence (`docs/referencia/lacunas-instrumentacao-intelligence.md`), com as decisões do Cesar de 05 e 06/10/2026;
- as pendências da 1a que apontam para a 1b, no `docs/05` e no `docs/03`.

## Regras da fase

- **As mesmas da 1a** (`docs/05`):
  - telas funcionais, sem acabamento visual;
  - configuração em vez de código;
  - toda tabela nova com o modelo do `docs/02` e os seis casos de isolamento;
  - todo texto pelo catálogo nos quatro idiomas;
  - toda operação do técnico pela fila offline (ADR-025).
- **Kit de teste:** cada tarefa que muda o que o usuário vê entra no script de demonstração (`scripts/ops/dados-demonstracao.ts`) e no roteiro do `docs/10`, no mesmo PR.
- **Instrumentação antes de tudo** (Cesar, 05/10/2026): as cinco migrações da etapa I entram antes de qualquer outra tarefa da 1b, na ordem abaixo.
- **Fora da 1b:**
  - SLA com herança de políticas, notificações, indicadores, impressão da OS e CSV (fase 1c);
  - o nível bandeira das políticas (1c, com o SLA);
  - preventiva por uso ou por medidor: o `docs/00` fala em preventiva por tempo;
  - nada de fase 2: custos, fornecedores, estoque, inspeções com OS automática.
- **Ambiente:** só o dev.

## Decisões transversais (antes das etapas)

| Decisão | Proposta | Usada em |
|---|---|---|
| **Campos tipados comuns** (ADR-028, aprovado) | O checklist usa os mesmos tipos do campo estendido do ativo (`packages/dominio/src/campos-tipados.ts`): texto curto, número com unidade, data, lista e sim/não, com rótulos nos quatro idiomas. | P1, P2, M1 |
| **Cópia no registro** (ADR-026, aprovado) | A OS preventiva guarda a cópia do checklist e do plano que a geraram. Mudar o modelo ou o plano não altera OS já gerada. | P1, P3 |
| **Preventiva gerada pelo worker** (ADR-005, aprovado) | A geração roda uma vez por dia, no `hk_worker`, um tenant por transação, com `for update skip locked`. A rota de cron volta ao `vercel.json` só quando a tarefa P3 existir (B9 do `docs/11`). | P3 |
| **Origem da OS** (relatório de lacunas) | A OS preventiva não tem chamado; ela se reconhece pelo plano (`plano_id`). Hoje `app.os.chamado_id` é `not null`, e a P3 muda isso com a exigência de um dos dois. | P3 |
| **Política por hotel, herança hotel → grupo** (ADR-026 e o adendo de 06/10/2026) | As obrigatoriedades novas (códigos na OS, checklist completo) são políticas desligadas por padrão, resolvidas pelo registro de políticas. | I4, P1 |

## Etapa I — Instrumentação do Intelligence

As cinco migrações da fila de zona protegida, nesta ordem (Cesar, 05 e 06/10/2026). Cada uma vai num PR de zona protegida, um por vez, com a migração, o pgTAP e os tipos do banco. O uso de cada coluna vai no mesmo PR: domínio, caso de uso, contrato, tela e kit. O detalhe de cada uma está no relatório de lacunas.

| Tarefa | O quê | Aceite | Migração | ADR |
|---|---|---|---|---|
| **I1** Ativo: compra, garantia e criticidade | `app.ativo` ganha `data_compra`, `garantia_ate` e `criticidade` (1 a 5, `check`), todas anuláveis, com UPDATE para quem já edita o ativo. Os nomes dos níveis vêm do catálogo, e o tenant troca os nomes pela política `ativo.criticidade`. No PWA, os três campos ficam na parte recolhida do cadastro. | Criticidade fora de 1 a 5 é recusada pelo banco e, antes, pelo domínio, com código. Quem não escreve no hotel não altera as colunas novas (pgTAP, por papel). O nome do nível cai para o catálogo quando a política não tem o idioma. | Sim | — |
| **I2** Chamado e OS: origem, impacto no hóspede, quem executa e custo | `app.chamado` ganha `origem` (`interno` por padrão, sem UPDATE) e `impacto_hospede` (anulável). `app.os` ganha `executado_por` (`equipe_interna` ou `terceiro`), `terceiro_nome` e `custo_informado` (`numeric(12,2)`, em reais). Triagem e aceite no web; a pergunta "afeta hóspede?" na abertura, também no PWA. | Os valores canônicos ficam no domínio, com teste de paridade com o banco. O nome do terceiro é exigido quando quem executa é terceiro. Custo negativo é recusado com código. O UPDATE das colunas novas segue quem tria e quem aceita (pgTAP, por papel). Operação offline antiga, sem os campos, continua válida. | Sim | — |
| **I3** Transições da OS | `app.os_transicao` (de, para, quando, quem e a ação), só com INSERT, gravada pelo caso de uso na mesma unit of work que muda o estado da OS. Lida pelo `hk_app` no recorte da OS e pelo `hk_worker` no tenant do job. | Toda transição da corretiva grava uma linha, com teste de integração. Ninguém altera nem apaga uma transição (sem UPDATE nem DELETE, meta-testes). Os seis casos de isolamento. O worker lê só o tenant do contexto. | Sim: tabela nova | — |
| **I4** Códigos de falha, causa e solução | `app.codigo_manutencao` (tipo, categoria opcional, nomes por idioma, chave padrão e ativa), cadastrada pelo Admin do grupo, com os padrões por categoria no catálogo. `app.os` ganha os três códigos, com FK composta. A política `os.codigos_obrigatorios`, por hotel, fica desligada por padrão. No PWA, os códigos são sugestão. | A conclusão no PWA nunca é recusada por falta de código. Com a política ligada, o aceite cobra os códigos (a confirmar com o Cesar, abaixo). Código de outra categoria é recusado pelo domínio. Os seis casos de isolamento; só o Admin do grupo grava. | Sim: tabela nova | — |
| **I5** Módulos contratados | `licenca.modulo` (tenant, módulo e vigência), gravada pelo `hk_backoffice` e lida pelo `hk_app` e pelo `hk_worker` no próprio tenant. Até o backoffice existir, a gravação é por script de operação. A montagem do Intelligence passa a registrar a extensão das políticas só para quem tem o módulo contratado. | O tenant sem o módulo não vê nem grava as chaves `inteligencia.*` (teste de integração). O `hk_app` não grava a tabela. Os seis casos de isolamento. A tabela entra nas exceções e na lista fechada do meta-teste. | Sim: tabela nova | Talvez: o filtro por módulo no adendo ao ADR-026 |

Fim da etapa I: resumo e aviso ao agente do Kaio, no diário, com os nomes reais dos campos para o `historico.ts`.

## Etapa P — Preventiva

| Tarefa | O quê | Aceite | Migração | ADR |
|---|---|---|---|---|
| **P1** Checklist tipado | Modelo de checklist do tenant: itens com os tipos comuns (ADR-028), rótulo nos quatro idiomas, marca de obrigatório e versão. A OS guarda a cópia do checklist aplicado e as respostas. Respondido no PWA, offline, com a operação `os.responder_checklist`. A obrigatoriedade de completar o checklist antes da conclusão é política por hotel, desligada por padrão. | Resposta fora do tipo do item dá 422 com código. Mudar o modelo não altera a OS que já tem o checklist. Um dia offline sincroniza as respostas sem duplicar. Com a política ligada, a conclusão sem os itens obrigatórios é recusada com código. Isolamento. | Sim: modelo e respostas | Novo: checklist tipado (modelo versionado e cópia na OS) |
| **P2** Planos preventivos | Plano por ativo ou por categoria num hotel: periodicidade por tempo (dias, semanas, meses), checklist, responsável padrão (técnico ou equipe) e data de início. Ativar, pausar e encerrar, com desativação lógica. Quem gere o hotel cadastra. | Periodicidade inválida dá 422 com código. O plano de outro hotel dá 404. Pausar não apaga o histórico. Isolamento. | Sim: `app.plano_preventivo` | Novo: preventiva por tempo (com P3) |
| **P3** Geração automática de OS | O job diário do worker gera a OS preventiva de cada plano vencido, com a cópia do plano e do checklist, atribuída ao responsável padrão e com o evento `os.atribuida` no outbox. A geração é idempotente por plano e por data prevista. A OS preventiva não tem chamado. | Rodar o job duas vezes no mesmo dia não duplica a OS. Plano pausado não gera. Hotel desativado ou em implantação não gera. A OS preventiva segue a mesma máquina de estados da corretiva, sem o aceite do solicitante. O worker só grava no tenant do contexto. A rota volta ao `vercel.json` com teste. | Sim: `plano_id` e `data_prevista` em `app.os`, `chamado_id` anulável com a exigência de um dos dois, e GRANT do worker | O mesmo de P2 |

Fim da etapa P: resumo.

## Etapa M — Implantação

| Tarefa | O quê | Aceite | Migração | ADR |
|---|---|---|---|---|
| **M1** Modelos por categoria | Modelo de ativo por categoria: fabricante, modelo, campos estendidos preenchidos, checklist e plano preventivo sugeridos. No cadastro (web e PWA), escolher o modelo preenche o formulário, e o plano sugerido nasce pausado, para quem gere o hotel ativar. | O modelo nunca sobrescreve o que já foi digitado. O plano sugerido só passa a gerar OS depois de ativado. Rótulos nos quatro idiomas. Isolamento. | Sim: `app.modelo_ativo` | — |
| **M2** Importação de ativos por planilha | O Implantador ou quem gere o hotel envia uma planilha (CSV com o cabeçalho do modelo baixado na tela) com local, categoria, modelo, campos estendidos e QR opcional. Primeiro uma prévia linha a linha, com os erros por código, depois a gravação por unit of work, com auditoria. | Linha inválida não grava nada daquela linha, e a prévia diz o porquê com código. Enviar a mesma planilha de novo não duplica ativo (chave de importação por linha). Local de outro hotel é recusado. Limite de linhas por envio, com código. | Talvez: chave de importação | Talvez: formato e limites da importação |
| **M3** QR em lote | Gerar e imprimir os QR de vários ativos de uma vez (por hotel, local ou importação), com o código e o nome do ativo na etiqueta. A imagem e a folha de impressão são geradas no cliente, como o QR individual (B5). Também é possível gerar códigos antes de cadastrar e ligar a etiqueta ao ativo pelo PWA. | O lote só traz ativos do escopo do usuário. A etiqueta não revela o id do ativo. O código pré-gerado e ainda não ligado abre a tela de ligação no PWA, e não um ativo. | Talvez: código reservado sem ativo | — |

Fim da etapa M e da fase 1b: resumo, com a lista do que ficou para a 1c.

## Dependente do cliente: conector real do TOTVS

| Tarefa | O quê | Depende de |
|---|---|---|
| **T1** Conector real | O agente lê as views reais do CM (`vw_hubkeep_hoteis` e a de UHs) e envia os lotes pela rota de ingestão que já existe (F0-08). Nada é escrito no CM (regra 8). | **As views do cliente.** Sem elas no ambiente do cliente, a tarefa não começa. Até lá, o fallback por planilha segue valendo. |

## Resumo de migrações e ADRs

- **Migrações previstas** (cada uma para no PR):
  - I1 a I5, uma por PR, na ordem da etapa I;
  - P1, P2 e P3;
  - M1;
  - talvez M2 e M3.
- **ADRs:**
  - novo: checklist tipado, com modelo versionado e cópia na OS (P1);
  - novo: preventiva por tempo e geração idempotente pelo worker (P2 e P3);
  - talvez: formato e limites da importação (M2);
  - talvez: o filtro por módulo contratado no adendo ao ADR-026 (I5).
- **Os ADR-033 a 037** (Intelligence) e o texto do adendo ao ADR-026 aguardam a aprovação do Cesar. A etapa I não depende deles para a migração, só para o uso pelo Intelligence.

## A confirmar com o Cesar

1. **Cobrança dos códigos:** com a política `os.codigos_obrigatorios` ligada, os códigos são cobrados no aceite, e não na conclusão do técnico (relatório de lacunas, decisões de 05/10/2026).
2. **Aceite da OS preventiva:** quem aceita, já que ela não tem quem abriu. A proposta é o Gerente do hotel, ou, sem Gerente, o Gestor CSC, como na C6.
3. **Modelos por categoria (M1):** a leitura deste plano é modelo de ativo para acelerar a implantação, com checklist e plano sugeridos. Se o cliente pensava em modelo de checklist por categoria apenas, a M1 encolhe.
4. **Planilha (M2):** só CSV no MVP, com o modelo baixado na tela, ou também XLSX.

## Perguntas para a reunião com o cliente

Entraram em `docs/referencia/perguntas-cliente.md` (22 a 24):
- As periodicidades usadas hoje (dias, semanas, meses) e se existe preventiva por uso (horas de funcionamento), que ficaria para depois do MVP.
- Se a OS preventiva atrasada pode ser gerada de novo, ou só a próxima.
- O formato da etiqueta de QR (tamanho e o que vai impresso) e a impressora usada na implantação.
