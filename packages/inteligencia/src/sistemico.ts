// Detecção de possível problema sistêmico (PRD, seção 15), por regras
// determinísticas: mesmo modelo, mesmo andar e crescimento de categoria. O
// resultado é sempre "possível": só uma pessoa confirma. A regra do mesmo
// fornecedor espera o fornecedor (fase 2), e a do feedback externo espera a
// 1.5. Agrupar por falha precisa do código de falha da instrumentação (fase A);
// sem ele, o agrupamento cai na categoria do ativo, e a corretiva sem nenhum
// dos dois fica de fora.
import {
  type AtivoAnalisado,
  type Corretiva,
  type LocalAnalisado,
  chaveDeModelo,
} from './historico';
import { DIA_MS } from './score';

export const VERSAO_SISTEMICO = 1;

export interface ConfigSistemico {
  mesmoModelo: { minAtivos: number; janelaDias: number };
  mesmoAndar: { minLocais: number; janelaDias: number };
  crescimento: { percentual: number; minAtual: number; janelaDias: number };
}

export const PADRAO_SISTEMICO: ConfigSistemico = {
  mesmoModelo: { minAtivos: 5, janelaDias: 90 },
  mesmoAndar: { minLocais: 5, janelaDias: 10 },
  crescimento: { percentual: 50, minAtual: 5, janelaDias: 30 },
};

export type RegraSistemica = 'mesmo_modelo' | 'mesmo_andar' | 'crescimento_categoria';

export interface SinalSistemico {
  regra: RegraSistemica;
  /** Sempre 'possivel': confirmação é humana (PRD, seção 15). */
  situacao: 'possivel';
  versao: number;
  /** O que agrupa: falha, modelo, hotel, andar. */
  chave: Readonly<Record<string, string>>;
  evidencia: {
    quantidade: number;
    distintos: number;
    janelaDias: number;
    hotelIds: readonly string[];
    corretivaIds: readonly string[];
    anterior?: number;
    variacaoPercentual?: number;
  };
}

export interface EntradaSistemico {
  corretivas: readonly Corretiva[];
  ativos: readonly AtivoAnalisado[];
  locais: readonly LocalAnalisado[];
}

const unicos = (xs: readonly string[]) => [...new Set(xs)].sort();

function agrupar<T>(xs: readonly T[], chave: (x: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = chave(x);
    if (k === null) continue;
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
}

export function detectarSistemicos(
  e: EntradaSistemico,
  agora: Date,
  config: ConfigSistemico = PADRAO_SISTEMICO,
): SinalSistemico[] {
  const ativos = new Map(e.ativos.map((a) => [a.id, a]));
  const locais = new Map(e.locais.map((l) => [l.id, l]));
  const falhaDe = (c: Corretiva): string | null =>
    c.codigoFalha ?? (c.ativoId ? (ativos.get(c.ativoId)?.categoriaId ?? null) : null);
  const naJanela =
    (dias: number, deslocamento = 0) =>
    (c: Corretiva) => {
      const fim = agora.getTime() - deslocamento * DIA_MS;
      return c.abertaEm.getTime() > fim - dias * DIA_MS && c.abertaEm.getTime() <= fim;
    };
  const sinais: SinalSistemico[] = [];

  // Mesmo modelo, mesma falha, ativos distintos em qualquer hotel do tenant.
  const mm = config.mesmoModelo;
  const porModelo = agrupar(e.corretivas.filter(naJanela(mm.janelaDias)), (c) => {
    const a = c.ativoId ? ativos.get(c.ativoId) : undefined;
    const modelo = a ? chaveDeModelo(a) : null;
    const falha = falhaDe(c);
    return modelo && falha ? `${modelo}#${falha}` : null;
  });
  for (const [k, cs] of porModelo) {
    const distintos = unicos(cs.map((c) => c.ativoId as string)).length;
    if (distintos < mm.minAtivos) continue;
    const [modelo, falha] = k.split('#') as [string, string];
    sinais.push({
      regra: 'mesmo_modelo',
      situacao: 'possivel',
      versao: VERSAO_SISTEMICO,
      chave: { modelo, falha },
      evidencia: {
        quantidade: cs.length,
        distintos,
        janelaDias: mm.janelaDias,
        hotelIds: unicos(cs.map((c) => c.hotelId)),
        corretivaIds: cs.map((c) => c.id),
      },
    });
  }

  // Mesmo andar do mesmo hotel, mesma falha, locais distintos.
  const ma = config.mesmoAndar;
  const porAndar = agrupar(e.corretivas.filter(naJanela(ma.janelaDias)), (c) => {
    const andar = locais.get(c.localId)?.andar?.trim();
    const falha = falhaDe(c);
    return andar && falha ? `${c.hotelId}#${andar}#${falha}` : null;
  });
  for (const [k, cs] of porAndar) {
    const distintos = unicos(cs.map((c) => c.localId)).length;
    if (distintos < ma.minLocais) continue;
    const [hotelId, andar, falha] = k.split('#') as [string, string, string];
    sinais.push({
      regra: 'mesmo_andar',
      situacao: 'possivel',
      versao: VERSAO_SISTEMICO,
      chave: { hotelId, andar, falha },
      evidencia: {
        quantidade: cs.length,
        distintos,
        janelaDias: ma.janelaDias,
        hotelIds: [hotelId],
        corretivaIds: cs.map((c) => c.id),
      },
    });
  }

  // Crescimento da mesma falha no hotel, contra a janela anterior de igual tamanho.
  const cr = config.crescimento;
  const chaveHotel = (c: Corretiva) => {
    const falha = falhaDe(c);
    return falha ? `${c.hotelId}#${falha}` : null;
  };
  const atual = agrupar(e.corretivas.filter(naJanela(cr.janelaDias)), chaveHotel);
  const anterior = agrupar(e.corretivas.filter(naJanela(cr.janelaDias, cr.janelaDias)), chaveHotel);
  for (const [k, cs] of atual) {
    const antes = anterior.get(k)?.length ?? 0;
    if (cs.length < cr.minAtual || antes === 0) continue;
    const variacaoPercentual = Math.round(((cs.length - antes) / antes) * 1000) / 10;
    if (variacaoPercentual < cr.percentual) continue;
    const [hotelId, falha] = k.split('#') as [string, string];
    sinais.push({
      regra: 'crescimento_categoria',
      situacao: 'possivel',
      versao: VERSAO_SISTEMICO,
      chave: { hotelId, falha },
      evidencia: {
        quantidade: cs.length,
        distintos: unicos(cs.map((c) => c.localId)).length,
        janelaDias: cr.janelaDias,
        hotelIds: [hotelId],
        corretivaIds: cs.map((c) => c.id),
        anterior: antes,
        variacaoPercentual,
      },
    });
  }

  return sinais;
}
