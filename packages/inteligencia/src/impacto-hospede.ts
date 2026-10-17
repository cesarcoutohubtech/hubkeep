// O Guest Impact Score v1 (ADR-047; PRD, seção 11; Cesar e Kaio, 17/10/2026,
// decisões D1 a D4 do PR C): de 0 a 100, o quanto as falhas de um ativo chegam
// ao hóspede, determinístico e explicável, sem IA. Conta as reclamações de
// hóspede que uma pessoa classificou como de manutenção e ligou ao ativo, na
// janela da política (pela data da avaliação). Componentes (pesos do PRD):
// - volume (30%): as reclamações sobre o limite;
// - severidade (25%): a média de (1 − nota/escala) das que têm nota; sem
//   nota, sem dado, e o peso redistribui;
// - recorrência depois do reparo (20%): as reclamações depois da última
//   corretiva concluída do ativo, sobre o limite; sem reparo, sem dado;
// - amplitude (15%): as UHs distintas da classificação, sobre o limite;
// - impacto operacional (10%): a porcentagem dos chamados do ativo que
//   afetaram hóspede (o PMS não existe no HubKeep).
// Só a ligação confirmada pesa (D2); a possível aparece na evidência, sem
// pesar. No hotel sem nenhuma reclamação importada na janela, o impacto no
// hóspede continua a porcentagem dos chamados, como antes (D1): sem fonte,
// o score não diz nada, e a atenção não cai só porque o hotel não importa.
// Os pesos e os limites são detalhe do Kaio (ADR-033).
import type { Corretiva } from './historico';
import { DIA_MS, FAIXAS_PADRAO, type Faixa, type Score, combinar, razao } from './score';

export const VERSAO_IMPACTO_HOSPEDE = 1;

export interface ConfigImpactoHospede {
  /** A janela, em dias, pela data da avaliação. */
  janelaDias: number;
  /** Reclamações confirmadas que dão o volume cheio. */
  limiteReclamacoes: number;
  /** Reclamações depois do último reparo que dão a recorrência cheia. */
  limiteRecorrencia: number;
  /** UHs distintas que dão a amplitude cheia. */
  limiteUhs: number;
  pesos: {
    volume: number;
    severidade: number;
    recorrencia: number;
    amplitude: number;
    operacional: number;
  };
  faixas: readonly Faixa[];
}

export const PADRAO_IMPACTO_HOSPEDE: ConfigImpactoHospede = {
  janelaDias: 90,
  limiteReclamacoes: 5,
  limiteRecorrencia: 3,
  limiteUhs: 3,
  pesos: { volume: 0.3, severidade: 0.25, recorrencia: 0.2, amplitude: 0.15, operacional: 0.1 },
  faixas: FAIXAS_PADRAO,
};

/** Os limites e a janela são inteiros de pelo menos 1. */
export const configImpactoHospedeValida = (c: ConfigImpactoHospede): boolean =>
  [c.janelaDias, c.limiteReclamacoes, c.limiteRecorrencia, c.limiteUhs].every(
    (n) => Number.isInteger(n) && n >= 1,
  );

/**
 * Uma reclamação de hóspede do tenant, como o job e o painel a leem (sem o
 * texto): a classificação, a nota e a data.
 */
export interface SinalDaFonte {
  id: string;
  hotelId: string;
  ocorridoEm: Date;
  nota: number | null;
  escala: number | null;
  /** Null enquanto ninguém classificou. */
  manutencao: boolean | null;
  categoriaId: string | null;
  uhId: string | null;
  ativoId: string | null;
  ligacao: string;
}

export interface EntradaImpactoHospede {
  /** As reclamações do ativo (ligadas a ele), em qualquer data: a janela é aplicada aqui. */
  reclamacoes: readonly SinalDaFonte[];
  /** A conclusão da última corretiva do ativo até agora; null sem reparo. */
  ultimoReparoEm: Date | null;
  /** A porcentagem, de 0 a 100, dos chamados do ativo que afetaram hóspede. */
  percentualDosChamados: number;
}

export function guestImpactScore(
  e: EntradaImpactoHospede,
  agora: Date,
  config: ConfigImpactoHospede = PADRAO_IMPACTO_HOSPEDE,
): Score<ConfigImpactoHospede> {
  const inicio = agora.getTime() - config.janelaDias * DIA_MS;
  const naJanela = e.reclamacoes.filter(
    (r) =>
      r.manutencao === true &&
      r.ocorridoEm.getTime() > inicio &&
      r.ocorridoEm.getTime() <= agora.getTime(),
  );
  const confirmadas = naJanela.filter((r) => r.ligacao === 'confirmada');
  const possiveis = naJanela.filter((r) => r.ligacao === 'possivel').length;
  const comNota = confirmadas.filter(
    (r): r is SinalDaFonte & { nota: number; escala: number } =>
      r.nota !== null && r.escala !== null && r.escala > 0,
  );
  const severidade = comNota.length
    ? comNota.reduce((s, r) => s + (1 - r.nota / r.escala), 0) / comNota.length
    : null;
  const depoisDoReparo =
    e.ultimoReparoEm === null
      ? null
      : confirmadas.filter((r) => r.ocorridoEm.getTime() > (e.ultimoReparoEm as Date).getTime())
          .length;
  const uhs = new Set(confirmadas.flatMap((r) => (r.uhId ? [r.uhId] : []))).size;
  const p = config.pesos;
  return combinar(
    'impacto_hospede',
    VERSAO_IMPACTO_HOSPEDE,
    [
      {
        chave: 'volume',
        peso: p.volume,
        valor: razao(confirmadas.length, config.limiteReclamacoes),
        evidencia: {
          confirmadas: confirmadas.length,
          possiveis,
          limite: config.limiteReclamacoes,
          janelaDias: config.janelaDias,
        },
      },
      {
        chave: 'severidade',
        peso: p.severidade,
        valor: severidade,
        evidencia: {
          comNota: comNota.length,
          // A nota média na escala de 5, para a frase ("1,8 de 5").
          notaMediaEm5: severidade === null ? null : Math.round((1 - severidade) * 5 * 10) / 10,
        },
      },
      {
        chave: 'recorrencia',
        peso: p.recorrencia,
        valor: depoisDoReparo === null ? null : razao(depoisDoReparo, config.limiteRecorrencia),
        evidencia: { depoisDoReparo, limite: config.limiteRecorrencia },
      },
      {
        chave: 'amplitude',
        peso: p.amplitude,
        valor: razao(uhs, config.limiteUhs),
        evidencia: { uhs, limite: config.limiteUhs },
      },
      {
        chave: 'operacional',
        peso: p.operacional,
        valor: razao(e.percentualDosChamados, 100),
        evidencia: { percentual: e.percentualDosChamados },
      },
    ],
    config.faixas,
    config,
  );
}

/** O impacto no hóspede da atenção e da substituição, com a fonte (D1). */
export interface ImpactoNoHospede {
  /** De 0 a 100. */
  valor: number;
  fonte: 'reclamacoes' | 'chamados';
  /** O Guest Impact Score, quando a fonte são as reclamações. */
  score: Score<ConfigImpactoHospede> | null;
}

/**
 * O hotel com alguma reclamação importada na janela usa o Guest Impact Score;
 * o hotel sem nenhuma, a porcentagem dos chamados (D1).
 */
export function impactoNoHospede(
  e: EntradaImpactoHospede & { hotelComReclamacao: boolean },
  agora: Date,
  config: ConfigImpactoHospede = PADRAO_IMPACTO_HOSPEDE,
): ImpactoNoHospede {
  if (!e.hotelComReclamacao) {
    return { valor: e.percentualDosChamados, fonte: 'chamados', score: null };
  }
  const score = guestImpactScore(e, agora, config);
  return { valor: score.valor ?? 0, fonte: 'reclamacoes', score };
}

/** Os hotéis com alguma reclamação importada na janela (pela data da avaliação). */
export function hoteisComReclamacao(
  sinais: readonly SinalDaFonte[],
  agora: Date,
  janelaDias: (hotelId: string) => number,
): Set<string> {
  return new Set(
    sinais
      .filter((s) => {
        const t = s.ocorridoEm.getTime();
        return t > agora.getTime() - janelaDias(s.hotelId) * DIA_MS && t <= agora.getTime();
      })
      .map((s) => s.hotelId),
  );
}

/** A conclusão mais recente das corretivas do ativo até agora; null sem nenhuma. */
export function ultimoReparo(
  cs: readonly Pick<Corretiva, 'concluidaEm'>[],
  agora: Date,
): Date | null {
  let ultimo: Date | null = null;
  for (const c of cs)
    if (
      c.concluidaEm &&
      c.concluidaEm.getTime() <= agora.getTime() &&
      (!ultimo || c.concluidaEm.getTime() > ultimo.getTime())
    )
      ultimo = c.concluidaEm;
  return ultimo;
}
