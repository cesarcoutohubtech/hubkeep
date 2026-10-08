# Manual por papel (piloto)

Manual curto, um bloco por papel, escrito sobre o que existe na `main` hoje. Os nomes de botões, menus e mensagens são os do catálogo pt-BR (`packages/i18n/catalogos/pt-BR.json`). O que ainda não existe ou vai mudar na fase 1b está marcado com **[ainda não existe]** ou **[vai mudar na 1b]**, com a referência ao plano (`docs/12-plano-fase-1b.md`) ou ao documento que define a tarefa.

## 1. O que vale para todos

**Dois aplicativos.**
- **Web** (telas do CSC, dos gerentes e da implantação): entrada em `/login`.
- **PWA "HubKeep Técnico"** (celular): fila do dia, abrir chamado, ativos. Funciona sem rede.
- O endereço de produção de cada um **[ainda não existe]**: staging e produção estão suspensos até perto do piloto (`docs/04`, F0-12). O domínio previsto do PWA é `tecnico.hubkeep.com.br` (`docs/01`).

**Entrar.**
1. O acesso é por convite. A pessoa recebe o e-mail "Convite para o HubKeep" e toca em **Aceitar o convite**.
2. Na tela "Defina sua senha", digita a **Nova senha** (mínimo de 8 caracteres) e toca em **Salvar e entrar**.
3. Nos acessos seguintes: "Entrar no HubKeep", campos **E-mail** e **Senha**, botão **Entrar**. Erro: "E-mail ou senha incorretos."
4. Esqueci a senha: **[ainda não existe]**. A recuperação de senha entra na fase 1c, junto com o e-mail próprio (`docs/11`, decisão de 05/10/2026). Até lá, o link de recuperação é recusado.
5. Segundo fator (TOTP) para Admin do grupo, Gestor CSC e Implantador: **[ainda não existe]**; é condição antes do piloto (SP1, `docs/05`). Quando entrar, esses três papéis passam a precisar do segundo fator para entrar.

**Barra do web.** Seletor **Idioma** (pt-BR, en, es, fr), botão **Tema claro** e botão **Sair**. Quem pertence a mais de um grupo vê também o seletor **Grupo**.

**Menu do web.** É o mesmo para todos os papéis; quem decide o que cada um pode fazer é o servidor, e a recusa vem traduzida (por exemplo "Você não tem permissão para esta ação."). Itens:
- **Operação:** Início, Chamados, Ordens de serviço, Paradas a encerrar.
- **Cadastros:** Hotéis, Locais, Categorias de ativo, Ativos, Equipes, Proprietários, Bandeiras, Membros e papéis.
- **Configuração:** Configuração e políticas, Painel de implantação.

**Escopo.** Cada pessoa só enxerga os hotéis do seu papel (hotel, bandeira ou grupo inteiro). Fora do escopo, o registro aparece como "não encontrado".

**Ciclo do chamado e da OS** (situações padrão; o grupo pode renomear):
- Chamado: Aberto, Em triagem, Em execução, Aguardando aceite, Concluído, Cancelado.
- OS: Atribuída, Em execução, Pausada, Concluída, Aceita, Cancelada.
- Fluxo normal: o chamado é aberto (PWA), a triagem gera a OS para um técnico ou uma equipe, o técnico executa e conclui, quem abriu (ou o Gerente) aceita. No aceite, o chamado vai a Concluído; se reabrir, volta a Em execução, com motivo.

**Quem faz o quê** (conferido em `packages/dominio/src/corretiva.ts`, `ativos.ts`, `locais.ts`, `equipes.ts`, `permissoes.ts`):

| Ação | Admin do grupo | Gestor CSC | Gerente do hotel | Técnico | Solicitante | Implantador |
|---|---|---|---|---|---|---|
| Ver chamados e OS do escopo (web) | sim | sim | sim | sim | sim | sim |
| Abrir chamado (PWA) | sim | sim | sim | sim | sim | sim |
| Triar, ajustar prioridade, gerar OS, reatribuir, cancelar OS, cancelar chamado | sim | sim | sim | não | não | não |
| Iniciar, pausar, retomar, concluir OS; horas, material, foto, parada (PWA) | não | não | não | sim, só na OS dele ou da equipe dele | não | não |
| Aceitar ou reabrir a OS concluída | se abriu o chamado, ou no caso especial (nota abaixo) | se abriu o chamado, ou no caso especial | sim, em qualquer chamado do hotel (menos na OS que ele mesmo abriu e executou) | só se abriu o chamado e não executou a OS | só se abriu o chamado | só se abriu o chamado |
| Ver e encerrar paradas pelo web ("Paradas a encerrar") | sim | sim | sim | não | não | não |
| Cadastrar, editar e desativar ativo | sim | sim | sim | sim | não | sim |
| Mover ativo de local | sim | sim | sim | não | não | sim |
| Cadastrar área comum, gerir equipes do hotel | sim | sim | sim | não | não | sim |
| Membros e papéis (convidar, conceder, revogar) | sim | não | não | não | não | sim, só no hotel dele, abaixo do papel dele |
| Categorias, bandeiras, proprietários, hotéis (importar, ativar), configuração e políticas | sim | não | não | não | não | não |
| Painel de implantação | sim | não | não | não | não | sim |

Nota sobre o aceite: quem abriu o chamado e também executa a OS (ele ou a equipe dele) não decide o aceite. Se, além disso, não há outro Gerente ativo no hotel, decidem o Gestor CSC ou o Admin do grupo (caso especial, `corretiva.ts`).

Proprietário (UH ou hotel inteiro) só lê o que é dele; não grava nada.

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
2. Com a OS em execução: **Pausar** (depois **Retomar**) e **Concluir**.
3. Com a OS em execução ou pausada, a tela libera:
   - **Horas trabalhadas:** campos **Início** e **Fim**, botão **Apontar horas**. O fim tem de ser depois do início, sem passar do máximo e sem estar no futuro.
   - **Material usado:** texto livre ("Descreva o material (ex.: 2 m de cabo 2,5 mm)"), botão **Registrar material**.
   - **Fotos:** **Tirar ou escolher foto**. A foto é comprimida no aparelho e sobe quando houver rede.
4. Se o chamado tem ativo: **Equipamento parado** registra a parada agora; **Equipamento voltou a funcionar** encerra.
5. **Concluir:** o app pede confirmação ("Concluir a ordem de serviço? Depois disso, horas, material e fotos não entram mais nela."). Se a parada do chamado está aberta, pergunta "O equipamento voltou a funcionar?" com **Sim, voltou a funcionar**, **Não, continua parado** ou **Cancelar**. Com "Não", a parada continua aberta e aparece para o Gerente em "Paradas a encerrar".
6. OS reaberta no aceite mostra "Reaberta no aceite: motivo".

**Abrir chamado.** Na fila, **Abrir chamado**; tela "Novo chamado": **Hotel** (se houver mais de um), **Local**, **Ativo (opcional)**, caixa "O equipamento está parado" (exige ativo), "O que está acontecendo?" e botão **Abrir chamado**. A UH pendente de licença aparece na lista, mas a abertura é recusada.

**Ativos.** Na fila, **Ativos**:
- Escolher o hotel, buscar por nome ("Buscar por nome (sem acento vale)"), tocar em **Alterar** ou **Fotos**.
- **Cadastrar ativo:** Local, Nome do ativo, Categoria, Fabricante, Modelo, Número de série e os campos da categoria ("(obrigatório)" quando for o caso), botão **Cadastrar**. Sem rede, fica em "Aguardando envio".
- Fotos do ativo ("Fotos de ..."): precisam de rede ("Por enquanto, as fotos precisam de rede").
- Data de compra, garantia e criticidade no cadastro pelo celular: **[vai mudar na 1b]** (I1; ficam numa parte recolhida, "Compra, garantia e criticidade").
- Códigos de falha, causa e solução na conclusão: **[vai mudar na 1b]** (I4; só como sugestão, a conclusão nunca é recusada por falta de código).
- Pergunta "afeta hóspede?" na abertura do chamado: **[vai mudar na 1b]** (I2).
- Checklist da preventiva: **[ainda não existe]** (P1 a P3).

**Ler o QR do ativo.** O app não tem leitor próprio. Apontar a câmera do celular para a etiqueta: o QR leva a `/q/<código>` e abre o ativo no PWA (pelo aparelho, ou pela rede se ele não estiver guardado). Sem rede e sem o ativo no aparelho: "Este ativo não está guardado no aparelho. Abra o QR de novo quando houver conexão." Para abrir chamado a partir da etiqueta, o fluxo de hoje é abrir o ativo e voltar a **Abrir chamado**. Leitura que já preenche o chamado: **[ainda não existe]**.

**Offline.**
- Tudo que o técnico faz (ações da OS, horas, material, foto da OS, chamado, cadastro de ativo, idioma) entra numa fila no aparelho e sai na ordem, ao abrir o app, depois de cada operação, quando a rede volta e a cada 30 segundos.
- Reenviar não duplica: cada operação tem chave própria.
- Aviso de pendência antiga: "Há registros aguardando envio desde ...". Não deixar dias sem abrir o app com rede.
- Foto sem espaço no aparelho: "Não há espaço livre neste aparelho para guardar a foto." Fotos demais na fila: "Há fotos demais aguardando envio neste aparelho. Conecte-se à rede para enviá-las antes de tirar outras."

**Sair.** **Sair** apaga do aparelho a fila do dia e os dados guardados. Se houver operação não enviada, o app avisa e pergunta "Sair mesmo assim?". Conectar e usar **Enviar agora** antes.

**O que o técnico não faz.** Triar, gerar ou reatribuir OS, aceitar OS, mover ativo de local, importar hotel, gerir membros.

## 3. Solicitante

**O que vê.** No web, os chamados e as OS do hotel (lista e detalhe, com linha do tempo e **Ver histórico**). No PWA, só **Abrir chamado** (a fila do dia vem vazia).

**Abrir chamado (PWA).** Como na seção do Técnico: **Abrir chamado**, **Local**, **Ativo (opcional)**, "O que está acontecendo?", **Abrir chamado**. O chamado nasce em "Aberto" com a prioridade da categoria do ativo (se houver política) ou a padrão. Foto do chamado: **[ainda não existe]** na tela (a API de anexos existe, mas nenhuma tela a usa); a foto entra pela OS, pelo técnico.

**Acompanhar (web).** Menu **Chamados**: filtros **Hotel**, **Situação**, **Prioridade**, **De**, **Até**, botões **Filtrar** e **Limpar filtros**; **Carregar mais** para a próxima página. Abrir o chamado para ver a OS, o responsável e a **Linha do tempo**.

**Aceitar a OS (só do chamado que ela abriu).**
1. Abrir o chamado. Com a OS "Concluída", aparece o bloco **Aceite**: "A OS foi concluída. Aceite se o problema foi resolvido, ou reabra com o motivo."
2. **Aceitar** conclui o chamado.
3. Ou preencher **Motivo da reabertura** (obrigatório), marcar "O equipamento está parado" e **Parado desde** se houver ativo, e tocar em **Reabrir**.

O painel "Triagem e atribuição" aparece no detalhe para todos; para o Solicitante qualquer ação volta recusada ("Você não faz a triagem neste hotel."). Se o Solicitante também executou a OS, não decide o aceite.

## 4. Gerente do hotel

**O que vê.** Todos os chamados, OS, ativos, locais e equipes do hotel dele (web) e a tela "Paradas abertas com OS concluída".

**Triagem de um chamado (web).** Em **Chamados**, abrir o chamado "Aberto". O painel **Triagem e atribuição** mostra só o que o estado permite:
1. **Triar:** escolher a prioridade (ou "Manter a atual") e tocar em **Triar**. O chamado vai a "Em triagem".
2. **Ajustar prioridade:** trocar a prioridade a qualquer momento até a execução.
3. **Gerar OS:** em **Responsável**, escolher uma equipe (grupo "Equipes") ou uma pessoa (grupo "Pessoas") e tocar em **Gerar OS**. A pessoa tem de ser Técnico ativo no hotel; senão: "A pessoa escolhida não é Técnico ativo neste hotel." O chamado vai a "Em execução" e a OS aparece como "Atribuída", na fila do dia do técnico (ou de quem está na equipe).
4. **Reatribuir:** passar a OS (atribuída, em execução ou pausada) para outro técnico ou equipe.
5. **Cancelar OS:** exige **Motivo do cancelamento**; o chamado volta à triagem para receber outra OS. Só pode existir uma OS não cancelada por chamado.
6. **Cancelar chamado:** só antes da OS (Aberto ou Em triagem), com motivo. Sem motivo: recusado.
7. Se outra pessoa alterou o registro antes: "Outra pessoa alterou este registro depois que você o abriu. Recarregue e refaça a alteração."

**Aceite.** Na OS "Concluída", o bloco **Aceite**: **Aceitar** ou **Reabrir** com motivo (e, se houver ativo, "O equipamento está parado" e **Parado desde**). O Gerente decide o aceite de qualquer chamado do hotel, exceto quando ele mesmo abriu e executou a OS. Aceite automático depois de N dias: a política existe na tela, mas o job que aceita sozinho **[ainda não existe]** (fase 1c).

**Paradas.** Menu **Paradas a encerrar**: lista "ativo: parado desde ... (duração)" e o estado da OS. **Encerrar parada** quando o equipamento voltar. No cadastro do ativo, **Ver paradas** mostra o histórico e o tempo parado total.

**Cadastros do hotel.**
- **Locais:** o Gerente cadastra **Cadastrar área comum** (Nome, Andar (opcional)), **Salvar**, **Desativar**, **Reativar**. As UHs vêm do sistema hoteleiro e são só leitura.
- **Equipes:** **Nova equipe**, **Criar**, **Renomear**, **Pôr na equipe**, **Tirar**, **Desativar**.
- **Ativos:** **Cadastrar ativo**, **Salvar**, **Desativar**, **Mover**, **Ver movimentações**, **Ver QR**, **Anexar arquivo**.
- **Ver histórico** em chamado, OS, local e ativo: mostra quem fez, quando e o antes e o depois.

**Não faz.** Ativar hotel, categorias, políticas, membros e papéis, proprietários, bandeiras.

## 5. Gestor CSC

**Escopo.** Grupo inteiro ou uma bandeira. **O que vê.** Chamados, OS, ativos e locais dos hotéis do escopo.

**Faz.**
- **Triagem e atribuição**, igual ao Gerente (seção 4): Triar, Ajustar prioridade, Gerar OS, Reatribuir, Cancelar OS, Cancelar chamado.
- **Paradas a encerrar:** acompanhar e **Encerrar parada**.
- **Cadastros de hotel:** Locais (áreas comuns), Equipes e Ativos, nos hotéis do escopo.
- **Acompanhar** pelo menu Chamados e Ordens de serviço, com filtro por hotel, situação, prioridade e período; **Linha do tempo** e **Ver histórico**.

**Aceite.** O Gestor CSC aceita ou reabre só nos chamados que ele mesmo abriu ou no caso especial: quem abriu o chamado também executou a OS e não há outro Gerente ativo no hotel. Com Gerente no hotel, quem decide é o Gerente.

**Não faz.** Ativar hotel, conceder papel, convidar pessoas, categorias, políticas, bandeiras, proprietários.

**Indicadores, SLA, notificações:** **[ainda não existe]** (fase 1c).

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
- **Configuração e políticas:** dados do grupo e do hotel (País, Estado ou província, Moeda, Idioma padrão, Fuso horário) e a política "Aceite automático da OS concluída" (**Ligado**, **Dias depois da conclusão**, **Gravar no grupo** ou **Gravar no hotel**, **Voltar ao padrão no grupo**, **Voltar a herdar no hotel**). "Prioridade padrão por categoria de ativo" aparece só como resumo: a edição pela tela **[ainda não existe]**.
- **Painel de implantação:** "O que falta" por hotel (ver guia de implantação).
- Sem tela, só pela API ou script de operação: situações e prioridades padrão (instalação), credencial do agente conector (criar e revogar), gravar política de prioridade por categoria.

**Nas telas de 1b.** Nomes dos níveis de criticidade na configuração, cadastro de códigos de manutenção (falha, causa, solução), "executado por" e custo informado no aceite: **[vai mudar na 1b]** (I1, I2, I4). Importação de ativos por planilha, QR em lote, modelos por categoria, aprovação de ativos cadastrados pelo celular, planos preventivos e checklist: **[ainda não existe]** (M1 a M4, P1 a P3).

## 7. Outros papéis (para consulta)

**Implantador.** Papel temporário de um hotel, sempre com validade. Usa o **Painel de implantação**, **Membros e papéis** (só concede papéis abaixo do dele, só no hotel dele; não concede Admin do grupo, Implantador nem Proprietário), **Locais**, **Equipes** e **Ativos**. Não ativa hotel nem libera licença. Não faz triagem.

**Proprietário.** Somente leitura. De UH: vê só os chamados e OS da UH vinculada, com a linha do tempo e o histórico (quem gravou aparece como "por outra pessoa"). Do hotel inteiro: vê os chamados do hotel. Só vale dentro da vigência do vínculo.

## 8. Onde cada tarefa vive hoje

| Tarefa | Onde |
|---|---|
| Abrir chamado | PWA (não existe tela de abertura no web) |
| Triagem, atribuição, aceite, paradas | Web |
| Iniciar, pausar, retomar, concluir, horas, material, foto da OS | PWA |
| Cadastrar ativo | Web e PWA |
| QR do ativo | Web ("Ver QR"); leitura pela câmera do celular |
| Hotel, bandeiras, categorias, membros, configuração | Web (Admin do grupo) |
