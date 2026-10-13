// Geração da OS preventiva (fase 1b, PV3; ADR-041) contra Postgres real (na
// CI, o Supabase do runner), papel hk_worker, uma transação por hotel:
//   - o plano por categoria gera uma OS por ativo, atribuída, sem autor, na
//     situação do estado atribuida, com a cópia do plano e do checklist, a
//     transição gerar sem usuário, a auditoria e o evento os.atribuida; no
//     hotel arrendado, com a marca de quem responde pela categoria do ativo;
//   - o plano com técnico desativado não gera; o hotel em implantação e o
//     outro tenant não são tocados;
//   - a segunda rodada no mesmo dia não duplica;
//   - duas rodadas ao mesmo tempo, na ocorrência seguinte, gravam uma OS por
//     ativo (a trava do hotel e o índice único).
// As datas do ativo são fixas: o teste não depende do relógio do runner.
//
//   HK_TESTE_URL_WORKER, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { type ResultadoDaGeracao, criarGeracaoDePreventivas } from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AcessoBanco, criarAcessoBanco, criarPortaGeracaoPreventiva } from '../src/index';

const URL_WORKER = process.env.HK_TESTE_URL_WORKER;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_WORKER && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_WORKER/DONO.');
}

// 17:00 em São Paulo, 13/10: o dia da ocorrência mensal que começou em 13/09.
const AGORA = new Date('2026-10-13T20:00:00Z');
const MES_SEGUINTE = new Date('2026-11-13T20:00:00Z');
const T = randomUUID();
const TB = randomUUID();
const H1 = randomUUID();
const H2 = randomUUID();
const HB = randomUUID();
const L = { [H1]: randomUUID(), [H2]: randomUUID(), [HB]: randomUUID() };
const TECNICO = randomUUID();
const DESATIVADO = randomUUID();
const TECNICO_B = randomUUID();
const CAT = randomUUID();
const CAT_B = randomUUID();
const MODELO = randomUUID();
const ATIVO = { a1: randomUUID(), a2: randomUUID(), h2: randomUUID(), b: randomUUID() };
const PLANO = {
  categoria: randomUUID(),
  desativado: randomUUID(),
  implantacao: randomUUID(),
  b: randomUUID(),
};
const SITUACAO = { [T]: randomUUID(), [TB]: randomUUID() };

const vazio = (): ResultadoDaGeracao['puladas'] => ({
  ja_gerada: 0,
  os_anterior_aberta: 0,
  sem_responsavel: 0,
  sem_ativo: 0,
  ativo_posterior: 0,
});

describe.skipIf(!temBanco)('geração da OS preventiva (hk_worker)', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  const rodar = (agora: Date) =>
    criarGeracaoDePreventivas({
      geracao: criarPortaGeracaoPreventiva(banco),
      relogio: { agora: () => agora },
    })(T);

  const daOcorrencia = async (data: string) =>
    (
      await dono.query<{
        ativo_id: string;
        estado: string;
        criado_por: string | null;
        local_id: string;
        tecnico_id: string | null;
        situacao_id: string;
        responsavel_arrendamento: string | null;
        plano_aplicado: Record<string, unknown>;
      }>(
        `select ativo_id, estado, criado_por, local_id, tecnico_id, situacao_id, responsavel_arrendamento,
                plano_aplicado
         from app.os where plano_id = $1 and data_prevista = $2 order by ativo_id`,
        [PLANO.categoria, data],
      )
    ).rows;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    const q = (sql: string, params: unknown[]) => dono.query(sql, params);
    await q(`insert into app.tenant (id, nome) values ($1, 'Grupo A'), ($2, 'Grupo B')`, [T, TB]);
    await q(
      `insert into app.hotel (id, tenant_id, nome, fuso, status, modelo_contratual) values
         ($1, $4, 'Hotel arrendado', 'America/Sao_Paulo', 'ativo', 'arrendado'),
         ($2, $4, 'Hotel em implantação', 'America/Sao_Paulo', 'em_implantacao', null),
         ($3, $5, 'Hotel B', 'America/Sao_Paulo', 'ativo', null)`,
      [H1, H2, HB, T, TB],
    );
    for (const [h, t] of [
      [H1, T],
      [H2, T],
      [HB, TB],
    ] as const) {
      await q(
        `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
         values ($1, $2, $3, 'area_comum', 'Casa de máquinas', 'casa de maquinas', 'ativo')`,
        [L[h], t, h],
      );
    }
    for (const [u, t, ativo] of [
      [TECNICO, T, true],
      [DESATIVADO, T, false],
      [TECNICO_B, TB, true],
    ] as const) {
      await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@hubkeep.invalid`]);
      await q(
        `insert into app.membro (tenant_id, usuario_id, nome, email, ativo) values ($1, $2, 'Pessoa', $3, $4)`,
        [t, u, `${u}@hubkeep.invalid`, ativo],
      );
      await q(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, concedido_por)
         values ($1, $2, $3, 'tecnico', 'grupo', $3)`,
        [randomUUID(), t, u],
      );
    }
    for (const [t, id] of Object.entries(SITUACAO)) {
      await q(
        `insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor)
         values ($1, $2, 'os', 'atribuida', 'os_atribuida', 10, '#2563eb')`,
        [id, t],
      );
    }
    await q(
      `insert into app.categoria_ativo (id, tenant_id, chave_padrao) values
         ($1, $3, 'ar_condicionado'), ($2, $4, 'ar_condicionado')`,
      [CAT, CAT_B, T, TB],
    );
    for (const [id, t, h, cat] of [
      [ATIVO.a1, T, H1, CAT],
      [ATIVO.a2, T, H1, CAT],
      [ATIVO.h2, T, H2, CAT],
      [ATIVO.b, TB, HB, CAT_B],
    ] as const) {
      await q(
        `insert into app.ativo (id, tenant_id, hotel_id, local_id, categoria_id, codigo_qr, nome, busca, criado_em)
         values ($1, $2, $3, $4, $5, $6, 'Split', 'split', '2026-01-01T12:00:00Z')`,
        [id, t, h, L[h], cat, `Q${id.slice(0, 8)}`],
      );
    }
    await q(
      `insert into app.checklist_modelo (id, tenant_id, categoria_id, nomes, itens, versao, ativa)
       values ($1, $2, $3, '{"pt-BR": "Inspeção do ar-condicionado"}', '[]', 2, true)`,
      [MODELO, T, CAT],
    );
    // A matriz do arrendado no grupo: o ar-condicionado é do locador.
    await q(
      `insert into app.politica (id, tenant_id, escopo_tipo, hotel_id, chave, valor, atualizado_por)
       values ($1, $2, 'grupo', null, 'hotel.matriz_arrendamento', $3, $4)`,
      [randomUUID(), T, JSON.stringify({ [CAT]: 'locador' }), TECNICO],
    );
    for (const [id, t, h, ativoId, categoriaId, tecnico, modelo] of [
      [PLANO.categoria, T, H1, null, CAT, TECNICO, MODELO],
      [PLANO.desativado, T, H1, ATIVO.a1, null, DESATIVADO, null],
      [PLANO.implantacao, T, H2, ATIVO.h2, null, TECNICO, null],
      [PLANO.b, TB, HB, ATIVO.b, null, TECNICO_B, null],
    ] as const) {
      await q(
        `insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, categoria_id, nome, intervalo, unidade,
           inicio, checklist_modelo_id, tecnico_id, situacao, criado_por)
         values ($1, $2, $3, $4, $5, 'Limpeza do filtro', 1, 'mes', '2026-09-13', $6, $7, 'ativo', $7)`,
        [id, t, h, ativoId, categoriaId, modelo, tecnico],
      );
    }

    banco = await criarAcessoBanco({ worker: { url: URL_WORKER ?? '', max: 2 } });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [T, TB]) {
      for (const tabela of [
        'app.evento_dominio',
        'app.auditoria',
        'app.os_checklist',
        'app.os_transicao',
        'app.os',
        'app.plano_preventivo',
        'app.politica',
        'app.checklist_modelo',
        'app.ativo',
        'app.categoria_ativo',
        'app.situacao',
        'app.atribuicao_escopo',
        'app.local',
        'app.hotel',
        'app.membro',
      ]) {
        await dono.query(`delete from ${tabela} where tenant_id = $1`, [t]);
      }
      await dono.query(`delete from app.tenant where id = $1`, [t]);
    }
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [
      [TECNICO, DESATIVADO, TECNICO_B],
    ]);
  });

  it('gera uma OS por ativo da categoria, sem autor, com as cópias, a marca, a auditoria e o evento', async () => {
    expect(await rodar(AGORA)).toEqual({
      hoteis: 1,
      planos: 2,
      geradas: 2,
      puladas: { ...vazio(), sem_responsavel: 1 },
      falhas: [],
    });
    const geradas = await daOcorrencia('2026-10-13');
    expect(geradas.map((o) => o.ativo_id)).toEqual([ATIVO.a1, ATIVO.a2].sort());
    for (const o of geradas) {
      expect(o).toMatchObject({
        estado: 'atribuida',
        criado_por: null,
        local_id: L[H1],
        tecnico_id: TECNICO,
        situacao_id: SITUACAO[T],
        responsavel_arrendamento: 'locador',
        plano_aplicado: {
          planoId: PLANO.categoria,
          nome: 'Limpeza do filtro',
          versao: 1,
          intervalo: 1,
          unidade: 'mes',
        },
      });
    }
    const porOs = await dono.query<{
      transicoes: string;
      checklist: string;
      auditoria: string;
      eventos: string;
    }>(
      `select
         (select string_agg(t.acao || ':' || coalesce(t.usuario_id::text, '-'), ',')
            from app.os_transicao t where t.os_id = o.id) as transicoes,
         (select k.modelo_id || ':' || k.modelo_versao || ':' || coalesce(k.criado_por::text, '-')
            from app.os_checklist k where k.os_id = o.id) as checklist,
         (select string_agg(a.acao || ':' || coalesce(a.usuario_id::text, '-'), ',')
            from app.auditoria a where a.tenant_id = o.tenant_id and a.registro_id = o.id) as auditoria,
         (select string_agg(e.tipo || ':' || (e.payload ->> 'planoId'), ',')
            from app.evento_dominio e where e.tenant_id = o.tenant_id and e.registro_id = o.id) as eventos
       from app.os o where o.plano_id = $1`,
      [PLANO.categoria],
    );
    expect(porOs.rows).toHaveLength(2);
    for (const r of porOs.rows) {
      expect(r).toEqual({
        transicoes: 'gerar:-',
        checklist: `${MODELO}:2:-`,
        auditoria: 'gerar:-',
        eventos: `os.atribuida:${PLANO.categoria}`,
      });
    }
  });

  it('o hotel em implantação, o plano sem responsável válido e o outro tenant não geram', async () => {
    const outras = await dono.query<{ n: number }>(
      `select count(*)::int as n from app.os where plano_id <> $1 and tenant_id = any($2::uuid[])`,
      [PLANO.categoria, [T, TB]],
    );
    expect(outras.rows[0]?.n).toBe(0);
  });

  it('a segunda rodada no mesmo dia não duplica', async () => {
    expect(await rodar(AGORA)).toMatchObject({
      geradas: 0,
      puladas: { ...vazio(), ja_gerada: 2, sem_responsavel: 1 },
    });
    expect(await daOcorrencia('2026-10-13')).toHaveLength(2);
  });

  it('a OS anterior aberta segura a seguinte; concluída, duas rodadas ao mesmo tempo gravam uma por ativo', async () => {
    expect(await rodar(MES_SEGUINTE)).toMatchObject({
      geradas: 0,
      puladas: { ...vazio(), os_anterior_aberta: 2, sem_responsavel: 1 },
    });
    await dono.query(`update app.os set estado = 'concluida' where plano_id = $1`, [
      PLANO.categoria,
    ]);
    const [a, b] = await Promise.all([rodar(MES_SEGUINTE), rodar(MES_SEGUINTE)]);
    expect((a?.geradas ?? 0) + (b?.geradas ?? 0)).toBe(2);
    expect([...(a?.falhas ?? []), ...(b?.falhas ?? [])]).toEqual([]);
    expect(await daOcorrencia('2026-11-13')).toHaveLength(2);
  });
});
