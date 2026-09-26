# Diário da fase 1a

Uma entrada por tarefa do `docs/05-plano-fase-1a.md`: o que entregou, como o aceite foi provado, o PR e o que ficou pendente. As regras de processo são as do `docs/diario-fase-0.md` (zona protegida, ADR só com aprovação explícita, `db push` e `config push` só pelo Cesar, merge não aprova ADR). A execução vai uma etapa por vez, com parada e resumo ao fim de cada etapa.

## Etapa A — Estrutura e administração

### A1 — Ativação de hotel a partir do staging
- `DadosDeHotel` no contrato do adaptador: nome e fuso opcional.
- Domínio: `contaComoHotel`, `saldoDeHoteis` e `decidirAtivacao` (bloqueia sem saldo de hotéis, conflito se já ativo, libera as UHs pendentes até o saldo de UHs).
- Casos de uso `listarParaAtivacao`, `importarHotel` (para implantação, sem licença) e `ativarHotel`, só para o Admin do grupo. A regra é injetável para o teste de RLS.
- Rotas:
  - `GET /api/v1/hoteis/staging`;
  - `POST /api/v1/hoteis/importacoes`;
  - `POST /api/v1/hoteis/{id}/ativacao`.
- Tela `/admin/hoteis`: lista, diferenças com o sistema hoteleiro, escolha de fuso e ações, com os textos no catálogo nos quatro idiomas.
- Sem saldo: 409 `licenca_hoteis_sem_saldo`, com a tentativa na auditoria e o evento `licenca.sem_saldo` no outbox. O evento fica pendente até existir o manipulador da notificação (1c).
- Lock de licença por tenant (advisory lock de transação), também na promoção de UHs do worker. Sem migração.
- Aceite (`packages/db/test/hoteis.test.ts`, banco real na CI):
  - importação sem licença; repetir dá 409; sem fuso dá 422;
  - ativação com liberação parcial de UHs;
  - bloqueio sem saldo, com auditoria e evento;
  - RLS barrando o gerente com a checagem removida;
  - duas ativações simultâneas com uma licença: uma passa, a outra recebe 409;
  - paridade com `licenca.uso()`.
- Também: o teste do pseudo-idioma passou a ler as variáveis de cada mensagem pelo parser, em vez de uma lista fixa.
- Pendente: desativar hotel (libera licença) não entrou; fica para quando o plano pedir.

### Incidente 3 — `pnpm` executado fora do repositório (26/09/2026, ~20h18)
- **O que aconteceu:** numa cadeia de comandos ligada por `;`, um `cd` para a worktree da A3 falhou. O passo seguinte, `pnpm --filter ... exec`, rodou no scratchpad da sessão, fora do repositório. Sem workspace ali, o pnpm subiu as pastas até `C:\Users\cesar\package.json`, um projeto npm pessoal do Cesar, e moveu `cors`, `docx`, `express` e `mssql` para `C:\Users\cesar\node_modules\.ignored`. Não criou lockfile nem mexeu em outros arquivos.
- **Contenção:** o Claude viu o aviso do pnpm, achou a pasta afetada e parou. A restauração que ele tentou foi negada pelo classificador de permissões. O Cesar devolveu os 4 pacotes pelo PowerShell.
- **Regra nova (Cesar):**
  - antes de qualquer `pnpm`, `npm` ou `npx`, confirmar que o diretório atual é a raiz de um checkout do HubKeep (existe `pnpm-workspace.yaml`) e abortar se não for;
  - nenhuma cadeia com `;` em comandos que alteram arquivos, fazem merge ou instalam pacotes, só `&&`.

  A regra está no `CLAUDE.md` ("Comandos na máquina") e na memória do Claude.
- **Relação com incidentes anteriores:** o risco de `;` já aparecia na fase 0, quando um merge rodou apesar de uma guarda que falhou.

### A3 — Usuários e papéis
- Domínio (`packages/dominio/src/membros.ts`):
  - `podeGerirMembros` (Admin ou Implantador vigente);
  - `podeAlterarAtivoDoMembro` (só o Admin; ninguém altera o próprio acesso);
  - `podeAlterarValidade` (Admin, ou Implantador em papéis abaixo dele nos hotéis dele; o Implantador sempre com validade).
- Decisão do Cesar: desativar e reativar membro só pelo Admin do grupo. O Implantador tira o acesso revogando o papel no hotel dele.
- Migração 0007: a policy de UPDATE de `app.membro` passa a ser só do Admin do grupo. Fecha a lacuna da fundação, que deixava o Implantador alterar membro sem papel privilegiado em qualquer hotel. pgTAP 006. Aprovada pelo Cesar.
- Casos de uso `listarMembros`, `desativarMembro`, `reativarMembro` e `alterarValidade`. Concessão e revogação reaproveitam os casos de uso da F0-06, agora com rota.
- Rotas:
  - `GET /api/v1/membros`;
  - `POST /api/v1/atribuicoes`, `POST /api/v1/atribuicoes/{id}/revogacao`, `PUT /api/v1/atribuicoes/{id}/validade`;
  - `POST /api/v1/membros/{usuarioId}/desativacao` e `.../reativacao`.
- Tela `/admin/membros`: convite, lista com papéis, concessão, revogação, validade e desativação. Catálogo nos quatro idiomas, com os nomes dos papéis e escopos.
- Aceite (`packages/db/test/membros.test.ts`, banco real):
  - paridade domínio × RLS na desativação para todo par de quem age e alvo, com a única exceção sendo a regra própria do domínio;
  - o desativado perde o acesso e volta ao ser reativado;
  - lista recortada pela RLS;
  - validade auditada, no passado dá 422;
  - o Implantador não mexe na validade de outro Implantador.
- Falso alarme registrado: a suspeita de que o Implantador estendesse a própria validade pelo banco não procede. O `WITH CHECK` da policy de atribuição barra, e o pgTAP 002 já testa.
