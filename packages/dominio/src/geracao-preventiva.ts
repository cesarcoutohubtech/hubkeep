// Geração da OS preventiva (fase 1b, PV3; ADR-041, aprovado pelo Cesar em
// 12/10/2026 com as decisões 9 a 13 de
// docs/referencia/propostas-desenho-pv-implantacao.md). A regra é pura: o
// job do worker lê o plano, os ativos do alvo e as OS que o plano já gerou, e
// esta função decide o que gerar e o que pular, no dia do fuso do hotel.
//
// - Só a ocorrência mais recente até hoje (sem avalanche, decisão 10): com
//   várias vencidas, porque o job ficou parado ou o plano começou no passado,
//   sai uma OS só. A OS nasce no dia previsto, sem antecedência (decisão 11).
// - Sem acúmulo (decisão 10): enquanto a OS anterior do mesmo plano e ativo
//   está aberta, a nova não sai.
// - No plano por categoria, uma OS por ativo (decisão 9).
// - Idempotente: a ocorrência que já tem OS, inclusive cancelada, não sai de
//   novo. O índice único do banco (plano, ativo, data prevista) repete a regra
//   para duas execuções simultâneas.
import type { EstadoDaOs, Responsavel } from './corretiva';
import {
  type Periodicidade,
  type UnidadeDePeriodicidade,
  ocorrenciaMaisRecenteAte,
} from './plano-preventivo';

/**
 * A OS preventiva que ainda prende o plano: a que não foi concluída. A
 * concluída, esperando o aceite, já teve o serviço feito, e a ocorrência
 * seguinte do calendário sai mesmo assim.
 */
export const ESTADOS_DA_PREVENTIVA_ABERTA: readonly EstadoDaOs[] = [
  'atribuida',
  'em_execucao',
  'pausada',
];

export const MOTIVOS_DE_PULO = [
  /** A ocorrência já tem OS (o job rodou de novo no mesmo dia). */
  'ja_gerada',
  /** A OS de uma ocorrência anterior do mesmo plano e ativo ainda está aberta. */
  'os_anterior_aberta',
  /** O responsável padrão foi desativado ou não é mais Técnico do hotel. */
  'sem_responsavel',
  /** O alvo não tem ativo: o ativo foi desativado, ou a categoria não tem nenhum. */
  'sem_ativo',
  /** O ativo entrou no hotel depois da data prevista: espera a próxima ocorrência. */
  'ativo_posterior',
] as const;
export type MotivoDePulo = (typeof MOTIVOS_DE_PULO)[number];

export interface PlanoParaGerar {
  id: string;
  nome: string;
  versao: number;
  inicio: string;
  intervalo: number;
  unidade: UnidadeDePeriodicidade;
  checklistModeloId: string | null;
  /** O responsável padrão; null quando o plano não tem um válido hoje. */
  responsavel: Responsavel | null;
}

export interface AtivoParaGerar {
  id: string;
  /** O local atual do ativo: a OS nasce nele. */
  localId: string;
  /** O dia (no fuso do hotel) em que o ativo foi cadastrado. */
  cadastradoEm: string;
}

/** Uma OS que o plano já gerou, para o ativo e a data prevista dela. */
export interface PreventivaGerada {
  ativoId: string;
  dataPrevista: string;
  estado: EstadoDaOs;
}

/** A cópia do plano que a OS guarda (ADR-026): mudar o plano não muda a OS gerada. */
export interface PlanoAplicado {
  planoId: string;
  nome: string;
  versao: number;
  intervalo: number;
  unidade: UnidadeDePeriodicidade;
}

export interface PreventivaAGerar {
  planoId: string;
  ativoId: string;
  localId: string;
  dataPrevista: string;
  responsavel: Responsavel;
  checklistModeloId: string | null;
  planoAplicado: PlanoAplicado;
}

export interface PlanejamentoDaGeracao {
  /** A data prevista da vez; null antes do início do plano. */
  dataPrevista: string | null;
  geradas: PreventivaAGerar[];
  /** Os ativos pulados; com ativoId null, o plano inteiro (sem responsável ou sem ativo). */
  puladas: { ativoId: string | null; motivo: MotivoDePulo }[];
}

export const copiaDoPlano = (p: PlanoParaGerar): PlanoAplicado => ({
  planoId: p.id,
  nome: p.nome,
  versao: p.versao,
  intervalo: p.intervalo,
  unidade: p.unidade,
});

/**
 * O que gerar hoje para um plano ativo. `hoje` é o dia no fuso do hotel
 * (diaNoFuso); `ativos`, os do alvo, já sem os desativados e os pendentes de
 * aprovação; `geradas`, as OS do plano para esses ativos.
 */
export function planejarGeracao(p: {
  plano: PlanoParaGerar;
  ativos: readonly AtivoParaGerar[];
  geradas: readonly PreventivaGerada[];
  hoje: string;
}): PlanejamentoDaGeracao {
  const periodicidade: Periodicidade = { intervalo: p.plano.intervalo, unidade: p.plano.unidade };
  const data = ocorrenciaMaisRecenteAte({ inicio: p.plano.inicio, ...periodicidade }, p.hoje);
  if (data === null) return { dataPrevista: null, geradas: [], puladas: [] };

  const responsavel = p.plano.responsavel;
  if (responsavel === null) {
    return {
      dataPrevista: data,
      geradas: [],
      puladas: [{ ativoId: null, motivo: 'sem_responsavel' }],
    };
  }
  if (p.ativos.length === 0) {
    return { dataPrevista: data, geradas: [], puladas: [{ ativoId: null, motivo: 'sem_ativo' }] };
  }

  const planoAplicado = copiaDoPlano(p.plano);
  const geradas: PreventivaAGerar[] = [];
  const puladas: PlanejamentoDaGeracao['puladas'] = [];
  for (const ativo of [...p.ativos].sort((a, b) => a.id.localeCompare(b.id))) {
    const doAtivo = p.geradas.filter((g) => g.ativoId === ativo.id);
    const motivo: MotivoDePulo | null = doAtivo.some((g) => g.dataPrevista === data)
      ? 'ja_gerada'
      : doAtivo.some((g) => ESTADOS_DA_PREVENTIVA_ABERTA.includes(g.estado))
        ? 'os_anterior_aberta'
        : ativo.cadastradoEm > data
          ? 'ativo_posterior'
          : null;
    if (motivo) {
      puladas.push({ ativoId: ativo.id, motivo });
      continue;
    }
    geradas.push({
      planoId: p.plano.id,
      ativoId: ativo.id,
      localId: ativo.localId,
      dataPrevista: data,
      responsavel,
      checklistModeloId: p.plano.checklistModeloId,
      planoAplicado,
    });
  }
  return { dataPrevista: data, geradas, puladas };
}
