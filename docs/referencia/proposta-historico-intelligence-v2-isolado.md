# Intelligence — segunda demonstração isolada no DEV

**Estado:** proposta de execução, não executada no Supabase DEV.
**Objetivo:** manter intacto o grupo do histórico de 13/10/2026 e preparar
uma segunda demonstração do Intelligence com o roteiro mais recente,
em outro tenant no **mesmo projeto DEV**.

## O que permanece intacto

- O comando antigo `pnpm demo:historico` e todos os seus arquivos continuam iguais.
- A identidade `TENANT_DO_HISTORICO` e o domínio
  `intelligence.demo.hubkeep.test` não são reutilizados.
- A nova identidade vem de `isolamento-historico-v2.ts`, com tenant fixo
  diferente e e-mails terminados em `intelligence-v2.demo.hubkeep.test`.
- Não se apaga, migra, renomeia ou reprocessa o histórico antigo.
- Apenas quando a gravação nova termina, o próprio tenant recém-criado é
  renomeado para **Grupo Demonstração — Intelligence V2**.
- Nenhum novo arquivo é de migração, infraestrutura, RLS, workflow, Supabase
  ou configuração do núcleo. Não tocar a implementação em curso do Kaio/Claude.

## O que ainda é compartilhado

A aplicação, os workers, o Auth do Supabase, a conexão, as tabelas físicas,
os limites de banco e o consumo de CPU/IO continuam compartilhados com o DEV.
O código das rotinas do Intelligence também é o mesmo. Portanto, **não é
impacto zero** no desempenho/capacidade e o isolamento efetivo de todos os
jobs deve ser confirmado antes de gravar no novo tenant. Para zero efeito no
banco atual, seria necessário um Supabase DEV separado.

## Etapa 1 — somente leitura (obrigatória)

Em PowerShell na raiz do repositório, com DEV_SESSION_POOLER e as variáveis
de acesso ao DEV configuradas como já eram no kit:

```powershell
node --experimental-strip-types --no-warnings=ExperimentalWarning scripts/ops/historico-isolado.ts --ambiente dev --fim 2026-10-13 --verificar
```

Essa etapa confere o ref de `[remotes.dev]`, as credenciais das conexões,
a existência do grupo antigo, a inexistência do tenant V2 e de contas no
domínio V2, e mostra **somente contagens** das tabelas do grupo antigo.
Ela executa consultas em transação `READ ONLY`, não roda o gerador,
não cria usuários e não modifica dados. O modo deve terminar com
`VERIFICAÇÃO APROVADA` antes de avançar. Caso haja qualquer erro, parar.

**Checklist fora do script (revisão Kaio/Claude antes da gravação):**
- [ ] CI e revisão do PR de isolamento concluídas
- [ ] Nenhum job agendado do Intelligence varre outros tenants indevidamente
- [ ] Permissões de Auth e políticas RLS conferidas para tenants separados
- [ ] Recurso e janela de manutenção do DEV considerados, já que o histórico
      completo pode demorar horas e compartilhar infraestrutura
- [ ] Backup/ponto de recuperação do DEV confirmado pelo responsável
- [ ] Resultado de `--verificar` registrado

## Etapa 2 — execução controlada, após o merge e validação

Somente com a pré-validação bem-sucedida e o PR incorporado à `main`:

```powershell
node --experimental-strip-types --no-warnings=ExperimentalWarning scripts/ops/historico-isolado.ts --ambiente dev --fim 2026-10-13 --executar
```

Essa etapa cria o novo tenant e novas contas fictícias; em seguida grava
a nova linha do tempo e calcula os indicadores no novo grupo, pela mesma
regra de produção. **Não execute sem a revisão dos jobs e das permissões.**
Ao final, a rotina compara as contagens de chamado, OS, insight, métricas,
membros e licença do grupo antigo com as registradas antes de executar.

**Atenção:** a v2 é criada em banco persistente. Se a conexão cair no meio,
o tenant novo poderá ficar parcial. O script intencionalmente **recusa
reexecutar** se o tenant ou seus usuários já existirem. Não apagar nada
nem forçar `--executar`: inspecionar o estado e elaborar procedimento de
retomada separado, somente para o tenant V2.

## Onde validar

- Grupo atual: continua com o histórico anterior.
- Grupo V2: `Grupo Demonstração — Intelligence V2`, contas com domínio
  `@intelligence-v2.demo.hubkeep.test`.
- Tela de efetividade, detalhe do ativo, página de insight do elevador:
  conferir se a modernização e a comparação antes/depois aparecem apenas
  onde os dados reais do roteiro V2 estiverem presentes.
- Confirmar as contagens dos dois tenants e ausência de modificações no
  grupo original. Os totais de linha **não substituem** auditoria de
  mutações, nem provam isoladamente que todos os jobs são segregados.

## Observação sobre o PR #295 do Kaio

O Claude/Kaio abriu o PR #295 para corrigir a retomada **do histórico
antigo**, preservando 4.314 chamados. Esse trabalho é independente desta
nova proposta. Não reutilizar os arquivos dele nem antecipar o merge.

No momento da criação desta proposta, não foi realizada conexão ao banco
DEV nem modificação em dados, usuários, políticas, jobs ou `main`.
