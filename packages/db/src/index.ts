// @hubkeep/db — acesso ao banco sempre com contexto (docs/02, ADR-003/006/009).
//
// Exporta a fábrica e os tipos. Não exporta: o pool, o Kysely, a transação
// crua da unidade de trabalho (transacaoDe) nem o insert de auditoria/outbox.
export { criarAcessoBanco } from './acesso';
export type { AcessoBanco, ConfigAcessoBanco } from './acesso';
export type { ConfigConexao, Contexto, Tx } from './conexao';
export { tlsDaConexao } from './tls';
export type { EventoDominio, RegistroAuditoria, UnidadeDeTrabalho } from './unidade-de-trabalho';
export { criarBandeira } from './repositorios/bandeiras';
export type { Bandeira } from './repositorios/bandeiras';
export { concederPapel, criarMembro, revogarPapel } from './repositorios/membros';
export type { EscopoConcessao } from './repositorios/membros';
export { ehMembro, escopoVisivel, listarHoteisVisiveis, nomeDoTenant } from './consultas';
export {
  criarPortaBandeiras,
  criarPortaEscopoDeAnexo,
  criarPortaMembros,
  criarPortaHoteisDoStaging,
  criarPortaOperacoesOffline,
  criarPortaPreferencias,
  criarPortasDeAplicacao,
  criarPortasDeIngestao,
} from './adaptadores';
export { novoId } from './ids';
export { criptografiaDoServidor } from './criptografia';
export { atrasoDaTentativa, processarOutbox } from './repositorios/outbox';
export type { ResultadoOutbox } from './repositorios/outbox';
export type { HotelVisivel } from './consultas';
export type { AppPapel as Papel, DB } from './tipos-banco';
