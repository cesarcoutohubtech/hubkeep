// As ações na OS preventiva, sem chamado (fase 1b, PV3c; ADR-041), contra
// Postgres real (na CI, o Supabase do runner), papel hk_app:
//   - a fila do dia traz a preventiva só para o PWA que a entende, com o
//     plano, a data prevista, o ativo e o local da OS;
//   - o responsável inicia, pausa com motivo, retoma e conclui pela
//     sincronização, sem chamado para refletir;
//   - o Gerente aceita a concluída, com a versão do chamado nula, e cancela
//     outra; a auditoria guarda o estado do chamado nulo;
//   - a parada é recusada (parada_na_preventiva);
//   - a lista de OS traz a preventiva, com o plano, a data e o ativo, e a
//     leitura por id e os nomes da página da OS também (PV3c-2b).
// A OS preventiva é gravada pelo dono (o worker é testado em
// geracao-preventiva.test.ts), no formato do check os_de_um_tipo (0048).
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomInt, randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeConsultas,
  criarCasosDeUsoDeExecucao,
  criarCasosDeUsoDeSincronizacao,
  criarCasosDeUsoDeSituacoes,
  criarCasosDeUsoDeTriagem,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaConsultasDaCorretiva,
  criarPortaExecucao,
  criarPortaOperacoesOffline,
  criarPortaParadas,
  criarPortaPrioridades,
  criarPortaSituacoes,
  criarPortaTriagem,
  criarPortasDeAplicacao,
} from '../src/index';
import { semFeriadosOficiais } from './feriados-de-teste';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const TENANT = randomUUID();
const H1 = randomUUID();
const CASA_DE_MAQUINAS = randomUUID();
const CAT = randomUUID();
const ATIVO = randomUUID();
const PLANO = randomUUID();
const U = { admin: randomUUID(), gerente: randomUUID(), tecnico: randomUUID() };
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

/** Código de QR no formato do check ativo_codigo_qr_formato (Crockford, 10 caracteres). */
const codigoQr = () =>
  Array.from({ length: 10 }, () => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[randomInt(32)]).join('');

describe.skipIf(!temBanco)('PV3c — ações na OS preventiva', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let triagem: ReturnType<typeof criarCasosDeUsoDeTriagem>;
  let execucao: ReturnType<typeof criarCasosDeUsoDeExecucao>;
  let sincronizacao: ReturnType<typeof criarCasosDeUsoDeSincronizacao>;
  let consultas: ReturnType<typeof criarCasosDeUsoDeConsultas>;
  let datas = 0;

  /** Grava uma preventiva atribuída ao técnico, como o worker gravaria, e devolve o id. */
  async function preventiva(): Promise<string> {
    const id = randomUUID();
    datas += 1;
    const situacao = await dono.query<{ id: string }>(
      `select id from app.situacao where tenant_id = $1 and entidade = 'os' and estado = 'atribuida'
       order by ordem limit 1`,
      [TENANT],
    );
    await dono.query(
      `insert into app.os (id, tenant_id, hotel_id, local_id, plano_id, ativo_id, data_prevista,
         plano_aplicado, estado, situacao_id, tecnico_id)
       values ($1, $2, $3, $4, $5, $6, $7::date, $8, 'atribuida', $9, $10)`,
      [
        id,
        TENANT,
        H1,
        CASA_DE_MAQUINAS,
        PLANO,
        ATIVO,
        `2026-10-${String(datas).padStart(2, '0')}`,
        JSON.stringify({
          planoId: PLANO,
          nome: 'PMOC mensal',
          versao: 1,
          intervalo: 1,
          unidade: 'mes',
        }),
        situacao.rows[0]?.id,
        U.tecnico,
      ],
    );
    return id;
  }
  const operar = (
    tipo: 'os.iniciar' | 'os.pausar' | 'os.retomar' | 'os.concluir',
    osId: string,
    versao: number,
    extra: Record<string, unknown> = {},
  ) =>
    sincronizacao.receberOperacao(ctx(U.tecnico), {
      chave: randomUUID(),
      tipo,
      dados: { osId, versao, ...extra },
    });

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo PV3c')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, 'Hotel 1', 'UTC', 'ativo')`,
      [H1, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
       values ($1, $2, $3, 'area_comum', 'Casa de máquinas', 'casa de maquinas', 'ativo')`,
      [CASA_DE_MAQUINAS, TENANT, H1],
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
    await dono.query(
      `insert into app.categoria_ativo (id, tenant_id, chave_padrao) values ($1, $2, 'ar_condicionado')`,
      [CAT, TENANT],
    );
    await dono.query(
      `insert into app.ativo (id, tenant_id, hotel_id, local_id, categoria_id, codigo_qr, nome, busca)
       values ($1, $2, $3, $4, $5, $6, 'Chiller 1', 'chiller 1')`,
      [ATIVO, TENANT, H1, CASA_DE_MAQUINAS, CAT, codigoQr()],
    );
    await dono.query(
      `insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade,
         inicio, tecnico_id, situacao, criado_por)
       values ($1, $2, $3, $4, 'PMOC mensal', 1, 'mes', '2026-09-01', $5, 'ativo', $6)`,
      [PLANO, TENANT, H1, ATIVO, U.tecnico, U.gerente],
    );

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    const atribuicoes = criarPortasDeAplicacao(banco).atribuicoes;
    const situacoes = criarPortaSituacoes(banco);
    const prioridades = criarPortaPrioridades(banco);
    await criarCasosDeUsoDeSituacoes({
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
    }).instalarPadrao(ctx(U.admin));
    const portaTriagem = criarPortaTriagem(banco);
    triagem = criarCasosDeUsoDeTriagem({
      triagem: portaTriagem,
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
      feriadosOficiais: semFeriadosOficiais,
    });
    execucao = criarCasosDeUsoDeExecucao({
      execucao: criarPortaExecucao(banco),
      triagem: portaTriagem,
      situacoes,
      atribuicoes,
      relogio: relogioDoSistema,
      paradas: criarPortaParadas(banco),
      prioridades,
      feriadosOficiais: semFeriadosOficiais,
    });
    consultas = criarCasosDeUsoDeConsultas({ consultas: criarPortaConsultasDaCorretiva(banco) });
    sincronizacao = criarCasosDeUsoDeSincronizacao({
      operacoes: criarPortaOperacoesOffline(banco),
      ativos: {
        prepararCadastro: () => Promise.reject(new Error('fora do teste')),
        prepararAlteracao: () => Promise.reject(new Error('fora do teste')),
      },
      execucao,
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.operacao_offline',
      'app.os_transicao',
      'app.os',
      'app.plano_preventivo',
      'app.ativo',
      'app.categoria_ativo',
      'app.situacao',
      'app.prioridade',
      'app.atribuicao_escopo',
      'app.local',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  it('fila do dia: a preventiva só vem para quem a entende, com o plano, o ativo e o local', async () => {
    const osId = await preventiva();
    expect((await execucao.osDoDia(ctx(U.tecnico))).map((o) => o.id)).not.toContain(osId);
    const fila = await execucao.osDoDia(ctx(U.tecnico), { preventiva: true });
    expect(fila.find((o) => o.id === osId)).toMatchObject({
      estado: 'atribuida',
      versao: 1,
      chamado: null,
      preventiva: {
        planoId: PLANO,
        planoNome: 'PMOC mensal',
        ativoId: ATIVO,
        ativoNome: 'Chiller 1',
        localId: CASA_DE_MAQUINAS,
        localNome: 'Casa de máquinas',
      },
    });
    expect(fila.find((o) => o.id === osId)?.preventiva?.dataPrevista).toMatch(/^2026-10-\d{2}$/);
  });

  it('o responsável executa pela sincronização; o Gerente aceita, sem chamado para refletir', async () => {
    const osId = await preventiva();
    expect((await operar('os.iniciar', osId, 1)).resposta).toMatchObject({
      versao: 2,
      estado: 'em_execucao',
    });
    await operar('os.pausar', osId, 2, { motivo: 'aguardando_peca' });
    await operar('os.retomar', osId, 3);
    expect((await operar('os.concluir', osId, 4)).resposta).toMatchObject({
      versao: 5,
      estado: 'concluida',
    });
    await expect(triagem.aceitarOs(ctx(U.gerente), osId, { versao: 5 })).resolves.toEqual({
      versao: 6,
      versaoDoChamado: null,
    });
    const os = await dono.query<{ estado: string; chamado_id: string | null }>(
      `select estado, chamado_id from app.os where id = $1`,
      [osId],
    );
    expect(os.rows).toEqual([{ estado: 'aceita', chamado_id: null }]);
    const transicoes = await dono.query<{ acao: string; autor: boolean }>(
      `select acao, usuario_id is not null as autor from app.os_transicao where os_id = $1
       order by quando, id`,
      [osId],
    );
    expect(transicoes.rows).toEqual([
      { acao: 'iniciar', autor: true },
      { acao: 'pausar', autor: true },
      { acao: 'retomar', autor: true },
      { acao: 'concluir', autor: true },
      { acao: 'aceitar', autor: true },
    ]);
    const aceite = await dono.query<{ depois: { estadoDoChamado: unknown } }>(
      `select depois from app.auditoria where tenant_id = $1 and registro_id = $2 and acao = 'aceitar'`,
      [TENANT, osId],
    );
    expect(aceite.rows[0]?.depois.estadoDoChamado).toBeNull();
  });

  it('o técnico não cancela; o Gerente cancela, com a versão do chamado nula', async () => {
    const osId = await preventiva();
    await expect(
      triagem.cancelarOs(ctx(U.tecnico), osId, { versao: 1, motivo: 'Ativo em reforma' }),
    ).rejects.toMatchObject({ codigo: 'acao_fora_do_papel' });
    await expect(
      triagem.cancelarOs(ctx(U.gerente), osId, { versao: 1, motivo: 'Ativo em reforma' }),
    ).resolves.toEqual({ versao: 2, versaoDoChamado: null });
  });

  it('a parada é recusada na preventiva', async () => {
    const osId = await preventiva();
    await operar('os.iniciar', osId, 1);
    await expect(
      execucao.prepararParada(ctx(U.tecnico), { osId, inicio: new Date(), fim: null }),
    ).rejects.toMatchObject({ codigo: 'parada_na_preventiva' });
  });

  it('a lista de OS, a leitura por id e os nomes da página trazem a preventiva', async () => {
    const osId = await preventiva();
    const lista = await consultas.listarOs(ctx(U.gerente), { hotelId: H1 });
    expect(lista.itens.find((o) => o.id === osId)).toMatchObject({
      chamadoId: null,
      descricao: null,
      localNome: 'Casa de máquinas',
      preventiva: { planoNome: 'PMOC mensal', ativoNome: 'Chiller 1' },
    });
    await expect(triagem.os(ctx(U.gerente), osId)).resolves.toMatchObject({
      chamadoId: null,
      preventiva: { planoId: PLANO, planoNome: 'PMOC mensal', ativoId: ATIVO },
    });
    await expect(consultas.nomesDaOs(ctx(U.gerente), osId)).resolves.toMatchObject({
      local: 'Casa de máquinas',
      ativo: 'Chiller 1',
      pessoas: { [U.tecnico]: 'tecnico' },
    });
  });
});
