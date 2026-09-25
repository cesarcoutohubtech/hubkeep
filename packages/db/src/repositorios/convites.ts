// Gravação do convite (ADR-018, etapa d): numa só unit of work, membro,
// atribuição, auditoria e o evento membro.convidado — que leva o que o worker
// precisa para enviar o e-mail depois do commit.
import type { GravacaoDoConvite } from '@hubkeep/aplicacao';
import { Conflito } from '@hubkeep/dominio';
import { ehMembro } from '../consultas';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';
import { concederPapel, criarMembro } from './membros';

export async function gravarConvite(uow: UnidadeDeTrabalho, g: GravacaoDoConvite): Promise<void> {
  // Pelo id: quem já é membro com outro e-mail (o e-mail foi checado antes).
  if (await ehMembro(transacaoDe(uow), { usuarioId: g.usuarioId })) {
    throw new Conflito('ja_e_membro', 'Esta pessoa já é membro deste grupo.');
  }
  await criarMembro(uow, { usuarioId: g.usuarioId, nome: g.nome, email: g.email }, g.convite);
  await concederPapel(uow, {
    usuarioId: g.usuarioId,
    papel: g.papel,
    escopo: g.escopo,
    validoAte: g.validoAte,
  });
}
