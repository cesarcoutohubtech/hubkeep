# Proposta: SP1, MFA obrigatório (21/10/2026)

**Status:** as seis decisões da seção 8 foram aceitas pelo Cesar em 21/10/2026 ("Cesar aqui. SP1 pelas propostas"). O texto da decisão está no ADR-049 e no adendo ao ADR-024 (`docs/03`), que aguardam a aprovação do texto.

**De onde vem:** condição 4 do ADR-032 (Cesar, 29/09/2026), SP1 no `docs/05` e P4 no `docs/09`. O piloto só começa com a SP1 feita.

**Aceite do `docs/05`:**
- TOTP obrigatório para Admin do grupo, Gestor CSC e Implantador;
- sem o segundo fator, a sessão desses papéis não chega ao nível exigido (AAL2), e a API recusa com código;
- teste por papel, e os demais papéis seguem sem exigência;
- recuperação do segundo fator definida.

## 1. Como o Supabase faz

- **O TOTP é do Auth do Supabase:** o navegador chama `mfa.enroll`, `mfa.challenge` e `mfa.verify` com a chave pública, como no login (ADR-032).
  - Não é a Data API: nenhuma tabela do HubKeep é tocada.
  - O cadastro devolve o QR em SVG (`data:`, que a CSP do web já aceita em `img-src`) e o segredo em texto.
- **O token diz o nível:** a claim `aal` vale `aal1` (só a senha) ou `aal2` (senha e TOTP verificado na sessão).
  - A renovação do token mantém o nível da sessão.
  - Um login novo com senha começa em `aal1`, e o app pede o código.
- **O Supabase não tem códigos de recuperação.** A saída que ele recomenda é ter mais de um fator cadastrado. Para quem perde todos, quem remove o fator é a API de administração, com a secret key.
- **Configuração:**
  - `[auth.mfa]` e `[auth.mfa.totp]` (`enroll_enabled` e `verify_enabled`) no `supabase/config.toml`, que é zona protegida;
  - o dev já tem o TOTP ligado (`[remotes.dev.auth.mfa.totp]`, desde 24/09/2026), então não há `config push` a fazer; só o bloco da CI muda.
  - O TOTP está no plano grátis. O limite de sessão (absoluto e por inatividade) é do Pro e fica para o portão do staging.

## 2. Onde a regra fica

A regra é de permissão de ação, então fica fora do banco (regra 2 do `CLAUDE.md`).

- **Domínio (`packages/dominio`):**
  - `PAPEIS_COM_SEGUNDO_FATOR = ['admin_grupo', 'gestor_csc', 'implantador']`;
  - `exigeSegundoFator(atribuicoes, agora)`, que olha só as atribuições vigentes. Quem tem dois papéis, um deles da lista (Implantador e Técnico, por exemplo), cai na exigência;
  - `exigirNivelDaSessao(nivel, atribuicoes, agora)`, que lança `PermissaoNegada('segundo_fator_obrigatorio')`.
- **Identidade (`apps/web/src/servidor/identidade.ts`):** o verificador passa a devolver o `aal` do token, conferido pela assinatura. Claim ausente ou desconhecida conta como `aal1`.
- **Portão na API (`resolverContexto`):** é a recomendação.
  - Com `aal2`, nada muda e não há consulta a mais.
  - Com `aal1`, uma leitura das atribuições do usuário no tenant (a mesma do `atribuicoes.doUsuario`) e a recusa 403 `segundo_fator_obrigatorio` se alguma exigir o segundo fator.
  - O custo é uma consulta curta por requisição de quem está em `aal1`, ou seja, Técnico, Solicitante, Gerente e Proprietário. Meço no dev antes do PR.
  - Se pesar, a alternativa é guardar o resultado por token (`sub` e `iat`) na memória da função.
  - **Por que no portão, e não ação por ação:** a RLS mostra os dados pelo papel. Um Admin em `aal1` leria tudo pelas listas, mesmo que as ações recusassem. O portão fecha tudo de uma vez, e um papel novo concedido entra na exigência na próxima requisição, sem sincronizar nada.
- **Exceções do portão:** só as rotas de que a pessoa precisa para chegar ao `aal2` ou para sair:
  - a leitura dos próprios papéis, que o painel usa para decidir a tela;
  - a saída.
  - O cadastro e a verificação do TOTP não passam pela API do HubKeep: vão direto ao Auth.

## 3. Telas

### Web

- **Depois do login com senha, se o usuário exige o segundo fator:**
  - sem fator cadastrado: a tela **Cadastrar o segundo fator**, com o QR, o segredo em texto (para digitar no app), o campo do código de 6 dígitos e o aviso para cadastrar um segundo aparelho;
  - com fator: a tela **Código do aplicativo**.
- **O layout do painel faz a mesma conta do portão** e manda para essas telas, para a pessoa não ver uma página de erro.
- **Minha conta → Segurança:**
  - lista os fatores, com nome e data;
  - acrescenta outro fator (recomendado: dois aparelhos);
  - remove um fator, o que exige `aal2` e manter pelo menos um, se o papel exige.
- **Textos:** todos no catálogo, nos quatro idiomas, com os nomes de apps de autenticação sem marca ("aplicativo autenticador").

### PWA

O PWA é do Técnico, que não exige o segundo fator. O Implantador, porém, usa o PWA para cadastrar ativos (M3, etiquetas).
- **Proposta:** o PWA só faz a verificação do código depois do login, sem cadastro de fator. Quem exige o segundo fator e ainda não cadastrou recebe o aviso para cadastrar no web primeiro.
- **Sem rede:** o PWA abre com a sessão guardada, que já está em `aal2`. A fila sincroniza quando a rede volta, e a renovação mantém o nível.

## 4. Recuperação do segundo fator

O Supabase não tem códigos de recuperação. Proposta em três camadas:
1. **Dois fatores:** a tela recomenda cadastrar um segundo aparelho. Com um, perder o celular não tranca a pessoa.
2. **Reset por um Admin do grupo do mesmo tenant:** o Admin, em `aal2`, remove os fatores de outro membro, com auditoria (`entidade 'membro'`, ação `remover_segundo_fator`) e o evento de domínio.
   - A pessoa entra de novo com a senha e cadastra o fator novo.
   - A remoção é feita no `packages/auth-admin`, com a secret key (`auth.admin.mfa.deleteFactor`). Esse é um uso novo da chave: exige um **adendo ao ADR-024**, com o teste `tests/secret-key-so-no-auth-admin.test.ts` atualizado, na zona protegida.
   - A aplicação confere antes, pela RLS no `hk_app`, que o alvo é membro do tenant de quem pede.
3. **O único Admin do grupo que perde tudo:** o reset é pelo backoffice do HubKeep, com o script de operação (`scripts/ops`), rodado pelo Cesar e registrado na auditoria. Não há tela para isso.

## 5. Testes

- **Domínio:**
  - a tabela papel × nível (`aal1` e `aal2`) para os sete papéis;
  - o papel vencido ou revogado não exige;
  - dois papéis, um da lista, exigem.
- **Identidade:** o `aal` lido do token assinado, e a claim ausente como `aal1`.
- **Portão (`apps/web/test`):**
  - Admin do grupo, Gestor CSC e Implantador em `aal1` recebem 403 `segundo_fator_obrigatorio`, e em `aal2` passam;
  - Técnico, Solicitante, Gerente e Proprietário passam em `aal1`;
  - o erro tem mensagem no catálogo.
- **Integração na CI:** com o Supabase local, o cadastro e a verificação de um TOTP de teste (o segredo vem do `enroll`, e o código é gerado no teste), e o token resultante em `aal2` passa pelo portão.
- **Reset:** o teste do `auth-admin`, e o caso de uso com a regra (só o Admin do grupo, em `aal2`, no mesmo tenant).

## 6. Impacto no que já existe

- **Kit de teste e demonstração:** o kit cria contas de Admin e Gestor que entram com senha. Depois da SP1, elas pedem o TOTP no primeiro acesso. As opções estão na decisão 4, abaixo.
- **Intelligence:** as telas e rotas do Kaio passam pelo mesmo portão, sem mudança no módulo. Aviso no diário do Intelligence quando o PR abrir.
- **Scripts de operação** que chamam a API com token de usuário: nenhum hoje.

## 7. Como entra

1. **PR de zona protegida** (`adm:`):
   - o `config.toml` com o TOTP ligado;
   - o adendo ao ADR-024 (o reset do fator) e o registro da SP1 no `docs/03`;
   - o teste da secret key atualizado.
   - O dev já tem o TOTP ligado: não há `config push`.
2. **PR fora da zona:** o domínio, o portão, as telas do web, a verificação no PWA, o reset pelo Admin, o catálogo e os testes.

Um item só fica para o portão do staging: o limite de sessão do Supabase Pro.

## 8. Decisões do Cesar

1. **Portão na API para todas as rotas**, e não ação por ação, com a consulta das atribuições quando o token está em `aal1` (seção 2)? Proposta: sim.
2. **Quem tem dois papéis**, um deles da lista, exige o segundo fator em tudo, inclusive no PWA? Proposta: sim.
3. **PWA só verifica o código**, e o cadastro do fator fica no web (seção 3)? Proposta: sim.
4. **Contas do kit de teste e da demonstração:**
   - (a) pedem o TOTP como as reais, e o treinamento ensina a cadastrar;
   - (b) o kit cadastra o fator com um segredo conhecido do instrutor;
   - (c) ficam isentas.
   - Proposta: (a) no treinamento por turma, porque o hotel aprende o que vai usar; (b) só para a conta do roteiro de demonstração do Cesar, com o segredo guardado como as outras credenciais do kit. A (c) abre uma exceção na regra e não proponho.
5. **Recuperação nas três camadas da seção 4**, com o adendo ao ADR-024 para o reset pelo Admin do grupo? Proposta: sim.
6. **Gerente do hotel** fica fora da exigência, como diz o `docs/05`? O Gerente aceita OS e vê custos, mas não concede papel nem muda configuração do grupo. Proposta: fora, com o TOTP opcional para quem quiser.
