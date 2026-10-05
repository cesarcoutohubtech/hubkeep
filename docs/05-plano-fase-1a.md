# 05 — Plano da fase 1a (corretiva)

Proposta de 26/09/2026, revista com as decisões do Cesar sobre o plano (ADRs 026 a 029 aprovados com condições, A4 e B6 decididos). Depois de aprovada, a execução segue com autonomia, uma etapa por vez, com parada e resumo ao fim de cada etapa. Migração e ADR param no PR para aprovação; `db push` e `config push` são do Cesar.

Fonte do escopo: `docs/00` (fase 1a: ativos, chamados, OS, parada, aceite, auditoria, telas de administração) e as decisões do Cesar de 26/09/2026.

## Regras da fase

- **Telas funcionais, sem acabamento visual.** O layout definitivo vem do protótipo validado com o cliente, feito fora do repositório.
- **Configuração em vez de código.** O que o cliente pode querer mudar (status, prioridades, campos, prazos) nasce como configuração ou política, nunca fixo no código. Nada de `if (tenant === ...)` (regra 7).
- **Tabelas novas.** Toda tabela nova segue o modelo de RLS do `docs/02` e tem os seis casos de isolamento no pgTAP.
- **Textos.** Todo texto sai do catálogo (regra 11). Todo código de erro novo tem mensagem nos quatro idiomas; o `tests/i18n-codigos.test.ts` reprova se faltar.
- **Técnico offline.** Toda operação do técnico passa pela fila offline (ADR-025), com o tipo no contrato `PedidoDeOperacaoOffline` e teste de reenvio sem duplicar.
- **Fora da 1a:**
  - views reais do TOTVS;
  - SLA com herança de políticas e notificações (fase 1c);
  - preventiva, importação e QR em lote (fase 1b);
  - nada de fase 2.
- **Ambiente:** só o dev.

## Decisões transversais (antes das etapas)

Quatro decisões atravessam as etapas. Foram aprovadas pelo Cesar em 26/09/2026, com condições, e estão escritas no `docs/03` (ADR-026 a 029). A busca (ADR-030) e o proprietário de hotel (ADR-031) também estão lá.

| ADR | Assunto | Proposta | Usada em |
|---|---|---|---|
| 026 | Políticas configuráveis | Tabela `app.politica` (tenant, escopo grupo/bandeira/hotel, chave, valor `jsonb`). Formato de cada chave validado no domínio. Mudança auditada. Na 1a, resolução hotel → grupo → padrão; a estrutura já comporta o nível bandeira (1c), sem migração nova. **O chamado guarda uma cópia da política na abertura** (prioridade, prazo, regras aplicadas): mudar a política não altera chamado já aberto. | A7, C1, C2, C6 |
| 027 | Status e prioridades configuráveis | O domínio tem **estados canônicos fixos**, porque o SLA e os indicadores dependem deles (ex.: aberto, em triagem, em execução, aguardando aceite, concluído, cancelado). O tenant configura **situações** com nome, ordem e cor, cada uma ligada a um estado canônico. As transições valem entre estados canônicos e são regra do domínio. As **prioridades** são do tenant (nome, ordem, peso). **Nomes em quatro idiomas**, com volta ao nome padrão do catálogo. | C1 a C7 |
| 028 | Campos estendidos de ativo | A **categoria** define os campos: texto curto, número com unidade, data, lista ou sim/não, com a marca de obrigatório. **Os mesmos tipos do checklist tipado da 1b**, num módulo comum do domínio. **Rótulos em quatro idiomas.** Valores em `jsonb`, validados pela aplicação. Sem EAV nem função no banco. | B2, B3 |
| 029 | Concorrência e conflito | Coluna `versao` nas tabelas editadas por mais de uma pessoa (chamado, OS, ativo). O `UPDATE ... WHERE versao = $esperada` falha com `conflito_de_versao` (409). No PWA, **a recusa segue o fluxo do ADR-025**: aparece para o técnico, com o código, até ele dispensar. | B3, C2 a C6 |

A **busca** é por trecho, com `pg_trgm` (ADR-030): coluna normalizada pela aplicação e índice GIN de trigramas, com termo mínimo de 3 caracteres. O **proprietário de hotel inteiro** tem tabela própria de vínculo com vigência, calculada na fonte por `authz.locais_proprietario()` (ADR-031).

## Etapa A — Estrutura e administração

| Tarefa | O quê | Aceite | Migração | ADR |
|---|---|---|---|---|
| **A1** Ativação de hotel a partir do staging | Lista dos hotéis do staging (`entidade = 'hotel'`) ainda não ativados, com a comparação campo a campo com `app.hotel`. O Admin do grupo ativa: cria ou atualiza `app.hotel` e passa a `ativo`. A licença de hotéis (`max_hoteis`) é checada no domínio (`saldoDeHoteis`, como o de UHs). Sem saldo, a ativação é bloqueada com código próprio e publica `licenca.sem_saldo` no outbox, para avisar a EasyGov. Ao ativar, as UHs `pendente_licenca` do hotel são reavaliadas. Fallback por planilha (adaptador de CSV da F0-08). | Ativa com saldo, bloqueia sem saldo (409 com código), o Implantador não ativa, e a RLS barra a ativação mesmo com a checagem da aplicação removida (padrão da F0-06). As UHs pendentes viram `ativo` quando há saldo. | Talvez: índice para a busca de pendentes | — |
| **A2** Bandeiras | Criar, renomear e desativar (desativação lógica) bandeiras e ligar hotel a bandeira, pelo Admin do grupo. A troca de bandeira muda o escopo do Gestor CSC da bandeira (ADR-011). | Isolamento da troca de bandeira: o gestor da bandeira antiga deixa de ver o hotel na transação seguinte. Desativada, a bandeira não aparece para escolha. | Sim: `ativa` em `app.bandeira` | — |
| **A3** Usuários e papéis | Telas de membros: lista por escopo, convite (a API da F0-05 já existe), concessão e revogação de papel (casos de uso da F0-06, agora com rota), desativação de membro e troca de validade do Implantador. | As regras de escalada da F0-06 valem na tela e na API. O membro desativado perde o acesso na hora (RLS). Toda ação fica na auditoria. | Não | — |
| **A4** Proprietários | Cadastro de proprietário, vínculo com UHs (`app.local_proprietario`, já existe) e **vínculo com hotel inteiro** (`app.hotel_proprietario`, com vigência), ambos pelo Admin do grupo. A função `authz.locais_proprietario()` passa a incluir os locais dos hotéis vinculados (ADR-031). | O proprietário só vê as próprias UHs, ou o hotel dele, e não grava. A vigência encerrada tira o acesso. UH nova do CM no hotel vinculado entra no escopo sem ação manual. Seis casos de isolamento para a tabela nova. Meta-teste 11 atualizado. | Sim: `app.hotel_proprietario` e a função | 031 |
| **A5** Fluxos do Implantador | O Implantador de um hotel (com validade) cadastra usuários abaixo do próprio papel, locais, ativos e QR, e não ativa hotel nem libera licença. Um painel de implantação do hotel mostra o que falta: locais sem ativo, ativos sem categoria, pessoas sem papel. | Com a validade vencida, perde o acesso de escrita. Tentativa de concessão acima do próprio papel dá 403 com código. O painel reflete o cadastro. | Não | — |
| **A6** Equipes do hotel | Equipe (nome e membros) por hotel. A OS é atribuída a um técnico ou a uma equipe (C3), e a produtividade por equipe da 1c usa isso. | Isolamento por hotel. Técnico em mais de uma equipe. Desativação lógica. | Sim: `app.equipe`, `app.equipe_membro` | — |
| **A7** Configuração do tenant e do hotel | Telas para idioma, país, subdivisão e moeda do tenant e do hotel (colunas da F0-10b), fuso do hotel e as primeiras políticas: prioridade padrão por categoria (C1) e aceite automático, que fica desligado (C6). | Política gravada e resolvida pelo domínio, hotel → grupo → padrão. Valor fora do formato do domínio dá 422 com código. A mudança de política fica na auditoria. | Sim: `app.politica` | 026 |

Fim da etapa A: resumo com as telas, as rotas, as migrações aplicadas no dev e o que ficou pendente.

## Etapa B — Locais e ativos

| Tarefa | O quê | Aceite | Migração | ADR |
|---|---|---|---|---|
| **B1** Locais | UHs vindas do CM, em que os campos do TOTVS são só leitura e o `pendente_licenca` fica visível ao admin. Áreas comuns cadastradas à mão, com desativação lógica. Pendência da A4 (Cesar, 28/09/2026): o hotel vinculado por inteiro, ainda sem nenhum local, passa a aparecer para o proprietário. | UH pendente não recebe chamado (regra do `docs/00`, conferida em C2). Área comum não conta licença. Isolamento por hotel. Proprietário do hotel inteiro vê o hotel sem locais, e não vê outros. | Talvez: corpo de `authz.locais_proprietario()` (ADR-031, meta-teste 11b) | 031 |
| **B2** Categorias e campos estendidos | Categorias do tenant, com os campos estendidos definidos por categoria, nos tipos comuns com o checklist da 1b e com rótulos nos quatro idiomas. As categorias padrão vêm do catálogo. | Definição inválida dá 422 com código. A mudança de definição não quebra ativo já cadastrado: o campo novo obrigatório só vale para gravações novas. O rótulo cai para o padrão do catálogo quando falta no idioma. | Sim: `app.categoria_ativo` | 028 |
| **B3** Ativos | Cadastro no web e no PWA, com local, categoria, campos estendidos, fabricante, modelo e número de série. O cadastro pelo celular é operação offline (`ativo.cadastrar`, `ativo.alterar`). | Os campos estendidos são validados contra a categoria. A operação offline não duplica o ativo (reenvio). Conflito de versão aparece no aparelho. Isolamento. | Sim: `app.ativo` | 029 |
| **B3c** Mover ativo dentro do hotel | Decisão do Cesar (28/09/2026). Ação própria de mover o ativo para outro local **do mesmo hotel**, só por quem gere o hotel (Admin, Gestor CSC, Implantador e Gerente, no escopo), com a versão (ADR-029), auditada e com registro de cada movimentação: origem, destino, quando e quem. O `hotel_id` continua imutável. Entre hotéis, continua desativar e cadastrar de novo. | Move dentro do hotel e grava a movimentação e a auditoria na mesma unit of work. Destino em outro hotel é recusado pela FK composta, mesmo sem a checagem da aplicação. O técnico e o solicitante não movem (403 com código). O proprietário da UH antiga deixa de ver o ativo na transação seguinte, e o da nova passa a ver. Seis casos de isolamento para a tabela nova. | Sim: GRANT de UPDATE em `app.ativo.local_id` e `app.ativo_movimentacao` | Adendo ao ADR-011 (exceção no meta-teste 18 só para `app.ativo.local_id`) |
| **B4** Anexos de local e ativo | Tabela de anexos, que registra o arquivo do Storage na unit of work (consequência do ADR-024), com upload pelo fluxo da F0-10 e miniatura gerada no navegador, no PWA e no web (Cesar, 28/09/2026). | Anexo de outro hotel dá 404. O anexo aparece no registro e na auditoria. O download do proprietário vale para a UH dele (pendência do ADR-024). | Sim: `app.anexo` | Talvez: ajuste do ADR-024 para o proprietário |
| **B5** QR individual | Código curto e aleatório por ativo, único no tenant, com a rota `tecnico.hubkeep.com.br/q/<codigo>`, que abre o ativo pela API respeitando o escopo. A imagem do QR é gerada no cliente. O QR em lote fica para a 1b. | Código de outro tenant ou fora do escopo dá 404. O código não revela o id do ativo. O QR impresso abre o ativo no PWA, inclusive offline, se o ativo estiver no aparelho. | Sim: `codigo_qr` em `app.ativo` | — |
| **B6** Busca sem acento | Coluna `busca` (sem acento e minúscula), gravada pela aplicação com a função de `packages/i18n`, em locais, ativos e chamados, com índice GIN de trigramas (`pg_trgm`). Locais e ativos na B6 (migração 0019); o chamado ganha a coluna na C2, junto com a tabela. | "acucar" acha "Açúcar", e "frig" acha "Refrigerador". Termo com menos de 3 caracteres dá código próprio. Nenhuma função nova no projeto: o meta-teste 11 continua fechado. Um meta-teste novo fecha a lista de extensões. | Sim: extensão, colunas e índices | 030 |

Fim da etapa B: resumo.

## Etapa C — Corretiva

| Tarefa | O quê | Aceite | Migração | ADR |
|---|---|---|---|---|
| **C1** Domínio da corretiva | Máquina de estados do chamado e da OS no `packages/dominio`: estados canônicos, transições e quem pode fazer cada uma, por papel. Situações configuráveis por tenant, prioridades do tenant e a prioridade padrão por categoria como política (A7). Só domínio e contratos, sem tela. | Testes de domínio para toda transição, permitida e proibida, por papel. A política de prioridade é resolvida hotel → grupo → padrão. | Sim: `app.situacao`, `app.prioridade` | 027 |
| **C2** Chamado | Abertura mínima: local obrigatório, ativo opcional, descrição e foto opcional. Pode abrir quem tem escrita no hotel, incluindo o Solicitante. A prioridade padrão vem da política, e **a cópia da política aplicada fica no chamado** (ADR-026). No PWA, a abertura é operação offline (`chamado.abrir`). Não se abre chamado para UH `pendente_licenca`. | Reenvio da operação offline não duplica o chamado. Mudar a política depois da abertura não altera o chamado. Chamado na UH pendente dá 422 com código. Isolamento: o proprietário vê o chamado da UH dele, ou do hotel dele, e não grava. | Sim: `app.chamado` (com a coluna `busca` e o índice de trigramas, ADR-030) | 026, 029, 030 |
| **C3** Triagem e atribuição | O Gestor CSC ou o Gerente do hotel classificam, ajustam a prioridade e geram a OS, atribuída a técnico ou equipe (A6). Cancelamento com motivo. | Só os papéis com permissão fazem a triagem, pelo domínio e pela RLS. A OS nasce com a auditoria e o evento `os.atribuida` no outbox, para a notificação da 1c. | Sim: `app.os` | — |
| **C4** Execução da OS no PWA | Fila do dia real, com as OS do técnico e da equipe dele guardadas no aparelho. Iniciar, pausar, apontar horas, fotos (anexos, B4), materiais em texto livre e concluir. Todas são operações offline. | Um dia inteiro offline sincroniza sem duplicar horas nem fotos. Uma OS reatribuída no servidor, com a operação offline na fila, gera conflito visível ao técnico. Ao sair, apaga a fila do dia do aparelho (ADR-025, ajuste (b)). | Sim: `app.os_apontamento`, `app.os_material` | — |
| **C5** Equipamento parado | Registro de parada do ativo (início e fim), ligado ao chamado ou à OS, feito na abertura ou na execução. | A parada aberta aparece no ativo e na lista. O tempo parado é calculado no domínio, porque o indicador fica para a 1c. Não há duas paradas abertas no mesmo ativo (restrição de integridade). | Sim: `app.parada_ativo` | — |
| **C6** Aceite | Quem abriu, ou o Gerente do hotel, aceita a OS concluída ou reabre com motivo. O aceite automático depois de N dias fica como política desligada; o job que o executa entra na 1c, com o SLA. | Reaberta, a OS volta ao estado de execução com a auditoria do motivo. Só quem pode aceita (domínio e RLS). | Sim, não prevista: 0026, para a RLS deixar quem abriu o chamado gravar o aceite e para o último motivo de reabertura na OS; 0027, para o Gestor CSC ler as atribuições de Gerente dos hotéis dele (Gerente único no aceite) (ADR-027, bloco da C6) | — |
| **C7** Telas do CSC e do hotel | Listas de chamados e OS pelo escopo do usuário, com filtros básicos (hotel, situação, prioridade, período) e o detalhe com a linha do tempo. | Cada papel vê só o próprio escopo, com teste por papel. Todo texto do catálogo, incluindo o pseudo-idioma. | Não | — |

Fim da etapa C: resumo.

### Kit de teste no notebook do Cesar (entre as etapas C e D)

Decisão do Cesar (28/09/2026). Ao fim da etapa C, antes de começar a D, preparar um kit para o Cesar testar a aplicação no notebook dele, ligada ao projeto de dev (`HubKeep-dev`). **O trabalho para quando o kit estiver pronto**, e a etapa D só começa com o aval dele.

**Pronto em 30/09/2026:** `docs/10-kit-de-teste.md` (variáveis, comandos, o que o script cria e o roteiro por papel) e `pnpm demo:dados --ambiente dev`.

- **Variáveis do `.env.local`** do web e do PWA: a lista completa, com onde achar cada valor (painel do Supabase, cofre de senhas dos papéis, Vercel) e o que não pode ir para o git.
- **Script de dados de demonstração, só para o dev:**
  - recusa rodar fora do dev (ambiente declarado, ADR-020);
  - cria um tenant de demonstração, hotéis, bandeira, locais, categorias, ativos e, depois da etapa C, chamados e OS;
  - cria **um usuário por papel** (Admin do grupo, Gestor CSC, Implantador, Gerente, Técnico, Solicitante, proprietário de UH e de hotel inteiro) **sem e-mail**: conta no Auth com a confirmação já feita e senha de teste, sem convite enviado;
  - grava pelas unit of work da aplicação (auditoria e outbox), nunca por INSERT direto;
  - pode rodar de novo sem duplicar.
- **Roteiro de teste por papel:** o que cada um deve conseguir fazer e o que deve ser barrado, tela por tela, no web e no PWA, incluindo o PWA sem rede.
- **Comandos do PowerShell** para instalar, subir o web (`localhost:3000`) e o PWA (`localhost:5173`) e rodar o script de demonstração.

## Etapa D — Auditoria

| Tarefa | O quê | Aceite | Migração | ADR |
|---|---|---|---|---|
| **D1** Auditoria por registro | `GET /api/v1/auditoria?entidade=&registroId=` e a linha do tempo no detalhe de hotel, local, ativo, chamado e OS: quem, quando, a ação (pelo catálogo) e o que mudou (antes e depois). | Quem não vê o registro não vê a auditoria dele: 404, pela RLS. O proprietário vê a da UH dele. As ações e os campos saem traduzidos. | Talvez: policy de leitura da auditoria para o proprietário | — |

**D1, como foi feita (30/09/2026):** a leitura do proprietário entrou na migração 0028, com o pgTAP 023. A rota é `GET /api/v1/auditoria?entidade=&registroId=`, e o botão "Ver histórico" fica no detalhe do chamado e de cada OS, nos locais, nos ativos, na configuração do hotel e na lista de hotéis. O que cada linha mostra sai do domínio (`packages/dominio/src/auditoria.ts`): o antes gravado com o nome da coluna e o depois com o nome do domínio viram o mesmo campo, e o uso da licença na ativação bloqueada não aparece. A configuração do hotel passou a gravar o antes, para o histórico mostrar o que mudou.

Fim da etapa D e da fase 1a: resumo, com a lista do que ficou para a 1b e a 1c.

## Segurança antes do piloto e do rollout (ADR-032)

Condições 4 e 5 da aprovação do ADR-032 (Cesar, 29/09/2026). As tarefas S1 (modelo de ameaças e borda do web, PR #59) e S2 (certificado do banco, limite do corpo e actions por SHA) foram feitas antes da C3. As de baixo não fazem parte das etapas A a D, mas **o piloto só começa com SP1 a SP3 feitas**, e o rollout, com SP4. O detalhe de cada uma está no `docs/09`.

| Tarefa | O quê | Aceite | Quando | Pendência no `docs/09` |
|---|---|---|---|---|
| **SP1** MFA obrigatório | TOTP obrigatório para Admin do grupo, Gestor CSC e Implantador. Sem o segundo fator, a sessão desses papéis não chega ao nível exigido (AAL2) e a API recusa com código. | Cada um dos três papéis é barrado sem MFA, com teste por papel; os demais papéis seguem sem exigência. Recuperação do segundo fator definida. | Antes do piloto | P4 |
| **SP2** CSP de script no PWA | CSP com `script-src` sem `unsafe-inline` no `apps/tecnico`, compatível com o service worker e o build do Vite. | Build de produção sem violação de CSP no console, online e offline; teste que prende os cabeçalhos do `vercel.json`. | Antes do piloto | P5 |
| **SP3** Rate limiting | Decisão de onde e com que ferramenta limitar (Auth do Supabase, Vercel Firewall, Upstash na `rota()`), junto com a contratação do Vercel Pro, e implantação do que for decidido. | Decisão registrada em ADR, com custo; limite ativo nas rotas escolhidas, com teste do 429. | Antes do piloto, com o Vercel Pro | P1 |
| **SP4** Pentest | Teste de intrusão por terceiro, no ambiente de staging, com o escopo do `docs/09`. | Relatório recebido; achados críticos e altos corrigidos e retestados. | Antes do rollout | P3 |

## Depois do piloto: integrações externas (EasyTools e feedback externo)

**O Reputation foi descontinuado como produto separado** (Cesar, 30/09/2026). O contrato com ele fica arquivado como descontinuado em `docs/referencia/contrato-integracao-reputation-v0.1.md`, sem apagar. As três tarefas abaixo continuam valendo: servem ao EasyTools e, depois, à entrada de feedback externo do HubKeep Intelligence (versão 1.5 do PRD). Os exemplos do contrato seguem úteis como referência do formato.

**Não implementar antes do piloto** (Cesar, 30/09/2026). As três tarefas abaixo são a base comum das integrações. A mesma credencial, a mesma rota de entrada e a mesma entrega de eventos vão servir depois ao EasyTools (`docs/00`, que hoje só reserva a coluna `app.hotel.easytools_hotel_id`). Por isso nada aqui pode ser específico do Reputation: o sistema de origem é um dado do pareamento, e não um `if` no código (regra 7).

| Tarefa | O quê | Aceite | Depende de |
|---|---|---|---|
| **IX1** Credencial de integração por tenant | O Admin do grupo aprova o pareamento, e isso cria a credencial `hk_int_<tenant>_<segredo>` do tenant e do sistema de origem, junto com o segredo de assinatura dos webhooks. O segredo aparece uma vez só e é guardado só como hash (modelo da credencial do agente conector). Revogar o pareamento revoga a credencial e para a entrega, sem apagar nada. A credencial só cria chamado com origem externa e lê a situação dos chamados que ela criou. | Tabela nova com `tenant_id`, RLS e isolamento no pgTAP. Só o Admin do grupo pareia e revoga, com teste por papel. Credencial revogada ou de outro tenant é recusada com `credencial_invalida`. Criação e revogação vão para a auditoria. | ADR (novo tipo de credencial e o escopo dela); migração |
| **IX2** Rota de entrada de chamados com origem externa | `POST /api/v1/integracoes/chamados` com `Idempotency-Key` abre o chamado no hotel pareado pelo mesmo caso de uso da abertura, com a origem (sistema, id do caso, fonte) gravada no chamado. `localReferencia` tenta achar a UH ou a área; se não achar, o chamado fica sem local, para a triagem resolver. Categoria e severidade são só sugestão: prioridade, prazo e atribuição saem das políticas do HubKeep. | O mesmo `Idempotency-Key` devolve o mesmo chamado. Os códigos `credencial_invalida` (401), `hotel_nao_pareado` (403), `entrada_invalida` (422) e `limite_de_pedidos` (429) têm mensagem no catálogo. Nenhum dado pessoal é aceito além da descrição. O simulador do sistema de origem fica no repositório do HubKeep, com os exemplos do contrato. | IX1; SP3 (o 429); migração (origem do chamado) |
| **IX3** Entrega de eventos por webhook assinado | Um handler do outbox envia os eventos do contrato (de `hubkeep.chamado.criado` a `hubkeep.chamado.cancelado`) só dos chamados de origem externa, para o endereço do pareamento. Cada envio leva `X-HubKeep-Assinatura` (HMAC-SHA256 do corpo) e `X-HubKeep-Evento-Id`. Enquanto a resposta não for 2xx, há nova tentativa com espera crescente. O corpo leva a `versao` do chamado, para o destino ignorar um estado mais antigo. | O simulador confere a assinatura. Depois de uma falha, o evento é reentregue sem duplicar do lado que recebe. Os eventos vão só para o tenant e o pareamento certos. Os eventos de domínio que o outbox já grava cobrem os oito do contrato, ou os que faltam são criados. | IX1; ADR (endereço externo e segredo de assinatura, com as ameaças no `docs/09`) |

Antes da IX2, as pendências da seção 8 do contrato continuam a decidir, agora com o EasyTools e a entrada de feedback:
- limite de pedidos por minuto;
- área comum identificada só pelo nome;
- mais de um caso por chamado;
- consulta de hotéis, locais e ativos.

Cada ambiente pareia só com o equivalente: dev com dev, nunca produção com dev.

## Resumo de migrações e ADRs

- **Migrações previstas** (cada uma para no PR): A2, A4, A6, A7, B2, B3, B3c, B4, B5, B6, C1, C2, C3, C4, C5 e talvez D1. Onde der, as migrações de uma mesma tarefa vão juntas, para reduzir as paradas.
- **ADRs:** 026 a 029 aprovados com condições; 030 (`pg_trgm`) e 031 (proprietário de hotel) decididos pelo Cesar, com texto para aprovação; talvez um ajuste do ADR-024 (B4, download do proprietário); adendo ao ADR-011 (B3c, mover ativo dentro do hotel); ajuste de texto do ADR-025 (dados de referência guardados no aparelho, B3b). ADR-032 (segurança da borda do web, S1) aprovado com condições em 29/09/2026.

## Perguntas para a reunião com o cliente

A lista completa, por tema, está em `docs/referencia/perguntas-cliente.md`; pergunta nova entra lá.

- **Equipamento do proprietário na UH (condo-hotel):** os equipamentos da UH podem ser do proprietário. Quando um deles sai da UH (B3c, mover ativo), a movimentação precisa ficar visível para ele? No MVP, o proprietário não lê o histórico de movimentações (Cesar, 28/09/2026): o ativo só deixa de aparecer para ele.
- **Aceite da OS aberta e executada pelo próprio técnico** (ex.: problema achado em ronda): precisa do aceite de outra pessoa, ou pode ter aceite automático com a foto de depois? No MVP, precisa de outra pessoa (C6, Gerente do hotel ou, sem Gerente, Gestor CSC ou Admin). **Se o cliente quiser o aceite automático, ele entra como política configurável** (`app.politica`, ADR-026), desligada por padrão, e não como regra fixa para um cliente.

## Decisões do Cesar sobre o plano (26/09/2026)

1. **ADRs 026 a 029:** aprovados, com as condições que estão nos ADRs e na tabela acima:
   - cópia da política no chamado;
   - nomes e rótulos em quatro idiomas, com volta ao catálogo;
   - tipos comuns com o checklist da 1b;
   - recusa pelo fluxo do ADR-025.
2. **A4:** tabela própria de vínculo proprietário-hotel com vigência, calculada na fonte pelas funções de autorização (ADR-031), com migração e testes de isolamento.
3. **B6:** busca por trecho, com `pg_trgm` (ADR-030).
4. **Execução:** depois do merge do plano, a etapa A segue com autonomia, nas regras do diário, com parada ao fim da etapa.
