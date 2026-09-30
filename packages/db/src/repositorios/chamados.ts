// Chamados (fase 1a, C2), na unit of work, com auditoria e evento. A RLS
// decide por último: abre quem tem escrita no hotel, em nome dele mesmo. Com o
// equipamento parado (C5), a parada aberta do ativo vai na mesma unit of work.
import type { DadosDeChamado } from '@hubkeep/aplicacao';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';
import { colunasPesquisaveisDoChamado } from './busca';
import { pararNaAbertura } from './paradas';

export async function criarChamado(
  uow: UnidadeDeTrabalho,
  hotelId: string,
  d: DadosDeChamado,
): Promise<{ id: string; versao: number }> {
  if (!uow.usuarioId) throw new Error('Abertura de chamado exige usuário no contexto.');
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.chamado')
    .values({
      id,
      tenant_id: uow.tenantId,
      hotel_id: hotelId,
      local_id: d.localId,
      ativo_id: d.ativoId,
      ...colunasPesquisaveisDoChamado(d.descricao),
      estado: d.estado,
      situacao_id: d.situacaoId,
      prioridade_id: d.prioridadeId,
      politica_aplicada: JSON.stringify(d.politicaAplicada),
      aberto_por: uow.usuarioId,
    })
    .execute();
  uow.auditar({ entidade: 'chamado', registroId: id, acao: 'abrir', hotelId, depois: d });
  if (d.paradaDesde !== null && d.ativoId !== null) {
    await pararNaAbertura(uow, {
      hotelId,
      ativoId: d.ativoId,
      chamadoId: id,
      inicio: d.paradaDesde,
    });
  }
  uow.publicar({
    tipo: 'chamado.aberto',
    entidade: 'chamado',
    registroId: id,
    payload: {
      hotelId,
      localId: d.localId,
      ativoId: d.ativoId,
      prioridadeId: d.prioridadeId,
    },
  });
  return { id, versao: 1 };
}
