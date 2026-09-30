// Parada do equipamento pelo web (fase 1a, C5). A lista das paradas do ativo,
// com o tempo parado calculado no domínio (o indicador fica para a 1c), e o
// encerramento pela gestão do hotel (Admin do grupo, Gestor CSC e Gerente),
// para a parada que ficou aberta: o responsável pela OS encerra na execução,
// pelo PWA (execucao.ts). A parada nasce com o chamado (chamados.ts) ou na
// execução.
import {
  type Contexto,
  NaoEncontrado,
  exigirParadaAberta,
  podeEncerrarParada,
  tempoParado,
  tempoParadoTotal,
  validarFimDaParada,
} from '@hubkeep/dominio';
import type { PortaAtivos } from '../portas/ativos';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { ParadaGravada, PortaParadas } from '../portas/paradas';
import type { PortaTriagem } from '../portas/triagem';

export interface ParadaComTempo extends ParadaGravada {
  /** Do início ao fim, ou até agora se aberta, em milissegundos. */
  tempoParadoMs: number;
}

export interface CasosDeUsoDeParadas {
  /** As paradas do ativo, da mais nova para a mais antiga, e o tempo parado somado. */
  doAtivo(
    ctx: Contexto,
    ativoId: string,
  ): Promise<{ paradas: ParadaComTempo[]; tempoParadoMs: number }>;
  /** Encerra a parada aberta; sem fim, agora. */
  encerrar(ctx: Contexto, paradaId: string, p: { fim?: Date | null }): Promise<{ fim: Date }>;
}

export function criarCasosDeUsoDeParadas(deps: {
  paradas: PortaParadas;
  ativos: Pick<PortaAtivos, 'ativo'>;
  triagem: Pick<PortaTriagem, 'chamado'>;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Padrão: a do domínio. Só o teste de aceite troca, para provar a RLS sozinha. */
  podeEncerrar?: typeof podeEncerrarParada;
}): CasosDeUsoDeParadas {
  const podeEncerrar = deps.podeEncerrar ?? podeEncerrarParada;
  return {
    async doAtivo(ctx, ativoId) {
      if (!(await deps.ativos.ativo(ctx, ativoId))) {
        throw new NaoEncontrado('ativo_nao_encontrado', 'Ativo não encontrado.');
      }
      const agora = deps.relogio.agora();
      const paradas = await deps.paradas.doAtivo(ctx, ativoId);
      return {
        paradas: paradas.map((p) => ({ ...p, tempoParadoMs: tempoParado(p, agora) })),
        tempoParadoMs: tempoParadoTotal(paradas, agora),
      };
    },

    async encerrar(ctx, paradaId, p) {
      const parada = await deps.paradas.parada(ctx, paradaId);
      const chamado = parada ? await deps.triagem.chamado(ctx, parada.chamadoId) : null;
      if (!parada || !chamado) {
        throw new NaoEncontrado('parada_nao_encontrada', 'Parada não encontrada.');
      }
      const agora = deps.relogio.agora();
      podeEncerrar(
        {
          usuarioId: ctx.usuarioId,
          atribuicoes: await deps.atribuicoes.doUsuario(ctx),
          equipes: [],
        },
        chamado.hotel,
        agora,
      );
      const aberta = exigirParadaAberta(parada);
      const fim = validarFimDaParada(aberta.inicio, p.fim ?? agora, agora);
      await deps.paradas.encerrar(ctx, { id: aberta.id, hotelId: aberta.hotelId, fim });
      return { fim };
    },
  };
}
