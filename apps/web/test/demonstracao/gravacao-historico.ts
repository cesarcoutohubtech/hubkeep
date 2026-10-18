// A gravação do histórico de demonstração do Intelligence (atividade 3;
// proposta e decisões de Cesar e Kaio em docs/diario-intelligence.md,
// 13/10/2026): o roteiro de historico-inteligencia.ts entra no banco pelos
// casos de uso, com o relógio do roteiro (montagem-com-relogio.ts, da 1b), e o
// job de cada dia e as decisões das pessoas rodam por cima, como em produção.
//
// - O grupo é próprio ("Grupo Demonstração — Intelligence"). O tenant, o
//   contrato de licença e o módulo `inteligencia` entram pelo dono, antes do
//   kit, como o passo 1 do kit; a base (o primeiro Admin e as pessoas) é a do
//   kit (semearDemonstracao), sem mudar o kit.
// - Hotéis e UHs chegam pelo caminho do conector, como no kit; os cadastros
//   ficam com o relógio do banco. Os ativos nascem antes do primeiro chamado,
//   com a data do roteiro.
// - Quem faz cada passo: a Solicitante abre, a Admin faz a triagem, encerra a
//   parada e decide os insights, o Técnico executa e o Gerente aceita e reabre
//   (ponto 3; com a Admin, a regra do aceite recusaria: ela só aceita quando
//   quem abriu executou e o hotel não tem outro Gerente, corretiva.ts). Os três
//   do kit ganham o papel em cada hotel do roteiro.
// - Cada dia: as operações até o instante do job, o job do dia nesse instante
//   (instanteDoJob, ponto 4) e as decisões que vencem no dia, logo depois.
// - Rodar de novo com o mesmo fim não duplica nada: as operações do Técnico e
//   a abertura têm chave fixa, a triagem e o aceite conferem o estado, o job
//   não roda de novo num dia já gravado e a decisão já tomada é pulada. Com
//   outro fim, a gravação recusa antes de gravar. A retomada recomeça do
//   último dia gravado, sem consultar de novo as operações de antes dele.
// - Se a conexão cair, a operação tenta de novo, com espera crescente
//   (tentar-de-novo.ts); se todas as tentativas caírem, a gravação para e diz
//   como continuar (Kaio, 15/10/2026).
// - As reclamações de hóspede (ADR-047): cada lote semanal do roteiro vira o
//   CSV do HubKeep, lido como a tela lê (lerCsvDeSinais) e importado pela
//   Admin; a classificação do lote passa pelo caso de uso, reclamação por
//   reclamação. Rodar de novo não duplica: a mesma avaliação entra uma vez, e
//   só a que está na fila é classificada.
// - Nunca roda na Vercel nem em produção: a montagem e os acessos próprios do
//   job e do painel passam pela mesma trava (conferirAlvoDaMontagem).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LoteRecebido, OperacaoOffline } from '@hubkeep/aplicacao';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaConfiguracao,
  criarPortaDoJobDoIntelligence,
  criarPortaDoPainelDoIntelligence,
  criarPortaModulos,
  criarPortasDeAplicacao,
  novoId,
  tlsDaConexao,
} from '@hubkeep/db';
import { Conflito, type Contexto, registrosDePoliticasPorModulo } from '@hubkeep/dominio';
import { DIA_MS, TRANSICOES_DO_INSIGHT, diaNoFuso } from '@hubkeep/inteligencia';
import pg from 'pg';
import {
  casosDeUsoDeMembros,
  casosDeUsoDePapeis,
  credenciaisDeAgente,
  promoverUhsDoTenant,
  recebimentoDeLotes,
} from '../../src/servidor/composicao';
import { lerCsvDeSinais } from '../../src/app/(painel)/inteligencia/sinais/csv';
import { montarInteligencia } from '../../src/servidor/modulos/inteligencia';
import {
  type ChamadoDoRoteiro,
  DOMINIO_DO_GRUPO,
  FUSO_DO_HISTORICO,
  MOMENTO_DO_JOB,
  type MomentoDoJob,
  NOME_DO_GRUPO,
  type LoteDeReclamacoes,
  type RoteiroDoHistorico,
  type VolumeDoHistorico,
  cenarioDoInsight,
  csvDoLote,
  decisoesDoDia,
  instanteDoJob,
  roteiroDoHistorico,
} from './historico-inteligencia';
import { comNovaTentativa } from './tentar-de-novo';
import { conferirAlvoDaMontagem, montarComRelogio, refDoRemoto } from './montagem-com-relogio';

type Ambiente = Readonly<Record<string, string | undefined>>;

/** UUID fixo a partir de um nome, como no kit: a mesma chave a cada execução. */
function idFixo(base: string, nome: string): string {
  const h = createHash('sha256').update(`${base}:${nome}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Tenant fixo do grupo do histórico: rodar de novo cai no mesmo grupo. */
export const TENANT_DO_HISTORICO = idFixo('hubkeep', 'historico-inteligencia');
const FONTE = 'planilha';
/** Hotéis e UHs do kit, que também ficam no grupo (semear.ts). */
const HOTEIS_DO_KIT = 3;
const UHS_DO_KIT = 40;
const CONFIG_TOML = join(import.meta.dirname, '..', '..', '..', '..', 'supabase', 'config.toml');

/** As quatro pessoas do kit que o histórico usa. */
export interface PessoasDoHistorico {
  admin: string;
  gerente: string;
  tecnico: string;
  solicitante: string;
}

/**
 * A base do grupo: as pessoas, depois do tenant e do contrato. Na gravação de
 * verdade é o kit (baseDoKit); o teste pode trocar.
 */
export type BaseDoHistorico = (p: {
  tenantId: string;
  dominio: string;
  urlDono: string;
}) => Promise<PessoasDoHistorico>;

export interface OpcoesDaGravacao {
  /** O último dia do histórico, `AAAA-MM-DD`. */
  fim: string;
  volume?: VolumeDoHistorico;
  /** Dono do banco (postgres): o tenant, o contrato, o módulo e a conferência do fim. */
  urlDono: string;
  base: BaseDoHistorico;
  tenantId?: string;
  /** O domínio dos e-mails do kit; padrão, o do grupo. O teste usa um por execução. */
  dominio?: string;
  momento?: MomentoDoJob;
  /** As variáveis do ambiente (DATABASE_URL_APP, DATABASE_URL_WORKER); padrão, process.env. */
  ambiente?: Ambiente;
  configToml?: string;
  /** O instante real da gravação; o job nunca roda depois dele. Padrão: agora. */
  agoraReal?: Date;
  log?: (linha: string) => void;
}

export interface ResumoDaGravacao {
  tenantId: string;
  chamados: number;
  /** Dias em que o job rodou nesta execução (os já gravados ficam de fora). */
  diasCalculados: number;
  insightsAbertos: number;
  decisoes: number;
  /** Reclamações que entraram nesta execução (as repetidas ficam de fora). */
  reclamacoes: number;
  /** Reclamações classificadas nesta execução. */
  classificacoes: number;
  /** Os insights que nenhum cenário planta; o esperado é nenhum. */
  inesperados: string[];
  /** O estado de cada insight no fim, pelo cenário. */
  estados: Record<string, string>;
}

/** O fim padrão: o último dia cujo job, no momento escolhido, já rodou em `agora`. */
export function fimPadraoDoHistorico(agora: Date, momento: MomentoDoJob = MOMENTO_DO_JOB): string {
  let dia = diaIso(new Date(agora.getTime() - DIA_MS));
  while (instanteDoJob(dia, momento).getTime() > agora.getTime()) {
    dia = diaIso(new Date(Date.parse(`${dia}T00:00:00Z`) - DIA_MS));
  }
  return dia;
}

/** Erro antes de gravar: o fim pedido não é o do histórico que já está no grupo. */
export class FimDiferente extends Error {}

/** A base pelo kit (semear.ts): o primeiro Admin e as pessoas, com a senha de teste. */
export function baseDoKit(o: {
  senha: string;
  site?: string;
  log?: (linha: string) => void;
}): BaseDoHistorico {
  return async ({ tenantId, dominio, urlDono }) => {
    const { semearDemonstracao } = await import('./semear');
    const r = await semearDemonstracao({
      urlDono,
      senha: o.senha,
      tenantId,
      dominio,
      ...(o.site ? { site: o.site } : {}),
      ...(o.log ? { log: o.log } : {}),
    });
    return {
      admin: r.usuarios.admin.usuarioId,
      gerente: r.usuarios.gerenteCentro.usuarioId,
      tecnico: r.usuarios.tecnicoCentro.usuarioId,
      solicitante: r.usuarios.solicitante.usuarioId,
    };
  };
}

const conflito = (e: unknown, codigo: string) => e instanceof Conflito && e.codigo === codigo;
const diaIso = (d: Date) => d.toISOString().slice(0, 10);
const MINUTO_MS = 60_000;
/** De quantas em quantas operações a gravação escreve o progresso. */
const OPERACOES_POR_LINHA = 250;

type Evento =
  | { quando: Date; tipo: 'abrir'; chamado: ChamadoDoRoteiro }
  | { quando: Date; tipo: 'fim_da_parada'; chamado: ChamadoDoRoteiro }
  | { quando: Date; tipo: 'passo'; chamado: ChamadoDoRoteiro; indice: number };

type EventoDasReclamacoes = {
  quando: Date;
  tipo: 'importar' | 'classificar';
  lote: LoteDeReclamacoes;
};

/** A importação e a classificação de cada lote, em ordem de tempo. */
function eventosDasReclamacoes(r: RoteiroDoHistorico): EventoDasReclamacoes[] {
  return r.lotesDeReclamacoes
    .flatMap((lote): EventoDasReclamacoes[] => [
      { quando: lote.importadoEm, tipo: 'importar', lote },
      ...(lote.classificadoEm
        ? [{ quando: lote.classificadoEm, tipo: 'classificar' as const, lote }]
        : []),
    ])
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.quando.getTime() - b.e.quando.getTime() || a.i - b.i)
    .map((x) => x.e);
}

/** Os eventos do roteiro em ordem de tempo; no empate, a ordem do roteiro. */
function eventosDoRoteiro(r: RoteiroDoHistorico): Evento[] {
  const eventos: Evento[] = [];
  for (const c of r.chamados) {
    eventos.push({ quando: c.abertoEm, tipo: 'abrir', chamado: c });
    if (c.parada) eventos.push({ quando: c.parada.fim, tipo: 'fim_da_parada', chamado: c });
    c.os.passos.forEach((p, indice) =>
      eventos.push({ quando: p.quando, tipo: 'passo', chamado: c, indice }),
    );
  }
  return eventos
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.quando.getTime() - b.e.quando.getTime() || a.i - b.i)
    .map((x) => x.e);
}

/**
 * O plano da retomada a partir do corte (o job do último dia gravado): das
 * operações antes dele, as dos chamados já abertos no banco ficam puladas, com
 * o id de cada um, e as dos chamados que não estão no banco (os que o roteiro
 * ganhou depois da gravação) voltam em `faltam`, na ordem de tempo. A gravação
 * segue de `fim`.
 */
export function planoDaRetomada<
  E extends { quando: Date; tipo: string; chamado: { chave: string } },
>(
  eventos: readonly E[],
  corte: Date,
  idGravado: (chamado: E['chamado']) => string | undefined,
): { fim: number; ids: Map<string, string>; faltam: E[] } {
  let fim = 0;
  while (fim < eventos.length && (eventos[fim] as E).quando < corte) fim += 1;
  const ids = new Map<string, string>();
  const faltam: E[] = [];
  for (const e of eventos.slice(0, fim)) {
    const id = idGravado(e.chamado);
    if (id !== undefined) ids.set(e.chamado.chave, id);
    else faltam.push(e);
  }
  return { fim, ids, faltam };
}

/** Um acesso só do papel pedido, depois da mesma trava da montagem. */
async function acessoConferido(
  papel: 'app' | 'worker',
  url: string | undefined,
  ambiente: Ambiente,
  refsPermitidos: readonly string[],
): Promise<AcessoBanco> {
  const variavel = papel === 'app' ? 'DATABASE_URL_APP' : 'DATABASE_URL_WORKER';
  if (!url) throw new Error(`${variavel} não está definida.`);
  conferirAlvoDaMontagem({ ambiente, url, refsPermitidos });
  const cfg = { url, ssl: tlsDaConexao(url, ambiente['HK_BANCO_SEM_TLS'] === '1') };
  return criarAcessoBanco(papel === 'app' ? { app: cfg } : { worker: cfg });
}

export async function gravarHistorico(o: OpcoesDaGravacao): Promise<ResumoDaGravacao> {
  const ambiente = o.ambiente ?? process.env;
  const log = o.log ?? (() => undefined);
  const momento = o.momento ?? MOMENTO_DO_JOB;
  const tenantId = o.tenantId ?? TENANT_DO_HISTORICO;
  const r = roteiroDoHistorico({ fim: o.fim, ...(o.volume ? { volume: o.volume } : {}) });
  const instantes = r.dias.map((d) => instanteDoJob(d, momento));
  const agoraReal = o.agoraReal ?? new Date();
  const ultimo = instantes.at(-1) as Date;
  if (ultimo.getTime() > agoraReal.getTime()) {
    throw new Error(
      `O job do último dia (${o.fim}) rodaria em ${ultimo.toISOString()}, depois de agora. ` +
        'Escolha um fim mais antigo. Nada foi gravado.',
    );
  }
  const toml = o.configToml ?? readFileSync(CONFIG_TOML, 'utf8');
  const refs = (['dev', 'staging'] as const).flatMap((x) => refDoRemoto(toml, x) ?? []);
  // A trava antes de qualquer conexão, também para o dono.
  conferirAlvoDaMontagem({ ambiente, url: o.urlDono, refsPermitidos: refs });
  for (const v of ['DATABASE_URL_APP', 'DATABASE_URL_WORKER'] as const) {
    const url = ambiente[v];
    if (!url) throw new Error(`${v} não está definida.`);
    conferirAlvoDaMontagem({ ambiente, url, refsPermitidos: refs });
  }

  // 1. Pelo dono: o fim já gravado, o tenant, o contrato e o módulo.
  const uhsDoRoteiro = r.locais.filter((l) => l.tipo === 'uh').length;
  const primeiro = r.chamados[0];
  if (!primeiro) throw new Error('O roteiro não tem chamados.');
  const dono = new pg.Client({ connectionString: o.urlDono });
  await dono.connect();
  let ultimoDiaGravado: string | null;
  // A chave fixa da abertura de cada chamado já gravado e o id dele, para a
  // retomada pular sem consulta o que vem antes do último dia gravado.
  const aberturasGravadas = new Map<string, string>();
  try {
    const { rows } = await dono.query<{ criado_em: Date }>(
      `select c.criado_em from app.operacao_offline o
         join app.chamado c on c.tenant_id = o.tenant_id and c.id = (o.resposta->>'id')::uuid
        where o.tenant_id = $1 and o.chave = $2`,
      [tenantId, idFixo(tenantId, `chamado:${primeiro.chave}`)],
    );
    const gravado = rows[0]?.criado_em;
    if (gravado && gravado.getTime() !== primeiro.abertoEm.getTime()) {
      throw new FimDiferente(
        `O grupo já tem o histórico de outro fim (o primeiro chamado foi aberto em ` +
          `${gravado.toISOString()}, e o deste fim seria em ${primeiro.abertoEm.toISOString()}). ` +
          'Rode com o mesmo --fim. Nada foi gravado.',
      );
    }
    // O último dia da métrica já gravado: o job não roda de novo até ele.
    const { rows: dias } = await dono.query<{ dia: string | null }>(
      `select max(dia)::text as dia from app.metrica_ativo_diaria where tenant_id = $1`,
      [tenantId],
    );
    ultimoDiaGravado = dias[0]?.dia ?? null;
    if (ultimoDiaGravado !== null) {
      const { rows: abertas } = await dono.query<{ chave: string; id: string }>(
        `select chave::text as chave, resposta->>'id' as id from app.operacao_offline
          where tenant_id = $1 and tipo = 'chamado.abrir'`,
        [tenantId],
      );
      for (const a of abertas) aberturasGravadas.set(a.chave, a.id);
    }
    await dono.query(`insert into app.tenant (id, nome) values ($1, $2) on conflict do nothing`, [
      tenantId,
      NOME_DO_GRUPO,
    ]);
    await dono.query(
      `insert into licenca.contrato (tenant_id, max_hoteis, max_uhs, atualizado_por)
       values ($1, $2, $3, 'historico-inteligencia') on conflict (tenant_id) do nothing`,
      [tenantId, r.hoteis.length + HOTEIS_DO_KIT, uhsDoRoteiro + UHS_DO_KIT],
    );
    await dono.query(
      `insert into licenca.modulo (id, tenant_id, modulo, inicio, fim, atualizado_por)
       select $1, $2, 'inteligencia', $3, null, 'historico-inteligencia'
        where not exists (
          select 1 from licenca.modulo where tenant_id = $2 and modulo = 'inteligencia')`,
      [novoId(), tenantId, r.inicio],
    );
  } finally {
    await dono.end();
  }
  log(`Grupo ${tenantId}: contrato e módulo prontos.`);

  // 2. A base: o primeiro Admin e as pessoas do kit.
  const pessoas = await o.base({
    tenantId,
    dominio: o.dominio ?? DOMINIO_DO_GRUPO,
    urlDono: o.urlDono,
  });
  const ctx = (p: keyof PessoasDoHistorico): Contexto => ({ usuarioId: pessoas[p], tenantId });
  const admin = ctx('admin');

  // O relógio do roteiro: quem chama avança o instante entre as operações.
  let agora = r.inicioDosChamados;
  const relogio = { agora: () => agora };
  const montagem = await montarComRelogio({ relogio, ambiente, configToml: toml });
  const [worker, app] = await Promise.all([
    acessoConferido('worker', ambiente['DATABASE_URL_WORKER'], ambiente, refs),
    acessoConferido('app', ambiente['DATABASE_URL_APP'], ambiente, refs),
  ]);
  try {
    const casos = montagem.casos;
    const registros = registrosDePoliticasPorModulo(montarInteligencia().extensoesDePolitica);
    const inteligencia = montarInteligencia();
    const job = inteligencia.jobDoDia({
      porta: criarPortaDoJobDoIntelligence(worker),
      registros,
      relogio,
    });
    const painel = inteligencia.painel({
      porta: criarPortaDoPainelDoIntelligence(app),
      modulos: criarPortaModulos(app),
      atribuicoes: criarPortasDeAplicacao(app).atribuicoes,
      configuracao: criarPortaConfiguracao(app),
      relogio,
    });

    // 3. Hotéis e UHs pelo caminho do conector, como no kit.
    const chaveDoHotel = (h: string) => `HIST-${h.toUpperCase()}`;
    const credenciais = await credenciaisDeAgente();
    const credencial = await credenciais.criarCredencial(admin, 'Histórico do Intelligence');
    try {
      const lotes: LoteRecebido[] = [
        {
          fonte: FONTE,
          entidade: 'hotel',
          registros: r.hoteis.map((h) => ({
            chave: chaveDoHotel(h.chave),
            dados: { nome: h.nome, fuso: FUSO_DO_HISTORICO },
          })),
        },
        {
          fonte: FONTE,
          entidade: 'uh',
          registros: r.locais
            .filter((l) => l.tipo === 'uh')
            .map((l) => ({
              chave: `${chaveDoHotel(l.hotel)}-${l.nome.replace('UH ', '')}`,
              dados: { hotel: chaveDoHotel(l.hotel), nome: l.nome, andar: l.andar },
            })),
        },
      ];
      const recebimento = await recebimentoDeLotes();
      for (const lote of lotes) await recebimento.receberLote(credencial.credencial, lote);
    } finally {
      await credenciais.revogarCredencial(admin, credencial.id);
    }
    const hoteis = new Map<string, string>();
    for (const h of r.hoteis) {
      try {
        hoteis.set(
          h.chave,
          (await casos.hoteis.importarHotel(admin, { fonte: FONTE, chave: chaveDoHotel(h.chave) }))
            .hotelId,
        );
      } catch (e) {
        if (!conflito(e, 'hotel_ja_importado')) throw e;
        hoteis.set(h.chave, (e as Conflito).parametros['hotelId'] as string);
      }
      try {
        await casos.hoteis.ativarHotel(admin, hoteis.get(h.chave) as string);
      } catch (e) {
        if (!conflito(e, 'hotel_ja_ativo')) throw e;
      }
    }
    await promoverUhsDoTenant(tenantId);
    const hotel = (chave: string) => {
      const id = hoteis.get(chave);
      if (!id) throw new Error(`Hotel ${chave} do roteiro não encontrado.`);
      return id;
    };

    const bandeiras = new Map<string, string>();
    const existentes = await casos.bandeiras.listarBandeiras(admin);
    for (const b of r.bandeiras) {
      bandeiras.set(
        b.chave,
        existentes.find((x) => x.nome === b.nome)?.id ??
          (await casos.bandeiras.criarBandeira(admin, b.nome)).id,
      );
    }
    const papeis = await casosDeUsoDePapeis();
    const visiveis = await papeis.listarHoteisVisiveis(admin);
    for (const h of r.hoteis) {
      const bandeiraId = bandeiras.get(h.bandeira) as string;
      if (visiveis.find((v) => v.id === hotel(h.chave))?.bandeiraId !== bandeiraId) {
        await casos.bandeiras.definirBandeiraDoHotel(admin, hotel(h.chave), bandeiraId);
      }
    }

    const locais = new Map<string, string>();
    for (const h of r.hoteis) {
      const lista = await casos.locais.listarLocais(admin, hotel(h.chave));
      const porNome = new Map(lista.map((l) => [l.nome, l.id]));
      for (const l of r.locais.filter((x) => x.hotel === h.chave)) {
        let id = porNome.get(l.nome);
        if (!id && l.tipo === 'area_comum') {
          id = (await casos.locais.criarAreaComum(admin, hotel(h.chave), l.nome, null)).id;
        }
        if (!id) throw new Error(`Local ${l.nome} do hotel ${h.chave} não encontrado.`);
        locais.set(l.chave, id);
      }
    }
    log(`Hotéis e locais prontos: ${r.hoteis.length} hotéis, ${locais.size} locais.`);

    // 4. Papéis das três pessoas do kit em cada hotel do roteiro.
    const membros = await (await casosDeUsoDeMembros()).listarMembros(admin);
    const temPapel = (usuarioId: string, papel: string, hotelId: string) =>
      membros.some(
        (m) =>
          m.usuarioId === usuarioId &&
          m.atribuicoes.some(
            (a) =>
              a.papel === papel &&
              a.revogadoEm === null &&
              a.escopo.tipo === 'hotel' &&
              a.escopo.hotelId === hotelId,
          ),
      );
    const papeisDoRoteiro = [
      ['solicitante', 'solicitante'],
      ['tecnico', 'tecnico'],
      ['gerente', 'gerente_hotel'],
    ] as const;
    for (const h of r.hoteis) {
      for (const [p, papel] of papeisDoRoteiro) {
        if (temPapel(pessoas[p], papel, hotel(h.chave))) continue;
        await papeis.concederPapel(admin, {
          usuarioId: pessoas[p],
          papel,
          escopo: { tipo: 'hotel', hotelId: hotel(h.chave) },
          validoAte: null,
        });
      }
    }

    // 5. Categorias, códigos de falha, fornecedores e as políticas do Intelligence.
    const { categorias } = await casos.categorias.listarCategorias(admin);
    const categoria = (chave: string) => {
      const id = categorias.find((c) => c.chavePadrao === chave)?.id;
      if (!id) throw new Error(`Categoria padrão ${chave} não encontrada.`);
      return id;
    };
    const { codigos } = await casos.codigos.listarCodigos(admin);
    const codigosDoRoteiro = new Map<string, string>();
    for (const c of r.codigosDeFalha) {
      const achado = codigos.find((x) => x.tipo === 'falha' && x.nomes['pt-BR'] === c.nome);
      codigosDoRoteiro.set(
        c.chave,
        achado?.id ??
          (
            await casos.codigos.criarCodigo(admin, {
              tipo: 'falha',
              categoriaId: null,
              nomes: { 'pt-BR': c.nome },
            })
          ).id,
      );
    }
    // Os códigos de solução do roteiro (a troca do equipamento da modernização)
    // são os padrão, pela chave: sem eles no grupo, instala os padrão.
    const chavesDeSolucao = new Set(
      r.chamados.flatMap((c) => (c.os.codigoSolucao ? [c.os.codigoSolucao] : [])),
    );
    let comSolucao = codigos;
    if ([...chavesDeSolucao].some((k) => !comSolucao.some((x) => x.chavePadrao === k))) {
      await casos.codigos.instalarCodigosPadrao(admin);
      comSolucao = (await casos.codigos.listarCodigos(admin)).codigos;
    }
    const solucoes = new Map<string, string>();
    for (const k of chavesDeSolucao) {
      const id = comSolucao.find((x) => x.tipo === 'solucao' && x.chavePadrao === k)?.id;
      if (!id) throw new Error(`Código de solução padrão ${k} não encontrado.`);
      solucoes.set(k, id);
    }
    const fornecedoresGravados = await casos.fornecedores.listar(admin);
    const fornecedores = new Map<string, string>();
    for (const f of r.fornecedores) {
      fornecedores.set(
        f.chave,
        fornecedoresGravados.find((x) => x.nome === f.nome)?.id ??
          (await casos.fornecedores.cadastrar(admin, { nome: f.nome })).id,
      );
    }
    // As regras sistêmicas do roteiro e as telas abertas desde o primeiro dia
    // do histórico: as decisões do roteiro vêm antes dos 60 dias do padrão.
    // As chaves do Intelligence só valem com o módulo vigente: o relógio fica
    // no instante real, como quem grava a política pela tela.
    // Com o histórico já gravado, ficam como estão: regravar mudaria a versão
    // da política que o job registra a cada dia.
    agora = agoraReal;
    if (ultimoDiaGravado === null) {
      await casos.configuracao.gravarPolitica(
        admin,
        'inteligencia.sistemico',
        { tipo: 'grupo' },
        r.politicaSistemica,
      );
      await casos.configuracao.gravarPolitica(
        admin,
        'inteligencia.visibilidade_telas',
        { tipo: 'grupo' },
        { aPartirDe: r.dias[0], diasAposAtivacao: 60, papeis: ['admin_grupo', 'gestor_csc'] },
      );
    }
    log(
      `Cadastros prontos: ${r.codigosDeFalha.length} códigos, ${r.fornecedores.length} fornecedores.`,
    );

    // 6. Ativos, um dia antes do primeiro chamado, como operações de chave fixa.
    const operar = async (quem: keyof PessoasDoHistorico, nome: string, op: object) =>
      (
        await casos.sincronizacao.receberOperacao(ctx(quem), {
          ...op,
          chave: idFixo(tenantId, nome),
        } as OperacaoOffline)
      ).resposta;
    agora = new Date(r.inicioDosChamados.getTime() - DIA_MS);
    const ativos = new Map<string, string>();
    for (const a of r.ativos) {
      const resposta = await operar('admin', `ativo:${a.chave}`, {
        tipo: 'ativo.cadastrar',
        dados: {
          localId: locais.get(a.local),
          categoriaId: categoria(a.categoria),
          nome: a.nome,
          fabricante: a.fabricante,
          modelo: a.modelo,
          numeroSerie: null,
          dataCompra: diaIso(a.dataCompra),
          garantiaAte: diaIso(a.garantiaAte),
          criticidade: a.criticidade,
        },
      });
      ativos.set(a.chave, String(resposta['id']));
    }
    log(`Ativos prontos: ${ativos.size}.`);

    // 7. Os dias: as operações até o instante do job, o job e as decisões.
    const chamados = new Map<string, string>();
    const chamadoId = (c: ChamadoDoRoteiro) => {
      const id = chamados.get(c.chave);
      if (!id) throw new Error(`Chamado ${c.chave} sem abertura.`);
      return id;
    };
    const osDe = async (c: ChamadoDoRoteiro) => {
      const os = (await casos.triagem.osDoChamado(admin, chamadoId(c))).at(-1);
      if (!os) throw new Error(`Chamado ${c.chave} sem OS.`);
      return os;
    };
    const aplicar = async (e: Evento) => {
      agora = e.quando;
      const c = e.chamado;
      if (e.tipo === 'abrir') {
        const resposta = await operar('solicitante', `chamado:${c.chave}`, {
          tipo: 'chamado.abrir',
          dados: {
            localId: locais.get(c.local),
            ativoId: c.ativo ? ativos.get(c.ativo) : null,
            descricao: c.descricao,
            impactoHospede: c.impactoHospede,
            paradoDesde: c.parada ? c.parada.inicio.toISOString() : null,
          },
        });
        chamados.set(c.chave, String(resposta['id']));
        return;
      }
      if (e.tipo === 'fim_da_parada') {
        const { paradas } = await casos.paradas.doAtivo(admin, ativos.get(c.ativo ?? '') as string);
        const aberta = paradas.find(
          (p) => 'chamadoId' in p && p.chamadoId === chamadoId(c) && p.fim === null,
        );
        if (aberta) await casos.paradas.encerrar(admin, aberta.id, {});
        return;
      }
      const passo = c.os.passos[e.indice];
      if (!passo) return;
      if (passo.acao === 'gerar') {
        if ((await casos.triagem.osDoChamado(admin, chamadoId(c))).length) return;
        let chamado = await casos.chamados.chamado(admin, chamadoId(c));
        if (chamado.estado === 'aberto') {
          await casos.triagem.triar(admin, chamadoId(c), { versao: chamado.versao });
          chamado = await casos.chamados.chamado(admin, chamadoId(c));
        }
        await casos.triagem.gerarOs(admin, chamadoId(c), {
          versao: chamado.versao,
          responsavel: { tipo: 'tecnico', usuarioId: pessoas.tecnico },
          execucao: {
            executadoPor: c.os.executadoPor,
            fornecedorId: c.os.fornecedor ? (fornecedores.get(c.os.fornecedor) ?? null) : null,
          },
        });
        return;
      }
      const os = await osDe(c);
      if (passo.acao === 'iniciar' || passo.acao === 'concluir') {
        await operar('tecnico', `os:${c.chave}:${e.indice}`, {
          tipo: `os.${passo.acao}`,
          dados: {
            osId: os.id,
            versao: os.versao,
            ...(passo.acao === 'concluir'
              ? {
                  codigos: {
                    falhaId: codigosDoRoteiro.get(c.os.codigoFalha) ?? null,
                    ...(c.os.codigoSolucao
                      ? { solucaoId: solucoes.get(c.os.codigoSolucao) ?? null }
                      : {}),
                  },
                }
              : {}),
          },
        });
        return;
      }
      if (os.estado !== 'concluida') return; // já reaberta ou aceita
      if (passo.acao === 'reabrir') {
        await casos.triagem.reabrirOs(ctx('gerente'), os.id, {
          versao: os.versao,
          motivo: passo.motivo ?? 'Voltou a falhar.',
        });
      } else if (passo.acao === 'aceitar') {
        await casos.triagem.aceitarOs(ctx('gerente'), os.id, {
          versao: os.versao,
          custoInformado: c.os.custo,
        });
      }
    };

    const comoContinuar =
      `Rode de novo o mesmo comando, com o mesmo --fim (${o.fim}): ` +
      'a gravação continua do último dia gravado.';
    let reclamacoes = 0;
    let classificacoes = 0;
    const aplicarReclamacoes = async (e: EventoDasReclamacoes) => {
      agora = e.quando;
      const hotelId = hotel(e.lote.hotel);
      if (e.tipo === 'importar') {
        const lido = lerCsvDeSinais(csvDoLote(e.lote));
        if (!lido.ok) throw new Error(`O CSV do lote ${e.lote.chave} não foi lido: ${lido.erro}.`);
        const resultado = await painel.importarSinais(admin, hotelId, lido.linhas);
        if (resultado.erros > 0) {
          throw new Error(`O lote ${e.lote.chave} teve ${resultado.erros} linhas com erro.`);
        }
        reclamacoes += resultado.entraram;
        return;
      }
      // Só a que está na fila: a já classificada (numa execução anterior) fica.
      const { sinais } = await painel.filaDeSinais(admin, hotelId, 'pendentes');
      const naFila = new Map(sinais.map((s) => [`${s.fonte}|${s.idExterno}`, s]));
      for (const x of e.lote.reclamacoes) {
        const c = x.classificacao;
        const s = naFila.get(`${x.fonte}|${x.idExterno}`);
        if (!c || !s) continue;
        agora = new Date(agora.getTime() + MINUTO_MS);
        await painel.classificarSinal(admin, s.id, {
          versao: s.versao,
          manutencao: c.manutencao,
          categoriaId: c.categoria ? categoria(c.categoria) : null,
          uhId: c.uh ? (locais.get(c.uh) ?? null) : null,
          ativoId: c.ativo ? (ativos.get(c.ativo) ?? null) : null,
          ligacao: c.ligacao,
        });
        classificacoes += 1;
      }
    };
    const eventosR = eventosDasReclamacoes(r);
    let kr = 0;
    const aplicarReclamacoesAte = async (corte: Date) => {
      for (
        ;
        kr < eventosR.length && (eventosR[kr] as EventoDasReclamacoes).quando < corte;
        kr += 1
      ) {
        const e = eventosR[kr] as EventoDasReclamacoes;
        await comNovaTentativa(() => aplicarReclamacoes(e), {
          descricao: `a reclamação ${kr + 1} de ${eventosR.length} (${e.tipo}, lote ${e.lote.chave})`,
          comoContinuar,
          log,
        });
      }
    };

    // Os ids do banco de volta às chaves do roteiro, para achar o cenário do insight.
    const chaveDe = new Map<string, string>();
    for (const [mapa] of [
      [hoteis],
      [locais],
      [ativos],
      [fornecedores],
      [codigosDoRoteiro],
    ] as const)
      for (const [chave, id] of mapa) chaveDe.set(id, chave);
    for (const c of categorias) if (c.chavePadrao) chaveDe.set(c.id, c.chavePadrao);
    const diaDoInstante = new Map(instantes.map((t, i) => [t.getTime(), r.dias[i] as string]));

    const eventos = eventosDoRoteiro(r);
    // O progresso com o tempo de verdade (não o do roteiro): do notebook até o
    // dev, o volume completo leva horas, e o aquecimento sozinho passa de 40
    // minutos sem nenhuma linha de "Dia".
    const comecoReal = Date.now();
    const decorrido = () => {
      const s = Math.round((Date.now() - comecoReal) / 1000);
      return `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`;
    };
    let k = 0;
    // A retomada recomeça do último dia gravado (Kaio, 15/10/2026): as
    // operações antes do job desse dia já estavam no banco quando ele rodou, e
    // só se recupera do banco o id de cada chamado aberto. O chamado que o
    // roteiro ganhou depois da gravação (a modernização do elevador) não está
    // no banco: as operações dele antes desse dia rodam primeiro, em ordem.
    const iDoUltimo =
      ultimoDiaGravado === null
        ? -1
        : instantes.findIndex((t) => diaNoFuso(t, FUSO_DO_HISTORICO) === ultimoDiaGravado);
    let aposACorte: Evento[] = [];
    if (iDoUltimo >= 0) {
      const plano = planoDaRetomada(eventos, instantes[iDoUltimo] as Date, (c) =>
        aberturasGravadas.get(idFixo(tenantId, `chamado:${c.chave}`)),
      );
      for (const [chave, id] of plano.ids) chamados.set(chave, id);
      k = plano.fim;
      aposACorte = plano.faltam;
      log(
        `Retomada no dia ${ultimoDiaGravado}: ${k - aposACorte.length} de ${eventos.length} ` +
          `operações já gravadas, puladas` +
          (aposACorte.length > 0
            ? `; ${aposACorte.length} de chamados novos no roteiro, gravadas agora.`
            : '.'),
      );
    }
    let diasCalculados = 0;
    let insightsAbertos = 0;
    let decisoes = 0;
    const inesperados = new Set<string>();
    const estados: Record<string, string> = {};
    for (const e of aposACorte) {
      await comNovaTentativa(() => aplicar(e), {
        descricao: `a operação ${eventos.indexOf(e) + 1} de ${eventos.length} (${e.tipo}, chamado ${e.chamado.chave})`,
        comoContinuar,
        log,
      });
    }
    // As reclamações antes do corte passam de novo: a importação repetida não
    // grava nada, e a classificação pula a que já saiu da fila. Assim entram
    // também as que o roteiro ganhou depois da gravação.
    if (iDoUltimo >= 0) await aplicarReclamacoesAte(instantes[iDoUltimo] as Date);
    for (const [i, dia] of r.dias.entries()) {
      const instante = instantes[i] as Date;
      for (; k < eventos.length && (eventos[k] as Evento).quando < instante; k += 1) {
        const e = eventos[k] as Evento;
        await comNovaTentativa(() => aplicar(e), {
          descricao: `a operação ${k + 1} de ${eventos.length} (${e.tipo}, chamado ${e.chamado.chave})`,
          comoContinuar,
          log,
        });
        if ((k + 1) % OPERACOES_POR_LINHA === 0) {
          log(`Operações: ${k + 1} de ${eventos.length} (${decorrido()}).`);
        }
      }
      await aplicarReclamacoesAte(instante);
      // O dia já gravado numa execução anterior não roda de novo: o job
      // reabriria como recorrência o insight que o roteiro já encerrou. As
      // decisões do último dia gravado rodam, porque a execução pode ter
      // parado entre o job e elas.
      const rotulo = diaNoFuso(instante, FUSO_DO_HISTORICO);
      if (ultimoDiaGravado !== null && rotulo < ultimoDiaGravado) continue;
      agora = instante;
      if (ultimoDiaGravado === null || rotulo > ultimoDiaGravado) {
        const resumo = await job(tenantId);
        if (resumo.metricasGravadas > 0) diasCalculados += 1;
        insightsAbertos += resumo.insightsAbertos;
      }

      // As decisões do dia, logo depois do job.
      agora = new Date(instante.getTime() + MINUTO_MS);
      const { insights } = await comNovaTentativa(
        () => painel.listar(admin, { estado: 'abertos' }),
        { descricao: `a leitura dos insights do dia ${dia}`, comoContinuar, log },
      );
      for (const ins of insights) {
        const doRoteiro = {
          tipo: ins.tipo as 'atencao_ativo' | 'sistemico',
          ...(ins.escopo['regra'] ? { regra: ins.escopo['regra'] as never } : {}),
          hoteis: ins.hotelIds.map((h) => chaveDe.get(h) ?? h),
          escopo: Object.fromEntries(
            Object.entries(ins.escopo).map(([ch, v]) => [ch, chaveDe.get(v) ?? v]),
          ),
        };
        const cenario = cenarioDoInsight(r, doRoteiro);
        if (!cenario) {
          inesperados.add(`${ins.tipo}:${JSON.stringify(doRoteiro.escopo)}`);
          continue;
        }
        const abertoNoDia = diaDoInstante.get(ins.primeiraDeteccaoEm.getTime());
        if (!abertoNoDia) continue;
        let estado = ins.estado;
        let versao = ins.versao;
        for (const d of decisoesDoDia(r, cenario, abertoNoDia, dia)) {
          if (!TRANSICOES_DO_INSIGHT[d.acao].de.includes(estado)) continue; // já decidida
          const feita = await painel.decidir(admin, ins.id, {
            acao: d.acao,
            versao,
            nota: d.nota ?? null,
            motivoDeDescarte: d.motivoDeDescarte ?? null,
          });
          estado = feita.estado;
          versao = feita.versao;
          decisoes += 1;
        }
      }
      if ((i + 1) % 30 === 0)
        log(`Dia ${dia}: ${k} de ${eventos.length} operações (${decorrido()}).`);
    }

    // O estado final de cada insight, pelo cenário.
    for (const estado of ['abertos', 'encerrados'] as const) {
      for (const ins of (await painel.listar(admin, { estado })).insights) {
        const cenario = cenarioDoInsight(r, {
          tipo: ins.tipo as 'atencao_ativo' | 'sistemico',
          ...(ins.escopo['regra'] ? { regra: ins.escopo['regra'] as never } : {}),
          hoteis: ins.hotelIds.map((h) => chaveDe.get(h) ?? h),
          escopo: Object.fromEntries(
            Object.entries(ins.escopo).map(([ch, v]) => [ch, chaveDe.get(v) ?? v]),
          ),
        });
        if (cenario) estados[cenario.chave] = ins.estado;
      }
    }
    log(
      `Histórico gravado: ${diasCalculados} dias calculados, ${decisoes} decisões, ` +
        `${reclamacoes} reclamações importadas e ${classificacoes} classificadas.`,
    );
    return {
      tenantId,
      chamados: chamados.size,
      diasCalculados,
      insightsAbertos,
      decisoes,
      reclamacoes,
      classificacoes,
      inesperados: [...inesperados],
      estados,
    };
  } finally {
    await Promise.allSettled([montagem.encerrar(), worker.encerrar(), app.encerrar()]);
  }
}
