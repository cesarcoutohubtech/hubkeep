// O painel do Intelligence na API: as datas do motor viram texto ISO 8601.
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
