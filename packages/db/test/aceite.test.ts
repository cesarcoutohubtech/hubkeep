// Aceite da C6 (fase 1a; ADR-027, ADR-029) contra Postgres real (na CI, o Supabase do runner):
//   - a OS guarda quem abriu o chamado (0026), gravado na geração;
//   - quem abriu o chamado (aqui, o Solicitante) aceita a OS concluída, e o
//     chamado fica concluído; ou reabre com motivo, e a mesma OS e o chamado
//     voltam à execução, com o mesmo responsável;
//   - o Gerente do hotel aceita o chamado aberto por outro; o Solicitante que
//     não abriu e o Técnico, não (domínio e, sem a checagem, a RLS);
//   - versão vista (409), motivo (422) e estado (409 transicao_invalida);
//   - auditoria (com o motivo) e evento (os.aceita, os.reaberta) na mesma transação.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeChamados,
  criarCasosDeUsoDeSituacoes,
  criarCasosDeUsoDeTriagem,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaChamados,
  criarPortaPrioridades,
  criarPortaSituacoes,
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
const H1 = randomUUID();
const L = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
  solicitante: randomUUID(),
  outroSolicitante: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });
const doTecnico = { tipo: 'tecnico', usuarioId: U.tecnico } as const;

describe.skipIf(!temBanco)('C6 — aceite da OS', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let chamados: ReturnType<typeof criarCasosDeUsoDeChamados>;
  let triagem: ReturnType<typeof criarCasosDeUsoDeTriagem>;
  let semChecagem: ReturnType<typeof criarCasosDeUsoDeTriagem>;
  const situacao: Record<string, string> = {};

  /** Chamado aberto por `quem`, com a OS gerada pelo Gerente e já concluída (preparo pelo dono). */
  async function osConcluida(quem: string, descricao: string) {
    const chamadoId = (await chamados.abrir(ctx(quem), { localId: L, descricao })).id;
    const versao = (await chamados.chamado(ctx(U.gerente), chamadoId)).versao;
    const os = await triagem.gerarOs(ctx(U.gerente), chamadoId, {
      versao,
      responsavel: doTecnico,
    });
    await dono.query(
      `update app.os set estado = 'concluida', situacao_id = $2, versao = versao + 1 where id = $1`,
      [os.id, situacao['os_concluida']],
    );
    await dono.query(
      `update app.chamado set estado = 'aguardando_aceite', situacao_id = $2, versao = versao + 1 where id = $1`,
      [chamadoId, situacao['chamado_aguardando_aceite']],
    );
    return { chamadoId, osId: os.id, versao: os.versao + 1 };
  }

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo C6')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, 'Hotel 1', 'UTC', 'ativo')`,
      [H1, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
       values ($1, $2, $3, 'uh', 'UH 101', 'uh 101', 'ativo')`,
      [L, TENANT, H1],
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
    await atribuir(U.solicitante, 'solicitante', 'hotel', H1);
    await atribuir(U.outroSolicitante, 'solicitante', 'hotel', H1);

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 4 } });
    const atribuicoes = criarPortasDeAplicacao(banco).atribuicoes;
    const situacoes = criarPortaSituacoes(banco);
    const prioridades = criarPortaPrioridades(banco);
    const configuracao = criarCasosDeUsoDeSituacoes({
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
    });
    await configuracao.instalarPadrao(ctx(U.admin));
    const lista = await configuracao.listarSituacoesEPrioridades(ctx(U.admin));
    for (const s of lista.situacoes) if (s.chavePadrao) situacao[s.chavePadrao] = s.id;

    chamados = criarCasosDeUsoDeChamados({
      chamados: criarPortaChamados(banco),
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
    });
    const deps = {
      triagem: criarPortaTriagem(banco),
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
    };
    triagem = criarCasosDeUsoDeTriagem(deps);
    // Sem as regras do domínio: só a RLS decide quem grava.
    semChecagem = criarCasosDeUsoDeTriagem({
      ...deps,
      regras: { decidirNaOs: () => ({ estado: 'aceita', chamado: 'concluido', motivo: null }) },
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.os',
      'app.chamado',
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

  it('a OS guarda quem abriu o chamado; quem abriu aceita, e o chamado fica concluído', async () => {
    const { chamadoId, osId, versao } = await osConcluida(U.solicitante, 'Frigobar não gela');
    const gravada = await dono.query<{ chamado_aberto_por: string }>(
      `select chamado_aberto_por from app.os where id = $1`,
      [osId],
    );
    expect(gravada.rows[0]?.chamado_aberto_por).toBe(U.solicitante);

    await expect(
      triagem.aceitarOs(ctx(U.solicitante), osId, { versao: versao - 1 }),
    ).rejects.toMatchObject({ codigo: 'conflito_de_versao' });
    const aceita = await triagem.aceitarOs(ctx(U.solicitante), osId, { versao });
    expect(aceita.versao).toBe(versao + 1);
    const c = await chamados.chamado(ctx(U.gerente), chamadoId);
    expect(c).toMatchObject({ estado: 'concluido', versao: aceita.versaoDoChamado });
    const [os] = await triagem.osDoChamado(ctx(U.gerente), chamadoId);
    expect(os).toMatchObject({ estado: 'aceita', situacaoId: situacao['os_aceita'] });

    await expect(
      triagem.reabrirOs(ctx(U.solicitante), osId, { versao: aceita.versao, motivo: 'Voltou' }),
    ).rejects.toMatchObject({ codigo: 'transicao_invalida' });

    const auditoria = await dono.query<{ acao: string; usuario_id: string }>(
      `select acao, usuario_id from app.auditoria
       where tenant_id = $1 and entidade = 'os' and registro_id = $2 order by em, id`,
      [TENANT, osId],
    );
    expect(auditoria.rows.map((a) => a.acao)).toEqual(['gerar', 'aceitar']);
    expect(auditoria.rows[1]?.usuario_id).toBe(U.solicitante);
    const eventos = await dono.query<{ tipo: string }>(
      `select tipo from app.evento_dominio where tenant_id = $1 and registro_id = $2 order by criado_em, id`,
      [TENANT, osId],
    );
    expect(eventos.rows.map((e) => e.tipo)).toEqual(['os.atribuida', 'os.aceita']);
  });

  it('quem abriu reabre com motivo: a mesma OS e o chamado voltam à execução', async () => {
    const { chamadoId, osId, versao } = await osConcluida(U.solicitante, 'Chuveiro frio');
    await expect(
      triagem.reabrirOs(ctx(U.solicitante), osId, { versao, motivo: '   ' }),
    ).rejects.toMatchObject({ codigo: 'motivo_obrigatorio' });
    const reaberta = await triagem.reabrirOs(ctx(U.solicitante), osId, {
      versao,
      motivo: '  Continua   pingando ',
    });
    const c = await chamados.chamado(ctx(U.gerente), chamadoId);
    expect(c).toMatchObject({ estado: 'em_execucao', versao: reaberta.versaoDoChamado });
    const lista = await triagem.osDoChamado(ctx(U.gerente), chamadoId);
    expect(lista.map((o) => [o.id, o.estado, o.responsavel])).toEqual([
      [osId, 'em_execucao', doTecnico],
    ]);

    const auditoria = await dono.query<{ depois: { motivo?: string } }>(
      `select depois from app.auditoria
       where tenant_id = $1 and entidade = 'os' and registro_id = $2 and acao = 'reabrir'`,
      [TENANT, osId],
    );
    expect(auditoria.rows[0]?.depois.motivo).toBe('Continua pingando');
    const eventos = await dono.query<{ tipo: string; payload: { motivo?: string } }>(
      `select tipo, payload from app.evento_dominio
       where tenant_id = $1 and registro_id = $2 and tipo = 'os.reaberta'`,
      [TENANT, osId],
    );
    expect(eventos.rows[0]?.payload.motivo).toBe('Continua pingando');
  });

  it('o Gerente aceita o chamado de outro; o Solicitante que não abriu e o Técnico, não', async () => {
    const { osId, versao } = await osConcluida(U.solicitante, 'Porta não fecha');
    for (const quem of [U.outroSolicitante, U.tecnico]) {
      await expect(triagem.aceitarOs(ctx(quem), osId, { versao })).rejects.toMatchObject({
        codigo: 'acao_fora_do_papel',
      });
    }
    expect((await triagem.aceitarOs(ctx(U.gerente), osId, { versao })).versao).toBe(versao + 1);
  });

  it('sem a checagem do domínio, a RLS recusa quem não abriu e deixa quem abriu', async () => {
    const { osId, versao } = await osConcluida(U.solicitante, 'Tomada solta');
    await expect(
      semChecagem.aceitarOs(ctx(U.outroSolicitante), osId, { versao }),
    ).rejects.toMatchObject({ codigo: 'os_nao_encontrada' });
    expect((await semChecagem.aceitarOs(ctx(U.solicitante), osId, { versao })).versao).toBe(
      versao + 1,
    );
  });
});
