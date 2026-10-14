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
  type SituacaoDoPlano,
  type UnidadeDePeriodicidade,
  ocorrenciaMaisRecenteAte,
} from './plano-preventivo';
import type { Atribuicao } from './tipos';
import { ehTecnicoDoHotel } from './triagem';

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

/** O responsável padrão do plano como a regra precisa enxergá-lo, no dia da geração. */
export type ResponsavelDoPlano =
  | {
      tipo: 'tecnico';
      usuarioId: string;
      /** O membro segue ativo no tenant (o desativado mantém as atribuições). */
      membroAtivo: boolean;
      atribuicoes: readonly Atribuicao[];
    }
  | { tipo: 'equipe'; equipeId: string; hotelId: string; ativa: boolean };

/**
 * O responsável que ainda vale para receber a OS do plano: o técnico ativo com
 * papel de Técnico vigente que cobre o hotel, ou a equipe ativa do próprio
 * hotel (a mesma regra da triagem, A6). Null quando não vale: o plano não gera
 * e conta como pulado (sem_responsavel).
 */
export function responsavelQueVale(
  r: ResponsavelDoPlano | null,
  hotel: { id: string; bandeiraId: string | null },
  agora: Date,
): Responsavel | null {
  if (r === null) return null;
  if (r.tipo === 'tecnico') {
    return r.membroAtivo && ehTecnicoDoHotel(r.atribuicoes, r.usuarioId, hotel, agora)
      ? { tipo: 'tecnico', usuarioId: r.usuarioId }
      : null;
  }
  return r.ativa && r.hotelId === hotel.id ? { tipo: 'equipe', equipeId: r.equipeId } : null;
}

/**
 * O modelo de checklist que a OS preventiva copia (ADR-040): o do plano, se
 * ainda estiver ativo, a mesma regra da triagem (checklist_modelo_inativo).
 * Desativado, a OS sai sem checklist: o calendário do plano não para.
 */
export function modeloParaACopia<M extends { ativa: boolean }>(modelo: M | null): M | null {
  return modelo?.ativa ? modelo : null;
}

/**
 * O que a tela do plano avisa (PV3c; adendo da PV3 ao ADR-041), para a
 * falha não ficar silenciosa:
 *   - checklist_inativo: o modelo de checklist do plano foi desativado, e a
 *     OS sai sem checklist (o calendário não para);
 *   - responsavel_invalido: o responsável padrão não vale mais (técnico
 *     desativado ou sem papel vigente no hotel, equipe inativa ou de outro
 *     hotel), e o plano não gera OS (sem_responsavel).
 * O plano encerrado não gera nada: sem pendência. O plano sem responsável já
 * aparece como tal na tela; aqui só entra o responsável que deixou de valer.
 */
export const PENDENCIAS_DO_PLANO = ['checklist_inativo', 'responsavel_invalido'] as const;
export type PendenciaDoPlano = (typeof PENDENCIAS_DO_PLANO)[number];

export function pendenciasDoPlano(
  p: {
    situacao: SituacaoDoPlano;
    responsavel: ResponsavelDoPlano | null;
    /** null: o plano não tem modelo, ou quem lê não o vê (não é pendência). */
    modeloAtivo: boolean | null;
  },
  hotel: { id: string; bandeiraId: string | null },
  agora: Date,
): PendenciaDoPlano[] {
  if (p.situacao === 'encerrado') return [];
  const pendencias: PendenciaDoPlano[] = [];
  if (p.modeloAtivo === false) pendencias.push('checklist_inativo');
  if (p.responsavel !== null && responsavelQueVale(p.responsavel, hotel, agora) === null) {
    pendencias.push('responsavel_invalido');
  }
  return pendencias;
}
