// @hubkeep/db — acesso ao banco sempre com contexto (docs/02, ADR-003/006/009).
//
// Exporta a fábrica e os tipos. Não exporta: o pool, o Kysely, a transação
// crua da unidade de trabalho (transacaoDe) nem o insert de auditoria/outbox.
export { criarAcessoBanco } from './acesso';
export type { AcessoBanco, ConfigAcessoBanco } from './acesso';
export { emEscopoDeLeitura } from './escopo-de-leitura';
export type { ConfigConexao, Contexto, Tx } from './conexao';
export { tlsDaConexao } from './tls';
export { conferirAlvoDoBanco, refDaConexao } from './alvo-do-banco';
export type { EventoDominio, RegistroAuditoria, UnidadeDeTrabalho } from './unidade-de-trabalho';
export { criarBandeira } from './repositorios/bandeiras';
export type { Bandeira } from './repositorios/bandeiras';
export { concederPapel, criarMembro, revogarPapel } from './repositorios/membros';
export type { EscopoConcessao } from './repositorios/membros';
export { ehMembro, escopoVisivel, listarHoteisVisiveis, nomeDoTenant } from './consultas';
export {
  criarPortaConfiguracao,
  criarPortaEquipes,
  criarPortaBandeiras,
  criarPortaFornecedores,
  criarPortaAtivos,
  criarPortaCategorias,
  criarPortaChecklists,
  criarPortaPlanosPreventivos,
  criarPortaCodigos,
  criarPortaModulos,
  criarPortaChamados,
  criarPortaTriagem,
  criarPortaFeriadosDoHotel,
  criarPortaMonitorDeSla,
  criarPortaAceiteAutomatico,
  criarPortaGeracaoPreventiva,
  criarPortaExecucao,
  criarPortaParadas,
  criarPortaUhIndisponivel,
  criarPortaPrioridades,
  criarPortaSituacoes,
  criarPortaAnexos,
  criarPortaEscopoDeAnexo,
  criarPortaLocais,
  criarPortaProprietarios,
  criarPortaImplantacao,
  criarPortaMembros,
  criarPortaHoteisDoStaging,
  criarPortaOperacoesOffline,
  criarPortaPreferencias,
  criarPortasDeAplicacao,
  criarPortasDeIngestao,
} from './adaptadores';
export { criarPortaConsultasDaCorretiva } from './consultas-da-corretiva';
export { criarPortaHistorico } from './historico';
export { criarPortaAuditoriaGeral } from './auditoria-geral';
export { criarPortaAvisosDeSla } from './avisos-de-sla';
export { criarPortaDoJobDoIntelligence, criarPortaDoPainelDoIntelligence } from './inteligencia';
export type { PortaDoJobDoIntelligence, PortaDoPainelDoIntelligence } from './inteligencia';
export type {
  AtivoDoPainelNoBanco,
  ChamadoDoInsightNoBanco,
  ContagemDeInsightsNoBanco,
  DecisaoNoBanco,
  FiltroDeInsightsNoBanco,
  InsightComEvidenciaNoBanco,
  InsightDoPainelNoBanco,
  InsightLigadoNoBanco,
  MetricaDoPainelNoBanco,
  NomesDoPainelNoBanco,
} from './repositorios/inteligencia-painel';
export type {
  AtivoDoJob,
  ChamadoDoJob,
  DeteccaoNoInsightDoJob,
  ExecucaoNoBancoDoJob,
  HotelDoJob,
  InsightDoJob,
  LocalDoJob,
  MetricaDoJob,
  NovoInsightDoJob,
  OsDoJob,
  PoliticaDoJob,
  SessaoDoJobDoIntelligence,
  TransicaoDoJob,
} from './repositorios/inteligencia';
export { novoId } from './ids';
export { criptografiaDoServidor } from './criptografia';
export { atrasoDaTentativa, processarOutbox } from './repositorios/outbox';
export type { ResultadoOutbox } from './repositorios/outbox';
export type { HotelVisivel } from './consultas';
export type { AppPapel as Papel, DB } from './tipos-banco';
