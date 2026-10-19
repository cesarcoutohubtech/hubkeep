// Auditoria geral (fase 1c; decisões 12 a 14 do Cesar de 13/10/2026): a tela
// só de leitura com toda a auditoria que a gestão enxerga, com filtros,
// paginação e CSV. O escopo vem da RLS de app.auditoria (ADR-021); a regra
// daqui é quem tem a tela, o tamanho da consulta, o cursor e o que cada linha
// mostra, com a mesma tradução do histórico por registro (auditoria.ts).
import { PermissaoNegada, RegraViolada } from './erros';
import { type MudancaAuditada, mudancasDaAuditoria } from './auditoria';
import { type Resultado, vigente } from './permissoes';
import type { Atribuicao, Papel } from './tipos';

/**
 * As entidades que a aplicação grava na auditoria, para o filtro e o nome no
 * catálogo. Entidade nova na auditoria entra aqui (o teste de paridade com os
 * repositórios falha sem ela).
 */
export const ENTIDADES_DA_AUDITORIA = [
  'anexo',
  'ativo',
  'atribuicao_escopo',
  'bandeira',
  'categoria_ativo',
  'chamado',
  'checklist_modelo',
  'codigo_manutencao',
  'credencial_agente',
  'equipe',
  'feriado_hotel',
  'fornecedor',
  'hotel',
  'hotel_proprietario',
  'insight',
  'job_inteligencia',
  'local',
  'local_proprietario',
  'membro',
  'mews_checkpoint',
  'modelo_ativo',
  'os',
  'os_apontamento',
  'os_checklist',
  'os_material',
  'parada_ativo',
  'plano_preventivo',
  'politica',
  'preferencia_membro',
  'prioridade',
  'proprietario',
  'sinal_hospede',
  'situacao',
  'tenant',
  'uh_indisponivel',
] as const;
export type EntidadeDaAuditoria = (typeof ENTIDADES_DA_AUDITORIA)[number];
export const ehEntidadeDaAuditoria = (v: unknown): v is EntidadeDaAuditoria =>
  typeof v === 'string' && (ENTIDADES_DA_AUDITORIA as readonly string[]).includes(v);

export const LIMITES_DA_AUDITORIA = {
  /** Período máximo de uma consulta (decisão 13). */
  diasPorConsulta: 92,
  /** Linhas por página na tela. */
  porPagina: 50,
  /** Linhas por página na exportação, que o navegador junta no CSV. */
  porPaginaNaExportacao: 1000,
  /** Linhas no CSV (decisão 13). */
  linhasNoCsv: 50_000,
} as const;

/**
 * A tela é da gestão (decisão 12): o Admin do grupo, o Gestor CSC e o Gerente
 * do hotel, este só no escopo do hotel dele. O Técnico e o Solicitante, que a
 * RLS deixa ler a auditoria do hotel, não têm a tela; o proprietário e o
 * locador também não (decisão 5 da paridade).
 */
export const PAPEIS_DA_AUDITORIA_GERAL: readonly Papel[] = [
  'admin_grupo',
  'gestor_csc',
  'gerente_hotel',
];

export function podeVerAuditoriaGeral(minhas: readonly Atribuicao[], agora: Date): Resultado {
  return minhas.some((a) => vigente(a, agora) && PAPEIS_DA_AUDITORIA_GERAL.includes(a.papel))
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'auditoria_sem_permissao',
          'Só o Admin do grupo, o Gestor CSC e o Gerente do hotel veem a auditoria geral.',
        ),
      };
}

const DIA_MS = 86_400_000;

/** O período da consulta: o fim depois do início, até 92 dias. */
export function validarPeriodoDaAuditoria(de: Date, ate: Date): void {
  const ms = ate.getTime() - de.getTime();
  if (!Number.isFinite(ms) || ms <= 0 || ms > LIMITES_DA_AUDITORIA.diasPorConsulta * DIA_MS) {
    throw new RegraViolada('auditoria_periodo_invalido', 'Período inválido.', {
      maximoDias: LIMITES_DA_AUDITORIA.diasPorConsulta,
    });
  }
}

/**
 * A posição na lista, da mais nova para a mais antiga: a linha seguinte vem
 * antes de (em, id). O `em` vai como o banco o guarda, em UTC e com os
 * microssegundos ('2026-10-13T12:00:00.123456Z'): o Date do JavaScript perde
 * os microssegundos, e o cursor pularia ou repetiria linhas do mesmo milissegundo.
 */
export interface CursorDaAuditoria {
  em: string;
  id: string;
}

const CURSOR =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)~([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export const escreverCursorDaAuditoria = (c: CursorDaAuditoria): string => `${c.em}~${c.id}`;

/** O cursor que a API devolveu; outro texto é 422 auditoria_cursor_invalido. */
export function lerCursorDaAuditoria(texto: string): CursorDaAuditoria {
  const m = CURSOR.exec(texto);
  if (!m || Number.isNaN(Date.parse(m[1] as string))) {
    throw new RegraViolada('auditoria_cursor_invalido', 'Cursor inválido.');
  }
  return { em: m[1] as string, id: (m[2] as string).toLowerCase() };
}

/**
 * Ações cujo detalhe fica fora da tela, como no histórico por registro: a
 * ativação bloqueada grava o uso da licença, que só o Admin do grupo lê.
 */
const SEM_DETALHE: Readonly<Partial<Record<string, readonly string[]>>> = {
  hotel: ['ativacao_bloqueada_sem_saldo'],
};

/** O que a linha mostra: a ação sempre; as mudanças, se a ação as mostra. */
export function mudancasDaLinhaDeAuditoria(
  entidade: string,
  acao: string,
  antes: unknown,
  depois: unknown,
): MudancaAuditada[] {
  if (SEM_DETALHE[entidade]?.includes(acao)) return [];
  return mudancasDaAuditoria(antes, depois);
}
