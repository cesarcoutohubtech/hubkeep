// Porta da geração da OS preventiva (fase 1b, PV3; ADR-041). Implementada por
// packages/db com o hk_worker, uma transação por hotel (decisão 13): num grupo
// de 40 hotéis, o dia 1º do mês gera milhares de OS, e o worker tem
// statement_timeout de 30 s. A sessão trava o hotel (advisory lock de
// transação; a execução que não consegue a trava pula o hotel), e o índice
// único (plano, ativo, data prevista) segura uma segunda execução.
import type {
  ModeloContratual,
  NiveisDePolitica,
  PlanoParaGerar,
  PreventivaAGerar,
  PreventivaGerada,
  ResponsavelDoArrendamento,
  ResponsavelDoPlano,
  SituacaoParaRegra,
} from '@hubkeep/dominio';

/** O hotel com status ativo; o em implantação e o desativado não geram. */
export interface HotelParaGerar {
  id: string;
  bandeiraId: string | null;
  /** O fuso IANA do hotel: o "hoje" do calendário do plano. */
  fuso: string;
  /** Só o arrendado marca quem responde pela OS (ADR-045). */
  modeloContratual: ModeloContratual | null;
}

/** O plano ativo do hotel, como está no banco. */
export interface PlanoDoHotel extends Omit<PlanoParaGerar, 'responsavel'> {
  /** O responsável padrão, com o que a regra precisa para saber se ainda vale. */
  responsavel: ResponsavelDoPlano | null;
}

/** Um ativo do alvo do plano: não desativado. */
export interface AtivoDoAlvo {
  id: string;
  localId: string;
  /** A categoria do ativo: no arrendado, diz quem responde pela OS. */
  categoriaId: string | null;
  criadoEm: Date;
}

/** O modelo de checklist do plano, como está hoje: a OS guarda a cópia (ADR-040). */
export interface ModeloParaACopia {
  id: string;
  versao: number;
  nomes: object;
  itens: object[];
  ativa: boolean;
}

/** A OS que a sessão grava, com o que o caso de uso resolveu no hotel. */
export interface PreventivaAGravar extends PreventivaAGerar {
  situacaoId: string;
  /** Nulo fora do hotel arrendado. */
  responsavelArrendamento: ResponsavelDoArrendamento | null;
  /** O checklist copiado; nulo sem modelo no plano ou com o modelo desativado. */
  checklist: Omit<ModeloParaACopia, 'ativa'> | null;
}

export interface SessaoDaGeracao {
  /** Os planos ativos do hotel, travados; o que outra execução já trava fica de fora. */
  planosAtivos(): Promise<PlanoDoHotel[]>;
  /** Os ativos do alvo, resolvidos no dia: um ativo novo da categoria entra sozinho. */
  ativosDoAlvo(planoId: string): Promise<AtivoDoAlvo[]>;
  /** As OS que o plano já gerou para os ativos dele. */
  geradas(planoId: string): Promise<PreventivaGerada[]>;
  /** As situações do tenant: a OS nasce na situação do estado atribuida. */
  situacoes(): Promise<SituacaoParaRegra[]>;
  /** O valor gravado da política no hotel, na bandeira e no grupo (a resolução é do domínio). */
  politica(chave: string): Promise<NiveisDePolitica>;
  /** O modelo de checklist do plano; null se não existir mais. */
  modeloDeChecklist(id: string): Promise<ModeloParaACopia | null>;
  /**
   * Grava a OS atribuída, a transição gerar sem usuário, a cópia do checklist,
   * a auditoria os/gerar e o evento os.atribuida. False se a ocorrência já
   * tinha OS (o índice único: outra execução gravou antes).
   */
  gerar(os: PreventivaAGravar): Promise<boolean>;
}

export interface PortaGeracaoPreventiva {
  hoteisAtivos(tenantId: string): Promise<HotelParaGerar[]>;
  noHotel<T>(
    ctx: { tenantId: string; hotelId: string },
    fn: (s: SessaoDaGeracao) => Promise<T>,
  ): Promise<T>;
}
