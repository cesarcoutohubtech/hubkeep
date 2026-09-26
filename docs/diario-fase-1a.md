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
