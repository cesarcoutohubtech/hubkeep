// O painel do Intelligence contra Postgres real, com o hk_app e o contexto de
// quem pede (na CI, o Supabase do runner):
//   - quem lê: o Admin do grupo tudo; o Gestor CSC da bandeira, o do hotel da
//     bandeira e o de rede que cabe nela; o Gerente, só o do próprio hotel; o
//     Técnico, nada;
//   - os ligados por anterior_id, nos dois sentidos;
//   - os chamados da evidência recortados pela RLS do chamado;
//   - a decisão com a trava de versão, a auditoria sem hotel_id e o evento;
//     fora do escopo, a linha não aparece;
//   - o detalhe do ativo: o primeiro cálculo de cada dia (sem o recálculo)
//     desde a data pedida, só para quem decide; e os insights pelo escopo.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { createHash, randomUUID } from 'node:crypto';
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

const DIA = 86_400_000;
const TENANT = randomUUID();
const B1 = randomUUID();
const B2 = randomUUID();
const H1 = randomUUID();
const H2 = randomUUID();
const L1 = randomUUID();
const L2 = randomUUID();
const U = {
  admin: randomUUID(),
  gestor: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
};
const I = {
  hotel: randomUUID(),
  sucessor: randomUUID(),
  rede: randomUUID(),
  redeB1: randomUUID(),
};
const C = { h1: randomUUID(), h2: randomUUID() };
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });
const agora = new Date();
const antes = (dias: number) => new Date(agora.getTime() - dias * DIA);
const hash = (lista: string) => createHash('sha256').update(lista, 'utf8').digest('hex');
const ABERTOS = ['novo', 'em_revisao', 'aceito', 'em_acao', 'monitorando'];

describe.skipIf(!temBanco)('painel do Intelligence', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let porta: PortaDoPainelDoIntelligence;
  const q = (texto: string, params: unknown[] = []) => dono.query(texto, params);
  const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id).sort();

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await q(`insert into app.tenant (id, nome) values ($1, 'Grupo do painel')`, [TENANT]);
    await q(
      `insert into app.bandeira (id, tenant_id, nome) values ($1, $3, 'Aurora'), ($2, $3, 'Brisa')`,
      [B1, B2, TENANT],
    );
    await q(
      `insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values
       ($1, $3, $4, 'Hotel 1', 'UTC', 'ativo'), ($2, $3, $5, 'Hotel 2', 'UTC', 'ativo')`,
      [H1, H2, TENANT, B1, B2],
    );
    await q(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
       ($1, $3, $4, 'uh', 'UH 101', 'uh 101', 'ativo'), ($2, $3, $5, 'uh', 'UH 201', 'uh 201', 'ativo')`,
      [L1, L2, TENANT, H1, H2],
    );
    for (const [nome, id] of Object.entries(U)) {
      await q(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@hubkeep.invalid`]);
      await q(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
        [TENANT, id, nome, `${id}@hubkeep.invalid`],
      );
    }
    await q(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, bandeira_id, hotel_id, concedido_por) values
         ($1, $5, $6, 'admin_grupo', 'grupo', null, null, $6),
         ($2, $5, $7, 'gestor_csc', 'bandeira', $10, null, $6),
         ($3, $5, $8, 'gerente_hotel', 'hotel', null, $11, $6),
         ($4, $5, $9, 'tecnico', 'hotel', null, $11, $6)`,
      [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        TENANT,
        U.admin,
        U.gestor,
        U.gerente,
        U.tecnico,
        B1,
        H1,
      ],
    );
    const situacao = randomUUID();
    const prioridade = randomUUID();
    await q(
      `insert into app.situacao (id, tenant_id, entidade, estado, ordem, cor)
       values ($1, $2, 'chamado', 'aberto', 1, '#000000')`,
      [situacao, TENANT],
    );
    await q(`insert into app.prioridade (id, tenant_id, ordem, peso) values ($1, $2, 1, 1)`, [
      prioridade,
      TENANT,
    ]);
    for (const [id, hotel, local, dias] of [
      [C.h1, H1, L1, 3],
      [C.h2, H2, L2, 10],
    ] as const) {
      await q(
        `insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado,
           situacao_id, prioridade_id, politica_aplicada, aberto_por, criado_em)
         values ($1, $2, $3, $4, 'Pinga', 'pinga', 'aberto', $5, $6, '{}', $7, $8)`,
        [id, TENANT, hotel, local, situacao, prioridade, U.admin, antes(dias)],
      );
    }
    const insight = (p: {
      id: string;
      hotel: string | null;
      bandeira: string | null;
      hoteis: string[];
      tipo: string;
      familia: string;
      anterior?: string;
      dias: number;
    }) =>
      q(
        `insert into app.insight (id, tenant_id, hotel_id, bandeira_id, hotel_ids, tipo, familia, chave,
           escopo, faixa, valor, versao_score, detalhe, evidencia, anterior_id,
           primeira_deteccao_em, ultima_deteccao_em)
         values ($1, $2, $3, $4, $5::uuid[], $6, $7, $8, '{}', 'alta_atencao', 75, 2,
           '{"chave": "x"}', $9, $10, $11, $11)`,
        [
          p.id,
          TENANT,
          p.hotel,
          p.bandeira,
          p.hoteis,
          p.tipo,
          p.familia,
          `${p.familia}|hoteis=${hash([...p.hoteis].sort().join(','))}`,
          JSON.stringify({ corretivaIds: [C.h1, C.h2] }),
          p.anterior ?? null,
          antes(p.dias),
        ],
      );
    await insight({
      id: I.hotel,
      hotel: H1,
      bandeira: B1,
      hoteis: [H1],
      tipo: 'atencao_ativo',
      familia: 'f-hotel',
      dias: 9,
    });
    await insight({
      id: I.sucessor,
      hotel: H1,
      bandeira: B1,
      hoteis: [H1],
      tipo: 'atencao_ativo',
      familia: 'f-sucessor',
      anterior: I.hotel,
      dias: 2,
    });
    await insight({
      id: I.rede,
      hotel: null,
      bandeira: null,
      hoteis: [H1, H2],
      tipo: 'sistemico',
      familia: 'f-rede',
      dias: 5,
    });
    await insight({
      id: I.redeB1,
      hotel: null,
      bandeira: B1,
      hoteis: [H1],
      tipo: 'sistemico',
      familia: 'f-rede-b1',
      dias: 4,
    });

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 3 } });
    porta = criarPortaDoPainelDoIntelligence(banco);
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.metrica_ativo_diaria',
      'app.insight',
      'app.chamado',
      'app.ativo',
      'app.situacao',
      'app.prioridade',
      'app.local',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.bandeira',
      'app.membro',
    ]) {
      await q(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await q(`delete from app.tenant where id = $1`, [TENANT]);
    await q(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
    await dono.end();
  });

  it('cada um lê só o que decide; o técnico, nada', async () => {
    const visiveis = async (u: string) =>
      ids(await porta.insights(ctx(u), { estados: ABERTOS }, 500));
    expect(await visiveis(U.admin)).toEqual(Object.values(I).sort());
    expect(await visiveis(U.gestor)).toEqual([I.hotel, I.sucessor, I.redeB1].sort());
    expect(await visiveis(U.gerente)).toEqual([I.hotel, I.sucessor].sort());
    expect(await visiveis(U.tecnico)).toEqual([]);
    expect(await porta.insight(ctx(U.gerente), I.rede)).toBeNull();
  });

  it('o filtro por hotel, tipo e faixa, e as contagens', async () => {
    expect(ids(await porta.insights(ctx(U.admin), { estados: ABERTOS, hotelId: H2 }, 500))).toEqual(
      [I.rede],
    );
    expect(
      ids(await porta.insights(ctx(U.admin), { estados: ABERTOS, tipo: 'sistemico' }, 500)),
    ).toEqual([I.rede, I.redeB1].sort());
    expect(await porta.insights(ctx(U.admin), { estados: ABERTOS, faixa: 'critico' }, 500)).toEqual(
      [],
    );
    expect(await porta.insights(ctx(U.admin), { estados: ['resolvido'] }, 500)).toEqual([]);
    const contagens = await porta.contagens(ctx(U.gerente), ABERTOS);
    expect(contagens).toEqual([
      { tipo: 'atencao_ativo', faixa: 'alta_atencao', comResponsavel: false, quantidade: 2 },
    ]);
  });

  it('o insight com a evidência, e os ligados nos dois sentidos', async () => {
    const i = await porta.insight(ctx(U.gerente), I.hotel);
    expect(i).toMatchObject({
      id: I.hotel,
      hotelId: H1,
      bandeiraId: B1,
      estado: 'novo',
      versao: 1,
      detalhe: { chave: 'x' },
      evidencia: { corretivaIds: [C.h1, C.h2] },
    });
    expect(ids(await porta.ligados(ctx(U.gerente), [I.hotel]))).toEqual([I.sucessor]);
    expect((await porta.ligados(ctx(U.gerente), [I.sucessor])).map((l) => l.id)).toEqual([I.hotel]);
  });

  it('os chamados da evidência e os nomes, pela RLS de quem lê', async () => {
    expect(ids(await porta.chamados(ctx(U.admin), [C.h1, C.h2]))).toEqual([C.h1, C.h2].sort());
    expect(ids(await porta.chamados(ctx(U.gerente), [C.h1, C.h2]))).toEqual([C.h1]);
    const nomes = await porta.nomes(ctx(U.admin), {
      hotelIds: [H1, H2],
      bandeiraIds: [B1],
      usuarioIds: [U.gerente],
      ativoIds: [],
    });
    expect(nomes).toEqual({
      hoteis: { [H1]: 'Hotel 1', [H2]: 'Hotel 2' },
      bandeiras: { [B1]: 'Aurora' },
      pessoas: { [U.gerente]: 'gerente' },
      ativos: {},
    });
  });

  it('decide com a trava de versão, auditoria sem hotel_id e evento', async () => {
    const decisao = {
      insightId: I.hotel,
      acao: 'revisar',
      versaoEsperada: 1,
      estado: 'em_revisao',
      nota: null,
      motivoDeDescarte: null,
      responsavelId: U.gerente,
      encerradoEm: null,
      encerradoPor: null,
      em: agora,
    };
    expect(await porta.decidir(ctx(U.gerente), decisao)).toEqual({ versao: 2 });
    await expect(porta.decidir(ctx(U.gerente), decisao)).rejects.toMatchObject({
      codigo: 'conflito_de_versao',
    });
    await porta.decidir(ctx(U.admin), {
      ...decisao,
      acao: 'descartar',
      versaoEsperada: 2,
      estado: 'descartado',
      nota: 'Ruído do sensor',
      motivoDeDescarte: 'nao_relevante',
      encerradoEm: agora,
      encerradoPor: U.admin,
    });
    const linha = await q(
      `select estado, responsavel_id, nota, motivo_descarte, encerrado_por, versao
         from app.insight where id = $1`,
      [I.hotel],
    );
    expect(linha.rows[0]).toEqual({
      estado: 'descartado',
      responsavel_id: U.gerente,
      nota: 'Ruído do sensor',
      motivo_descarte: 'nao_relevante',
      encerrado_por: U.admin,
      versao: 3,
    });
    const auditoria = await q(
      `select acao, usuario_id, hotel_id from app.auditoria
        where tenant_id = $1 and entidade = 'insight' order by em, acao`,
      [TENANT],
    );
    expect(auditoria.rows).toEqual([
      { acao: 'revisar', usuario_id: U.gerente, hotel_id: null },
      { acao: 'descartar', usuario_id: U.admin, hotel_id: null },
    ]);
    // O técnico do hotel não lê a auditoria do insight.
    const doTecnico = await banco.withContext(ctx(U.tecnico), (tx) =>
      tx.selectFrom('app.auditoria').select('id').where('entidade', '=', 'insight').execute(),
    );
    expect(doTecnico).toEqual([]);
    const eventos = await q(
      `select tipo, payload->>'acao' as acao from app.evento_dominio
        where tenant_id = $1 order by criado_em, payload->>'acao' desc`,
      [TENANT],
    );
    expect(eventos.rows).toEqual([
      { tipo: 'insight.decidido', acao: 'revisar' },
      { tipo: 'insight.decidido', acao: 'descartar' },
    ]);
  });

  it('fora do escopo, a linha não aparece: insight_nao_encontrado', async () => {
    await expect(
      porta.decidir(ctx(U.gerente), {
        insightId: I.rede,
        acao: 'revisar',
        versaoEsperada: 1,
        estado: 'em_revisao',
        nota: null,
        motivoDeDescarte: null,
        responsavelId: U.gerente,
        encerradoEm: null,
        encerradoPor: null,
        em: agora,
      }),
    ).rejects.toMatchObject({ codigo: 'insight_nao_encontrado' });
  });

  it('o detalhe do ativo: o primeiro cálculo de cada dia, só para quem decide', async () => {
    const A = randomUUID();
    const IA = randomUUID();
    await q(
      `insert into app.ativo (id, tenant_id, hotel_id, local_id, nome, busca, codigo_qr, criticidade,
                              data_compra, garantia_ate)
       values ($1, $2, $3, $4, 'Elevador social 2', 'elevador social 2', 'ABCDEFGHJ1', 5,
               '2014-06-01', '2016-05-31')`,
      [A, TENANT, H1, L1],
    );
    const metrica = (dia: string, calculo: number, recalculo: boolean, atencao: number | null) =>
      q(
        `insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, calculo,
           recalculo, atencao, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao,
           versao_politica, detalhe_reincidencia, detalhe_atencao)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, 2, 'padrao', '{}', $10)`,
        [
          randomUUID(),
          TENANT,
          H1,
          A,
          dia,
          calculo,
          recalculo,
          atencao,
          atencao === null ? 'dados_insuficientes' : 'atencao',
          JSON.stringify({ chave: 'atencao_ativo', valor: atencao }),
        ],
      );
    await metrica('2026-09-01', 1, false, 10);
    await metrica('2026-10-01', 1, false, 60);
    await metrica('2026-10-01', 2, true, 90);
    await metrica('2026-10-02', 1, false, null);
    await q(
      `insert into app.insight (id, tenant_id, hotel_id, bandeira_id, hotel_ids, tipo, familia, chave,
         escopo, faixa, valor, versao_score, primeira_deteccao_em, ultima_deteccao_em)
       values ($1, $2, $3, $4, array[$3]::uuid[], 'atencao_ativo', 'f-ativo', $5, $6, 'atencao', 60, 2,
         now(), now())`,
      [
        IA,
        TENANT,
        H1,
        B1,
        `f-ativo|hoteis=${hash(H1)}`,
        JSON.stringify({ ativoId: A, hotelId: H1 }),
      ],
    );

    expect(await porta.ativo(ctx(U.gerente), A)).toEqual({
      id: A,
      nome: 'Elevador social 2',
      hotelId: H1,
      bandeiraId: B1,
      criticidade: 5,
      desativadoEm: null,
      // O fuso do hotel e as datas de compra e garantia, para o sinal de substituição.
      fuso: 'UTC',
      dataCompra: '2014-06-01',
      garantiaAte: '2016-05-31',
    });
    const doGerente = await porta.metricasDoAtivo(ctx(U.gerente), A, '2026-09-15');
    expect(doGerente.map((m) => [m.dia, m.calculo, m.recalculo, m.atencao])).toEqual([
      ['2026-10-01', 1, false, 60],
      ['2026-10-02', 1, false, null],
    ]);
    expect(doGerente[0]).toMatchObject({
      faixa: 'atencao',
      versaoFormulaAtencao: 2,
      versaoPolitica: 'padrao',
      detalheAtencao: { chave: 'atencao_ativo', valor: 60 },
    });
    expect(await porta.metricasDoAtivo(ctx(U.gestor), A, '2026-09-15')).toHaveLength(2);
    // O técnico do hotel lê o ativo, mas não a métrica.
    expect(await porta.metricasDoAtivo(ctx(U.tecnico), A, '2026-09-15')).toEqual([]);
    expect(
      ids(await porta.insightsDoEscopo(ctx(U.gerente), 'atencao_ativo', 'ativoId', A, 50)),
    ).toEqual([IA]);
    const nomes = await porta.nomes(ctx(U.gerente), {
      hotelIds: [],
      bandeiraIds: [],
      usuarioIds: [],
      ativoIds: [A],
    });
    expect(nomes.ativos).toEqual({ [A]: 'Elevador social 2' });
    expect(await porta.insightsDoEscopo(ctx(U.tecnico), 'atencao_ativo', 'ativoId', A, 50)).toEqual(
      [],
    );
  });
});
