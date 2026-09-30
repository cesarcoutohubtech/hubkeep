// Histórico de um registro (fase 1a, D1). Só leitura, com withContext: a RLS
// da tabela do registro diz se ele existe para quem pede, a de app.auditoria
// diz que linhas ele lê (migração da D1: o proprietário lê a do que ele vê), e
// a de cada tabela apontada decide que nomes voltam. O nome de quem gravou
// vem por left join: sem leitura do membro, volta null, sem esconder a linha.
import type { LinhaDeAuditoria, PortaHistorico, ReferenciaDoHistorico } from '@hubkeep/aplicacao';
import type { TipoDeReferencia } from '@hubkeep/dominio';
import type { AcessoBanco } from './acesso';
import type { Tx } from './conexao';
import { hotelDoRegistro } from './consultas';

type NomesPorIdioma = Extract<ReferenciaDoHistorico, { chavePadrao: unknown }>['nomes'];
type Idioma = Awaited<ReturnType<PortaHistorico['idiomaPadrao']>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tabelas com nome simples, por tipo de referência. */
const COM_NOME = {
  equipe: 'app.equipe',
  local: 'app.local',
  ativo: 'app.ativo',
  bandeira: 'app.bandeira',
} as const;

/** Tabelas com nome por idioma e chave do catálogo (ADR-027, ADR-028). */
const COM_NOMES = {
  situacao: 'app.situacao',
  prioridade: 'app.prioridade',
  categoria: 'app.categoria_ativo',
} as const;

async function referencias(
  tx: Tx,
  ids: ReadonlyMap<string, TipoDeReferencia>,
): Promise<Record<string, ReferenciaDoHistorico>> {
  const porTipo = new Map<TipoDeReferencia, string[]>();
  for (const [id, tipo] of ids) {
    if (!UUID.test(id)) continue;
    porTipo.set(tipo, [...(porTipo.get(tipo) ?? []), id]);
  }
  const saida: Record<string, ReferenciaDoHistorico> = {};
  for (const [tipo, lista] of porTipo) {
    if (tipo === 'pessoa') {
      const linhas = await tx
        .selectFrom('app.membro')
        .select(['usuario_id', 'nome'])
        .where('usuario_id', 'in', lista)
        .execute();
      for (const l of linhas) saida[l.usuario_id] = { tipo, nome: l.nome };
    } else if (tipo in COM_NOME) {
      const tabela = COM_NOME[tipo as keyof typeof COM_NOME];
      const linhas = await tx
        .selectFrom(tabela)
        .select(['id', 'nome'])
        .where('id', 'in', lista)
        .execute();
      for (const l of linhas) saida[l.id] = { tipo: tipo as keyof typeof COM_NOME, nome: l.nome };
    } else {
      const tabela = COM_NOMES[tipo as keyof typeof COM_NOMES];
      const linhas = await tx
        .selectFrom(tabela)
        .select(['id', 'chave_padrao', 'nomes'])
        .where('id', 'in', lista)
        .execute();
      for (const l of linhas) {
        saida[l.id] = {
          tipo: tipo as keyof typeof COM_NOMES,
          chavePadrao: l.chave_padrao,
          nomes: l.nomes as NomesPorIdioma,
        };
      }
    }
  }
  return saida;
}

export function criarPortaHistorico(banco: AcessoBanco): PortaHistorico {
  return {
    registroVisivel: (ctx, entidade, registroId) =>
      banco.withContext(
        ctx,
        async (tx) => (await hotelDoRegistro(tx, entidade, registroId)) !== null,
      ),

    linhas: (ctx, entidade, registroId) =>
      banco.withContext(ctx, async (tx): Promise<LinhaDeAuditoria[]> => {
        const linhas = await tx
          .selectFrom('app.auditoria as a')
          .leftJoin('app.membro as m', (j) =>
            j.onRef('m.tenant_id', '=', 'a.tenant_id').onRef('m.usuario_id', '=', 'a.usuario_id'),
          )
          .select([
            'a.id',
            'a.em',
            'a.acao',
            'a.usuario_id',
            'm.nome as usuario_nome',
            'a.antes',
            'a.depois',
          ])
          .where('a.entidade', '=', entidade)
          .where('a.registro_id', '=', registroId)
          .orderBy('a.em')
          .orderBy('a.id')
          .execute();
        return linhas.map((l) => ({
          id: l.id,
          em: l.em,
          acao: l.acao,
          usuarioId: l.usuario_id,
          usuarioNome: l.usuario_nome,
          antes: l.antes,
          depois: l.depois,
        }));
      }),

    referencias: (ctx, ids) => banco.withContext(ctx, (tx) => referencias(tx, ids)),

    idiomaPadrao: (ctx) =>
      banco.withContext(ctx, async (tx) => {
        const t = await tx.selectFrom('app.tenant').select('idioma_padrao').executeTakeFirst();
        return (t?.idioma_padrao ?? 'pt-BR') as Idioma;
      }),
  };
}
