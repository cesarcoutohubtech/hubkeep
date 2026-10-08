# Material do piloto

Material de apoio ao piloto da Slaviero, escrito sobre o que existe na `main` em 08/10/2026. Convenção: **[ainda não existe]** é o que não está no código; **[vai mudar na 1b]** é o que o plano da fase 1b (`docs/12-plano-fase-1b.md`) altera; **[a definir]** e **[a confirmar]** são decisões em aberto.

1. `manual-por-papel.md`: manual curto de Técnico (PWA), Solicitante, Gerente do hotel, Gestor CSC e Admin do grupo, com a tabela de quem faz o quê.
2. `guia-implantacao-hotel.md`: implantação de UM hotel, etapa por etapa, o que o CSC e o hotel fazem, e os critérios de "hotel pronto".
3. `modelo-ativos-criticos.csv`: planilha modelo de ativos críticos (UTF-8 com BOM, separador `;`, 12 linhas fictícias).
4. `roteiro-treinamento.md`: sessões, pré-requisitos, exercícios com o kit de teste, aceite, problemas e feedback.
5. Para decisões de fase e escopo, ver `docs/12-plano-fase-1b.md`; para o kit, `docs/10-kit-de-teste.md`.

## O que ainda vai mudar

**[vai mudar na 1b]**
- Data da compra, garantia e criticidade (1 a 5) do ativo, na planilha e nos formulários: etapa I1, migração preparada pelo agente do núcleo, ainda não na `main`. Nomes dos níveis de criticidade e configuração dos nomes: em implementação junto da I1.
- Pergunta "afeta hóspede?" na abertura do chamado, "executado por" e custo informado (I2).
- Códigos de falha, causa e solução e a política de obrigatoriedade (I4).
- Intelligence só lê o que a I1 a I5 instrumentam; nada disso aparece para o usuário do piloto.

**[ainda não existe]**
- Importação de ativos por planilha (M2), QR em lote e etiqueta de impressão (M3), modelos por categoria (M1), aprovação de ativos cadastrados pelo celular (M4).
- Checklist tipado, planos preventivos e geração automática de OS (P1 a P3).
- SLA, notificações, indicadores, impressão da OS e CSV, aceite automático (job), nível bandeira das políticas (fase 1c).
- Recuperação de senha (1c, `docs/11`), segundo fator para Admin, Gestor CSC e Implantador (SP1, `docs/05`), e-mail de produção, staging e produção (F0-12).
- Foto no chamado (a API existe; nenhuma tela usa), leitura do QR que preenche o chamado, edição da prioridade padrão por categoria pela tela, telas para instalar situações e prioridades padrão e para criar a credencial do agente.
- Conector real do TOTVS (T1, depende das views do cliente); o fallback de hotéis e UHs é CSV.
- Colunas de campos estendidos e chave de importação da planilha: **[a definir na M2]**.

## Perguntas em aberto para o Cesar

1. **Quantos hotéis?** O pedido fala em 4; `docs/00` e `docs/04` falam em 2 a 3, com confirmação depois de 01/10. Nenhum hotel está nomeado; o roteiro deixa "[hotel 1..4 a definir]".
2. **Onde acontece o treinamento?** O kit roda só no dev e no notebook; staging e produção não existem.
3. **Recomeço do kit entre turmas:** não há script de reset; só apagar o grupo pelo dono do banco.
4. **Quem instala as situações e prioridades padrão** no grupo do cliente (só pela API, Admin do grupo)?
5. **Importação (M2):** cria o local que falta ou recusa a linha? As colunas de campos estendidos? Só CSV ou XLSX (pergunta 4 do `docs/12`)?
6. **Hotel pronto no piloto:** "locais sem ativo" pode ficar como pendência, já que só os ativos críticos entram?
7. **Foto do chamado:** o `docs/10` diz que a Solicitante abre chamado com foto; nenhuma tela de chamado tem esse campo.
8. **Senha esquecida até a 1c:** qual é o procedimento do suporte, já que não existe recuperação?
9. **Categorias:** caldeira e SPDA não têm categoria padrão (no modelo foram para Hidráulica e Segurança e incêndio). O grupo cria categoria própria?

## Como conferi

Telas, rótulos e fluxos (todos em `C:\Cesar\HubKeep\Dev\wt\int-piloto`):
- Catálogo pt-BR: `packages/i18n/catalogos/pt-BR.json` (rótulos e mensagens).
- Web: `apps/web/src/cliente/moldura.tsx` (menu), `apps/web/src/app/(painel)/**/page.tsx` (chamados, detalhe, OS, hotéis, locais, categorias, ativos, equipes, proprietários, bandeiras, membros, configuração, implantação, paradas), `apps/web/src/cliente/corretiva.tsx` e `triagem.tsx` (aceite, reabertura, triagem), `apps/web/src/cliente/QrDoAtivo.tsx`, `apps/web/src/app/login` e `definir-senha`, `apps/web/src/app/api/v1/**` (rotas existentes e ausentes), `apps/web/src/app/api/cron/*` e `apps/web/vercel.json` (crons ligados).
- PWA: `apps/tecnico/src/App.tsx` e `telas/*` (fila do dia, OS, ativos, fotos, abrir chamado, login), `os/projecao.ts`, `qr.ts`, `vite.config.ts` (manifesto).
- Papéis e permissões: `packages/dominio/src/corretiva.ts`, `triagem.ts`, `permissoes.ts`, `ativos.ts`, `locais.ts`, `equipes.ts`, `implantacao.ts`, `categorias.ts`, `politicas.ts`, `qr.ts`, `campos-tipados.ts`; `packages/aplicacao/src/casos-de-uso/*`; `supabase/migrations/20260924000001_fundacao.sql` (`authz.hoteis_leitura` e `hoteis_escrita`), `20260928214709_ativo.sql`, `20260929120937_chamado.sql`, `20260929183205_os.sql`.
- Conector e fallback de hotéis e UHs: `apps/conector/src/adaptadores/planilha.ts` e `csv.ts`.
- Plano e kit: `docs/12-plano-fase-1b.md`, `docs/10-kit-de-teste.md`, `docs/00-contexto-produto.md`, `docs/01-arquitetura.md`, `docs/04-plano-fase-0.md`, `docs/05-plano-fase-1a.md`, `docs/11-conformidade-fase-1a.md`, `docs/referencia/lacunas-instrumentacao-intelligence.md`, `docs/referencia/perguntas-cliente.md`.
- Migração I1 (só para conferir os nomes das colunas): `20261006220000_ativo_compra_garantia_criticidade.sql`, preparada pelo agente do núcleo e ainda não na `main`; os nomes podem mudar até ela entrar.
- Não executei o app: tudo foi conferido pelo código, sem rodar telas.
