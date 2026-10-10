# Paridade com o mock — fase 1b

> **Referência, não tarefa.** Segue a regra de especificações externas: entra como referência e passa por revisão antes de virar tarefa.
> **Fontes:** `csc-mock` de 07/10/2026 (`app.js` e `seed.js`) e o Documento do projeto de 07/10/2026.
> **Ordem:** a mesma da tabela da fase 1b no Documento do projeto.
> **Conflito:** onde o mock e o documento divergem, vale o documento. A divergência aparece em "Não copiar do mock".

Cada item traz as telas do mock em que aparece, o que elas mostram, as regras visíveis, quem vê e uma lista de paridade para conferir no PR. O PR de cada item deve mostrar a tela nova ao lado da tela do mock.

Papéis do mock, para a coluna "quem vê": `csc` (Gestor CSC do grupo), `band` (Gestor CSC da bandeira), `hotel` (gerente do hotel), `tec` (técnico), `prop` (proprietária, administrado) e `loc` (locador, arrendado).

---

## 1. Ativo — criticidade, compra e garantia

**Telas do mock:** Ativos (lista e ficha), Políticas de SLA (bloco "Outras regras") e HubKeep Intelligence.

**O que o mock mostra**

- Lista de ativos: coluna **Criticidade** e filtro **Toda criticidade**.
- Ficha do ativo: **Garantia** e **Compra e instalação**.
- Política: "Criticidade do ativo: escala fixa de 1 a 5, nomes configuráveis". Nomes padrão no mock:
  - 5, Crítico para a operação;
  - 4, Alto;
  - 3, Médio;
  - 2, Baixo;
  - 1, Mínimo.

**Regras visíveis**

- A implantação começa pelos ativos de criticidade 3 ou mais.
- A criticidade e a garantia vencida entram na atenção por ativo do Intelligence.

**Quem vê:** `csc`, `band`, `hotel` e `loc` (ativos sob o locador); `prop` não vê ativos.

**Paridade**

- [ ] Criticidade guardada como número de 1 a 5; o nome exibido vem da política e pode mudar sem migração.
- [ ] Coluna e filtro de criticidade na lista.
- [ ] Data de compra, data de instalação e fim da garantia na ficha, todas opcionais.
- [ ] Garantia vencida destacada na ficha.

---

## 2. Hotel e local — modelo contratual e edificação

**Telas do mock:** Hotéis e unidades, ficha do chamado (local) e painel do proprietário ou locador.

**O que o mock mostra**

- Cada hotel com o seu modelo: **Próprio**, **Administrado** ou **Arrendado**. O **Afiliado** aparece só na matriz explicativa.
- Selo **Piloto** com o perfil do hotel, por exemplo "Urbano próprio", "Administrado (condo-hotel)" ou "Arrendado".
- Edificação no local: "Torre A" ou "Torre B", nos hotéis com mais de uma torre.
- Bloco **Proprietários e locadores**: "No administrado, o proprietário vê só as próprias UHs. No arrendado, o locador vê o que o contrato põe sob a responsabilidade dele. Os dois só leem."

**Regras visíveis:** o modelo contratual define quem manda, quem aprova e quem paga.

**Quem vê:** `csc`, `band` e `hotel`.

**Paridade**

- [ ] Campo do modelo no hotel com os quatro valores do documento (próprio, administrado, arrendado, afiliado).
- [ ] Edificação opcional no local, exibida junto da UH ("UH 1203, Torre B") nas listas e na ficha do chamado.

**Não copiar do mock**

- A "Matriz de modelos de empreendimento" é conteúdo explicativo, não uma tela do produto.
- A aprovação do proprietário no administrado é da fase 2.

---

## 3. Chamado e OS — origem, impacto no hóspede, UH indisponível, executado por, custo

**Telas do mock:** Abrir chamado, ficha do chamado, aceite, ficha da OS e impressão da OS.

**O que o mock mostra**

- **Abrir chamado:** três marcações.
  - "O equipamento parou de funcionar";
  - "Afeta o hóspede";
  - "A UH precisa sair de venda".
  Também o campo **Quem está abrindo**.
- **Ficha do chamado:** **Impacto no hóspede**, **Origem** e **Executado por** (equipe interna ou fornecedor). Mostra também **Custo informado** e o local com o status vindo do PMS (Ocupada, Vaga limpa, Vaga suja, Bloqueada).
- **UH indisponível:** período com início e fim; fica aberto enquanto não termina.
- **Aceite:** **Executado por**, custo e códigos são registrados no momento do aceite.

**Regras visíveis**

- UH-dias perdidos é a soma dos períodos de UH indisponível; vira indicador na 1c.
- O evento do aceite registra quem executou e o custo ("custo informado de R$ X" ou "sem custo").

**Quem vê:** quem vê o chamado. O custo não aparece para `prop`.

**Paridade**

- [ ] As três marcações no abrir chamado, todas opcionais e com um toque cada.
- [ ] Origem gravada automaticamente: web, app do técnico, QR, preventiva e integração. Quem abriu continua sendo um campo separado.
- [ ] Período de UH indisponível com início e fim, aberto até o fim do serviço.
- [ ] Executado por (equipe interna ou fornecedor do cadastro mínimo) e custo informado registrados no aceite.

**Não copiar do mock**

- "Responsável pelo custo" (arrendatária ou locador) é do arrendado mínimo, na 1c.
- O status da UH depende do conector real (item 13). O aviso de "OS com impacto e UH não bloqueada" é pós-MVP.

---

## 4. Fornecedor — cadastro mínimo

**Telas do mock:** Fornecedores (lista e modal) e o aceite.

**O que o mock mostra**

- Texto da tela: "Cadastro mínimo, no lugar do nome em texto livre. Quem executou entra na OS e no aceite, e alimenta custos e indicadores. O portal do fornecedor fica para a fase 2."
- Lista: **Fornecedor**, **CNPJ**, **Contato**, **Categorias**, **Serviços em 90 dias** e **Custo informado**.
- Modal **Cadastrar fornecedor**:
  - **Nome**, com o exemplo "Razão social ou nome fantasia";
  - **CNPJ**, com a máscara 00.000.000/0000-00;
  - **Telefone** e **E-mail**;
  - **Categoria principal**.

**Quem vê:** `csc`, `band` e `hotel`.

**Paridade**

- [ ] Cadastro com nome, CNPJ, contato e categorias.
- [ ] Fornecedor selecionável em "Executado por" no aceite.

**Não copiar do mock**

- "Serviços em 90 dias" e "Custo informado" na lista são indicadores, da 1c.
- O fornecedor não tem acesso ao sistema; o portal é da fase 2.

---

## 5. Transições da OS

**Telas do mock:** ficha da OS.

**O que o mock mostra:** a seção **Transições**, com o texto "Cada mudança de estado, quando e por quem. Só é possível acrescentar; é a base do tempo médio de reparo e da Intelligence."

**Paridade**

- [ ] Lista cronológica com estado anterior, estado novo, data e hora e autor.
- [ ] Nenhuma edição nem exclusão; reabertura e nova conclusão aparecem como transições novas.

---

## 6. Códigos de manutenção

**Telas do mock:** aceite e Políticas de SLA.

**O que o mock mostra**

- No aceite, três listas por categoria: **falha**, **causa** e **solução**. Exemplo do elevador:
  - falha: "Parado entre andares", "Porta não fecha", "Nivelamento irregular", "Ruído anormal";
  - causa: "Desgaste de componente", "Falha elétrica", "Sujeira no trilho da porta", "Uso indevido";
  - solução: "Ajuste e regulagem", "Troca de componente", "Limpeza", "Reinício do quadro de comando".
- Política: "Exigir falha, causa e solução no aceite (padrão: desligado)".
- Com a política ligada, o aceite recusa sem os três: "A política exige falha, causa e solução para encerrar".

**Paridade**

- [ ] Catálogo de falha, causa e solução por categoria.
- [ ] Obrigatoriedade por política, desligada por padrão.
- [ ] Mensagem de recusa no aceite quando a política estiver ligada.

**Não copiar do mock:** no mock o catálogo é fixo nos dados de demonstração; no produto, quem cadastra é o Admin do grupo.

---

## 7. Módulos contratados

**Telas do mock:** menu (grupo **Módulo opcional**) e a tela do HubKeep Intelligence.

**O que o mock mostra:** o texto "Módulo opcional, contratado por este grupo." O módulo aparece para `csc`, `band` e `hotel`, e não aparece para `tec`, `prop` e `loc`.

**Paridade**

- [ ] Sem `licenca.modulo`, o menu e as rotas do Intelligence não aparecem, e a API não responde para o módulo.
- [ ] Com o módulo, ele continua escondido para técnico, proprietário e locador.

---

## 8. Fotos e assinatura

**Telas do mock:** ficha do chamado, aceite e impressão da OS.

**O que o mock mostra**

- **Aceite:** **Executado por** e a área de assinatura, com o texto "Assine com o dedo no celular ou com o mouse". Tem os botões **Limpar**, **Cancelar** e **Aceitar e encerrar**.
- Sem assinatura, o mock recusa: "Peça a assinatura de quem está aceitando o serviço".
- Na ficha, o aceite aparece com "assinado no celular". Na impressão, "Aceite: Assinado no celular" ou "Pendente".
- A regra de que quem executou não aceita aparece no aceite: "Você executou este serviço, então não pode aceitá-lo".
- **Fotos:** seção na ficha, com o texto "Nenhuma foto anexada" quando vazia.

**Paridade**

- [ ] Assinatura capturada no aceite, guardada como anexo do chamado e exibida na ficha e na impressão.
- [ ] Foto marcada como antes ou depois.

**Não copiar do mock**

- O mock **não** marca fotos como antes ou depois; o documento exige a marcação.
- O mock exige assinatura sempre. O documento não diz se é obrigatória, e há uma pendência com a Slaviero sobre aceite automático com foto. **Decidir se a obrigatoriedade é política.**

---

## 9. Checklist tipado

**Telas do mock:** ficha da OS, app do técnico e impressão da OS.

**O que o mock mostra:** cinco tipos de item.

| Tipo | Como aparece | Exemplo do mock |
| --- | --- | --- |
| Sim ou não | Marcação | "Testar freio de segurança" |
| Lista | Seleção com opções | "Condição dos cabos de tração": Bom, Desgaste leve, Substituir |
| Medição | Número com unidade e faixa; marcado quando fora | "Temperatura da água na saída", °C, de 55 a 65 |
| Data | Campo de data | — |
| Foto | Foto obrigatória; "anexada" quando feita | — |

**Regra visível:** "O checklist vem do plano preventivo; a OS só conclui com todos os itens marcados."

**Paridade**

- [ ] Os cinco tipos, com unidade e faixa na medição.
- [ ] Medição fora da faixa gravada como tal: o Intelligence do mock usa "medições fora da faixa" na atenção por ativo.
- [ ] OS preventiva só conclui com todos os itens.

---

## 10. Preventiva

**Telas do mock:** Preventiva (planos e calendário), ficha do ativo e app do técnico.

**O que o mock mostra**

- Tabela **Planos preventivos**: **Plano**, **Categoria**, **Periodicidade**, **Ativos cobertos**, **Próxima OS** e **Em dia (30 dias)**.
- Texto: "Definidos por categoria de ativo no grupo; cada hotel herda e pode ajustar a data."
- Calendário mensal com **Mês anterior**, **Hoje**, **Próximo mês** e filtro de hotel. Situações: **Concluída**, **Atrasada** e **Programada**.
- Texto: "As OS preventivas são geradas automaticamente a partir dos planos. Reprogramar exige justificativa, registrada na auditoria."
- Exemplos de plano:
  - "Manutenção mensal de elevadores", a cada 30 dias;
  - "Inspeção mensal do chiller", a cada 30 dias;
  - "Teste quinzenal do gerador", a cada 15 dias.
- App do técnico: "A fila junta chamados atribuídos e preventivas do dia, na ordem do prazo."

**Quem vê:** `csc`, `band` e `hotel`; `tec` vê as preventivas no app.

**Paridade**

- [ ] Planos por categoria no grupo, com ajuste de data por hotel.
- [ ] Geração automática e idempotente de OS no fuso do hotel.
- [ ] Calendário mensal com as três situações.
- [ ] Reprogramação só com justificativa, gravada na auditoria.
- [ ] Preventivas do dia na fila do técnico, junto dos chamados, ordenadas pelo prazo.

---

## 11. Pacote da bandeira

**Telas do mock:** Implantação de ativos (abertura de hotel).

**O que o mock mostra**

- Um cartão por hotel em abertura, por exemplo Hotel Palmas. Mostra cidade, UHs, bandeira, modelo, previsão de abertura e o selo "X de 6".
- Os seis passos de abertura:
  1. Ativar o hotel com licença (Admin do grupo);
  2. Aplicar o pacote da bandeira (modelos, checklists e planos copiados);
  3. Ler UHs e áreas do PMS (conector do sistema hoteleiro);
  4. Convidar usuários e papéis (Implantador, com validade);
  5. Carregar os ativos críticos (planilha ou celular);
  6. Imprimir e colar as etiquetas (QR em lote).
- Botão **Aplicar pacote \<bandeira\> \<versão\>**, desabilitado até a licença: "Ative o hotel com licença antes".
- Depois de aplicado: "Pacote 2026.3 aplicado: N modelos de ativo, N planos preventivos e N itens de checklist".
- Cada pacote tem versão (por exemplo 2026.3), modelos de ativo, planos e data de atualização.

**Regra visível:** é o critério do piloto "hotel novo implantado a partir do pacote da bandeira em até 1 dia".

**Paridade**

- [ ] Pacote versionado por bandeira, com modelos, checklists e planos.
- [ ] Aplicação ao hotel novo como cópia; mudança posterior no pacote não altera o hotel.
- [ ] Os seis passos com data de conclusão de cada um.
- [ ] Aplicação bloqueada antes da licença.

---

## 12. Implantação de ativos

**Telas do mock:** Implantação de ativos e app do técnico.

**O que o mock mostra**

- Indicadores: **Hotéis com inventário completo**, **Ativos cadastrados**, **Etiquetas QR impressas** e **Cadastros do celular** (aguardando revisão do CSC).
- **Inventário por hotel:** hotel com a onda e o perfil do piloto, **Progresso** em %, "cadastrados X de Y", **Etiquetados** e situação (Completo, Em andamento ou Não iniciado). Tem o botão **Imprimir N etiquetas**.
- **Importar planilha:** prévia com **Linha**, **Ativo** (com fabricante), **Local**, **Modelo aplicado** e **Situação** ("Pronto" ou o erro da linha). Texto: "A Central valida cada linha contra os locais do PMS e aplica o modelo de ativo, que já traz plano preventivo e checklist."
- **Cadastrados pelo celular:** "O técnico fotografa o equipamento e a placa", com o botão **Aprovar cadastro** na fila.
- **Modelos de ativo:** **Modelo**, **Plano aplicado** e **Itens**. Texto: "Um modelo traz plano preventivo e checklist prontos."

**Regra visível:** o previsto de cada hotel começa pelos ativos críticos.

**Quem vê:** `csc`, `band` e `hotel`; o cadastro pelo celular é do `tec` e do Implantador.

**Paridade**

- [ ] Importação com prévia linha a linha e relatório de erros, sem gravar nada antes da confirmação.
- [ ] Validação de cada linha contra os locais existentes.
- [ ] Fila de aprovação dos cadastros feitos pelo celular, com as fotos.
- [ ] Etiquetas QR em lote, por hotel, das que ainda não foram impressas.

---

## 13. Conector real

**Telas do mock:** Integração PMS e o selo "PMS lido" no painel.

**O que o mock mostra**

- Indicadores:
  - **Hotéis mapeados** ("Código PMS ligado ao hotel na Central");
  - **UHs mapeadas** ("Sem recadastro manual");
  - **Idade do status das UHs** ("Atraso máximo monitorado: 5 minutos");
  - **Fontes com dado desatualizado** ("A Central segue com o último dado e avisa na tela").
- **Views lidas:** **View**, **Conteúdo**, **Frequência**, **Última leitura**, **Linhas** e **Situação** (Em dia ou Atrasada).

| View no mock | Conteúdo | Frequência |
| --- | --- | --- |
| `vw_csc_hoteis` | Hotéis e códigos no PMS | Diária |
| `vw_csc_unidades` | UHs, tipo e andar | Diária |
| `vw_csc_status_uh` | Ocupada, vaga, bloqueada | A cada 5 min |
| `vw_csc_bloqueios` | Bloqueios de UH por manutenção | A cada 5 min |
| `vw_csc_proprietarios` | Proprietário por UH (condo-hotel) | Diária |

- **Ficha de conexão por hotel:** **Hotel**, **Código PMS**, **Agente**, **Último contato**, **Limite** e o aviso **Dado desatualizado**. Texto: "Agente instalado na rede do cliente, com saída só por HTTPS. Painel de saúde do conector."
- **Últimas execuções:** sucesso ou falha. Exemplo: "Falha: tempo de conexão esgotado (nova tentativa em 5 min)".

**Quem vê:** só `csc`.

**Paridade**

- [ ] Uma linha por view, com frequência, última leitura, linhas e situação.
- [ ] Ficha de conexão por hotel com último contato e limite de 5 minutos.
- [ ] Aviso na tela quando o dado passa do limite; a operação segue com o último dado.

**Não copiar do mock**

- O botão **Sincronizar agora** não tem lugar no plano: o agente envia por conta própria. Está pendente de decisão do Cesar.
- O plano fala em 7 views do TOTVS CM, e o mock mostra 5. As views reais dependem do cliente.
- Bloquear ou liberar UH no PMS continua desligado até a homologação.
