// Histórico de um registro (fase 1a, D1): quem mudou, o quê, quando, e o antes
// e o depois de cada campo, para hotel, local, ativo, chamado e OS. Ler é
// escopo, sem regra de papel: quem não vê o registro recebe 404 (a auditoria
// nem é lida), e das linhas do registro a RLS de app.auditoria mostra só as
// que ele lê. O domínio diz o que cada linha mostra e que ids viram nome. No
// histórico da OS, o custo informado some para quem só enxerga o hotel como
// proprietário, como na ficha e na impressão (custoInformadoVisivel; 1c, Cesar,
// 20/10/2026).
import {
  type Contexto,
  type EntidadeComHistorico,
  type MudancaAuditada,
  NaoEncontrado,
  custoInformadoVisivel,
  mudancasVisiveis,
  referenciasDasMudancas,
} from '@hubkeep/dominio';
import type { Idioma } from '@hubkeep/i18n';
import type { PortaHistorico, ReferenciaDoHistorico } from '../portas/historico';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { PortaTriagem } from '../portas/triagem';

/** O campo do custo na auditoria da OS, já no nome do domínio (custo_informado vira este). */
const CAMPO_DO_CUSTO = 'custoInformado';

export interface EventoDoHistorico {
  id: string;
  em: Date;
  acao: string;
  usuarioId: string | null;
  usuarioNome: string | null;
  mudancas: MudancaAuditada[];
}

export interface HistoricoDoRegistro {
  entidade: EntidadeComHistorico;
  registroId: string;
  /** Para a tela resolver o nome de situação, prioridade e categoria (ADR-027). */
  idiomaPadrao: Idioma;
  eventos: EventoDoHistorico[];
  referencias: Record<string, ReferenciaDoHistorico>;
}

export interface CasosDeUsoDeHistorico {
  /** 404 registro_nao_encontrado se o registro não é visível. */
  historico(
    ctx: Contexto,
    entidade: EntidadeComHistorico,
    registroId: string,
  ): Promise<HistoricoDoRegistro>;
}

export function criarCasosDeUsoDeHistorico(deps: {
  historico: PortaHistorico;
  /** A OS do histórico, para saber o hotel dela; só no histórico da OS. */
  triagem: Pick<PortaTriagem, 'os'>;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
}): CasosDeUsoDeHistorico {
  async function custoOculto(ctx: Contexto, entidade: EntidadeComHistorico, registroId: string) {
    if (entidade !== 'os') return false;
    const [os, minhas] = await Promise.all([
      deps.triagem.os(ctx, registroId),
      deps.atribuicoes.doUsuario(ctx),
    ]);
    // Sem a OS (a RLS não a mostra), nada sai; registroVisivel já deu 404 antes.
    if (!os) return true;
    const hotel = { id: os.hotelId, bandeiraId: os.bandeiraId };
    return !custoInformadoVisivel(minhas, hotel, deps.relogio.agora());
  }

  return {
    async historico(ctx, entidade, registroId) {
      if (!(await deps.historico.registroVisivel(ctx, entidade, registroId))) {
        throw new NaoEncontrado('registro_nao_encontrado', 'Registro não encontrado.', {
          entidade,
        });
      }
      const [linhas, semCusto] = await Promise.all([
        deps.historico.linhas(ctx, entidade, registroId),
        custoOculto(ctx, entidade, registroId),
      ]);
      const eventos = linhas.map((l) => ({
        id: l.id,
        em: l.em,
        acao: l.acao,
        usuarioId: l.usuarioId,
        usuarioNome: l.usuarioNome,
        mudancas: mudancasVisiveis(entidade, l.acao, l.antes, l.depois).filter(
          (m) => !semCusto || m.campo !== CAMPO_DO_CUSTO,
        ),
      }));
      const ids = referenciasDasMudancas(eventos.flatMap((e) => e.mudancas));
      const [referencias, idiomaPadrao] = await Promise.all([
        ids.size > 0 ? deps.historico.referencias(ctx, ids) : Promise.resolve({}),
        deps.historico.idiomaPadrao(ctx),
      ]);
      return { entidade, registroId, idiomaPadrao, eventos, referencias };
    },
  };
}
