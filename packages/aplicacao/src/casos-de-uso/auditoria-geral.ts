// Auditoria geral (fase 1c; decisões 12 a 14 do Cesar de 13/10/2026): a
// auditoria que a gestão enxerga, com filtros por período (até 92 dias),
// hotel, tipo de registro, ação e pessoa, em páginas por cursor estável
// (em, id). A tela pede 50 por página; a exportação pede 1.000 por página, e o
// navegador junta o CSV até 50 mil linhas. O escopo é o da RLS (ADR-021); a
// regra de quem tem a tela é do domínio. Cada linha sai com as mudanças e os
// nomes das referências, como o histórico por registro (D1).
import {
  type Contexto,
  LIMITES_DA_AUDITORIA,
  type MudancaAuditada,
  escreverCursorDaAuditoria,
  exigir,
  lerCursorDaAuditoria,
  mudancasDaLinhaDeAuditoria,
  podeVerAuditoriaGeral,
  referenciasDasMudancas,
  validarPeriodoDaAuditoria,
} from '@hubkeep/dominio';
import type { Idioma } from '@hubkeep/i18n';
import type {
  FiltroDaAuditoria,
  LinhaDaAuditoriaGeral,
  PortaAuditoriaGeral,
} from '../portas/auditoria-geral';
import type { PortaHistorico, ReferenciaDoHistorico } from '../portas/historico';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export type LinhaComMudancas = Omit<LinhaDaAuditoriaGeral, 'antes' | 'depois' | 'emExato'> & {
  mudancas: MudancaAuditada[];
};

export interface PaginaDaAuditoria {
  linhas: LinhaComMudancas[];
  referencias: Record<string, ReferenciaDoHistorico>;
  idiomaPadrao: Idioma;
  /** Para pedir a página seguinte; null na última. */
  proximoCursor: string | null;
}

export interface CasosDeUsoDeAuditoriaGeral {
  /** `exportacao`: a página da exportação, com 1.000 linhas. */
  pagina(
    ctx: Contexto,
    filtro: FiltroDaAuditoria,
    opcoes?: { cursor?: string | null; exportacao?: boolean },
  ): Promise<PaginaDaAuditoria>;
}

export function criarCasosDeUsoDeAuditoriaGeral(deps: {
  auditoria: PortaAuditoriaGeral;
  historico: Pick<PortaHistorico, 'referencias' | 'idiomaPadrao'>;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
}): CasosDeUsoDeAuditoriaGeral {
  return {
    async pagina(ctx, filtro, opcoes = {}) {
      exigir(podeVerAuditoriaGeral(await deps.atribuicoes.doUsuario(ctx), deps.relogio.agora()));
      validarPeriodoDaAuditoria(filtro.de, filtro.ate);
      const depoisDe = opcoes.cursor ? lerCursorDaAuditoria(opcoes.cursor) : null;
      const limite = opcoes.exportacao
        ? LIMITES_DA_AUDITORIA.porPaginaNaExportacao
        : LIMITES_DA_AUDITORIA.porPagina;
      // Uma a mais diz se há página seguinte, sem contar o total.
      const lidas = await deps.auditoria.pagina(ctx, filtro, depoisDe, limite + 1);
      const pagina = lidas.slice(0, limite);
      const linhas = pagina.map((l): LinhaComMudancas => ({
        id: l.id,
        em: l.em,
        hotelId: l.hotelId,
        hotelNome: l.hotelNome,
        entidade: l.entidade,
        registroId: l.registroId,
        acao: l.acao,
        usuarioId: l.usuarioId,
        usuarioNome: l.usuarioNome,
        mudancas: mudancasDaLinhaDeAuditoria(l.entidade, l.acao, l.antes, l.depois),
      }));
      const ids = referenciasDasMudancas(linhas.flatMap((l) => l.mudancas));
      const [referencias, idiomaPadrao] = await Promise.all([
        ids.size > 0 ? deps.historico.referencias(ctx, ids) : Promise.resolve({}),
        deps.historico.idiomaPadrao(ctx),
      ]);
      const ultima = pagina.at(-1);
      return {
        linhas,
        referencias,
        idiomaPadrao,
        proximoCursor:
          lidas.length > limite && ultima
            ? escreverCursorDaAuditoria({ em: ultima.emExato, id: ultima.id })
            : null,
      };
    },
  };
}
