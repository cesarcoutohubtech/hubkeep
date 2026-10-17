// O sinal do hóspede do Intelligence (ADR-047, migração 0052) contra Postgres
// real, com o hk_app e o contexto de quem pede (na CI, o Supabase do runner):
//   - a importação grava o lote, conta a repetida (on conflict do nothing) e
//     não muda a linha que existe; auditoria por lote, sem hotel_id e sem o
//     texto (o caso nomeado da policy da auditoria, migração 0053), e o
//     evento; a importação em que nada entrou não grava nenhum dos dois;
//   - fora do escopo (o Gerente em outro hotel; o Técnico), a RLS recusa;
//   - a classificação com a trava de versão, a auditoria e o evento; fora do
//     escopo, a linha não aparece;
//   - as referências da classificação (ativo, UH e categoria) e o hotel da
//     importação, só o que quem pede lê;
//   - a fila de classificação do hotel, por recorte, só para quem a lê.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  type PortaDoPainelDoIntelligence,
  criarAcessoBanco,
  criarPortaDoPainelDoIntelligence,
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
const UH1 = randomUUID();
const AREA1 = randomUUID();
const CAT = randomUUID();
const A1 = randomUUID();
const U = { admin: randomUUID(), gerente: randomUUID(), tecnico: randomUUID() };
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });
const agora = new Date();

const sinal = (idExterno: string, texto: string) => ({
  fonte: 'google',
  idExterno,
  ocorridoEm: new Date(agora.getTime() - 86_400_000),
  nota: 2.5,
  escala: 5,
  texto,
  idioma: 'pt-BR',
  uhCitada: '101',
});

describe.skipIf(!temBanco)('sinal do hóspede do Intelligence', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let porta: PortaDoPainelDoIntelligence;
  const q = (texto: string, params: unknown[] = []) => dono.query(texto, params);

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await q(`insert into app.tenant (id, nome) values ($1, 'Grupo do sinal')`, [TENANT]);
    await q(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values
       ($1, $3, 'Hotel 1', 'UTC', 'ativo'), ($2, $3, 'Hotel 2', 'UTC', 'ativo')`,
      [H1, H2, TENANT],
    );
    await q(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
       ($1, $3, $4, 'uh', 'UH 101', 'uh 101', 'ativo'),
       ($2, $3, $4, 'area_comum', 'Lobby', 'lobby', 'ativo')`,
      [UH1, AREA1, TENANT, H1],
    );
    await q(
      `insert into app.categoria_ativo (id, tenant_id, chave_padrao) values ($1, $2, 'ar_condicionado')`,
      [CAT, TENANT],
    );
    await q(
      `insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, categoria_id, nome, busca)
       values ('SNHSP00001', $1, $2, $3, $4, $5, 'Split UH 101', 'split uh 101')`,
      [A1, TENANT, H1, UH1, CAT],
    );
    for (const [nome, id] of Object.entries(U)) {
      await q(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@hubkeep.invalid`]);
      await q(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
        [TENANT, id, nome, `${id}@hubkeep.invalid`],
      );
    }
    await q(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por) values
         ($1, $4, $5, 'admin_grupo', 'grupo', null, $5),
         ($2, $4, $6, 'gerente_hotel', 'hotel', $8, $5),
         ($3, $4, $7, 'tecnico', 'hotel', $8, $5)`,
      [randomUUID(), randomUUID(), randomUUID(), TENANT, U.admin, U.gerente, U.tecnico, H1],
    );
    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 3 } });
    porta = criarPortaDoPainelDoIntelligence(banco);
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.sinal_hospede',
      'app.ativo',
      'app.categoria_ativo',
      'app.local',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.membro',
    ]) {
      await q(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await q(`delete from app.tenant where id = $1`, [TENANT]);
    await q(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
    await dono.end();
  });

  it('o hotel da importação, só para quem o lê', async () => {
    expect(await porta.hotelDoSinal(ctx(U.gerente), H1)).toEqual({ id: H1, bandeiraId: null });
    expect(await porta.hotelDoSinal(ctx(U.gerente), randomUUID())).toBeNull();
  });

  it('importa o lote, conta a repetida e não muda a linha que existe', async () => {
    const primeira = await porta.gravarSinais(ctx(U.gerente), {
      hotelId: H1,
      importadoPor: U.gerente,
      em: agora,
      sinais: [sinal('r-1', 'Ar do 101 muito barulhento'), sinal('r-2', 'Chuveiro frio')],
    });
    expect([...primeira.inseridos].sort()).toEqual(['google|r-1', 'google|r-2']);
    const segunda = await porta.gravarSinais(ctx(U.gerente), {
      hotelId: H1,
      importadoPor: U.gerente,
      em: agora,
      sinais: [sinal('r-1', 'Outro texto'), sinal('r-3', 'Elevador parado')],
    });
    expect(segunda.inseridos).toEqual(['google|r-3']);
    const linhas = await q(
      `select id_externo, texto, nota::text as nota, lote_id, importado_por
         from app.sinal_hospede where tenant_id = $1 order by id_externo`,
      [TENANT],
    );
    expect(linhas.rows.map((r) => [r.id_externo, r.texto, r.nota])).toEqual([
      ['r-1', 'Ar do 101 muito barulhento', '2.50'],
      ['r-2', 'Chuveiro frio', '2.50'],
      ['r-3', 'Elevador parado', '2.50'],
    ]);
    expect(linhas.rows[0].lote_id).toBe(primeira.loteId);
    expect(linhas.rows[2].lote_id).toBe(segunda.loteId);
    const auditoria = await q(
      `select acao, usuario_id, hotel_id, depois from app.auditoria
        where tenant_id = $1 and entidade = 'sinal_hospede' and registro_id = $2`,
      [TENANT, segunda.loteId],
    );
    expect(auditoria.rows).toEqual([
      {
        acao: 'importar',
        usuario_id: U.gerente,
        hotel_id: null,
        depois: { hotelId: H1, entraram: 1, repetidas: 1 },
      },
    ]);
    const eventos = await q(
      `select tipo from app.evento_dominio where tenant_id = $1 and registro_id = $2`,
      [TENANT, segunda.loteId],
    );
    expect(eventos.rows).toEqual([{ tipo: 'sinal_hospede.importado' }]);
  });

  it('a importação em que nada entrou não grava auditoria nem evento', async () => {
    const r = await porta.gravarSinais(ctx(U.gerente), {
      hotelId: H1,
      importadoPor: U.gerente,
      em: agora,
      sinais: [sinal('r-1', 'De novo')],
    });
    expect(r.inseridos).toEqual([]);
    const gravados = await q(
      `select (select count(*)::int from app.auditoria where tenant_id = $1 and registro_id = $2) as auditorias,
              (select count(*)::int from app.evento_dominio where tenant_id = $1 and registro_id = $2) as eventos`,
      [TENANT, r.loteId],
    );
    expect(gravados.rows[0]).toEqual({ auditorias: 0, eventos: 0 });
  });

  it('fora do escopo, a RLS recusa a importação', async () => {
    const lote = (hotelId: string, importadoPor: string) => ({
      hotelId,
      importadoPor,
      em: agora,
      sinais: [sinal(`x-${randomUUID()}`, 'Fora')],
    });
    await expect(porta.gravarSinais(ctx(U.gerente), lote(H2, U.gerente))).rejects.toThrow();
    await expect(porta.gravarSinais(ctx(U.tecnico), lote(H1, U.tecnico))).rejects.toThrow();
    const doTecnico = await banco.withContext(ctx(U.tecnico), (tx) =>
      tx.selectFrom('app.sinal_hospede').select('id').execute(),
    );
    expect(doTecnico).toEqual([]);
  });

  it('as referências da classificação, como quem pede as lê', async () => {
    expect(
      await porta.referenciasDaClassificacao(ctx(U.gerente), {
        ativoId: A1,
        uhId: AREA1,
        categoriaId: CAT,
      }),
    ).toEqual({
      ativo: { id: A1, hotelId: H1, categoriaId: CAT, desativadoEm: null },
      uh: { id: AREA1, hotelId: H1, tipo: 'area_comum' },
      categoria: { id: CAT },
    });
    expect(
      await porta.referenciasDaClassificacao(ctx(U.gerente), {
        ativoId: null,
        uhId: null,
        categoriaId: null,
      }),
    ).toEqual({ ativo: null, uh: null, categoria: null });
  });

  it('classifica com a trava de versão, a auditoria e o evento', async () => {
    const r1 = await q(
      `select id from app.sinal_hospede where tenant_id = $1 and id_externo = 'r-1'`,
      [TENANT],
    );
    const sinalId = r1.rows[0].id as string;
    expect(await porta.sinalParaClassificar(ctx(U.gerente), sinalId)).toEqual({
      id: sinalId,
      hotelId: H1,
      bandeiraId: null,
      versao: 1,
    });
    expect(await porta.sinalParaClassificar(ctx(U.tecnico), sinalId)).toBeNull();
    const classificacao = {
      sinalId,
      versaoEsperada: 1,
      manutencao: true,
      categoriaId: CAT,
      uhId: UH1,
      ativoId: A1,
      ligacao: 'confirmada',
      classificadoPor: U.gerente,
      em: agora,
    };
    expect(await porta.classificar(ctx(U.gerente), classificacao)).toEqual({ versao: 2 });
    await expect(porta.classificar(ctx(U.gerente), classificacao)).rejects.toMatchObject({
      codigo: 'conflito_de_versao',
    });
    await expect(
      porta.classificar(ctx(U.tecnico), {
        ...classificacao,
        versaoEsperada: 2,
        classificadoPor: U.tecnico,
      }),
    ).rejects.toMatchObject({ codigo: 'sinal_nao_encontrado' });
    const linha = await q(
      `select manutencao, ligacao, ativo_id, uh_id, categoria_id, classificado_por, versao
         from app.sinal_hospede where id = $1`,
      [sinalId],
    );
    expect(linha.rows[0]).toEqual({
      manutencao: true,
      ligacao: 'confirmada',
      ativo_id: A1,
      uh_id: UH1,
      categoria_id: CAT,
      classificado_por: U.gerente,
      versao: 2,
    });
    const auditoria = await q(
      `select acao, usuario_id, hotel_id, depois->>'ligacao' as ligacao from app.auditoria
        where tenant_id = $1 and entidade = 'sinal_hospede' and registro_id = $2`,
      [TENANT, sinalId],
    );
    expect(auditoria.rows).toEqual([
      { acao: 'classificar', usuario_id: U.gerente, hotel_id: null, ligacao: 'confirmada' },
    ]);
    const eventos = await q(
      `select tipo, payload->>'hotelId' as hotel from app.evento_dominio
        where tenant_id = $1 and registro_id = $2`,
      [TENANT, sinalId],
    );
    expect(eventos.rows).toEqual([{ tipo: 'sinal_hospede.classificado', hotel: H1 }]);
  });

  it('a fila do hotel por recorte, só para quem a lê', async () => {
    const todas = await porta.sinaisDoHotel(ctx(U.gerente), H1, 'todas', 50);
    const r1 = todas.find((s) => s.idExterno === 'r-1');
    expect(r1).toMatchObject({
      hotelId: H1,
      fonte: 'google',
      nota: 2.5,
      escala: 5,
      manutencao: true,
      ligacao: 'confirmada',
      ativoId: A1,
      classificadoPor: U.gerente,
      versao: 2,
    });
    expect(r1?.ocorridoEm).toBeInstanceOf(Date);
    const ids = (xs: readonly { idExterno: string }[]) => xs.map((s) => s.idExterno);
    const pendentes = await porta.sinaisDoHotel(ctx(U.gerente), H1, 'pendentes', 50);
    expect(pendentes.length).toBe(todas.length - 1);
    expect(ids(pendentes)).not.toContain('r-1');
    expect(ids(await porta.sinaisDoHotel(ctx(U.gerente), H1, 'manutencao', 50))).toEqual(['r-1']);
    expect(await porta.sinaisDoHotel(ctx(U.gerente), H1, 'fora', 50)).toEqual([]);
    expect(await porta.sinaisDoHotel(ctx(U.gerente), H1, 'todas', 1)).toHaveLength(1);
    expect(await porta.sinaisDoHotel(ctx(U.tecnico), H1, 'todas', 50)).toEqual([]);
  });
});
