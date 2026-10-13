// Avisos de SLA em aberto (fase 1c; ADR-043, M4) contra Postgres real (na CI,
// o Supabase do runner), papel hk_app:
//   - o painel do Gerente traz o atendimento vencido pelo próprio prazo, sem
//     aviso gravado, e o em risco gravado para o prazo de agora; o aviso de
//     um prazo refeito não conta;
//   - a OS na pausa que parou o relógio congela a solução vencida;
//   - o Técnico do hotel não vê o painel e, na ficha, recebe a lista vazia;
//   - o hotel de outro tenant é não encontrado.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDeAvisosDeSla } from '@hubkeep/aplicacao';
import { HORARIO_PADRAO, SLA_PADRAO } from '@hubkeep/dominio';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaAvisosDeSla,
  criarPortaPrioridades,
  criarPortasDeAplicacao,
} from '../src/index';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const H = 3_600_000;
const AGORA = new Date('2026-10-13T20:00:00Z');
const em = (horas: number) => new Date(AGORA.getTime() + horas * H);
const T = randomUUID();
const H1 = randomUUID();
const L1 = randomUUID();
const U = { gerente: randomUUID(), tecnico: randomUUID() };
const C = {
  vencido: randomUUID(),
  emRisco: randomUUID(),
  refeito: randomUUID(),
  pausado: randomUUID(),
};
const CAT = randomUUID();
const OS = randomUUID();
const copia = {
  'chamado.sla': { ...SLA_PADRAO, porCategoria: { [CAT]: { pausa: true } } },
  'hotel.horario_atendimento': HORARIO_PADRAO,
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: T });

describe.skipIf(!temBanco)('avisos de SLA em aberto (hk_app)', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeAvisosDeSla>;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo dos avisos')`, [T]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status)
       values ($1, $2, 'Hotel', 'America/Sao_Paulo', 'ativo')`,
      [H1, T],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
       values ($1, $2, $3, 'area_comum', 'Lobby', 'lobby', 'ativo')`,
      [L1, T, H1],
    );
    for (const [nome, id] of Object.entries(U)) {
      await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
        id,
        `${id}@hubkeep.invalid`,
      ]);
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
        [T, id, nome, `${id}@hubkeep.invalid`],
      );
    }
    for (const [usuario, papel] of [
      [U.gerente, 'gerente_hotel'],
      [U.tecnico, 'tecnico'],
    ] as const) {
      await dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
         values ($1, $2, $3, $4, 'hotel', $5, $3)`,
        [randomUUID(), T, usuario, papel, H1],
      );
    }
    const prioridade = randomUUID();
    await dono.query(
      `insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values ($1, $2, 'urgente', 10, 40)`,
      [prioridade, T],
    );
    const situacao = { aberto: randomUUID(), em_execucao: randomUUID(), os: randomUUID() };
    await dono.query(
      `insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
       ($1, $4, 'chamado', 'aberto', 'chamado_aberto', 10, '#2563eb'),
       ($2, $4, 'chamado', 'em_execucao', 'chamado_em_execucao', 20, '#2563eb'),
       ($3, $4, 'os', 'pausada', 'os_pausada', 30, '#d97706')`,
      [situacao.aberto, situacao.em_execucao, situacao.os, T],
    );
    await dono.query(
      `insert into app.categoria_ativo (id, tenant_id, nomes) values ($1, $2, '{"pt-BR": "Elevadores"}')`,
      [CAT, T],
    );
    const abrir = (
      id: string,
      descricao: string,
      prazos: [Date, Date],
      estado: 'aberto' | 'em_execucao' = 'aberto',
    ) =>
      dono.query(
        `insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id,
           prioridade_id, politica_aplicada, aberto_por, categoria_id, prazo_atendimento, prazo_solucao)
         values ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          id,
          T,
          H1,
          L1,
          descricao,
          estado,
          situacao[estado],
          prioridade,
          JSON.stringify(copia),
          U.gerente,
          CAT,
          prazos[0],
          prazos[1],
        ],
      );
    const gravar = (chamado: string, tipo: string, prazo: Date) =>
      dono.query(
        `insert into app.sla_alerta (id, tenant_id, hotel_id, chamado_id, tipo, prazo, emitido_em)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), T, H1, chamado, tipo, prazo, em(-0.1)],
      );
    await abrir(C.vencido, 'vencido', [em(-1), em(3)]);
    await abrir(C.emRisco, 'em risco', [em(0.1), em(3)]);
    await gravar(C.emRisco, 'atendimento_em_risco', em(0.1));
    await abrir(C.refeito, 'refeito', [em(5), em(9)]);
    await gravar(C.refeito, 'atendimento_em_risco', em(0.2));
    // A OS do chamado pausado, na pausa "aguardando peça": o relógio parou.
    await abrir(C.pausado, 'pausado', [em(-3), em(-1)], 'em_execucao');
    await dono.query(
      `insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado,
         situacao_id, tecnico_id, criado_por)
       values ($1, $2, $3, $4, $5, $6, 'pausada', $7, $6, $6)`,
      [OS, T, H1, C.pausado, L1, U.gerente, situacao.os],
    );
    await dono.query(
      `insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, motivo_pausa, usuario_id)
       values ($1, $2, $3, $4, 'pausar', 'em_execucao', 'pausada', 'aguardando_peca', $5)`,
      [randomUUID(), T, H1, OS, U.gerente],
    );

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    casos = criarCasosDeUsoDeAvisosDeSla({
      avisos: criarPortaAvisosDeSla(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      prioridades: criarPortaPrioridades(banco),
      relogio: { agora: () => AGORA },
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const tabela of [
      'app.sla_alerta',
      'app.os_transicao',
      'app.os',
      'app.chamado',
      'app.categoria_ativo',
      'app.situacao',
      'app.prioridade',
      'app.atribuicao_escopo',
      'app.local',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${tabela} where tenant_id = $1`, [T]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [T]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
    await dono.end();
  });

  it('o painel do Gerente: o vencido pelo prazo, o em risco gravado, sem o refeito nem o pausado', async () => {
    const { chamados } = await casos.doHotel(ctx(U.gerente), H1);
    expect(chamados.map((c) => [c.chamadoId, c.avisos.map((a) => a.tipo)])).toEqual([
      [C.vencido, ['atendimento_vencido']],
      [C.emRisco, ['atendimento_em_risco']],
    ]);
    expect(chamados[1]?.avisos[0]?.prazo.toISOString()).toBe(em(0.1).toISOString());
  });

  it('o Técnico não vê o painel e, na ficha, recebe a lista vazia', async () => {
    await expect(casos.doHotel(ctx(U.tecnico), H1)).rejects.toMatchObject({
      codigo: 'avisos_sla_fora_do_escopo',
    });
    expect((await casos.doChamado(ctx(U.tecnico), C.vencido)).avisos).toEqual([]);
    expect((await casos.doChamado(ctx(U.gerente), C.vencido)).avisos.map((a) => a.tipo)).toEqual([
      'atendimento_vencido',
    ]);
  });

  it('o hotel de outro tenant é não encontrado', async () => {
    await expect(
      casos.doHotel({ usuarioId: U.gerente, tenantId: randomUUID() }, H1),
    ).rejects.toBeTruthy();
    await expect(casos.doHotel(ctx(U.gerente), randomUUID())).rejects.toMatchObject({
      codigo: 'hotel_nao_encontrado',
    });
  });
});
