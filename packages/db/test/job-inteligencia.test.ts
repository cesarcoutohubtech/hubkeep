// A sessão do job diário do Intelligence (ADR-036) contra Postgres real, com o
// hk_worker (na CI, o Supabase do runner):
//   - lê só o tenant do job, com as linhas como o banco as guarda (as regras
//     de quais entram são do motor);
//   - os chamados do período: abertos depois de `desde`, ou com transição de
//     OS depois dele; os ativos sem baixa antes de `desde`;
//   - os insights abertos e o último encerrado de cada família;
//   - grava métrica, abre e atualiza insight com auditoria e evento, numa
//     transação: se algo falha, nada fica;
//   - o sinal do hóspede (ADR-047): as reclamações de manutenção com
//     categoria, sem o texto, e o apagamento do texto vencido, só no tenant.
//
//   HK_TESTE_URL_WORKER, HK_TESTE_URL_DONO
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  type MetricaDoJob,
  type PortaDoJobDoIntelligence,
  criarAcessoBanco,
  criarPortaDoJobDoIntelligence,
} from '../src/index';

const URL_WORKER = process.env.HK_TESTE_URL_WORKER;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_WORKER && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_WORKER/DONO.');
}

const DIA = 86_400_000;
const T = randomUUID();
const T2 = randomUUID();
const H1 = randomUUID();
const H2 = randomUUID();
const HB = randomUUID();
const L1 = randomUUID();
const L2 = randomUUID();
const LB = randomUUID();
const U = randomUUID();
const UB = randomUUID();
const A = { emUso: randomUUID(), baixadoAntigo: randomUUID(), baixadoNaJanela: randomUUID() };
const C = {
  recente: randomUUID(),
  antigoComTransicao: randomUUID(),
  antigo: randomUUID(),
  canceladoSemOs: randomUUID(),
};
const OS = { recente: randomUUID(), antigoComTransicao: randomUUID(), antigo: randomUUID() };
const PLANO = randomUUID();
const PV = {
  aberta: randomUUID(),
  concluidaNaJanela: randomUUID(),
  concluidaAntiga: randomUUID(),
  criadaDepois: randomUUID(),
};
const I = { aberto: randomUUID(), velho: randomUUID(), novo: randomUUID() };
const POLITICA = randomUUID();
const CAT = randomUUID();
const S = {
  recente: randomUUID(),
  semCategoria: randomUUID(),
  fora: randomUUID(),
  velho: randomUUID(),
  apagado: randomUUID(),
  outroTenant: randomUUID(),
};
const ABB = 'ABCDEFGHJK';

// Um minuto à frente: os ativos nascem com criado_em = now(), depois deste arquivo carregar.
const agora = new Date(Date.now() + 60_000);
const antes = (dias: number) => new Date(agora.getTime() - dias * DIA);
const desde = antes(365);
const hash = (lista: string) => createHash('sha256').update(lista, 'utf8').digest('hex');
const chave = (familia: string, hoteis: string[]) =>
  `${familia}|hoteis=${hash([...hoteis].sort().join(','))}`;

describe.skipIf(!temBanco)('sessão do job do Intelligence', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let porta: PortaDoJobDoIntelligence;
  const q = (texto: string, params: unknown[] = []) => dono.query(texto, params);

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    for (const [t, u, nome] of [
      [T, U, 'Job A'],
      [T2, UB, 'Job B'],
    ] as const) {
      await q(`insert into app.tenant (id, nome) values ($1, $2)`, [t, nome]);
      await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@hubkeep.invalid`]);
      await q(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, 'Pessoa', $3)`,
        [t, u, `${u}@hubkeep.invalid`],
      );
      await q(
        `insert into licenca.modulo (id, tenant_id, modulo, inicio, atualizado_por)
         values ($1, $2, 'inteligencia', $3, 'teste')`,
        [randomUUID(), t, antes(100)],
      );
    }
    await q(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values
       ($1, $3, 'Hotel 1', 'UTC', 'ativo'), ($2, $3, 'Hotel 2', 'UTC', 'em_implantacao'),
       ($4, $5, 'Hotel B', 'UTC', 'ativo')`,
      [H1, H2, T, HB, T2],
    );
    await q(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status, andar) values
       ($1, $3, $4, 'uh', 'UH 101', 'uh 101', 'ativo', '1'),
       ($2, $3, $5, 'area_comum', 'Lobby', 'lobby', 'ativo', null),
       ($6, $7, $8, 'uh', 'UH B', 'uh b', 'ativo', '1')`,
      [L1, L2, T, H1, H2, LB, T2, HB],
    );
    await q(
      `insert into app.ativo (id, tenant_id, hotel_id, local_id, nome, busca, codigo_qr,
         fabricante, modelo, criticidade, garantia_ate, desativado_em) values
       ($1, $4, $5, $6, 'Split', 'split', '${ABB.slice(0, 9)}1', 'Marca', 'X1', 4, '2026-01-31', null),
       ($2, $4, $5, $6, 'Velho', 'velho', '${ABB.slice(0, 9)}2', null, null, null, null, $7),
       ($3, $4, $5, $6, 'Trocado', 'trocado', '${ABB.slice(0, 9)}3', null, null, null, null, $8)`,
      [A.emUso, A.baixadoAntigo, A.baixadoNaJanela, T, H1, L1, antes(500), antes(30)],
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
    const chamado = (id: string, estado: string, criado: Date) =>
      q(
        `insert into app.chamado (id, tenant_id, hotel_id, local_id, ativo_id, descricao, busca, estado,
           situacao_id, prioridade_id, politica_aplicada, aberto_por, criado_em, impacto_hospede)
         values ($1, $2, $3, $4, $5, 'Pinga', 'pinga', $6, $7, $8, '{}', $9, $10, true)`,
        [id, T, H1, L1, A.emUso, estado, situacaoChamado, prioridade, U, criado],
      );
    await chamado(C.recente, 'concluido', antes(10));
    await chamado(C.antigoComTransicao, 'concluido', antes(500));
    await chamado(C.antigo, 'concluido', antes(600));
    await chamado(C.canceladoSemOs, 'cancelado', antes(5));
    const os = (id: string, chamadoId: string, criado: Date, custo: string | null) =>
      q(
        `insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id,
           tecnico_id, criado_por, criado_em, custo_informado, codigo_falha_id)
         values ($1, $2, $3, $4, $5, 'concluida', $6, $7, $7, $8, $9, null)`,
        [id, T, H1, chamadoId, L1, situacaoOs, U, criado, custo],
      );
    await os(OS.recente, C.recente, antes(10), '123.45');
    await os(OS.antigoComTransicao, C.antigoComTransicao, antes(500), null);
    await os(OS.antigo, C.antigo, antes(600), null);
    const transicao = (osId: string, quando: Date) =>
      q(
        `insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, quando, usuario_id)
         values ($1, $2, $3, $4, 'concluir', 'em_execucao', 'concluida', $5, $6)`,
        [randomUUID(), T, H1, osId, quando, U],
      );
    await transicao(OS.recente, antes(9));
    await transicao(OS.antigoComTransicao, antes(20));
    await transicao(OS.antigo, antes(590));
    // As OS preventivas do ativo em uso (PV3): a aberta e a concluída na janela
    // entram; a concluída antes de desde e a criada depois de agora, não.
    await q(
      `insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade,
         inicio, situacao, criado_por)
       values ($1, $2, $3, $4, 'Revisão', 1, 'mes', '2025-01-01', 'ativo', $5)`,
      [PLANO, T, H1, A.emUso, U],
    );
    const preventiva = (id: string, prevista: Date, estado: string, criada: Date) =>
      q(
        `insert into app.os (id, tenant_id, hotel_id, local_id, plano_id, ativo_id, data_prevista,
           plano_aplicado, estado, situacao_id, tecnico_id, criado_em)
         values ($1, $2, $3, $4, $5, $6, ($7::timestamptz)::date, '{}', $8, $9, $10, $11)`,
        [id, T, H1, L1, PLANO, A.emUso, prevista, estado, situacaoOs, U, criada],
      );
    await preventiva(PV.aberta, antes(30), 'atribuida', antes(31));
    await preventiva(PV.concluidaNaJanela, antes(60), 'concluida', antes(61));
    await preventiva(PV.concluidaAntiga, antes(500), 'concluida', antes(501));
    await preventiva(PV.criadaDepois, antes(-5), 'atribuida', new Date(agora.getTime() + DIA));
    await transicao(PV.concluidaNaJanela, antes(55));
    await transicao(PV.concluidaAntiga, antes(499));
    await q(
      `insert into app.politica (id, tenant_id, escopo_tipo, hotel_id, chave, valor, atualizado_por)
       values ($1, $2, 'grupo', null, 'inteligencia.reincidencia', '{"janelaDias": 30}', $3)`,
      [POLITICA, T, U],
    );
    const insight = (id: string, familia: string, encerrado: Date | null, estado: string) =>
      q(
        `insert into app.insight (id, tenant_id, hotel_id, hotel_ids, tipo, familia, chave, escopo,
           estado, faixa, valor, versao_score, primeira_deteccao_em, ultima_deteccao_em,
           encerrado_em, encerrado_por, motivo_descarte)
         values ($1, $2, $3, array[$3]::uuid[], 'atencao_ativo', $4, $5, '{}', $6, 'atencao', 60, 2,
           $7, $7, $8, $9, $10)`,
        [
          id,
          T,
          H1,
          familia,
          chave(familia, [H1]),
          estado,
          antes(40),
          encerrado,
          encerrado ? U : null,
          estado === 'descartado' ? 'nao_relevante' : null,
        ],
      );
    await insight(I.aberto, 'f-aberta', null, 'novo');
    await insight(I.velho, 'f-fechada', antes(30), 'resolvido');
    // Mesma chave da família já encerrada: o índice só vale para aberto.
    await insight(I.novo, 'f-fechada', antes(10), 'descartado');
    await q(
      `insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, calculo, recalculo,
         faixa_atencao, versao_formula_reincidencia, versao_formula_atencao, versao_politica,
         detalhe_reincidencia, detalhe_atencao)
       values ($1, $3, $4, $5, '2026-09-01', 1, false, 'normal', 1, 2, 'padrao', '{}', '{}'),
              ($2, $3, $4, $5, '2026-09-01', 2, true, 'normal', 1, 2, 'padrao', '{}', '{}')`,
      [randomUUID(), randomUUID(), T, H1, A.emUso],
    );

    banco = await criarAcessoBanco({ worker: { url: URL_WORKER ?? '', max: 3 } });
    porta = criarPortaDoJobDoIntelligence(banco);
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.metrica_ativo_diaria',
      'app.insight',
      'app.sinal_hospede',
      'app.parada_ativo',
      'app.os_transicao',
      'app.os',
      'app.plano_preventivo',
      'app.chamado',
      'app.politica',
      'app.situacao',
      'app.prioridade',
      'app.ativo',
      'app.categoria_ativo',
      'app.local',
      'app.hotel',
      'licenca.modulo',
      'app.membro',
    ]) {
      await q(`delete from ${t} where tenant_id = any($1::uuid[])`, [[T, T2]]);
    }
    await q(`delete from app.tenant where id = any($1::uuid[])`, [[T, T2]]);
    await q(`delete from auth.users where id = any($1::uuid[])`, [[U, UB]]);
    await dono.end();
  });

  it('lê só o tenant do job, com as linhas como estão no banco', async () => {
    const lido = await porta.noTenant(T, async (s) => ({
      modulos: await s.modulos(),
      hoteis: await s.hoteis(),
      politicas: await s.politicas(['inteligencia.reincidencia', 'inteligencia.sistemico']),
      locais: await s.locais(),
    }));
    expect(lido.modulos.map((m) => m.modulo)).toEqual(['inteligencia']);
    expect(lido.hoteis.map((h) => [h.id, h.status, h.fuso]).sort()).toEqual(
      [
        [H1, 'ativo', 'UTC'],
        [H2, 'em_implantacao', 'UTC'],
      ].sort(),
    );
    expect(lido.politicas).toEqual([
      {
        id: POLITICA,
        chave: 'inteligencia.reincidencia',
        escopo: 'grupo',
        hotelId: null,
        bandeiraId: null,
        valor: { janelaDias: 30 },
        atualizadoEm: expect.any(Date),
      },
    ]);
    expect(lido.locais.map((l) => l.id).sort()).toEqual([L1, L2].sort());
    const doOutro = await porta.noTenant(T2, (s) => s.hoteis());
    expect(doOutro.map((h) => h.id)).toEqual([HB]);
  });

  it('ativos sem baixa antes de desde; a garantia como o dia em UTC', async () => {
    const ativos = await porta.noTenant(T, (s) => s.ativos(agora, desde));
    expect(ativos.map((a) => a.id).sort()).toEqual([A.emUso, A.baixadoNaJanela].sort());
    expect(ativos.find((a) => a.id === A.emUso)).toMatchObject({
      hotelId: H1,
      fabricante: 'Marca',
      modelo: 'X1',
      criticidade: 4,
      garantiaAte: new Date('2026-01-31T00:00:00Z'),
      desativadoEm: null,
    });
    const dia = (d: Date) => d.toISOString().slice(0, 10);
    expect(ativos.find((a) => a.id === A.emUso)?.preventivas).toEqual([
      {
        dataPrevista: dia(antes(60)),
        transicoes: [{ para: 'concluida', quando: antes(55) }],
      },
      { dataPrevista: dia(antes(30)), transicoes: [] },
    ]);
    expect(ativos.find((a) => a.id === A.baixadoNaJanela)?.preventivas).toEqual([]);
  });

  it('chamados abertos depois de desde ou com transição de OS depois dele, com a OS e as transições', async () => {
    const chamados = await porta.noTenant(T, (s) => s.chamados(agora, desde));
    expect(chamados.map((c) => c.id).sort()).toEqual(
      [C.recente, C.antigoComTransicao, C.canceladoSemOs].sort(),
    );
    const recente = chamados.find((c) => c.id === C.recente);
    expect(recente).toMatchObject({
      hotelId: H1,
      localId: L1,
      ativoId: A.emUso,
      estado: 'concluido',
      impactoHospede: true,
      os: [
        {
          estado: 'concluida',
          executadoPor: 'equipe_interna',
          fornecedorId: null,
          custoInformado: 123.45,
          codigoFalha: null,
          transicoes: [{ acao: 'concluir', para: 'concluida', quando: expect.any(Date) }],
        },
      ],
    });
    expect(chamados.find((c) => c.id === C.canceladoSemOs)?.os).toEqual([]);
    // Recalculando um dia antes da conclusão, a transição de 9 dias atrás não traz o chamado antigo.
    const noPassado = await porta.noTenant(T, (s) => s.chamados(antes(25), antes(390)));
    expect(noPassado.map((c) => c.id)).toEqual([]);
  });

  it('insights abertos e o último encerrado de cada família; o maior cálculo do dia', async () => {
    const [insights, calculos] = await porta.noTenant(T, async (s) => [
      await s.insights(),
      await s.calculosDoDia('2026-09-01'),
    ]);
    expect(insights.map((i) => i.id).sort()).toEqual([I.aberto, I.novo].sort());
    expect(insights.find((i) => i.id === I.novo)).toMatchObject({
      familia: 'f-fechada',
      hotelIds: [H1],
      estado: 'descartado',
      motivoDeDescarte: 'nao_relevante',
      encerradoEm: expect.any(Date),
    });
    expect(calculos).toEqual(new Map([[A.emUso, 2]]));
  });

  it('grava métrica, abre e atualiza insight com auditoria e evento', async () => {
    const metrica: MetricaDoJob = {
      dia: '2026-09-02',
      ativoId: A.emUso,
      hotelId: H1,
      calculo: 1,
      recalculo: false,
      reincidencia: 40,
      atencao: 75,
      faixaAtencao: 'alta_atencao',
      versaoFormulaReincidencia: 1,
      versaoFormulaAtencao: 2,
      versaoPolitica: 'padrao',
      detalheReincidencia: { chave: 'reincidencia' },
      detalheAtencao: { chave: 'atencao_ativo' },
    };
    const familia = `atencao_ativo|ativoId=${A.emUso}|hotelId=${H1}`;
    const { id } = await porta.noTenant(T, async (s) => {
      await s.gravarMetricas([metrica]);
      const aberto = await s.abrirInsight({
        tipo: 'atencao_ativo',
        familia,
        chave: chave(familia, [H1]),
        hotelId: H1,
        bandeiraId: null,
        hotelIds: [H1],
        escopo: { ativoId: A.emUso, hotelId: H1 },
        faixa: 'alta_atencao',
        valor: 75,
        versaoScore: 2,
        detalhe: { chave: 'atencao_ativo' },
        evidencia: { corretivaIds: [C.recente] },
        anteriorId: null,
        em: agora,
      });
      await s.atualizarInsight({
        insightId: aberto.id,
        faixa: 'critico',
        valor: 90,
        versaoScore: 2,
        detalhe: { chave: 'atencao_ativo', valor: 90 },
        evidencia: { corretivaIds: [C.recente] },
        subiuDeFaixa: true,
        em: agora,
      });
      await s.registrarExecucao({
        disparadoPor: 'cron',
        dia: '2026-09-02',
        recalculo: false,
        ativos: 1,
        metricasGravadas: 1,
        metricasJaGravadas: 0,
        insightsAbertos: 1,
        insightsAtualizados: 1,
        insightsIgnorados: 0,
        textosApagados: 0,
        versoesDeFormula: { reincidencia: 1, atencao: 2, sistemico: 2 },
        versoesDePolitica: { [H1]: 'padrao' },
      });
      return aberto;
    });

    const m = await q(
      `select calculo, recalculo, atencao, faixa_atencao, detalhe_atencao from app.metrica_ativo_diaria
       where tenant_id = $1 and dia = '2026-09-02'`,
      [T],
    );
    expect(m.rows).toEqual([
      {
        calculo: 1,
        recalculo: false,
        atencao: 75,
        faixa_atencao: 'alta_atencao',
        detalhe_atencao: { chave: 'atencao_ativo' },
      },
    ]);
    const i = await q(
      `select estado, faixa, valor, versao, chave, evidencia from app.insight where id = $1`,
      [id],
    );
    expect(i.rows[0]).toEqual({
      estado: 'novo',
      faixa: 'critico',
      valor: 90,
      versao: 2,
      chave: chave(familia, [H1]),
      evidencia: { corretivaIds: [C.recente] },
    });
    const auditoria = await q(
      `select entidade, acao, usuario_id, hotel_id, depois from app.auditoria where tenant_id = $1 order by em, acao`,
      [T],
    );
    // Sem hotel_id: só o Admin do grupo lê pelo banco (Cesar, 10/10/2026).
    expect(
      auditoria.rows.map((a) => [a.entidade, a.acao, a.usuario_id, a.hotel_id]).sort(),
    ).toEqual(
      [
        ['insight', 'abrir', null, null],
        ['insight', 'atualizar_deteccao', null, null],
        ['job_inteligencia', 'calcular_dia', null, null],
      ].sort(),
    );
    // Quem disparou e as versões ficam no registro da execução.
    expect(auditoria.rows.find((a) => a.entidade === 'job_inteligencia')?.depois).toMatchObject({
      disparadoPor: 'cron',
      dia: '2026-09-02',
      metricasGravadas: 1,
      versoesDeFormula: { reincidencia: 1, atencao: 2, sistemico: 2 },
      versoesDePolitica: { [H1]: 'padrao' },
    });
    const eventos = await q(
      `select tipo, registro_id from app.evento_dominio where tenant_id = $1 order by tipo`,
      [T],
    );
    expect(eventos.rows).toEqual([
      { tipo: 'insight.aberto', registro_id: id },
      { tipo: 'insight.subiu_de_faixa', registro_id: id },
    ]);
  });

  it('sinal do hóspede: as reclamações de manutenção com categoria e a retenção do texto, só no tenant', async () => {
    await q(
      `insert into app.categoria_ativo (id, tenant_id, chave_padrao) values ($1, $2, 'hidraulica')`,
      [CAT, T],
    );
    const sinal = (
      id: string,
      tenant: string,
      hotel: string,
      quem: string,
      ocorrido: Date,
      c: { manutencao: boolean | null; categoria: string | null; uh: string | null },
      texto: string | null,
      apagado: Date | null = null,
    ) =>
      q(
        `insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em,
           texto, manutencao, categoria_id, uh_id, classificado_em, classificado_por, texto_apagado_em,
           importado_por)
         values ($1, $2, $3, $4, 'google', $14, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          id,
          tenant,
          hotel,
          randomUUID(),
          ocorrido,
          texto,
          c.manutencao,
          c.categoria,
          c.uh,
          c.manutencao === null ? null : antes(1),
          c.manutencao === null ? null : quem,
          apagado,
          quem,
          // O código externo é o id em texto: o mesmo parâmetro não pode ser uuid e text.
          id,
        ],
      );
    const manut = { manutencao: true, categoria: CAT, uh: L1 };
    await sinal(S.recente, T, H1, U, antes(5), manut, 'Água fria');
    await sinal(S.semCategoria, T, H1, U, antes(4), { ...manut, categoria: null }, 'Sem categoria');
    await sinal(
      S.fora,
      T,
      H1,
      U,
      antes(3),
      { manutencao: false, categoria: null, uh: null },
      'Café frio',
    );
    await sinal(S.velho, T, H1, U, antes(400), manut, 'Antigo');
    await sinal(S.apagado, T, H1, U, antes(500), manut, null, antes(100));
    const nada = { manutencao: null, categoria: null, uh: null };
    await sinal(S.outroTenant, T2, HB, UB, antes(400), nada, 'Do outro tenant');

    const apagados = await porta.noTenant(T, async (s) => {
      expect(await s.reclamacoes(agora, antes(14))).toEqual([
        { id: S.recente, hotelId: H1, categoriaId: CAT, uhId: L1, ocorridoEm: antes(5) },
      ]);
      expect((await s.reclamacoes(agora, antes(450))).map((r) => r.id).sort()).toEqual(
        [S.recente, S.velho].sort(),
      );
      return s.apagarTextos(antes(365), agora);
    });
    expect(apagados).toBe(1);
    const linhas = await q(
      `select id, texto, texto_apagado_em, versao, manutencao, categoria_id from app.sinal_hospede
        where tenant_id = any($1::uuid[])`,
      [[T, T2]],
    );
    const porId = new Map(linhas.rows.map((r) => [r.id as string, r]));
    expect(porId.get(S.velho)).toMatchObject({
      texto: null,
      texto_apagado_em: agora,
      versao: 2,
      manutencao: true,
      categoria_id: CAT,
    });
    expect(porId.get(S.recente)).toMatchObject({ texto: 'Água fria', versao: 1 });
    expect(porId.get(S.apagado)).toMatchObject({ texto: null, versao: 1 });
    expect(porId.get(S.outroTenant)).toMatchObject({ texto: 'Do outro tenant', versao: 1 });
  });

  it('falha no meio: nada do dia fica gravado', async () => {
    const metrica: MetricaDoJob = {
      dia: '2026-09-03',
      ativoId: A.emUso,
      hotelId: H1,
      calculo: 1,
      recalculo: false,
      reincidencia: null,
      atencao: null,
      faixaAtencao: 'dados_insuficientes',
      versaoFormulaReincidencia: 1,
      versaoFormulaAtencao: 2,
      versaoPolitica: 'padrao',
      detalheReincidencia: {},
      detalheAtencao: {},
    };
    await expect(
      porta.noTenant(T, async (s) => {
        await s.gravarMetricas([metrica]);
        // A mesma linha de novo: o índice único recusa, e a transação inteira volta.
        await s.gravarMetricas([metrica]);
      }),
    ).rejects.toMatchObject({ code: '23505' });
    const m = await q(
      `select count(*)::int as n from app.metrica_ativo_diaria where tenant_id = $1 and dia = '2026-09-03'`,
      [T],
    );
    expect(m.rows[0].n).toBe(0);
  });

  it('não grava em outro tenant: a métrica com hotel de A na sessão de B é recusada', async () => {
    await expect(
      porta.noTenant(T2, (s) =>
        s.gravarMetricas([
          {
            dia: '2026-09-04',
            ativoId: A.emUso,
            hotelId: H1,
            calculo: 1,
            recalculo: false,
            reincidencia: null,
            atencao: null,
            faixaAtencao: 'dados_insuficientes',
            versaoFormulaReincidencia: 1,
            versaoFormulaAtencao: 2,
            versaoPolitica: 'padrao',
            detalheReincidencia: {},
            detalheAtencao: {},
          },
        ]),
      ),
    ).rejects.toBeTruthy();
  });
});
