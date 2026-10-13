# Guia de implantação de um hotel (piloto)

Passo a passo para colocar UM hotel no ar, conferido com as telas e rotas que existem na `main` (atualizado em 12/10/2026 com as entregas da 1b até o #194 e em 13/10/2026 com as da 1b e da 1c até o #228). Repetir o guia para cada hotel do piloto. O que ainda não existe ou vai mudar na fase 1b está marcado com **[ainda não existe]** ou **[vai mudar na 1b]** (plano em `docs/12-plano-fase-1b.md`). Os rótulos entre aspas são os da interface (catálogo pt-BR).

## 1. Quem faz o quê

| Etapa | CSC (Admin do grupo, Gestor CSC, Implantador) | Hotel (Gerente e equipe) |
|---|---|---|
| Hotel chega e é trazido para implantação | Admin do grupo | nada |
| Bandeira, fuso, idioma padrão, modelo contratual | Admin do grupo | confirma os dados |
| Locais (UHs vêm do sistema; áreas comuns; edificação) | Admin, Gestor CSC ou Implantador cadastram | Gerente lista as áreas comuns e as torres ou blocos e confere as UHs |
| Pessoas, papéis e equipes | Admin ou Implantador convidam; equipes por Admin, Gestor CSC, Implantador ou Gerente | Gerente indica quem é quem (nome, e-mail, papel) |
| Categorias e campos, códigos de manutenção, modelos de checklist | Admin do grupo (uma vez para o grupo) | Gerente indica os checklists que o hotel já usa em papel |
| Fornecedores | Admin do grupo ou Gestor CSC (valem para o grupo inteiro) | Gerente informa os prestadores que atendem o hotel e pode cadastrá-los |
| Ativos | CSC e Implantador cadastram; no piloto, só os críticos | Gerente e técnicos informam os ativos, conferem e completam pelo celular |
| Etiquetas QR | CSC gera e imprime | Hotel cola e testa a leitura |
| Políticas | Admin do grupo | nada |
| Ativação do hotel | Admin do grupo (consome licença) | nada |
| Teste de ponta a ponta e treinamento | CSC conduz | Gerente, técnicos e solicitantes participam |

## 2. Pré-requisitos do grupo (uma vez, antes do primeiro hotel)

1. **Contrato de licença** com hotéis e UHs suficientes (gravado pela EasyGov pelo provisionamento, item 4; **sem tela**). Sem saldo, a ativação é recusada: "Não há licença de hotel disponível (X de Y em uso). A EasyGov foi avisada."
2. **Credencial do agente conector** criada pelo Admin do grupo (**sem tela**; rota `/api/v1/credenciais-agente`). O segredo aparece uma única vez.
3. **Hotéis e UHs no staging:** pelo agente conector, que lê as views do TOTVS CM (somente leitura) **[ainda não existe]** (T1, depende das views do cliente), ou, até lá, pelo adaptador de planilha (CSV do cliente, ver seção 3).
4. **Situações e prioridades padrão instaladas** (Aberto, Em triagem, ...; Urgente, Alta, Média, Baixa). **Sem tela:** rota `POST /api/v1/situacoes-e-prioridades/padrao`, só para o Admin do grupo. Quem instala no grupo do cliente é o **script de provisionamento de cliente** (#196), rodado pelo backoffice (decisão do Cesar, 08/10/2026): `pnpm ops:provisionar --ambiente staging --nome "<grupo>" --admin-email <e-mail> --admin-nome "<nome>" --max-hoteis 4 --max-uhs <N> --por "<quem roda>"`, primeiro com `--dry-run`. Ele cria o grupo, o contrato de licença e o primeiro Admin, que recebe o convite por e-mail, e instala os padrões: as 10 categorias, as situações e prioridades, os 37 códigos de manutenção e a prioridade padrão por categoria. Rodar de novo com `--tenant <id>` só completa o que faltou, sem duplicar nem reenviar o convite. É o mesmo primeiro passo do kit de teste. Hoje roda no dev; no staging, recusa até o staging existir (F0-12), e a produção entra com o roteiro de operação dela. Sem os padrões, o chamado não abre ("Não há situação ativa para este estado. Peça ao Admin do grupo para configurar.").
5. **Categorias de ativo:** já instaladas pelo provisionamento (item 4); na tela, o menu **Categorias de ativo** tem o botão **Instalar categorias padrão** (Refrigeração e ar-condicionado, Elétrica, Hidráulica, Elevadores, Cozinha, Lavanderia, Mobiliário, Eletrônicos, Piscina, Segurança e incêndio). As padrão vêm sem campos estendidos. Se o grupo precisa de categoria própria (por exemplo "Caldeiras" ou "Geradores"), usar **Criar categoria** e **Acrescentar campo**. O modelo de planilha usa as padrão; ajustar os nomes se o grupo criar outras.
6. **Bandeiras:** menu **Bandeiras**, **Nova bandeira**, **Criar** (se o grupo usa bandeiras).
7. **E-mail de produção** para o convite (provedor e domínio com SPF, DKIM e DMARC): **[ainda não existe]**, exigido antes do piloto (`docs/04`). Hoje o e-mail padrão do Supabase só entrega para a equipe do projeto.
8. **Segundo fator (TOTP)** para Admin do grupo, Gestor CSC e Implantador: **[ainda não existe]** (SP1, `docs/05`), obrigatório antes do piloto.
9. **Ambientes:** staging e produção **[ainda não existem]** (F0-12 suspensa, `docs/04`). Hoje só existe o ambiente de dev. O staging precisa estar pronto antes do treinamento (que acontece nele), e não só antes do piloto.
10. **Códigos de manutenção:** já instalados pelo provisionamento (item 4; na tela, **Códigos de manutenção**, **Instalar códigos padrão**, 37 códigos de falha, causa e solução); depois, **Criar código** ou **Editar nomes** para os códigos próprios do grupo. Só o Admin do grupo.
11. **Fornecedores:** menu **Fornecedores**, **Cadastrar** os prestadores que executam OS (nome, CNPJ e contato). Valem para o grupo inteiro. Sem fornecedor ativo, a triagem só oferece "Equipe interna" em **Quem executa**.
12. **Modelos de checklist:** menu **Checklists**, **Criar checklist** para cada serviço que o grupo quer padronizar (por exemplo, a corretiva do ar-condicionado), com os itens e a **Categoria sugerida**. Só o Admin do grupo. Mudar os itens depois cria uma versão nova, sem mudar as OS que já têm o checklist. O plano preventivo já aponta o checklist (etapa 8); a OS preventiva gerada pelo plano vem na PV3 **[vai mudar na 1b]**.

## 3. Etapas por hotel

### Etapa 1. Trazer o hotel para implantação

1. O hotel chega ao staging como entidade `hotel` (código e nome). Pelo adaptador de planilha, os arquivos CSV são: hotéis (`codigo;nome`) e UHs (`codigo;hotel;nome;andar`, andar opcional, "hotel" é o código do hotel). Aceita vírgula ou ponto e vírgula, com ou sem BOM. A edificação da UH não vem do sistema hoteleiro: é informada no HubKeep (etapa 3).
2. Admin do grupo: menu **Hotéis**. O hotel aparece com o selo "Não importado".
3. Escolher o fuso em **Escolha o fuso** e tocar em **Trazer para implantação**. Resposta: "Hotel trazido para implantação." O hotel passa a "em implantação" e **não** consome licença.
4. As UHs são promovidas pelo job a cada 15 minutos, como "pendente de licença" enquanto o hotel não for ativado.
5. Se aparecer "Difere do sistema hoteleiro: nome, fuso horário", conferir qual dado vale.

### Etapa 2. Bandeira e configuração

1. **Bandeiras**, seção "Bandeira de cada hotel": escolher a bandeira.
2. **Configuração e políticas**, painel **Hotel**: **País**, **Estado ou província**, **Moeda**, **Idioma padrão**, **Fuso horário** e **Modelo contratual** (Próprio, Administrado, Arrendado, Afiliado ou Não informado); **Salvar**. O que ficar vazio "Herda do grupo". Sem o modelo contratual, o painel de implantação aponta "O modelo contratual do hotel não foi informado (o Admin do grupo informa na configuração do hotel)."
3. Se o hotel tem equipe que usa espanhol ou francês no piloto, confirmar o idioma padrão e que as traduções estão revisadas (pendência no `docs/04`).

### Etapa 3. Locais

1. Menu **Locais**, escolher o hotel.
2. **UHs:** só leitura (vêm do sistema hoteleiro), menos a **Edificação (opcional)**, que o sistema hoteleiro não tem. Conferir se a lista bate com o hotel. UH pendente de licença não recebe chamado.
3. **Áreas comuns:** **Cadastrar área comum** (**Nome**, **Andar (opcional)**, **Edificação (opcional)**) para cada área com ativo ou chamado provável: Casa de máquinas, Lobby, Subsolo, Cobertura, Cozinha, Piscina, Hall dos elevadores etc. Os nomes têm de ser os mesmos da planilha de ativos.
4. **Salvar**, **Desativar** e **Reativar** corrigem o cadastro.
5. **Edificação:** em hotel com mais de uma torre ou bloco, informar a edificação nas UHs e nas áreas comuns, sempre escolhendo uma das sugestões para não repetir a mesma torre com outra grafia. Hotel de um prédio só pode deixar vazio.

### Etapa 4. Pessoas, papéis e equipes

1. Menu **Membros e papéis** (Admin do grupo ou Implantador).
2. **Convidar pessoa:** **Nome**, **E-mail**, **Papel**, **Hotel (vazio: grupo inteiro)**, **Validade**; **Enviar convite**. A pessoa aceita o convite e define a senha.
3. Papéis mínimos por hotel: **Gerente do hotel**, **Técnico** (um por turno, no mínimo) e **Solicitante** (recepção, governança, quem abre chamado). O **Implantador** é temporário, por hotel, com validade obrigatória.
4. Menu **Equipes**: **Nova equipe**, **Criar**, **Pôr na equipe**. Equipe serve para atribuir a OS a um grupo de técnicos (por exemplo, "Manutenção diurna").
5. Conferir no **Painel de implantação** o item "Pessoas no hotel": nenhum papel vencido ou revogado ("Há pessoas com papel vencido ou revogado no hotel.").
6. Só quem tem o papel **Técnico** no hotel aparece em "Pessoas" no **Responsável** da triagem. Quem executa OS precisa desse papel, mesmo que tenha outro.

### Etapa 5. Categorias

Já instaladas no pré-requisito. Para cada categoria usada no piloto, decidir se terá campos estendidos (potência, capacidade, tensão...) com **Acrescentar campo**: **Chave**, **Rótulo**, **Tipo** (Texto curto, Número, Data, Lista, Sim/não), **Unidade (número)**, **Opções (lista)**, **Obrigatório**. Mudar o tipo de um campo existente não é permitido.

### Etapa 6. Ativos

Hoje o cadastro é **um a um**.

**No web:** menu **Ativos**, escolher o hotel, painel **Cadastrar ativo**: **Local**, **Nome do ativo**, **Categoria**, **Fabricante**, **Modelo**, **Número de série**, **Data da compra**, **Garantia até**, **Criticidade** (1 a 5 ou "Sem criticidade") e os campos da categoria; **Cadastrar**. Na lista, **Salvar**, **Desativar**, **Reativar**, **Mover** (só dentro do hotel), **Anexar arquivo** (imagem ou PDF). A criticidade 4 e 5 aparece com selo de destaque. A garantia não pode terminar antes da compra.

**No celular (PWA):** **Ativos** na fila do dia, **Cadastrar ativo**, funciona sem rede. Compra, garantia e criticidade ficam na parte recolhida "Compra, garantia e criticidade".

**Importação em lote por planilha [ainda não existe]** (tarefa M2 do `docs/12`). O que já existe hoje é só o modelo da planilha, em `modelo-ativos-criticos.csv`. Quando a importação existir, o uso previsto é:
1. Baixar o modelo na tela (cabeçalho oficial) ou usar este arquivo como base.
2. Preencher uma linha por ativo, **uma planilha por hotel**, só com os ativos críticos no piloto.
3. Enviar. O sistema mostra uma **prévia linha a linha**, com o erro de cada linha por código, e só então grava (com auditoria).
4. Linha inválida não grava nada daquela linha, as outras seguem. Reenviar a mesma planilha não duplica ativo. Local de outro hotel é recusado. Há limite de linhas por envio.
5. Quem envia: o Implantador ou quem gere o hotel.
Hoje, o CSC pode usar o arquivo como roteiro para cadastrar um a um, ou o Implantador pode cadastrar em sequência.

**Colunas do modelo** (planilha CSV, UTF-8 com BOM, separador ponto e vírgula, primeira linha de cabeçalho, uma linha por ativo):

| Coluna | Obrigatória | Formato | Exemplo | Situação |
|---|---|---|---|---|
| `local` | sim | Nome do local como está em "Locais" (UH ou área comum), no mesmo hotel | `Casa de máquinas` | Já existe como dado; a leitura da planilha é **[ainda não existe]** (M2). Se a importação cria local que falta é pergunta aberta |
| `categoria` | recomendada | Nome da categoria como em "Categorias de ativo". Vazio vira "Sem categoria", e o painel de implantação aponta "Há ativos sem categoria." | `Elétrica` | Campo existe hoje; leitura **[ainda não existe]** (M2) |
| `nome` | sim | Texto, até 120 caracteres | `Gerador diesel 500 kVA` | Existe hoje |
| `fabricante` | não | Texto, até 120 caracteres | `Geradora Exemplo` | Existe hoje |
| `modelo` | não | Texto, até 120 caracteres | `GE-500D` | Existe hoje |
| `numero_serie` | não | Texto, até 120 caracteres | `EX-GE-0001` | Existe hoje |
| `data_compra` | não | Data `aaaa-mm-dd` que exista no calendário | `2019-02-12` | Campo existe hoje (I1, #133); leitura **[ainda não existe]** (M2) |
| `garantia_ate` | não | Data `aaaa-mm-dd`; não pode ser anterior a `data_compra` | `2022-02-12` | Campo existe hoje (I1); leitura **[ainda não existe]** (M2) |
| `criticidade` | recomendada para ativo crítico | Inteiro de 1 a 5. Nomes padrão: 1 Muito baixa, 2 Baixa, 3 Média, 4 Alta, 5 Crítica; o grupo pode renomear os níveis | `5` | Campo e nomes existem hoje (I1); leitura **[ainda não existe]** (M2) |
| `codigo_qr` | não | 10 caracteres do alfabeto `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (sem I, L, O, U). Vazio: o sistema gera | (vazio) | Formato existe hoje; uso na planilha **[a confirmar na M2]** ("QR opcional", `docs/12`) |
| campos estendidos da categoria | conforme a categoria | Um por campo definido em "Categorias de ativo" (texto, número, data, lista, sim/não) | | **[a definir na M2]**: o formato das colunas depende da importação; não estão no modelo |
| chave de importação por linha | n/a | Para reenviar a planilha sem duplicar | | **[a definir na M2]** (talvez migração própria) |
| edificação do local | n/a | Hotel com mais de uma torre pode ter o mesmo nome de local em duas edificações | | **[a definir na M2]**: como a planilha distingue o local repetido |

Exemplo de lote: 12 ativos fictícios em `modelo-ativos-criticos.csv`, cobrindo climatização (3), caldeiras (2), elevadores (2), geradores (2), bombas (2) e SPDA (1). Os nomes de local e de categoria do arquivo são sugestões: ajustar aos do hotel. Caldeiras estão em "Hidráulica" e SPDA em "Segurança e incêndio" porque não há categoria padrão específica.

**Critérios de qualidade do ativo crítico (piloto):** nome claro e único dentro do local, categoria preenchida, fabricante, modelo e série quando legíveis, local correto, criticidade informada.

### Etapa 7. Etiquetas QR

1. Web, **Ativos**, no ativo: **Ver QR** (e **Ocultar QR**). Mostra a imagem e o "Código XXXXXXXXXX". O QR é gerado no navegador com o endereço do PWA e o caminho `/q/<código>`. Se o endereço do PWA não estiver configurado: "O endereço do app do técnico não está configurado; o QR não pode ser gerado."
2. Imprimir pela impressão do navegador. **Etiqueta de impressão e QR em lote: [ainda não existe]** (M3). O código não revela o id do ativo.
3. Colar a etiqueta no equipamento. **Testar:** apontar a câmera do celular de um técnico; o PWA abre o ativo. Sem rede e sem o ativo guardado no aparelho, aparece "Este ativo não está guardado no aparelho. Abra o QR de novo quando houver conexão."
4. Gerar códigos antes de cadastrar e ligar a etiqueta pelo celular: **[ainda não existe]** (M3).

### Etapa 8. Políticas

Em **Configuração e políticas**, painel **Políticas**:
- **Aceite automático da OS concluída:** tem **Ligado** e **Dias depois da conclusão**, mas o job que aceita sozinho **[ainda não existe]** (fase 1c). Deixar desligado no piloto.
- **Prioridade padrão por categoria de ativo:** a tela mostra só "N categorias mapeadas." A edição pela tela **[ainda não existe]**; a gravação é pela rota `PUT /api/v1/politicas` (Admin do grupo) ou pelo script de operação. No kit, elevadores e segurança ficam em Urgente; refrigeração, elétrica, hidráulica e cozinha em Alta; lavanderia, eletrônicos e piscina em Média; mobiliário em Baixa. É a sugestão de partida (`docs/10`).
- **Nível da política:** cada política do núcleo pode ser gravada no grupo, na bandeira do hotel ou no próprio hotel (vale a do hotel, senão a da bandeira, senão a do grupo). Gravar na bandeira quando todos os hotéis dela seguem a mesma regra.
- **SLA:** o prazo de atendimento e o de solução já são calculados na abertura e na triagem, no calendário do hotel (com os feriados nacionais e estaduais e os do hotel), e o motivo da pausa pode parar o relógio. A política de SLA (prazos por prioridade, horário, motivos que param o relógio) (`chamado.sla`) não tem tela: sem gravação pela rota `PUT /api/v1/politicas` (Admin do grupo), vale o padrão do sistema. Se o piloto usa o padrão: **[a definir]** na reunião com a Slaviero (pergunta 34 de `docs/referencia/perguntas-cliente.md`). O monitor já registra o prazo em risco (padrão: 80% do tempo gasto) e o vencido; a política de escalonamento (`chamado.escalonamento`) também não tem tela. Selo na ficha, painel dos avisos, notificações e indicadores: **[ainda não existe]** (fase 1c). Confirmar o fuso do hotel (etapa 2), porque o prazo depende dele.
- **Feriados do hotel:** em **Configuração → Feriados do hotel**, cadastrar os feriados municipais e os do próprio hotel (**Repete todo ano** para os fixos), antes de ativar, porque o feriado só conta nos prazos calculados depois dele. Os nacionais e estaduais já entram sozinhos.
- **Nomes dos níveis de criticidade do ativo:** existe (I1). Conferir se o grupo mantém os nomes padrão.
- **Códigos obrigatórios no aceite** ("Exigir falha, causa e solução no aceite"): existe (I6), desligado por padrão. Ligar ou não no piloto: **[a definir]** com o Cesar; ligado, o aceite sem os três códigos é recusado.
- **Foto de depois na conclusão** e **Assinatura no aceite:** existem (I8), desligadas por padrão. Ligar ou não no piloto: **[a definir]** na reunião com a Slaviero (perguntas 31 e 32 de `docs/referencia/perguntas-cliente.md`). Ligadas, a conclusão sem foto de depois e o aceite sem assinatura são recusados.
- **Checklist completo na conclusão:** existe (PV1), desligado por padrão; desligado, o PWA só avisa os itens obrigatórios que faltam. Ligar ou não no piloto: **[a definir]** na reunião com a Slaviero (pergunta 33 de `docs/referencia/perguntas-cliente.md`).
- **Planos preventivos:** em **Preventivas**, cadastrar os planos do hotel (por ativo ou por categoria, com a periodicidade, a primeira data, o checklist e o responsável) e ativar. Quais planos o piloto começa: **[a definir]** na reunião com a Slaviero (pergunta 30 de `docs/referencia/perguntas-cliente.md`). O plano ainda não gera OS **[vai mudar na 1b]** (PV3). Modelos por categoria: **[ainda não existe]** (M1).

### Etapa 9. Ativar o hotel

1. Rodar o **Painel de implantação** (menu **Painel de implantação**, escolher o hotel). Resolver o que estiver em "O que falta".
2. Admin do grupo: menu **Hotéis**, **Ativar**. Resposta: "Hotel ativado. N UHs foram liberadas e M ficaram pendentes de licença."
3. As UHs "pendente de licença" não recebem chamado até haver saldo.
4. Ativar o hotel só depois de convidar e testar as pessoas, para a licença do piloto não ser consumida antes da hora (proposta).

### Etapa 10. Teste de ponta a ponta

Feito com o Gerente e um técnico do hotel, antes do treinamento (usar um ativo real e marcar o chamado como teste):
1. Solicitante abre um chamado no PWA com local e ativo, respondendo **Afeta hóspede?**. Num segundo chamado, numa UH, marcar **A UH ficou indisponível**.
2. Gerente (ou Gestor CSC) tria e gera a OS para o técnico; num dos chamados, **Quem executa** com um fornecedor.
3. A OS aparece na fila do dia do técnico; ele tira uma foto **Antes do serviço**, inicia, responde o checklist (se o gerente aplicou um), pausa com um motivo e retoma, aponta uma hora, registra material, tira uma foto **Depois do serviço**, escolhe falha, causa e solução e conclui. Na OS da UH, responde **Sim, UH liberada**.
4. Quem abriu aceita, informando o custo e assinando (ou o Gerente reabre com motivo).
5. Conferir na ficha do chamado "Atender até ..." e "Resolver até ...", a **Linha do tempo** e **Ver histórico** e as linhas do teste em **Auditoria**.
6. Repetir o passo 3 com o celular em modo avião e conferir o envio depois.

## 4. Critérios de "hotel pronto"

Marcar todos antes de declarar o hotel pronto para o treinamento:

**Cadastro**
- [ ] Hotel "ativo", com bandeira, fuso, idioma padrão e modelo contratual conferidos.
- [ ] Edificação informada nas UHs e áreas comuns, se o hotel tem mais de uma torre ou bloco.
- [ ] UHs conferidas (nenhuma "pendente de licença" que deva receber chamado).
- [ ] Áreas comuns cadastradas com os nomes combinados.
- [ ] Painel de implantação sem pendências de bloqueio: sem "O modelo contratual do hotel não foi informado...", sem "O hotel ainda não tem gerente.", sem "O hotel ainda não tem técnico.", sem "Há pessoas com papel vencido ou revogado no hotel." e sem "Há ativos sem categoria."
- [ ] "Há locais sem ativo cadastrado." pode permanecer no piloto, porque só os ativos críticos entram (proposta; decidir com o Cesar).

**Pessoas**
- [ ] Pelo menos um Gerente, um Técnico por turno e os Solicitantes combinados, todos com convite aceito e senha definida.
- [ ] Cada técnico entrou no PWA com rede uma vez, na instalação, e vê a fila do dia.
- [ ] Equipes criadas e com os técnicos.

**Ativos**
- [ ] Ativos críticos cadastrados (lista combinada com o hotel), com categoria, local, fabricante, modelo e série quando disponíveis.
- [ ] Etiqueta QR colada em cada ativo crítico e lida com sucesso pela câmera de pelo menos um celular.
- [ ] Criticidade, data de compra e garantia preenchidas nos ativos críticos, quando conhecidas.

**Operação**
- [ ] Teste de ponta a ponta (etapa 10) concluído, inclusive com um técnico offline.
- [ ] Situações, prioridades e prioridade padrão por categoria conferidas.
- [ ] Aceite automático desligado.
- [ ] Códigos de manutenção instalados; decisão tomada sobre "Códigos obrigatórios no aceite".
- [ ] Decisão tomada sobre "Foto de depois na conclusão", "Assinatura no aceite" e "Checklist completo na conclusão", e os modelos de checklist combinados criados.
- [ ] Fornecedores que atendem o hotel cadastrados.
- [ ] Feriados municipais e do hotel cadastrados em **Feriados do hotel**.
- [ ] Planos preventivos combinados cadastrados e ativos (ainda sem gerar OS até a PV3).
- [ ] Gerente sabe onde ver "Paradas a encerrar", como marcar e liberar a UH indisponível e como aplicar um checklist, como aceitar (com custo, códigos e assinatura) ou reabrir, e onde consultar a **Auditoria**.
- [ ] Canal de suporte combinado com o hotel (ver `roteiro-treinamento.md`).
