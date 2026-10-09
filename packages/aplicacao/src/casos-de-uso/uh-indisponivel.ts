// UH indisponível pelo web (fase 1b, I4). Os períodos do chamado, com o tempo
// indisponível calculado no domínio; a marcação depois da abertura e a
// liberação, pela gestão do hotel (Admin do grupo, Gestor CSC e Gerente). Na
// abertura, quem abre marca junto (chamados.ts); na conclusão da OS, quem
// conclui libera (execucao.ts). O proprietário vê só a UH, o estado e as
// datas, como na parada (veDetalhesDaParada).
import {
  type AtorDaCorretiva,
  type Contexto,
  NaoEncontrado,
  exigirChamadoQueAceitaUhIndisponivel,
  exigirPeriodoAberto,
  exigirSemPeriodoAberto,
  exigirUhParaIndisponibilidade,
  podeGerirUhIndisponivel,
  tempoParado,
  validarFimDaIndisponibilidade,
  validarInicioDaIndisponibilidade,
  veDetalhesDaParada,
} from '@hubkeep/dominio';
import type { PortaChamados } from '../portas/chamados';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { PortaTriagem } from '../portas/triagem';
import type { PeriodoDeUhGravado, PortaUhIndisponivel } from '../portas/uh-indisponivel';

/** Sem os detalhes (chamado, quem abriu e quem liberou), para o proprietário. */
export type PeriodoDeUhVisto =
  PeriodoDeUhGravado | Pick<PeriodoDeUhGravado, 'id' | 'hotelId' | 'localId' | 'inicio' | 'fim'>;

export type PeriodoDeUhComTempo = PeriodoDeUhVisto & {
  /** Do início ao fim, ou até agora se aberto, em milissegundos. */
  tempoIndisponivelMs: number;
};

export interface CasosDeUsoDeUhIndisponivel {
  /** Os períodos do chamado, do mais novo para o mais antigo. */
  doChamado(ctx: Contexto, chamadoId: string): Promise<PeriodoDeUhComTempo[]>;
  /** Marca a UH do chamado como indisponível; sem início, agora. */
  marcar(ctx: Contexto, chamadoId: string, p: { desde?: Date | null }): Promise<{ id: string }>;
  /** Libera o período aberto; sem fim, agora. */
  liberar(ctx: Contexto, periodoId: string, p: { fim?: Date | null }): Promise<{ fim: Date }>;
}

export function criarCasosDeUsoDeUhIndisponivel(deps: {
  uh: PortaUhIndisponivel;
  chamados: Pick<PortaChamados, 'local'>;
  triagem: Pick<PortaTriagem, 'chamado'>;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Padrão: a do domínio. Só o teste de aceite troca, para provar a RLS sozinha. */
  podeGerir?: typeof podeGerirUhIndisponivel;
}): CasosDeUsoDeUhIndisponivel {
  const podeGerir = deps.podeGerir ?? podeGerirUhIndisponivel;
  const ator = async (ctx: Contexto): Promise<AtorDaCorretiva> => ({
    usuarioId: ctx.usuarioId,
    atribuicoes: await deps.atribuicoes.doUsuario(ctx),
    equipes: [],
  });

  async function chamadoVisivel(ctx: Contexto, chamadoId: string) {
    const chamado = await deps.triagem.chamado(ctx, chamadoId);
    if (!chamado) throw new NaoEncontrado('chamado_nao_encontrado', 'Chamado não encontrado.');
    return chamado;
  }

  return {
    async doChamado(ctx, chamadoId) {
      const chamado = await chamadoVisivel(ctx, chamadoId);
      const agora = deps.relogio.agora();
      const detalhes = veDetalhesDaParada(await ator(ctx), chamado.hotel, agora);
      const periodos = await deps.uh.doChamado(ctx, chamadoId);
      return periodos.map((p) => ({
        ...(detalhes
          ? p
          : { id: p.id, hotelId: p.hotelId, localId: p.localId, inicio: p.inicio, fim: p.fim }),
        tempoIndisponivelMs: tempoParado(p, agora),
      }));
    },

    async marcar(ctx, chamadoId, p) {
      const chamado = await chamadoVisivel(ctx, chamadoId);
      const agora = deps.relogio.agora();
      podeGerir(await ator(ctx), chamado.hotel, agora);
      exigirChamadoQueAceitaUhIndisponivel(chamado.estado);
      const local = await deps.chamados.local(ctx, chamado.localId);
      if (!local) throw new NaoEncontrado('local_nao_encontrado', 'Local não encontrado.');
      exigirUhParaIndisponibilidade(local);
      exigirSemPeriodoAberto(await deps.uh.abertoDoChamado(ctx, chamadoId));
      const inicio = validarInicioDaIndisponibilidade(p.desde ?? agora, agora);
      return deps.uh.marcar(ctx, {
        hotelId: chamado.hotel.id,
        localId: chamado.localId,
        chamadoId,
        inicio,
      });
    },

    async liberar(ctx, periodoId, p) {
      const periodo = await deps.uh.periodo(ctx, periodoId);
      const chamado = periodo ? await deps.triagem.chamado(ctx, periodo.chamadoId) : null;
      if (!periodo || !chamado) {
        throw new NaoEncontrado('uh_indisponivel_nao_encontrada', 'Período não encontrado.');
      }
      const agora = deps.relogio.agora();
      podeGerir(await ator(ctx), chamado.hotel, agora);
      const aberto = exigirPeriodoAberto(periodo);
      const fim = validarFimDaIndisponibilidade(aberto.inicio, p.fim ?? agora, agora);
      await deps.uh.liberar(ctx, { id: aberto.id, hotelId: aberto.hotelId, fim });
      return { fim };
    },
  };
}
