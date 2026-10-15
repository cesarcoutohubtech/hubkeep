// Comunicação (1c, item 5; ADR-046) contra Postgres real (na CI, o Supabase
// do runner): o aviso de SLA pelo outbox, com o hk_worker.
//   - sem provedor (C1), cada pessoa do nível fica registrada como
//     sem_provedor, e o membro inativo, como sem_endereco; o evento é
//     processado;
//   - com provedor, um e-mail por pessoa, no idioma dela, com o link do
//     chamado; o evento entregue de novo não manda o segundo e-mail;
//   - a contagem por destinatário e por dia (C8), pelo hk_app, é da gestão.
//
//   HK_TESTE_URL_WORKER, HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  type Manipulador,
  criarCasosDeUsoDeComunicacao,
  criarManipuladoresDeEventos,
} from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaComunicacao,
  criarPortasDeAplicacao,
  processarOutbox,
} from '../src/index';

const URL_WORKER = process.env.HK_TESTE_URL_WORKER;
const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_WORKER && URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_WORKER/APP/DONO.');
}

const TENANT = randomUUID();
const HOTEL = randomUUID();
const LOBBY = randomUUID();
const SITUACAO_CHAMADO = randomUUID();
const SITUACAO_OS = randomUUID();
const PRIORIDADE = randomUUID();
const CHAMADO = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  gestor: randomUUID(),
  tecnico: randomUUID(),
};
const relogio = { agora: () => new Date() };
const identidade = {
  garantirUsuario: async () => ({ usuarioId: 'x', criadoAgora: false }),
  removerUsuario: async () => undefined,
  vincularTenant: async () => undefined,
};
const envio = { enviarConvite: async () => ({ enviado: true }) };

describe.skipIf(!temBanco)('1c — aviso de SLA por e-mail pelo outbox', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let worker: AcessoBanco;
  let app: AcessoBanco;

  const aviso = async () => {
    const id = randomUUID();
    await dono.query(
      `insert into app.evento_dominio (id, tenant_id, tipo, entidade, registro_id, payload)
       values ($1, $2, 'chamado.sla_alerta', 'chamado', $3, $4)`,
      [
        id,
        TENANT,
        CHAMADO,
        JSON.stringify({
          hotelId: HOTEL,
          tipo: 'solucao_vencida',
          nivel: 'vencido',
          prazo: '2026-10-13T20:00:00.000Z',
          destinatarios: ['responsavel_da_os', 'gerente_hotel', 'gestor_csc'],
        }),
      ],
    );
    return id;
  };
  const envios = async (eventoId: string) =>
    Object.fromEntries(
      (
        await dono.query<{ usuario_id: string; situacao: string }>(
          `select usuario_id, situacao from app.envio_notificacao
           where tenant_id = $1 and evento_id = $2`,
          [TENANT, eventoId],
        )
      ).rows.map((r) => [r.usuario_id, r.situacao]),
    );
  const processado = async (eventoId: string) =>
    (
      await dono.query<{ p: boolean }>(
        `select processado_em is not null as p from app.evento_dominio where id = $1`,
        [eventoId],
      )
    ).rows[0]?.p;
  const manipuladores = (
    email: {
      enviar: (m: { para: string; assunto: string; texto: string }) => Promise<void>;
    } | null,
  ): Record<string, Manipulador> =>
    criarManipuladoresDeEventos({
      identidade,
      envio,
      comunicacao: {
        porta: criarPortaComunicacao(worker),
        email,
        urlDoSite: 'https://hubkeep.test',
        relogio,
      },
    });

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo Comunicação')`, [
      TENANT,
    ]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status)
       values ($1, $2, 'Hotel Centro', 'America/Sao_Paulo', 'ativo')`,
      [HOTEL, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
       values ($1, $2, $3, 'area_comum', 'Lobby', 'lobby', 'ativo')`,
      [LOBBY, TENANT, HOTEL],
    );
    for (const [nome, u] of Object.entries(U)) {
      await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
        u,
        `${nome}-${u}@hubkeep.invalid`,
      ]);
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email, ativo) values ($1, $2, $3, $4, $5)`,
        [TENANT, u, nome, `${nome}-${u}@hubkeep.invalid`, nome !== 'gestor'],
      );
    }
    await dono.query(
      `insert into app.preferencia_membro (tenant_id, usuario_id, idioma) values ($1, $2, 'en')`,
      [TENANT, U.gerente],
    );
    const atribuir = (usuario: string, papel: string, escopo: string, hotel: string | null) =>
      dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), TENANT, usuario, papel, escopo, hotel, U.admin],
      );
    await atribuir(U.admin, 'admin_grupo', 'grupo', null);
    await atribuir(U.gerente, 'gerente_hotel', 'hotel', HOTEL);
    await atribuir(U.gestor, 'gestor_csc', 'hotel', HOTEL);
    await atribuir(U.tecnico, 'tecnico', 'hotel', HOTEL);
    await dono.query(
      `insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
       ($1, $3, 'chamado', 'em_execucao', 'chamado_em_execucao', 30, '#2563eb'),
       ($2, $3, 'os', 'atribuida', 'os_atribuida', 10, '#2563eb')`,
      [SITUACAO_CHAMADO, SITUACAO_OS, TENANT],
    );
    await dono.query(
      `insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values ($1, $2, 'alta', 20, 30)`,
      [PRIORIDADE, TENANT],
    );
    await dono.query(
      `insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id,
                                prioridade_id, politica_aplicada, aberto_por)
       values ($1, $2, $3, $4, 'Elevador parado', 'elevador parado', 'em_execucao', $5, $6, '{}', $7)`,
      [CHAMADO, TENANT, HOTEL, LOBBY, SITUACAO_CHAMADO, PRIORIDADE, U.gerente],
    );
    await dono.query(
      `insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado,
                           situacao_id, tecnico_id, executado_por, criado_por)
       values ($1, $2, $3, $4, $5, $6, 'atribuida', $7, $8, 'equipe_interna', $6)`,
      [randomUUID(), TENANT, HOTEL, CHAMADO, LOBBY, U.gerente, SITUACAO_OS, U.tecnico],
    );
    worker = await criarAcessoBanco({ worker: { url: URL_WORKER ?? '', max: 3 } });
    app = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
  });

  afterAll(async () => {
    await worker?.encerrar();
    await app?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.envio_notificacao',
      'app.evento_dominio',
      'app.os',
      'app.chamado',
      'app.prioridade',
      'app.situacao',
      'app.atribuicao_escopo',
      'app.preferencia_membro',
      'app.local',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  it('sem provedor: nada sai; cada pessoa registrada, e o evento processado', async () => {
    const id = await aviso();
    const r = await processarOutbox(worker, TENANT, manipuladores(null));
    expect(r).toMatchObject({ processados: 1, falhas: 0 });
    expect(await processado(id)).toBe(true);
    expect(await envios(id)).toEqual({
      [U.tecnico]: 'sem_provedor',
      [U.gerente]: 'sem_provedor',
      [U.gestor]: 'sem_endereco',
    });
  });

  it('com provedor: um e-mail por pessoa, no idioma dela; entregue de novo, não repete', async () => {
    const enviados: { para: string; assunto: string; texto: string }[] = [];
    const email = {
      enviar: async (m: { para: string; assunto: string; texto: string }) => void enviados.push(m),
    };
    const id = await aviso();
    await processarOutbox(worker, TENANT, manipuladores(email));
    expect(enviados.map((e) => e.para).sort()).toEqual(
      [`gerente-${U.gerente}@hubkeep.invalid`, `tecnico-${U.tecnico}@hubkeep.invalid`].sort(),
    );
    expect(enviados.find((e) => e.para.startsWith('gerente-'))?.assunto).toBe(
      'Resolution overdue — Hotel Centro',
    );
    expect(enviados[0]?.texto).toContain(`https://hubkeep.test/chamados/${CHAMADO}`);
    expect(await envios(id)).toEqual({
      [U.tecnico]: 'enviado',
      [U.gerente]: 'enviado',
      [U.gestor]: 'sem_endereco',
    });

    // O worker caiu antes de marcar: o evento volta, e ninguém recebe de novo.
    await dono.query(`update app.evento_dominio set processado_em = null where id = $1`, [id]);
    await processarOutbox(worker, TENANT, manipuladores(email));
    expect(enviados).toHaveLength(2);
    expect(
      Number(
        (
          await dono.query<{ n: string }>(
            `select count(*) as n from app.envio_notificacao where evento_id = $1`,
            [id],
          )
        ).rows[0]?.n,
      ),
    ).toBe(3);
  });

  it('a contagem por destinatário e por dia é da gestão (C8)', async () => {
    const caso = criarCasosDeUsoDeComunicacao({
      comunicacao: criarPortaComunicacao(app),
      atribuicoes: criarPortasDeAplicacao(app).atribuicoes,
      relogio,
    });
    const agora = Date.now();
    const periodo = {
      de: new Date(agora - 86_400_000).toISOString(),
      ate: new Date(agora + 86_400_000).toISOString(),
    };
    const r = await caso.contagemDeEnvios({ usuarioId: U.admin, tenantId: TENANT }, periodo);
    // Somado por pessoa: perto da meia-noite UTC, os envios caem em dois dias.
    const porPessoa: Record<string, number> = {};
    for (const d of r.dias) porPessoa[d.usuarioId] = (porPessoa[d.usuarioId] ?? 0) + d.envios;
    expect(porPessoa).toEqual({ [U.tecnico]: 2, [U.gerente]: 2, [U.gestor]: 2 });
    expect(r.limite).toBe(30);
    await expect(
      caso.contagemDeEnvios({ usuarioId: U.tecnico, tenantId: TENANT }, periodo),
    ).rejects.toMatchObject({ codigo: 'envios_fora_do_papel' });
  });
});
