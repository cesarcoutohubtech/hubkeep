// A leitura da efetividade do Intelligence contra Postgres real, com o hk_app
// e o contexto de quem pede (na CI, o Supabase do runner; adendo ao ADR-033 de
// 15/10/2026):
//   - as intervenções: o chamado com ativo cuja OS tem o código de solução na
//     lista, pela chave padrão ou pelo id do código do grupo, concluída depois
//     da data pedida; só as do ativo, se pedido; o Gerente lê só o hotel dele;
//   - o histórico dos ativos: os chamados do trecho, com as OS, o código e as
//     transições, e as paradas que tocam o trecho;
//   - as linhas de inteligencia.efetividade.
//
// A OS corretiva não leva ativo_id (check os_de_um_tipo): o ativo é o do chamado.
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

const DIA = 86_400_000;
const T = randomUUID();
const H1 = randomUUID();
const H2 = randomUUID();
const L1 = randomUUID();
const L2 = randomUUID();
const A1 = randomUUID();
const A2 = randomUUID();
const U = { admin: randomUUID(), gerente: randomUUID() };
const K = { troca: randomUUID(), doGrupo: randomUUID(), peca: randomUUID() };
const C = {
  troca: randomUUID(),
  doGrupo: randomUUID(),
  peca: randomUUID(),
  velha: randomUUID(),
  noH2: randomUUID(),
};
const TROCA = 'solucao_troca_do_equipamento';
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: T });
const agora = new Date();
const antes = (dias: number) => new Date(agora.getTime() - dias * DIA);
const QR = randomUUID().replace(/-/g, '').slice(0, 9).toUpperCase();

describe.skipIf(!temBanco)('a leitura da efetividade do Intelligence', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let porta: PortaDoPainelDoIntelligence;
  const q = (texto: string, params: unknown[] = []) => dono.query(texto, params);
  const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id).sort();

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await q(`insert into app.tenant (id, nome) values ($1, 'Grupo da efetividade')`, [T]);
    await q(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values
       ($1, $3, 'Hotel 1', 'UTC', 'ativo'), ($2, $3, 'Hotel 2', 'UTC', 'ativo')`,
      [H1, H2, T],
    );
    await q(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
       ($1, $3, $4, 'area_comum', 'Hall', 'hall', 'ativo'), ($2, $3, $5, 'area_comum', 'Hall', 'hall', 'ativo')`,
      [L1, L2, T, H1, H2],
    );
    await q(
      `insert into app.ativo (id, tenant_id, hotel_id, local_id, nome, busca, codigo_qr) values
       ($1, $3, $4, $5, 'Elevador', 'elevador', '${QR}1'),
       ($2, $3, $6, $7, 'Elevador', 'elevador', '${QR}2')`,
      [A1, A2, T, H1, L1, H2, L2],
    );
    for (const [nome, id] of Object.entries(U)) {
      await q(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@hubkeep.invalid`]);
      await q(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
        [T, id, nome, `${id}@hubkeep.invalid`],
      );
    }
    await q(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por) values
         ($1, $3, $4, 'admin_grupo', 'grupo', null, $4),
         ($2, $3, $5, 'gerente_hotel', 'hotel', $6, $4)`,
      [randomUUID(), randomUUID(), T, U.admin, U.gerente, H1],
    );
    const situacaoChamado = randomUUID();
    const situacaoOs = randomUUID();
    const prioridade = randomUUID();
    await q(
      `insert into app.situacao (id, tenant_id, entidade, estado, ordem, cor) values
       ($1, $3, 'chamado', 'aberto', 1, '#000000'), ($2, $3, 'os', 'atribuida', 1, '#000000')`,
      [situacaoChamado, situacaoOs, T],
    );
    await q(`insert into app.prioridade (id, tenant_id, ordem, peso) values ($1, $2, 1, 1)`, [
      prioridade,
      T,
    ]);
    await q(
      `insert into app.codigo_manutencao (id, tenant_id, tipo, chave_padrao, nomes) values
       ($1, $4, 'solucao', '${TROCA}', '{}'),
       ($2, $4, 'solucao', null, '{"pt-BR": "Modernização"}'),
       ($3, $4, 'solucao', 'solucao_troca_de_peca', '{}')`,
      [K.troca, K.doGrupo, K.peca, T],
    );
    const corretiva = async (p: {
      id: string;
      hotel: string;
      local: string;
      ativo: string;
      aberto: number;
      codigo: string;
      concluido: number;
      aceito?: number;
      custo?: string;
    }) => {
      await q(
        `insert into app.chamado (id, tenant_id, hotel_id, local_id, ativo_id, descricao, busca, estado,
           situacao_id, prioridade_id, politica_aplicada, aberto_por, criado_em)
         values ($1, $2, $3, $4, $5, 'Parado', 'parado', 'concluido', $6, $7, '{}', $8, $9)`,
        [p.id, T, p.hotel, p.local, p.ativo, situacaoChamado, prioridade, U.admin, antes(p.aberto)],
      );
      const os = randomUUID();
      await q(
        `insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id,
           tecnico_id, criado_por, criado_em, custo_informado, codigo_solucao_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11)`,
        [
          os,
          T,
          p.hotel,
          p.id,
          p.local,
          p.aceito === undefined ? 'concluida' : 'aceita',
          situacaoOs,
          U.admin,
          antes(p.aberto),
          p.custo ?? null,
          p.codigo,
        ],
      );
      const transicao = (acao: string, de: string, para: string, dias: number) =>
        q(
          `insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, quando, usuario_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [randomUUID(), T, p.hotel, os, acao, de, para, antes(dias), U.admin],
        );
      await transicao('concluir', 'em_execucao', 'concluida', p.concluido);
      if (p.aceito !== undefined) await transicao('aceitar', 'concluida', 'aceita', p.aceito);
    };
    const noH1 = { hotel: H1, local: L1, ativo: A1 };
    await corretiva({
      id: C.troca,
      ...noH1,
      aberto: 40,
      codigo: K.troca,
      concluido: 30,
      aceito: 29,
      custo: '48000.00',
    });
    await corretiva({ id: C.doGrupo, ...noH1, aberto: 20, codigo: K.doGrupo, concluido: 15 });
    await corretiva({
      id: C.peca,
      ...noH1,
      aberto: 60,
      codigo: K.peca,
      concluido: 55,
      aceito: 54,
      custo: '300.00',
    });
    await corretiva({ id: C.velha, ...noH1, aberto: 400, codigo: K.troca, concluido: 390 });
    await corretiva({
      id: C.noH2,
      hotel: H2,
      local: L2,
      ativo: A2,
      aberto: 40,
      codigo: K.troca,
      concluido: 30,
    });
    await q(
      `insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, inicio, fim, aberta_por, encerrada_por)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [randomUUID(), T, H1, A1, C.peca, antes(58), antes(57), U.admin],
    );
    await q(
      `insert into app.politica (id, tenant_id, escopo_tipo, hotel_id, chave, valor, atualizado_por)
       values ($1, $2, 'grupo', null, 'inteligencia.efetividade', $3, $4)`,
      [
        randomUUID(),
        T,
        JSON.stringify({
          janelaDias: 90,
          reducaoObservadaPercentual: 60,
          reducaoParcialPercentual: 25,
          aumentoObservadoPercentual: 20,
          minChamadosAntes: 3,
          codigosDeIntervencao: [TROCA, K.doGrupo],
        }),
        U.admin,
      ],
    );

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 3 } });
    porta = criarPortaDoPainelDoIntelligence(banco);
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.politica',
      'app.parada_ativo',
      'app.os_transicao',
      'app.os',
      'app.chamado',
      'app.codigo_manutencao',
      'app.ativo',
      'app.situacao',
      'app.prioridade',
      'app.local',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.membro',
    ]) {
      await q(`delete from ${t} where tenant_id = $1`, [T]);
    }
    await q(`delete from app.tenant where id = $1`, [T]);
    await q(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
    await dono.end();
  });

  it('as intervenções pela chave padrão e pelo id do código do grupo, depois da data pedida', async () => {
    const codigos = [TROCA, K.doGrupo];
    const todas = await porta.intervencoes(ctx(U.admin), { codigos, desde: antes(180) });
    expect(ids(todas)).toEqual([C.troca, C.doGrupo, C.noH2].sort());
    const troca = todas.find((c) => c.id === C.troca);
    expect(troca).toMatchObject({
      hotelId: H1,
      bandeiraId: null,
      ativoId: A1,
      estado: 'concluido',
    });
    expect(troca?.os).toHaveLength(1);
    expect(troca?.os[0]).toMatchObject({
      estado: 'aceita',
      codigoSolucaoId: K.troca,
      codigoSolucaoChave: TROCA,
      custoInformado: 48000,
    });
    expect(troca?.os[0]?.transicoes.map((t) => t.acao)).toEqual(['concluir', 'aceitar']);
    const doGrupo = todas.find((c) => c.id === C.doGrupo);
    expect(doGrupo?.os[0]).toMatchObject({ codigoSolucaoId: K.doGrupo, codigoSolucaoChave: null });

    const doAtivo = await porta.intervencoes(ctx(U.admin), {
      codigos,
      desde: antes(180),
      ativoId: A1,
    });
    expect(ids(doAtivo)).toEqual([C.troca, C.doGrupo].sort());
    const soAChave = await porta.intervencoes(ctx(U.admin), {
      codigos: [TROCA],
      desde: antes(500),
    });
    expect(ids(soAChave)).toEqual([C.troca, C.velha, C.noH2].sort());
    expect(await porta.intervencoes(ctx(U.admin), { codigos: [], desde: antes(180) })).toEqual([]);
  });

  it('o Gerente lê só as do próprio hotel (RLS do chamado)', async () => {
    const doGerente = await porta.intervencoes(ctx(U.gerente), {
      codigos: [TROCA, K.doGrupo],
      desde: antes(180),
    });
    expect(ids(doGerente)).toEqual([C.troca, C.doGrupo].sort());
  });

  it('o histórico do ativo no trecho: os chamados com as OS e as paradas', async () => {
    const h = await porta.historicoDosAtivos(ctx(U.gerente), [A1], antes(150), agora);
    expect(ids(h.chamados)).toEqual([C.troca, C.doGrupo, C.peca].sort());
    expect(h.chamados.find((c) => c.id === C.peca)?.os[0]).toMatchObject({
      codigoSolucaoChave: 'solucao_troca_de_peca',
      custoInformado: 300,
    });
    expect(h.paradas).toEqual([{ ativoId: A1, inicio: antes(58), fim: antes(57) }]);
    const doOutroHotel = await porta.historicoDosAtivos(ctx(U.gerente), [A2], antes(150), agora);
    expect(doOutroHotel).toEqual({ chamados: [], paradas: [] });
    expect(await porta.historicoDosAtivos(ctx(U.admin), [], antes(150), agora)).toEqual({
      chamados: [],
      paradas: [],
    });
  });

  it('as linhas de inteligencia.efetividade', async () => {
    const linhas = await porta.politicasDaEfetividade(ctx(U.gerente));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      chave: 'inteligencia.efetividade',
      escopo: 'grupo',
      hotelId: null,
    });
    expect((linhas[0]?.valor as { codigosDeIntervencao: string[] }).codigosDeIntervencao).toEqual([
      TROCA,
      K.doGrupo,
    ]);
  });
});
