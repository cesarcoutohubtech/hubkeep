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
  pessoas(tenantId: string, usuarioIds: readonly string[]): Promise<PessoaDoEnvio[]>;
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
