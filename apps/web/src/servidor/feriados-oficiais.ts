// Feriados oficiais do calendário de SLA (fase 1c; ADR-042): a porta
// FeriadosOficiais sobre a biblioteca date-holidays, só no servidor (ela
// nunca vai para o pacote do PWA). A versão fica fixada no package.json; cada
// atualização passa pelo teste de regressão (test/feriados-oficiais.test.ts).
//
// - Tipos: `public` é feriado; `optional` e `bank` (Carnaval, Quarta-feira de
//   Cinzas, Corpus Christi) são ponto facultativo; o resto (`observance`,
//   `school`) é observância, que nunca conta.
// - A subdivisão vem como ISO 3166-2 (BR-PR); a biblioteca pede só o estado.
// - A lista é a união dos feriados do país com os da subdivisão: na 3.37.0,
//   os dados de São Paulo e do Rio de Janeiro deixam de fora o 20 de
//   novembro, que é nacional desde 2024.
// - O código é ISC, e os dados têm licença própria, com a atribuição em
//   AVISOS-DE-TERCEIROS.md.
import type { FeriadosOficiais } from '@hubkeep/aplicacao';
import type { FeriadoOficial, TipoDeFeriadoOficial } from '@hubkeep/dominio';
import Holidays from 'date-holidays';

const TIPO: Readonly<Record<string, TipoDeFeriadoOficial>> = {
  public: 'feriado',
  optional: 'ponto_facultativo',
  bank: 'ponto_facultativo',
};

/** O mais forte do dia vale: feriado, depois ponto facultativo, depois observância. */
const FORCA: Readonly<Record<TipoDeFeriadoOficial, number>> = {
  feriado: 2,
  ponto_facultativo: 1,
  observancia: 0,
};

function daBiblioteca(pais: string, estado: string | null, ano: number): FeriadoOficial[] {
  const h = estado === null ? new Holidays(pais) : new Holidays(pais, estado);
  return h.getHolidays(ano).map((f) => ({
    data: f.date.slice(0, 10),
    tipo: TIPO[f.type] ?? 'observancia',
  }));
}

export function criarFeriadosOficiais(): FeriadosOficiais {
  const cache = new Map<string, readonly FeriadoOficial[]>();
  return {
    doAno({ pais, subdivisao }, ano) {
      const estado =
        subdivisao !== null && subdivisao.startsWith(`${pais}-`)
          ? subdivisao.slice(pais.length + 1)
          : null;
      const chave = `${pais}|${estado ?? ''}|${ano}`;
      const guardado = cache.get(chave);
      if (guardado) return guardado;
      const porData = new Map<string, TipoDeFeriadoOficial>();
      const todos = [
        ...daBiblioteca(pais, null, ano),
        ...(estado === null ? [] : daBiblioteca(pais, estado, ano)),
      ];
      for (const f of todos) {
        const atual = porData.get(f.data);
        if (atual === undefined || FORCA[f.tipo] > FORCA[atual]) porData.set(f.data, f.tipo);
      }
      const lista = [...porData]
        .map(([data, tipo]) => ({ data, tipo }))
        .sort((a, b) => a.data.localeCompare(b.data));
      cache.set(chave, lista);
      return lista;
    },
  };
}
