// Configuração do tenant e do hotel e políticas (fase 1a, A7; ADR-026), na
// unit of work, com auditoria. A RLS decide por último: só o Admin do grupo
// altera app.tenant, app.hotel e app.politica.
import type {
  ConfiguracaoDoTenant,
  EscopoDePolitica,
  MudancaDaConfiguracaoDoHotel,
} from '@hubkeep/aplicacao';
import { NaoEncontrado } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export async function configurarTenant(
  uow: UnidadeDeTrabalho,
  c: Omit<ConfiguracaoDoTenant, 'nome'>,
): Promise<void> {
  const r = await transacaoDe(uow)
    .updateTable('app.tenant')
    .set({ pais: c.pais, subdivisao: c.subdivisao, moeda: c.moeda, idioma_padrao: c.idiomaPadrao })
    .where('id', '=', uow.tenantId)
    .returning(['id'])
    .executeTakeFirst();
  if (!r) throw new NaoEncontrado('tenant_nao_encontrado', 'Grupo não encontrado.');
  uow.auditar({ entidade: 'tenant', registroId: uow.tenantId, acao: 'configurar', depois: c });
}

export async function configurarHotel(
  uow: UnidadeDeTrabalho,
  hotelId: string,
  c: MudancaDaConfiguracaoDoHotel,
): Promise<void> {
  // O antes vai para a auditoria, para o histórico do hotel mostrar o que mudou (D1).
  const antes = await transacaoDe(uow)
    .selectFrom('app.hotel')
    .select(['fuso', 'pais', 'subdivisao', 'moeda', 'idioma_padrao', 'modelo_contratual'])
    .where('id', '=', hotelId)
    .executeTakeFirst();
  const r = await transacaoDe(uow)
    .updateTable('app.hotel')
    .set({
      fuso: c.fuso,
      pais: c.pais,
      subdivisao: c.subdivisao,
      moeda: c.moeda,
      idioma_padrao: c.idiomaPadrao,
      // Ausente: fica o gravado (I2).
      ...(c.modeloContratual === undefined ? {} : { modelo_contratual: c.modeloContratual }),
      atualizado_em: sql`now()`,
    })
    .where('id', '=', hotelId)
    .returning(['id'])
    .executeTakeFirst();
  if (!r) throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
  uow.auditar({
    entidade: 'hotel',
    registroId: hotelId,
    acao: 'configurar',
    hotelId,
    antes: antes ?? null,
    depois: c,
  });
  uow.publicar({
    tipo: 'hotel.alterado',
    entidade: 'hotel',
    registroId: hotelId,
    payload: { hotelId },
  });
}

/**
 * Grava a política do escopo (uma linha por chave em cada escopo). Com valor
 * null, desativa a linha: o escopo volta a herdar. Sem DELETE (regra do projeto).
 */
export async function gravarPolitica(
  uow: UnidadeDeTrabalho,
  chave: string,
  escopo: EscopoDePolitica,
  valor: unknown | null,
): Promise<void> {
  if (!uow.usuarioId) throw new Error('Política exige um usuário na sessão.');
  const tx = transacaoDe(uow);
  const hotelId = escopo.tipo === 'hotel' ? escopo.hotelId : null;
  let busca = tx
    .selectFrom('app.politica')
    .select(['id', 'valor', 'ativa'])
    .where('chave', '=', chave)
    .where('escopo_tipo', '=', escopo.tipo);
  busca = hotelId ? busca.where('hotel_id', '=', hotelId) : busca.where('hotel_id', 'is', null);
  const existente = await busca.executeTakeFirst();
  let id: string;
  if (existente) {
    id = existente.id;
    const r = await tx
      .updateTable('app.politica')
      .set({
        ...(valor === null ? { ativa: false } : { valor: JSON.stringify(valor), ativa: true }),
        atualizado_por: uow.usuarioId,
        atualizado_em: sql`now()`,
      })
      .where('id', '=', id)
      .returning(['id'])
      .executeTakeFirst();
    if (!r) throw new NaoEncontrado('politica_nao_encontrada', 'Política não encontrada.');
  } else {
    if (valor === null) return; // nada a desativar: já herda
    id = novoId();
    await tx
      .insertInto('app.politica')
      .values({
        id,
        tenant_id: uow.tenantId,
        escopo_tipo: escopo.tipo,
        hotel_id: hotelId,
        chave,
        valor: JSON.stringify(valor),
        atualizado_por: uow.usuarioId,
      })
      .execute();
  }
  uow.auditar({
    entidade: 'politica',
    registroId: id,
    acao: valor === null ? 'voltar_a_herdar' : 'gravar',
    hotelId,
    antes: existente ? { valor: existente.valor, ativa: existente.ativa } : null,
    depois: { chave, escopo: escopo.tipo, valor },
  });
}
