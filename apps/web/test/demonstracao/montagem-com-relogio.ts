// A montagem dos casos de uso com o relógio do roteiro (pedido do Intelligence,
// atividade 3; proposta no docs/diario-fase-1b.md, aprovada pelo Cesar em
// 13/10/2026). Serve só ao gerador do histórico (historico-inteligencia.ts) e
// aos testes; o web em funcionamento continua com o relógio do sistema, sem
// parâmetro, e não importa este arquivo (tests/relogio-do-roteiro-fora-do-web.test.ts).
//
// - A fiação é a do web (src/servidor/fabricas.ts), com o relógio de quem chama.
//   O relógio é lido pelos casos de uso (prazos de SLA, o "hoje" no fuso do
//   hotel, vigências) e, uma vez por unit of work, pelo packages/db, que grava
//   o instante nas datas do chamado, da OS, da transição, do ativo, da parada e
//   da UH indisponível (opção relogioDoRoteiro do criarAcessoBanco).
// - A auditoria e o outbox ficam com o relógio do banco: dizem quando o dado
//   entrou de fato. Num histórico gerado, a aba "Histórico" do chamado, da OS e
//   do ativo e a auditoria geral mostram tudo no dia da geração, e os eventos
//   saem na hora (só o membro.convidado tem manipulador; nada manda e-mail).
//   Os cadastros (hotéis, locais, categorias, códigos, fornecedores e a
//   política) também ficam com o banco. Por isso a demonstração do histórico
//   usa as telas do Intelligence e os indicadores, não a linha do tempo dos
//   chamados (decisão do Cesar de 13/10/2026; docs/piloto e docs/10).
// - Abre um acesso ao banco próprio, com o hk_app, nunca o memoizado da
//   composição. Recusa, antes de conectar, a Vercel, o banco de produção e
//   qualquer alvo fora da lista: o Postgres local (a CI) e os projetos de
//   [remotes.dev] e [remotes.staging] do supabase/config.toml.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Relogio } from '@hubkeep/aplicacao';
import { criarAcessoBanco, refDaConexao, tlsDaConexao } from '@hubkeep/db';
import { registrosDePoliticasPorModulo } from '@hubkeep/dominio';
import { type FabricasDeCasosDeUso, criarFabricas } from '../../src/servidor/fabricas';
import { criarFeriadosOficiais } from '../../src/servidor/feriados-oficiais';
import { montarInteligencia } from '../../src/servidor/modulos/inteligencia';

type Ambiente = Readonly<Record<string, string | undefined>>;

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const REMOTOS_PERMITIDOS = ['dev', 'staging'] as const;
const CONFIG_TOML = join(import.meta.dirname, '..', '..', '..', '..', 'supabase', 'config.toml');

/** O project_id de [remotes.<remoto>] no config.toml, ou null sem o bloco. */
export function refDoRemoto(toml: string, remoto: string): string | null {
  const blocos = toml.split(/^(?=\[)/m);
  const bloco = blocos.find((b) => b.startsWith(`[remotes.${remoto}]`));
  const m = bloco && /^project_id\s*=\s*"([a-z0-9]{20})"\s*$/m.exec(bloco);
  return m ? (m[1] ?? null) : null;
}

/** Os hosts da conexão: o da URL e os do `?host=`, que o pg aceita no lugar dele. */
function hostsDaConexao(url: string): string[] {
  try {
    const u = new URL(url);
    return [u.hostname, ...u.searchParams.getAll('host')];
  } catch {
    return [];
  }
}

/**
 * Falha fechada, sem rede e sem nunca pôr a string de conexão na mensagem:
 * recusa a Vercel, o ref de HK_REF_PRODUCAO e todo alvo que não seja o
 * Postgres local nem um projeto da lista.
 */
export function conferirAlvoDaMontagem(a: {
  ambiente: Ambiente;
  url: string;
  refsPermitidos: readonly string[];
}): void {
  if (a.ambiente['VERCEL_ENV'] || a.ambiente['VERCEL']) {
    throw new Error(
      'A montagem com o relógio do roteiro não roda na Vercel: ela serve só ao gerador ' +
        'do histórico e aos testes. Nada foi conectado.',
    );
  }
  const hosts = hostsDaConexao(a.url);
  if (hosts.length === 0) {
    throw new Error('DATABASE_URL_APP não é uma URL de conexão válida. Nada foi conectado.');
  }
  if (hosts.every((h) => HOSTS_LOCAIS.has(h))) return;
  const ref = refDaConexao(a.url);
  if (!ref) {
    throw new Error(
      'DATABASE_URL_APP remota sem project ref identificável (usuário <papel>.<ref> ou host ' +
        'db.<ref>.supabase.co): não dá para provar que não é produção. Nada foi conectado.',
    );
  }
  if (ref === a.ambiente['HK_REF_PRODUCAO']) {
    throw new Error(
      'DATABASE_URL_APP aponta para o banco de produção. A montagem com o relógio do ' +
        'roteiro nunca grava em produção. Nada foi conectado.',
    );
  }
  if (!a.refsPermitidos.includes(ref)) {
    throw new Error(
      `DATABASE_URL_APP aponta para o projeto ${ref}, fora de [remotes.dev] e ` +
        '[remotes.staging] do supabase/config.toml. Nada foi conectado.',
    );
  }
}

/** Os casos de uso que o gerador do histórico usa, com o relógio do roteiro. */
export type CasosDeUsoDoRoteiro = Pick<
  FabricasDeCasosDeUso,
  | 'bandeiras'
  | 'hoteis'
  | 'locais'
  | 'categorias'
  | 'codigos'
  | 'fornecedores'
  | 'ativos'
  | 'configuracao'
  | 'chamados'
  | 'triagem'
  | 'execucao'
  | 'paradas'
  | 'sincronizacao'
  | 'checklists'
>;

export interface MontagemComRelogio {
  casos: { [K in keyof CasosDeUsoDoRoteiro]: ReturnType<CasosDeUsoDoRoteiro[K]> };
  encerrar(): Promise<void>;
}

export interface OpcoesDaMontagem {
  /**
   * O relógio do roteiro. Quem chama avança o instante entre as operações; a
   * unit of work lê uma vez, no início.
   */
  relogio: Relogio;
  /** As variáveis do ambiente (DATABASE_URL_APP, HK_BANCO_SEM_TLS); padrão, process.env. */
  ambiente?: Ambiente;
  /** O conteúdo do supabase/config.toml; padrão, o do repositório. */
  configToml?: string;
}

export async function montarComRelogio(o: OpcoesDaMontagem): Promise<MontagemComRelogio> {
  const ambiente = o.ambiente ?? process.env;
  const url = ambiente['DATABASE_URL_APP'];
  if (!url) throw new Error('DATABASE_URL_APP não está definida.');
  const toml = o.configToml ?? readFileSync(CONFIG_TOML, 'utf8');
  conferirAlvoDaMontagem({
    ambiente,
    url,
    refsPermitidos: REMOTOS_PERMITIDOS.flatMap((r) => refDoRemoto(toml, r) ?? []),
  });

  const banco = await criarAcessoBanco({
    app: { url, ssl: tlsDaConexao(url, ambiente['HK_BANCO_SEM_TLS'] === '1') },
    relogioDoRoteiro: o.relogio,
  });
  const f = criarFabricas({
    banco,
    relogio: o.relogio,
    feriadosOficiais: criarFeriadosOficiais(),
    registrosDePoliticas: registrosDePoliticasPorModulo(montarInteligencia().extensoesDePolitica),
  });
  return {
    casos: {
      bandeiras: f.bandeiras(),
      hoteis: f.hoteis(),
      locais: f.locais(),
      categorias: f.categorias(),
      codigos: f.codigos(),
      fornecedores: f.fornecedores(),
      ativos: f.ativos(),
      configuracao: f.configuracao(),
      chamados: f.chamados(),
      triagem: f.triagem(),
      execucao: f.execucao(),
      paradas: f.paradas(),
      sincronizacao: f.sincronizacao(),
      checklists: f.checklists(),
    },
    encerrar: () => banco.encerrar(),
  };
}
