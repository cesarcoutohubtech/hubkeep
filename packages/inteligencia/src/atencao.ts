// Asset Attention Score (PRD, seção 13): a fila gerencial de ativos que
// merecem investigação. Versão 1, com os pesos do exemplo do PRD. No
// Intelligence 1.0 três componentes ficam ausentes por falta de fonte: custo
// (fase 2 e instrumentação), impacto no hóspede (1.5) e preventiva (1b). O peso
// deles vai para os presentes, e a lista de ausentes mostra o que falta.
import type { Criticidade } from './historico';
import { FAIXAS_PADRAO, type Faixa, type Score, combinar, razao } from './score';

export const VERSAO_ATENCAO = 1;

export interface EntradaAtencao {
  /** Escala configurada pelo tenant (fase A); null sem dado. */
  criticidade: Criticidade | null;
  /** O score de reincidência do mesmo ativo, na mesma data. */
  reincidencia: Score;
  /** Horas paradas na janela (parada do ativo, C5). */
  horasParadas: number | null;
  /** Custo real das OS em 12 meses e a referência (fase A); null sem dado. */
  custo?: { valor12m: number; referencia: number } | null;
  /** Guest Impact Score, de 0 a 100 (1.5); null sem dado. */
  impactoHospede?: number | null;
  /** Preventiva vencida ou sinal de compliance aberto (1b); null sem dado. */
  preventivaOuCompliance?: boolean | null;
}

export interface ConfigAtencao {
  /** Horas paradas na janela que dão o componente cheio. */
  limiteHorasParadas: number;
  pesos: {
    criticidade: number;
    reincidencia: number;
    parada: number;
    custo: number;
    impactoHospede: number;
    preventivaOuCompliance: number;
  };
  faixas: readonly Faixa[];
}

export const PADRAO_ATENCAO: ConfigAtencao = {
  limiteHorasParadas: 48,
  pesos: {
    criticidade: 0.2,
    reincidencia: 0.2,
    parada: 0.15,
    custo: 0.15,
    impactoHospede: 0.2,
    preventivaOuCompliance: 0.1,
  },
  faixas: FAIXAS_PADRAO,
};

export function atencaoDoAtivo(
  e: EntradaAtencao,
  config: ConfigAtencao = PADRAO_ATENCAO,
): Score<ConfigAtencao> {
  const custo = e.custo ?? null;
  const impacto = e.impactoHospede ?? null;
  const preventiva = e.preventivaOuCompliance ?? null;
  return combinar(
    'atencao_ativo',
    VERSAO_ATENCAO,
    [
      {
        chave: 'criticidade',
        peso: config.pesos.criticidade,
        valor: e.criticidade ? razao(e.criticidade.nivel, e.criticidade.maximo) : null,
        evidencia: { nivel: e.criticidade?.nivel ?? null, maximo: e.criticidade?.maximo ?? null },
      },
      {
        chave: 'reincidencia',
        peso: config.pesos.reincidencia,
        valor: e.reincidencia.valor === null ? null : e.reincidencia.valor / 100,
        evidencia: {
          score: e.reincidencia.valor,
          faixa: e.reincidencia.faixa,
          versao: e.reincidencia.versao,
        },
      },
      {
        chave: 'parada',
        peso: config.pesos.parada,
        valor: e.horasParadas === null ? null : razao(e.horasParadas, config.limiteHorasParadas),
        evidencia: {
          horas: e.horasParadas === null ? null : Math.round(e.horasParadas * 10) / 10,
          limite: config.limiteHorasParadas,
        },
      },
      {
        chave: 'custo',
        peso: config.pesos.custo,
        valor: custo ? razao(custo.valor12m, custo.referencia) : null,
        evidencia: { valor12m: custo?.valor12m ?? null, referencia: custo?.referencia ?? null },
      },
      {
        chave: 'impacto_hospede',
        peso: config.pesos.impactoHospede,
        valor: impacto === null ? null : razao(impacto, 100),
        evidencia: { score: impacto },
      },
      {
        chave: 'preventiva_ou_compliance',
        peso: config.pesos.preventivaOuCompliance,
        valor: preventiva === null ? null : preventiva ? 1 : 0,
        evidencia: { pendente: preventiva },
      },
    ],
    config.faixas,
    config,
  );
}
