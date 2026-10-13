# Material do piloto

Material de apoio ao piloto da Slaviero, escrito sobre o que existe na `main` em 08/10/2026 e atualizado em 12/10/2026 com as entregas da 1b até o #194 (seção "O que a 1b já entregou"). Convenção: **[ainda não existe]** é o que não está no código; **[vai mudar na 1b]** é o que o plano da fase 1b (`docs/12-plano-fase-1b.md`) altera; **[a definir]** e **[a confirmar]** são decisões em aberto.

1. `manual-por-papel.md`: manual curto de Técnico (PWA), Solicitante, Gerente do hotel, Gestor CSC e Admin do grupo, com a tabela de quem faz o quê.
2. `guia-implantacao-hotel.md`: implantação de UM hotel, etapa por etapa, o que o CSC e o hotel fazem, e os critérios de "hotel pronto".
3. `modelo-ativos-criticos.csv`: planilha modelo de ativos críticos (UTF-8 com BOM, separador `;`, 12 linhas fictícias).
4. `roteiro-treinamento.md`: sessões, pré-requisitos, exercícios com o kit de teste, aceite, problemas e feedback.
5. Para decisões de fase e escopo, ver `docs/12-plano-fase-1b.md`; para o kit, `docs/10-kit-de-teste.md`.

## O que ainda vai mudar

**[vai mudar na 1b]**
- Foto "antes" ou "depois" na OS (também na OS Atribuída), assinatura no aceite e as políticas `os.foto_depois_obrigatoria` e `os.assinatura_no_aceite` (I8). O banco e a API estão no #193, ainda aberto; as telas vêm na I8b. O manual será atualizado quando as telas entrarem.

**[a confirmar]**
- **HubKeep Intelligence no piloto.** O módulo opcional só aparece para o grupo que o contratou, e a contratação não tem tela: até o backoffice existir, é gravada pelo script de operação `pnpm ops:modulo`, que hoje só roda no dev. Se o piloto contrata o módulo, e em que data, decide o Cesar. Sem o módulo, nada do Intelligence aparece para o usuário. Com o módulo, o job calcula desde o primeiro dia, mas as telas só abrem na data da política `inteligencia.visibilidade_telas`: por padrão, 60 dias depois da primeira ativação, e só para o Admin do grupo e o Gestor CSC (decisão do Cesar de 12/10/2026). O Admin vê e muda a data em **HubKeep Intelligence → Abertura das telas**.

**[ainda não existe]**
- Importação de ativos por planilha (M2), QR em lote e etiqueta de impressão (M3), modelos por categoria (M1), aprovação de ativos cadastrados pelo celular (M4).
- Checklist tipado, planos preventivos e geração automática de OS (PV1 a PV3).
- SLA, notificações, indicadores, impressão da OS e CSV, aceite automático (job), nível bandeira das políticas (fase 1c).
- Recuperação de senha (1c, `docs/11`), segundo fator para Admin, Gestor CSC e Implantador (SP1, `docs/05`), e-mail de produção, staging e produção (F0-12).
- Script de provisionamento de cliente, rodado pelo backoffice: cria o grupo, o contrato de licença, o primeiro Admin e os padrões (situações, prioridades, categorias e políticas). Decidido em 08/10/2026; entra na preparação do piloto.
- Opção de turma no script do kit de teste (um grupo de demonstração novo por turma). Decidido em 08/10/2026; o agente do núcleo acrescenta.
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
| Intelligence | `int-visibilidade-telas` | As telas só abrem na data da política `inteligencia.visibilidade_telas` (padrão: 60 dias depois da primeira ativação do módulo, à meia-noite de Brasília) e só para os papéis dela (padrão: Admin do grupo e Gestor CSC; o Gerente entra só por configuração). Antes, o item do menu só aparece para o Admin do grupo e leva à página **Abertura das telas**, onde ele vê a data e a muda. |

**O kit de teste ainda não tem dados da I4** (UH indisponível, custo, fornecedor na OS): os exercícios novos do roteiro usam o que a turma cria na hora.

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
10. **Script do kit no staging (nova, da resposta 2):** hoje `pnpm demo:dados` recusa qualquer ambiente que não seja o dev, e o ADR-024 limita o uso da secret key fora da Vercel. O ajuste para rodar no staging, junto com a opção de turma, está previsto?

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
