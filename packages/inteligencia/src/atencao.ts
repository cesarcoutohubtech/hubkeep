// Asset Attention Score (PRD, seção 13): a fila gerencial de ativos que
// merecem investigação.
//
// Versão 2 (aprovada pelo Cesar em 08/10/2026, alinhada ao mock): nove
// componentes, oito com peso e UH-dias com peso 0. Pesos padrão: reincidência
// 20, tempo parado 15, impacto no hóspede 15, criticidade 15, custo informado
// 10, preventiva atrasada 10, medições fora da faixa 10, garantia vencida 5 e
// UH-dias 0. O resultado de cada dia guarda a versão da fórmula (ADR-036), e
// nada gravado é recalculado em silêncio.
//
// Disponibilidade de cada componente (respostas do Kaio de 10/10/2026,
// aprovadas pelo Cesar no mesmo dia). O componente sem dado tem o peso dividido
// entre os presentes, na proporção dos pesos, e a lista de ausentes mostra o
// que falta. A regra é a mesma para todo o tenant: não há chave por hotel que
// a ligue ou desligue.
// - tempo parado e impacto no hóspede estão sempre disponíveis: o que não foi
//   marcado é "não teve";
// - garantia sem a data conta como não vencida (0): o peso é pequeno, e não se
//   pune o dado que falta;
// - custo informado é o único em que "não informado" difere de "zero": ele
//   está disponível quando pelo menos 50% das corretivas aceitas do tenant,
//   na janela, têm o custo (`custoDisponivelNoTenant`); abaixo disso, fica sem
//   dado em todos os hotéis. Disponível, o ativo soma só as corretivas que têm
//   o dado;
// - medições fora da faixa: a disponibilidade é por categoria (sem item de
//   medição no plano da categoria, sem dado); o ativo com menos medições na
//   janela que o mínimo da política contribui 0, sem redistribuir. Até o
//   checklist tipado (PV1), nenhuma categoria tem medição;
// - preventiva atrasada: desde a versão 5, sai das OS preventivas do ativo
//   (PV3), pela regra do domínio (`preventivaAtrasada`); o ativo sem nenhuma
//   OS preventiva fica sem dado (Kaio, 16/10/2026), porque não ter plano não é
//   estar em dia. Criticidade, sem o cadastro; reincidência, sem dado nenhum;
// - UH-dias fica sem dado, com peso 0 (decisão de 07/10/2026). Quando a origem
//   for lida e o peso passar de 0, a atenção ganha a versão seguinte.
//
// A versão 2 é a primeira gravada: a versão 1 existiu só no código e nos
// testes, antes das tabelas do ADR-036, e a numeração continua. A versão 3
// (glossário de métricas versão 3, 13/10/2026) conta o custo e a cobertura
// pelas corretivas aceitas, e não pelas concluídas (divergência d), e tira da
// conta todo chamado cancelado (divergência b). A versão 4 (divergência a)
// grava o dia no fuso do hotel, e não em UTC. A versão 5 (Kaio e Cesar,
// 16/10/2026) tira a preventiva atrasada do "sem dado" para o ativo com OS
// preventiva. A versão 6 (Kaio e Cesar, 16/10/2026) não muda a fórmula da
// atenção: acompanha a reincidência versão 4, que passa a ler a falha depois
// de preventiva, e muda o número da atenção pelo componente da reincidência. A
// versão 7 (ADR-047; Cesar e Kaio, 17/10/2026) troca o impacto no hóspede pelo
// Guest Impact Score no hotel com reclamação importada na janela; no hotel sem
// nenhuma, continua a porcentagem dos chamados (`impactoNoHospede`). A
// evidência diz a fonte. O que já foi gravado com as versões anteriores não é
// recalculado (ADR-036).
import {
  CRITICIDADE_MAXIMA,
  type Criticidade,
  type CustoNaJanela,
  type SituacaoDaGarantia,
} from './historico';
import type { ImpactoNoHospede } from './impacto-hospede';
import { FAIXAS_PADRAO, type Faixa, type Score, combinar, razao } from './score';

export const VERSAO_ATENCAO = 7;

/**
 * A tolerância da preventiva atrasada, em dias. É a política
 * `preventiva.tolerancia_dias` do painel da 1c (decisão 11, padrão 0), que
 * ainda não existe no código: até existir, vale o padrão (aviso à 1c no diário
 * do Intelligence, 16/10/2026).
 */
export const TOLERANCIA_DA_PREVENTIVA_DIAS = 0;

/**
 * Medições do checklist tipado na janela (etapa PV1): quantas saíram da faixa
 * aceitável entre as feitas. Só existe para o ativo cuja categoria tem item de
 * medição no plano; sem isso, o componente é sem dado.
 */
export interface MedicoesDoAtivo {
  foraDaFaixa: number;
  total: number;
}

/**
 * Parte mínima das corretivas aceitas do tenant, na janela, com o custo
 * informado, para o componente valer (Kaio e Cesar, 10/10/2026). Fica na
 * fórmula, e não na política: a política da atenção se resolve por hotel, e a
 * regra precisa ser a mesma em todos os hotéis do tenant.
 */
export const MINIMO_DE_CUSTO_INFORMADO_NO_TENANT = 0.5;

/**
 * As corretivas aceitas do tenant na janela, com e sem o custo (divergência d
 * do glossário de métricas; até a versão 2, a base eram as concluídas).
 */
export interface CustoNoTenant {
  informadas: number;
  aceitas: number;
}

/** O custo vale no tenant quando pelo menos metade das aceitas tem o dado. */
export const custoDisponivelNoTenant = (t: CustoNoTenant): boolean =>
  t.aceitas > 0 && t.informadas / t.aceitas >= MINIMO_DE_CUSTO_INFORMADO_NO_TENANT;

/** O custo que a atenção usa: o do ativo e o do tenant, na mesma janela. */
export interface CustoDaAtencao {
  ativo: CustoNaJanela;
  tenant: CustoNoTenant;
}

export interface EntradaAtencao {
  /** De 1 a 5 (etapa I1 da 1b); null sem dado. */
  criticidade: Criticidade | null;
  /** O score de reincidência do mesmo ativo, na mesma data. */
  reincidencia: Score;
  /** Horas paradas na janela (parada do ativo, C5). Sempre disponível: null conta 0. */
  horasParadas: number | null;
  /**
   * O custo informado no aceite em 12 meses, do ativo e do tenant
   * (`custoNaJanela`). Ausente: sem dado, como no tenant abaixo do mínimo.
   */
  custo?: CustoDaAtencao | null;
  /**
   * Impacto no hóspede, de 0 a 100. Na versão 7, o `impactoNoHospede`: o
   * Guest Impact Score no hotel com reclamação na janela, ou a porcentagem
   * dos chamados que afetaram hóspede. Também aceita só o número (a
   * porcentagem dos chamados), como até a versão 6. Sempre disponível:
   * ausente conta 0.
   */
  impactoHospede?: number | ImpactoNoHospede | null;
  /** Preventiva vencida do ativo (etapa PV); null sem dado. */
  preventivaAtrasada?: boolean | null;
  /**
   * Medições fora da faixa na janela (checklist tipado, PV1). null: a
   * categoria do ativo não tem item de medição, e o componente é sem dado.
   */
  medicoes?: MedicoesDoAtivo | null;
  /** A garantia do ativo (`app.ativo.garantia_ate`); null sem a data, que conta como não vencida. */
  garantia?: SituacaoDaGarantia | null;
}

export interface ConfigAtencao {
  /** Horas paradas na janela que dão o componente cheio. */
  limiteHorasParadas: number;
  /**
   * Custo informado em 12 meses, em reais, que dá o componente cheio. Sem o
   * custo de reposição (fase 2), a referência é da política do hotel.
   */
  limiteCusto12m: number;
  /**
   * Medições na janela abaixo das quais o ativo contribui 0 no componente, sem
   * redistribuir (inteiro, de pelo menos 1).
   */
  minMedicoes: number;
  pesos: {
    reincidencia: number;
    parada: number;
    impactoHospede: number;
    criticidade: number;
    custo: number;
    preventivaAtrasada: number;
    medicoesForaDaFaixa: number;
    garantiaVencida: number;
    uhDias: number;
  };
  faixas: readonly Faixa[];
  /**
   * A partir deste valor, o score sugere insight (sugereInsight). Campo da
   * política inteligencia.atencao_ativo, com padrão 70 (Cesar, 06/10/2026).
   */
  limiteInsight: number;
}

export const PADRAO_ATENCAO: ConfigAtencao = {
  limiteHorasParadas: 48,
  limiteCusto12m: 10_000,
  minMedicoes: 3,
  pesos: {
    reincidencia: 0.2,
    parada: 0.15,
    impactoHospede: 0.15,
    criticidade: 0.15,
    custo: 0.1,
    preventivaAtrasada: 0.1,
    medicoesForaDaFaixa: 0.1,
    garantiaVencida: 0.05,
    uhDias: 0,
  },
  faixas: FAIXAS_PADRAO,
  limiteInsight: 70,
};

/** A política da atenção além do formato: o mínimo de medições é inteiro e de pelo menos 1. */
export const configAtencaoValida = (c: ConfigAtencao): boolean =>
  Number.isInteger(c.minMedicoes) && c.minMedicoes >= 1;

export function atencaoDoAtivo(
  e: EntradaAtencao,
  config: ConfigAtencao = PADRAO_ATENCAO,
): Score<ConfigAtencao> {
  const horas = e.horasParadas ?? 0;
  const ih = e.impactoHospede ?? null;
  const impacto = typeof ih === 'number' ? ih : (ih?.valor ?? 0);
  const custo = e.custo ?? null;
  const comCusto = custo !== null && custoDisponivelNoTenant(custo.tenant);
  const preventiva = e.preventivaAtrasada ?? null;
  const medicoes = e.medicoes ?? null;
  const poucasMedicoes = medicoes !== null && medicoes.total < config.minMedicoes;
  const garantia = e.garantia ?? null;
  return combinar(
    'atencao_ativo',
    VERSAO_ATENCAO,
    [
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
        valor: razao(horas, config.limiteHorasParadas),
        evidencia: { horas: Math.round(horas * 10) / 10, limite: config.limiteHorasParadas },
      },
      {
        chave: 'impacto_hospede',
        peso: config.pesos.impactoHospede,
        valor: razao(impacto, 100),
        evidencia: evidenciaDoImpacto(impacto, typeof ih === 'number' ? null : ih),
      },
      {
        chave: 'criticidade',
        peso: config.pesos.criticidade,
        valor: e.criticidade === null ? null : razao(e.criticidade, CRITICIDADE_MAXIMA),
        evidencia: { nivel: e.criticidade, maximo: CRITICIDADE_MAXIMA },
      },
      {
        chave: 'custo',
        peso: config.pesos.custo,
        valor: comCusto ? razao(custo.ativo.soma, config.limiteCusto12m) : null,
        evidencia: {
          valor12m: comCusto ? custo.ativo.soma : null,
          limite: config.limiteCusto12m,
          informadas: custo?.ativo.informadas ?? null,
          aceitas: custo?.ativo.aceitas ?? null,
          disponivelNoTenant: comCusto,
          percentualNoTenant:
            custo && custo.tenant.aceitas > 0
              ? Math.round((custo.tenant.informadas / custo.tenant.aceitas) * 1000) / 10
              : null,
          minimoNoTenant: MINIMO_DE_CUSTO_INFORMADO_NO_TENANT * 100,
        },
      },
      {
        chave: 'preventiva_atrasada',
        peso: config.pesos.preventivaAtrasada,
        valor: preventiva === null ? null : preventiva ? 1 : 0,
        evidencia: { atrasada: preventiva },
      },
      {
        chave: 'medicoes_fora_da_faixa',
        peso: config.pesos.medicoesForaDaFaixa,
        valor:
          medicoes === null
            ? null
            : poucasMedicoes
              ? 0
              : razao(medicoes.foraDaFaixa, medicoes.total),
        evidencia: {
          foraDaFaixa: medicoes?.foraDaFaixa ?? null,
          total: medicoes?.total ?? null,
          minimo: config.minMedicoes,
          abaixoDoMinimo: poucasMedicoes,
        },
      },
      {
        chave: 'garantia_vencida',
        peso: config.pesos.garantiaVencida,
        valor: garantia?.vencida ? 1 : 0,
        evidencia: {
          vencida: garantia?.vencida ?? false,
          diasVencida: garantia?.diasVencida ?? 0,
          semData: garantia === null,
        },
      },
      {
        chave: 'uh_dias',
        peso: config.pesos.uhDias,
        valor: null,
        evidencia: {},
      },
    ],
    config.faixas,
    config,
  );
}

/** A evidência do impacto no hóspede: o valor, a fonte e, pelas reclamações, o porquê. */
function evidenciaDoImpacto(
  valor: number,
  ih: ImpactoNoHospede | null,
): Readonly<Record<string, number | string | null>> {
  if (!ih) return { score: valor };
  if (!ih.score) return { score: valor, fonte: ih.fonte };
  const ev = (componente: string, campo: string) => {
    const v = ih.score?.componentes.find((c) => c.chave === componente)?.evidencia[campo];
    return typeof v === 'number' ? v : null;
  };
  return {
    score: valor,
    fonte: ih.fonte,
    versaoImpacto: ih.score.versao,
    confirmadas: ev('volume', 'confirmadas') ?? 0,
    possiveis: ev('volume', 'possiveis') ?? 0,
    janelaDias: ev('volume', 'janelaDias') ?? 0,
    uhs: ev('amplitude', 'uhs') ?? 0,
    depoisDoReparo: ev('recorrencia', 'depoisDoReparo'),
    notaMediaEm5: ev('severidade', 'notaMediaEm5'),
    percentualDosChamados: ev('operacional', 'percentual') ?? 0,
  };
}
