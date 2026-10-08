# Roteiro de treinamento do piloto

Proposta de treinamento para os hotéis do piloto, escrita sobre o que existe na `main`. Durações e agenda são **propostas** para o Cesar ajustar. O que ainda não existe ou vai mudar na 1b está marcado com **[ainda não existe]** ou **[vai mudar na 1b]** (`docs/12-plano-fase-1b.md`). Os rótulos entre aspas são os da interface; o passo a passo por papel está em `manual-por-papel.md`.

## 1. Os hotéis do piloto

Os hotéis **não estão nomeados** nos documentos. O `docs/00` prevê piloto de 4 semanas em 2 a 3 hotéis, a confirmação com o cliente é depois de 01/10/2026 (`docs/04`) e a pergunta 17 do `docs/referencia/perguntas-cliente.md` (quais hotéis e quando) segue aberta. O pedido deste roteiro fala em 4 hotéis; a diferença para o plano (2 a 3) precisa de confirmação.

| # | Hotel | Gerente | Data do treinamento | Idiomas em uso |
|---|---|---|---|---|
| 1 | [hotel 1 a definir] | [a definir] | [a definir] | [a definir] |
| 2 | [hotel 2 a definir] | [a definir] | [a definir] | [a definir] |
| 3 | [hotel 3 a definir] | [a definir] | [a definir] | [a definir] |
| 4 | [hotel 4 a definir] | [a definir] | [a definir] | [a definir] |

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
- [ ] Ambiente acessível pelos celulares do treinamento. Hoje só existe o ambiente de dev, e o kit de teste roda no notebook (`docs/10`); staging e produção **[ainda não existem]** (F0-12 suspensa, `docs/04`). Definir onde o treinamento acontece antes de marcar as datas.
- [ ] Os dados de exercício usam o **Grupo Demonstração** do kit (`pnpm demo:dados --ambiente dev`), nunca o grupo real do cliente. O script recusa qualquer ambiente que não seja o dev.
- [ ] Contas do kit em `docs/10` (domínio `.test`, sem e-mail real), com a senha de teste combinada pelo instrutor. Nunca reutilizar uma senha real.
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
| 1:30 a 1:50 | **Aceite** e **Reabrir** (exercício 6) |
| 1:50 a 2:10 | **Paradas a encerrar** (exercício 7) |
| 2:10 a 2:30 | Cadastros do hotel: Locais, Equipes, Ativos, **Ver QR**; dúvidas |

Para o Admin do grupo e o Gestor CSC, acrescentar 30 min: **Membros e papéis**, **Hotéis** (Trazer para implantação, Ativar), **Configuração e políticas**.

### Sessão B. Técnicos (2 h, mais 1 h de prática)

| Tempo | Conteúdo |
|---|---|
| 0:00 a 0:15 | Instalar e entrar; conferir o PWA instalado; conferir idioma |
| 0:15 a 0:35 | **Fila do dia**: faixa de rede, contador de operações, **Enviar agora** |
| 0:35 a 1:15 | Executar OS: **Iniciar**, **Apontar horas**, **Registrar material**, foto, **Concluir** (exercício 4) |
| 1:15 a 1:35 | Parada do equipamento e a pergunta "O equipamento voltou a funcionar?" (exercício 5) |
| 1:35 a 2:00 | Offline (exercício 8) |
| Prática (1 h) | No hotel: ler QR real, abrir o ativo, **Fotos**, **Alterar** e abrir **Abrir chamado** (exercício 9) |

### Sessão C. Solicitantes (45 min)

| Tempo | Conteúdo |
|---|---|
| 0:00 a 0:10 | Instalar, entrar, idioma |
| 0:10 a 0:30 | **Abrir chamado** (exercício 2), inclusive sem rede |
| 0:30 a 0:45 | Acompanhar pelo web e **Aceitar** a OS do chamado que abriu (exercício 6) |

### Sessão D. Implantação (1 h 30)

**Membros e papéis** (convidar, **Conceder papel**, **Revogar**, validade), **Equipes**, **Cadastrar ativo**, **Ver QR**, **Painel de implantação**, critérios de hotel pronto.

## 5. Exercícios práticos com o kit de teste

Dados e contas do `docs/10`: Grupo Demonstração, Hotel Demonstração Centro (Bandeira Azul), Hotel Demonstração Praia, Hotel Demonstração Serra (em implantação). Cada exercício indica papel, conta do kit e resultado esperado. Os chamados do kit servem uma vez: rodar o script de novo completa o que falta, mas não desfaz o que a turma fez (`docs/10`, seção 6). Para a turma seguinte, abrir chamados novos pelo PWA com a Solicitante; o recomeço do zero exige apagar o grupo pelo dono do banco, sem script (pergunta em aberto no README).

| # | Papel (conta) | Exercício | Resultado esperado |
|---|---|---|---|
| 1 | Todos | Entrar no web (`/login`) e no PWA; trocar o **Idioma** para en e voltar; **Sair** | Telas mudam de idioma; o PWA em modo avião continua abrindo |
| 2 | Solicitante (`solicitante@demo.hubkeep.test`) | No PWA: **Abrir chamado**, **Local** "UH 104", sem ativo, descrição "Pia pingando", **Abrir chamado**. Repetir com o celular em modo avião | "Chamado guardado no aparelho. Vai ser enviado quando houver rede." e, com rede, o chamado aparece no web como "Aberto" uma só vez |
| 3 | Gerente do Centro (`gerente.centro@demo.hubkeep.test`) | Web: abrir "Chuveiro sem água quente"; **Triar** com prioridade Urgente; **Ajustar prioridade** para Alta | Situação "Em triagem" e "Prioridade alterada" na linha do tempo |
| 4 | Gerente e Técnico do Centro (`tecnico.centro@demo.hubkeep.test`) | Gerente: **Gerar OS** para a Solicitante (tem de ser recusado) e depois para **Equipe Centro**; **Reatribuir** para o Técnico do Centro. Técnico, no PWA: abrir a OS na fila do dia, **Iniciar**, **Apontar horas** (início e fim reais), **Registrar material** ("2 m de cabo 2,5 mm"), **Tirar ou escolher foto**, **Concluir** | Recusa "A pessoa escolhida não é Técnico ativo neste hotel."; OS na fila do dia do técnico; depois da conclusão, chamado "Aguardando aceite" |
| 5 | Técnico do Centro | No "Frigobar não gela" (OS atribuída, ativo): **Iniciar** e **Equipamento parado**. No "Ar-condicionado desligando sozinho" (em execução): **Concluir** e responder **Não, continua parado** | A parada continua aberta e aparece em "Paradas a encerrar" para o Gerente |
| 6 | Gestor CSC, Solicitante e Gerente do Centro | Aquecedor da piscina (OS concluída, aberta pela Solicitante): primeiro o Gestor CSC tenta **Aceitar** (tem de ser recusado: o Centro tem Gerente); depois a Solicitante **Aceita**. No chamado do chuveiro, concluído no exercício 4 (quem abriu foi a Solicitante), o Gerente faz **Reabrir** com **Motivo da reabertura** (a opção "O equipamento está parado" só aparece em chamado com ativo; testá-la em outro chamado com ativo, se houver) | Aquecedor "Concluído" no aceite; chuveiro "Em execução" na reabertura, com o motivo na **Linha do tempo**; o Técnico vê "Reaberta no aceite: motivo" |
| 7 | Gerente do Centro | **Paradas a encerrar**: conferir a parada do exercício 5 e **Encerrar parada** | Parada some da lista; **Ver paradas** do ativo mostra o tempo |
| 8 | Técnico do Centro | Offline: com o PWA em modo avião, na OS do Frigobar (já em execução, do exercício 5): **Pausar**, **Retomar**, **Apontar horas** e **Tirar ou escolher foto**; fechar e reabrir o PWA; voltar a rede | "Sem conexão. O que você fizer fica guardado..." e contador "N operações aguardando envio."; ao voltar a rede, "Tudo enviado."; no web, tudo entrou uma única vez, sem horas nem fotos duplicadas. Para testar o offline de verdade, usar o PWA publicado (build com service worker) |
| 9 | Gerente e Técnico do Centro | No web, o Gerente abre **Ativos** e mostra o **Ver QR** do "Frigobar UH 101" (ou imprime pelo navegador). O técnico aponta a câmera do celular | O PWA abre o ativo; **Fotos** mostra as fotos (precisa de rede); **Alterar** troca o fabricante e a alteração aparece em **Ver histórico** |
| 10 | Gerente do Centro | **Cancelar chamado** (em um chamado aberto ou em triagem, como o do exercício 2) primeiro sem motivo e depois com motivo | Recusa pedindo o motivo; depois "Cancelado", com o motivo no detalhe e na linha do tempo |
| 11 | Gestor CSC (`gestor.csc@demo.hubkeep.test`) | Filtrar **Chamados** por **Hotel**, **Situação**, **Prioridade**, **De** e **Até**; tentar abrir o chamado do Praia | O Praia não aparece (escopo da Bandeira Azul); o link direto dá "não encontrado" |
| 12 | Admin (`admin@demo.hubkeep.test`) | **Hotéis**: **Ativar** o Serra (só uma vez por ambiente) e ver as UHs saírem de "pendente de licença"; **Membros e papéis**: **Convidar pessoa** (só com e-mail da equipe) | Mensagem "Hotel ativado. N UHs foram liberadas..." |
| 13 | Qualquer um | Provocar uma recusa e conferir que a mensagem vem traduzida, nunca como código | Texto no idioma escolhido |

Não incluir no treinamento, porque **[ainda não existe]**: checklist e plano preventivo (P1 a P3), importação de ativos e QR em lote (M2, M3), aprovação de ativo cadastrado pelo celular (M4), códigos de falha e "executado por" (I2, I4), SLA, notificações, indicadores, impressão da OS e CSV (fase 1c).

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
| "Não há espaço livre neste aparelho para guardar a foto." ou "Há fotos demais aguardando envio neste aparelho." | Liberar espaço ou conectar para enviar as fotos pendentes |
| Não consegue entrar, esqueceu a senha | Recuperação de senha **[ainda não existe]** (fase 1c). Anotar e escalar ao suporte |
| QR não abre o ativo | Sem rede e sem o ativo guardado: conectar e ler de novo. "Ativo não encontrado": conferir se o ativo é do hotel do técnico e se a etiqueta é a do ativo |

**Escalar ao suporte.** O app não mostra o identificador da requisição na tela e o Sentry está adiado até o piloto (`docs/04`), então anotar: hotel, nome e e-mail da pessoa, data e hora, tela e botão, texto exato da mensagem, idioma, se havia rede, aparelho e navegador. Com isso a equipe localiza o registro nos logs (que guardam `tenant_id`, `hotel_id`, `usuario_id` e `request_id`) e em **Ver histórico**. No navegador do web, o `x-request-id` aparece nos cabeçalhos da resposta (DevTools). Canal e responsável do suporte do piloto: [a definir].

**Regras do instrutor.** Não pedir senha. Não aceitar contas compartilhadas. Não treinar com dado real no Grupo Demonstração, nem o contrário. Se uma tela diferir do manual, anotar na planilha de observação e seguir.

## 7. Aceite do treinamento (checklist)

Por hotel, ao final dos dias de treinamento:

**Gestão (Gerente e CSC)**
- [ ] Entrou, trocou o idioma e saiu sem ajuda.
- [ ] Triou um chamado, gerou OS para técnico e para equipe e reatribuiu.
- [ ] Cancelou uma OS e um chamado com motivo.
- [ ] Aceitou e reabriu uma OS concluída (e, em chamado com ativo, usou "O equipamento está parado").
- [ ] Encerrou uma parada em **Paradas a encerrar**.
- [ ] Sabe usar os filtros e **Ver histórico**.

**Técnicos**
- [ ] PWA instalado, com sessão aberta e fila do dia lida.
- [ ] Executou uma OS do início ao fim (iniciar, horas, material, foto, concluir).
- [ ] Respondeu à pergunta do equipamento parado.
- [ ] Trabalhou offline e confirmou "Tudo enviado." ao voltar a rede.
- [ ] Leu um QR real e abriu o ativo.
- [ ] Abriu um chamado pelo PWA.

**Solicitantes**
- [ ] Abriu um chamado (com e sem rede) e acompanhou pelo web.
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
5. **Dados do próprio sistema** para conferir o uso: chamados abertos, OS concluídas, aceites e reaberturas por hotel (telas **Chamados** e **Ordens de serviço**, **Ver histórico**). Indicadores prontos (backlog, SLA, tempo de reparo) **[ainda não existe]** (fase 1c).
6. **Revisão semanal** com o Cesar: lista de ocorrências, itens de manual a corrigir e decisões. O que for de fase 2 vira pendência, não implementação (regra 10 do `CLAUDE.md`).
