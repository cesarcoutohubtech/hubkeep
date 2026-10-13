// Raiz de composição do servidor: cria uma vez, por instância de função, o
// acesso ao banco, o verificador de token e os casos de uso. Único ponto do app
// que lê as variáveis de ambiente do servidor.
import { criarAdministracaoDoAuth, criarArmazenamentoDeAnexos } from '@hubkeep/auth-admin';
import {
  type CasoDeUsoDeConvites,
  type CasosDeUsoDeAnexos,
  type CasosDeUsoDeAtivos,
  type CasosDeUsoDeCategorias,
  type CasosDeUsoDeChamados,
  type CasosDeUsoDeChecklists,
  type CasosDeUsoDePlanosPreventivos,
  type CasosDeUsoDeCodigos,
  type CasosDeUsoDeTriagem,
  type CasosDeUsoDeExecucao,
  type CasosDeUsoDeParadas,
  type CasosDeUsoDeUhIndisponivel,
  type CasosDeUsoDeConsultas,
  type CasosDeUsoDeAuditoriaGeral,
  type CasosDeUsoDeHistorico,
  type CasosDeUsoDeSituacoes,
  type CasosDeUsoDeConfiguracao,
  type CasosDeUsoDeEquipes,
  type CasosDeUsoDeBandeiras,
  type CasosDeUsoDeFornecedores,
  type CasosDeUsoDeHoteis,
  type CasosDeUsoDeImplantacao,
  type CasosDeUsoDeLocais,
  type CasosDeUsoDeMembros,
  type CasosDeUsoDeProprietarios,
  type CasosDeUsoDeIngestao,
  type CasosDeUsoDePapeis,
  type CasosDeUsoDePreferencias,
  type CasosDeUsoDeSincronizacao,
  type Manipulador,
  type VerificadorDeToken,
  criarCasoDeUsoDeConvites,
  criarCasosDeUsoDeAnexos,
  criarCasosDeUsoDeAtivos,
  criarCasosDeUsoDeParadas,
  criarCasosDeUsoDeUhIndisponivel,
  criarCasosDeUsoDeConsultas,
  criarCasosDeUsoDeAuditoriaGeral,
  criarCasosDeUsoDeHistorico,
  criarCasosDeUsoDeCategorias,
  criarCasosDeUsoDeChamados,
  criarCasosDeUsoDeChecklists,
  criarCasosDeUsoDePlanosPreventivos,
  criarCasosDeUsoDeCodigos,
  criarCasosDeUsoDeTriagem,
  criarCasosDeUsoDeExecucao,
  criarCasosDeUsoDeSituacoes,
  criarCasosDeUsoDeConfiguracao,
  criarPoliticasDoTenant,
  criarCasosDeUsoDeEquipes,
  criarCasosDeUsoDeBandeiras,
  criarCasosDeUsoDeFornecedores,
  criarCasosDeUsoDeHoteis,
  criarCasosDeUsoDeImplantacao,
  criarCasosDeUsoDeLocais,
  criarCasosDeUsoDeMembros,
  criarCasosDeUsoDeProprietarios,
  criarCasosDeUsoDeIngestao,
  criarCasosDeUsoDePapeis,
  criarCasosDeUsoDePreferencias,
  criarCasosDeUsoDeSincronizacao,
  criarManipuladoresDeEventos,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import {
  type AcessoBanco,
  type ResultadoOutbox,
  criarAcessoBanco,
  criarPortaAtivos,
  criarPortaCategorias,
  criarPortaChamados,
  criarPortaChecklists,
  criarPortaCodigos,
  criarPortaPlanosPreventivos,
  criarPortaTriagem,
  criarPortaExecucao,
  criarPortaParadas,
  criarPortaUhIndisponivel,
  criarPortaConsultasDaCorretiva,
  criarPortaDoJobDoIntelligence,
  criarPortaDoPainelDoIntelligence,
  criarPortaAuditoriaGeral,
  criarPortaHistorico,
  criarPortaPrioridades,
  criarPortaSituacoes,
  criarPortaConfiguracao,
  criarPortaModulos,
  criarPortaEquipes,
  criarPortaBandeiras,
  criarPortaFornecedores,
  criarPortaAnexos,
  criarPortaEscopoDeAnexo,
  criarPortaHoteisDoStaging,
  criarPortaImplantacao,
  criarPortaLocais,
  criarPortaMembros,
  criarPortaProprietarios,
  criarPortaOperacoesOffline,
  criarPortaPreferencias,
  criarPortasDeAplicacao,
  criarPortasDeIngestao,
  criptografiaDoServidor,
  novoId,
  processarOutbox,
  conferirAlvoDoBanco,
  tlsDaConexao,
} from '@hubkeep/db';
import { registrosDePoliticasPorModulo } from '@hubkeep/dominio';
import { criarFeriadosOficiais } from './feriados-oficiais';
import { criarVerificadorJwks } from './identidade';
import { registrarNoConsole } from './log';
import { montarInteligencia } from './modulos/inteligencia';
import { enviarCheckInAoSentry } from './sentry';

function exigirEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não está definida.`);
  return v;
}

export const urlSupabase = () => exigirEnv('NEXT_PUBLIC_SUPABASE_URL');
export const chavePublicaSupabase = () => exigirEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

// TLS para o pooler do Supabase. HK_BANCO_SEM_TLS=1 (a CI, no Postgres do
// runner) só vale com host local; com host remoto a inicialização falha. No
// preview da Vercel, a conexão não pode ser a do banco de produção (M2).
const conexao = (nome: string) => {
  const url = exigirEnv(nome);
  conferirAlvoDoBanco({
    vercelEnv: process.env.VERCEL_ENV,
    refProducao: process.env.HK_REF_PRODUCAO,
    nome,
    url,
  });
  return { url, ssl: tlsDaConexao(url, process.env.HK_BANCO_SEM_TLS === '1') };
};

// O Intelligence (módulo opcional) entra só por aqui. Extensão inválida lança
// na carga do módulo, nunca num request. As chaves de um módulo valem só para
// o tenant com o módulo vigente (adendo da I7 ao ADR-026): os registros são
// montados aqui, e cada request escolhe o seu (criarPoliticasDoTenant).
const inteligencia = montarInteligencia();
const registrosDePoliticas = registrosDePoliticasPorModulo(inteligencia.extensoesDePolitica);

/** Memoiza uma Promise, sem ficar preso a ela se rejeitar (o próximo pedido tenta de novo). */
function memo<T>(criar: () => Promise<T>): () => Promise<T> {
  let atual: Promise<T> | undefined;
  return () => {
    atual ??= criar().catch((e: unknown) => {
      atual = undefined;
      throw e;
    });
    return atual;
  };
}

// A fábrica é assíncrona: confere o papel de cada pool (guarda de papel, ADR-016).
export const acessoBanco = memo<AcessoBanco>(() =>
  criarAcessoBanco({ app: conexao('DATABASE_URL_APP') }),
);
const acessoBancoDoWorker = memo<AcessoBanco>(() =>
  criarAcessoBanco({ worker: conexao('DATABASE_URL_WORKER') }),
);
// Só a rota de ingestão abre este pool (hk_ingestao, só staging; ADR-008).
const acessoBancoDaIngestao = memo<AcessoBanco>(() =>
  criarAcessoBanco({ ingestao: conexao('DATABASE_URL_INGESTAO') }),
);

let auth: ReturnType<typeof criarAdministracaoDoAuth> | undefined;
const administracaoDoAuth = () => (auth ??= criarAdministracaoDoAuth({ url: urlSupabase() }));

export const casosDeUsoDePapeis = memo<CasosDeUsoDePapeis>(async () =>
  criarCasosDeUsoDePapeis({
    ...criarPortasDeAplicacao(await acessoBanco()),
    relogio: relogioDoSistema,
  }),
);

export const casoDeUsoDeConvites = memo<CasoDeUsoDeConvites>(async () =>
  criarCasoDeUsoDeConvites({
    papeis: await casosDeUsoDePapeis(),
    convites: criarPortasDeAplicacao(await acessoBanco()).convites,
    identidade: administracaoDoAuth().identidade,
  }),
);

/** Recebimento de lotes do agente: só o pool hk_ingestao (F0-08). */
export const recebimentoDeLotes = memo<Pick<CasosDeUsoDeIngestao, 'receberLote'>>(async () =>
  criarCasosDeUsoDeIngestao({
    ingestao: criarPortasDeIngestao(await acessoBancoDaIngestao()).ingestao,
    cripto: criptografiaDoServidor,
  }),
);

/** Criar e revogar credencial do agente, pelo Admin do grupo (hk_app). */
export const credenciaisDeAgente = memo<
  Pick<CasosDeUsoDeIngestao, 'criarCredencial' | 'revogarCredencial'>
>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeIngestao({
    credenciais: criarPortasDeIngestao(banco).credenciais,
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
    cripto: criptografiaDoServidor,
  });
});

/** Promove as UHs do staging de um tenant (hk_worker); /api/cron/promocao chama para todos. */
export async function promoverUhsDoTenant(tenantId: string) {
  return criarCasosDeUsoDeIngestao({
    promocao: criarPortasDeIngestao(await acessoBancoDoWorker()).promocao,
  }).promoverUhs(tenantId);
}

/**
 * O job diário do Intelligence num tenant (hk_worker, ADR-036); a rota
 * /api/cron/inteligencia chama para todos. O tenant sem o módulo vigente volta
 * com semModulo e sem gravar nada.
 */
export async function calcularDiaDoIntelligence(tenantId: string) {
  return inteligencia.jobDoDia({
    porta: criarPortaDoJobDoIntelligence(await acessoBancoDoWorker()),
    registros: registrosDePoliticas,
    relogio: relogioDoSistema,
  })(tenantId);
}

/**
 * A observabilidade do job do Intelligence: o log por tenant e por rodada e o
 * check-in do monitor no Sentry (sem SENTRY_DSN, só o log). A rota
 * /api/cron/inteligencia envolve o job e a rodada com ela.
 */
export const observacaoDoJobDoIntelligence = inteligencia.observarJob({
  registrar: registrarNoConsole,
  checkIn: enviarCheckInAoSentry,
});

/**
 * O painel do Intelligence (as telas do 1.0): a leitura e a decisão do insight
 * com o hk_app e o contexto de quem pede. Sem o módulo vigente, ou sem papel
 * que decide, os casos de uso devolvem 404 inteligencia_indisponivel.
 */
export const casosDeUsoDoPainelDoIntelligence = memo(async () => {
  const banco = await acessoBanco();
  return inteligencia.painel({
    porta: criarPortaDoPainelDoIntelligence(banco),
    modulos: criarPortaModulos(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    configuracao: criarPortaConfiguracao(banco),
    relogio: relogioDoSistema,
  });
});

/** Tenants para os jobs de cron (hk_worker). */
export async function tenantsDoSistema(): Promise<string[]> {
  return (await acessoBancoDoWorker()).listarTenants();
}
/** Anexos (F0-10 e B4): escopo e registro pela RLS, URL pelo auth-admin. */
export const casosDeUsoDeAnexos = memo<CasosDeUsoDeAnexos>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeAnexos({
    escopo: criarPortaEscopoDeAnexo(banco),
    anexos: criarPortaAnexos(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    armazenamento: criarArmazenamentoDeAnexos({ url: urlSupabase() }),
    relogio: relogioDoSistema,
    novoId,
    // A foto na OS: responsável, com a OS atribuída, em execução ou pausada (C4 e I8).
    regraParaAnexar: async (ctx, entidade, registroId) => {
      if (entidade === 'os') await (await casosDeUsoDeExecucao()).exigirFoto(ctx, registroId);
    },
    // A assinatura do aceite: quem pode aceitar a OS agora (I8).
    regraParaAssinar: async (ctx, osId) =>
      (await casosDeUsoDeTriagem()).exigirQuemAceita(ctx, osId),
  });
});

/** Equipes do hotel (fase 1a, A6), pelo hk_app. */
export const casosDeUsoDeEquipes = memo<CasosDeUsoDeEquipes>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeEquipes({
    equipes: criarPortaEquipes(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** Hotéis a partir do staging (fase 1a, A1): listar, importar e ativar, pelo hk_app. */
export const casosDeUsoDeHoteis = memo<CasosDeUsoDeHoteis>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeHoteis({
    hoteis: criarPortaHoteisDoStaging(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** Bandeiras (fase 1a, A2), pelo hk_app. */
export const casosDeUsoDeBandeiras = memo<CasosDeUsoDeBandeiras>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeBandeiras({
    bandeiras: criarPortaBandeiras(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** Fornecedores do grupo (fase 1b, I3), pelo hk_app. */
export const casosDeUsoDeFornecedores = memo<CasosDeUsoDeFornecedores>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeFornecedores({
    fornecedores: criarPortaFornecedores(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** Gestão de membros (fase 1a, A3): lista, desativação e validade, pelo hk_app. */
/** Proprietários e vínculos (fase 1a, A4; ADR-031), pelo hk_app. */
export const casosDeUsoDeProprietarios = memo<CasosDeUsoDeProprietarios>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeProprietarios({
    proprietarios: criarPortaProprietarios(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

export const casosDeUsoDeMembros = memo<CasosDeUsoDeMembros>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeMembros({
    membros: criarPortaMembros(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** Configuração do tenant e do hotel e políticas (fase 1a, A7; ADR-026), pelo hk_app. */
export const casosDeUsoDeConfiguracao = memo<CasosDeUsoDeConfiguracao>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeConfiguracao({
    configuracao: criarPortaConfiguracao(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
    politicas: criarPoliticasDoTenant({
      registros: registrosDePoliticas,
      modulos: criarPortaModulos(banco),
      relogio: relogioDoSistema,
    }),
  });
});

/** Painel de implantação do hotel (fase 1a, A5), pelo hk_app. */
export const casosDeUsoDeImplantacao = memo<CasosDeUsoDeImplantacao>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeImplantacao({
    implantacao: criarPortaImplantacao(banco),
    membros: criarPortaMembros(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** Locais do hotel (fase 1a, B1), pelo hk_app. */
export const casosDeUsoDeLocais = memo<CasosDeUsoDeLocais>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeLocais({
    locais: criarPortaLocais(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** Categorias de ativo (fase 1a, B2; ADR-028), pelo hk_app. */
export const casosDeUsoDeCategorias = memo<CasosDeUsoDeCategorias>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeCategorias({
    categorias: criarPortaCategorias(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** Códigos de falha, causa e solução (fase 1b, I6), pelo hk_app. */
export const casosDeUsoDeCodigos = memo<CasosDeUsoDeCodigos>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeCodigos({
    codigos: criarPortaCodigos(banco),
    categorias: criarPortaCategorias(banco),
    triagem: criarPortaTriagem(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** Checklist tipado (fase 1b, PV1; ADR-040), pelo hk_app. */
export const casosDeUsoDeChecklists = memo<CasosDeUsoDeChecklists>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeChecklists({
    checklists: criarPortaChecklists(banco),
    triagem: criarPortaTriagem(banco),
    execucao: criarPortaExecucao(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** Planos preventivos (fase 1b, PV2; ADR-041), pelo hk_app. */
export const casosDeUsoDePlanosPreventivos = memo<CasosDeUsoDePlanosPreventivos>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDePlanosPreventivos({
    planos: criarPortaPlanosPreventivos(banco),
    triagem: criarPortaTriagem(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** Situações e prioridades do tenant (fase 1a, C1; ADR-027), pelo hk_app. */
export const casosDeUsoDeSituacoes = memo<CasosDeUsoDeSituacoes>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeSituacoes({
    situacoes: criarPortaSituacoes(banco),
    prioridades: criarPortaPrioridades(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** Feriados oficiais do calendário de SLA (1c, ADR-042): um por instância, com o cache dos anos. */
const feriadosOficiais = criarFeriadosOficiais();

/** Chamados (fase 1a, C2), pelo hk_app. */
export const casosDeUsoDeChamados = memo<CasosDeUsoDeChamados>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeChamados({
    chamados: criarPortaChamados(banco),
    situacoes: criarPortaSituacoes(banco),
    prioridades: criarPortaPrioridades(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
    feriadosOficiais,
  });
});

/** Triagem e OS (fase 1a, C3; ADR-027, ADR-029), pelo hk_app. */
export const casosDeUsoDeTriagem = memo<CasosDeUsoDeTriagem>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeTriagem({
    triagem: criarPortaTriagem(banco),
    situacoes: criarPortaSituacoes(banco),
    prioridades: criarPortaPrioridades(banco),
    codigos: criarPortaCodigos(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
    feriadosOficiais,
  });
});

/** Execução da OS pelo Técnico (fase 1a, C4; ADR-025), pelo hk_app. */
export const casosDeUsoDeExecucao = memo<CasosDeUsoDeExecucao>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeExecucao({
    execucao: criarPortaExecucao(banco),
    triagem: criarPortaTriagem(banco),
    situacoes: criarPortaSituacoes(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
    paradas: criarPortaParadas(banco),
    uh: criarPortaUhIndisponivel(banco),
    codigos: criarPortaCodigos(banco),
    checklists: criarPortaChecklists(banco),
    prioridades: criarPortaPrioridades(banco),
    feriadosOficiais,
  });
});

/** Listas de chamados e OS, nomes do detalhe e linha do tempo (fase 1a, C7), pelo hk_app. */
export const casosDeUsoDeConsultas = memo<CasosDeUsoDeConsultas>(async () =>
  criarCasosDeUsoDeConsultas({ consultas: criarPortaConsultasDaCorretiva(await acessoBanco()) }),
);

/** Histórico de hotel, local, ativo, chamado e OS (fase 1a, D1), pelo hk_app. */
export const casosDeUsoDeHistorico = memo<CasosDeUsoDeHistorico>(async () =>
  criarCasosDeUsoDeHistorico({ historico: criarPortaHistorico(await acessoBanco()) }),
);

/** Auditoria geral (fase 1c), pelo hk_app: a gestão, no escopo da RLS de app.auditoria. */
export const casosDeUsoDeAuditoriaGeral = memo<CasosDeUsoDeAuditoriaGeral>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeAuditoriaGeral({
    auditoria: criarPortaAuditoriaGeral(banco),
    historico: criarPortaHistorico(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** Parada do equipamento pelo web (fase 1a, C5): a lista do ativo e o encerramento. */
export const casosDeUsoDeParadas = memo<CasosDeUsoDeParadas>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeParadas({
    paradas: criarPortaParadas(banco),
    ativos: criarPortaAtivos(banco),
    triagem: criarPortaTriagem(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** UH indisponível pelo web (fase 1b, I4): os períodos do chamado, a marcação e a liberação. */
export const casosDeUsoDeUhIndisponivel = memo<CasosDeUsoDeUhIndisponivel>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeUhIndisponivel({
    uh: criarPortaUhIndisponivel(banco),
    chamados: criarPortaChamados(banco),
    triagem: criarPortaTriagem(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** Ativos do hotel (fase 1a, B3; ADR-029), pelo hk_app. */
export const casosDeUsoDeAtivos = memo<CasosDeUsoDeAtivos>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeAtivos({
    ativos: criarPortaAtivos(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
  });
});

/** Idioma e região do próprio usuário (F0-10b), pelo hk_app. */
export const casosDeUsoDePreferencias = memo<CasosDeUsoDePreferencias>(async () =>
  criarCasosDeUsoDePreferencias({ preferencias: criarPortaPreferencias(await acessoBanco()) }),
);

/** Operações offline do PWA do técnico (F0-11, ADR-025), pelo hk_app. */
export const casosDeUsoDeSincronizacao = memo<CasosDeUsoDeSincronizacao>(async () =>
  criarCasosDeUsoDeSincronizacao({
    operacoes: criarPortaOperacoesOffline(await acessoBanco()),
    ativos: await casosDeUsoDeAtivos(),
    chamados: await casosDeUsoDeChamados(),
    execucao: await casosDeUsoDeExecucao(),
    checklists: await casosDeUsoDeChecklists(),
  }),
);

let manipuladores: Record<string, Manipulador> | undefined;
/** Processa o outbox de um tenant (hk_worker); a rota /api/cron/outbox chama para todos. */
export async function processarOutboxDoTenant(tenantId: string): Promise<ResultadoOutbox> {
  manipuladores ??= criarManipuladoresDeEventos(administracaoDoAuth());
  return processarOutbox(await acessoBancoDoWorker(), tenantId, manipuladores);
}

let verificador: VerificadorDeToken | undefined;
export const verificadorDeToken = () => (verificador ??= criarVerificadorJwks(urlSupabase()));
