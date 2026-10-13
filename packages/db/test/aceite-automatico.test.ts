// Aceite automático (fase 1c, M5; ADR-044) contra Postgres real (na CI, o
// Supabase do runner), papel hk_worker, um tenant por transação:
//   - a OS concluída há mais de 7 dias, com a política ligada, vai para aceita
//     e o chamado para concluído, com a transição aceitar_automatico sem
//     usuário, a auditoria sem autor e o evento os.aceita com automatico;
//   - a concluída há 2 dias e a de quem abriu e executa ficam aguardando;
//   - a segunda rodada não aceita de novo; o outro tenant não é tocado.
//
//   HK_TESTE_URL_WORKER, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarAceiteAutomatico } from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AcessoBanco, criarAcessoBanco, criarPortaAceiteAutomatico } from '../src/index';

const URL_WORKER = process.env.HK_TESTE_URL_WORKER;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_WORKER && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_WORKER/DONO.');
}

const DIA = 24 * 3_600_000;
const AGORA = new Date('2026-10-13T20:00:00Z');
const T = randomUUID();
const TB = randomUUID();
const H = { [T]: randomUUID(), [TB]: randomUUID() };
const L = { [T]: randomUUID(), [TB]: randomUUID() };
const GERENTE = { [T]: randomUUID(), [TB]: randomUUID() };
const TECNICO = { [T]: randomUUID(), [TB]: randomUUID() };
const C = {
  vencida: randomUUID(),
  recente: randomUUID(),
  propria: randomUUID(),
  outro: randomUUID(),
};
const OS = {
  vencida: randomUUID(),
  recente: randomUUID(),
  propria: randomUUID(),
  outro: randomUUID(),
};
const antes = (dias: number) => new Date(AGORA.getTime() - dias * DIA);

describe.skipIf(!temBanco)('aceite automático (hk_worker)', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let rodar: ReturnType<typeof criarAceiteAutomatico>;
  const situacao: Record<string, Record<string, string>> = {};

  const estado = async (tabela: 'app.os' | 'app.chamado', id: string) =>
    (
      await dono.query<{ estado: string; versao: number }>(
        `select estado, versao from ${tabela} where id = $1`,
        [id],
      )
    ).rows[0];

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    for (const [t, nome] of [
      [T, 'A'],
      [TB, 'B'],
    ] as const) {
      const h = H[t] as string;
      const gerente = GERENTE[t] as string;
      const tecnico = TECNICO[t] as string;
      await dono.query(`insert into app.tenant (id, nome) values ($1, $2)`, [t, `Grupo ${nome}`]);
      await dono.query(
        `insert into app.hotel (id, tenant_id, nome, fuso, status)
         values ($1, $2, 'Hotel', 'America/Sao_Paulo', 'ativo')`,
        [h, t],
      );
      await dono.query(
        `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
         values ($1, $2, $3, 'area_comum', 'Lobby', 'lobby', 'ativo')`,
        [L[t], t, h],
      );
      for (const u of [gerente, tecnico]) {
        await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
          u,
          `${u}@hubkeep.invalid`,
        ]);
        await dono.query(
          `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, 'Pessoa', $3)`,
          [t, u, `${u}@hubkeep.invalid`],
        );
      }
      const p = randomUUID();
      await dono.query(
        `insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values ($1, $2, 'media', 30, 20)`,
        [p, t],
      );
      situacao[t] = {
        'chamado.aguardando_aceite': randomUUID(),
        'chamado.concluido': randomUUID(),
        'os.concluida': randomUUID(),
        'os.aceita': randomUUID(),
      };
      for (const [chave, id] of Object.entries(situacao[t] ?? {})) {
        const [entidade, est] = chave.split('.');
        await dono.query(
          `insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor)
           values ($1, $2, $3, $4, $5, 10, '#2563eb')`,
          [id, t, entidade, est, `${entidade}_${est}`],
        );
      }
      await dono.query(
        `insert into app.politica (id, tenant_id, escopo_tipo, hotel_id, chave, valor, atualizado_por)
         values ($1, $2, 'grupo', null, 'os.aceite_automatico', '{"ligado": true, "dias": 7}', $3)`,
        [randomUUID(), t, gerente],
      );
      const concluida = async (
        chamado: string,
        os: string,
        abertoPor: string,
        concluidaEm: Date,
      ) => {
        await dono.query(
          `insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id,
             prioridade_id, politica_aplicada, aberto_por)
           values ($1, $2, $3, $4, 'chamado', 'chamado', 'aguardando_aceite', $5, $6, '{}', $7)`,
          [chamado, t, h, L[t], situacao[t]?.['chamado.aguardando_aceite'], p, abertoPor],
        );
        await dono.query(
          `insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado,
             situacao_id, tecnico_id, criado_por)
           values ($1, $2, $3, $4, $5, $6, 'concluida', $7, $8, $6)`,
          [os, t, h, chamado, L[t], abertoPor, situacao[t]?.['os.concluida'], tecnico],
        );
        await dono.query(
          `insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, quando, usuario_id)
           values ($1, $2, $3, $4, 'concluir', 'em_execucao', 'concluida', $5, $6)`,
          [randomUUID(), t, h, os, concluidaEm, tecnico],
        );
      };
      if (t === T) {
        await concluida(C.vencida, OS.vencida, gerente, antes(8));
        await concluida(C.recente, OS.recente, gerente, antes(2));
        // Quem abriu é o próprio técnico que executa: fica de fora (pergunta 16).
        await concluida(C.propria, OS.propria, tecnico, antes(8));
      } else {
        await concluida(C.outro, OS.outro, gerente, antes(8));
      }
    }

    banco = await criarAcessoBanco({ worker: { url: URL_WORKER ?? '', max: 2 } });
    rodar = criarAceiteAutomatico({
      aceite: criarPortaAceiteAutomatico(banco),
      relogio: { agora: () => AGORA },
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [T, TB]) {
      for (const tabela of [
        'app.evento_dominio',
        'app.auditoria',
        'app.os_transicao',
        'app.os',
        'app.chamado',
        'app.politica',
        'app.situacao',
        'app.prioridade',
        'app.local',
        'app.hotel',
        'app.membro',
      ]) {
        await dono.query(`delete from ${tabela} where tenant_id = $1`, [t]);
      }
      await dono.query(`delete from app.tenant where id = $1`, [t]);
    }
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [
      [...Object.values(GERENTE), ...Object.values(TECNICO)],
    ]);
  });

  it('a OS vencida é aceita sem autor, com o chamado concluído, a auditoria e o evento', async () => {
    expect(await rodar(T)).toEqual({ avaliadas: 3, aceitas: 1 });
    expect(await estado('app.os', OS.vencida)).toEqual({ estado: 'aceita', versao: 2 });
    expect(await estado('app.chamado', C.vencida)).toEqual({ estado: 'concluido', versao: 2 });
    const situacoes = await dono.query<{ os: string; chamado: string }>(
      `select o.situacao_id as os, c.situacao_id as chamado
       from app.os o join app.chamado c on c.id = o.chamado_id where o.id = $1`,
      [OS.vencida],
    );
    expect(situacoes.rows[0]).toEqual({
      os: situacao[T]?.['os.aceita'],
      chamado: situacao[T]?.['chamado.concluido'],
    });
    const transicoes = await dono.query<{ acao: string; usuario_id: string | null }>(
      `select acao, usuario_id from app.os_transicao where os_id = $1 order by quando`,
      [OS.vencida],
    );
    expect(transicoes.rows).toEqual([
      { acao: 'concluir', usuario_id: TECNICO[T] },
      { acao: 'aceitar_automatico', usuario_id: null },
    ]);
    const auditoria = await dono.query<{ acao: string; usuario_id: string | null }>(
      `select acao, usuario_id from app.auditoria where tenant_id = $1 and registro_id = $2`,
      [T, OS.vencida],
    );
    expect(auditoria.rows).toEqual([{ acao: 'aceitar_automatico', usuario_id: null }]);
    const eventos = await dono.query<{ payload: Record<string, unknown> }>(
      `select payload from app.evento_dominio
       where tenant_id = $1 and tipo = 'os.aceita' and registro_id = $2`,
      [T, OS.vencida],
    );
    expect(eventos.rows).toEqual([
      { payload: { hotelId: H[T], chamadoId: C.vencida, automatico: true } },
    ]);
  });

  it('a concluída há 2 dias e a de quem abriu e executa seguem aguardando aceite', async () => {
    expect(await estado('app.os', OS.recente)).toEqual({ estado: 'concluida', versao: 1 });
    expect(await estado('app.os', OS.propria)).toEqual({ estado: 'concluida', versao: 1 });
  });

  it('a segunda rodada não aceita de novo; o outro tenant não é tocado', async () => {
    expect(await rodar(T)).toEqual({ avaliadas: 2, aceitas: 0 });
    expect(await estado('app.os', OS.outro)).toEqual({ estado: 'concluida', versao: 1 });
    expect(await estado('app.chamado', C.outro)).toEqual({
      estado: 'aguardando_aceite',
      versao: 1,
    });
  });
});
