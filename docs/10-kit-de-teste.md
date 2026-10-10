# 10 — Kit de teste no notebook

Kit para testar a fase 1a no notebook, com o web e o PWA rodando localmente e ligados ao projeto de dev (`HubKeep-dev`). Decisão do Cesar de 28/09/2026 (`docs/05`, "Kit de teste"). A etapa D só começa com o aval dele.

O que precisa estar instalado: Git, Node 22.12 ou mais novo e pnpm 11 (`corepack enable` instala a versão do `package.json`). Não precisa de Docker nem de psql.

## 1. Variáveis

Os valores de verdade ficam **só no notebook**, em arquivos `.env.local` (o `.gitignore` já cobre `.env.*`) ou na sessão do PowerShell. Nada disso vai para o git, para a Vercel nem para chat ou e-mail. O modelo sem valores é o `.env.example`.

### Web: `apps/web/.env.local`

| Variável | Valor no dev | Onde achar |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Painel do Supabase → Project Settings → API (*Project URL*) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave pública | Painel → Project Settings → API Keys (*publishable*) |
| `SUPABASE_SECRET_KEY` | chave secreta | Painel → Project Settings → API Keys (*secret*); gerenciador de senhas. **Nunca no git, nunca no PWA** |
| `DATABASE_URL_APP` | `postgresql://hk_app.<ref>:<senha>@<host-pooler>:6543/postgres` | Host do botão *Connect* → Transaction pooler; senha de `hk_app` do cofre (`HK_APP_SENHA_DEV`) |
| `DATABASE_URL_WORKER` | igual, com `hk_worker.<ref>` | Senha de `hk_worker` do cofre (`HK_WORKER_SENHA_DEV`) |
| `DATABASE_URL_INGESTAO` | igual, com `hk_ingestao.<ref>` | Senha de `hk_ingestao` do cofre (`HK_INGESTAO_SENHA_DEV`); o script de demonstração usa, porque os hotéis chegam pelo caminho do conector |
| `HK_URL_SITE` | `http://localhost:3000` | Fixo |
| `NEXT_PUBLIC_URL_DO_TECNICO` | `http://localhost:5173` | Fixo; é o endereço impresso no QR do ativo |
| `HK_PSEUDO_IDIOMA` | `1` (opcional) | Libera o pseudo-idioma no seletor, para ver texto fora do catálogo |

As strings de conexão vão **sem** `sslmode` e sem `ssl`: o TLS com o certificado conferido é do HubKeep (`docs/06`, "TLS com o banco"). `CRON_SECRET`, `SENTRY_*` e as de e-mail e push ficam vazias no notebook.

### PWA: `apps/tecnico/.env.local`

| Variável | Valor no dev | Onde achar |
|---|---|---|
| `VITE_SUPABASE_URL` | o mesmo `NEXT_PUBLIC_SUPABASE_URL` | Painel → Project Settings → API |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | a mesma chave pública | Painel → API Keys (*publishable*) |
| `VITE_PSEUDO_IDIOMA` | `1` (opcional) | Pseudo-idioma no seletor do PWA |

`VITE_API_URL` e `HK_API_DEV` ficam vazias: no dev, o Vite manda `/api` para o web em `localhost:3000`.

### Só para o script de demonstração (sessão do PowerShell)

| Variável | Valor | Onde achar |
|---|---|---|
| `DEV_SESSION_POOLER` | string *Session pooler* do HubKeep-dev (contém a senha do `postgres`) | Botão *Connect* → Session pooler; a mesma do `pnpm db:testar-dev` |
| `HK_DEMO_SENHA` | senha de teste, com 12 caracteres ou mais | Você escolhe e guarda no gerenciador de senhas. Vale para todas as contas de demonstração |

A `DEV_SESSION_POOLER` não vai no `.env.local` do web: é a senha do dono do banco, e o web nunca a usa.

## 2. Comandos (PowerShell, na raiz do repositório)

```powershell
cd C:\Cesar\HubKeep\Dev\hubkeep
git switch main
git pull
pnpm install
```

Dados de demonstração (uma vez; pode rodar de novo sem duplicar):

```powershell
$env:DEV_SESSION_POOLER = '<string Session pooler do HubKeep-dev>'
$env:HK_DEMO_SENHA = '<senha de teste>'
pnpm demo:dados --ambiente dev
```

O script lê o `apps/web/.env.local`, confere que **todas** as conexões são do HubKeep-dev (o ref de `[remotes.dev]` no `supabase/config.toml`) e recusa qualquer outro ambiente. No fim, lista as contas criadas. A senha não aparece na tela.

Web e PWA, cada um num terminal:

```powershell
pnpm --filter @hubkeep/web dev
```

```powershell
pnpm --filter @hubkeep/tecnico dev
```

Ou os dois num terminal só, com a saída de cada um prefixada pelo nome do app:

```powershell
pnpm dev
```

- Web: `http://localhost:3000` (login em `/login`).
- PWA: `http://localhost:5173`.

Para testar o PWA **sem rede**, use o build, porque o service worker só existe nele (o modo dev não guarda a aplicação para abrir offline):

```powershell
pnpm --filter @hubkeep/tecnico build
pnpm --filter @hubkeep/tecnico preview
```

O PWA fica em `http://localhost:4173`, com o `/api` indo para o web em `localhost:3000`. Para cortar a rede: DevTools (F12) → Network → *Offline*, ou o modo avião do Windows.

## 3. O que o script cria

Um grupo fictício, **Grupo Demonstração**, no dev. Tudo passa pelos casos de uso da aplicação, com auditoria e outbox, como as telas fazem. A exceção é o que é trabalho do backoffice e não tem caso de uso: o tenant, o contrato de licença (3 hotéis e 40 UHs) e o primeiro Admin, gravados pelo dono do banco.

- **Hotéis**, chegados pelo caminho do conector (lote no staging, com uma credencial de agente revogada no fim):
  - **Hotel Demonstração Centro** (Bandeira Azul, ativo): UHs 101 a 104, 201 e 202; áreas comuns Piscina, Cozinha e Casa de máquinas.
  - **Hotel Demonstração Praia** (Bandeira Verde, ativo): UHs 101 a 104; áreas Lobby e Restaurante.
  - **Hotel Demonstração Serra** (Bandeira Azul, **em implantação**): UHs 101 a 103, pendentes de licença até o Admin ativar o hotel.
  - modelo contratual (I2): o Centro é próprio e o Praia, arrendado. O Serra fica sem modelo, e o painel de implantação mostra a pendência "modelo contratual não informado"; o Admin informa na configuração do hotel.
  - edificação (I2): no Centro, as UHs 101 a 104 ficam na Torre A, as 201 e 202 na Torre B, e a Piscina na "Área externa". A busca de locais acha por "torre b". O script só grava no hotel sem modelo e no local sem edificação: o que foi mudado pela tela fica.
- **Categorias, situações e prioridades** padrão.
- **Códigos de falha, causa e solução** padrão (I6): as falhas gerais, uma ou duas por categoria padrão, e as causas e soluções gerais. A política `os.codigos_obrigatorios` fica **desligada**; o roteiro liga no Centro para testar a cobrança no aceite.
- **Prioridade padrão por categoria**, como política do grupo: elevadores e segurança, Urgente; refrigeração, elétrica, hidráulica e cozinha, Alta; lavanderia, eletrônicos e piscina, Média; mobiliário, Baixa. Os chamados abrem com a prioridade da categoria do ativo; o do chuveiro, sem ativo, fica em Alta, ajustada pelo Gerente. Num grupo criado antes disto, rodar o script de novo ajusta os chamados ainda em curso; os concluídos e o cancelado guardam a prioridade da abertura.
- **Ativos**:
  - no Centro: Frigobar UH 101, Ar-condicionado UH 102, TV UH 103, Aquecedor da piscina e Forno combinado;
  - no Praia: Ar-condicionado UH 101 e Máquina de gelo.
  - com criticidade (I1): Forno combinado 5, Ar-condicionado UH 102 4, Aquecedor da piscina e Máquina de gelo 3, Frigobar 2; o Forno, o Ar-condicionado UH 102 e o Aquecedor também têm data da compra e fim da garantia (a do Aquecedor já venceu). Num grupo criado antes da I1, os ativos ficam sem esses campos, que se preenchem pela tela.
- **Equipe Centro**, com o Técnico do Centro.
- **Fornecedores do grupo** (I3), todos fictícios, com CNPJ de dígitos verificadores calculados para bases inventadas: Frio Total Refrigeração (cadastrado pelo Admin, CNPJ 98.765.432/0001-98, com contato), Sobe e Desce Elevadores (pelo Gestor CSC, CNPJ 13.579.246/0001-01) e Serralheria do Bairro (pela Gerente do Centro, sem CNPJ, só com telefone). O script só cadastra o nome que ainda não existe.

### Contas (todas com a senha de `HK_DEMO_SENHA`)

| Papel | E-mail | Escopo |
|---|---|---|
| Admin do grupo | `admin@demo.hubkeep.test` | Grupo inteiro |
| Gestor CSC | `gestor.csc@demo.hubkeep.test` | Bandeira Azul (Centro e Serra) |
| Implantador | `implantador@demo.hubkeep.test` | Hotel Serra, por 90 dias |
| Gerente | `gerente.centro@demo.hubkeep.test` | Hotel Centro |
| Gerente | `gerente.praia@demo.hubkeep.test` | Hotel Praia |
| Técnico | `tecnico.centro@demo.hubkeep.test` | Hotel Centro (e Equipe Centro) |
| Técnico | `tecnico.praia@demo.hubkeep.test` | Hotel Praia |
| Solicitante | `solicitante@demo.hubkeep.test` | Hotel Centro |
| Proprietário de UH | `proprietario.uh@demo.hubkeep.test` | UH 101 do Centro |
| Proprietário de hotel inteiro | `proprietario.hotel@demo.hubkeep.test` | Hotel Praia |

Os e-mails são do domínio `.test`, que não existe: nenhum e-mail sai, e as contas já nascem confirmadas. A identidade de demonstração recusa qualquer e-mail fora do `.test`, para a senha de teste nunca cair numa conta de verdade.

### Chamados

| Chamado | Onde | Estado | Para testar |
|---|---|---|---|
| Chuveiro sem água quente | Centro, UH 104 | Aberto (pela Solicitante) | Triagem pelo web (passo a passo na seção 4) |
| Frigobar não gela | Centro, UH 101, com ativo | OS atribuída ao Técnico, não iniciada | Fila do dia no PWA; o proprietário da UH vê |
| Ar-condicionado desligando sozinho | Centro, UH 102, com ativo | OS em execução, equipamento parado desde 2 h antes | Conclusão com "o equipamento voltou?"; paradas |
| Aquecedor da piscina com ruído | Centro, Piscina, com ativo | OS concluída, aguardando aceite (aberto pela Solicitante); o Técnico sugeriu a falha "Ruído ou vibração anormal" e a causa "Desgaste natural", sem solução | Aceite e reabertura com motivo; os códigos no aceite (I6) |
| TV sem sinal | Centro, UH 103 | Cancelado, com o motivo | Motivo no detalhe e na linha do tempo |
| Forno não chega à temperatura | Centro, Cozinha | Concluído (OS da Equipe Centro, aceita pelo Gerente com falha "Não aquece", causa "Desgaste natural" e solução "Troca de peça") | Linha do tempo completa; os códigos no detalhe da OS |
| Ar-condicionado pingando no carpete | Praia, UH 101, com ativo | Aberto (pelo Gerente do Praia) | Escopo do proprietário do hotel inteiro; triagem pelo Gerente do Praia |

## 4. Roteiro por papel

Em cada papel: entrar, conferir o que aparece e tentar o que deveria ser barrado. **A recusa tem de vir traduzida**, nunca como código cru ou frase em inglês. Troque o idioma no seletor (pt-BR, en, es, fr e, com a variável ligada, o pseudo-idioma) em pelo menos um papel.

### Admin do grupo (web)

- **Deve conseguir:**
  - ver os três hotéis na tela inicial;
  - em "Administração de hotéis", ver os três importados e **ativar o Serra**: as 3 UHs saem de pendentes;
  - bandeiras, configuração e políticas, membros e papéis (convidar alguém de verdade só com um e-mail da equipe, porque o e-mail padrão do Supabase só entrega para ela), proprietários e vínculos, equipes, locais, categorias e ativos (incluindo o QR);
  - "Chamados": os 7, com os filtros de hotel, situação, prioridade e período; "Ordens de serviço": as 4;
  - em "Códigos de manutenção" (I6): ver as três listas (falhas, causas e soluções), criar um código do grupo para uma categoria (ex.: falha "Vedação da porta solta", em Refrigeração), renomear em outro idioma, desativar e reativar; o tipo e a categoria não mudam depois de criado;
  - em "Configuração", na política "Códigos obrigatórios no aceite", ligar **só no Hotel Centro** (gravar no hotel) para o passo do Gerente abaixo, e desligar no fim (voltar a herdar);
  - no detalhe, a linha do tempo com quem fez, quando e o motivo;
  - o **histórico** de cada registro (passo a passo abaixo).
- **Deve ser barrado:** nada dentro do grupo. Para testar outro tenant, é preciso um segundo grupo (não faz parte do kit).

### Gestor CSC, Bandeira Azul (web)

- **Deve conseguir:** ver o Centro e o Serra, e os 6 chamados do Centro com as OS e a linha do tempo; a triagem dos chamados do Centro (passo a passo abaixo).
- **Deve ser barrado:**
  - o Praia e o chamado dele não aparecem, e abrir o link do detalhe dele dá "não encontrado";
  - aceitar a OS do aquecedor: o Centro tem Gerente, então quem decide é ele (regra do Gerente único);
  - ativar hotel e conceder papel.

### Implantador, Serra (web)

- **Deve conseguir:** o painel de implantação do Serra; locais e ativos do Serra.
- **Deve ser barrado:** o Centro e o Praia não aparecem; nenhum chamado na lista; ativar o hotel (só o Admin).

### Gerente do Centro (web)

- **Deve conseguir:**
  - os 6 chamados do Centro;
  - a **triagem** do chuveiro, do começo ao fim (passo a passo abaixo);
  - **aceitar** a OS do aquecedor, ou **reabrir** com motivo (e, por ter ativo, marcar "o equipamento está parado" com data e hora);
  - no aceite do aquecedor (I6), ver a falha e a causa sugeridas pelo Técnico já escolhidas e a solução em branco; as listas trazem primeiro os códigos da categoria do ativo (Piscina) e depois os gerais, sem os de outras categorias;
  - no detalhe do forno, ver a falha, a causa e a solução da OS aceita;
  - equipes do Centro;
  - a tela de paradas abertas com OS concluída;
  - em "Fornecedores", ver os três do grupo, cadastrar um novo e alterar o contato de um deles; o histórico do fornecedor mostra quem cadastrou e o que mudou, inclusive o contato.
- **Deve ser barrado:**
  - o Praia não aparece;
  - com a política "Códigos obrigatórios no aceite" ligada no Centro pelo Admin, aceitar o aquecedor sem escolher a solução volta "Neste hotel, o aceite exige falha, causa e solução. Falta 1 código."; escolhida a solução, o aceite passa. Com a política desligada, o aceite passa sem código nenhum;
  - em "Códigos de manutenção", criar ou desativar um código volta "Só o Admin do grupo gere os códigos de manutenção.";
  - em "Fornecedores", o CNPJ com dígito errado (ex.: 98.765.432/0001-99) volta "CNPJ inválido", e o CNPJ de outro fornecedor do grupo (ex.: 13.579.246/0001-01) volta "Já existe um fornecedor com este CNPJ no grupo".

### Gerente do Praia (web)

- **Deve conseguir:** só o chamado do ar-condicionado do Praia; triar e gerar a OS dele para o Técnico do Praia, que passa a vê-la na fila do dia do PWA.
- **Deve ser barrado:** nada do Centro nem do Serra.

### Técnico do Centro (PWA e web)

- **No PWA deve conseguir:**
  - fila do dia com o Frigobar (atribuída) e o Ar-condicionado UH 102 (em execução);
  - no Frigobar: iniciar, pausar, retomar, apontar horas, registrar material, tirar foto e concluir;
  - antes de concluir o Frigobar (I6), no painel "Falha, causa e solução (opcional)", ver primeiro as falhas de Refrigeração e depois as gerais; escolher uma falha e deixar o resto em branco, ou deixar tudo em branco: a conclusão passa nos dois casos, inclusive sem rede e com a política ligada no hotel;
  - no Ar-condicionado: concluir e responder "o equipamento voltou a funcionar?". Com "não", a parada continua aberta e aparece para o Gerente na tela de paradas;
  - abrir chamado;
  - ativos, pelo QR impresso no web ou pelo endereço `/q/<código>`.
- **No PWA sem rede** (build, seção 2): fazer as ações acima offline, fechar e reabrir o PWA sem rede, voltar a rede e conferir no web que tudo entrou uma vez só, sem horas nem fotos duplicadas.
- **Deve ser barrado:**
  - aceitar a própria OS no web (detalhe do aquecedor), porque quem executou não aceita;
  - em "Fornecedores" (web), a lista aparece, mas cadastrar, alterar e desativar voltam "Só o Admin do grupo, o Gestor CSC e o Gerente do hotel cadastram fornecedores".
- **Conferir também:** ao sair do PWA, a fila do dia é apagada do aparelho.

### Técnico do Praia (PWA)

- **Deve conseguir:** abrir chamado no Praia.
- **Deve ser barrado:** a fila do dia vem vazia; nada do Centro.

### Solicitante, Centro (PWA e web)

- **Deve conseguir:**
  - abrir chamado pelo PWA, com local, ativo opcional, descrição e foto;
  - ver os chamados do Centro no web;
  - **aceitar** a OS do aquecedor, porque foi ela quem abriu o chamado.
- **Deve ser barrado:** triagem e geração de OS: o painel "Triagem e atribuição" aparece no detalhe, mas qualquer ação dele volta com a recusa traduzida.

### Triagem pelo web, passo a passo (Gerente do Centro ou Gestor CSC)

O painel **Triagem e atribuição** fica no detalhe do chamado, abaixo das OS. Ele aparece para todos os papéis, e quem decide se a ação vale é a API: para quem não é Admin do grupo, Gestor CSC nem Gerente do hotel, a ação volta com a recusa traduzida. O painel mostra só as ações que o estado do chamado permite, e cada ação recarrega a tela.

1. **Abrir o chamado.** Em "Chamados", abrir "Chuveiro sem água quente" (aberto). O painel vem aberto, com **Triar**, **Gerar OS** e **Cancelar chamado**.
2. **Triar.** Escolher a prioridade **Urgente** (ou "Manter a atual") e clicar em **Triar**. A situação vira "em triagem" com a prioridade nova, e a linha do tempo ganha "Chamado em triagem". Agora aparece **Ajustar prioridade** no lugar de Triar.
3. **Ajustar prioridade.** Trocar para **Alta** e conferir "Prioridade alterada" na linha do tempo.
4. **Tentar uma OS para quem não é Técnico.** Em **Gerar OS**, a lista traz as equipes ativas do hotel e as pessoas ativas do grupo. Escolher a **Solicitante** e gerar: tem de voltar recusado, com a mensagem de que a pessoa não é Técnico ativo neste hotel.
5. **Gerar a OS para a equipe.** Escolher **Equipe Centro** e gerar. O chamado vai para "em execução", a OS aparece como atribuída à Equipe Centro, e o painel passa a mostrar **Reatribuir** e **Cancelar OS** para ela.
6. **Reatribuir.** Passar a OS para o **Técnico do Centro**. No PWA dele, a OS entra na fila do dia.
7. **Cancelar a OS.** Com um motivo (por exemplo, "Aberto em duplicidade"). O chamado volta à triagem, a OS fica cancelada com o motivo, e **Gerar OS** volta a aparecer para uma OS nova.
8. **Cancelar o chamado.** Primeiro sem motivo: tem de ser recusado, pedindo o motivo. Depois com um motivo: o chamado fica cancelado, com o motivo no detalhe e na linha do tempo, e o painel diz que não há ação de triagem neste estado.

**Conferir também:**
- Em outro navegador, com outro papel da triagem, abrir o mesmo chamado antes da ação e agir depois dela: a segunda ação volta com o aviso de que outra pessoa alterou o registro (conflito de versão).
- No Ar-condicionado UH 102 (em execução), o painel oferece só **Ajustar prioridade**, **Reatribuir** e **Cancelar OS**. No aquecedor (aguardando aceite) e no forno (concluído), nada.
- A triagem de cada chamado vale uma vez. Rodar o script de novo não desfaz o que você fez (seção 6). Para outra rodada, abra um chamado novo pelo PWA com a Solicitante: ele chega aberto.

### Histórico de cada registro, passo a passo (D1)

O botão **Ver histórico** fica no detalhe do chamado (abaixo da linha do tempo), em cada OS do chamado, em cada local e cada ativo das telas de administração, e na configuração do hotel e na lista de hotéis. Ele mostra, da mais antiga para a mais nova, cada gravação: quando, a ação, quem gravou e o antes e o depois de cada campo. A ação, o nome do campo e os valores conhecidos (estado, situação do cadastro, tipo de local, sim ou não) saem traduzidos; nome, descrição e motivo aparecem como foram escritos.

1. **Chamado triado.** Depois do passo a passo da triagem, abrir **Ver histórico** no chamado do chuveiro. Tem de aparecer "Chamado em triagem" com "Estado: aberto → em triagem" e a prioridade antiga e a nova pelo nome ("Prioridade: … → Urgente"), e o cancelamento com o motivo.
2. **OS reatribuída.** Na OS cancelada do mesmo chamado, **Ver histórico**: "OS gerada" com a Equipe Centro, "OS reatribuída" com "Equipe: Equipe Centro → vazio" e "Técnico: vazio → Técnico do Centro", e "OS cancelada" com o motivo.
3. **Ativo alterado.** Em "Ativos", mudar o fabricante de um ativo (ou um campo da categoria) e salvar. Em **Ver histórico** desse ativo, a linha "Ativo alterado" mostra o campo com o valor antigo e o novo. Mover o ativo de local mostra "Ativo mudou de local", com o local de origem e o de destino pelo nome.
4. **Local alterado.** Em "Locais", renomear uma área comum. O histórico dela mostra o nome antigo e o novo.
5. **Hotel.** Com o Admin, na configuração do hotel, trocar o fuso e salvar: o histórico do hotel mostra "Configuração alterada" com o fuso antigo e o novo.
6. **Idioma.** Trocar para en, es ou fr e abrir de novo um histórico: a ação, os campos e os estados mudam de idioma; os nomes e o motivo, não.

**Conferir também:**
- Um histórico já aberto se fecha sozinho depois de uma gravação no mesmo chamado ou OS: é só abrir de novo para ver a linha nova.
- Para quem não vê o registro, o histórico é "não encontrado", como o próprio registro.

### Proprietário de UH (web)

- **Deve conseguir:** ver só o chamado do Frigobar (UH 101 do Centro) e a OS dele, com a linha do tempo e o **histórico** do chamado e da OS. Quem gravou aparece como "por outra pessoa", porque o proprietário não lê os membros do grupo.
- **Deve ser barrado:**
  - os outros chamados do Centro, o Praia e o Serra;
  - qualquer gravação (o proprietário só lê);
  - "Fornecedores" vem vazia: o proprietário não lê fornecedor (I3).

### Proprietário do hotel inteiro (web)

- **Deve conseguir:** ver o Praia e o chamado dele, com a linha do tempo e o histórico do chamado.
- **Deve ser barrado:** o Centro e o Serra; qualquer gravação.

## 5. O que ainda não dá para testar pela tela

- **Lista de responsáveis só com Técnicos:** o seletor de "Gerar OS" e "Reatribuir" traz as pessoas ativas do grupo, porque é a lista que a rota das equipes do hotel já devolve. Quem não é Técnico do hotel é recusado pela API (passo 4 acima). Filtrar a lista pede uma rota nova de leitura, fora desta tarefa.
- **Linha do tempo e histórico do proprietário antes do `db push` da migração da D1:** até a migração 0028 chegar ao dev, o proprietário recebe a linha do tempo e o histórico vazios, sem erro. Os outros papéis já veem tudo.
- **Histórico anterior à fase 1a:** o histórico mostra o que a auditoria gravou. Não há histórico do que foi feito antes de cada tela existir.
- **SLA, escalonamento e notificações:** fase 1c. Os eventos ficam no outbox do dev, e nenhum e-mail sai, porque o cron só roda na Vercel.
- **Outro tenant:** o kit cria um grupo só. O isolamento entre tenants está coberto pelos testes pgTAP e de integração na CI.

## 6. Rodar de novo e recomeçar

- **Rodar de novo** não duplica nada: hotéis, pessoas, ativos e chamados são conferidos antes de gravar, e as operações offline têm chave fixa. A senha de todas as contas volta a ser a de `HK_DEMO_SENHA`.
- **O que você mudou** nas telas (aceites, OS novas, chamados novos) fica. O script não desfaz o teste; ele só completa o que falta.
- **Recomeçar do zero** exige apagar o grupo pelo dono do banco. Não há script para isso, porque o banco de dev é compartilhado. Peça quando precisar.
