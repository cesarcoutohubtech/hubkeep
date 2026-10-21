// O painel do Intelligence na API: as datas do motor viram texto ISO 8601.
import type {
  FilaDoSinal,
  MetricaDoPainel,
  ReclamacoesDoPainel,
  SinalDaFila,
  SubstituicaoDoAtivo,
} from '@hubkeep/inteligencia';

const iso = (d: Date) => d.toISOString();

interface ComDatas {
  hotelIds: readonly string[];
  primeiraDeteccaoEm: Date;
  ultimaDeteccaoEm: Date;
  encerradoEm: Date | null;
}

export function insightNaApi<T extends ComDatas>(
  i: T,
): Omit<T, keyof ComDatas> & {
  hotelIds: string[];
  primeiraDeteccaoEm: string;
  ultimaDeteccaoEm: string;
  encerradoEm: string | null;
} {
  return {
    ...i,
    hotelIds: [...i.hotelIds],
    primeiraDeteccaoEm: iso(i.primeiraDeteccaoEm),
    ultimaDeteccaoEm: iso(i.ultimaDeteccaoEm),
    encerradoEm: i.encerradoEm === null ? null : iso(i.encerradoEm),
  };
}

export const dataNaApi = iso;

/** Os recálculos do dia na página do ativo (ADR-036): o resumo, sem o detalhe. */
export function recalculosNaApi(recalculos: readonly MetricaDoPainel[]) {
  return recalculos.map((m) => ({
    calculo: m.calculo,
    calculadoEm: iso(m.calculadoEm),
    atencao: m.atencao,
    faixa: m.faixa,
    reincidencia: m.reincidencia,
    versaoFormulaAtencao: m.versaoFormulaAtencao,
    versaoFormulaReincidencia: m.versaoFormulaReincidencia,
    versaoPolitica: m.versaoPolitica,
  }));
}

/** A efetividade (adendo ao ADR-033): a data da intervenção em texto; o resto vai como o motor devolve. */
export function efetividadesNaApi<
  I extends { em: Date },
  E extends { metricas: readonly unknown[] },
  N,
>(e: { intervencoes: readonly { intervencao: I; efetividade: E }[]; nomes: N }) {
  return {
    intervencoes: e.intervencoes.map((x) => ({
      intervencao: { ...x.intervencao, em: iso(x.intervencao.em) },
      efetividade: {
        ...x.efetividade,
        metricas: [...x.efetividade.metricas] as E['metricas'][number][],
      },
    })),
    nomes: e.nomes,
  };
}

/** O sinal de substituição: a data do cálculo em texto; a configuração fica fora (os limites vão em cada critério). */
export function substituicaoNaApi(s: SubstituicaoDoAtivo) {
  const { versao, sinal, atingidos, garantiaVigente, criterios } = s.substituicao;
  return {
    versao,
    sinal,
    atingidos,
    avaliados: s.avaliados,
    garantiaVigente,
    criterios: criterios.map((c) => ({ ...c })),
    calculadoEm: iso(s.calculadoEm),
  };
}

/** Uma reclamação do sinal do hóspede (ADR-047): as datas em texto. */
function sinalNaApi(s: SinalDaFila) {
  const ouNulo = (d: Date | null) => (d === null ? null : iso(d));
  return {
    ...s,
    ocorridoEm: iso(s.ocorridoEm),
    textoApagadoEm: ouNulo(s.textoApagadoEm),
    classificadoEm: ouNulo(s.classificadoEm),
    importadoEm: iso(s.importadoEm),
  };
}

/** A fila do sinal do hóspede (ADR-047): as datas em texto. */
export function filaDeSinaisNaApi(f: FilaDoSinal) {
  return { sinais: f.sinais.map(sinalNaApi), limitada: f.limitada, nomes: f.nomes };
}

/** As reclamações das páginas do insight e do ativo (C2 do ADR-047): as datas em texto. */
export function reclamacoesNaApi(r: ReclamacoesDoPainel) {
  return { ...r, sinais: r.sinais.map(sinalNaApi) };
}
