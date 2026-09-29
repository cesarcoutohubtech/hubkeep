// Aceite da B4 (fase 1a; ADR-024) contra Postgres real (na CI, o Supabase do runner):
//   - o técnico registra a foto do ativo, com a miniatura; a auditoria e o
//     evento saem na mesma unit of work;
//   - o anexo aparece no registro para quem lê o hotel e para o proprietário da
//     UH onde o ativo está, que baixa a miniatura e não anexa nem vê os anexos
//     do próprio hotel;
//   - anexo de outro hotel dá 404 (lista, download e remoção);
//   - caminho de outro registro é recusado; o mesmo arquivo não é registrado
//     duas vezes;
//   - remove quem enviou ou quem gere o hotel; a remoção é auditada e o anexo
//     some da lista e do download;
//   - com as checagens removidas, o banco ainda barra: o check recusa caminho
//     de outro tenant, a RLS recusa o proprietário e esconde o anexo de outro
//     hotel.
// O Storage fica de fora (URL falsa): o envio real está em apps/web/test/anexos.test.ts.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  type ArmazenamentoDeArquivos,
  criarCasosDeUsoDeAnexos,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaAnexos,
  criarPortaEscopoDeAnexo,
  criarPortasDeAplicacao,
  novoId,
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
const L = { uh101: randomUUID(), uh102: randomUUID(), h2: randomUUID() };
const ATIVO = randomUUID();
const ATIVO_H2 = randomUUID();
const PROPRIETARIO = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
  tecnico2: randomUUID(),
  gerenteH2: randomUUID(),
  dono: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

describe.skipIf(!temBanco)('B4 — anexos de local e ativo', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeAnexos>;
  const emitidas: string[] = [];
  let foto = { id: '', caminho: '', miniatura: '' };

  const armazenamento: ArmazenamentoDeArquivos = {
    urlDeUpload: async (caminho) => ({ url: `https://storage.invalid/up/${caminho}`, token: 't' }),
    urlDeDownload: async (caminho) => {
      emitidas.push(caminho);
      return `https://storage.invalid/down/${caminho}`;
    },
  };
  const montar = (extra: Partial<Parameters<typeof criarCasosDeUsoDeAnexos>[0]> = {}) =>
    criarCasosDeUsoDeAnexos({
      escopo: criarPortaEscopoDeAnexo(banco),
      anexos: criarPortaAnexos(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      armazenamento,
      relogio: relogioDoSistema,
      novoId,
      ...extra,
    });
  const subir = async (usuario: string, entidade: 'ativo' | 'local' | 'hotel', id: string) =>
    (await casos.pedirUrlDeUpload(ctx(usuario), { entidade, registroId: id, tipo: 'image/jpeg' }))
      .caminho;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo B4')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values
       ($1, $3, 'Hotel 1', 'UTC', 'ativo'), ($2, $3, 'Hotel 2', 'UTC', 'ativo')`,
      [H1, H2, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, status, cod_externo) values
       ($1, $4, $5, 'uh', 'UH 101', 'ativo', '101'),
       ($2, $4, $5, 'uh', 'UH 102', 'ativo', '102'),
       ($3, $4, $6, 'area_comum', 'Lobby H2', 'ativo', null)`,
      [L.uh101, L.uh102, L.h2, TENANT, H1, H2],
    );
    await dono.query(
      `insert into app.ativo (id, tenant_id, hotel_id, local_id, nome, codigo_qr) values
       ($1, $3, $4, $5, 'Frigobar 101', 'A000000001'), ($2, $3, $6, $7, 'Elevador H2', 'A000000002')`,
      [ATIVO, ATIVO_H2, TENANT, H1, L.uh101, H2, L.h2],
    );
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
    await dono.query(`insert into app.proprietario (id, tenant_id, nome) values ($1, $2, 'Dono')`, [
      PROPRIETARIO,
      TENANT,
    ]);
    await dono.query(
      `insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio)
       values ($1, $2, $3, $4, current_date - 1)`,
      [randomUUID(), TENANT, PROPRIETARIO, L.uh101],
    );
    const atribuir = (
      usuario: string,
      papel: string,
      escopo: string,
      hotel: string | null,
      proprietario: string | null = null,
    ) =>
      dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [randomUUID(), TENANT, usuario, papel, escopo, hotel, proprietario, U.admin],
      );
    await atribuir(U.admin, 'admin_grupo', 'grupo', null);
    await atribuir(U.gerente, 'gerente_hotel', 'hotel', H1);
    await atribuir(U.tecnico, 'tecnico', 'hotel', H1);
    await atribuir(U.tecnico2, 'tecnico', 'hotel', H1);
    await atribuir(U.gerenteH2, 'gerente_hotel', 'hotel', H2);
    await atribuir(U.dono, 'proprietario', 'proprietario', null, PROPRIETARIO);
    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    casos = montar();
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.anexo',
      'app.ativo',
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

  it('o técnico registra a foto do ativo com a miniatura: auditoria e evento', async () => {
    const caminho = await subir(U.tecnico, 'ativo', ATIVO);
    const miniatura = await subir(U.tecnico, 'ativo', ATIVO);
    const { id } = await casos.registrar(ctx(U.tecnico), {
      caminho,
      miniaturaCaminho: miniatura,
      nome: 'frigobar.jpg',
    });
    foto = { id, caminho, miniatura };
    const [listado] = await casos.listar(ctx(U.gerente), 'ativo', ATIVO);
    expect(listado).toMatchObject({
      id,
      tipo: 'image/jpeg',
      nome: 'frigobar.jpg',
      temMiniatura: true,
      usuarioId: U.tecnico,
      nomeUsuario: 'tecnico',
      podeRemover: true,
    });
    const auditoria = await dono.query(
      `select depois, usuario_id, hotel_id from app.auditoria
       where tenant_id = $1 and entidade = 'anexo' and registro_id = $2 and acao = 'criar'`,
      [TENANT, id],
    );
    expect(auditoria.rows).toEqual([
      {
        depois: {
          entidade: 'ativo',
          registroId: ATIVO,
          caminho,
          miniaturaCaminho: miniatura,
          tipo: 'image/jpeg',
          nome: 'frigobar.jpg',
        },
        usuario_id: U.tecnico,
        hotel_id: H1,
      },
    ]);
    const evento = await dono.query(
      `select payload from app.evento_dominio where tenant_id = $1 and tipo = 'anexo.registrado'`,
      [TENANT],
    );
    expect(evento.rows[0]?.payload).toEqual({
      hotelId: H1,
      entidade: 'ativo',
      registroId: ATIVO,
      tipo: 'image/jpeg',
    });
  });

  it('o dono da UH vê o anexo do ativo e baixa a miniatura, mas não anexa', async () => {
    expect((await casos.listar(ctx(U.dono), 'ativo', ATIVO)).map((a) => a.id)).toEqual([foto.id]);
    expect((await casos.listar(ctx(U.dono), 'ativo', ATIVO))[0]?.podeRemover).toBe(false);
    await casos.pedirUrlDoAnexo(ctx(U.dono), foto.id, true);
    expect(emitidas.at(-1)).toBe(foto.miniatura);
    await expect(
      casos.pedirUrlDeUpload(ctx(U.dono), {
        entidade: 'ativo',
        registroId: ATIVO,
        tipo: 'image/png',
      }),
    ).rejects.toMatchObject({ codigo: 'anexo_sem_escrita_no_hotel' });
    // O anexo do próprio hotel não é para o proprietário.
    const doHotel = await casos.registrar(ctx(U.gerente), {
      caminho: await subir(U.gerente, 'hotel', H1),
    });
    await expect(casos.pedirUrlDoAnexo(ctx(U.dono), doHotel.id, false)).rejects.toMatchObject({
      codigo: 'anexo_nao_encontrado',
    });
  });

  it('anexo de outro hotel dá 404', async () => {
    await expect(casos.listar(ctx(U.gerenteH2), 'ativo', ATIVO)).rejects.toMatchObject({
      codigo: 'registro_nao_encontrado',
    });
    await expect(casos.pedirUrlDoAnexo(ctx(U.gerenteH2), foto.id, false)).rejects.toMatchObject({
      codigo: 'anexo_nao_encontrado',
    });
    await expect(casos.remover(ctx(U.gerenteH2), foto.id)).rejects.toMatchObject({
      codigo: 'anexo_nao_encontrado',
    });
    // Caminho do Hotel 2 registrado pelo gerente do Hotel 1: o registro não é dele.
    const doH2 = await subir(U.gerenteH2, 'ativo', ATIVO_H2);
    await expect(casos.registrar(ctx(U.gerente), { caminho: doH2 })).rejects.toMatchObject({
      codigo: 'registro_nao_encontrado',
    });
  });

  it('caminho de outro registro e arquivo repetido são recusados', async () => {
    const doLocal = await subir(U.tecnico, 'local', L.uh102);
    await expect(
      casos.registrar(ctx(U.tecnico), {
        caminho: await subir(U.tecnico, 'ativo', ATIVO),
        miniaturaCaminho: doLocal,
      }),
    ).rejects.toMatchObject({ codigo: 'miniatura_invalida' });
    await expect(casos.registrar(ctx(U.tecnico), { caminho: foto.caminho })).rejects.toMatchObject({
      codigo: 'anexo_ja_registrado',
    });
    await expect(
      casos.registrar(ctx(U.tecnico), { caminho: foto.caminho.replace(ATIVO, randomUUID()) }),
    ).rejects.toMatchObject({ codigo: 'registro_nao_encontrado' });
  });

  it('remove quem enviou ou quem gere o hotel; a remoção é auditada', async () => {
    await expect(casos.remover(ctx(U.tecnico2), foto.id)).rejects.toMatchObject({
      codigo: 'remover_anexo_fora_do_escopo',
    });
    await expect(casos.remover(ctx(U.dono), foto.id)).rejects.toMatchObject({
      codigo: 'remover_anexo_fora_do_escopo',
    });
    await casos.remover(ctx(U.gerente), foto.id);
    expect(await casos.listar(ctx(U.gerente), 'ativo', ATIVO)).toEqual([]);
    await expect(casos.pedirUrlDoAnexo(ctx(U.gerente), foto.id, false)).rejects.toMatchObject({
      codigo: 'anexo_nao_encontrado',
    });
    await expect(casos.remover(ctx(U.gerente), foto.id)).rejects.toMatchObject({
      codigo: 'anexo_nao_encontrado',
    });
    const r = await dono.query(
      `select a.removido_por, x.usuario_id, x.antes from app.anexo a
       join app.auditoria x on x.tenant_id = a.tenant_id and x.registro_id = a.id and x.acao = 'remover'
       where a.id = $1`,
      [foto.id],
    );
    expect(r.rows).toEqual([
      {
        removido_por: U.gerente,
        usuario_id: U.gerente,
        antes: { entidade: 'ativo', registroId: ATIVO, caminho: foto.caminho },
      },
    ]);
    // Quem enviou remove o próprio anexo, sem papel de gestão.
    const { id } = await casos.registrar(ctx(U.tecnico2), {
      caminho: await subir(U.tecnico2, 'local', L.uh102),
    });
    await casos.remover(ctx(U.tecnico2), id);
  });

  it('com as checagens removidas, o banco ainda barra', async () => {
    const porta = criarPortaAnexos(banco);
    const dados = (hotelId: string, caminho: string) => ({
      hotelId,
      entidade: 'ativo' as const,
      registroId: ATIVO,
      caminho,
      miniaturaCaminho: null,
      tipo: 'image/jpeg',
      nome: null,
    });
    // Caminho de outro tenant: o check da linha recusa.
    await expect(
      porta.registrar(
        ctx(U.gerente),
        dados(H1, `${randomUUID()}/${H1}/ativo/${ATIVO}/${randomUUID()}.jpg`),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    // Proprietário: a RLS recusa o INSERT.
    await expect(
      porta.registrar(ctx(U.dono), dados(H1, `${TENANT}/${H1}/ativo/${ATIVO}/${randomUUID()}.jpg`)),
    ).rejects.toMatchObject({ code: '42501' });
    // Remoção sem a regra de ação: o gerente do Hotel 2 não acha a linha.
    const { id } = await casos.registrar(ctx(U.tecnico), {
      caminho: await subir(U.tecnico, 'ativo', ATIVO),
    });
    const semRegra = montar({ podeRemover: () => ({ permitido: true }) });
    await expect(semRegra.remover(ctx(U.gerenteH2), id)).rejects.toMatchObject({
      codigo: 'anexo_nao_encontrado',
    });
    await expect(porta.remover(ctx(U.gerenteH2), id)).rejects.toMatchObject({
      codigo: 'anexo_nao_encontrado',
    });
    expect((await casos.listar(ctx(U.gerente), 'ativo', ATIVO)).map((a) => a.id)).toEqual([id]);
  });
});
