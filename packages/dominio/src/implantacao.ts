// Painel de implantação do hotel (fase 1a, A5): o que falta para o hotel
// operar. Quem vê: o Admin do grupo e o Implantador vigente do hotel. O
// Implantador cadastra pessoas abaixo do próprio papel (regras de concessão,
// permissoes.ts) e não ativa hotel nem libera licença (podeAtivarHotel).
//
// O painel olha o hotel (o modelo contratual, I2), locais, ativos (B3) e
// pessoas. Locais sem ativo contam só
// ativos ativos em locais não inativos; o ativo sempre tem local (NOT NULL),
// então a pendência de ativo é só a falta de categoria.
import { PermissaoNegada } from './erros';
import type { ModeloContratual } from './hoteis';
import { type Resultado, ehAdminGrupo, hoteisComoImplantador, vigente } from './permissoes';
import type { Atribuicao, Papel } from './tipos';
import type { PlanoQueCobre } from './plano-preventivo';
import { type AtivoParaSugestao, ativoSemPlanoComModelo } from './sugestoes-de-plano';

export const PENDENCIAS_DE_IMPLANTACAO = [
  'modelo_contratual_nao_informado',
  'sem_locais',
  'uhs_pendentes_de_licenca',
  'locais_sem_ativo',
  'ativos_sem_categoria',
  'sem_gerente',
  'sem_tecnico',
  'pessoas_sem_papel_vigente',
] as const;
export type PendenciaDeImplantacao = (typeof PENDENCIAS_DE_IMPLANTACAO)[number];

export interface HotelParaImplantacao {
  /** Nulo: não informado (I2), e o painel aponta a pendência. */
  modeloContratual: ModeloContratual | null;
}

export interface LocalParaImplantacao {
  id: string;
  tipo: 'uh' | 'area_comum';
  status: 'ativo' | 'pendente_licenca' | 'inativo';
}

/** O ativo do painel; id, modelo e descarte dão o contador de sem plano (M1). */
export interface AtivoParaImplantacao extends AtivoParaSugestao {
  localId: string;
}

export interface PessoaParaImplantacao {
  usuarioId: string;
  nome: string;
  ativo: boolean;
  atribuicoes: readonly Atribuicao[];
}

export interface ResumoDeImplantacao {
  locais: { uhsAtivas: number; uhsPendentes: number; areasComuns: number; inativos: number };
  /**
   * Ativos ativos, os sem categoria, os locais não inativos sem nenhum ativo
   * ativo e os ativos com modelo e sem plano que os cubra, sem descarte (M1).
   */
  ativos: {
    ativos: number;
    semCategoria: number;
    locaisSemAtivo: number;
    comModeloSemPlano: number;
  };
  /** Pessoas distintas com papel vigente no hotel (escopo hotel), por papel. */
  papeis: { papel: Papel; pessoas: number }[];
  /** Tiveram papel no hotel, mas nenhum vigente (vencido ou revogado), ou o membro está inativo. */
  pessoasSemPapelVigente: { usuarioId: string; nome: string }[];
  pendencias: PendenciaDeImplantacao[];
}

export function podeVerImplantacao(
  minhas: readonly Atribuicao[],
  hotelId: string,
  agora: Date,
): Resultado {
  return ehAdminGrupo(minhas, agora) || hoteisComoImplantador(minhas, agora).has(hotelId)
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'implantacao_fora_do_escopo',
          'Só o Admin do grupo e o Implantador do hotel veem a implantação.',
        ),
      };
}

export function resumirImplantacao(
  hotelId: string,
  locais: readonly LocalParaImplantacao[],
  pessoas: readonly PessoaParaImplantacao[],
  agora: Date,
  ativos: readonly AtivoParaImplantacao[] = [],
  hotel: HotelParaImplantacao = { modeloContratual: null },
  planos: readonly PlanoQueCobre[] = [],
): ResumoDeImplantacao {
  const contar = (f: (l: LocalParaImplantacao) => boolean) => locais.filter(f).length;
  const resumoLocais = {
    uhsAtivas: contar((l) => l.tipo === 'uh' && l.status === 'ativo'),
    uhsPendentes: contar((l) => l.tipo === 'uh' && l.status === 'pendente_licenca'),
    areasComuns: contar((l) => l.tipo === 'area_comum' && l.status !== 'inativo'),
    inativos: contar((l) => l.status === 'inativo'),
  };
  const ativosAtivos = ativos.filter((a) => a.ativo);
  const comAtivo = new Set(ativosAtivos.map((a) => a.localId));
  const resumoAtivos = {
    ativos: ativosAtivos.length,
    semCategoria: ativosAtivos.filter((a) => a.categoriaId === null).length,
    locaisSemAtivo: contar((l) => l.status !== 'inativo' && !comAtivo.has(l.id)),
    comModeloSemPlano: ativosAtivos.filter((a) => ativoSemPlanoComModelo(a, planos)).length,
  };

  const noHotel = (a: Atribuicao) => a.escopo.tipo === 'hotel' && a.escopo.hotelId === hotelId;
  const porPapel = new Map<Papel, Set<string>>();
  const semPapel: { usuarioId: string; nome: string }[] = [];
  for (const p of pessoas) {
    const doHotel = p.atribuicoes.filter(noHotel);
    if (doHotel.length === 0) continue;
    const vigentes = p.ativo ? doHotel.filter((a) => vigente(a, agora)) : [];
    if (vigentes.length === 0) semPapel.push({ usuarioId: p.usuarioId, nome: p.nome });
    for (const a of vigentes) {
      const s = porPapel.get(a.papel) ?? new Set<string>();
      s.add(p.usuarioId);
      porPapel.set(a.papel, s);
    }
  }
  const papeis = [...porPapel.entries()]
    .map(([papel, s]) => ({ papel, pessoas: s.size }))
    .sort((a, b) => a.papel.localeCompare(b.papel));

  const tem = (papel: Papel) => (porPapel.get(papel)?.size ?? 0) > 0;
  const pendencias = PENDENCIAS_DE_IMPLANTACAO.filter((p) => {
    switch (p) {
      case 'modelo_contratual_nao_informado':
        return hotel.modeloContratual === null;
      case 'sem_locais':
        return resumoLocais.uhsAtivas + resumoLocais.uhsPendentes + resumoLocais.areasComuns === 0;
      case 'uhs_pendentes_de_licenca':
        return resumoLocais.uhsPendentes > 0;
      case 'locais_sem_ativo':
        return resumoAtivos.locaisSemAtivo > 0;
      case 'ativos_sem_categoria':
        return resumoAtivos.semCategoria > 0;
      case 'sem_gerente':
        return !tem('gerente_hotel');
      case 'sem_tecnico':
        return !tem('tecnico');
      case 'pessoas_sem_papel_vigente':
        return semPapel.length > 0;
    }
  });

  return {
    locais: resumoLocais,
    ativos: resumoAtivos,
    papeis,
    pessoasSemPapelVigente: semPapel,
    pendencias,
  };
}

/**
 * A meta do produto para a implantação (PB1): o hotel pronto em até 1 dia,
 * sem contar o levantamento de ativos.
 */
export const META_DA_IMPLANTACAO_MS = 24 * 60 * 60 * 1000;

/** Uma mudança de situação do hotel, tirada da auditoria (sem migração, PB1). */
export interface MudancaDeSituacaoDoHotel {
  em: Date;
  /** A situação depois da mudança (`depois.status` da auditoria). */
  status: string | null;
}

export interface TempoDeImplantacao {
  /** Quando o hotel entrou em implantação. */
  entrouEm: Date;
  /** Quando ficou pronto (ativado); nulo enquanto não fica. */
  prontoEm: Date | null;
  /**
   * Do início até o pronto, ou até agora enquanto está em implantação. Nulo
   * quando o hotel já saiu da implantação sem a ativação na auditoria (hotel
   * anterior ao registro), porque não há como medir.
   */
  duracaoMs: number | null;
  /** A duração dentro da meta; nulo quando não há duração. */
  dentroDaMeta: boolean | null;
}

/**
 * O tempo de implantação do hotel. Entrou: a primeira mudança para
 * em_implantacao na auditoria; sem ela, a criação do hotel, que já nasce em
 * implantação. Pronto: a primeira ativação depois disso.
 */
export function tempoDaImplantacao(
  hotel: { status: string; criadoEm: Date },
  mudancas: readonly MudancaDeSituacaoDoHotel[],
  agora: Date,
): TempoDeImplantacao {
  const emOrdem = [...mudancas].sort((a, b) => a.em.getTime() - b.em.getTime());
  const entrouEm = emOrdem.find((m) => m.status === 'em_implantacao')?.em ?? hotel.criadoEm;
  const prontoEm =
    emOrdem.find((m) => m.status === 'ativo' && m.em.getTime() >= entrouEm.getTime())?.em ?? null;
  const fim = prontoEm ?? (hotel.status === 'em_implantacao' ? agora : null);
  const duracaoMs = fim ? Math.max(0, fim.getTime() - entrouEm.getTime()) : null;
  return {
    entrouEm,
    prontoEm,
    duracaoMs,
    dentroDaMeta: duracaoMs === null ? null : duracaoMs <= META_DA_IMPLANTACAO_MS,
  };
}
