// Histórico de um registro (fase 1a, D1): quem mudou, o quê, quando, e o antes
// e o depois de cada campo, para hotel, local, ativo, chamado e OS. Ler é
// escopo, sem regra de papel: quem não vê o registro recebe 404 (a auditoria
// nem é lida), e das linhas do registro a RLS de app.auditoria mostra só as
// que ele lê. O domínio diz o que cada linha mostra e que ids viram nome.
import {
  type Contexto,
  type EntidadeComHistorico,
  type MudancaAuditada,
  NaoEncontrado,
  mudancasVisiveis,
  referenciasDasMudancas,
} from '@hubkeep/dominio';
import type { Idioma } from '@hubkeep/i18n';
import type { PortaHistorico, ReferenciaDoHistorico } from '../portas/historico';

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
}): CasosDeUsoDeHistorico {
  return {
    async historico(ctx, entidade, registroId) {
      if (!(await deps.historico.registroVisivel(ctx, entidade, registroId))) {
        throw new NaoEncontrado('registro_nao_encontrado', 'Registro não encontrado.', {
          entidade,
        });
      }
      const linhas = await deps.historico.linhas(ctx, entidade, registroId);
      const eventos = linhas.map((l) => ({
        id: l.id,
        em: l.em,
        acao: l.acao,
        usuarioId: l.usuarioId,
        usuarioNome: l.usuarioNome,
        mudancas: mudancasVisiveis(entidade, l.acao, l.antes, l.depois),
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
