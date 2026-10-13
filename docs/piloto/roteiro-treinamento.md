# Roteiro de treinamento do piloto

Proposta de treinamento para os hotéis do piloto, escrita sobre o que existe na `main` (atualizada em 12/10/2026 com as entregas da 1b até o #194 e em 13/10/2026 com as da 1b e da 1c até o #228). Durações e agenda são **propostas** para o Cesar ajustar. O que ainda não existe ou vai mudar na 1b está marcado com **[ainda não existe]** ou **[vai mudar na 1b]** (`docs/12-plano-fase-1b.md`). Os rótulos entre aspas são os da interface; o passo a passo por papel está em `manual-por-papel.md`.

## 1. Os hotéis do piloto

O piloto é em **4 hotéis**, decidido pelo Cesar em 07/10/2026: um urbano próprio, um Slim, um administrado e um arrendado. Os nomes dependem da Slaviero e ainda não existem nos documentos. O `docs/00` ainda diz 2 a 3 hotéis e será atualizado pelo PR de documentação do agente do núcleo.

| # | Hotel | Perfil | Gerente | Data do treinamento | Idiomas em uso |
|---|---|---|---|---|---|
| 1 | [nome a definir pela Slaviero] | Urbano próprio | [a definir] | [a definir] | [a definir] |
| 2 | [nome a definir pela Slaviero] | Slim | [a definir] | [a definir] | [a definir] |
| 3 | [nome a definir pela Slaviero] | Administrado | [a definir] | [a definir] | [a definir] |
| 4 | [nome a definir pela Slaviero] | Arrendado | [a definir] | [a definir] | [a definir] |

Os quatro perfis diferem em quem opera e em quem é dono do ativo. O perfil agora é o campo **Modelo contratual** da configuração do hotel (Próprio, Administrado, Arrendado, Afiliado ou Não informado). Confirmar com a Slaviero o modelo contratual de cada hotel do piloto. Isso pode mudar o que o treinamento destaca (por exemplo, o papel de Proprietário nos hotéis administrado e arrendado). Confirmar com a Slaviero se o perfil altera quem participa da sessão.

Idiomas: a interface sai em pt-BR, en, es e fr, com traduções de en, es e fr provisórias até a revisão (`docs/04`). Se houver usuário de espanhol ou francês no piloto, treinar no idioma dele e registrar o feedback da tradução.

## 2. Visão geral

| Sessão | Público | Formato | Duração (proposta) | Onde |
|---|---|---|---|---|
| A. Gestão | Gerente do hotel, Gestor CSC, Admin do grupo | Web, com exercícios | 2 h 30 | Remota, uma vez para todos os hotéis, ou presencial por hotel |
| B. Técnicos | Técnicos do hotel | PWA no celular, com prática no hotel | 2 h, mais 1 h de prática com QR real | Presencial, no hotel |
| C. Solicitantes | Recepção, governança, quem abre chamado | PWA no celular | 45 min | Presencial, no hotel |
| D. Implantação | Equipe do CSC e Implantador | Web: membros, ativos, QR | 1 h 30 | Remota, uma vez (opcional, se o CSC for repetir a implantação) |

Por hotel, o dia presencial soma cerca de 4 h (B, C e o fechamento). A sessão A pode ser feita uma vez, antes dos hotéis, e repetida só para quem faltar. O Proprietário não tem sessão: só lê (manual, seção 7).

## 3. Pré-requisitos

**Ambiente**
- [ ] Ambiente acessível pelos celulares do treinamento. **O treinamento acontece no staging, não no dev** (decisão do Cesar, 08/10/2026): o dev é compartilhado e só roda no notebook. O staging **[ainda não existe]** (F0-12 suspensa, `docs/04`) e a parte de staging da F0-12 precisa vir **antes do treinamento**, e não só antes do piloto. Sem staging, não marcar as datas.
- [ ] Os dados de exercício usam um **grupo de demonstração por turma**: "Grupo Demonstração" para a primeira e "Grupo Demonstração — Turma 2", "Turma 3" e assim por diante, cada um com e-mails próprios; nunca o grupo real do cliente. Nada é apagado entre turmas. O kit cria cada turma com `pnpm demo:dados --ambiente staging --turma N` (#196); o script já aceita o staging, mas recusa até ele existir (F0-12).
- [ ] Contas do kit em `docs/10` (domínio `.test`, sem e-mail real). As contas de demonstração usam uma **senha conhecida**, combinada pelo instrutor. Nunca reutilizar uma senha real.
- [ ] Segundo fator para Admin, Gestor CSC e Implantador **[ainda não existe]** (SP1): quando entrar, incluir o cadastro do app autenticador na sessão A.

**Hotel (dados reais, antes do dia do treinamento)**
- [ ] Hotel implantado e "pronto" pelos critérios do `guia-implantacao-hotel.md`, seção 4.
- [ ] Contas reais criadas: convite aceito e senha definida por Gerente, técnicos e solicitantes (e-mail de produção **[ainda não existe]**; ver guia, pré-requisito 7).
- [ ] Ativos críticos carregados e etiquetados (cadastro um a um; importação **[ainda não existe]**, M2). Etiquetas coladas.
- [ ] Pelo menos um ativo crítico com etiqueta lida com a câmera de um celular.

**Celulares**
- [ ] Android ou iPhone com navegador atualizado e câmera funcionando.
- [ ] PWA instalado ("HubKeep", pela função de instalação ou adicionar à tela inicial do navegador).
- [ ] Primeiro acesso feito **com rede** para baixar hotéis, locais, categorias, ativos e a fila do dia.
- [ ] Idioma escolhido no seletor **Idioma**.
- [ ] Espaço livre no aparelho para as fotos (o PWA recusa foto sem espaço).
- [ ] Rede do hotel (Wi-Fi) testada nos pontos onde o técnico trabalha. Onde não houver rede, o treinamento mostra o modo offline.

**Instrutor**
- [ ] Notebook com web e PWA acessíveis, dois celulares de apoio, projetor.
- [ ] Planilha de presença e de observação (seção 7).
- [ ] Canal de suporte aberto (seção 6).

## 4. Roteiro de cada sessão

### Sessão A. Gestão (2 h 30)

| Tempo | Conteúdo |
|---|---|
| 0:00 a 0:20 | Visão: ciclo do chamado (Aberto, Em triagem, Em execução, Aguardando aceite, Concluído) e da OS; quem faz o quê. Entrar, trocar **Idioma**, **Sair** |
| 0:20 a 0:40 | Lista de **Chamados**: filtros, detalhe, **Linha do tempo**, **Ver histórico** |
| 0:40 a 1:30 | **Triagem e atribuição** (exercícios 3, 4 e 5) |
| 1:30 a 1:50 | **Aceite** (com falha, causa, solução, custo informado e assinatura) e **Reabrir** (exercícios 6, 15 e 18); **Aplicar checklist** na OS (exercício 17) |
| 1:50 a 2:10 | **Paradas a encerrar** e **UH indisponível** (exercícios 7 e 14) |
| 2:10 a 2:30 | Cadastros do hotel: Locais (com edificação), Equipes, Ativos (com compra, garantia e criticidade), **Fornecedores**, **Ver QR**, **Preventivas** e **Feriados do hotel** (exercícios 20 e 21); dúvidas |

Para o Admin do grupo e o Gestor CSC, acrescentar 30 min: **Membros e papéis**, **Hotéis** (Trazer para implantação, Ativar), **Configuração e políticas** (modelo contratual, nomes da criticidade, códigos obrigatórios no aceite, foto de depois, assinatura no aceite, checklist completo, e o nível bandeira), **Códigos de manutenção** e **Checklists** (só o Admin), **Auditoria** com o CSV (exercício 19; o Gerente também usa). Se o grupo contratar o HubKeep Intelligence **[a confirmar]**, acrescentar o menu do módulo (lista de insights, "Por que estou vendo isso?" e a decisão). As telas só abrem na data da política de abertura (padrão: 60 dias depois da ativação), então o treino do módulo fica para perto dessa data, ou para o grupo de demonstração; antes dela, mostrar ao Admin só a página **Abertura das telas**.

No **grupo de demonstração do Intelligence** (o histórico de seis meses gerado no dev ou no staging), a demonstração usa as telas do Intelligence e os indicadores. A linha do tempo dos chamados (a aba **Histórico** do chamado, da OS e do ativo) e a **Auditoria** mostram a data em que o histórico foi gerado, e não as datas do histórico: elas registram quando o dado entrou de fato (decisão do Cesar de 13/10/2026).

### Sessão B. Técnicos (2 h, mais 1 h de prática)

| Tempo | Conteúdo |
|---|---|
| 0:00 a 0:15 | Instalar e entrar; conferir o PWA instalado; conferir idioma |
| 0:15 a 0:35 | **Fila do dia**: faixa de rede, contador de operações, **Enviar agora** |
| 0:35 a 1:15 | Executar OS: **Iniciar**, **Apontar horas**, **Registrar material**, foto com o momento (antes ou depois), checklist, falha, causa e solução, **Pausar** com o motivo, **Concluir** (exercícios 4, 16 e 18) |
| 1:15 a 1:35 | Parada do equipamento e a pergunta "O equipamento voltou a funcionar?"; UH indisponível e a pergunta "A UH foi liberada para uso?" (exercícios 5 e 14) |
| 1:35 a 2:00 | Offline (exercício 8) |
| Prática (1 h) | No hotel: ler QR real, abrir o ativo, **Fotos**, **Alterar** e abrir **Abrir chamado** (exercício 9) |

### Sessão C. Solicitantes (45 min)

| Tempo | Conteúdo |
|---|---|
| 0:00 a 0:10 | Instalar, entrar, idioma |
| 0:10 a 0:30 | **Abrir chamado** (exercício 2), inclusive sem rede, com **Afeta hóspede?** e **A UH ficou indisponível** |
| 0:30 a 0:45 | Acompanhar pelo web e **Aceitar** a OS do chamado que abriu (exercício 6) |

### Sessão D. Implantação (1 h 30)

**Membros e papéis** (convidar, **Conceder papel**, **Revogar**, validade), **Locais** (edificação), **Equipes**, **Cadastrar ativo** (com compra, garantia e criticidade), **Fornecedores**, **Códigos de manutenção**, **Ver QR**, **Painel de implantação** (inclusive a pendência do modelo contratual), critérios de hotel pronto.

## 5. Exercícios práticos com o kit de teste

Dados e contas do `docs/10`: Grupo Demonstração, Hotel Demonstração Centro (Bandeira Azul), Hotel Demonstração Praia, Hotel Demonstração Serra (em implantação). Cada exercício indica papel, conta do kit e resultado esperado. Os chamados do kit servem uma vez: rodar o script de novo completa o que falta, mas não desfaz o que a turma fez (`docs/10`, seção 6). Para a turma seguinte, criar um **grupo de demonstração novo** com `pnpm demo:dados --turma 2` ("Grupo Demonstração — Turma 2", com e-mails `@turma2.demo.hubkeep.test`), em vez de apagar o anterior: as regras proíbem apagar dados, e um grupo por turma também isola as turmas.

| # | Papel (conta) | Exercício | Resultado esperado |
|---|---|---|---|
| 1 | Todos | Entrar no web (`/login`) e no PWA; trocar o **Idioma** para en e voltar; **Sair** | Telas mudam de idioma; o PWA em modo avião continua abrindo |
| 2 | Solicitante (`solicitante@demo.hubkeep.test`) | No PWA: **Abrir chamado**, **Local** "UH 104", sem ativo, descrição "Pia pingando", **Abrir chamado**. Repetir com o celular em modo avião | "Chamado guardado no aparelho. Vai ser enviado quando houver rede." e, com rede, o chamado aparece no web como "Aberto" uma só vez |
| 3 | Gerente do Centro (`gerente.centro@demo.hubkeep.test`) | Web: abrir "Chuveiro sem água quente"; **Triar** com prioridade Urgente; **Ajustar prioridade** para Alta | Situação "Em triagem" e "Prioridade alterada" na linha do tempo |
| 4 | Gerente e Técnico do Centro (`tecnico.centro@demo.hubkeep.test`) | Gerente: em **Gerar OS**, conferir que a Solicitante não está no grupo "Pessoas" do **Responsável** (só os Técnicos do hotel aparecem); **Gerar OS** para **Equipe Centro**; **Reatribuir** para o Técnico do Centro. Técnico, no PWA: abrir a OS na fila do dia, **Iniciar**, **Apontar horas** (início e fim reais), **Registrar material** ("2 m de cabo 2,5 mm"), **Tirar ou escolher foto**, **Concluir** | A Solicitante não aparece na lista; OS na fila do dia do técnico; depois da conclusão, chamado "Aguardando aceite" |
| 5 | Técnico do Centro | No "Frigobar não gela" (OS atribuída, ativo): **Iniciar** e **Equipamento parado**. No "Ar-condicionado desligando sozinho" (em execução): **Concluir** e responder **Não, continua parado** | A parada continua aberta e aparece em "Paradas a encerrar" para o Gerente |
| 6 | Gestor CSC, Solicitante e Gerente do Centro | Aquecedor da piscina (OS concluída, aberta pela Solicitante): primeiro o Gestor CSC tenta **Aceitar** (tem de ser recusado: o Centro tem Gerente); depois a Solicitante **Aceita**. No chamado do chuveiro, concluído no exercício 4 (quem abriu foi a Solicitante), o Gerente faz **Reabrir** com **Motivo da reabertura** (a opção "O equipamento está parado" só aparece em chamado com ativo; testá-la em outro chamado com ativo, se houver) | Aquecedor "Concluído" no aceite; chuveiro "Em execução" na reabertura, com o motivo na **Linha do tempo**; o Técnico vê "Reaberta no aceite: motivo" |
| 7 | Gerente do Centro | **Paradas a encerrar**: conferir a parada do exercício 5 e **Encerrar parada** | Parada some da lista; **Ver paradas** do ativo mostra o tempo |
| 8 | Técnico do Centro | Offline: com o PWA em modo avião, na OS do Frigobar (já em execução, do exercício 5): **Pausar** (escolher **Aguardando peça**), **Retomar**, **Apontar horas** e **Tirar ou escolher foto**; fechar e reabrir o PWA; voltar a rede | "Sem conexão. O que você fizer fica guardado..." e contador "N operações aguardando envio."; ao voltar a rede, "Tudo enviado."; no web, tudo entrou uma única vez, sem horas nem fotos duplicadas, e o motivo da pausa aparece em **Ver histórico** da OS. Para testar o offline de verdade, usar o PWA publicado (build com service worker) |
| 9 | Gerente e Técnico do Centro | No web, o Gerente abre **Ativos** e mostra o **Ver QR** do "Frigobar UH 101" (ou imprime pelo navegador). O técnico aponta a câmera do celular | O PWA abre o ativo; **Fotos** mostra as fotos (precisa de rede); **Alterar** troca o fabricante e a alteração aparece em **Ver histórico** |
| 10 | Gerente do Centro | **Cancelar chamado** (em um chamado aberto ou em triagem, como o do exercício 2) primeiro sem motivo e depois com motivo | Recusa pedindo o motivo; depois "Cancelado", com o motivo no detalhe e na linha do tempo |
| 11 | Gestor CSC (`gestor.csc@demo.hubkeep.test`) | Filtrar **Chamados** por **Hotel**, **Situação**, **Prioridade**, **De** e **Até**; tentar abrir o chamado do Praia | O Praia não aparece (escopo da Bandeira Azul); o link direto dá "não encontrado" |
| 12 | Admin (`admin@demo.hubkeep.test`) | **Hotéis**: **Ativar** o Serra (só uma vez por ambiente) e ver as UHs saírem de "pendente de licença"; **Membros e papéis**: **Convidar pessoa** (só com e-mail da equipe) | Mensagem "Hotel ativado. N UHs foram liberadas..." |
| 13 | Qualquer um | Provocar uma recusa e conferir que a mensagem vem traduzida, nunca como código | Texto no idioma escolhido |
| 14 | Solicitante, Técnico e Gerente do Centro | Solicitante, no PWA: **Abrir chamado** numa UH, **Afeta hóspede?** "Sim", marcar **A UH ficou indisponível**. Gerente: **Triar** e **Gerar OS** para o Técnico. Técnico: iniciar e **Concluir**, respondendo **Não, continua indisponível**. Gerente: no detalhe do chamado, **Liberar UH** | O detalhe mostra "Afeta hóspede" e o painel "UH indisponível" com o período; depois de liberar, "Liberada", com "UH liberada" na **Linha do tempo** |
| 15 | Admin, Gerente e Técnico do Centro | Admin: **Fornecedores**, **Cadastrar** um fornecedor fictício. Gerente: num chamado em triagem, **Gerar OS** com **Quem executa** no fornecedor (o **Responsável** continua sendo o Técnico). Técnico: escolher falha, causa e solução e concluir. Quem abriu o chamado: **Aceitar** com **Custo informado (R$)** | O detalhe mostra "Executada pelo fornecedor ..." e "Custo informado: R$ ..."; com "Códigos obrigatórios no aceite" ligado no hotel, o aceite sem os três códigos é recusado |
| 16 | Técnico e Gerente do Centro | **Antes do exercício 5.** Técnico, no PWA: abrir o "Ar-condicionado desligando sozinho" (em execução, com o checklist do kit), responder só a pressão do gás e **Salvar respostas**; depois responder o filtro e o dreno (**Não conforme**) e salvar de novo. Gerente, no web: abrir o chamado e ver as respostas no bloco **Checklist** | Primeiro "Faltam 2 itens obrigatórios."; depois, sem aviso. No web, as respostas aparecem só para leitura, e o **Trocar checklist** some, porque a OS já tem respostas |
| 17 | Admin, Gerente e Técnico do Centro | Admin: **Checklists**, **Criar checklist** "Chuveiro", com um item sim/não obrigatório ("Água quente voltou?") e um de conformidade. Gerente: num chamado criado na hora, **Gerar OS** para o Técnico e **Aplicar checklist** "Chuveiro". Técnico: tentar responder com a OS Atribuída; **Iniciar**, responder e concluir | Com a OS Atribuída, "Inicie a ordem de serviço para responder o checklist."; depois, o checklist "Chuveiro (versão 1)" com as respostas no web |
| 18 | Admin, Solicitante e Técnico do Centro | Admin: em **Configuração e políticas**, no hotel Centro, ligar "Foto de depois na conclusão" e "Assinatura no aceite". Técnico, numa OS criada na hora: **Tirar ou escolher foto** com **Antes do serviço** (já com a OS Atribuída), iniciar e tentar **Concluir**; depois tirar uma foto **Depois do serviço** e concluir. Solicitante (quem abriu): tentar **Aceitar** sem assinar; depois assinar e aceitar. **No fim, o Admin desliga as duas políticas**, para não mudar os outros exercícios | Recusa "Neste hotel, a conclusão exige ao menos uma foto de depois do serviço."; recusa "Neste hotel, o aceite exige a assinatura de quem aceita."; no web, as fotos com "Antes" e "Depois" e a OS com "Aceite com assinatura" e **Ver assinatura** |
| 19 | Gestor CSC e Gerente do Centro | **Configuração → Auditoria**: **De** e **Até** no dia do treinamento, **Consultar**, filtrar por **Pessoa** (o Técnico do Centro), **Ver o antes e o depois** de uma linha, **Exportar CSV**. O Gerente repete e procura uma linha do Praia | As ações da turma aparecem com quem fez; o CSV baixa como `auditoria-<de>-a-<ate>.csv`; o Gerente do Centro não vê o Praia |
| 20 | Gerente do Centro | **Preventivas**, **Hotel** Centro, **Novo plano** "Limpeza do filtro" com **Ativo ou categoria** na categoria Refrigeração e ar-condicionado, **A cada** 1 mês, **Primeira data prevista** no dia 31 de um mês, **Checklist** "Inspeção de ar-condicionado", sem responsável, **Cadastrar plano**. Tentar **Ativar**; em **Alterar**, escolher o **Responsável padrão** Equipe Centro, **Gravar alteração** e **Ativar**. Em **Ativos**, no "Ar-condicionado UH 102", **Ver planos preventivos** | A prévia mostra cinco datas e, no mês sem dia 31, o último dia do mês; sem responsável, a ativação é recusada ("Escolha o técnico ou a equipe responsável antes de ativar o plano."); ativo, a lista mostra "Próxima: data" e o plano aparece na ficha do ativo. Nenhuma OS é gerada (PV3) |
| 21 | Gerente do Centro | **Configuração → Feriados do hotel**, **Escolha o hotel** Centro: **Cadastrar** o aniversário da cidade com **Repete todo ano**; tentar cadastrar outro feriado na mesma data; **Desativar** e **Reativar**. Depois, num chamado triado no exercício 3, conferir a ficha | Recusa "Já existe um feriado ativo nesta data neste hotel."; a ficha mostra "Atender até ..." e "Resolver até ..." |

Os exercícios 14, 15, 17 e 18 usam chamados criados na hora: o kit ainda não tem dados de UH indisponível, fornecedor, custo, foto com momento ou assinatura. O 20 e o 21 também: o kit ainda não tem plano preventivo nem feriado municipal. O plano do 20 fica ativo, mas não gera OS até a PV3. O 16 usa o checklist do kit e precisa vir antes do 5, que conclui a mesma OS. Fazer o 16 e o 18 com o celular em modo avião em parte do tempo mostra que o checklist e a foto também esperam a rede.

Não incluir no treinamento, porque **[ainda não existe]**: importação de ativos e QR em lote (M2, M3), aprovação de ativo cadastrado pelo celular (M4), selo e painel do SLA, notificações, indicadores e impressão da OS (fase 1c). OS preventiva gerada pelo plano: **[vai mudar na 1b]** (PV3). O prazo do SLA aparece na ficha do chamado (exercício 21).

## 6. Em caso de problema

| O que aparece | O que fazer |
|---|---|
| "Sem conexão." no PWA | Normal: o trabalho fica guardado. Voltar a rede e abrir o app; conferir "Tudo enviado." |
| "N operações aguardando envio." por muito tempo | Tocar em **Enviar agora** com rede. Se continuar, olhar o aviso "operações recusadas pelo servidor" |
| "N operações recusadas pelo servidor." com o motivo | Ler o motivo (por exemplo, "A OS está com outro responsável.", "Outra pessoa alterou este registro depois que você o abriu."). Corrigir e refazer, ou tocar em **Dispensar** |
| "Há registros aguardando envio desde ..." | Conectar o aparelho à rede e enviar: o sistema pode apagar dados do app se ele ficar muito tempo sem uso |
| "A fila do dia ainda não está no aparelho. Entre com rede uma vez para baixá-la." | Entrar com rede; confirmar que a OS foi atribuída ao técnico ou à equipe dele |
| OS não aparece na fila do dia | No web, conferir a OS em **Reatribuir** (responsável e equipe); o técnico precisa ter papel Técnico ativo no hotel |
| "Sua sessão expirou. Entre de novo." | Entrar de novo. Conferir antes se há operação pendente (não use **Sair** com pendência) |
| "Você não tem permissão para esta ação." ou "Seu papel não permite esta ação neste hotel." | Conferir o papel em **Membros e papéis**; ver a tabela de quem faz o quê no manual |
| "A UH está pendente de licença e não recebe chamado." | Admin: **Hotéis** e saldo de licença; abrir o chamado em outro local enquanto isso |
| "Neste hotel, o aceite exige falha, causa e solução. ..." | Preencher **Falha**, **Causa** e **Solução** no aceite; a política é do Admin do grupo |
| "Neste hotel, a conclusão exige ao menos uma foto de depois do serviço." | Tirar uma foto com **Depois do serviço** e concluir de novo; a política é do Admin do grupo |
| "Neste hotel, a conclusão exige o checklist completo. Falta..." | Responder os itens obrigatórios (marcados com "*") e **Salvar respostas** antes de concluir |
| "Inicie a ordem de serviço para responder o checklist." | **Iniciar** a OS; o checklist só recebe resposta com ela em execução ou pausada |
| "O checklist desta ordem de serviço já tem respostas e não pode ser trocado." | Normal: o técnico respondeu antes da troca, e com resposta o checklist da OS fica. Se o modelo estava errado, anotar na planilha de observação |
| "Neste hotel, o aceite exige a assinatura de quem aceita." | Assinar no quadro "Assinatura de quem aceita" e aceitar de novo |
| "Escolha o técnico ou a equipe responsável antes de ativar o plano." | Em **Alterar**, escolher o **Responsável padrão** e **Ativar** de novo |
| "Já existe um feriado ativo nesta data neste hotel." | Normal: um feriado ativo por data. Para mudar o nome, usar **Salvar** no que já existe |
| Plano ativo e nenhuma OS preventiva na fila | Normal até a PV3: o plano ainda não gera OS |
| "Escolha um período de até 92 dias, com o fim depois do início." (Auditoria) | Diminuir o período; para mais tempo, consultar em partes |
| "Você não marca nem libera UH neste hotel." | Só Admin, Gestor CSC e Gerente marcam e liberam pelo web; o Técnico libera ao concluir a OS |
| "Seu papel ainda não alcança nenhum hotel do grupo, então você não cadastra fornecedores..." | O Gestor CSC sem hotel no escopo pede ao Admin do grupo |
| UH continua "Indisponível" depois do aceite | Normal: o aceite não libera a UH. Usar **Liberar UH** no detalhe do chamado |
| "Não há espaço livre neste aparelho para guardar a foto." ou "Há fotos demais aguardando envio neste aparelho." | Liberar espaço ou conectar para enviar as fotos pendentes |
| Não consegue entrar, esqueceu a senha | No treinamento, as contas de demonstração têm senha conhecida: o instrutor informa. No piloto isso não deve acontecer, porque ele só começa depois da 1c, que traz o e-mail próprio e a recuperação de senha (**[ainda não existe]** hoje). Se acontecer antes, anotar e escalar ao suporte |
| QR não abre o ativo | Sem rede e sem o ativo guardado: conectar e ler de novo. "Ativo não encontrado": conferir se o ativo é do hotel do técnico e se a etiqueta é a do ativo |

**Escalar ao suporte.** O app não mostra o identificador da requisição na tela e o Sentry está adiado até o piloto (`docs/04`), então anotar: hotel, nome e e-mail da pessoa, data e hora, tela e botão, texto exato da mensagem, idioma, se havia rede, aparelho e navegador. Com isso a equipe localiza o registro nos logs (que guardam `tenant_id`, `hotel_id`, `usuario_id` e `request_id`) e em **Ver histórico**. No navegador do web, o `x-request-id` aparece nos cabeçalhos da resposta (DevTools). Canal e responsável do suporte do piloto: [a definir].

**Regras do instrutor.** Não pedir senha. Não aceitar contas compartilhadas. Não treinar com dado real no Grupo Demonstração, nem o contrário. Se uma tela diferir do manual, anotar na planilha de observação e seguir.

## 7. Aceite do treinamento (checklist)

Por hotel, ao final dos dias de treinamento:

**Gestão (Gerente e CSC)**
- [ ] Entrou, trocou o idioma e saiu sem ajuda.
- [ ] Triou um chamado, gerou OS para técnico e para equipe e reatribuiu.
- [ ] Cancelou uma OS e um chamado com motivo.
- [ ] Aceitou e reabriu uma OS concluída (e, em chamado com ativo, usou "O equipamento está parado"), conferindo falha, causa, solução, o custo informado e as fotos de antes e depois, e assinou o aceite.
- [ ] Aplicou um checklist numa OS e leu as respostas do técnico.
- [ ] Consultou a **Auditoria** e exportou o CSV.
- [ ] Cadastrou e ativou um plano preventivo e cadastrou um feriado do hotel.
- [ ] Encerrou uma parada em **Paradas a encerrar**.
- [ ] Corrigiu o impacto no hóspede e quem executa; marcou e liberou uma UH indisponível.
- [ ] Sabe usar os filtros e **Ver histórico**.

**Técnicos**
- [ ] PWA instalado, com sessão aberta e fila do dia lida.
- [ ] Executou uma OS do início ao fim (iniciar, horas, material, foto de antes e de depois, concluir).
- [ ] Respondeu um checklist, inclusive um item de conformidade.
- [ ] Pausou uma OS escolhendo o motivo e retomou.
- [ ] Respondeu à pergunta do equipamento parado e à da UH liberada.
- [ ] Escolheu falha, causa e solução numa OS.
- [ ] Trabalhou offline e confirmou "Tudo enviado." ao voltar a rede.
- [ ] Leu um QR real e abriu o ativo.
- [ ] Abriu um chamado pelo PWA.

**Solicitantes**
- [ ] Abriu um chamado (com e sem rede), respondendo "Afeta hóspede?" e, em UH, "A UH ficou indisponível", e acompanhou pelo web.
- [ ] Aceitou a OS do chamado que abriu.

**Geral**
- [ ] Todos sabem a quem recorrer (canal de suporte) e o que anotar.
- [ ] Nenhum erro bloqueante aberto da lista da planilha de observação.
- [ ] Presença registrada e dúvidas pendentes listadas com responsável e data.

Critério sugerido: o hotel está aprovado quando todos os itens de Gestão e de Técnicos estão marcados e pelo menos 80% dos Solicitantes concluíram os dois itens deles.

## 8. Coletar feedback

O app **não tem** canal de feedback interno **[ainda não existe]**. Proposta:

1. **Planilha de observação** (instrutor), uma linha por pessoa e exercício: concluiu sozinho, com ajuda ou não concluiu; tempo gasto; erro ou dúvida; tela e texto da mensagem.
2. **Pesquisa de 5 perguntas** ao fim de cada sessão (papel, de 1 a 5 e um comentário): clareza do treinamento; facilidade da tela principal; confiança para usar sozinho; o que faltou; o que atrapalhou. Formulário e ferramenta: [a definir].
3. **Check-in** com o Gerente e um técnico de cada hotel no primeiro dia, na primeira semana e no fim do piloto (4 semanas), com três perguntas: o que travou, o que foi mais útil, o que mudaria.
4. **Registro único de ocorrências** do piloto: hotel, data, papel, tela, descrição, gravidade, dono e situação. Ocorrência de tradução (en, es, fr) entra com a marcação "tradução".
5. **Dados do próprio sistema** para conferir o uso: chamados abertos, OS concluídas, aceites e reaberturas por hotel (telas **Chamados** e **Ordens de serviço**, **Ver histórico**). A **Auditoria** exporta o que foi gravado em CSV, por período e hotel. Indicadores prontos (backlog, SLA, tempo de reparo) **[ainda não existe]** (fase 1c).
6. **Revisão semanal** com o Cesar: lista de ocorrências, itens de manual a corrigir e decisões. O que for de fase 2 vira pendência, não implementação (regra 10 do `CLAUDE.md`).
