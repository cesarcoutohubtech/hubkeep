// Checklist tipado (fase 1b, PV1; ADR-040), na unit of work, com auditoria e
// evento. A RLS decide por último: o modelo, só o Admin do grupo grava; a
// cópia na OS, aplica a gestão do hotel e altera a gestão e o Técnico
// responsável.
import { Conflito, NaoEncontrado, type ValorDeCampo } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export async function criarModeloDeChecklist(
  uow: UnidadeDeTrabalho,
  m: { categoriaId: string | null; bandeiraId: string | null; nomes: object; itens: object[] },
): Promise<{ id: string }> {
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.checklist_modelo')
    .values({
      id,
      tenant_id: uow.tenantId,
      categoria_id: m.categoriaId,
      // PB1b: só na criação; campo de escopo, sem UPDATE (ADR-011).
      bandeira_id: m.bandeiraId,
      nomes: JSON.stringify(m.nomes),
      itens: JSON.stringify(m.itens),
    })
    .execute();
  uow.auditar({ entidade: 'checklist_modelo', registroId: id, acao: 'criar', depois: m });
  uow.publicar({
    tipo: 'checklist_modelo.criado',
    entidade: 'checklist_modelo',
    registroId: id,
    payload: { itens: m.itens.length },
  });
  return { id };
}

export async function alterarModeloDeChecklist(
  uow: UnidadeDeTrabalho,
  id: string,
  mudanca:
    | { categoriaId: string | null; nomes: object; itens: object[]; versao: number }
    | { ativa: boolean },
): Promise<void> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.checklist_modelo')
    .select(['categoria_id', 'nomes', 'itens', 'versao', 'ativa'])
    .where('id', '=', id)
    .executeTakeFirst();
  const valores =
    'ativa' in mudanca
      ? { ativa: mudanca.ativa }
      : {
          categoria_id: mudanca.categoriaId,
          nomes: JSON.stringify(mudanca.nomes),
          itens: JSON.stringify(mudanca.itens),
          versao: mudanca.versao,
        };
  const r = await tx
    .updateTable('app.checklist_modelo')
    .set({ ...valores, atualizado_em: sql`now()` })
    .where('id', '=', id)
    .returning(['id'])
    .executeTakeFirst();
  if (!r || !antes) {
    throw new NaoEncontrado('checklist_nao_encontrado', 'Checklist não encontrado.');
  }
  const acao = 'ativa' in mudanca ? (mudanca.ativa ? 'reativar' : 'desativar') : 'alterar';
  uow.auditar({ entidade: 'checklist_modelo', registroId: id, acao, antes, depois: mudanca });
  uow.publicar({
    tipo: 'checklist_modelo.alterado',
    entidade: 'checklist_modelo',
    registroId: id,
    payload: { acao, ...('versao' in mudanca ? { versao: mudanca.versao } : {}) },
  });
}

/**
 * Aplica o modelo na OS: grava a cópia, ou troca a cópia ainda sem resposta.
 * A troca confere de novo, na gravação, que a cópia continua sem resposta
 * (outra resposta pode ter chegado entre a leitura e a gravação).
 */
export async function aplicarChecklist(
  uow: UnidadeDeTrabalho,
  a: {
    osId: string;
    hotelId: string;
    modelo: { id: string; versao: number; nomes: object; itens: object[] };
    substitui: string | null;
  },
): Promise<{ id: string }> {
  if (!uow.usuarioId) throw new Error('Aplicar checklist exige usuário no contexto.');
  const tx = transacaoDe(uow);
  const copia = {
    modelo_id: a.modelo.id,
    modelo_versao: a.modelo.versao,
    nomes: JSON.stringify(a.modelo.nomes),
    itens: JSON.stringify(a.modelo.itens),
  };
  let id: string;
  if (a.substitui) {
    const r = await tx
      .updateTable('app.os_checklist')
      .set({ ...copia, atualizado_em: sql`now()` })
      .where('id', '=', a.substitui)
      .where('respostas', '=', sql<string>`'{}'::jsonb`)
      .returning(['id'])
      .executeTakeFirst();
    if (!r) {
      throw new Conflito('checklist_ja_respondido', 'O checklist desta OS já tem respostas.');
    }
    id = r.id;
  } else {
    id = novoId();
    await tx
      .insertInto('app.os_checklist')
      .values({
        id,
        tenant_id: uow.tenantId,
        hotel_id: a.hotelId,
        os_id: a.osId,
        ...copia,
        criado_por: uow.usuarioId,
      })
      .execute();
  }
  const acao = a.substitui ? 'trocar' : 'aplicar';
  uow.auditar({
    entidade: 'os_checklist',
    registroId: id,
    acao,
    hotelId: a.hotelId,
    depois: { osId: a.osId, modeloId: a.modelo.id, modeloVersao: a.modelo.versao },
  });
  uow.publicar({
    tipo: 'os.checklist_aplicado',
    entidade: 'os',
    registroId: a.osId,
    payload: { hotelId: a.hotelId, checklistId: id, modeloId: a.modelo.id, acao },
  });
  return { id };
}

/**
 * Mescla as respostas na cópia, item a item, numa gravação só: o que vem
 * depois vence, e null remove o item (ADR-040). Não mexe na versão da OS.
 */
export async function responderChecklist(
  uow: UnidadeDeTrabalho,
  g: {
    checklistId: string;
    osId: string;
    hotelId: string;
    respostas: Record<string, ValorDeCampo | null>;
    feitaEm: Date;
  },
): Promise<void> {
  if (!uow.usuarioId) throw new Error('Responder checklist exige usuário no contexto.');
  const feitaEm = g.feitaEm.toISOString();
  const novas: Record<string, { valor: ValorDeCampo; feitaEm: string; usuarioId: string }> = {};
  const removidas: string[] = [];
  for (const [chave, valor] of Object.entries(g.respostas)) {
    if (valor === null) removidas.push(chave);
    else novas[chave] = { valor, feitaEm, usuarioId: uow.usuarioId };
  }
  const r = await transacaoDe(uow)
    .updateTable('app.os_checklist')
    .set({
      respostas: sql`(respostas - ${sql.val(removidas)}::text[]) || ${JSON.stringify(novas)}::jsonb`,
      atualizado_em: sql`now()`,
    })
    .where('id', '=', g.checklistId)
    .returning(['id'])
    .executeTakeFirst();
  if (!r) throw new NaoEncontrado('os_sem_checklist', 'Esta ordem de serviço não tem checklist.');
  uow.auditar({
    entidade: 'os_checklist',
    registroId: g.checklistId,
    acao: 'responder',
    hotelId: g.hotelId,
    depois: { osId: g.osId, respostas: g.respostas, feitaEm },
  });
  uow.publicar({
    tipo: 'os.checklist_respondido',
    entidade: 'os',
    registroId: g.osId,
    payload: { hotelId: g.hotelId, checklistId: g.checklistId, itens: Object.keys(g.respostas) },
  });
}
