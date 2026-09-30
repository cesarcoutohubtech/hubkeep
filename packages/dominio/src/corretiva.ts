// Máquina de estados da corretiva (fase 1a, C1; ADR-027). Os estados canônicos
// do chamado e da OS são fixos aqui, porque o SLA e os indicadores (1c)
// dependem deles; o tenant só dá nome, ordem e cor às situações ligadas a cada
// estado (situacoes.ts). As transições e quem pode fazer cada uma, por papel,
// são regra deste módulo. A RLS das tabelas do chamado e da OS (C2 e C3)
// repete o "quem" pelo escopo; aqui a aplicação recusa antes, com código.
//
// O chamado anda sozinho só na triagem e no cancelamento antes da OS. Depois,
// quem anda é a OS, e cada ação dela diz o reflexo no chamado (gerar a OS põe o
// chamado em execução; concluir, em aguardando aceite; aceitar, em concluído;
// cancelar a OS devolve o chamado à triagem, para ganhar outra OS).
// A aplicação grava os dois na mesma unit of work.
import { Conflito, PermissaoNegada, RegraViolada } from './erros';
import { escopoCobreHotel } from './equipes';
import { vigente } from './permissoes';
import type { Atribuicao, Papel } from './tipos';

export const ESTADOS_DO_CHAMADO = [
  'aberto',
  'em_triagem',
  'em_execucao',
  'aguardando_aceite',
  'concluido',
  'cancelado',
] as const;
export type EstadoDoChamado = (typeof ESTADOS_DO_CHAMADO)[number];

export const ESTADOS_DA_OS = [
  'atribuida',
  'em_execucao',
  'pausada',
  'concluida',
  'aceita',
  'cancelada',
] as const;
export type EstadoDaOs = (typeof ESTADOS_DA_OS)[number];

export const ACOES_DO_CHAMADO = ['triar', 'cancelar'] as const;
export type AcaoDoChamado = (typeof ACOES_DO_CHAMADO)[number];

export const ACOES_DA_OS = [
  'gerar',
  'reatribuir',
  'iniciar',
  'pausar',
  'retomar',
  'concluir',
  'aceitar',
  'reabrir',
  'cancelar',
] as const;
export type AcaoDaOs = (typeof ACOES_DA_OS)[number];

/** Abre chamado quem tem escrita no hotel: todo papel, menos o proprietário (authz.hoteis_escrita). */
export const PAPEIS_QUE_ABREM_CHAMADO: readonly Papel[] = [
  'admin_grupo',
  'gestor_csc',
  'implantador',
  'gerente_hotel',
  'tecnico',
  'solicitante',
];

/** Triagem, geração, reatribuição e cancelamento no hotel (C3). */
export const PAPEIS_DA_TRIAGEM: readonly Papel[] = ['gestor_csc', 'gerente_hotel'];

/**
 * O Admin do grupo é um grupo à parte (Cesar, 29/09/2026): hoje faz o mesmo
 * que a triagem, mas terá alçadas e permissões a mais que o Gestor CSC e o
 * Gerente. Uma alçada nova entra como transição com o grupo `administracao`.
 */
export const PAPEIS_DA_ADMINISTRACAO: readonly Papel[] = ['admin_grupo'];

/**
 * Grupos de quem faz a ação (vale se o ator estiver em algum dos grupos da transição):
 * - administracao: o Admin do grupo;
 * - triagem: um dos PAPEIS_DA_TRIAGEM no hotel;
 * - responsavel: Técnico no hotel e responsável pela OS (ele, ou a equipe dele);
 * - aceite: quem abriu o chamado, se ainda escreve no hotel, ou o Gerente do hotel (C6).
 */
export const GRUPOS_DA_CORRETIVA = ['administracao', 'triagem', 'responsavel', 'aceite'] as const;
type Quem = (typeof GRUPOS_DA_CORRETIVA)[number];
const GESTAO: readonly Quem[] = ['administracao', 'triagem'];

interface Transicao<E extends string> {
  de: readonly E[];
  para: E;
  quem: readonly Quem[];
  exigeMotivo: boolean;
}

export const TRANSICOES_DO_CHAMADO: { [A in AcaoDoChamado]: Transicao<EstadoDoChamado> } = {
  triar: { de: ['aberto'], para: 'em_triagem', quem: GESTAO, exigeMotivo: false },
  cancelar: {
    de: ['aberto', 'em_triagem'],
    para: 'cancelado',
    quem: GESTAO,
    exigeMotivo: true,
  },
};

interface TransicaoDaOs extends Transicao<EstadoDaOs | 'nova'> {
  /** Estado do chamado depois da ação; nulo, o chamado não muda. */
  chamado: { de: readonly EstadoDoChamado[]; para: EstadoDoChamado } | null;
}

export const TRANSICOES_DA_OS: { [A in AcaoDaOs]: TransicaoDaOs } = {
  gerar: {
    de: ['nova'],
    para: 'atribuida',
    quem: GESTAO,
    exigeMotivo: false,
    chamado: { de: ['aberto', 'em_triagem'], para: 'em_execucao' },
  },
  reatribuir: {
    de: ['atribuida', 'em_execucao', 'pausada'],
    para: 'atribuida',
    quem: GESTAO,
    exigeMotivo: false,
    chamado: null,
  },
  iniciar: {
    de: ['atribuida'],
    para: 'em_execucao',
    quem: ['responsavel'],
    exigeMotivo: false,
    chamado: null,
  },
  pausar: {
    de: ['em_execucao'],
    para: 'pausada',
    quem: ['responsavel'],
    exigeMotivo: false,
    chamado: null,
  },
  retomar: {
    de: ['pausada'],
    para: 'em_execucao',
    quem: ['responsavel'],
    exigeMotivo: false,
    chamado: null,
  },
  concluir: {
    de: ['em_execucao'],
    para: 'concluida',
    quem: ['responsavel'],
    exigeMotivo: false,
    chamado: { de: ['em_execucao'], para: 'aguardando_aceite' },
  },
  aceitar: {
    de: ['concluida'],
    para: 'aceita',
    quem: ['aceite'],
    exigeMotivo: false,
    chamado: { de: ['aguardando_aceite'], para: 'concluido' },
  },
  reabrir: {
    de: ['concluida'],
    para: 'em_execucao',
    quem: ['aceite'],
    exigeMotivo: true,
    chamado: { de: ['aguardando_aceite'], para: 'em_execucao' },
  },
  cancelar: {
    de: ['atribuida', 'em_execucao', 'pausada'],
    para: 'cancelada',
    quem: GESTAO,
    exigeMotivo: true,
    chamado: { de: ['em_execucao'], para: 'em_triagem' },
  },
};

/**
 * No máximo uma OS não cancelada por chamado (Cesar, 29/09/2026). A cancelada
 * libera o chamado para outra; a concluída que volta no aceite recusado
 * (reabrir) é a mesma OS, sem criar outra. A OS preventiva (1b) não tem
 * chamado e fica fora. O índice único parcial os_uma_ativa_por_chamado
 * (migração 0022) repete a regra, para as duas triagens simultâneas que esta
 * checagem, sozinha, não vê; o teste de integração confere a paridade.
 */
export const osOcupaOChamado = (estado: EstadoDaOs): boolean => estado !== 'cancelada';

export function exigirChamadoSemOsEmAndamento(estadosDasOs: readonly EstadoDaOs[]): void {
  if (estadosDasOs.some(osOcupaOChamado)) {
    throw new Conflito('os_em_andamento', 'O chamado já tem uma OS em andamento.');
  }
}

/** A OS vai para um técnico ou para uma equipe do hotel (A6). */
export type Responsavel =
  { tipo: 'tecnico'; usuarioId: string } | { tipo: 'equipe'; equipeId: string };

/** Quem pede a ação, como a regra precisa enxergá-lo. */
export interface AtorDaCorretiva {
  usuarioId: string;
  atribuicoes: readonly Atribuicao[];
  /** Equipes do hotel de que o ator é membro. */
  equipes: readonly string[];
}

export interface ChamadoParaRegra {
  hotel: { id: string; bandeiraId: string | null };
  estado: EstadoDoChamado;
  abertoPor: string;
}

export const LIMITE_MOTIVO = 500;

function temPapelNoHotel(
  ator: AtorDaCorretiva,
  papeis: readonly Papel[],
  hotel: ChamadoParaRegra['hotel'],
  agora: Date,
): boolean {
  return ator.atribuicoes.some(
    (a) => vigente(a, agora) && papeis.includes(a.papel) && escopoCobreHotel(a, hotel),
  );
}

/** Quem tem escrita no hotel abre chamado, inclusive o Solicitante (C2). */
export function podeAbrirChamado(
  ator: AtorDaCorretiva,
  hotel: ChamadoParaRegra['hotel'],
  agora: Date,
): void {
  if (!temPapelNoHotel(ator, PAPEIS_QUE_ABREM_CHAMADO, hotel, agora)) {
    throw new PermissaoNegada('chamado_fora_do_escopo', 'Você não abre chamado neste hotel.', {
      hotelId: hotel.id,
    });
  }
}

/**
 * Encerrar a parada do ativo fora da execução (C5, pelo web): o Admin e os
 * papéis da triagem no hotel. O responsável encerra na OS, pelo
 * decidirRegistroNaOs.
 */
export function podeEncerrarParada(
  ator: AtorDaCorretiva,
  hotel: ChamadoParaRegra['hotel'],
  agora: Date,
): void {
  if (!temPapelNoHotel(ator, [...PAPEIS_DA_ADMINISTRACAO, ...PAPEIS_DA_TRIAGEM], hotel, agora)) {
    throw new PermissaoNegada('parada_fora_do_papel', 'Você não encerra paradas neste hotel.', {
      hotelId: hotel.id,
    });
  }
}

/** Classificar e ajustar a prioridade do chamado: o Admin e os papéis da triagem (C3). */
export function podeTriar(
  ator: AtorDaCorretiva,
  hotel: ChamadoParaRegra['hotel'],
  agora: Date,
): void {
  if (!temPapelNoHotel(ator, [...PAPEIS_DA_ADMINISTRACAO, ...PAPEIS_DA_TRIAGEM], hotel, agora)) {
    throw new PermissaoNegada('triagem_fora_do_papel', 'Você não faz a triagem neste hotel.', {
      hotelId: hotel.id,
    });
  }
}

const ehResponsavel = (ator: AtorDaCorretiva, r: Responsavel | null): boolean =>
  r !== null &&
  (r.tipo === 'tecnico' ? r.usuarioId === ator.usuarioId : ator.equipes.includes(r.equipeId));

function estaNoGrupo(
  grupo: Quem,
  ator: AtorDaCorretiva,
  chamado: ChamadoParaRegra,
  agora: Date,
): boolean {
  switch (grupo) {
    case 'administracao':
      return temPapelNoHotel(ator, PAPEIS_DA_ADMINISTRACAO, chamado.hotel, agora);
    case 'triagem':
      return temPapelNoHotel(ator, PAPEIS_DA_TRIAGEM, chamado.hotel, agora);
    case 'responsavel':
      return temPapelNoHotel(ator, ['tecnico'], chamado.hotel, agora);
    case 'aceite':
      return (
        (chamado.abertoPor === ator.usuarioId &&
          temPapelNoHotel(ator, PAPEIS_QUE_ABREM_CHAMADO, chamado.hotel, agora)) ||
        temPapelNoHotel(ator, ['gerente_hotel'], chamado.hotel, agora)
      );
  }
}

function exigirPapel(
  quem: readonly Quem[],
  acao: string,
  ator: AtorDaCorretiva,
  chamado: ChamadoParaRegra,
  agora: Date,
): void {
  if (!quem.some((g) => estaNoGrupo(g, ator, chamado, agora))) {
    throw new PermissaoNegada('acao_fora_do_papel', 'Você não pode fazer esta ação neste hotel.', {
      acao,
    });
  }
}

/** Motivo de cancelamento ou reabertura: sem espaços nas pontas, de 1 a 500 caracteres. */
export function normalizarMotivo(motivo: string | null | undefined): string {
  const limpo = (motivo ?? '').trim().replace(/\s+/g, ' ');
  if (limpo.length === 0 || limpo.length > LIMITE_MOTIVO) {
    throw new RegraViolada('motivo_obrigatorio', 'Informe o motivo.', { maximo: LIMITE_MOTIVO });
  }
  return limpo;
}

/**
 * Ação sobre o chamado antes da OS. Confere, nesta ordem: o papel (403), o
 * estado (409, transicao_invalida) e o motivo (422). Devolve o estado novo e o
 * motivo normalizado, quando a ação exige.
 */
export function decidirNoChamado(
  acao: AcaoDoChamado,
  p: {
    ator: AtorDaCorretiva;
    chamado: ChamadoParaRegra;
    motivo?: string | null | undefined;
    agora: Date;
  },
): { estado: EstadoDoChamado; motivo: string | null } {
  const t = TRANSICOES_DO_CHAMADO[acao];
  exigirPapel(t.quem, acao, p.ator, p.chamado, p.agora);
  if (!t.de.includes(p.chamado.estado)) {
    throw new Conflito('transicao_invalida', 'A ação não vale no estado atual.', {
      acao,
      estado: p.chamado.estado,
    });
  }
  return { estado: t.para, motivo: t.exigeMotivo ? normalizarMotivo(p.motivo) : null };
}

/**
 * Ação sobre a OS. `os` é nulo para gerar, e `osDoChamado` (os estados das OS
 * que o chamado já tem) é obrigatório para gerar. Confere o papel (403), o
 * estado da OS (409, transicao_invalida), a OS em andamento no chamado (409,
 * os_em_andamento), o estado do chamado (409, transicao_invalida), o
 * responsável (409, os_de_outro_responsavel) e o motivo (422). Devolve o
 * estado novo da OS, o do chamado (nulo se não muda) e o motivo normalizado.
 */
export function decidirNaOs(
  acao: AcaoDaOs,
  p: {
    ator: AtorDaCorretiva;
    chamado: ChamadoParaRegra;
    os: { estado: EstadoDaOs; responsavel: Responsavel } | null;
    osDoChamado?: readonly EstadoDaOs[];
    motivo?: string | null | undefined;
    agora: Date;
  },
): { estado: EstadoDaOs; chamado: EstadoDoChamado | null; motivo: string | null } {
  const t = TRANSICOES_DA_OS[acao];
  const estadoDaOs = p.os?.estado ?? 'nova';
  const invalida = () =>
    new Conflito('transicao_invalida', 'A ação não vale no estado atual.', {
      acao,
      estado: estadoDaOs,
    });
  exigirPapel(t.quem, acao, p.ator, p.chamado, p.agora);
  if (!t.de.includes(estadoDaOs)) throw invalida();
  if (acao === 'gerar') {
    if (!p.osDoChamado) throw new Error('decidirNaOs(gerar) precisa das OS do chamado.');
    exigirChamadoSemOsEmAndamento(p.osDoChamado);
  }
  if (t.chamado && !t.chamado.de.includes(p.chamado.estado)) throw invalida();
  // Técnico do hotel, mas a OS é de outro (ou foi reatribuída com a operação
  // offline na fila): conflito com o estado atual, visível no PWA (ADR-025).
  if (t.quem.includes('responsavel') && !ehResponsavel(p.ator, p.os?.responsavel ?? null)) {
    throw new Conflito('os_de_outro_responsavel', 'A OS está com outro responsável.', { acao });
  }
  return {
    estado: t.para as EstadoDaOs,
    chamado: t.chamado?.para ?? null,
    motivo: t.exigeMotivo ? normalizarMotivo(p.motivo) : null,
  };
}

/** O que o responsável registra na OS, além das transições (C4), e a parada do ativo (C5). */
export const REGISTROS_NA_OS = [
  'apontar_horas',
  'registrar_material',
  'anexar_foto',
  'registrar_parada',
  'encerrar_parada',
] as const;
export type RegistroNaOs = (typeof REGISTROS_NA_OS)[number];

/** Registrar na OS só com ela em execução ou pausada (entre iniciar e concluir). */
export const ESTADOS_QUE_ACEITAM_REGISTRO: readonly EstadoDaOs[] = ['em_execucao', 'pausada'];

/**
 * Apontar horas, registrar material, anexar foto ou registrar e encerrar a
 * parada do ativo (C5): o Técnico do hotel
 * responsável pela OS (403 fora do papel; 409 os_de_outro_responsavel), com a
 * OS em execução ou pausada (409 transicao_invalida).
 */
export function decidirRegistroNaOs(
  registro: RegistroNaOs,
  p: {
    ator: AtorDaCorretiva;
    chamado: ChamadoParaRegra;
    os: { estado: EstadoDaOs; responsavel: Responsavel };
    agora: Date;
  },
): void {
  exigirPapel(['responsavel'], registro, p.ator, p.chamado, p.agora);
  if (!ESTADOS_QUE_ACEITAM_REGISTRO.includes(p.os.estado)) {
    throw new Conflito('transicao_invalida', 'A ação não vale no estado atual.', {
      acao: registro,
      estado: p.os.estado,
    });
  }
  if (!ehResponsavel(p.ator, p.os.responsavel)) {
    throw new Conflito('os_de_outro_responsavel', 'A OS está com outro responsável.', {
      acao: registro,
    });
  }
}
