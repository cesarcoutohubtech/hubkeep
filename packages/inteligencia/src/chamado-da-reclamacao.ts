// Abrir chamado a partir da reclamação de hóspede (adendo de 19/10/2026 ao
// ADR-047, aprovado por Cesar e Kaio):
// - o chamado abre pelo caso de uso `abrir` do núcleo, como qualquer outro;
//   aqui só se confere a reclamação e se monta o pedido (o local, o ativo, a
//   descrição e "afeta hóspede");
// - depois, numa segunda transação, a reclamação é ligada ao chamado
//   (app.sinal_hospede_chamado, 0057). Se a ligação falhar, o chamado fica sem
//   ligação, e quem abriu liga de novo;
// - pode virar chamado a reclamação de manutenção, com UH ou ativo, que ainda
//   não tem chamado; quem abre é quem decide insight no hotel (a fila);
// - o texto do hóspede não vai para o chamado: o Técnico e a Solicitante leem
//   o chamado, mas não a reclamação. A descrição é da pessoa.
import { Conflito, NaoEncontrado, RegraViolada } from '@hubkeep/dominio';
import { podeDecidirInsight } from './insight';
import { type PortasDoPainel, exigirPainel } from './painel';

export interface ReclamacaoParaChamado {
  id: string;
  hotelId: string;
  bandeiraId: string | null;
  manutencao: boolean | null;
  uhId: string | null;
  ativoId: string | null;
  /** O local do ativo da classificação; null sem ativo. */
  localDoAtivo: string | null;
  chamadoId: string | null;
}

export interface LigacaoDoChamado {
  sinalId: string;
  hotelId: string;
  chamadoId: string;
  ligadoPor: string;
  em: Date;
}

export interface PortasDoChamadoDaReclamacao extends PortasDoPainel {
  /** A reclamação, se quem pede a lê, com o local do ativo e o chamado já ligado. */
  reclamacaoParaChamado(id: string): Promise<ReclamacaoParaChamado | null>;
  /** Grava a ligação, a auditoria e o evento; reclamacao_ja_tem_chamado se outra veio antes. */
  ligarChamado(l: LigacaoDoChamado): Promise<void>;
}

export interface PedidoDoChamadoDaReclamacao {
  sinalId: string;
  /** Com o ativo da classificação; sem ele, o chamado abre na UH. */
  comAtivo: boolean;
  descricao: string;
}

/** O pedido para o caso de uso `abrir` do núcleo. */
export interface AberturaDoChamadoDaReclamacao {
  localId: string;
  ativoId: string | null;
  descricao: string;
  impactoHospede: true;
}

const sinalNaoEncontrado = (): NaoEncontrado =>
  new NaoEncontrado('sinal_nao_encontrado', 'Reclamação não encontrada.');

const jaTemChamado = (chamadoId: string): Conflito =>
  new Conflito('reclamacao_ja_tem_chamado', 'A reclamação já tem chamado.', { chamadoId });

async function reclamacaoDeQuemDecide(
  p: PortasDoChamadoDaReclamacao,
  sinalId: string,
  agora: Date,
): Promise<ReclamacaoParaChamado> {
  const atribuicoes = await exigirPainel(p, agora);
  const r = await p.reclamacaoParaChamado(sinalId);
  if (
    !r ||
    !podeDecidirInsight(
      atribuicoes,
      { tipo: 'hotel', hotelId: r.hotelId, bandeiraId: r.bandeiraId },
      agora,
    )
  ) {
    throw sinalNaoEncontrado();
  }
  return r;
}

/**
 * Confere a reclamação e monta o pedido do chamado, sem gravar nada. O chamado
 * abre no local do ativo (com o ativo) ou na UH da classificação.
 */
export async function prepararChamadoDaReclamacao(
  p: PortasDoChamadoDaReclamacao,
  pedido: PedidoDoChamadoDaReclamacao,
  agora: Date,
): Promise<AberturaDoChamadoDaReclamacao> {
  const r = await reclamacaoDeQuemDecide(p, pedido.sinalId, agora);
  if (r.chamadoId) throw jaTemChamado(r.chamadoId);
  if (r.manutencao !== true) {
    throw new RegraViolada(
      'reclamacao_sem_manutencao',
      'Só a reclamação de manutenção vira chamado.',
    );
  }
  if (pedido.comAtivo && !r.ativoId) {
    throw new RegraViolada('reclamacao_sem_ativo', 'A reclamação não tem ativo ligado.');
  }
  const ativoId = pedido.comAtivo ? r.ativoId : null;
  const localId = ativoId ? r.localDoAtivo : r.uhId;
  if (!localId) {
    throw new RegraViolada('reclamacao_sem_local', 'A reclamação não tem UH nem ativo.');
  }
  return { localId, ativoId, descricao: pedido.descricao, impactoHospede: true };
}

/**
 * Liga a reclamação ao chamado que quem pede abriu a partir dela. A mesma
 * ligação de novo não faz nada; outro chamado já ligado é conflito. O banco
 * recusa o chamado de outro hotel ou aberto por outra pessoa (0057).
 */
export async function ligarChamadoDaReclamacao(
  p: PortasDoChamadoDaReclamacao,
  l: { sinalId: string; chamadoId: string; usuarioId: string },
  agora: Date,
): Promise<void> {
  const r = await reclamacaoDeQuemDecide(p, l.sinalId, agora);
  if (r.chamadoId === l.chamadoId) return;
  if (r.chamadoId) throw jaTemChamado(r.chamadoId);
  await p.ligarChamado({
    sinalId: r.id,
    hotelId: r.hotelId,
    chamadoId: l.chamadoId,
    ligadoPor: l.usuarioId,
    em: agora,
  });
}
