// Aceite da F0-06: "um teste de integração prova que, se a checagem da
// aplicação for removida, a RLS ainda bloqueia a escalada".
//
// Vai além de um caso: compara a regra do domínio com o banco numa matriz de
// pedidos de concessão (4 concedentes × 7 papéis × 5 escopos × 2 validades),
// cada um tentado de verdade no banco numa transação desfeita no fim. Garante:
//   1. tudo o que o domínio PERMITE, o banco aceita (senão o usuário leva 500);
//   2. toda ESCALADA que o domínio nega (PermissaoNegada), o banco também nega;
//   3. o domínio só é mais estrito que o banco onde está nomeado: validade no
//      passado, regra de negócio que o banco não tem.
// E um caso explícito: o caso de uso com a checagem trocada por "permite tudo"
// esbarra na RLS.
import { randomUUID } from 'node:crypto';
import { type RegrasDePapeis, criarCasosDeUsoDePapeis, relogioDoSistema } from '@hubkeep/aplicacao';
import {
  type Atribuicao,
  type Escopo,
  PAPEIS,
  type PedidoDeConcessao,
  PermissaoNegada,
  RegraViolada,
  podeConcederPapel,
  podeRevogarPapel,
} from '@hubkeep/dominio';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AcessoBanco, criarAcessoBanco, criarPortasDeAplicacao } from '../src/index';
import { concederPapel, revogarPapel } from '../src/repositorios/membros';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}
const url = (v: string | undefined): string => {
  if (!v) throw new Error('URL de teste ausente.');
  return v;
};

const T = randomUUID();
const H1 = randomUUID();
const H2 = randomUUID();
const BD = randomUUID();
const P1 = randomUUID();
const U = {
  admin: randomUUID(),
  implantador: randomUUID(),
  implantadorVencido: randomUUID(),
  gerente: randomUUID(),
  alvo: randomUUID(),
};
const ATR = {
  admin: randomUUID(),
  implantador: randomUUID(),
  implantadorVencido: randomUUID(),
  gerente: randomUUID(),
  alvoTecnicoH1: randomUUID(),
};

const ESCOPOS: Escopo[] = [
  { tipo: 'grupo' },
  { tipo: 'bandeira', bandeiraId: BD },
  { tipo: 'hotel', hotelId: H1 },
  { tipo: 'hotel', hotelId: H2 },
  { tipo: 'proprietario', proprietarioId: P1 },
];
const EM_UM_ANO = new Date(Date.now() + 365 * 86_400_000);
const ONTEM = new Date(Date.now() - 86_400_000);

class Sentinela extends Error {}

describe.skipIf(!temBanco)(
  'paridade domínio × RLS na concessão de papéis',
  { timeout: 120_000 },
  () => {
    let dono: pg.Client;
    let banco: AcessoBanco;

    beforeAll(async () => {
      dono = new pg.Client({ connectionString: url(URL_DONO) });
      await dono.connect();
      const q = (sql: string, p: unknown[]) => dono.query(sql, p);
      await q(`insert into app.tenant (id, nome) values ($1, 'Paridade')`, [T]);
      await q(`insert into app.bandeira (id, tenant_id, nome) values ($1, $2, 'Bandeira P')`, [
        BD,
        T,
      ]);
      await q(
        `insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values
         ($1, $3, $4, 'H1', 'America/Sao_Paulo', 'ativo'), ($2, $3, null, 'H2', 'America/Sao_Paulo', 'ativo')`,
        [H1, H2, T, BD],
      );
      await q(`insert into app.proprietario (id, tenant_id, nome) values ($1, $2, 'P1')`, [P1, T]);
      for (const [nome, id] of Object.entries(U)) {
        await q(`insert into auth.users (id, email) values ($1, $2)`, [
          id,
          `${nome}-${id}@hubkeep.test`,
        ]);
        await q(
          `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
          [T, id, nome, `${nome}-${id}@hubkeep.test`],
        );
      }
      const conceder = (
        id: string,
        usuario: string,
        papel: string,
        escopo: string,
        hotel: string | null,
        valido: Date | null,
      ) =>
        q(
          `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, valido_ate, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, T, usuario, papel, escopo, hotel, valido, U.admin],
        );
      await conceder(ATR.admin, U.admin, 'admin_grupo', 'grupo', null, null);
      await conceder(ATR.implantador, U.implantador, 'implantador', 'hotel', H1, EM_UM_ANO);
      await conceder(
        ATR.implantadorVencido,
        U.implantadorVencido,
        'implantador',
        'hotel',
        H1,
        ONTEM,
      );
      await conceder(ATR.gerente, U.gerente, 'gerente_hotel', 'hotel', H1, null);
      await conceder(ATR.alvoTecnicoH1, U.alvo, 'tecnico', 'hotel', H1, null);
      banco = await criarAcessoBanco({ app: { url: url(URL_APP), max: 4 } });
    });

    afterAll(async () => {
      await banco?.encerrar();
      if (!dono) return;
      for (const t of [
        'app.evento_dominio',
        'app.auditoria',
        'app.atribuicao_escopo',
        'app.membro',
        'app.hotel',
        'app.bandeira',
        'app.proprietario',
      ]) {
        await dono.query(`delete from ${t} where tenant_id = $1`, [T]);
      }
      await dono.query(`delete from app.tenant where id = $1`, [T]);
      await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
      await dono.end();
    });

    /** Tenta no banco e desfaz: 'aceito' ou o código do erro. */
    async function tentar(
      usuarioId: string,
      fn: (uow: Parameters<Parameters<AcessoBanco['executar']>[1]>[0]) => Promise<unknown>,
    ): Promise<string> {
      try {
        await banco.executar({ usuarioId, tenantId: T }, async (uow) => {
          await fn(uow);
          throw new Sentinela();
        });
        return 'sem-sentinela';
      } catch (e) {
        if (e instanceof Sentinela) return 'aceito';
        return (e as { code?: string }).code ?? (e as Error).name;
      }
    }

    it('concessão: o domínio e a RLS concordam em 280 pedidos', async () => {
      const portas = criarPortasDeAplicacao(banco);
      const agora = new Date();
      const divergencias: string[] = [];
      let aceitos = 0;
      let recusados = 0;

      for (const [nome, usuarioId] of [
        ['admin', U.admin],
        ['implantador H1', U.implantador],
        ['implantador vencido', U.implantadorVencido],
        ['gerente H1', U.gerente],
      ] as const) {
        const minhas = await portas.atribuicoes.doUsuario({ usuarioId, tenantId: T });
        for (const papel of PAPEIS) {
          for (const escopo of ESCOPOS) {
            for (const validoAte of [null, EM_UM_ANO]) {
              const pedido: PedidoDeConcessao = { usuarioId: U.alvo, papel, escopo, validoAte };
              const dom = podeConcederPapel(minhas, pedido, agora);
              const db = await tentar(usuarioId, (uow) => concederPapel(uow, pedido));
              if (db === 'aceito') aceitos++;
              else recusados++;
              const caso = `${nome} → ${papel} em ${escopo.tipo}${validoAte ? ' c/ validade' : ''}: domínio=${dom.permitido ? 'permite' : dom.erro.codigo} banco=${db}`;
              if (dom.permitido && db !== 'aceito')
                divergencias.push(`domínio permite, banco recusa — ${caso}`);
              if (!dom.permitido && dom.erro instanceof PermissaoNegada && db === 'aceito') {
                divergencias.push(`ESCALADA: domínio nega, banco aceita — ${caso}`);
              }
              if (!dom.permitido && dom.erro instanceof RegraViolada && db === 'aceito') {
                divergencias.push(`regra sem garantia no banco — ${caso}`);
              }
            }
          }
        }
      }
      expect(divergencias).toEqual([]);
      // Controle: a matriz exercita os dois lados.
      expect(aceitos).toBeGreaterThan(20);
      expect(recusados).toBeGreaterThan(100);
    });

    it('a única regra só do domínio é a validade no passado (o banco aceita; a aplicação recusa)', async () => {
      const pedido: PedidoDeConcessao = {
        usuarioId: U.alvo,
        papel: 'tecnico',
        escopo: { tipo: 'hotel', hotelId: H1 },
        validoAte: ONTEM,
      };
      const minhas = await criarPortasDeAplicacao(banco).atribuicoes.doUsuario({
        usuarioId: U.admin,
        tenantId: T,
      });
      const dom = podeConcederPapel(minhas, pedido, new Date());
      expect(dom.permitido ? null : dom.erro.codigo).toBe('validade_no_passado');
      expect(await tentar(U.admin, (uow) => concederPapel(uow, pedido))).toBe('aceito');
    });

    it('com a checagem da aplicação REMOVIDA, a RLS ainda bloqueia a escalada', async () => {
      const permiteTudo: RegrasDePapeis = {
        podeConceder: () => ({ permitido: true }),
        podeRevogar: () => ({ permitido: true }),
      };
      const semChecagem = criarCasosDeUsoDePapeis({
        ...criarPortasDeAplicacao(banco),
        relogio: relogioDoSistema,
        regras: permiteTudo,
      });
      const comChecagem = criarCasosDeUsoDePapeis({
        ...criarPortasDeAplicacao(banco),
        relogio: relogioDoSistema,
      });
      const ctxImplantador = { usuarioId: U.implantador, tenantId: T };
      const escalada: PedidoDeConcessao = {
        usuarioId: U.alvo,
        papel: 'admin_grupo',
        escopo: { tipo: 'grupo' },
      };

      // Com a checagem: mensagem clara, e nada chega ao banco.
      await expect(comChecagem.concederPapel(ctxImplantador, escalada)).rejects.toBeInstanceOf(
        PermissaoNegada,
      );
      // Sem a checagem: o banco recusa (42501, violação de policy).
      await expect(semChecagem.concederPapel(ctxImplantador, escalada)).rejects.toMatchObject({
        code: '42501',
      });
      // E a revogação da própria concessão de Implantador também esbarra na RLS.
      await expect(semChecagem.revogarPapel(ctxImplantador, ATR.implantador)).rejects.toMatchObject(
        { code: '42501' },
      );

      const r = await dono.query(
        `select count(*)::int as n from app.atribuicao_escopo where tenant_id = $1 and usuario_id = $2 and papel = 'admin_grupo'`,
        [T, U.alvo],
      );
      expect(r.rows[0]).toEqual({ n: 0 });
    });

    it('revogação: o domínio e a RLS concordam', async () => {
      const agora = new Date();
      const portas = criarPortasDeAplicacao(banco);
      const alvos: Record<string, Atribuicao> = {
        'Técnico do alvo em H1': {
          id: ATR.alvoTecnicoH1,
          usuarioId: U.alvo,
          papel: 'tecnico',
          escopo: { tipo: 'hotel', hotelId: H1 },
          validoAte: null,
          revogadoEm: null,
        },
        'Admin do grupo': {
          id: ATR.admin,
          usuarioId: U.admin,
          papel: 'admin_grupo',
          escopo: { tipo: 'grupo' },
          validoAte: null,
          revogadoEm: null,
        },
        'Implantador em H1': {
          id: ATR.implantador,
          usuarioId: U.implantador,
          papel: 'implantador',
          escopo: { tipo: 'hotel', hotelId: H1 },
          validoAte: EM_UM_ANO,
          revogadoEm: null,
        },
      };
      const divergencias: string[] = [];
      for (const [nome, usuarioId] of [
        ['admin', U.admin],
        ['implantador H1', U.implantador],
        ['gerente H1', U.gerente],
      ] as const) {
        const minhas = await portas.atribuicoes.doUsuario({ usuarioId, tenantId: T });
        for (const [rotulo, alvo] of Object.entries(alvos)) {
          const dom = podeRevogarPapel(minhas, alvo, agora);
          const db = await tentar(usuarioId, (uow) => revogarPapel(uow, alvo.id));
          const caso = `${nome} revoga ${rotulo}: domínio=${dom.permitido ? 'permite' : dom.erro.codigo} banco=${db}`;
          if (dom.permitido !== (db === 'aceito')) divergencias.push(caso);
        }
      }
      expect(divergencias).toEqual([]);
    });
  },
);
