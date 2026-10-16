# Material do piloto

Material de apoio ao piloto da Slaviero, escrito sobre o que existe na `main` em 08/10/2026 e atualizado em 12/10/2026 com as entregas da 1b até o #194 e em 13/10/2026 com as entregas da 1b e da 1c até o #228 (seções "O que a 1b já entregou" e "O que a 1c já entregou"). Convenção: **[ainda não existe]** é o que não está no código; **[vai mudar na 1b]** é o que o plano da fase 1b (`docs/12-plano-fase-1b.md`) altera; **[a definir]** e **[a confirmar]** são decisões em aberto.

1. `manual-por-papel.md`: manual curto de Técnico (PWA), Solicitante, Gerente do hotel, Gestor CSC e Admin do grupo, com a tabela de quem faz o quê.
2. `guia-implantacao-hotel.md`: implantação de UM hotel, etapa por etapa, o que o CSC e o hotel fazem, e os critérios de "hotel pronto".
3. `modelo-ativos-criticos.csv`: planilha modelo de ativos críticos (UTF-8 com BOM, separador `;`, 12 linhas fictícias).
4. `roteiro-treinamento.md`: sessões, pré-requisitos, exercícios com o kit de teste, aceite, problemas e feedback.
5. Para decisões de fase e escopo, ver `docs/12-plano-fase-1b.md`; para o kit, `docs/10-kit-de-teste.md`.

## O que ainda vai mudar

**[vai mudar na 1b]**
- Geração automática da OS preventiva (PV3): os planos preventivos já se cadastram (PV2, #220 e #222), mas ainda não geram OS. Quando a PV3 entrar, a OS preventiva chega à fila do técnico; o manual será atualizado.

**HubKeep Intelligence no piloto (decidido pelo Cesar em 15/10/2026)**
- **O módulo fica ativo desde o primeiro dia do piloto, sem cobrança.** O contrato do módulo tem a mesma data do primeiro contrato do núcleo, e as telas abrem 60 dias depois.
- A contratação não tem tela: até o backoffice existir, é gravada pelo script de operação `pnpm ops:modulo`, que hoje só roda no dev.
- O job calcula desde o primeiro dia, mas as telas só abrem na data da política `inteligencia.visibilidade_telas`: por padrão, 60 dias depois da primeira ativação, e só para o Admin do grupo e o Gestor CSC (decisão do Cesar de 12/10/2026). O Admin vê e muda a data em **HubKeep Intelligence → Abertura das telas**.
- **O código de solução se preenche desde o primeiro dia**, em toda OS corretiva, mesmo com a política "Códigos obrigatórios no aceite" desligada. A efetividade das intervenções conta como intervenção a OS com o código "Troca do equipamento" (decisão de Cesar e Kaio de 15/10/2026; tela na linha "efetividade" abaixo). Sem o código preenchido, a intervenção não aparece, e o que ficou sem código não se recupera depois. O treinamento cobre isso (`roteiro-treinamento.md`).

**[ainda não existe]**
- Importação de ativos por planilha (M2), QR em lote e etiqueta de impressão (M3), modelos por categoria (M1), aprovação de ativos cadastrados pelo celular (M4).
- Geração automática da OS preventiva (PV3). O checklist (PV1) e o cadastro dos planos (PV2) já existem.
- Painel do SLA: o prazo de atendimento e o de solução já são calculados (1c) e aparecem na ficha do chamado, e o monitor já registra o prazo em risco e o vencido, mas o selo na ficha, o painel dos avisos, as notificações, os indicadores, a impressão da OS e o aceite automático (job) ainda vêm na fase 1c. As políticas de SLA e de escalonamento não têm tela.
- Recuperação de senha (1c, `docs/11`), segundo fator para Admin, Gestor CSC e Implantador (SP1, `docs/05`), e-mail de produção, staging e produção (F0-12).
- Staging: o provisionamento de cliente e o kit por turma já aceitam `--ambiente staging` (#196), mas recusam até o staging existir (bloco `[remotes.staging]` do `supabase/config.toml`, F0-12).
- Foto no chamado (a API existe; nenhuma tela usa), leitura do QR que preenche o chamado, edição da prioridade padrão por categoria pela tela, telas para instalar situações e prioridades padrão e para criar a credencial do agente.
- Conector real do TOTVS (T1, depende das views do cliente); o fallback de hotéis e UHs é CSV.
- Colunas de campos estendidos e chave de importação da planilha: **[a definir na M2]**.

## O que a 1b já entregou (até 12/10/2026)

Cada entrega que muda as telas atualiza este material. As marcas **[vai mudar na 1b]** dessas entregas saíram dos três documentos.

| Etapa | PR | O que muda para o usuário |
|---|---|---|
| I1 | #133, #136 | Ativo com **Data da compra**, **Garantia até** e **Criticidade** (1 a 5, ou "Sem criticidade"), no web e no PWA (parte recolhida "Compra, garantia e criticidade"). Na configuração, "Nomes dos níveis de criticidade do ativo" (só o Admin). |
| I2 | #140 | **Modelo contratual** do hotel (Próprio, Administrado, Arrendado, Afiliado ou Não informado), na configuração do hotel (só o Admin), na lista de hotéis e como pendência do painel de implantação. **Edificação (opcional)** no local, na área comum e também na UH. |
| I3 | #141, #171, #191 | Cadastro de **Fornecedores** do grupo (Admin, Gestor CSC e Gerente gravam; o Gestor CSC sem nenhum hotel no escopo é recusado), com CNPJ numérico ou alfanumérico. |
| I4 | #151, #152 | **Afeta hóspede?** na abertura do chamado e na triagem; **UH indisponível** (marcar na abertura pelo PWA ou na gestão pelo web; liberar na conclusão da OS ou pelo web); **Quem executa** a OS (equipe interna ou fornecedor); **Custo informado (R$)** no aceite, opcional. |
| I5, I9 | #135, #138 | Sem tela nova: as transições da OS e a hora do aparelho na ação feita sem rede. |
| I6 | #173, #174 | **Códigos de manutenção** (falha, causa e solução): cadastro pelo Admin, sugestão do técnico na OS, os três campos no aceite e a política "Códigos obrigatórios no aceite" (desligada por padrão). |
| I7 | #175, #176 | Módulos contratados do grupo (`licenca.modulo`), sem tela. Sem o módulo, as políticas do Intelligence não aparecem. |
| Intelligence | #182 a #194 | Item **HubKeep Intelligence** no menu, no grupo "Módulo opcional", só com o módulo contratado e para quem decide insight (Admin do grupo, Gestor CSC e Gerente do hotel): lista de insights, página do insight com "Por que estou vendo isso?" e a decisão, e detalhe do ativo. O job diário roda às 03:00 de Brasília. |
| Intelligence | #212 | As telas só abrem na data da política `inteligencia.visibilidade_telas` (padrão: 60 dias depois da primeira ativação do módulo, à meia-noite de Brasília) e só para os papéis dela (padrão: Admin do grupo e Gestor CSC; o Gerente entra só por configuração). Antes, o item do menu só aparece para o Admin do grupo e leva à página **Abertura das telas**, onde ele vê a data e a muda. |
| Intelligence | #253, #255 | O que os números do módulo contam (glossário de métricas, versão 3): o chamado cancelado fica fora dos scores, mesmo com OS; o custo informado e a cobertura dele contam só as corretivas aceitas (o aceite automático conta); o tempo parado aparece como "Tempo parado do ativo", em horas com uma casa decimal; e o dia de cada métrica é o do fuso do hotel. O que já foi calculado antes não muda. |
| Intelligence | atividade 3 | Sem tela nova: `pnpm demo:historico --ambiente dev` grava o "Grupo Demonstração — Intelligence", com seis hotéis, seis meses de chamados e os insights de cada sinal do motor, já em estados diferentes (novo, em revisão, aceito, em ação, resolvido e descartado). As telas do módulo já abrem nesse grupo, e as contas são as do kit, com a senha de teste. Serve para treinar o módulo antes da data de abertura do cliente. A linha do tempo dos chamados desse grupo mostra a data da geração, não a do histórico. Do notebook até o dev, a gravação leva de 3 a 4 horas (15/10/2026: 3h44); se a conexão cair, o mesmo comando, com o mesmo `--fim`, continua do último dia gravado. |
| Intelligence | ajustes do motor (15/10/2026) | Sem tela nova. O sinal "Mesmo modelo com muitos chamados" só aparece para modelo com pelo menos 10 ativos instalados e pelo menos 30% deles com chamado em 90 dias, e a frase da evidência diz quantos estão instalados. O sinal de crescimento da mesma falha só aparece no hotel com 60 dias de chamados; com o módulo desde o primeiro dia, isso coincide com a abertura das telas. |
| Intelligence | efetividade (15/10/2026) | **Efetividade das intervenções** abaixo da lista de insights, **Intervenções neste ativo** no detalhe do ativo e **Efetividade da intervenção** na página do insight (só quando há intervenção depois da primeira detecção dele). Intervenção é a OS corretiva concluída com o código de solução "Troca do equipamento" (o Admin acrescenta outros códigos na política `inteligencia.efetividade`). A tabela mostra o chamado, quem executou e o custo da OS, o ativo, quando, os chamados e o tempo parado antes e depois, o custo das corretivas com "custo informado em X de Y OS" (abaixo de 50% num dos lados, "Dados insuficientes") e a variação observada, com a ressalva de que ela não prova a causa. Só para quem decide insight do hotel do ativo; as intervenções dos últimos 180 dias. |
| Intelligence | efetividade versão 4 (16/10/2026) | Sem tela nova. Na tabela da efetividade, o chamado da própria intervenção (a OS da troca) não conta nos chamados, nas reaberturas, no tempo parado nem no custo do "antes". Um ativo com menos de 3 chamados de falha antes da troca mostra "Sem base de comparação". |
| I8 | #193, #198 | **Foto antes ou depois:** no PWA, cada foto da OS leva o **Momento da foto** (Antes do serviço ou Depois do serviço), e a OS Atribuída já aceita foto. **Assinatura no aceite:** no web, o bloco **Aceite** traz o quadro "Assinatura de quem aceita" (dedo, caneta ou mouse; **Limpar assinatura**), e a OS aceita mostra "Aceite com assinatura" e **Ver assinatura**. Duas políticas novas, desligadas por padrão: "Foto de depois na conclusão" e "Assinatura no aceite". |
| Provisionamento e kit | #196 | Sem tela: `pnpm ops:provisionar` cria o grupo do cliente, o contrato de licença, o primeiro Admin (que recebe o convite) e os padrões (categorias, situações e prioridades, códigos de manutenção e a prioridade padrão por categoria). `pnpm demo:dados --turma N` cria o "Grupo Demonstração — Turma N", com e-mails próprios. Os dois rodam no dev e, quando existir, no staging. |
| Edificação no PWA | #200 | O PWA mostra o local como "nome · edificação" na fila do dia, na OS, nos ativos e na abertura do chamado. |
| Responsáveis | #201 | Em **Gerar OS** e **Reatribuir**, o grupo "Pessoas" do **Responsável** mostra só os Técnicos do hotel. |
| PV1 | #203, #210 | **Checklists** (menu Cadastros, só o Admin do grupo grava): modelos com itens de texto, número (com unidade), data, sim/não e lista, inclusive o item de conformidade (Conforme, Não conforme, Não se aplica); mudar os itens cria uma versão nova. Quem faz a triagem aplica o modelo na OS (**Aplicar checklist**, **Trocar checklist** enquanto não há resposta); o técnico responde no PWA, com a OS em execução ou pausada, também sem rede (**Salvar respostas**). Política nova, desligada por padrão: "Checklist completo na conclusão". |
| PV2 | #220, #222 | **Preventivas** (menu Cadastros; Admin do grupo, Gestor CSC, Gerente do hotel e Implantador): **Novo plano** com **Nome do plano**, **Ativo ou categoria** (a categoria vale para todos os ativos dela no hotel), **A cada** N dias, semanas ou meses, **Primeira data prevista** (com a prévia das **Próximas datas previstas**), **Checklist** e **Responsável padrão** (Técnico ou equipe); **Ativar já** precisa do responsável. Na lista, "Próxima: data", **Alterar**, **Ativar**, **Pausar** e **Encerrar** (sem volta; o alvo não muda: para trocar, encerrar e cadastrar outro). Na ficha do ativo, **Ver planos preventivos**. O plano ainda não gera OS (PV3). |

**O kit de teste ainda não tem dados da I4 nem da I8** (UH indisponível, custo, fornecedor na OS, foto com momento, assinatura): os exercícios do roteiro usam o que a turma cria na hora. O checklist já está no kit: o "Ar-condicionado desligando sozinho" (OS em execução do Centro) tem o checklist do ar-condicionado, sem resposta.

## O que a 1c já entregou (até 13/10/2026)

A 1c entra no treinamento porque o piloto só começa depois dela. Aqui só o que muda para o usuário até o #228.

| Entrega | PR | O que muda para o usuário |
|---|---|---|
| Nível bandeira | #204 | Em **Configuração e políticas**, a política pode ser gravada também na bandeira do hotel (**Gravar na bandeira**, **Voltar a herdar na bandeira**). Vale o valor do hotel, senão o da bandeira, senão o do grupo, senão o padrão; a origem aparece como "definido na bandeira". |
| Auditoria geral | #211 | Menu **Configuração → Auditoria** (Admin do grupo, Gestor CSC e Gerente do hotel, nos hotéis da gestão deles): filtros **De**, **Até** (até 92 dias por consulta), **Hotel**, **Tipo de registro**, **Ação** e **Pessoa**; **Consultar**, **Carregar mais**, **Ver o antes e o depois** e **Exportar CSV** (até 50.000 linhas). |
| Prazos de SLA | #215, #227 | O chamado ganha o prazo de atendimento e o de solução na abertura e na triagem, contados no calendário do hotel (com feriados). A ficha do chamado mostra "Atender até ..." e "Resolver até ..." e, quando pausas pararam o relógio, "Pausas pararam o relógio do SLA por N minutos"; o chamado aberto antes dos prazos não mostra essas linhas. Também em **Ver histórico** e na **Auditoria**. |
| Feriados do hotel | #226 | Menu **Configuração → Feriados do hotel** (Admin do grupo, Gestor CSC, Gerente do hotel e Implantador): **Escolha o hotel**, **Data**, **Nome do feriado**, **Repete todo ano**, **Cadastrar**, **Salvar**, **Desativar** e **Reativar**. Os feriados nacionais e estaduais já entram sozinhos; aqui vão o municipal e o do próprio hotel. A data não muda (para trocar, desativar e cadastrar outro), e o prazo já calculado também não. |
| Monitor de SLA | #224 | Sem tela: a cada 5 minutos, o sistema registra o chamado com prazo em risco (por padrão, com 80% do tempo gasto) e o vencido. O selo na ficha e o painel dos avisos vêm no M4. A política de escalonamento (`chamado.escalonamento`, o percentual de 50 a 95 e quem recebe o aviso) não tem tela. |
| Motivo da pausa | #219 | No PWA, **Pausar** pergunta "Por que a OS vai pausar?": Aguardando peça, Aguardando fornecedor, UH ocupada, sem acesso, Fim de turno ou Outro motivo. Conforme a política do hotel, alguns motivos param o relógio do SLA; na retomada, o prazo de solução é recalculado. |


## Respostas do Cesar (08/10/2026)

1. **Quantos hotéis?** 4, decidido em 07/10: um urbano próprio, um Slim, um administrado e um arrendado. Os nomes dependem da Slaviero. O `docs/00` será atualizado pelo PR de documentação do agente do núcleo (ele ainda diz 2 a 3).
2. **Onde acontece o treinamento?** No staging, não no dev (o dev é compartilhado e só roda no notebook). A parte de staging da F0-12 precisa vir antes do treinamento, e não só antes do piloto.
3. **Recomeço do kit entre turmas:** um grupo novo por turma, sem apagar nada (as regras proíbem apagar dados, e um grupo por turma isola as turmas). O script do kit ganha uma opção de turma que cria "Grupo Demonstração — Turma 2", com e-mails próprios. Quem acrescenta é o agente do núcleo.
4. **Quem instala as situações e prioridades padrão** no grupo do cliente: um script de provisionamento de cliente, rodado pelo backoffice, que cria o grupo, o contrato de licença, o primeiro Admin e os padrões (situações, prioridades, categorias e políticas). É o mesmo primeiro passo do kit e entra na preparação do piloto.
8. **Senha esquecida até a 1c:** não precisa de solução provisória. O piloto só começa depois da 1c, que traz o e-mail próprio e a recuperação de senha. No treinamento, as contas de demonstração usam uma senha conhecida.

## Perguntas ainda em aberto para o Cesar

5. **Importação (M2):** cria o local que falta ou recusa a linha? As colunas de campos estendidos? Só CSV ou XLSX (pergunta 4 do `docs/12`)?
6. **Hotel pronto no piloto:** "locais sem ativo" pode ficar como pendência, já que só os ativos críticos entram?
7. **Foto do chamado:** o `docs/10` diz que a Solicitante abre chamado com foto; nenhuma tela de chamado tem esse campo.
9. **Categorias:** caldeira e SPDA não têm categoria padrão (no modelo foram para Hidráulica e Segurança e incêndio). O grupo cria categoria própria?
10. **Script do kit no staging (nova, da resposta 2):** respondida pelo #196. O kit e o provisionamento aceitam o staging e a turma; falta só o staging existir (F0-12).

## Como conferi

Telas, rótulos e fluxos (caminhos a partir da raiz do repositório, na `main` de 08/10/2026):
- Catálogo pt-BR: `packages/i18n/catalogos/pt-BR.json` (rótulos e mensagens).
- Web: `apps/web/src/cliente/moldura.tsx` (menu), `apps/web/src/app/(painel)/**/page.tsx` (chamados, detalhe, OS, hotéis, locais, categorias, ativos, equipes, proprietários, bandeiras, membros, configuração, implantação, paradas), `apps/web/src/cliente/corretiva.tsx` e `triagem.tsx` (aceite, reabertura, triagem), `apps/web/src/cliente/QrDoAtivo.tsx`, `apps/web/src/app/login` e `definir-senha`, `apps/web/src/app/api/v1/**` (rotas existentes e ausentes), `apps/web/src/app/api/cron/*` e `apps/web/vercel.json` (crons ligados).
- PWA: `apps/tecnico/src/App.tsx` e `telas/*` (fila do dia, OS, ativos, fotos, abrir chamado, login), `os/projecao.ts`, `qr.ts`, `vite.config.ts` (manifesto).
- Papéis e permissões: `packages/dominio/src/corretiva.ts`, `triagem.ts`, `permissoes.ts`, `ativos.ts`, `locais.ts`, `equipes.ts`, `implantacao.ts`, `categorias.ts`, `politicas.ts`, `qr.ts`, `campos-tipados.ts`; `packages/aplicacao/src/casos-de-uso/*`; `supabase/migrations/20260924000001_fundacao.sql` (`authz.hoteis_leitura` e `hoteis_escrita`), `20260928214709_ativo.sql`, `20260929120937_chamado.sql`, `20260929183205_os.sql`.
- Conector e fallback de hotéis e UHs: `apps/conector/src/adaptadores/planilha.ts` e `csv.ts`.
- Plano e kit: `docs/12-plano-fase-1b.md`, `docs/10-kit-de-teste.md`, `docs/00-contexto-produto.md`, `docs/01-arquitetura.md`, `docs/04-plano-fase-0.md`, `docs/05-plano-fase-1a.md`, `docs/11-conformidade-fase-1a.md`, `docs/referencia/lacunas-instrumentacao-intelligence.md`, `docs/referencia/perguntas-cliente.md`.
- Migração I1 (só para conferir os nomes das colunas): `20261006220000_ativo_compra_garantia_criticidade.sql`, preparada pelo agente do núcleo e ainda não na `main`; os nomes podem mudar até ela entrar.
- Não executei o app: tudo foi conferido pelo código, sem rodar telas.

**Atualização de 12/10/2026** (agente do Intelligence, pedido do Cesar), na `main` do #194:
- A migração I1 está na `main` (#133), e as colunas da planilha modelo batem com `app.ativo`.
- Catálogo pt-BR para todos os rótulos novos; menu em `apps/web/src/cliente/moldura.tsx`; telas em `apps/web/src/cliente/triagem.tsx`, `corretiva.tsx`, `apps/web/src/app/(painel)/admin/{fornecedores,codigos,configuracao,locais,ativos,hoteis}` e `inteligencia/`; PWA em `apps/tecnico/src/telas/` (abrir chamado, OS, ativos).
- Regras: `packages/dominio/src/triagem.ts` (impacto e quem executa), `corretiva.ts` (UH indisponível), `fornecedores.ts`, `locais.ts`, `codigos.ts`; `packages/inteligencia/src/insight.ts` (quem decide insight).
- Também sem rodar o app: o detalhe pode mudar com a I8b e com a conferência no staging.

**Atualização de 13/10/2026** (agente do Intelligence, atividade 5, pedido do Kaio e aprovação do Cesar), na `main` do #228 (o #222, o #224, o #226 e o #227 entraram por decisão do Cesar, no mesmo PR):
- Catálogo pt-BR para os rótulos da I8, da PV1, da auditoria geral, do nível bandeira e do motivo da pausa; menu em `apps/web/src/cliente/moldura.tsx`.
- Telas: `apps/web/src/cliente/planos-preventivos.tsx`, `apps/web/src/app/(painel)/admin/{preventivas,feriados}`, `apps/web/src/cliente/assinatura.tsx`, `AnexosDoRegistro.tsx`, `checklist-da-os.tsx`, `corretiva.tsx`, `triagem.tsx` e `apps/web/src/app/(painel)/admin/{auditoria,checklists,configuracao}`; PWA em `apps/tecnico/src/telas/{Os,ChecklistDaOs,FilaDoDia,Ativos,AbrirChamado}.tsx` e `apps/tecnico/src/locais.ts`.
- Regras: `packages/dominio/src/checklist.ts`, `auditoria-geral.ts` (limites da consulta e do CSV), `politicas.ts` (hotel, bandeira, grupo; `chamado.escalonamento`), `sla.ts`, `plano-preventivo.ts` (quem gere, limites da periodicidade), `feriados-do-hotel.ts` e `monitor-sla.ts`.
- Scripts: `scripts/ops/provisionar-cliente.ts`, `dados-demonstracao.ts`, `turma.ts`; padrões em `apps/web/test/provisionamento/padroes.ts`; kit em `apps/web/test/demonstracao/semear.test.ts`.
- Também sem rodar o app.
