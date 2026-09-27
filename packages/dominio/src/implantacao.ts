// Painel de implantação do hotel (fase 1a, A5): o que falta para o hotel
// operar. Quem vê: o Admin do grupo e o Implantador vigente do hotel. O
// Implantador cadastra pessoas abaixo do próprio papel (regras de concessão,
// permissoes.ts) e não ativa hotel nem libera licença (podeAtivarHotel).
//
// Na 1a, o painel olha locais e pessoas; ativos sem local e sem categoria
// entram com a etapa B (B2 e B3), como pendências novas desta lista.
import { PermissaoNegada } from './erros';
import { type Resultado, ehAdminGrupo, hoteisComoImplantador, vigente } from './permissoes';
import type { Atribuicao, Papel } from './tipos';

export const PENDENCIAS_DE_IMPLANTACAO = [
  'sem_locais',
  'uhs_pendentes_de_licenca',
  'sem_gerente',
  'sem_tecnico',
  'pessoas_sem_papel_vigente',
] as const;
export type PendenciaDeImplantacao = (typeof PENDENCIAS_DE_IMPLANTACAO)[number];

export interface LocalParaImplantacao {
  tipo: 'uh' | 'area_comum';
  status: 'ativo' | 'pendente_licenca' | 'inativo';
}

export interface PessoaParaImplantacao {
  usuarioId: string;
  nome: string;
  ativo: boolean;
  atribuicoes: readonly Atribuicao[];
}

export interface ResumoDeImplantacao {
  locais: { uhsAtivas: number; uhsPendentes: number; areasComuns: number; inativos: number };
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
): ResumoDeImplantacao {
  const contar = (f: (l: LocalParaImplantacao) => boolean) => locais.filter(f).length;
  const resumoLocais = {
    uhsAtivas: contar((l) => l.tipo === 'uh' && l.status === 'ativo'),
    uhsPendentes: contar((l) => l.tipo === 'uh' && l.status === 'pendente_licenca'),
    areasComuns: contar((l) => l.tipo === 'area_comum' && l.status !== 'inativo'),
    inativos: contar((l) => l.status === 'inativo'),
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
      case 'sem_locais':
        return resumoLocais.uhsAtivas + resumoLocais.uhsPendentes + resumoLocais.areasComuns === 0;
      case 'uhs_pendentes_de_licenca':
        return resumoLocais.uhsPendentes > 0;
      case 'sem_gerente':
        return !tem('gerente_hotel');
      case 'sem_tecnico':
        return !tem('tecnico');
      case 'pessoas_sem_papel_vigente':
        return semPapel.length > 0;
    }
  });

  return { locais: resumoLocais, papeis, pessoasSemPapelVigente: semPapel, pendencias };
}
