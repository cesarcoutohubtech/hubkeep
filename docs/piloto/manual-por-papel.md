# Manual por papel (piloto)

Manual curto, um bloco por papel, escrito sobre o que existe na `main` (atualizado em 12/10/2026 com as entregas da 1b até o #194 e em 13/10/2026 com as da 1b e da 1c até o #228; em 20/10/2026, só com as reclamações de hóspedes do HubKeep Intelligence, até o #338; lista no `README.md`). Os nomes de botões, menus e mensagens são os do catálogo pt-BR (`packages/i18n/catalogos/pt-BR.json`). O que ainda não existe ou vai mudar na fase 1b está marcado com **[ainda não existe]** ou **[vai mudar na 1b]**, com a referência ao plano (`docs/12-plano-fase-1b.md`) ou ao documento que define a tarefa.

## 1. O que vale para todos

**Dois aplicativos.**
- **Web** (telas do CSC, dos gerentes e da implantação): entrada em `/login`.
- **PWA "HubKeep Técnico"** (celular): fila do dia, abrir chamado, ativos. Funciona sem rede.
- O endereço de cada um **[ainda não existe]**: staging e produção estão suspensos (`docs/04`, F0-12). O treinamento acontece no staging, que precisa vir antes dele. O domínio previsto do PWA é `tecnico.hubkeep.com.br` (`docs/01`).

**Entrar.**
1. O acesso é por convite. A pessoa recebe o e-mail "Convite para o HubKeep" e toca em **Aceitar o convite**.
2. Na tela "Defina sua senha", digita a **Nova senha** (mínimo de 8 caracteres) e toca em **Salvar e entrar**.
3. Nos acessos seguintes: "Entrar no HubKeep", campos **E-mail** e **Senha**, botão **Entrar**. Erro: "E-mail ou senha incorretos."
4. Esqueci a senha: **[ainda não existe]**. A recuperação de senha entra na fase 1c, junto com o e-mail próprio (`docs/11`, decisão de 05/10/2026). O piloto só começa depois da 1c. Até lá, o link de recuperação é recusado, e no treinamento as contas de demonstração usam uma senha conhecida.
5. Segundo fator (TOTP) para Admin do grupo, Gestor CSC e Implantador: **[ainda não existe]**; é condição antes do piloto (SP1, `docs/05`). Quando entrar, esses três papéis passam a precisar do segundo fator para entrar.

**Barra do web.** Seletor **Idioma** (pt-BR, en, es, fr), botão **Tema claro** e botão **Sair**. Quem pertence a mais de um grupo vê também o seletor **Grupo**.

**Menu do web.** Os itens fixos são os mesmos para todos os papéis; quem decide o que cada um pode fazer é o servidor, e a recusa vem traduzida (por exemplo "Você não tem permissão para esta ação."). Itens:
- **Operação:** Início, Chamados, Ordens de serviço, Paradas a encerrar.
- **Cadastros:** Hotéis, Locais, Categorias de ativo, Códigos de manutenção, Checklists, Preventivas, Ativos, Equipes, Proprietários, Fornecedores, Bandeiras, Membros e papéis.
- **Configuração:** Configuração e políticas, Auditoria, Painel de implantação.
- **Módulo opcional:** **HubKeep Intelligence**, com a contagem dos insights abertos. Só aparece no grupo que contratou o módulo, a partir da data de abertura das telas, e para os papéis da política de abertura (padrão: Admin do grupo e Gestor CSC; o Gerente do hotel só se o Admin incluir). Antes da abertura, só o Admin do grupo vê o item, que leva à página **Abertura das telas**.

**Escopo.** Cada pessoa só enxerga os hotéis do seu papel (hotel, bandeira ou grupo inteiro). Fora do escopo, o registro aparece como "não encontrado".

**Ciclo do chamado e da OS** (situações padrão; o grupo pode renomear):
- Chamado: Aberto, Em triagem, Em execução, Aguardando aceite, Concluído, Cancelado.
- OS: Atribuída, Em execução, Pausada, Concluída, Aceita, Cancelada.
- Fluxo normal: o chamado é aberto (PWA), a triagem gera a OS para um técnico ou uma equipe, o técnico executa e conclui, quem abriu (ou o Gerente) aceita. No aceite, o chamado vai a Concluído; se reabrir, volta a Em execução, com motivo.
- O chamado guarda também se **afeta hóspede**, em UH o período em que a **UH ficou indisponível**, e o **prazo de atendimento** e o **de solução** do SLA (calculados na abertura e na triagem; aparecem na ficha do chamado ("Atender até ...", "Resolver até ..." e, quando houver, "Pausas pararam o relógio do SLA por N minutos"), em **Ver histórico** e na **Auditoria**). A OS guarda **quem executa** (a equipe interna ou um fornecedor), o **checklist** aplicado e as respostas, as fotos com o **momento** (antes ou depois), o **motivo de cada pausa**, os **códigos de falha, causa e solução** e, no aceite, o **custo informado** e a **assinatura** de quem aceita.

**Quem faz o quê** (conferido em `packages/dominio/src/corretiva.ts`, `ativos.ts`, `locais.ts`, `equipes.ts`, `permissoes.ts`):

| Ação | Admin do grupo | Gestor CSC | Gerente do hotel | Técnico | Solicitante | Implantador |
|---|---|---|---|---|---|---|
| Ver chamados e OS do escopo (web) | sim | sim | sim | sim | sim | sim |
| Abrir chamado (PWA) | sim | sim | sim | sim | sim | sim |
| Triar, ajustar prioridade, gerar OS, reatribuir, cancelar OS, cancelar chamado | sim | sim | sim | não | não | não |
| Aplicar ou trocar o checklist na OS (web) | sim | sim | sim | não | não | não |
| Iniciar, pausar (com motivo), retomar, concluir OS; horas, material, foto com momento, checklist, parada (PWA) | não | não | não | sim, só na OS dele ou da equipe dele | não | não |
| Responder "Afeta hóspede?" e marcar "A UH ficou indisponível" na abertura (PWA) | sim | sim | sim | sim | sim | sim |
| Corrigir o impacto no hóspede e quem executa; marcar e liberar UH indisponível (web) | sim | sim | sim | não (libera a UH ao concluir a OS, no PWA) | não | não |
| Aceitar ou reabrir a OS concluída, com custo informado, códigos e assinatura | se abriu o chamado, ou no caso especial (nota abaixo) | se abriu o chamado, ou no caso especial | sim, em qualquer chamado do hotel (menos na OS que ele mesmo abriu e executou) | só se abriu o chamado e não executou a OS | só se abriu o chamado | só se abriu o chamado |
| Ver e encerrar paradas pelo web ("Paradas a encerrar") | sim | sim | sim | não | não | não |
| Cadastrar, editar e desativar ativo | sim | sim | sim | sim | não | sim |
| Mover ativo de local | sim | sim | sim | não | não | sim |
| Cadastrar área comum, informar a edificação do local, gerir equipes do hotel | sim | sim | sim | não | não | sim |
| Cadastrar, editar, desativar e reativar fornecedor | sim | sim, com algum hotel no escopo | sim | não (só lê) | não (só lê) | não (só lê) |
| Membros e papéis (convidar, conceder, revogar) | sim | não | não | não | não | sim, só no hotel dele, abaixo do papel dele |
| Categorias, códigos de manutenção, modelos de checklist, bandeiras, proprietários, hotéis (importar, ativar), configuração e políticas (no grupo, na bandeira ou no hotel) | sim | não | não | não | não | não |
| Auditoria geral (só leitura, com CSV) | sim | sim, nos hotéis do escopo | sim, no hotel dele | não | não | não |
| Painel de implantação | sim | não | não | não | não | sim |
| HubKeep Intelligence: ver e decidir insights (só com o módulo contratado e depois da abertura das telas) | sim | sim, nos hotéis do escopo; o de rede, se cobre todos os hotéis dele | só se o Admin incluir o Gerente na política de abertura; aí, só o insight do hotel dele | não | não | não |
| HubKeep Intelligence: importar e classificar reclamações de hóspedes, abrir chamado a partir delas (depois da abertura das telas) | sim | sim, nos hotéis do escopo | só se o Admin incluir o Gerente na política de abertura; aí, só no hotel dele | não (não lê a reclamação; vê só o chamado) | não | não |
| HubKeep Intelligence: ver e mudar a abertura das telas | sim, também antes da abertura | não | não | não | não | não |

Nota sobre o aceite: quem abriu o chamado e também executa a OS (ele ou a equipe dele) não decide o aceite. Se, além disso, não há outro Gerente ativo no hotel, decidem o Gestor CSC ou o Admin do grupo (caso especial, `corretiva.ts`).

Proprietário (UH ou hotel inteiro) só lê o que é dele; não grava nada, não lê o cadastro de fornecedores e não vê o HubKeep Intelligence.

## 2. Técnico (PWA)

**O que vê.** A fila do dia com as OS atribuídas a ele e às equipes de que faz parte, os ativos do hotel e o formulário de novo chamado. No web, lê chamados e OS do hotel, sem ações de triagem nem de aceite.

**Instalar.** Abrir o endereço do PWA no navegador do celular e usar a função do próprio navegador (adicionar à tela inicial ou instalar). O app instalado se chama "HubKeep". Não há botão de instalação dentro do app.

**Primeiro acesso (com rede, uma vez).**
1. Entrar com **E-mail** e **Senha** na tela "HubKeep Técnico".
2. Aguardar o app baixar hotéis, locais, categorias, ativos e a fila do dia. Sem essa primeira leitura, aparecem os avisos "A fila do dia ainda não está no aparelho. Entre com rede uma vez para baixá-la." e "Os hotéis e locais ainda não estão no aparelho. Entre com rede uma vez para baixá-los."

**Fila do dia.**
- Faixa de rede: "Conectado" ou "Sem conexão. O que você fizer fica guardado e é enviado quando a rede voltar."
- Contador: "Tudo enviado." ou "N operações aguardando envio." Com pendência e rede, o botão **Enviar agora**.
- Cada OS aparece como "Local: descrição", com a situação. Tocar na OS abre a tela "Ordem de serviço".
- "Atualizada em ..." mostra quando a fila foi lida pela última vez.
- No rodapé: seletor **Idioma** (funciona sem rede e sincroniza depois).
- Operação que o servidor recusou aparece no topo, com o motivo, até tocar em **Dispensar**.

**Executar uma OS.**
1. Na fila, tocar na OS. Botão **Iniciar** (OS Atribuída).
2. Com a OS em execução: **Pausar** (depois **Retomar**) e **Concluir**. **Pausar** pergunta "Por que a OS vai pausar?": **Aguardando peça**, **Aguardando fornecedor**, **UH ocupada, sem acesso**, **Fim de turno** ou **Outro motivo**. O motivo vale para o SLA: conforme a política do hotel, alguns param o relógio.
3. Com a OS em execução ou pausada, a tela libera:
   - **Horas trabalhadas:** campos **Início** e **Fim**, botão **Apontar horas**. O fim tem de ser depois do início, sem passar do máximo e sem estar no futuro.
   - **Material usado:** texto livre ("Descreva o material (ex.: 2 m de cabo 2,5 mm)"), botão **Registrar material**.
   - **Fotos:** **Tirar ou escolher foto**, escolhendo o **Momento da foto** (**Antes do serviço** ou **Depois do serviço**). A foto é comprimida no aparelho e sobe quando houver rede. A foto também entra com a OS ainda Atribuída (o "antes", na chegada). Se o hotel ligou "Foto de depois na conclusão", a OS só conclui com ao menos uma foto de depois, e a tela mostra quantas há.
   - **Checklist** (se quem triou aplicou um): "Checklist: nome", um campo por item (texto, número com a unidade, data, sim/não ou lista; "*" marca o obrigatório) e **Salvar respostas**. Com a OS Atribuída, a tela pede "Inicie a ordem de serviço para responder o checklist.". Funciona sem rede. Se faltam itens obrigatórios, a tela avisa; com "Checklist completo na conclusão" ligado no hotel, a conclusão é recusada até respondê-los.
   - **Falha, causa e solução (opcional):** escolher a falha, a causa e a solução, se souber, ou "Não sei / em branco". É só sugestão para quem aceita: a conclusão nunca é recusada por falta de código.
4. Se o chamado tem ativo: **Equipamento parado** registra a parada agora; **Equipamento voltou a funcionar** encerra.
5. **Concluir:** o app pede confirmação ("Concluir a ordem de serviço? Depois disso, horas, material e fotos não entram mais nela."). Se a parada do chamado está aberta, pergunta "O equipamento voltou a funcionar?" com **Sim, voltou a funcionar**, **Não, continua parado** ou **Cancelar**. Com "Não", a parada continua aberta e aparece para o Gerente em "Paradas a encerrar".
   - Se a UH do chamado está indisponível (a OS mostra "UH indisponível desde ..."), o app pergunta também "A UH foi liberada para uso? A resposta conclui a ordem de serviço.", com **Sim, UH liberada**, **Não, continua indisponível** ou **Cancelar**. Havendo parada aberta, a pergunta da parada vem antes. Com "Não", a UH continua indisponível até a gestão liberar pelo web.
   - O PWA não mostra quem executa a OS nem o custo.
6. OS reaberta no aceite mostra "Reaberta no aceite: motivo".

**Abrir chamado.** Na fila, **Abrir chamado**; tela "Novo chamado": **Hotel** (se houver mais de um), **Local**, **Ativo (opcional)**, caixa "O equipamento está parado" (exige ativo), **Afeta hóspede?** (**Não sei**, o padrão, **Sim** ou **Não**), em local do tipo UH a caixa **A UH ficou indisponível** (o período começa na hora da abertura no aparelho), "O que está acontecendo?" e botão **Abrir chamado**. A UH pendente de licença aparece na lista, mas a abertura é recusada.

**Ativos.** Na fila, **Ativos**:
- Escolher o hotel, buscar por nome ("Buscar por nome (sem acento vale)"), tocar em **Alterar** ou **Fotos**.
- **Cadastrar ativo:** Local, Nome do ativo, Categoria, Fabricante, Modelo, Número de série e os campos da categoria ("(obrigatório)" quando for o caso) e, na parte recolhida **Compra, garantia e criticidade**, a data da compra, a garantia e a criticidade (1 a 5); botão **Cadastrar**. Sem rede, fica em "Aguardando envio".
- Fotos do ativo ("Fotos de ..."): precisam de rede ("Por enquanto, as fotos precisam de rede").
- O local aparece como "nome · edificação" quando o local tem edificação, aqui, na fila do dia, na OS e no novo chamado.
- OS preventiva gerada pelo plano: **[vai mudar na 1b]** (PV3; o plano já se cadastra no web, mas ainda não gera OS).

**Ler o QR do ativo.** O app não tem leitor próprio. Apontar a câmera do celular para a etiqueta: o QR leva a `/q/<código>` e abre o ativo no PWA (pelo aparelho, ou pela rede se ele não estiver guardado). Sem rede e sem o ativo no aparelho: "Este ativo não está guardado no aparelho. Abra o QR de novo quando houver conexão." Para abrir chamado a partir da etiqueta, o fluxo de hoje é abrir o ativo e voltar a **Abrir chamado**. Leitura que já preenche o chamado: **[ainda não existe]**.

**Offline.**
- Tudo que o técnico faz (ações da OS, horas, material, foto da OS, respostas do checklist, chamado, cadastro de ativo, idioma) entra numa fila no aparelho e sai na ordem, ao abrir o app, depois de cada operação, quando a rede volta e a cada 30 segundos.
- Reenviar não duplica: cada operação tem chave própria.
- Aviso de pendência antiga: "Há registros aguardando envio desde ...". Não deixar dias sem abrir o app com rede.
- Foto sem espaço no aparelho: "Não há espaço livre neste aparelho para guardar a foto." Fotos demais na fila: "Há fotos demais aguardando envio neste aparelho. Conecte-se à rede para enviá-las antes de tirar outras."

**Sair.** **Sair** apaga do aparelho a fila do dia e os dados guardados. Se houver operação não enviada, o app avisa e pergunta "Sair mesmo assim?". Conectar e usar **Enviar agora** antes.

**O que o técnico não faz.** Triar, gerar ou reatribuir OS, aceitar OS, mover ativo de local, importar hotel, gerir membros.

## 3. Solicitante

**O que vê.** No web, os chamados e as OS do hotel (lista e detalhe, com linha do tempo e **Ver histórico**). No PWA, só **Abrir chamado** (a fila do dia vem vazia).

**Abrir chamado (PWA).** Como na seção do Técnico: **Abrir chamado**, **Local**, **Ativo (opcional)**, **Afeta hóspede?** ("Não sei" quando não souber), em UH a caixa **A UH ficou indisponível**, "O que está acontecendo?", **Abrir chamado**. O chamado nasce em "Aberto" com a prioridade da categoria do ativo (se houver política) ou a padrão. Foto do chamado: **[ainda não existe]** na tela (a API de anexos existe, mas nenhuma tela a usa); a foto entra pela OS, pelo técnico.

**Acompanhar (web).** Menu **Chamados**: filtros **Hotel**, **Situação**, **Prioridade**, **De**, **Até**, botões **Filtrar** e **Limpar filtros**; **Carregar mais** para a próxima página. Abrir o chamado para ver a OS, o responsável e a **Linha do tempo**.

**Aceitar a OS (só do chamado que ela abriu).**
1. Abrir o chamado. Com a OS "Concluída", aparece o bloco **Aceite**: "A OS foi concluída. Aceite se o problema foi resolvido, ou reabra com o motivo."
2. Antes de aceitar, conferir os campos do aceite:
   - **Falha**, **Causa** e **Solução**, já com a sugestão do técnico (ou "Não informado"). Se o hotel exige os códigos no aceite, sem eles a recusa é "Neste hotel, o aceite exige falha, causa e solução. Faltam N códigos.".
   - **Custo informado (R$)**: "Opcional. Valor em reais, sem aprovação nem alçada." Vazio não grava nada; zero aparece como "Custo informado: R$ 0,00". Não há como corrigir o custo depois do aceite.
   - **Assinatura de quem aceita**: desenhar no quadro com o dedo, a caneta ou o mouse (**Limpar assinatura** para refazer). É a evidência do aceite, não uma assinatura digital. Obrigatória só se o hotel ligou "Assinatura no aceite"; sem ela, a recusa é "Neste hotel, o aceite exige a assinatura de quem aceita.". Depois, a OS mostra "Aceite com assinatura" e **Ver assinatura**; a assinatura não pode ser removida.
   - Na OS, as fotos aparecem com o momento (Antes, Depois) e, se houver, o checklist com as respostas do técnico.
3. **Aceitar** conclui o chamado.
4. Ou preencher **Motivo da reabertura** (obrigatório), marcar "O equipamento está parado" e **Parado desde** se houver ativo, e tocar em **Reabrir**. A reabertura não pede custo.

O painel "Triagem e atribuição" aparece no detalhe para todos; para o Solicitante qualquer ação volta recusada ("Você não faz a triagem neste hotel."). Se o Solicitante também executou a OS, não decide o aceite.

## 4. Gerente do hotel

**O que vê.** Todos os chamados, OS, ativos, locais e equipes do hotel dele (web) e a tela "Paradas abertas com OS concluída".

**Triagem de um chamado (web).** Em **Chamados**, abrir o chamado "Aberto". O painel **Triagem e atribuição** mostra só o que o estado permite:
1. **Triar:** escolher a prioridade (ou "Manter a atual") e tocar em **Triar**. O chamado vai a "Em triagem".
2. **Ajustar prioridade:** trocar a prioridade a qualquer momento até a execução.
3. **Gerar OS:** em **Responsável**, escolher uma equipe (grupo "Equipes") ou uma pessoa (grupo "Pessoas"); em **Quem executa**, **Equipe interna** (o padrão) ou um fornecedor ativo (grupo "Fornecedores"); e tocar em **Gerar OS**. O responsável é obrigatório mesmo quando quem executa é um fornecedor: é quem acompanha a OS no PWA. O grupo "Pessoas" lista só os Técnicos do hotel; a API recusa qualquer outra pessoa ("A pessoa escolhida não é Técnico ativo neste hotel."). O chamado vai a "Em execução" e a OS aparece como "Atribuída", na fila do dia do técnico (ou de quem está na equipe).
4. **Reatribuir:** passar a OS (atribuída, em execução ou pausada) para outro técnico ou equipe.
5. **Cancelar OS:** exige **Motivo do cancelamento**; o chamado volta à triagem para receber outra OS. Só pode existir uma OS não cancelada por chamado.
6. **Cancelar chamado:** só antes da OS (Aberto ou Em triagem), com motivo. Sem motivo: recusado. O cancelamento também encerra o período de UH indisponível do chamado.
7. **Afeta hóspede?** com **Salvar impacto** corrige o que veio da abertura, de Aberto até Aguardando aceite. **Salvar quem executa** troca a equipe interna pelo fornecedor (ou o contrário) até a conclusão da OS. As duas correções aparecem na **Linha do tempo**.
8. **Checklist** (no bloco da OS): escolher o **Modelo de checklist** e tocar em **Aplicar checklist**, com a OS Atribuída, Em execução ou Pausada. **Trocar checklist** só enquanto o técnico não respondeu ("O checklist desta ordem de serviço já tem respostas e não pode ser trocado."). A OS guarda a versão do modelo aplicada; mudar o modelo depois não muda a OS. As respostas do técnico aparecem no mesmo bloco, só para leitura.
9. Se outra pessoa alterou o registro antes: "Outra pessoa alterou este registro depois que você o abriu. Recarregue e refaça a alteração."

**UH indisponível.** No detalhe do chamado de uma UH, o painel **UH indisponível** mostra "Indisponível" ou "Liberada" e o período ("Desde ..., há N h" ou "De ... a ... (N h)").
- **Marcar UH indisponível**, com **Indisponível desde** (padrão: agora), vale de Aberto até Aguardando aceite e sem outro período aberto.
- **Liberar UH** encerra o período aberto. Quem conclui a OS também libera a UH, pelo PWA.
- A conclusão da OS e o aceite **não** liberam a UH sozinhos; o cancelamento do chamado libera.
- Não há lista de UHs indisponíveis como a de "Paradas a encerrar": o acompanhamento é pelo chamado.

**Aceite.** Na OS "Concluída", o bloco **Aceite**: **Aceitar**, com os códigos de falha, causa e solução, o custo informado e a assinatura (seção 3), ou **Reabrir** com motivo (e, se houver ativo, "O equipamento está parado" e **Parado desde**). O Gerente decide o aceite de qualquer chamado do hotel, exceto quando ele mesmo abriu e executou a OS. Aceite automático depois de N dias: a política existe na tela, mas o job que aceita sozinho **[ainda não existe]** (fase 1c).

**Paradas.** Menu **Paradas a encerrar**: lista "ativo: parado desde ... (duração)" e o estado da OS. **Encerrar parada** quando o equipamento voltar. No cadastro do ativo, **Ver paradas** mostra o histórico e o tempo parado total.

**Cadastros do hotel.**
- **Locais:** o Gerente cadastra **Cadastrar área comum** (Nome, Andar (opcional), **Edificação (opcional)**), **Salvar**, **Desativar**, **Reativar**. As UHs vêm do sistema hoteleiro e são só leitura, menos a edificação (torre ou bloco), que o sistema hoteleiro não tem: usar uma das sugestões para não repetir a mesma edificação com outra grafia.
- **Fornecedores:** valem para o grupo inteiro (o cadastrado por um hotel aparece para todos): **Nome do fornecedor**, **CNPJ** (14 caracteres, só números ou o CNPJ alfanumérico), **Nome do contato**, **Telefone do contato**, **E-mail do contato**; **Cadastrar**, **Salvar**, **Desativar**, **Reativar**.
- **Equipes:** **Nova equipe**, **Criar**, **Renomear**, **Pôr na equipe**, **Tirar**, **Desativar**.
- **Ativos:** **Cadastrar ativo**, **Salvar**, **Desativar**, **Mover**, **Ver movimentações**, **Ver QR**, **Anexar arquivo**.
- **Preventivas** (tela "Planos preventivos"): escolher o **Hotel**, **Novo plano** (**Nome do plano**; **Ativo ou categoria**, sendo que a categoria vale para todos os ativos dela no hotel; **A cada** N dias, semanas ou meses, até 366 dias, 52 semanas ou 24 meses; **Primeira data prevista**, com as **Próximas datas previstas**; **Checklist**; **Responsável padrão**, Técnico ou equipe), **Cadastrar plano**. **Ativar já** e **Ativar** precisam do responsável. Na lista, "Próxima: data", **Alterar**, **Pausar** e **Encerrar** (sem volta). O alvo fica fixo: para trocar, encerrar e cadastrar outro. Na ficha do ativo, **Ver planos preventivos**. O plano ainda não gera OS **[vai mudar na 1b]** (PV3).
- **Feriados do hotel** (menu **Configuração**): **Escolha o hotel**, **Data**, **Nome do feriado**, **Repete todo ano**, **Cadastrar**; na lista, **Salvar**, **Desativar** e **Reativar**. Os feriados nacionais e estaduais já entram sozinhos; cadastrar o municipal e o do próprio hotel. O feriado conta nos próximos prazos; o prazo já calculado não muda. A data não se altera: para trocar, desativar e cadastrar outro.
- **Ver histórico** em chamado, OS, local e ativo: mostra quem fez, quando e o antes e o depois.

**Auditoria** (menu **Configuração → Auditoria**, tela "Auditoria geral", só leitura): o que foi gravado no hotel dele. Filtros **De** e **Até** (até 92 dias por consulta), **Hotel**, **Tipo de registro**, **Ação** e **Pessoa**; **Consultar**, **Carregar mais**, **Ver o antes e o depois** e **Exportar CSV** (até 50.000 linhas; acima disso, diminuir o período). As ações e as pessoas dos filtros são as das linhas já carregadas. O que o sistema gravou sozinho aparece como "Sistema".

**HubKeep Intelligence** (só se o grupo contratou o módulo e o Admin do grupo incluiu o Gerente do hotel na política de abertura das telas; no padrão, o Gerente não vê o módulo). Menu **HubKeep Intelligence**: a lista de insights do hotel, a página de cada insight com "Por que estou vendo isso?" e a decisão (resolver ou descartar, com nota), e o detalhe do ativo. O Gerente decide só o insight do hotel dele; o insight de rede é do Admin do grupo e do Gestor CSC, e na página aparece "Você não decide este insight. Pode acompanhar a evidência.".

**Reclamações de hóspedes** (no módulo, pelo link "Reclamações de hóspedes: importar e classificar", acima da lista de insights; só no hotel dele):
1. **Importar arquivo CSV:** exportar as avaliações da ferramenta de pesquisa e montar o arquivo com as colunas do HubKeep (`id_externo, data, fonte, nota, escala, texto, idioma, uh`; **Baixar o modelo** traz o modelo). Escolher o **Arquivo CSV** e tocar em **Importar no** hotel. O resultado diz quantas entraram, quantas já existiam (a mesma fonte e o mesmo código não entram duas vezes) e as **Linhas com erro**, com o motivo. As colunas que não são do HubKeep, como nome e contato do hóspede, ficam de fora.
2. **Fila de classificação:** em **Mostrar**, "Sem classificação" (o padrão), "De manutenção", "Fora da manutenção" ou "Todas". Em cada reclamação, **Classificar** (ou **Alterar**): "É de manutenção?", a **Categoria do ativo**, a **UH** e, só depois de conferir, o **Ativo** e a **Ligação com o ativo** (possível ou confirmada). **Salvar a classificação**. Só a ligação confirmada pesa no impacto no hóspede do ativo.
3. **Abrir chamado:** na reclamação de manutenção com UH ou ativo e ainda sem chamado. O chamado abre no local do ativo ou na UH, marcado como "afeta hóspede", com a descrição sugerida (sem o texto do hóspede, que o técnico não lê) e a prioridade e o prazo de sempre; depois, **Ver o chamado**. Se aparecer **Ligar de novo**, o chamado abriu, mas a ligação falhou: tocar para ligar.
4. **Na página do insight sistêmico das reclamações:** a lista **Reclamações da evidência** e **Abrir um chamado para as reclamações sem chamado**, escolhendo o **Local do chamado (UH ou área comum)**.
5. **Na página do ativo:** a seção **Impacto no hóspede**, com o score de 100 e os componentes, ou a porcentagem dos chamados quando o hotel não importou reclamação em 90 dias, e as reclamações ligadas ao ativo ("Pesa no score" ou "Não pesa").

O texto da reclamação é apagado 365 dias depois da data da avaliação; a classificação fica (padrão provisório, pergunta 38 de `docs/referencia/perguntas-cliente.md`).

**Não faz.** Ativar hotel, categorias, códigos de manutenção, modelos de checklist, políticas, membros e papéis, proprietários, bandeiras.

## 5. Gestor CSC

**Escopo.** Grupo inteiro ou uma bandeira. **O que vê.** Chamados, OS, ativos e locais dos hotéis do escopo.

**Faz.**
- **Triagem e atribuição**, igual ao Gerente (seção 4): Triar, Ajustar prioridade, Gerar OS (com quem executa), Reatribuir, Cancelar OS, Cancelar chamado, Salvar impacto, Salvar quem executa, Aplicar e Trocar checklist.
- **Auditoria**, **Preventivas** e **Feriados do hotel**, como o Gerente (seção 4), nos hotéis do escopo.
- **Paradas a encerrar:** acompanhar e **Encerrar parada**. **UH indisponível:** marcar e liberar pelo detalhe do chamado.
- **Cadastros de hotel:** Locais (áreas comuns e edificação), Equipes e Ativos, nos hotéis do escopo.
- **Fornecedores:** cadastra como o Gerente, desde que o papel alcance algum hotel do grupo. O Gestor CSC de uma bandeira ainda sem hotel recebe "Seu papel ainda não alcança nenhum hotel do grupo, então você não cadastra fornecedores..." e pede ao Admin do grupo.
- **HubKeep Intelligence** (com o módulo, a partir da data de abertura das telas): decide os insights dos hotéis do escopo e o insight de rede quando cobre todos os hotéis dele. Importa e classifica as reclamações de hóspedes e abre chamado a partir delas, como o Gerente (seção 4), em qualquer hotel do escopo; quem vai fazer isso no piloto é a pergunta 39 de `docs/referencia/perguntas-cliente.md`.
- **Acompanhar** pelo menu Chamados e Ordens de serviço, com filtro por hotel, situação, prioridade e período; **Linha do tempo** e **Ver histórico**.

**Aceite.** O Gestor CSC aceita ou reabre só nos chamados que ele mesmo abriu ou no caso especial: quem abriu o chamado também executou a OS e não há outro Gerente ativo no hotel. Com Gerente no hotel, quem decide é o Gerente.

**Não faz.** Ativar hotel, conceder papel, convidar pessoas, categorias, códigos de manutenção, modelos de checklist, políticas, bandeiras, proprietários.

**SLA:** o chamado já tem o prazo de atendimento e o de solução (na ficha do chamado, em **Ver histórico** e na **Auditoria**), e o monitor já registra o prazo em risco e o vencido, sem tela. Selo na ficha, painel dos avisos, indicadores e notificações: **[ainda não existe]** (fase 1c).

## 6. Admin do grupo

**Escopo.** Grupo inteiro. Faz tudo o que o Gestor CSC faz, mais a administração do grupo.

**Início.** Tela "Hotéis" com a situação de cada hotel (ativo, em implantação, desativado).

**Hotéis** (menu **Hotéis**, tela "Hotéis do sistema hoteleiro"):
1. A faixa "Licença: X de Y hotéis ativos e Z de W UHs ativas." mostra o saldo.
2. Hotel que chegou do sistema hoteleiro aparece como "Não importado". Escolher o **fuso** ("Escolha o fuso") e tocar em **Trazer para implantação**: o hotel é criado "em implantação", sem consumir licença.
3. Quando o hotel estiver pronto (ver `guia-implantacao-hotel.md`), **Ativar**. Consome uma licença de hotel e libera as UHs até o saldo; as demais ficam "pendente de licença". Sem saldo: "Não há licença de hotel disponível (X de Y em uso). A EasyGov foi avisada."
4. "Difere do sistema hoteleiro: nome, fuso horário" indica divergência entre o cadastro e o que chegou.

**Membros e papéis** (menu **Membros e papéis**):
1. **Convidar pessoa:** **Nome**, **E-mail**, **Papel**, **Hotel (vazio: grupo inteiro)**, **Validade**; **Enviar convite**. Resposta "Convite enviado."
2. Na lista de cada pessoa: **Conceder papel** (outro papel ou outro hotel), **Revogar**, **Salvar validade**, **Desativar** e **Reativar**. Selos "revogado" e "vencido".
3. Ninguém altera o próprio acesso ("Você não pode alterar o seu próprio acesso.").
4. O papel Implantador exige hotel e validade; o Proprietário só vale para UHs de um proprietário ou hotel inteiro.

**Outras telas do Admin.**
- **Bandeiras:** **Nova bandeira**, **Criar**, **Renomear**, **Desativar**; "Bandeira de cada hotel".
- **Categorias de ativo:** **Instalar categorias padrão** (10 padrão), **Criar categoria**, **Salvar nomes** (por idioma), **Acrescentar campo** (Chave, Rótulo, Tipo, Unidade, Opções, Obrigatório), **Tirar campo**, **Desativar**.
- **Proprietários:** **Novo proprietário**, **Vincular a uma UH ou ao hotel inteiro**, **Dar acesso** ou **Convidar como proprietário** (somente leitura).
- **Checklists** (tela "Modelos de checklist"): **Criar checklist** (**Nome do checklist**, **Categoria sugerida** ou "Todas as categorias", o nome em cada idioma), **Acrescentar item** e **Acrescentar item de conformidade** (Conforme, Não conforme, Não se aplica), **Tirar item**, **Salvar**, **Desativar** e **Reativar**. Mudar os itens cria uma versão nova; as OS que já têm o checklist ficam com a versão delas. Só o Admin do grupo grava; a gestão e o Implantador leem.
- **Configuração e políticas:** dados do grupo e do hotel (País, Estado ou província, Moeda, Idioma padrão, Fuso horário e, no hotel, **Modelo contratual**: Próprio, Administrado, Arrendado, Afiliado ou Não informado) e as políticas. Cada política do núcleo pode ser gravada no grupo, na bandeira do hotel (**Gravar na bandeira**, **Voltar a herdar na bandeira**) ou no hotel; vale a do hotel, senão a da bandeira, senão a do grupo, senão o padrão, e a tela diz a origem ("definido no hotel", "definido na bandeira", "definido no grupo" ou "padrão do sistema"). As políticas:
  - "Aceite automático da OS concluída" (**Ligado**, **Dias depois da conclusão**, **Gravar no grupo** ou **Gravar no hotel**, **Voltar ao padrão no grupo**, **Voltar a herdar no hotel**);
  - "Nomes dos níveis de criticidade do ativo" (padrão: 1 Muito baixa, 2 Baixa, 3 Média, 4 Alta, 5 Crítica), no grupo ou no hotel;
  - "Códigos obrigatórios no aceite" (**Exigir falha, causa e solução no aceite**, desligado por padrão);
  - "Foto de depois na conclusão" (**Exigir ao menos uma foto de depois para concluir**, desligado por padrão);
  - "Assinatura no aceite" (**Exigir a assinatura de quem aceita**, desligado por padrão);
  - "Checklist completo na conclusão" (**Exigir os itens obrigatórios do checklist para concluir**, desligado por padrão; desligado, o PWA só avisa o que falta);
  - "Prioridade padrão por categoria de ativo" aparece só como resumo: a edição pela tela **[ainda não existe]**.
- **Códigos de manutenção** (tela "Códigos de falha, causa e solução"): **Instalar códigos padrão** (37 códigos), **Criar código**, **Editar nomes**, **Salvar nomes**, **Desativar**, **Reativar**. Só o Admin do grupo.
- **Preventivas** e **Feriados do hotel:** como o Gerente (seção 4), em qualquer hotel do grupo.
- **Auditoria:** como o Gerente (seção 4), no grupo inteiro; as linhas do grupo, sem hotel, aparecem como "Grupo".
- **Painel de implantação:** "O que falta" por hotel (ver guia de implantação).
- **HubKeep Intelligence → Abertura das telas** (só com o módulo contratado; também antes da abertura): "Abrem em", "De onde vem a data" (por padrão, "60 dias depois da primeira ativação do módulo") e "Quem vê as telas". Em **Mudar a abertura**: **Abrir a partir de** (em branco, conta os dias), **Dias depois da primeira ativação**, os papéis que veem (Admin do grupo, Gestor CSC, Gerente do hotel), **Salvar** e **Voltar ao padrão**. O dia começa à meia-noite de Brasília. Antes da abertura, nem o Admin vê a lista de insights nem a tela de reclamações de hóspedes; o cálculo já acontece todo dia.
- **HubKeep Intelligence → Reclamações de hóspedes:** como o Gerente (seção 4), em qualquer hotel do grupo.
- Sem tela, só pela API ou script de operação: situações e prioridades padrão (no grupo do cliente, o provisionamento já instala, junto com as categorias, os códigos e a prioridade por categoria), credencial do agente conector (criar e revogar), gravar política de prioridade por categoria, política de SLA (`chamado.sla`) e de escalonamento (`chamado.escalonamento`), as políticas do HubKeep Intelligence (menos a abertura das telas), entre elas a retenção do texto da reclamação (`inteligencia.sinal_hospede`) e o Guest Impact Score (`inteligencia.impacto_hospede`), e a contratação do HubKeep Intelligence (pelo backoffice; hoje, só no dev, `pnpm ops:modulo`).

**Ainda por vir.** A OS preventiva gerada pelo plano: **[vai mudar na 1b]** (PV3; o cadastro dos planos já existe). Importação de ativos por planilha, QR em lote, modelos por categoria, aprovação de ativos cadastrados pelo celular: **[ainda não existe]** (M1 a M4).

## 7. Outros papéis (para consulta)

**Implantador.** Papel temporário de um hotel, sempre com validade. Usa o **Painel de implantação**, **Membros e papéis** (só concede papéis abaixo do dele, só no hotel dele; não concede Admin do grupo, Implantador nem Proprietário), **Locais** (inclusive a edificação), **Equipes**, **Ativos** (com compra, garantia e criticidade), **Preventivas** e **Feriados do hotel**, no hotel dele. Lê os **Fornecedores** e os modelos de **Checklists**, sem gravar. Não ativa hotel nem libera licença. Não faz triagem.

**Proprietário.** Somente leitura. De UH: vê só os chamados e OS da UH vinculada, com a linha do tempo e o histórico (quem gravou aparece como "por outra pessoa"). Do hotel inteiro: vê os chamados do hotel. Da UH indisponível, vê só a UH, o estado e as datas. Não lê fornecedores nem o HubKeep Intelligence. Só vale dentro da vigência do vínculo.

## 8. Onde cada tarefa vive hoje

| Tarefa | Onde |
|---|---|
| Abrir chamado | PWA (não existe tela de abertura no web); no web, só a partir de uma reclamação de hóspede, no HubKeep Intelligence |
| Triagem, atribuição (com quem executa), checklist na OS, impacto no hóspede, aceite (com custo, códigos e assinatura), paradas | Web |
| UH indisponível | PWA (marcar na abertura, liberar na conclusão) e web (marcar e liberar) |
| Iniciar, pausar (com motivo), retomar, concluir, horas, material, foto da OS (antes ou depois), respostas do checklist, sugestão de falha, causa e solução | PWA |
| Cadastrar ativo | Web e PWA |
| QR do ativo | Web ("Ver QR"); leitura pela câmera do celular |
| Hotel, bandeiras, categorias, códigos de manutenção, modelos de checklist, membros, configuração | Web (Admin do grupo) |
| Auditoria geral | Web (Admin do grupo, Gestor CSC e Gerente) |
| Planos preventivos e feriados do hotel | Web (Admin do grupo, Gestor CSC, Gerente e Implantador) |
| Fornecedores | Web (Admin do grupo, Gestor CSC e Gerente) |
| HubKeep Intelligence | Web, só com o módulo contratado e depois da abertura das telas (no padrão, Admin do grupo e Gestor CSC) |
| Abertura das telas do HubKeep Intelligence | Web (Admin do grupo), também antes da abertura |
| Reclamações de hóspedes (importar, classificar, abrir chamado) | Web, no HubKeep Intelligence, depois da abertura das telas, para quem decide insight no hotel |
