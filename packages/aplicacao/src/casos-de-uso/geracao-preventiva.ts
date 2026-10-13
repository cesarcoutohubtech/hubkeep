// Geração da OS preventiva (fase 1b, PV3; ADR-041), por tenant, no cron
// /api/cron/preventiva, uma vez por dia. Para cada hotel ativo, numa
// transação dele: os planos ativos, os ativos do alvo e as OS que o plano já
// gerou; a regra (planejarGeracao, no domínio) decide o que gerar e o que
// pular, no dia do fuso do hotel. Um hotel que falha não segura os outros:
// a falha volta no resultado, e a próxima execução tenta de novo.
//
// O que o caso de uso resolve no hotel, com as regras do domínio: se o
// responsável padrão ainda vale (responsavelQueVale), a situação da OS
// atribuída (situacaoPara), o checklist que a OS copia (modeloParaACopia) e,
// no hotel arrendado, quem responde pela OS, pela categoria do ativo
// (responsavelDoArrendamento, pedido da 1c de 13/10/2026).
import {
  MOTIVOS_DE_PULO,
  type MatrizDeArrendamento,
  type MotivoDePulo,
  diaNoFuso,
  modeloParaACopia,
  planejarGeracao,
  resolverPolitica,
  responsavelDoArrendamento,
  responsavelQueVale,
  situacaoPara,
} from '@hubkeep/dominio';
import type {
  HotelParaGerar,
  ModeloParaACopia,
  PortaGeracaoPreventiva,
  SessaoDaGeracao,
} from '../portas/geracao-preventiva';
import type { Relogio } from '../portas/papeis';

export interface ResultadoDaGeracao {
  hoteis: number;
  planos: number;
  geradas: number;
  /** As puladas por motivo; "ja_gerada" inclui a ocorrência que outra execução gravou antes. */
  puladas: Record<MotivoDePulo, number>;
  /** Os hotéis em que a transação falhou, com a mensagem do erro. */
  falhas: { hotelId: string; erro: string }[];
}

/** Lê uma vez por hotel, e só se houver o que gerar. */
function umaVez<T>(f: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | undefined;
  return () => (p ??= f());
}

async function gerarNoHotel(s: SessaoDaGeracao, hotel: HotelParaGerar, agora: Date) {
  const hoje = diaNoFuso(agora, hotel.fuso);
  const parcial = { planos: 0, geradas: 0, puladas: [] as MotivoDePulo[] };
  const situacaoId = umaVez(async () => situacaoPara(await s.situacoes(), 'os', 'atribuida'));
  const matriz = umaVez(async (): Promise<MatrizDeArrendamento> =>
    hotel.modeloContratual === 'arrendado'
      ? resolverPolitica('hotel.matriz_arrendamento', await s.politica('hotel.matriz_arrendamento'))
      : {},
  );
  for (const plano of await s.planosAtivos()) {
    parcial.planos++;
    const ativos = await s.ativosDoAlvo(plano.id);
    const plan = planejarGeracao({
      plano: { ...plano, responsavel: responsavelQueVale(plano.responsavel, hotel, agora) },
      ativos: ativos.map((a) => ({
        id: a.id,
        localId: a.localId,
        cadastradoEm: diaNoFuso(a.criadoEm, hotel.fuso),
      })),
      geradas: await s.geradas(plano.id),
      hoje,
    });
    parcial.puladas.push(...plan.puladas.map((p) => p.motivo));
    if (plan.geradas.length === 0) continue;
    const modelo: ModeloParaACopia | null = modeloParaACopia(
      plano.checklistModeloId === null ? null : await s.modeloDeChecklist(plano.checklistModeloId),
    );
    const categoria = new Map(ativos.map((a) => [a.id, a.categoriaId]));
    for (const os of plan.geradas) {
      const gravou = await s.gerar({
        ...os,
        situacaoId: await situacaoId(),
        responsavelArrendamento: responsavelDoArrendamento(
          hotel.modeloContratual,
          await matriz(),
          categoria.get(os.ativoId) ?? null,
        ),
        checklist: modelo && {
          id: modelo.id,
          versao: modelo.versao,
          nomes: modelo.nomes,
          itens: modelo.itens,
        },
      });
      if (gravou) parcial.geradas++;
      else parcial.puladas.push('ja_gerada');
    }
  }
  return parcial;
}

export function criarGeracaoDePreventivas(deps: {
  geracao: PortaGeracaoPreventiva;
  relogio: Relogio;
}): (tenantId: string) => Promise<ResultadoDaGeracao> {
  return async (tenantId) => {
    const agora = deps.relogio.agora();
    const r: ResultadoDaGeracao = {
      hoteis: 0,
      planos: 0,
      geradas: 0,
      puladas: Object.fromEntries(MOTIVOS_DE_PULO.map((m) => [m, 0])) as Record<
        MotivoDePulo,
        number
      >,
      falhas: [],
    };
    for (const hotel of await deps.geracao.hoteisAtivos(tenantId)) {
      r.hoteis++;
      try {
        const doHotel = await deps.geracao.noHotel({ tenantId, hotelId: hotel.id }, (s) =>
          gerarNoHotel(s, hotel, agora),
        );
        r.planos += doHotel.planos;
        r.geradas += doHotel.geradas;
        for (const m of doHotel.puladas) r.puladas[m]++;
      } catch (e) {
        r.falhas.push({ hotelId: hotel.id, erro: e instanceof Error ? e.message : String(e) });
      }
    }
    return r;
  };
}
