// Parada do equipamento pelo web (fase 1a, C5). A lista das paradas do ativo,
// com o tempo parado calculado no domínio (o indicador fica para a 1c), e o
// encerramento pela gestão do hotel (Admin do grupo, Gestor CSC e Gerente),
// para a parada que ficou aberta: o responsável pela OS encerra na execução,
// pelo PWA (execucao.ts). A parada nasce com o chamado (chamados.ts) ou na
// execução. A gestão acompanha as paradas que ficaram abertas depois da
// conclusão da OS (o técnico respondeu que o equipamento não voltou, ou não
// respondeu), e o proprietário vê só o ativo, o estado e as datas (decisões
// do Cesar de 30/09/2026).
import {
  type AtorDaCorretiva,
  type Contexto,
  ESTADOS_DA_OS_CONCLUIDA,
  NaoEncontrado,
  encerraParadaNoHotel,
  exigirParadaAberta,
  podeEncerrarParada,
  podeListarParadasPendentes,
  tempoParado,
  tempoParadoTotal,
  validarFimDaParada,
  veDetalhesDaParada,
} from '@hubkeep/dominio';
import type { PortaAtivos } from '../portas/ativos';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { ParadaGravada, ParadaPendente, PortaParadas } from '../portas/paradas';
import type { PortaTriagem } from '../portas/triagem';

/** Sem os detalhes (chamado, OS, quem abriu e quem encerrou), para o proprietário. */
export type ParadaVista =
  ParadaGravada | Pick<ParadaGravada, 'id' | 'hotelId' | 'ativoId' | 'inicio' | 'fim'>;

export type ParadaComTempo = ParadaVista & {
  /** Do início ao fim, ou até agora se aberta, em milissegundos. */
  tempoParadoMs: number;
};

export type ParadaPendenteComTempo = ParadaPendente & { tempoParadoMs: number };

export interface CasosDeUsoDeParadas {
  /** As paradas do ativo, da mais nova para a mais antiga, e o tempo parado somado. */
  doAtivo(
    ctx: Contexto,
    ativoId: string,
  ): Promise<{ paradas: ParadaComTempo[]; tempoParadoMs: number }>;
  /** Encerra a parada aberta; sem fim, agora. */
  encerrar(ctx: Contexto, paradaId: string, p: { fim?: Date | null }): Promise<{ fim: Date }>;
  /**
   * As paradas abertas com a OS do chamado concluída (ou aceita), dos hotéis
   * em que quem pede encerra parada, da mais antiga para a mais nova.
   */
  abertasComOsConcluida(ctx: Contexto): Promise<ParadaPendenteComTempo[]>;
}

export function criarCasosDeUsoDeParadas(deps: {
  paradas: PortaParadas;
  ativos: Pick<PortaAtivos, 'ativo' | 'hotel'>;
  triagem: Pick<PortaTriagem, 'chamado'>;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Padrão: a do domínio. Só o teste de aceite troca, para provar a RLS sozinha. */
  podeEncerrar?: typeof podeEncerrarParada;
}): CasosDeUsoDeParadas {
  const podeEncerrar = deps.podeEncerrar ?? podeEncerrarParada;
  const ator = async (ctx: Contexto): Promise<AtorDaCorretiva> => ({
    usuarioId: ctx.usuarioId,
    atribuicoes: await deps.atribuicoes.doUsuario(ctx),
    equipes: [],
  });
  return {
    async doAtivo(ctx, ativoId) {
      const ativo = await deps.ativos.ativo(ctx, ativoId);
      if (!ativo) throw new NaoEncontrado('ativo_nao_encontrado', 'Ativo não encontrado.');
      const agora = deps.relogio.agora();
      const hotel = await deps.ativos.hotel(ctx, ativo.hotelId);
      // Sem o hotel visível, sem detalhes: falha fechada.
      const detalhes = hotel !== null && veDetalhesDaParada(await ator(ctx), hotel, agora);
      const paradas = await deps.paradas.doAtivo(ctx, ativoId);
      return {
        paradas: paradas.map((p) => ({
          ...(detalhes
            ? p
            : { id: p.id, hotelId: p.hotelId, ativoId: p.ativoId, inicio: p.inicio, fim: p.fim }),
          tempoParadoMs: tempoParado(p, agora),
        })),
        tempoParadoMs: tempoParadoTotal(paradas, agora),
      };
    },

    async abertasComOsConcluida(ctx) {
      const quem = await ator(ctx);
      const agora = deps.relogio.agora();
      podeListarParadasPendentes(quem, agora);
      const pendentes = await deps.paradas.abertasComOs(ctx, ESTADOS_DA_OS_CONCLUIDA);
      return pendentes
        .filter((p) => encerraParadaNoHotel(quem, p.hotel, agora))
        .map((p) => ({ ...p, tempoParadoMs: tempoParado(p, agora) }));
    },

    async encerrar(ctx, paradaId, p) {
      const parada = await deps.paradas.parada(ctx, paradaId);
      const chamado = parada ? await deps.triagem.chamado(ctx, parada.chamadoId) : null;
      if (!parada || !chamado) {
        throw new NaoEncontrado('parada_nao_encontrada', 'Parada não encontrada.');
      }
      const agora = deps.relogio.agora();
      podeEncerrar(await ator(ctx), chamado.hotel, agora);
      const aberta = exigirParadaAberta(parada);
      const fim = validarFimDaParada(aberta.inicio, p.fim ?? agora, agora);
      await deps.paradas.encerrar(ctx, { id: aberta.id, hotelId: aberta.hotelId, fim });
      return { fim };
    },
  };
}
