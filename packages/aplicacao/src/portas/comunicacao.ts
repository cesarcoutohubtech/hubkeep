// Porta da comunicação (1c, item 5; ADR-046), implementada por packages/db.
// O worker lê, com o hk_worker e o tenant do evento, o chamado do aviso, as
// atribuições e as pessoas, e grava o registro dos envios
// (app.envio_notificacao, só de inserção). A gestão lê a contagem por
// destinatário e por dia (C8) com o contexto dela (hk_app), na RLS da
// tabela.
import type {
  Atribuicao,
  CanalDeEnvio,
  Contexto,
  Papel,
  Responsavel,
  ResponsavelDaOsAtiva,
  SituacaoDeEnvio,
} from '@hubkeep/dominio';

/** O que o aviso de um chamado precisa para achar as pessoas e montar o texto. */
export interface ChamadoDoAviso {
  id: string;
  descricao: string;
  hotel: { id: string; nome: string; fuso: string; bandeiraId: string | null };
  /** O idioma padrão do tenant (C6: depois da preferência de quem recebe). */
  idiomaDoTenant: string;
  /** As atribuições do tenant nos papéis pedidos; a vigência e o escopo são do domínio. */
  atribuicoes: Atribuicao[];
  responsavelDaOs: ResponsavelDaOsAtiva;
  /** A OS ativa do chamado, para o push abrir nela; null sem OS. */
  osAtivaId: string | null;
}

/** A OS atribuída, para o push ao técnico ou à equipe (C2). */
export interface OsDoAviso {
  id: string;
  hotel: { id: string; nome: string };
  idiomaDoTenant: string;
  /** Quem recebeu a OS no evento: o técnico, ou os membros ativos da equipe. */
  responsavelDaOs: ResponsavelDaOsAtiva;
}

/** Uma inscrição ativa de push, de um aparelho de uma pessoa. */
export interface InscricaoAtiva {
  id: string;
  usuarioId: string;
  endpoint: string;
  chaves: { p256dh: string; auth: string };
}

export interface PessoaDoEnvio {
  usuarioId: string;
  ativo: boolean;
  email: string | null;
  /** A preferência gravada pelo membro; null: sem preferência. */
  idioma: string | null;
}

export interface EnvioRegistrado {
  hotelId: string;
  eventoId: string;
  tipoEvento: string;
  usuarioId: string;
  canal: CanalDeEnvio;
  situacao: SituacaoDeEnvio;
}

/** Envios de um destinatário num dia (C8), na data UTC. */
export interface ContagemDeEnvios {
  usuarioId: string;
  nome: string | null;
  canal: CanalDeEnvio;
  /** AAAA-MM-DD. */
  dia: string;
  envios: number;
}

export interface PortaComunicacao {
  /** O chamado do aviso, no tenant do evento; null se não existe mais. */
  chamadoDoAviso(
    tenantId: string,
    chamadoId: string,
    papeis: readonly Papel[],
  ): Promise<ChamadoDoAviso | null>;
  /** A OS do evento os.atribuida, com quem a recebeu; null se não existe mais. */
  osDoAviso(tenantId: string, osId: string, responsavel: Responsavel): Promise<OsDoAviso | null>;
  pessoas(tenantId: string, usuarioIds: readonly string[]): Promise<PessoaDoEnvio[]>;
  /** As inscrições ativas de push das pessoas, em ordem. */
  inscricoesAtivas(tenantId: string, usuarioIds: readonly string[]): Promise<InscricaoAtiva[]>;
  /** Revoga a inscrição que o serviço de push recusou (404 ou 410). */
  revogarInscricaoRecusada(tenantId: string, inscricaoId: string): Promise<void>;
  /** Já há envio do evento à pessoa no canal, fora as falhas? */
  jaEnviado(
    tenantId: string,
    g: { eventoId: string; usuarioId: string; canal: CanalDeEnvio },
  ): Promise<boolean>;
  /** Grava o envio; o mesmo envio já gravado (o índice da 0049) não grava de novo. */
  registrarEnvio(tenantId: string, e: EnvioRegistrado): Promise<void>;
  /** A contagem por destinatário e por dia, no período, com a RLS de quem pede (C8). */
  contagemPorDia(
    ctx: Contexto,
    f: { de: Date; ate: Date; hotelId: string | null },
  ): Promise<ContagemDeEnvios[]>;
}

/** O que vai ao aparelho: o título, uma linha e o caminho que o toque abre no PWA. */
export interface MensagemDePush {
  titulo: string;
  corpo: string;
  /** Caminho do PWA, como /os/<id>. */
  caminho: string;
}

/**
 * O envio pelo serviço de push do navegador (Web Push, VAPID). "expirada":
 * o serviço recusou a inscrição para sempre (404 ou 410). Outro erro lança.
 */
export interface EnviadorDePush {
  enviar(
    destino: { endpoint: string; chaves: { p256dh: string; auth: string } },
    mensagem: MensagemDePush,
  ): Promise<'entregue' | 'expirada'>;
}

/** As inscrições do próprio usuário (hk_app, com o contexto dele). */
export interface PortaInscricoesPush {
  /** Grava a inscrição do aparelho; a mesma já ativa não grava de novo. */
  inscrever(
    ctx: Contexto,
    d: { endpoint: string; chaves: { p256dh: string; auth: string } },
  ): Promise<{ id: string }>;
  /** Revoga a inscrição ativa do aparelho; sem ela, não faz nada. */
  revogar(ctx: Contexto, endpoint: string): Promise<void>;
}
