// Abertura do chamado (fase 1a, C2; ADR-026). Quem abre é regra de
// corretiva.ts (podeAbrirChamado); aqui ficam o que o pedido precisa cumprir e
// a cópia da política aplicada, que o chamado guarda para sempre: mudar a
// política depois não altera o chamado já aberto.
import { RegraViolada } from './erros';
import type { StatusDeLocal } from './licenca';
import type { HorarioDeAtendimento, PoliticaDeSla, SlaAplicado } from './sla';

export const LIMITE_DESCRICAO_DO_CHAMADO = 2000;

/**
 * De onde veio o trabalho (I4): gravada na abertura e sem UPDATE. Hoje todo
 * chamado é interno; a integração (IX2) acrescenta a dela, com migração que
 * amplia o check chamado_origem_lista (0034).
 */
export const ORIGENS_DO_CHAMADO = ['interno'] as const;
export type OrigemDoChamado = (typeof ORIGENS_DO_CHAMADO)[number];
export const ORIGEM_PADRAO_DO_CHAMADO: OrigemDoChamado = 'interno';

/** Descrição: sem espaços nas pontas, de 1 a 2000 caracteres; as quebras de linha ficam. */
export function normalizarDescricaoDoChamado(descricao: string): string {
  const limpa = descricao.trim();
  if (limpa.length === 0 || limpa.length > LIMITE_DESCRICAO_DO_CHAMADO) {
    throw new RegraViolada('chamado_descricao_invalida', 'Descrição do chamado inválida.', {
      maximo: LIMITE_DESCRICAO_DO_CHAMADO,
    });
  }
  return limpa;
}

/**
 * O local do chamado precisa estar em uso: a UH pendente de licença não recebe
 * chamado (422), nem o local desativado.
 */
export function exigirLocalParaChamado(local: { status: StatusDeLocal }): void {
  if (local.status === 'pendente_licenca') {
    throw new RegraViolada(
      'chamado_uh_pendente_licenca',
      'A UH está pendente de licença e não recebe chamado.',
    );
  }
  if (local.status === 'inativo') {
    throw new RegraViolada('chamado_local_inativo', 'O local está desativado.');
  }
}

/** O ativo, quando informado, precisa estar no local do chamado e ativo. */
export function exigirAtivoDoChamado(
  ativo: { localId: string; desativadoEm: Date | null },
  localId: string,
): void {
  if (ativo.localId !== localId) {
    throw new RegraViolada('chamado_ativo_fora_do_local', 'O ativo não está no local do chamado.');
  }
  if (ativo.desativadoEm !== null) {
    throw new RegraViolada('chamado_ativo_desativado', 'O ativo está desativado.');
  }
}

/**
 * Cópia do que foi aplicado na abertura (ADR-026), por chave de política. Na
 * 1c (ADR-042), a chamado.sla inteira e o horário de atendimento resolvidos
 * para o hotel: o recálculo na triagem e a retomada usam a cópia, e não a
 * política do momento.
 */
export interface PoliticaAplicadaNaAbertura extends SlaAplicado {
  'chamado.prioridade_padrao_por_categoria': {
    categoriaId: string | null;
    prioridadeId: string;
    origem: 'categoria' | 'menor_peso';
  };
}

export function politicaAplicadaNaAbertura(p: {
  categoriaId: string | null;
  prioridade: { prioridadeId: string; origem: 'categoria' | 'menor_peso' };
  sla: PoliticaDeSla;
  horario: HorarioDeAtendimento;
}): PoliticaAplicadaNaAbertura {
  return {
    'chamado.prioridade_padrao_por_categoria': {
      categoriaId: p.categoriaId,
      prioridadeId: p.prioridade.prioridadeId,
      origem: p.prioridade.origem,
    },
    'chamado.sla': p.sla,
    'hotel.horario_atendimento': p.horario,
  };
}
