// Aceite da A4 (fase 1a; ADR-031) contra Postgres real (na CI, o Supabase do runner):
//   - o Admin cadastra o proprietário e o vincula a um hotel inteiro e a uma UH
//     de outro hotel; o proprietário vê todos os locais do hotel, UH nova
//     inclusive, e a UH vinculada, e nada mais;
//   - vigência inválida, sobreposta e vínculo com área comum são recusados;
//   - encerrar a vigência tira o acesso;
//   - o gerente não gere (403) e, com a checagem removida, a RLS ainda barra;
//   - a auditoria registra o vínculo sem o documento (LGPD).
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDeProprietarios, relogioDoSistema } from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaProprietarios,
  criarPortasDeAplicacao,
} from '../src/index';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const TENANT = randomUUID();
const H1 = randomUUID();
const H2 = randomUUID();
const L = { uh101: randomUUID(), piscina: randomUUID(), uh201: randomUUID(), uh202: randomUUID() };
const U = { admin: randomUUID(), gerente: randomUUID(), dono: randomUUID() };
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });
const dia = (deslocamento: number) =>
  new Date(Date.now() + deslocamento * 86_400_000).toISOString().slice(0, 10);
const DOCUMENTO = '123.456.789-00';

describe.skipIf(!temBanco)(
  'A4 — proprietário de UH e de hotel inteiro',
  { timeout: 60_000 },
  () => {
    let dono: pg.Client;
    let banco: AcessoBanco;
    let casos: ReturnType<typeof criarCasosDeUsoDeProprietarios>;
    let semChecagem: ReturnType<typeof criarCasosDeUsoDeProprietarios>;
    let proprietarioId = '';
    let vinculoDoHotel = '';

    const locaisVistosPeloDono = () =>
      banco.withContext(ctx(U.dono), async (tx) =>
        (await tx.selectFrom('app.local').select('nome').orderBy('nome').execute()).map(
          (l) => l.nome,
        ),
      );

    beforeAll(async () => {
      dono = new pg.Client({ connectionString: URL_DONO });
      await dono.connect();
      await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo A4')`, [TENANT]);
      for (const [id, nome] of [
        [H1, 'Hotel 1'],
        [H2, 'Hotel 2'],
      ]) {
        await dono.query(
          `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, $3, 'UTC', 'ativo')`,
          [id, TENANT, nome],
        );
      }
      for (const [id, hotel, tipo, nome] of [
        [L.uh101, H1, 'uh', 'UH 101'],
        [L.piscina, H1, 'area_comum', 'Piscina'],
        [L.uh201, H2, 'uh', 'UH 201'],
        [L.uh202, H2, 'uh', 'UH 202'],
      ]) {
        await dono.query(
          `insert into app.local (id, tenant_id, hotel_id, tipo, nome, status) values ($1, $2, $3, $4, $5, 'ativo')`,
          [id, TENANT, hotel, tipo, nome],
        );
      }
      for (const [nome, id] of Object.entries(U)) {
        await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
          id,
          `${id}@hubkeep.invalid`,
        ]);
        await dono.query(
          `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
          [TENANT, id, nome, `${id}@hubkeep.invalid`],
        );
      }
      const atribuir = (usuario: string, papel: string, escopo: string, hotel: string | null) =>
        dono.query(
          `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7)`,
          [randomUUID(), TENANT, usuario, papel, escopo, hotel, U.admin],
        );
      await atribuir(U.admin, 'admin_grupo', 'grupo', null);
      await atribuir(U.gerente, 'gerente_hotel', 'hotel', H1);
      banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
      const deps = {
        proprietarios: criarPortaProprietarios(banco),
        atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
        relogio: relogioDoSistema,
      };
      casos = criarCasosDeUsoDeProprietarios(deps);
      semChecagem = criarCasosDeUsoDeProprietarios({
        ...deps,
        podeGerir: () => ({ permitido: true }),
      });
    });

    afterAll(async () => {
      await banco?.encerrar();
      if (!dono) return;
      for (const t of [
        'app.evento_dominio',
        'app.auditoria',
        'app.hotel_proprietario',
        'app.local_proprietario',
        'app.atribuicao_escopo',
        'app.proprietario',
        'app.local',
        'app.hotel',
        'app.membro',
      ]) {
        await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
      }
      await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
      await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
    });

    it('o Admin cadastra e vincula; o dono vê o hotel inteiro e a UH dele', async () => {
      ({ id: proprietarioId } = await casos.criarProprietario(
        ctx(U.admin),
        '  Maria  Dona ',
        DOCUMENTO,
      ));
      ({ id: vinculoDoHotel } = await casos.vincular(
        ctx(U.admin),
        proprietarioId,
        { tipo: 'hotel', hotelId: H1 },
        { inicio: dia(-10), fim: null },
      ));
      await casos.vincular(
        ctx(U.admin),
        proprietarioId,
        { tipo: 'uh', localId: L.uh202 },
        { inicio: dia(0), fim: null },
      );
      await dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, proprietario_id, concedido_por)
       values ($1, $2, $3, 'proprietario', 'proprietario', $4, $5)`,
        [randomUUID(), TENANT, U.dono, proprietarioId, U.admin],
      );
      expect(await locaisVistosPeloDono()).toEqual(['Piscina', 'UH 101', 'UH 202']);
      // UH nova do CM no hotel vinculado entra sem ação manual.
      await dono.query(
        `insert into app.local (id, tenant_id, hotel_id, tipo, nome, status) values ($1, $2, $3, 'uh', 'UH 102', 'ativo')`,
        [randomUUID(), TENANT, H1],
      );
      expect(await locaisVistosPeloDono()).toEqual(['Piscina', 'UH 101', 'UH 102', 'UH 202']);
      const [p] = await casos.listarProprietarios(ctx(U.admin));
      expect(p).toMatchObject({ nome: 'Maria Dona', documento: DOCUMENTO });
      expect(p?.vinculos.map((v) => [v.tipo, v.hotelNome, v.localNome, v.vigente])).toEqual([
        ['hotel', 'Hotel 1', null, true],
        ['uh', 'Hotel 2', 'UH 202', true],
      ]);
    });

    it('vigência inválida, sobreposta e área comum são recusadas', async () => {
      await expect(
        casos.vincular(
          ctx(U.admin),
          proprietarioId,
          { tipo: 'hotel', hotelId: H2 },
          { inicio: dia(0), fim: dia(-1) },
        ),
      ).rejects.toMatchObject({ codigo: 'vigencia_invalida' });
      await expect(
        casos.vincular(
          ctx(U.admin),
          proprietarioId,
          { tipo: 'hotel', hotelId: H1 },
          { inicio: dia(30), fim: null },
        ),
      ).rejects.toMatchObject({ codigo: 'vinculo_sobreposto' });
      await expect(
        casos.vincular(
          ctx(U.admin),
          proprietarioId,
          { tipo: 'uh', localId: L.piscina },
          { inicio: dia(0), fim: null },
        ),
      ).rejects.toMatchObject({ codigo: 'vinculo_so_com_uh' });
    });

    it('encerrar a vigência tira o acesso ao hotel', async () => {
      await casos.alterarVigencia(ctx(U.admin), 'hotel', vinculoDoHotel, {
        inicio: dia(-10),
        fim: dia(-1),
      });
      expect(await locaisVistosPeloDono()).toEqual(['UH 202']);
    });

    it('o gerente não gere; com a checagem removida, a RLS ainda barra', async () => {
      await expect(casos.criarProprietario(ctx(U.gerente), 'X', null)).rejects.toMatchObject({
        codigo: 'proprietarios_so_admin',
      });
      await expect(semChecagem.criarProprietario(ctx(U.gerente), 'X', null)).rejects.toMatchObject({
        code: '42501',
      });
      // O gerente não vê o proprietário (dado pessoal): nada a vincular nem a alterar.
      await expect(
        semChecagem.vincular(
          ctx(U.gerente),
          proprietarioId,
          { tipo: 'uh', localId: L.uh101 },
          { inicio: dia(0), fim: null },
        ),
      ).rejects.toMatchObject({ codigo: 'proprietario_nao_encontrado' });
      await expect(
        semChecagem.alterarProprietario(ctx(U.gerente), proprietarioId, 'Pirata', null),
      ).rejects.toMatchObject({ codigo: 'proprietario_nao_encontrado' });
      await expect(
        semChecagem.alterarVigencia(ctx(U.gerente), 'hotel', vinculoDoHotel, {
          inicio: dia(-10),
          fim: null,
        }),
      ).rejects.toMatchObject({ codigo: 'vinculo_nao_encontrado' });
    });

    it('a auditoria registra o cadastro e os vínculos sem o documento', async () => {
      const { rows } = await dono.query(
        `select entidade, acao, depois::text as depois from app.auditoria where tenant_id = $1 order by em`,
        [TENANT],
      );
      expect(rows.map((r) => `${r.entidade}.${r.acao}`)).toEqual([
        'proprietario.criar',
        'hotel_proprietario.vincular',
        'local_proprietario.vincular',
        'hotel_proprietario.alterar_vigencia',
      ]);
      expect(
        rows.some(
          (r) => String(r.depois).includes(DOCUMENTO) || String(r.depois).includes('Maria'),
        ),
      ).toBe(false);
    });
  },
);
