// Calendário de SLA (fase 1c; ADR-042). Duas portas:
//   - FeriadosOficiais: os feriados nacionais e regionais de (país,
//     subdivisão, ano), com o tipo. A implementação fica no servidor do web,
//     no ponto de composição, com a biblioteca de feriados; o domínio só
//     recebe as datas, e a biblioteca nunca vai para o pacote do PWA;
//   - os dados do hotel que o calendário usa (DadosDoCalendario), lidos por
//     packages/db com o contexto de quem pede: o fuso, a região do hotel e a
//     do tenant (o nulo do hotel herda) e os feriados ativos do hotel.
import type { FeriadoDoHotel, FeriadoOficial } from '@hubkeep/dominio';

export interface FeriadosOficiais {
  /** Os feriados oficiais do ano no país e na subdivisão; país sem cobertura: lista vazia. */
  doAno(
    regiao: { pais: string; subdivisao: string | null },
    ano: number,
  ): readonly FeriadoOficial[];
}

export interface DadosDoCalendario {
  /** Fuso IANA do hotel. */
  fuso: string;
  hotel: { pais: string | null; subdivisao: string | null };
  tenant: { pais: string; subdivisao: string | null };
  /** Os feriados ativos do hotel (app.feriado_hotel). */
  feriados: FeriadoDoHotel[];
}
