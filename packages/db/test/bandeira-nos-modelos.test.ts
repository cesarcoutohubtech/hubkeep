// A bandeira nos modelos de ativo e de checklist (fase 1b, PB1b; migração
// 0059) contra Postgres real (na CI, o Supabase do runner):
//   - o Admin cria o modelo de ativo e o checklist com a bandeira, e a lista
//     devolve a bandeira; a bandeira não muda na alteração;
//   - no hotel de outra bandeira, o modelo novo do ativo e o checklist do
//     plano são recusados; os do grupo e os da bandeira do hotel entram.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeAtivos,
  criarCasosDeUsoDeModelosDeAtivo,
  criarCasosDeUsoDePlanosPreventivos,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaAtivos,
  criarPortaModelosDeAtivo,
  criarPortaPlanosPreventivos,
  criarPortaTriagem,
  criarPortasDeAplicacao,
} from '../src/index';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const TENANT = randomUUID();
const BX = randomUUID();
const BY = randomUUID();
const H1 = randomUUID();
const CAT = randomUUID();
const UH = randomUUID();
const CK_X = randomUUID();
const CK_Y = randomUUID();
const ADMIN = randomUUID();
const ctx = { usuarioId: ADMIN, tenantId: TENANT };

const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? String(e);
  }
};

describe.skipIf(!temBanco)('PB1b — bandeira nos modelos', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let modelos: ReturnType<typeof criarCasosDeUsoDeModelosDeAtivo>;
  let ativos: ReturnType<typeof criarCasosDeUsoDeAtivos>;
  let planos: ReturnType<typeof criarCasosDeUsoDePlanosPreventivos>;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo PB1b')`, [TENANT]);
    await dono.query(
      `insert into app.bandeira (id, tenant_id, nome) values ($1, $3, 'X'), ($2, $3, 'Y')`,
      [BX, BY, TENANT],
    );
    await dono.query(
      `insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status)
       values ($1, $2, $3, 'Hotel X', 'UTC', 'ativo')`,
      [H1, TENANT, BX],
    );
    await dono.query(
      `insert into app.categoria_ativo (id, tenant_id, nomes) values ($1, $2, '{"pt-BR": "Bombas"}')`,
      [CAT, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
       values ($1, $2, $3, 'area_comum', 'Casa de máquinas', 'casa de maquinas', 'ativo')`,
      [UH, TENANT, H1],
    );
    await dono.query(
      `insert into app.checklist_modelo (id, tenant_id, bandeira_id, nomes, itens)
       values ($1, $3, $4, '{"pt-BR": "Da X"}', '[]'), ($2, $3, $5, '{"pt-BR": "Da Y"}', '[]')`,
      [CK_X, CK_Y, TENANT, BX, BY],
    );
    await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
      ADMIN,
      `${ADMIN}@hubkeep.invalid`,
    ]);
    await dono.query(
      `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, 'admin', $3)`,
      [TENANT, ADMIN, `${ADMIN}@hubkeep.invalid`],
    );
    await dono.query(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
       values ($1, $2, $3, 'admin_grupo', 'grupo', null, $3)`,
      [randomUUID(), TENANT, ADMIN],
    );

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 4 } });
    const { atribuicoes } = criarPortasDeAplicacao(banco);
    modelos = criarCasosDeUsoDeModelosDeAtivo({
      modelos: criarPortaModelosDeAtivo(banco),
      atribuicoes,
      relogio: relogioDoSistema,
    });
    ativos = criarCasosDeUsoDeAtivos({
      ativos: criarPortaAtivos(banco),
      atribuicoes,
      relogio: relogioDoSistema,
    });
    planos = criarCasosDeUsoDePlanosPreventivos({
      planos: criarPortaPlanosPreventivos(banco),
      triagem: criarPortaTriagem(banco),
      atribuicoes,
      relogio: relogioDoSistema,
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.plano_preventivo',
      'app.ativo',
      'app.modelo_ativo',
      'app.checklist_modelo',
      'app.categoria_ativo',
      'app.local',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.bandeira',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = $1`, [ADMIN]);
  });

  const MODELO = {
    categoriaId: CAT,
    fabricante: null,
    modelo: null,
    checklistModeloId: null,
    planoSugerido: null,
  };
  const ATIVO = {
    localId: UH,
    categoriaId: CAT,
    nome: 'Bomba',
    fabricante: null,
    modelo: null,
    numeroSerie: null,
  };
  const PLANO = {
    ativoId: null,
    categoriaId: CAT,
    nome: 'Revisão',
    intervalo: 1,
    unidade: 'mes',
    inicio: '2026-11-01',
    tecnicoId: null,
    equipeId: null,
    ativar: false,
  };

  it('o modelo nasce com a bandeira, e o checklist tem de ir para os mesmos hotéis', async () => {
    const daX = await modelos.criar(ctx, {
      ...MODELO,
      nome: 'Bomba da X',
      bandeiraId: BX,
      checklistModeloId: CK_X,
    });
    expect(
      await codigoDe(
        modelos.criar(ctx, { ...MODELO, nome: 'Bomba', bandeiraId: BX, checklistModeloId: CK_Y }),
      ),
    ).toBe('modelo_ativo_checklist_invalido');
    const lista = await modelos.listar(ctx);
    expect(lista.find((m) => m.id === daX.id)?.bandeiraId).toBe(BX);
    await modelos.alterar(ctx, daX.id, {
      ...MODELO,
      nome: 'Bomba X',
      checklistModeloId: CK_X,
      versao: 1,
    });
    const { rows } = await dono.query(`select bandeira_id from app.modelo_ativo where id = $1`, [
      daX.id,
    ]);
    expect(rows[0].bandeira_id).toBe(BX);
  });

  it('no hotel da X: o modelo da Y é recusado; o do grupo e o da X entram', async () => {
    const daY = await modelos.criar(ctx, { ...MODELO, nome: 'Bomba da Y', bandeiraId: BY });
    const doGrupo = await modelos.criar(ctx, { ...MODELO, nome: 'Bomba do grupo' });
    const daX = (await modelos.listar(ctx)).find((m) => m.bandeiraId === BX);
    expect(await codigoDe(ativos.cadastrar(ctx, { ...ATIVO, modeloId: daY.id }))).toBe(
      'modelo_ativo_de_outra_bandeira',
    );
    await ativos.cadastrar(ctx, { ...ATIVO, modeloId: doGrupo.id });
    await ativos.cadastrar(ctx, { ...ATIVO, modeloId: daX?.id ?? null });
  });

  it('no hotel da X: o checklist da Y é recusado no plano', async () => {
    expect(await codigoDe(planos.criar(ctx, H1, { ...PLANO, checklistModeloId: CK_Y }))).toBe(
      'checklist_de_outra_bandeira',
    );
    await planos.criar(ctx, H1, { ...PLANO, checklistModeloId: CK_X });
  });
});
