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
 *   Quem abriu e também executa a OS (responsável, ou membro da equipe
 *   responsável) não decide o aceite: só o Gerente do hotel, outro que não ele
 *   (decisão do Cesar, 30/09/2026). Se não há Gerente ativo no hotel além de
 *   quem abriu, decidem o Gestor CSC ou o Admin do grupo (Cesar, 30/09/2026).
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

/**
 * O que o aceite precisa ver além do ator, lido com o contexto de quem pede:
 * as equipes de quem abriu o chamado (ele executa a OS?) e as atribuições de
 * Gerente, de membro ativo, que podem cobrir o hotel. A RLS mostra as de
 * Gerente ao Admin e ao Gestor CSC do hotel (0027), justamente os que decidem
 * quando não há outro Gerente; para os demais a lista vem vazia, sem efeito.
 */
export interface DadosDoAceite {
  equipesDeQuemAbriu: readonly string[];
  gerentes: readonly Atribuicao[];
}

/** Decidem o aceite quando quem abriu executa a OS e não há outro Gerente ativo no hotel. */
export const PAPEIS_DO_ACEITE_SEM_GERENTE: readonly Papel[] = ['gestor_csc', 'admin_grupo'];

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
  if (!encerraParadaNoHotel(ator, hotel, agora)) {
    throw new PermissaoNegada('parada_fora_do_papel', 'Você não encerra paradas neste hotel.', {
      hotelId: hotel.id,
    });
  }
}

const PAPEIS_QUE_ENCERRAM_PARADA: readonly Papel[] = [
  ...PAPEIS_DA_ADMINISTRACAO,
  ...PAPEIS_DA_TRIAGEM,
];

/**
 * Marcar a UH indisponível depois da abertura e liberá-la pelo web (I4): o
 * Admin e os papéis da triagem no hotel, como na parada. Quem conclui a OS
 * libera na conclusão, pela regra da transição.
 */
export function podeGerirUhIndisponivel(
  ator: AtorDaCorretiva,
  hotel: ChamadoParaRegra['hotel'],
  agora: Date,
): void {
  if (!temPapelNoHotel(ator, PAPEIS_QUE_ENCERRAM_PARADA, hotel, agora)) {
    throw new PermissaoNegada(
      'uh_indisponivel_fora_do_papel',
      'Você não marca nem libera UH neste hotel.',
      { hotelId: hotel.id },
    );
  }
}

/** O mesmo que podeEncerrarParada, sem erro: filtra a lista das paradas pendentes. */
export const encerraParadaNoHotel = (
  ator: AtorDaCorretiva,
  hotel: ChamadoParaRegra['hotel'],
  agora: Date,
): boolean => temPapelNoHotel(ator, PAPEIS_QUE_ENCERRAM_PARADA, hotel, agora);

/**
 * A lista das paradas abertas com OS concluída (C5, decisão do Cesar de
 * 30/09/2026): o Admin do grupo, o Gestor CSC e o Gerente do hotel, cada um
 * com as dos hotéis dele (encerraParadaNoHotel).
 */
export function podeListarParadasPendentes(ator: AtorDaCorretiva, agora: Date): void {
  if (
    !ator.atribuicoes.some((a) => vigente(a, agora) && PAPEIS_QUE_ENCERRAM_PARADA.includes(a.papel))
  ) {
    throw new PermissaoNegada('parada_fora_do_papel', 'Você não acompanha paradas.');
  }
}

/**
 * O proprietário vê da parada só o ativo, o estado e as datas, sem o chamado,
 * a OS e quem abriu ou encerrou (decisão do Cesar de 30/09/2026). Vê tudo quem
 * tem no hotel um papel que não é o de proprietário.
 */
export const veDetalhesDaParada = (
  ator: AtorDaCorretiva,
  hotel: ChamadoParaRegra['hotel'],
  agora: Date,
): boolean => temPapelNoHotel(ator, PAPEIS_QUE_ABREM_CHAMADO, hotel, agora);

/** OS que já saiu da execução por conclusão: concluída (chamado aguardando aceite) ou aceita. */
export const ESTADOS_DA_OS_CONCLUIDA: readonly EstadoDaOs[] = ['concluida', 'aceita'];

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

/**
 * Quem abriu executa a OS e nenhum outro Gerente, vigente, cobre o hotel: o
 * aceite passa ao Gestor CSC e ao Admin do grupo. Sem os dados, falha fechada.
 */
function aceiteSemOutroGerente(
  chamado: ChamadoParaRegra,
  r: Responsavel | null,
  dados: DadosDoAceite | undefined,
  agora: Date,
): boolean {
  if (!dados || r === null) return false;
  const quemAbriu = {
    usuarioId: chamado.abertoPor,
    atribuicoes: [],
    equipes: dados.equipesDeQuemAbriu,
  };
  if (!ehResponsavel(quemAbriu, r)) return false;
  return !dados.gerentes.some(
    (a) =>
      a.usuarioId !== chamado.abertoPor &&
      a.papel === 'gerente_hotel' &&
      vigente(a, agora) &&
      escopoCobreHotel(a, chamado.hotel),
  );
}

type OsParaPapel = { responsavel: Responsavel; aceite?: DadosDoAceite | undefined } | null;

function estaNoGrupo(
  grupo: Quem,
  ator: AtorDaCorretiva,
  chamado: ChamadoParaRegra,
  os: OsParaPapel,
  agora: Date,
): boolean {
  switch (grupo) {
    case 'administracao':
      return temPapelNoHotel(ator, PAPEIS_DA_ADMINISTRACAO, chamado.hotel, agora);
    case 'triagem':
      return temPapelNoHotel(ator, PAPEIS_DA_TRIAGEM, chamado.hotel, agora);
    case 'responsavel':
      return temPapelNoHotel(ator, ['tecnico'], chamado.hotel, agora);
    case 'aceite': {
      const abriu = chamado.abertoPor === ator.usuarioId;
      const r = os?.responsavel ?? null;
      if (abriu && ehResponsavel(ator, r)) return false;
      if (temPapelNoHotel(ator, ['gerente_hotel'], chamado.hotel, agora)) return true;
      if (abriu) return temPapelNoHotel(ator, PAPEIS_QUE_ABREM_CHAMADO, chamado.hotel, agora);
      return (
        aceiteSemOutroGerente(chamado, r, os?.aceite, agora) &&
        temPapelNoHotel(ator, PAPEIS_DO_ACEITE_SEM_GERENTE, chamado.hotel, agora)
      );
    }
  }
}

function exigirPapel(
  quem: readonly Quem[],
  acao: string,
  ator: AtorDaCorretiva,
  chamado: ChamadoParaRegra,
  os: OsParaPapel,
  agora: Date,
): void {
  if (!quem.some((g) => estaNoGrupo(g, ator, chamado, os, agora))) {
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
  exigirPapel(t.quem, acao, p.ator, p.chamado, null, p.agora);
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
 * `aceite` só conta para aceitar e reabrir (DadosDoAceite).
 */
export function decidirNaOs(
  acao: AcaoDaOs,
  p: {
    ator: AtorDaCorretiva;
    chamado: ChamadoParaRegra;
    os: { estado: EstadoDaOs; responsavel: Responsavel } | null;
    osDoChamado?: readonly EstadoDaOs[];
    motivo?: string | null | undefined;
    aceite?: DadosDoAceite;
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
  const os = p.os && { responsavel: p.os.responsavel, aceite: p.aceite };
  exigirPapel(t.quem, acao, p.ator, p.chamado, os, p.agora);
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
  'responder_checklist',
] as const;
export type RegistroNaOs = (typeof REGISTROS_NA_OS)[number];

/** Registrar na OS só com ela em execução ou pausada (entre iniciar e concluir). */
export const ESTADOS_QUE_ACEITAM_REGISTRO: readonly EstadoDaOs[] = ['em_execucao', 'pausada'];

/**
 * A foto vale também na OS atribuída, ainda não iniciada: é a foto "antes"
 * (I8, desenho aprovado em 08/10/2026).
 */
export const ESTADOS_QUE_ACEITAM_FOTO: readonly EstadoDaOs[] = [
  'atribuida',
  ...ESTADOS_QUE_ACEITAM_REGISTRO,
];

/**
 * Apontar horas, registrar material, anexar foto, registrar e encerrar a
 * parada do ativo (C5) ou responder o checklist (PV1): o Técnico do hotel
 * responsável pela OS (403 fora do papel; 409 os_de_outro_responsavel), com a
 * OS em execução ou pausada (409 transicao_invalida). A foto vale também na
 * OS atribuída (I8).
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
  exigirPapel(['responsavel'], registro, p.ator, p.chamado, p.os, p.agora);
  const estados =
    registro === 'anexar_foto' ? ESTADOS_QUE_ACEITAM_FOTO : ESTADOS_QUE_ACEITAM_REGISTRO;
  if (!estados.includes(p.os.estado)) {
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
