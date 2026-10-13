// Porta da geração da OS preventiva (fase 1b, PV3; ADR-041). Implementada por
// packages/db com o hk_worker, uma transação por hotel (decisão 13): num grupo
// de 40 hotéis, o dia 1º do mês gera milhares de OS, e o worker tem
// statement_timeout de 30 s. Os planos do hotel são travados com
// `for update skip locked`, e o índice único (plano, ativo, data prevista)
// segura uma segunda execução.
import type {
  PlanoParaGerar,
  PreventivaAGerar,
  PreventivaGerada,
  Responsavel,
} from '@hubkeep/dominio';

/** O hotel com status ativo; o em implantação e o desativado não geram. */
export interface HotelParaGerar {
  id: string;
  /** O fuso IANA do hotel: o "hoje" do calendário do plano. */
  fuso: string;
}

/** O plano ativo do hotel, como está no banco. */
export interface PlanoDoHotel extends Omit<PlanoParaGerar, 'responsavel'> {
  responsavel: Responsavel | null;
  /**
   * O responsável ainda vale: o técnico é membro ativo com o papel de Técnico
   * vigente no hotel, ou a equipe está ativa.
   */
  responsavelValido: boolean;
}

/** Um ativo do alvo do plano: não desativado e não pendente de aprovação. */
export interface AtivoDoAlvo {
  id: string;
  localId: string;
  criadoEm: Date;
}

export interface SessaoDaGeracao {
  /** Os planos ativos do hotel, travados; o que outra execução já trava fica de fora. */
  planosAtivos(): Promise<PlanoDoHotel[]>;
  /** Os ativos do alvo, resolvidos no dia: um ativo novo da categoria entra sozinho. */
  ativosDoAlvo(planoId: string): Promise<AtivoDoAlvo[]>;
  /** As OS que o plano já gerou para os ativos dele. */
  geradas(planoId: string): Promise<PreventivaGerada[]>;
  /**
   * Grava a OS atribuída, a transição gerar sem usuário, a cópia do checklist,
   * a auditoria os/gerar e o evento os.atribuida. False se a ocorrência já
   * tinha OS (o índice único: outra execução gravou antes).
   */
  gerar(os: PreventivaAGerar): Promise<boolean>;
}

export interface PortaGeracaoPreventiva {
  hoteisAtivos(tenantId: string): Promise<HotelParaGerar[]>;
  noHotel<T>(
    ctx: { tenantId: string; hotelId: string },
    fn: (s: SessaoDaGeracao) => Promise<T>,
  ): Promise<T>;
}
