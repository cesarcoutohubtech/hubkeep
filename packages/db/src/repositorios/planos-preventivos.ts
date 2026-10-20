// Planos preventivos (fase 1b, PV2; ADR-041), na unit of work, com auditoria
// e evento. A RLS decide por último: a gestão do hotel e o Implantador gravam
// os planos dos hotéis deles; para os outros, o INSERT é recusado (42501) e o
// UPDATE não acha linha.
import { Conflito, NaoEncontrado, conflitoDeVersao } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

type Unidade = 'dia' | 'semana' | 'mes';
type Situacao = 'ativo' | 'pausado' | 'encerrado';

export interface DadosDoPlanoNoBanco {
  nome: string;
  intervalo: number;
  unidade: Unidade;
  inicio: string;
  checklistModeloId: string | null;
  tecnicoId: string | null;
  equipeId: string | null;
}

const colunasDeDados = (d: DadosDoPlanoNoBanco) => ({
  nome: d.nome,
  intervalo: d.intervalo,
  unidade: d.unidade,
  inicio: d.inicio,
  checklist_modelo_id: d.checklistModeloId,
  tecnico_id: d.tecnicoId,
  equipe_id: d.equipeId,
});

export async function criarPlanoPreventivo(
  uow: UnidadeDeTrabalho,
  p: DadosDoPlanoNoBanco & {
    hotelId: string;
    ativoId: string | null;
    categoriaId: string | null;
    situacao: Situacao;
    /** O plano do pacote de que este é cópia (PB1); repetido no hotel: Conflito plano_ja_copiado. */
    planoPadraoId?: string | null;
  },
): Promise<{ id: string; versao: number }> {
  // Quem cadastra é sempre uma pessoa, pelo hk_app; o worker não grava plano.
  if (uow.usuarioId === null) throw new Error('Plano preventivo sem usuário.');
  const id = novoId();
  try {
    await transacaoDe(uow)
      .insertInto('app.plano_preventivo')
      .values({
        id,
        tenant_id: uow.tenantId,
        hotel_id: p.hotelId,
        ativo_id: p.ativoId,
        categoria_id: p.categoriaId,
        situacao: p.situacao,
        criado_por: uow.usuarioId,
        plano_padrao_id: p.planoPadraoId ?? null,
        ...colunasDeDados(p),
      })
      .execute();
  } catch (e) {
    const { code, constraint } = e as { code?: string; constraint?: string };
    if (code === '23505' && constraint === 'plano_preventivo_padrao_unico') {
      throw new Conflito('plano_ja_copiado', 'O plano do pacote já foi copiado para o hotel.');
    }
    throw e;
  }
  uow.auditar({
    entidade: 'plano_preventivo',
    registroId: id,
    acao: 'criar',
    hotelId: p.hotelId,
    depois: p,
  });
  uow.publicar({
    tipo: 'plano_preventivo.criado',
    entidade: 'plano_preventivo',
    registroId: id,
    payload: { hotelId: p.hotelId, situacao: p.situacao },
  });
  return { id, versao: 1 };
}

export async function alterarPlanoPreventivo(
  uow: UnidadeDeTrabalho,
  id: string,
  versaoEsperada: number,
  mudanca: DadosDoPlanoNoBanco | { situacao: Situacao },
): Promise<{ versao: number }> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.plano_preventivo')
    .select([
      'nome',
      'intervalo',
      'unidade',
      sql<string>`inicio::text`.as('inicio'),
      'checklist_modelo_id',
      'tecnico_id',
      'equipe_id',
      'situacao',
      'versao',
    ])
    .where('id', '=', id)
    .executeTakeFirst();
  const valores = 'situacao' in mudanca ? { situacao: mudanca.situacao } : colunasDeDados(mudanca);
  const r = await tx
    .updateTable('app.plano_preventivo')
    .set({ ...valores, versao: sql<number>`versao + 1`, atualizado_em: sql`now()` })
    .where('id', '=', id)
    .where('versao', '=', versaoEsperada)
    .returning(['hotel_id', 'versao'])
    .executeTakeFirst();
  if (!r) {
    // Visível e com outra versão: alguém gravou antes (ADR-029). Relê depois
    // do UPDATE, como em alterarAtivo. Sem linha visível ou gravável (RLS),
    // é "não encontrado".
    const atual = await tx
      .selectFrom('app.plano_preventivo')
      .select('versao')
      .where('id', '=', id)
      .executeTakeFirst();
    if (atual && atual.versao !== versaoEsperada) throw conflitoDeVersao(atual.versao);
    throw new NaoEncontrado('plano_nao_encontrado', 'Plano não encontrado.');
  }
  const acao =
    'situacao' in mudanca
      ? mudanca.situacao === 'ativo'
        ? 'ativar'
        : mudanca.situacao === 'pausado'
          ? 'pausar'
          : 'encerrar'
      : 'alterar';
  uow.auditar({
    entidade: 'plano_preventivo',
    registroId: id,
    acao,
    hotelId: r.hotel_id,
    antes,
    depois: { ...mudanca, versao: r.versao },
  });
  uow.publicar({
    tipo: 'plano_preventivo.alterado',
    entidade: 'plano_preventivo',
    registroId: id,
    payload: { hotelId: r.hotel_id, acao, versao: r.versao },
  });
  return { versao: r.versao };
}
