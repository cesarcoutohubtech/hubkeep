// Chamados (fase 1a, C2), na unit of work, com auditoria e evento. A RLS
// decide por último: abre quem tem escrita no hotel, em nome dele mesmo. Com o
// equipamento parado (C5), a parada aberta do ativo vai na mesma unit of work;
// com a UH indisponível (I4), o período aberto da UH também. Na 1c
// (ADR-042), a categoria e os prazos de SLA vão na mesma linha.
import type { DadosDeChamado } from '@hubkeep/aplicacao';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';
import { colunasPesquisaveisDoChamado } from './busca';
import { pararNaAbertura } from './paradas';
import { marcarUhIndisponivel } from './uh-indisponivel';

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
      categoria_id: d.categoriaId,
      prazo_atendimento: d.prazoAtendimento,
      prazo_solucao: d.prazoSolucao,
      origem: d.origem,
      impacto_hospede: d.impactoHospede,
      aberto_por: uow.usuarioId,
    })
    .execute();
  uow.auditar({ entidade: 'chamado', registroId: id, acao: 'abrir', hotelId, depois: d });
  if (d.uhIndisponivelDesde !== null) {
    await marcarUhIndisponivel(uow, {
      hotelId,
      localId: d.localId,
      chamadoId: id,
      inicio: d.uhIndisponivelDesde,
    });
  }
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
      origem: d.origem,
      impactoHospede: d.impactoHospede,
    },
  });
  return { id, versao: 1 };
}
