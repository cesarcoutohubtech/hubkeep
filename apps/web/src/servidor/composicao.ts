// Raiz de composição do servidor: cria uma vez, por instância de função, o
// acesso ao banco, o verificador de token e os casos de uso. Único ponto do app
// que lê as variáveis de ambiente do servidor.
import {
  criarAdministracaoDoAuth,
  criarAdministracaoDoSegundoFator,
  criarArmazenamentoDeAnexos,
} from '@hubkeep/auth-admin';
import {
  type CasoDeUsoDeConvites,
  type CasoDeUsoDoSegundoFator,
  type CasosDeUsoDeAnexos,
  type CasosDeUsoDeAtivos,
  type CasosDeUsoDeCategorias,
  type CasosDeUsoDeChamados,
  type CasosDeUsoDeChecklists,
  type CasosDeUsoDeModelosDeAtivo,
  type CasosDeUsoDePlanosPreventivos,
  type CasosDeUsoDeSugestoesDePlano,
  type CasosDeUsoDeCadastrosDeAtivos,
  type CasosDeUsoDeImportacaoDeAtivos,
  type CasosDeUsoDeQrReservados,
  type CasosDeUsoDoPacoteDaBandeira,
  type CasosDeUsoDeCodigos,
  type CasosDeUsoDeTriagem,
  type CasosDeUsoDeExecucao,
  type CasosDeUsoDeParadas,
  type CasosDeUsoDeUhIndisponivel,
  type CasosDeUsoDeConsultas,
  type CasosDeUsoDeAuditoriaGeral,
  type CasosDeUsoDeAvisosDeSla,
  type CasosDeUsoDaSituacaoPorHotel,
  type CasosDeUsoDeIndicadores,
  type CasosDeUsoDeComunicacao,
  type CasosDeUsoDePush,
  type CasosDeUsoDeHistorico,
  type CasosDeUsoDeSituacoes,
  type CasosDeUsoDeConfiguracao,
  type CasosDeUsoDeEquipes,
  type CasosDeUsoDeFeriados,
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
  criarCasoDeUsoDoSegundoFator,
  criarCasosDeUsoDeAnexos,
  criarMonitorDeSla,
  criarAceiteAutomatico,
  criarGeracaoDePreventivas,
  criarCasosDeUsoDeIngestao,
  criarCasosDeUsoDePush,
  criarManipuladoresDeEventos,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import {
  type AcessoBanco,
  type Contexto,
  type ResultadoOutbox,
  criarAcessoBanco,
  criarPortaStatusAdministrativoMews,
  criarPortaCandidatosHoteisMews,
  criarPortaComunicacao,
  criarPortaInscricoesPush,
  criarPortaMonitorDeSla,
  criarPortaAceiteAutomatico,
  criarPortaGeracaoPreventiva,
  criarPortaDoJobDoIntelligence,
  criarPortaDoPainelDoIntelligence,
  criarPortaConfiguracao,
  criarPortaModulos,
  criarPortaAnexos,
  criarPortaEscopoDeAnexo,
  criarPortaMembros,
  criarPortasDeAplicacao,
  criarPortasDeIngestao,
  criptografiaDoServidor,
  novoId,
  processarOutbox,
  conferirAlvoDoBanco,
  tlsDaConexao,
} from '@hubkeep/db';
import { registrosDePoliticasPorModulo } from '@hubkeep/dominio';
import { criarFabricas } from './fabricas';
import { criarFeriadosOficiais } from './feriados-oficiais';
import { criarVerificadorJwks } from './identidade';
import { registrarNoConsole } from './log';
import { montarInteligencia } from './modulos/inteligencia';
import { enviadorDePushDoAmbiente } from './push';
import { resumirGeracao } from './resumo-da-geracao';
import { enviarCheckInAoSentry, relatarAoSentry } from './sentry';

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

/** Feriados oficiais do calendário de SLA (1c, ADR-042): um por instância, com o cache dos anos. */
const feriadosOficiais = criarFeriadosOficiais();

// A fiação dos casos de uso do hk_app (fabricas.ts), sempre com o relógio do
// sistema: o web em funcionamento não tem como trocá-lo. O relógio do roteiro
// fica só na montagem do gerador do histórico, fora de src
// (tests/relogio-do-roteiro-fora-do-web.test.ts).
const fabricas = memo(async () =>
  criarFabricas({
    banco: await acessoBanco(),
    relogio: relogioDoSistema,
    feriadosOficiais,
    registrosDePoliticas,
  }),
);

let auth: ReturnType<typeof criarAdministracaoDoAuth> | undefined;
const administracaoDoAuth = () => (auth ??= criarAdministracaoDoAuth({ url: urlSupabase() }));

/** As atribuições do usuário no tenant do contexto, para o portão do segundo fator (SP1). */
export const atribuicoesDoUsuario = async (ctx: Contexto) =>
  criarPortasDeAplicacao(await acessoBanco()).atribuicoes.doUsuario(ctx);

export const casosDeUsoDePapeis = async (): Promise<CasosDeUsoDePapeis> =>
  (await fabricas()).papeis();

export const casoDeUsoDeConvites = memo<CasoDeUsoDeConvites>(async () =>
  criarCasoDeUsoDeConvites({
    papeis: await casosDeUsoDePapeis(),
    convites: criarPortasDeAplicacao(await acessoBanco()).convites,
    identidade: administracaoDoAuth().identidade,
  }),
);

/** Remoção do segundo fator pelo Admin do grupo (SP1, ADR-049 e adendo ao ADR-024). */
export const casoDeUsoDoSegundoFator = memo<CasoDeUsoDoSegundoFator>(async () => {
  const banco = await acessoBanco();
  return criarCasoDeUsoDoSegundoFator({
    membros: criarPortaMembros(banco),
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    segundoFator: criarAdministracaoDoSegundoFator({ url: urlSupabase() }),
    relogio: relogioDoSistema,
  });
});

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
 * O monitor de SLA num tenant (hk_worker, 1c, ADR-043); a rota /api/cron/sla
 * chama para todos, a cada 5 minutos.
 */
export async function monitorarSlaDoTenant(tenantId: string) {
  return criarMonitorDeSla({
    monitor: criarPortaMonitorDeSla(await acessoBancoDoWorker()),
    feriadosOficiais,
    relogio: relogioDoSistema,
  })(tenantId);
}

/**
 * O aceite automático num tenant (hk_worker, 1c, M5; ADR-044); a rota
 * /api/cron/sla chama depois do monitor, numa transação própria.
 */
export async function aceitarAutomaticamenteNoTenant(tenantId: string) {
  return criarAceiteAutomatico({
    aceite: criarPortaAceiteAutomatico(await acessoBancoDoWorker()),
    relogio: relogioDoSistema,
  })(tenantId);
}

/**
 * A geração da OS preventiva num tenant (hk_worker, 1b, PV3; ADR-041); a rota
 * /api/cron/preventiva chama para todos, uma vez por dia. Cada hotel ativo
 * gera na transação dele, no dia do fuso do hotel; o hotel que falha vai para
 * o log e para o Sentry, e a rota soma os números.
 */
export async function gerarPreventivasDoTenant(tenantId: string) {
  const r = await criarGeracaoDePreventivas({
    geracao: criarPortaGeracaoPreventiva(await acessoBancoDoWorker()),
    relogio: relogioDoSistema,
  })(tenantId);
  return resumirGeracao(tenantId, r, { registrar: registrarNoConsole, relatar: relatarAoSentry });
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
    // Abrir chamado a partir da reclamação: o caso de uso do núcleo, como ele é.
    chamados: { abrir: async (ctx, pedido) => (await casosDeUsoDeChamados()).abrir(ctx, pedido) },
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
export const casosDeUsoDeEquipes = async (): Promise<CasosDeUsoDeEquipes> =>
  (await fabricas()).equipes();

/** Feriados do hotel (1c, ADR-042), pelo hk_app. */
export const casosDeUsoDeFeriados = async (): Promise<CasosDeUsoDeFeriados> =>
  (await fabricas()).feriados();

/** Hotéis a partir do staging (fase 1a, A1): listar, importar e ativar, pelo hk_app. */
export const casosDeUsoDeHoteis = async (): Promise<CasosDeUsoDeHoteis> =>
  (await fabricas()).hoteis();

/** Bandeiras (fase 1a, A2), pelo hk_app. */
export const casosDeUsoDeBandeiras = async (): Promise<CasosDeUsoDeBandeiras> =>
  (await fabricas()).bandeiras();

/** Fornecedores do grupo (fase 1b, I3), pelo hk_app. */
export const casosDeUsoDeFornecedores = async (): Promise<CasosDeUsoDeFornecedores> =>
  (await fabricas()).fornecedores();

/** Gestão de membros (fase 1a, A3): lista, desativação e validade, pelo hk_app. */
/** Proprietários e vínculos (fase 1a, A4; ADR-031), pelo hk_app. */
export const casosDeUsoDeProprietarios = async (): Promise<CasosDeUsoDeProprietarios> =>
  (await fabricas()).proprietarios();

export const casosDeUsoDeMembros = async (): Promise<CasosDeUsoDeMembros> =>
  (await fabricas()).membros();

/** Configuração do tenant e do hotel e políticas (fase 1a, A7; ADR-026), pelo hk_app. */
export const casosDeUsoDeConfiguracao = async (): Promise<CasosDeUsoDeConfiguracao> =>
  (await fabricas()).configuracao();

/** Painel de implantação do hotel (fase 1a, A5), pelo hk_app. */
export const casosDeUsoDeImplantacao = async (): Promise<CasosDeUsoDeImplantacao> =>
  (await fabricas()).implantacao();

/** Locais do hotel (fase 1a, B1), pelo hk_app. */
export const casosDeUsoDeLocais = async (): Promise<CasosDeUsoDeLocais> =>
  (await fabricas()).locais();

/** Categorias de ativo (fase 1a, B2; ADR-028), pelo hk_app. */
export const casosDeUsoDeCategorias = async (): Promise<CasosDeUsoDeCategorias> =>
  (await fabricas()).categorias();

/** Códigos de falha, causa e solução (fase 1b, I6), pelo hk_app. */
export const casosDeUsoDeCodigos = async (): Promise<CasosDeUsoDeCodigos> =>
  (await fabricas()).codigos();

/** Checklist tipado (fase 1b, PV1; ADR-040), pelo hk_app. */
export const casosDeUsoDeChecklists = async (): Promise<CasosDeUsoDeChecklists> =>
  (await fabricas()).checklists();

/** Modelos de ativo por categoria (fase 1b, M1), pelo hk_app. */
export const casosDeUsoDeModelosDeAtivo = async (): Promise<CasosDeUsoDeModelosDeAtivo> =>
  (await fabricas()).modelosDeAtivo();

/** Planos preventivos (fase 1b, PV2; ADR-041), pelo hk_app. */
export const casosDeUsoDePlanosPreventivos = async (): Promise<CasosDeUsoDePlanosPreventivos> =>
  (await fabricas()).planosPreventivos();

/** Aprovação do cadastro dos ativos (fase 1b, M4), pelo hk_app. */
export const casosDeUsoDeCadastrosDeAtivos = async (): Promise<CasosDeUsoDeCadastrosDeAtivos> =>
  (await fabricas()).cadastrosDeAtivos();

/** Importação de ativos por planilha (fase 1b, M2), pelo hk_app. */
export const casosDeUsoDeImportacaoDeAtivos = async (): Promise<CasosDeUsoDeImportacaoDeAtivos> =>
  (await fabricas()).importacaoDeAtivos();

/** Códigos de QR reservados (fase 1b, M3), pelo hk_app. */
export const casosDeUsoDeQrReservados = async (): Promise<CasosDeUsoDeQrReservados> =>
  (await fabricas()).qrReservados();

/** Pacote da bandeira (fase 1b, PB1), pelo hk_app. */
export const casosDeUsoDoPacoteDaBandeira = async (): Promise<CasosDeUsoDoPacoteDaBandeira> =>
  (await fabricas()).pacoteDaBandeira();

/** Sugestões de plano (fase 1b, M1, caminho C), pelo hk_app. */
export const casosDeUsoDeSugestoesDePlano = async (): Promise<CasosDeUsoDeSugestoesDePlano> =>
  (await fabricas()).sugestoesDePlano();

/** Situações e prioridades do tenant (fase 1a, C1; ADR-027), pelo hk_app. */
export const casosDeUsoDeSituacoes = async (): Promise<CasosDeUsoDeSituacoes> =>
  (await fabricas()).situacoes();

/** Chamados (fase 1a, C2), pelo hk_app. */
export const casosDeUsoDeChamados = async (): Promise<CasosDeUsoDeChamados> =>
  (await fabricas()).chamados();

/** Triagem e OS (fase 1a, C3; ADR-027, ADR-029), pelo hk_app. */
export const casosDeUsoDeTriagem = async (): Promise<CasosDeUsoDeTriagem> =>
  (await fabricas()).triagem();

/** Execução da OS pelo Técnico (fase 1a, C4; ADR-025), pelo hk_app. */
export const casosDeUsoDeExecucao = async (): Promise<CasosDeUsoDeExecucao> =>
  (await fabricas()).execucao();

/** Listas de chamados e OS, nomes do detalhe e linha do tempo (fase 1a, C7), pelo hk_app. */
export const casosDeUsoDeConsultas = async (): Promise<CasosDeUsoDeConsultas> =>
  (await fabricas()).consultas();

/** Histórico de hotel, local, ativo, chamado e OS (fase 1a, D1), pelo hk_app. */
export const casosDeUsoDeHistorico = async (): Promise<CasosDeUsoDeHistorico> =>
  (await fabricas()).historico();

/** Auditoria geral (fase 1c), pelo hk_app: a gestão, no escopo da RLS de app.auditoria. */
export const casosDeUsoDeAuditoriaGeral = async (): Promise<CasosDeUsoDeAuditoriaGeral> =>
  (await fabricas()).auditoriaGeral();

/** Avisos de SLA em aberto (1c, ADR-043, M4), pelo hk_app: o painel do hotel e o selo da ficha. */
export const casosDeUsoDeAvisosDeSla = async (): Promise<CasosDeUsoDeAvisosDeSla> =>
  (await fabricas()).avisosDeSla();

/** Painel de indicadores (1c, item 8), pelo hk_app: a gestão vê tudo; o proprietário, os cartões. */
export const casosDeUsoDeIndicadores = async (): Promise<CasosDeUsoDeIndicadores> =>
  (await fabricas()).indicadores();
/** A situação por hotel da tela inicial (1c, seção 4 da paridade), pelo hk_app: só a gestão. */
export const casosDeUsoDaSituacaoPorHotel = async (): Promise<CasosDeUsoDaSituacaoPorHotel> =>
  (await fabricas()).situacaoPorHotel();
/** A contagem de envios por destinatário e por dia (1c, C8), pelo hk_app. */
export const casosDeUsoDeComunicacao = async (): Promise<CasosDeUsoDeComunicacao> =>
  (await fabricas()).comunicacao();

let push: CasosDeUsoDePush | undefined;
/**
 * O push do PWA (1c, C4), pelo hk_app: a chave pública e as inscrições do
 * próprio aparelho. A chave só vale com o enviador ligado (as duas chaves e o
 * site em https).
 */
export const casosDeUsoDePush = async (): Promise<CasosDeUsoDePush> => {
  if (push) return push;
  const chaves = chavesDoPush();
  push = criarCasosDeUsoDePush({
    inscricoes: criarPortaInscricoesPush(await acessoBanco()),
    chavePublica: enviadorDePushDoAmbiente(chaves) ? (chaves.publica ?? null) : null,
  });
  return push;
};

/** Parada do equipamento pelo web (fase 1a, C5): a lista do ativo e o encerramento. */
export const casosDeUsoDeParadas = async (): Promise<CasosDeUsoDeParadas> =>
  (await fabricas()).paradas();

/** UH indisponível pelo web (fase 1b, I4): os períodos do chamado, a marcação e a liberação. */
export const casosDeUsoDeUhIndisponivel = async (): Promise<CasosDeUsoDeUhIndisponivel> =>
  (await fabricas()).uhIndisponivel();

/** Ativos do hotel (fase 1a, B3; ADR-029), pelo hk_app. */
export const casosDeUsoDeAtivos = async (): Promise<CasosDeUsoDeAtivos> =>
  (await fabricas()).ativos();

/** Idioma e região do próprio usuário (F0-10b), pelo hk_app. */
export const casosDeUsoDePreferencias = async (): Promise<CasosDeUsoDePreferencias> =>
  (await fabricas()).preferencias();

/** Operações offline do PWA do técnico (F0-11, ADR-025), pelo hk_app. */
export const casosDeUsoDeSincronizacao = async (): Promise<CasosDeUsoDeSincronizacao> =>
  (await fabricas()).sincronizacao();

let manipuladores: Record<string, Manipulador> | undefined;
const urlDoSite = () => (process.env['HK_URL_SITE'] ?? '').replace(/\/+$/, '');

/** As chaves VAPID do push (C4); sem as duas, o push fica desligado (C1). */
const chavesDoPush = () => ({
  publica: process.env['WEB_PUSH_VAPID_PUBLIC_KEY'] || undefined,
  privada: process.env['WEB_PUSH_VAPID_PRIVATE_KEY'] || undefined,
  site: urlDoSite(),
});

/**
 * Processa o outbox de um tenant (hk_worker); a rota /api/cron/outbox chama
 * para todos. O aviso de SLA e a OS atribuída vão pela comunicação (1c,
 * ADR-046). O e-mail está desligado (C1): até o Cesar configurar o SES, cada
 * envio fica registrado como sem_provedor, e nada sai. O push sai com as
 * chaves VAPID do ambiente; sem elas, também fica como sem_provedor.
 */
export async function processarOutboxDoTenant(tenantId: string): Promise<ResultadoOutbox> {
  const banco = await acessoBancoDoWorker();
  manipuladores ??= criarManipuladoresDeEventos({
    ...administracaoDoAuth(),
    comunicacao: {
      porta: criarPortaComunicacao(banco),
      email: null,
      push: enviadorDePushDoAmbiente(chavesDoPush()),
      urlDoSite: urlDoSite(),
      relogio: relogioDoSistema,
    },
  });
  return processarOutbox(banco, tenantId, manipuladores);
}

let verificador: VerificadorDeToken | undefined;
export const verificadorDeToken = () => (verificador ??= criarVerificadorJwks(urlSupabase()));

/** Estado Mews V1: somente leitura para Admin do grupo, sem job ou credenciais. */
export const statusAdministrativoMews = memo(async () =>
  criarPortaStatusAdministrativoMews(await acessoBanco()),
);

/** Candidatos a hotel de demonstração, sem gravações, só Admin do grupo. */
export const candidatosHoteisMews = memo(async () =>
  criarPortaCandidatosHoteisMews(await acessoBanco()),
);
