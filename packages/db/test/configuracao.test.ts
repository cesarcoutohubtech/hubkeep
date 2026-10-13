// Aceite da A7 (fase 1a; ADR-026) contra Postgres real (na CI, o Supabase do runner):
//   - o Admin grava a política no grupo e no hotel; todos leem o efetivo, com a
//     origem (hotel → grupo → padrão); valor null volta a herdar;
//   - formato fora da política e chave desconhecida são 422, antes do banco;
//   - o Admin configura país, moeda e idioma do tenant e o fuso do hotel;
//   - o gerente não configura (403) e, com a checagem removida, a RLS ainda barra;
//   - modelo contratual do hotel (I2): nulo no começo, só o Admin grava,
//     ausente fica o gravado, null volta a "não informado";
//   - cada gravação vai para a auditoria;
//   - nível bandeira (1c): a política da bandeira vale para os hotéis dela,
//     abaixo do hotel e acima do grupo, na leitura da configuração e na das
//     portas dos casos de uso; o hotel sem bandeira não a vê; bandeira de
//     outro tenant é 404.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDeConfiguracao, relogioDoSistema } from '@hubkeep/aplicacao';
import { registroDePoliticas } from '@hubkeep/dominio';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaConfiguracao,
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
const OUTRO_TENANT = randomUUID();
const H1 = randomUUID();
/** H2 está na mesma bandeira de H1; H3 não tem bandeira. */
const H2 = randomUUID();
const H3 = randomUUID();
const BANDEIRA = randomUUID();
const BANDEIRA_DE_OUTRO = randomUUID();
const U = { admin: randomUUID(), gerente: randomUUID(), tecnico: randomUUID() };
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });
const ACEITE = 'os.aceite_automatico';
const EXTENSAO = 'modulo_teste.limite';

describe.skipIf(!temBanco)('A7 — configuração e políticas', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeConfiguracao>;
  let semChecagem: ReturnType<typeof criarCasosDeUsoDeConfiguracao>;
  let comExtensao: ReturnType<typeof criarCasosDeUsoDeConfiguracao>;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo A7'), ($2, 'Outro')`, [
      TENANT,
      OUTRO_TENANT,
    ]);
    await dono.query(
      `insert into app.bandeira (id, tenant_id, nome) values ($1, $2, 'Bandeira A7'), ($3, $4, 'De outro')`,
      [BANDEIRA, TENANT, BANDEIRA_DE_OUTRO, OUTRO_TENANT],
    );
    await dono.query(
      `insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values
         ($1, $4, $5, 'Hotel 1', 'UTC', 'ativo'),
         ($2, $4, $5, 'Hotel 2', 'UTC', 'ativo'),
         ($3, $4, null, 'Hotel 3', 'UTC', 'ativo')`,
      [H1, H2, H3, TENANT, BANDEIRA],
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
    const atribuir = (usuario: string, papel: string, escopo: string, hotel: string | null) =>
      dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), TENANT, usuario, papel, escopo, hotel, U.admin],
      );
    await atribuir(U.admin, 'admin_grupo', 'grupo', null);
    await atribuir(U.gerente, 'gerente_hotel', 'hotel', H1);
    await atribuir(U.tecnico, 'tecnico', 'hotel', H1);
    await atribuir(U.tecnico, 'tecnico', 'hotel', H3);
    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    const deps = {
      configuracao: criarPortaConfiguracao(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    };
    casos = criarCasosDeUsoDeConfiguracao(deps);
    semChecagem = criarCasosDeUsoDeConfiguracao({
      ...deps,
      podeGerir: () => ({ permitido: true }),
    });
    // Um módulo de mentira: o domínio e o caso de uso não conhecem chave de módulo.
    comExtensao = criarCasosDeUsoDeConfiguracao({
      ...deps,
      politicas: async () =>
        registroDePoliticas([
          {
            prefixo: 'modulo_teste.',
            chaves: [EXTENSAO],
            padrao: () => ({ limite: 70 }),
            valido: (_c, v) =>
              typeof v === 'object' &&
              v !== null &&
              Object.keys(v).length === 1 &&
              Number.isInteger((v as { limite?: unknown }).limite),
          },
        ]),
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.politica',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.bandeira',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = any($1::uuid[])`, [
        [TENANT, OUTRO_TENANT],
      ]);
    }
    await dono.query(`delete from app.tenant where id = any($1::uuid[])`, [[TENANT, OUTRO_TENANT]]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  const aceiteDe = async (usuario: string) =>
    (await casos.lerConfiguracao(ctx(usuario), H1)).politicas.find((p) => p.chave === ACEITE);

  it('sem nada gravado vale o padrão do código', async () => {
    expect(await aceiteDe(U.tecnico)).toMatchObject({
      efetiva: { ligado: false, dias: 7 },
      grupo: null,
      hotel: null,
      origem: 'padrao',
    });
  });

  it('grupo e hotel: o hotel vence; null volta a herdar; tudo auditado', async () => {
    await casos.gravarPolitica(ctx(U.admin), ACEITE, { tipo: 'grupo' }, { ligado: true, dias: 10 });
    await casos.gravarPolitica(
      ctx(U.admin),
      ACEITE,
      { tipo: 'hotel', hotelId: H1 },
      { ligado: true, dias: 3 },
    );
    expect(await aceiteDe(U.tecnico)).toMatchObject({ efetiva: { dias: 3 }, origem: 'hotel' });
    await casos.gravarPolitica(ctx(U.admin), ACEITE, { tipo: 'hotel', hotelId: H1 }, null);
    expect(await aceiteDe(U.gerente)).toMatchObject({
      efetiva: { dias: 10 },
      hotel: null,
      origem: 'grupo',
    });
    // Gravar de novo reaproveita a linha do escopo, não duplica.
    await casos.gravarPolitica(
      ctx(U.admin),
      ACEITE,
      { tipo: 'hotel', hotelId: H1 },
      { ligado: false, dias: 5 },
    );
    const { rows } = await dono.query(
      `select count(*)::int as n from app.politica where tenant_id = $1 and escopo_tipo = 'hotel'`,
      [TENANT],
    );
    expect(rows[0].n).toBe(1);
    const auditoria = await dono.query(
      `select acao from app.auditoria where tenant_id = $1 and entidade = 'politica' order by em`,
      [TENANT],
    );
    expect(auditoria.rows.map((r) => r.acao)).toEqual([
      'gravar',
      'gravar',
      'voltar_a_herdar',
      'gravar',
    ]);
  });

  it('formato fora da política e chave desconhecida são recusados', async () => {
    await expect(
      casos.gravarPolitica(ctx(U.admin), ACEITE, { tipo: 'grupo' }, { ligado: true, dias: 0 }),
    ).rejects.toMatchObject({ codigo: 'politica_valor_invalido' });
    await expect(
      casos.gravarPolitica(ctx(U.admin), 'os.nao_existe', { tipo: 'grupo' }, {}),
    ).rejects.toMatchObject({ codigo: 'politica_desconhecida' });
  });

  it('chave de módulo: só com a extensão registrada, no formato dela; a leitura segue com as do núcleo', async () => {
    await expect(
      casos.gravarPolitica(ctx(U.admin), EXTENSAO, { tipo: 'grupo' }, { limite: 80 }),
    ).rejects.toMatchObject({ codigo: 'politica_desconhecida' });
    await expect(
      comExtensao.gravarPolitica(ctx(U.admin), EXTENSAO, { tipo: 'grupo' }, { limite: 'x' }),
    ).rejects.toMatchObject({ codigo: 'politica_valor_invalido' });
    await expect(
      comExtensao.gravarPolitica(ctx(U.admin), 'modulo_teste.outra', { tipo: 'grupo' }, {}),
    ).rejects.toMatchObject({ codigo: 'politica_desconhecida' });
    await expect(
      comExtensao.gravarPolitica(ctx(U.gerente), EXTENSAO, { tipo: 'grupo' }, { limite: 80 }),
    ).rejects.toMatchObject({ codigo: 'configuracao_so_admin' });

    await comExtensao.gravarPolitica(ctx(U.admin), EXTENSAO, { tipo: 'grupo' }, { limite: 80 });
    const { rows } = await dono.query(
      `select valor from app.politica where tenant_id = $1 and chave = $2 and ativa`,
      [TENANT, EXTENSAO],
    );
    expect(rows.map((r) => r.valor)).toEqual([{ limite: 80 }]);
    await comExtensao.gravarPolitica(ctx(U.admin), EXTENSAO, { tipo: 'grupo' }, null);

    const lidas = (await comExtensao.lerConfiguracao(ctx(U.admin), H1)).politicas;
    expect(lidas.map((p) => p.chave).sort()).toEqual(
      [
        'ativo.criticidade',
        'chamado.prioridade_padrao_por_categoria',
        ACEITE,
        'os.codigos_obrigatorios',
        'os.foto_depois_obrigatoria',
        'os.assinatura_no_aceite',
      ].sort(),
    );
  });

  it('o Admin configura o tenant e o hotel', async () => {
    await casos.configurarTenant(ctx(U.admin), {
      pais: 'CL',
      subdivisao: null,
      moeda: 'CLP',
      idiomaPadrao: 'es',
    });
    await casos.configurarHotel(ctx(U.admin), H1, {
      fuso: 'America/Santiago',
      pais: null,
      subdivisao: 'CL-RM',
      moeda: null,
      idiomaPadrao: null,
    });
    const { tenant, hotel } = await casos.lerConfiguracao(ctx(U.tecnico), H1);
    expect(tenant).toMatchObject({ pais: 'CL', moeda: 'CLP', idiomaPadrao: 'es' });
    expect(hotel).toMatchObject({ fuso: 'America/Santiago', subdivisao: 'CL-RM', pais: null });
    await expect(
      casos.configurarTenant(ctx(U.admin), {
        pais: 'CL',
        subdivisao: 'AR-B',
        moeda: 'CLP',
        idiomaPadrao: 'es',
      }),
    ).rejects.toMatchObject({ codigo: 'subdivisao_invalida' });
    await expect(
      casos.configurarHotel(ctx(U.admin), H1, {
        fuso: 'Marte/Olimpo',
        pais: null,
        subdivisao: null,
        moeda: null,
        idiomaPadrao: null,
      }),
    ).rejects.toMatchObject({ codigo: 'fuso_invalido' });
  });

  it('o gerente não configura; com a checagem removida, a RLS ainda barra', async () => {
    await expect(
      casos.gravarPolitica(
        ctx(U.gerente),
        ACEITE,
        { tipo: 'hotel', hotelId: H1 },
        { ligado: true, dias: 1 },
      ),
    ).rejects.toMatchObject({ codigo: 'configuracao_so_admin' });
    await expect(
      semChecagem.gravarPolitica(
        ctx(U.gerente),
        'chamado.prioridade_padrao_por_categoria',
        { tipo: 'grupo' },
        {},
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      semChecagem.gravarPolitica(
        ctx(U.gerente),
        ACEITE,
        { tipo: 'hotel', hotelId: H1 },
        { ligado: true, dias: 1 },
      ),
    ).rejects.toMatchObject({ codigo: 'politica_nao_encontrada' });
    await expect(
      semChecagem.configurarTenant(ctx(U.gerente), {
        pais: 'BR',
        subdivisao: null,
        moeda: 'BRL',
        idiomaPadrao: 'pt-BR',
      }),
    ).rejects.toMatchObject({ codigo: 'tenant_nao_encontrado' });
    await expect(
      semChecagem.configurarHotel(ctx(U.gerente), H1, {
        fuso: 'UTC',
        pais: null,
        subdivisao: null,
        moeda: null,
        idiomaPadrao: null,
      }),
    ).rejects.toMatchObject({ codigo: 'hotel_nao_encontrado' });
    expect(await aceiteDe(U.admin)).toMatchObject({ efetiva: { ligado: false, dias: 5 } });
  });

  it('modelo contratual do hotel (I2): só o Admin grava; ausente fica; null volta a não informado', async () => {
    const base = {
      fuso: 'America/Santiago',
      pais: null,
      subdivisao: 'CL-RM',
      moeda: null,
      idiomaPadrao: null,
    };
    const modelo = async () =>
      (await casos.lerConfiguracao(ctx(U.tecnico), H1)).hotel?.modeloContratual;
    expect(await modelo()).toBeNull();
    await casos.configurarHotel(ctx(U.admin), H1, { ...base, modeloContratual: 'arrendado' });
    expect(await modelo()).toBe('arrendado');
    await casos.configurarHotel(ctx(U.admin), H1, base);
    expect(await modelo()).toBe('arrendado');
    await expect(
      casos.configurarHotel(ctx(U.admin), H1, {
        ...base,
        modeloContratual: 'franquia' as unknown as 'proprio',
      }),
    ).rejects.toMatchObject({ codigo: 'hotel_modelo_contratual_invalido' });
    await expect(
      casos.configurarHotel(ctx(U.gerente), H1, { ...base, modeloContratual: 'proprio' }),
    ).rejects.toMatchObject({ codigo: 'configuracao_so_admin' });
    await expect(
      semChecagem.configurarHotel(ctx(U.gerente), H1, { ...base, modeloContratual: 'proprio' }),
    ).rejects.toMatchObject({ codigo: 'hotel_nao_encontrado' });
    expect(await modelo()).toBe('arrendado');
    await casos.configurarHotel(ctx(U.admin), H1, { ...base, modeloContratual: null });
    expect(await modelo()).toBeNull();
    const { rows } = await dono.query(
      `select antes->>'modelo_contratual' as antes, depois->>'modeloContratual' as depois
         from app.auditoria
        where tenant_id = $1 and entidade = 'hotel' and depois ? 'modeloContratual'
        order by em`,
      [TENANT],
    );
    expect(rows).toEqual([
      { antes: null, depois: 'arrendado' },
      { antes: 'arrendado', depois: null },
    ]);
  });

  it('nível bandeira (1c): vale para os hotéis dela, abaixo do hotel; sem bandeira, não vale', async () => {
    const FOTO = 'os.foto_depois_obrigatoria';
    const fotoDe = async (usuario: string, hotel: string) => {
      const c = await casos.lerConfiguracao(ctx(usuario), hotel);
      return { hotel: c.hotel, politica: c.politicas.find((p) => p.chave === FOTO) };
    };
    const escopo = { tipo: 'bandeira' as const, bandeiraId: BANDEIRA };

    await casos.gravarPolitica(ctx(U.admin), FOTO, escopo, { ligado: true });
    const h1 = await fotoDe(U.tecnico, H1);
    expect(h1.hotel?.bandeira).toEqual({ id: BANDEIRA, nome: 'Bandeira A7' });
    expect(h1.politica).toMatchObject({
      bandeira: { ligado: true },
      hotel: null,
      efetiva: { ligado: true },
      origem: 'bandeira',
    });
    expect((await fotoDe(U.admin, H2)).politica).toMatchObject({ origem: 'bandeira' });
    const h3 = await fotoDe(U.tecnico, H3);
    expect(h3.hotel?.bandeira).toBeNull();
    expect(h3.politica).toMatchObject({ bandeira: null, origem: 'padrao' });

    // As portas que os casos de uso leem (triagem, execução) resolvem igual.
    const triagem = criarPortaTriagem(banco);
    expect(await triagem.politica(ctx(U.tecnico), H1, FOTO)).toEqual({
      bandeira: { ligado: true },
    });
    expect(await triagem.politica(ctx(U.tecnico), H3, FOTO)).toEqual({});

    // O hotel vence a bandeira; voltar a herdar na bandeira cai para o padrão.
    await casos.gravarPolitica(
      ctx(U.admin),
      FOTO,
      { tipo: 'hotel', hotelId: H1 },
      { ligado: false },
    );
    expect((await fotoDe(U.tecnico, H1)).politica).toMatchObject({
      efetiva: { ligado: false },
      origem: 'hotel',
    });
    await casos.gravarPolitica(ctx(U.admin), FOTO, escopo, null);
    expect((await fotoDe(U.admin, H2)).politica).toMatchObject({
      bandeira: null,
      origem: 'padrao',
    });
    const { rows } = await dono.query(
      `select acao, depois->>'bandeiraId' as bandeira from app.auditoria
        where tenant_id = $1 and entidade = 'politica' and depois->>'chave' = $2 order by em`,
      [TENANT, FOTO],
    );
    expect(rows).toEqual([
      { acao: 'gravar', bandeira: BANDEIRA },
      { acao: 'gravar', bandeira: null },
      { acao: 'voltar_a_herdar', bandeira: BANDEIRA },
    ]);

    // Bandeira de outro tenant (ou que não existe) e quem não é Admin. Com a
    // checagem removida, a RLS não deixa o gerente alterar a linha da bandeira
    // (o UPDATE não a encontra).
    await expect(
      casos.gravarPolitica(
        ctx(U.admin),
        FOTO,
        { tipo: 'bandeira', bandeiraId: BANDEIRA_DE_OUTRO },
        { ligado: true },
      ),
    ).rejects.toMatchObject({ codigo: 'bandeira_nao_encontrada' });
    await expect(
      casos.gravarPolitica(ctx(U.gerente), FOTO, escopo, { ligado: true }),
    ).rejects.toMatchObject({ codigo: 'configuracao_so_admin' });
    await expect(
      semChecagem.gravarPolitica(ctx(U.gerente), FOTO, escopo, { ligado: true }),
    ).rejects.toMatchObject({ codigo: 'politica_nao_encontrada' });
  });
});
