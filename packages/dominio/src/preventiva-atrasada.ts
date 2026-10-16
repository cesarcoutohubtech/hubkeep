// A preventiva atrasada (glossário de métricas, versão 3, fechado por Kaio e
// Cesar em 13/10/2026): a OS preventiva que passou do fim do dia previsto mais
// a tolerância, no fuso do hotel, e não foi concluída nem cancelada. É o
// complemento da "preventiva em dia" do painel, com a mesma tolerância (a
// política `preventiva.tolerancia_dias`, padrão 0, decisão 11 do plano da 1c).
//
// A avaliação é num instante: o estado da OS é o da última transição até ele,
// para que o recálculo de um dia passado dê o mesmo resultado. Quem usa hoje é
// a atenção do ativo do Intelligence (16/10/2026).
import type { EstadoDaOs } from './corretiva';
import { ESTADOS_DA_PREVENTIVA_ABERTA } from './geracao-preventiva';
import { diaNoFuso } from './plano-preventivo';

const DIA_MS = 86_400_000;

export interface PreventivaNoTempo {
  /** A data prevista, aaaa-mm-dd, no fuso do hotel. */
  dataPrevista: string;
  /** As transições da OS, em qualquer ordem; sem nenhuma, a OS está atribuída. */
  transicoes: readonly { para: EstadoDaOs; quando: Date }[];
}

/** O estado da OS no instante: o da última transição até ele, ou atribuída. */
function estadoNoInstante(os: PreventivaNoTempo, agora: Date): EstadoDaOs {
  let estado: EstadoDaOs = 'atribuida';
  let ultima = -Infinity;
  for (const t of os.transicoes) {
    const q = t.quando.getTime();
    if (q <= agora.getTime() && q >= ultima) {
      ultima = q;
      estado = t.para;
    }
  }
  return estado;
}

/** O último dia previsto mais a tolerância, aaaa-mm-dd. */
function ultimoDiaComTolerancia(dataPrevista: string, toleranciaDias: number): string {
  const base = Date.parse(`${dataPrevista}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPrevista) || Number.isNaN(base)) {
    throw new Error(`Data prevista fora do formato aaaa-mm-dd: ${dataPrevista}`);
  }
  return new Date(base + toleranciaDias * DIA_MS).toISOString().slice(0, 10);
}

/**
 * Se a OS preventiva está atrasada no instante `agora`: o dia de `agora` no
 * fuso do hotel já passou do dia previsto mais a tolerância, e a OS ainda não
 * foi concluída nem cancelada.
 */
export function preventivaAtrasada(
  os: PreventivaNoTempo,
  o: { fuso: string; agora: Date; toleranciaDias: number },
): boolean {
  if (!Number.isInteger(o.toleranciaDias) || o.toleranciaDias < 0) {
    throw new Error(`Tolerância da preventiva inválida: ${o.toleranciaDias}`);
  }
  if (!ESTADOS_DA_PREVENTIVA_ABERTA.includes(estadoNoInstante(os, o.agora))) return false;
  return diaNoFuso(o.agora, o.fuso) > ultimoDiaComTolerancia(os.dataPrevista, o.toleranciaDias);
}
