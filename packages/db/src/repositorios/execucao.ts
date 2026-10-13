// Execução da OS pelo Técnico (fase 1a, C4), na unit of work da operação
// offline, com auditoria e evento. A RLS decide por último (migração 0023): só
// o responsável anda com a OS e com o chamado dela e insere horas e material,
// em nome dele mesmo. A transição confere a versão (ADR-029). Na 1c
// (ADR-042), a pausa grava o motivo na transição, e a retomada da pausa que
// parou o relógio grava no chamado o prazo de solução refeito e soma o tempo
// parado, com a versão lida dele.
import type { AcaoNaOsDecidida } from '@hubkeep/aplicacao';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';
import { registrarTransicao } from './transicoes';
import { refletirNoChamado, semLinha } from './triagem';

const EVENTO_DA_ACAO = {
  iniciar: 'os.iniciada',
  pausar: 'os.pausada',
  retomar: 'os.retomada',
  concluir: 'os.concluida',
} as const;

export async function andarComOs(
  uow: UnidadeDeTrabalho,
  g: AcaoNaOsDecidida,
): Promise<{ versao: number }> {
  const tx = transacaoDe(uow);
  const r = await tx
    .updateTable('app.os')
    .set({
      estado: g.estado,
      situacao_id: g.situacaoId,
      ...(g.codigos
        ? {
            codigo_falha_id: g.codigos.codigos.falhaId,
            codigo_causa_id: g.codigos.codigos.causaId,
            codigo_solucao_id: g.codigos.codigos.solucaoId,
          }
        : {}),
      versao: sql<number>`versao + 1`,
      atualizado_em: sql`now()`,
    })
    .where('id', '=', g.osId)
    .where('versao', '=', g.versao)
    .returning(['hotel_id', 'chamado_id', 'versao'])
    .executeTakeFirst();
  if (!r) return semLinha(tx, 'app.os', g.osId, g.versao);
  await registrarTransicao(uow, {
    osId: g.osId,
    hotelId: r.hotel_id,
    acao: g.acao,
    de: g.de,
    para: g.estado,
    quando: g.quando,
    ...(g.pausa ? { motivoPausa: g.pausa.motivo } : {}),
  });
  if (g.chamado) await refletirNoChamado(uow, g.chamado);
  if (g.slaNaRetomada) {
    const c = g.slaNaRetomada;
    const atualizado = await tx
      .updateTable('app.chamado')
      .set({
        prazo_solucao: c.prazoSolucao,
        pausado_segundos: sql<number>`pausado_segundos + ${c.pausadoSegundos}`,
        versao: sql<number>`versao + 1`,
        atualizado_em: sql`now()`,
      })
      .where('id', '=', c.chamadoId)
      .where('versao', '=', c.versaoDoChamado)
      .returning('id')
      .executeTakeFirst();
    if (!atualizado) await semLinha(tx, 'app.chamado', c.chamadoId, c.versaoDoChamado);
  }
  uow.auditar({
    entidade: 'os',
    registroId: g.osId,
    acao: g.acao,
    hotelId: r.hotel_id,
    depois: {
      estado: g.estado,
      situacaoId: g.situacaoId,
      versao: r.versao,
      ...(g.chamado ? { estadoDoChamado: g.chamado.estado } : {}),
      ...(g.codigos
        ? { codigos: g.codigos.codigos, codigosDescartados: g.codigos.descartados }
        : {}),
      ...(g.pausa ? { motivoPausa: g.pausa.motivo, pausaParaORelogio: g.pausa.paraORelogio } : {}),
      ...(g.slaNaRetomada
        ? {
            prazoSolucaoAntes: g.slaNaRetomada.prazoSolucaoAntes,
            prazoSolucao: g.slaNaRetomada.prazoSolucao,
            pausadoSegundos: g.slaNaRetomada.pausadoSegundos,
          }
        : {}),
    },
  });
  uow.publicar({
    tipo: EVENTO_DA_ACAO[g.acao],
    entidade: 'os',
    registroId: g.osId,
    payload: { hotelId: r.hotel_id, chamadoId: r.chamado_id, versao: r.versao },
  });
  return { versao: r.versao };
}

export async function apontarHoras(
  uow: UnidadeDeTrabalho,
  g: { osId: string; hotelId: string; inicio: Date; fim: Date },
): Promise<{ id: string }> {
  if (!uow.usuarioId) throw new Error('Apontamento exige usuário no contexto.');
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.os_apontamento')
    .values({
      id,
      tenant_id: uow.tenantId,
      hotel_id: g.hotelId,
      os_id: g.osId,
      usuario_id: uow.usuarioId,
      inicio: g.inicio,
      fim: g.fim,
    })
    .execute();
  const depois = { osId: g.osId, inicio: g.inicio.toISOString(), fim: g.fim.toISOString() };
  uow.auditar({
    entidade: 'os_apontamento',
    registroId: id,
    acao: 'apontar',
    hotelId: g.hotelId,
    depois,
  });
  uow.publicar({
    tipo: 'os.horas_apontadas',
    entidade: 'os',
    registroId: g.osId,
    payload: { hotelId: g.hotelId, apontamentoId: id },
  });
  return { id };
}

export async function registrarMaterial(
  uow: UnidadeDeTrabalho,
  g: { osId: string; hotelId: string; descricao: string },
): Promise<{ id: string }> {
  if (!uow.usuarioId) throw new Error('Material exige usuário no contexto.');
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.os_material')
    .values({
      id,
      tenant_id: uow.tenantId,
      hotel_id: g.hotelId,
      os_id: g.osId,
      usuario_id: uow.usuarioId,
      descricao: g.descricao,
    })
    .execute();
  uow.auditar({
    entidade: 'os_material',
    registroId: id,
    acao: 'registrar',
    hotelId: g.hotelId,
    depois: { osId: g.osId, descricao: g.descricao },
  });
  uow.publicar({
    tipo: 'os.material_registrado',
    entidade: 'os',
    registroId: g.osId,
    payload: { hotelId: g.hotelId, materialId: id },
  });
  return { id };
}
