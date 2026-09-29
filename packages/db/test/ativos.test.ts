// Aceite da B3 (fase 1a; ADR-028 e ADR-029) contra Postgres real (na CI, o Supabase do runner):
//   - o técnico cadastra ativo com campos estendidos validados contra a
//     categoria; obrigatório, campo desconhecido, categoria e local inativos
//     são recusados com código;
//   - a alteração leva a versão vista: versão velha dá 409 conflito_de_versao,
//     com a versão atual;
//   - o solicitante não gere (403); o gerente de outro hotel não vê o local; com
//     a checagem removida, a RLS ainda barra;
//   - o proprietário vê só o ativo da UH dele;
//   - pela fila offline, o reenvio de ativo.cadastrar não duplica, e o conflito
//     de ativo.alterar não guarda a chave;
//   - cada gravação vai para a auditoria e o painel de implantação conta;
//   - QR (B5): o cadastro gera o código; abrir pelo código respeita o escopo
//     (outro hotel dá 404) e aceita o código digitado em minúsculas.
//   - busca (B6): por trecho, sem acento e em nome, fabricante e série; % e _
//     são texto; termo curto dá busca_curta; alterar regrava a busca, e
//     renomear atualiza a coluna.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeAtivos,
  criarCasosDeUsoDeSincronizacao,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaAtivos,
  criarPortaImplantacao,
  criarPortaOperacoesOffline,
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
const L = { uh101: randomUUID(), uh102: randomUUID(), inativo: randomUUID(), h2: randomUUID() };
const CAT = { climatizacao: randomUUID(), inativa: randomUUID() };
const PROPRIETARIO = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
  solicitante: randomUUID(),
  gerenteH2: randomUUID(),
  dono: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });
const potencia = {
  chave: 'potencia',
  tipo: 'numero',
  obrigatorio: true,
  rotulos: { 'pt-BR': 'Potência' },
  unidade: 'BTU/h',
  opcoes: [],
};
const pedido = (localId: string, extra: Record<string, unknown> = {}) => ({
  localId,
  categoriaId: CAT.climatizacao,
  nome: 'Ar-condicionado',
  fabricante: 'Fabricante X',
  modelo: 'M-9',
  numeroSerie: 'SN-001',
  campos: { potencia: 9000 },
  ...extra,
});

describe.skipIf(!temBanco)('B3 — ativos', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeAtivos>;
  let sincronizacao: ReturnType<typeof criarCasosDeUsoDeSincronizacao>;
  let ar = '';

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo B3')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values
       ($1, $3, 'Hotel 1', 'UTC', 'ativo'), ($2, $3, 'Hotel 2', 'UTC', 'ativo')`,
      [H1, H2, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status, cod_externo) values
       ($1, $5, $6, 'uh', 'UH 101', 'uh 101', 'ativo', '101'),
       ($2, $5, $6, 'uh', 'UH 102', 'uh 102', 'ativo', '102'),
       ($3, $5, $6, 'area_comum', 'Depósito antigo', 'deposito antigo', 'inativo', null),
       ($4, $5, $7, 'area_comum', 'Lobby H2', 'lobby h2', 'ativo', null)`,
      [L.uh101, L.uh102, L.inativo, L.h2, TENANT, H1, H2],
    );
    await dono.query(
      `insert into app.categoria_ativo (id, tenant_id, nomes, campos, ativa) values
       ($1, $3, '{"pt-BR": "Climatização"}', $4, true),
       ($2, $3, '{"pt-BR": "Antiga"}', '[]', false)`,
      [CAT.climatizacao, CAT.inativa, TENANT, JSON.stringify([potencia])],
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
    await atribuir(U.solicitante, 'solicitante', 'hotel', H1);
    await atribuir(U.gerenteH2, 'gerente_hotel', 'hotel', H2);
    await atribuir(U.dono, 'proprietario', 'proprietario', null, PROPRIETARIO);
    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    casos = criarCasosDeUsoDeAtivos({
      ativos: criarPortaAtivos(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    });
    sincronizacao = criarCasosDeUsoDeSincronizacao({
      operacoes: criarPortaOperacoesOffline(banco),
      ativos: casos,
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.operacao_offline',
      'app.ativo',
      'app.categoria_ativo',
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

  it('o técnico cadastra com campos estendidos; a lista lê pela categoria', async () => {
    const r = await casos.cadastrar(ctx(U.tecnico), pedido(L.uh101));
    ar = r.id;
    expect(r.versao).toBe(1);
    await casos.cadastrar(
      ctx(U.gerente),
      pedido(L.uh102, { nome: 'TV', categoriaId: null, campos: {} }),
    );
    const lista = await casos.listarAtivos(ctx(U.gerente), H1);
    expect(lista.map((a) => a.nome)).toEqual(['Ar-condicionado', 'TV']);
    expect(lista[0]).toMatchObject({
      localId: L.uh101,
      campos: { potencia: 9000 },
      numeroSerie: 'SN-001',
      versao: 1,
      desativadoEm: null,
    });
  });

  it('campos e escolhas inválidos: recusa com código', async () => {
    const recusa = (p: ReturnType<typeof pedido>) => casos.cadastrar(ctx(U.tecnico), p);
    await expect(recusa(pedido(L.uh102, { campos: {} }))).rejects.toMatchObject({
      codigo: 'campo_obrigatorio',
      parametros: { campo: 'potencia' },
    });
    await expect(
      recusa(pedido(L.uh102, { campos: { potencia: 1, cor: 'azul' } })),
    ).rejects.toMatchObject({ codigo: 'campo_desconhecido' });
    await expect(
      recusa(pedido(L.uh102, { categoriaId: CAT.inativa, campos: {} })),
    ).rejects.toMatchObject({ codigo: 'ativo_categoria_inativa' });
    await expect(recusa(pedido(L.inativo))).rejects.toMatchObject({
      codigo: 'ativo_local_inativo',
    });
    await expect(recusa(pedido(L.uh102, { categoriaId: randomUUID() }))).rejects.toMatchObject({
      codigo: 'categoria_nao_encontrada',
    });
  });

  it('versão velha dá conflito_de_versao, com a versão atual', async () => {
    const base = { ...pedido(L.uh101), versao: 1 };
    expect(await casos.alterar(ctx(U.gerente), ar, { ...base, modelo: 'M-10' })).toEqual({
      versao: 2,
    });
    await expect(
      casos.alterar(ctx(U.tecnico), ar, { ...base, numeroSerie: 'SN-002' }),
    ).rejects.toMatchObject({ codigo: 'conflito_de_versao', parametros: { versaoAtual: 2 } });
    expect(await casos.desativar(ctx(U.tecnico), ar, 2)).toEqual({ versao: 3 });
    expect(await casos.reativar(ctx(U.tecnico), ar, 3)).toEqual({ versao: 4 });
    const [gravado] = await casos.listarAtivos(ctx(U.admin), H1);
    expect(gravado).toMatchObject({ modelo: 'M-10', numeroSerie: 'SN-001', versao: 4 });
  });

  it('solicitante não gere; outro hotel não vê; com a checagem removida, a RLS barra', async () => {
    await expect(casos.cadastrar(ctx(U.solicitante), pedido(L.uh102))).rejects.toMatchObject({
      codigo: 'ativos_fora_do_escopo',
    });
    await expect(casos.cadastrar(ctx(U.gerenteH2), pedido(L.uh102))).rejects.toMatchObject({
      codigo: 'local_nao_encontrado',
    });
    await expect(casos.listarAtivos(ctx(U.gerenteH2), H1)).rejects.toMatchObject({
      codigo: 'hotel_nao_encontrado',
    });
    const porta = criarPortaAtivos(banco);
    const dados = {
      categoriaId: null,
      nome: 'Intruso',
      fabricante: null,
      modelo: null,
      numeroSerie: null,
      campos: {},
    };
    await expect(porta.criar(ctx(U.gerenteH2), H1, L.uh102, dados)).rejects.toMatchObject({
      code: '42501',
    });
    await expect(porta.alterar(ctx(U.gerenteH2), ar, 4, dados)).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
    // O proprietário lê o ativo, mas a RLS não deixa gravar: sem linha, e a
    // versão continua a esperada, então é "não encontrado", não conflito.
    await expect(porta.alterar(ctx(U.dono), ar, 4, dados)).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
  });

  it('o proprietário vê só o ativo da UH dele', async () => {
    const lista = await casos.listarAtivos(ctx(U.dono), H1);
    expect(lista.map((a) => a.id)).toEqual([ar]);
  });

  it('QR (B5): código gerado no cadastro; abre no escopo e dá 404 fora dele', async () => {
    const lista = await casos.listarAtivos(ctx(U.gerente), H1);
    const codigos = lista.map((a) => a.codigoQr);
    for (const c of codigos) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(new Set(codigos).size).toBe(codigos.length);
    const codigo = lista.find((a) => a.id === ar)?.codigoQr ?? '';
    expect((await casos.abrirPorCodigoQr(ctx(U.dono), codigo.toLowerCase())).id).toBe(ar);
    expect((await casos.abrirPorCodigoQr(ctx(U.tecnico), codigo)).campos).toEqual({
      potencia: 9000,
    });
    await expect(casos.abrirPorCodigoQr(ctx(U.gerenteH2), codigo)).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
    await expect(casos.abrirPorCodigoQr(ctx(U.gerente), '../hoteis')).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
    const { rows } = await dono.query(
      `select depois->>'codigoQr' as codigo from app.auditoria
        where tenant_id = $1 and entidade = 'ativo' and registro_id = $2 and acao = 'criar'`,
      [TENANT, ar],
    );
    expect(rows[0]?.codigo).toBe(codigo);
  });

  it('fila offline: o reenvio não duplica e o conflito não guarda a chave', async () => {
    const chave = randomUUID();
    const op = {
      chave,
      tipo: 'ativo.cadastrar' as const,
      dados: pedido(L.uh102, { nome: 'Frigobar 102' }),
    };
    const primeira = await sincronizacao.receberOperacao(ctx(U.tecnico), op);
    const reenvio = await sincronizacao.receberOperacao(ctx(U.tecnico), op);
    expect(primeira.repetida).toBe(false);
    expect(reenvio).toEqual({ ...primeira, repetida: true });
    const { rows } = await dono.query(
      `select count(*)::int as n from app.ativo where tenant_id = $1 and nome = 'Frigobar 102'`,
      [TENANT],
    );
    expect(rows[0].n).toBe(1);

    const conflito = randomUUID();
    await expect(
      sincronizacao.receberOperacao(ctx(U.tecnico), {
        chave: conflito,
        tipo: 'ativo.alterar',
        dados: { ...pedido(L.uh101), ativoId: ar, versao: 1 },
      }),
    ).rejects.toMatchObject({ codigo: 'conflito_de_versao', parametros: { versaoAtual: 4 } });
    const guardada = await dono.query(
      `select 1 from app.operacao_offline where tenant_id = $1 and chave = $2`,
      [TENANT, conflito],
    );
    expect(guardada.rowCount).toBe(0);
  });

  it('auditoria de cada gravação e o painel de implantação conta os ativos', async () => {
    const { rows } = await dono.query(
      `select acao from app.auditoria where tenant_id = $1 and entidade = 'ativo' and registro_id = $2 order by em`,
      [TENANT, ar],
    );
    expect(rows.map((r) => r.acao)).toEqual(['criar', 'alterar', 'desativar', 'reativar']);
    const ativos = await criarPortaImplantacao(banco).ativos(ctx(U.admin), H1);
    expect(ativos.filter((a) => a.ativo && a.categoriaId === null)).toHaveLength(1);
    expect(new Set(ativos.map((a) => a.localId))).toEqual(new Set([L.uh101, L.uh102]));
  });

  it('busca (B6): por trecho e sem acento, no escopo; a alteração regrava a busca', async () => {
    const { id, versao } = await casos.cadastrar(
      ctx(U.gerente),
      pedido(L.uh102, {
        nome: 'Refrigerador do Açúcar',
        fabricante: 'Cônsul',
        numeroSerie: 'SN_50%',
        categoriaId: null,
        campos: {},
      }),
    );
    const achados = async (termo: string, quem = U.gerente) =>
      (await casos.listarAtivos(ctx(quem), H1, termo)).map((a) => a.id);
    expect(await achados('acucar')).toEqual([id]);
    expect(await achados('FRIG')).toEqual([id]);
    expect(await achados('consul')).toEqual([id]);
    expect(await achados('_50%')).toEqual([id]);
    // % e _ digitados são texto: "sn%50" não casa "sn_50%".
    expect(await achados('sn%50')).toEqual([]);
    // O dono da UH 101 não vê o ativo da UH 102, mesmo achando o termo.
    expect(await achados('acucar', U.dono)).toEqual([]);
    await expect(casos.listarAtivos(ctx(U.gerente), H1, 'aç')).rejects.toMatchObject({
      codigo: 'busca_curta',
      parametros: { minimo: 3 },
    });
    expect((await casos.listarAtivos(ctx(U.gerente), H1, '  ')).length).toBeGreaterThan(1);
    await casos.alterar(ctx(U.gerente), id, {
      ...pedido(L.uh102, { nome: 'Geladeira', categoriaId: null, campos: {} }),
      versao,
    });
    expect(await achados('frig')).toEqual([]);
    expect(await achados('gela')).toEqual([id]);
  });

  it('busca (B6): renomear um ativo atualiza a coluna, com os demais campos', async () => {
    const { id, versao } = await casos.cadastrar(
      ctx(U.gerente),
      pedido(L.uh102, { nome: 'Bomba de Calor', categoriaId: null, campos: {} }),
    );
    const busca = async () =>
      (await dono.query('select busca from app.ativo where id = $1', [id])).rows[0]?.busca;
    expect(await busca()).toBe('bomba de calor fabricante x m-9 sn-001');
    await casos.alterar(ctx(U.gerente), id, {
      ...pedido(L.uh102, { nome: 'Aquecedor Elétrico', categoriaId: null, campos: {} }),
      versao,
    });
    expect(await busca()).toBe('aquecedor eletrico fabricante x m-9 sn-001');
  });
});
