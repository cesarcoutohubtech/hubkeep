// O painel do Intelligence na API: as datas do motor viram texto ISO 8601.
import type { SubstituicaoDoAtivo } from '@hubkeep/inteligencia';

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
