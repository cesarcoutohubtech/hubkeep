// Aceite da F0-08 contra Postgres real (na CI, o Supabase do runner):
//   - reenvio do mesmo lote não duplica nada;
//   - credencial revogada é recusada (a RLS de hk_ingestao nem a mostra);
//   - UH nova sem saldo de licença entra como pendente_licenca;
//   - paridade: a contagem de licença da promoção é a mesma de licenca.uso().
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_WORKER, HK_TESTE_URL_INGESTAO, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  CredencialInvalida,
  criarCasosDeUsoDeIngestao,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortasDeAplicacao,
  criarPortasDeIngestao,
  criptografiaDoServidor,
} from '../src/index';
import { usoDeLicenca } from '../src/repositorios/promocao';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_WORKER = process.env.HK_TESTE_URL_WORKER;
const URL_INGESTAO = process.env.HK_TESTE_URL_INGESTAO;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_WORKER && URL_INGESTAO && URL_DONO);
const url = (v: string | undefined): string => {
  if (!v) throw new Error('URL de teste ausente.');
  return v;
};
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/WORKER/INGESTAO/DONO.');
}

const T = {
  tenant: randomUUID(),
  admin: randomUUID(),
  ativo: randomUUID(),
  implantacao: randomUUID(),
};
const ctx = { usuarioId: T.admin, tenantId: T.tenant };
const uh = (chave: string, hotel: string, nome = chave) => ({ chave, dados: { hotel, nome } });

describe.skipIf(!temBanco)(
  'F0-08 — ingestão, credencial e promoção de UHs',
  { timeout: 60_000 },
  () => {
    let dono: pg.Client;
    let banco: AcessoBanco;
    let casos: ReturnType<typeof criarCasosDeUsoDeIngestao>;

    beforeAll(async () => {
      dono = new pg.Client({ connectionString: URL_DONO });
      await dono.connect();
      await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
        T.admin,
        `${T.admin}@hubkeep.invalid`,
      ]);
      await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo F0-08')`, [T.tenant]);
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, 'Admin', $3)`,
        [T.tenant, T.admin, `${T.admin}@hubkeep.invalid`],
      );
      await dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, concedido_por)
       values ($1, $2, $3, 'admin_grupo', 'grupo', $3)`,
        [randomUUID(), T.tenant, T.admin],
      );
      for (const [id, cod, status] of [
        [T.ativo, 'H-ATIVO', 'ativo'],
        [T.implantacao, 'H-IMPL', 'em_implantacao'],
      ] as const) {
        await dono.query(
          `insert into app.hotel (id, tenant_id, nome, fuso, status, sistema_origem, cod_externo)
         values ($1, $2, $3, 'America/Sao_Paulo', $4, 'planilha', $5)`,
          [id, T.tenant, `Hotel ${cod}`, status, cod],
        );
      }
      // Duas UHs de licença: a terceira UH nova do hotel ativo fica pendente.
      await dono.query(
        `insert into licenca.contrato (tenant_id, max_hoteis, max_uhs, atualizado_por) values ($1, 5, 2, 'teste')`,
        [T.tenant],
      );

      banco = await criarAcessoBanco({
        app: { url: url(URL_APP), max: 1 },
        worker: { url: url(URL_WORKER), max: 1 },
        ingestao: { url: url(URL_INGESTAO), max: 1 },
      });
      const portas = criarPortasDeAplicacao(banco);
      casos = criarCasosDeUsoDeIngestao({
        ...criarPortasDeIngestao(banco),
        atribuicoes: portas.atribuicoes,
        relogio: relogioDoSistema,
        cripto: criptografiaDoServidor,
      });
    });

    afterAll(async () => {
      await banco?.encerrar();
      if (!dono) return;
      for (const tabela of [
        'staging.registro_externo',
        'staging.carga',
        'staging.credencial_agente',
        'app.evento_dominio',
        'app.auditoria',
        'app.local',
        'app.atribuicao_escopo',
        'app.hotel',
        'licenca.contrato',
        'app.membro',
      ]) {
        await dono.query(`delete from ${tabela} where tenant_id = $1`, [T.tenant]);
      }
      await dono.query(`delete from app.tenant where id = $1`, [T.tenant]);
      await dono.query(`delete from auth.users where id = $1`, [T.admin]);
      await dono.end();
    });

    let credencial = '';

    it('o Admin cria a credencial; o banco guarda só o hash', async () => {
      const r = await casos.criarCredencial(ctx, 'Agente de teste');
      credencial = r.credencial;
      expect(credencial.startsWith(`hk_${T.tenant}_`)).toBe(true);
      const linha = await dono.query(
        `select hash_segredo from staging.credencial_agente where id = $1`,
        [r.id],
      );
      const hash = (linha.rows[0] as { hash_segredo: string }).hash_segredo;
      expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(credencial).not.toContain(hash.slice(7));
    });

    it('reenvio do mesmo lote não duplica nada', async () => {
      const lote = {
        fonte: 'planilha',
        entidade: 'uh',
        registros: [
          uh('101', 'H-ATIVO'),
          uh('102', 'H-ATIVO'),
          uh('103', 'H-ATIVO'),
          uh('201', 'H-IMPL'),
        ],
      };
      const primeiro = await casos.receberLote(credencial, lote);
      const segundo = await casos.receberLote(credencial, {
        ...lote,
        registros: [...lote.registros].reverse(), // mesma coisa em outra ordem
      });
      expect(primeiro.novo).toBe(true);
      expect(segundo).toMatchObject({
        novo: false,
        cargaId: primeiro.cargaId,
        loteHash: primeiro.loteHash,
      });
      const contagem = await dono.query(
        `select (select count(*)::int from staging.carga where tenant_id = $1) as cargas,
              (select count(*)::int from staging.registro_externo where tenant_id = $1) as registros`,
        [T.tenant],
      );
      expect(contagem.rows[0]).toEqual({ cargas: 1, registros: 4 });
    });

    it('UH nova sem saldo entra pendente_licenca; hotel em implantação não consome licença', async () => {
      const r = await casos.promoverUhs(T.tenant);
      expect(r).toMatchObject({ criadas: 4, ativas: 2, pendentes: 2, semHotel: 0, invalidas: 0 });
      const locais = await dono.query(
        `select cod_externo, status, busca from app.local where tenant_id = $1 order by cod_externo`,
        [T.tenant],
      );
      // A busca (B6) é gravada na promoção, com o nome da UH.
      expect(locais.rows).toEqual([
        { cod_externo: '101', status: 'ativo', busca: '101' },
        { cod_externo: '102', status: 'ativo', busca: '102' },
        { cod_externo: '103', status: 'pendente_licenca', busca: '103' },
        { cod_externo: '201', status: 'pendente_licenca', busca: '201' },
      ]);
      // Toda UH promovida grava auditoria (sem usuário) e evento, na mesma transação.
      const trilha = await dono.query(
        `select (select count(*)::int from app.auditoria where tenant_id = $1 and acao = 'promover' and usuario_id is null) as auditorias,
              (select count(*)::int from app.evento_dominio where tenant_id = $1 and tipo = 'local.promovido') as eventos`,
        [T.tenant],
      );
      expect(trilha.rows[0]).toEqual({ auditorias: 4, eventos: 4 });
      // Rodar de novo não cria nada.
      expect(await casos.promoverUhs(T.tenant)).toMatchObject({ criadas: 0, atualizadas: 0 });
    });

    it('paridade: a contagem da promoção é a mesma de licenca.uso() (item a da auditoria)', async () => {
      // Um de cada: área comum ativa e UH inativa não contam em nenhuma das duas.
      await dono.query(
        `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
         ($1, $3, $4, 'area_comum', 'Lobby', 'lobby', 'ativo'),
         ($2, $3, $4, 'uh', 'Inativa', 'inativa', 'inativo')`,
        [randomUUID(), randomUUID(), T.tenant, T.ativo],
      );
      const daPromocao = await banco.withSistema({ tenantId: T.tenant }, (tx) => usoDeLicenca(tx));
      await dono.query('begin');
      try {
        await dono.query('set local role hk_backoffice');
        const r = await dono.query(
          `select uhs_ativas::int from licenca.uso() where tenant_id = $1`,
          [T.tenant],
        );
        expect(daPromocao).toEqual({
          contratadas: 2,
          emUso: (r.rows[0] as { uhs_ativas: number }).uhs_ativas,
        });
        expect(daPromocao.emUso).toBe(2);
      } finally {
        await dono.query('rollback');
      }
    });

    it('credencial revogada é recusada (a RLS de hk_ingestao só mostra as não revogadas)', async () => {
      const id = (
        await dono.query(`select id from staging.credencial_agente where tenant_id = $1`, [
          T.tenant,
        ])
      ).rows[0] as { id: string };
      await casos.revogarCredencial(ctx, id.id);
      await expect(
        casos.receberLote(credencial, {
          fonte: 'planilha',
          entidade: 'uh',
          registros: [uh('999', 'H-ATIVO')],
        }),
      ).rejects.toBeInstanceOf(CredencialInvalida);
      const n = await dono.query(
        `select count(*)::int as n from staging.registro_externo where tenant_id = $1 and chave = '999'`,
        [T.tenant],
      );
      expect(n.rows[0]).toEqual({ n: 0 });
    });

    it('credencial de um tenant não abre o staging de outro', async () => {
      const outro = credencial.replace(T.tenant, randomUUID());
      await expect(
        casos.receberLote(outro, {
          fonte: 'planilha',
          entidade: 'uh',
          registros: [uh('1', 'H-ATIVO')],
        }),
      ).rejects.toBeInstanceOf(CredencialInvalida);
    });
  },
);
