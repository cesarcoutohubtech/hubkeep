// Aceite da C4a (fase 1a; ADR-025, ADR-027, ADR-029) contra Postgres real (na CI, o Supabase do runner):
//   - a fila do dia traz as OS do Técnico e das equipes de que ele é membro
//     ativo, ainda em curso;
//   - um dia de operações offline (iniciar, pausar, retomar, horas, material,
//     concluir) aplica em ordem, com a versão calculada no aparelho, e o
//     reenvio de cada uma não duplica nada;
//   - concluir leva o chamado a aguardando aceite;
//   - a OS reatribuída no servidor, com a operação na fila, volta como
//     os_de_outro_responsavel, sem guardar a chave;
//   - apontamento fora do limite: 422, sem guardar a chave;
//   - sem as regras do domínio, a RLS recusa o técnico que não é o responsável;
//   - auditoria e eventos na mesma transação.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeChamados,
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
  criarPortaChamados,
  criarPortaExecucao,
  criarPortaOperacoesOffline,
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
const UH = randomUUID();
const EQUIPE = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
  daEquipe: randomUUID(),
  outro: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

describe.skipIf(!temBanco)('C4a — execução da OS', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let chamados: ReturnType<typeof criarCasosDeUsoDeChamados>;
  let triagem: ReturnType<typeof criarCasosDeUsoDeTriagem>;
  let execucao: ReturnType<typeof criarCasosDeUsoDeExecucao>;
  let sincronizacao: ReturnType<typeof criarCasosDeUsoDeSincronizacao>;
  let semChecagem: ReturnType<typeof criarCasosDeUsoDeSincronizacao>;

  /** Abre, gera a OS para o responsável e devolve os ids. */
  async function osPara(
    responsavel: { tipo: 'tecnico'; usuarioId: string } | { tipo: 'equipe'; equipeId: string },
  ) {
    const { id: chamadoId } = await chamados.abrir(ctx(U.gerente), {
      localId: UH,
      descricao: `Chamado ${randomUUID()}`,
    });
    const { id } = await triagem.gerarOs(ctx(U.gerente), chamadoId, { versao: 1, responsavel });
    return { chamadoId, osId: id };
  }
  const operar = (
    usuarioId: string,
    tipo: 'os.iniciar' | 'os.pausar' | 'os.retomar' | 'os.concluir',
    osId: string,
    versao: number,
    chave: string = randomUUID(),
  ) => sincronizacao.receberOperacao(ctx(usuarioId), { chave, tipo, dados: { osId, versao } });
  const contar = async (sqlTexto: string, params: unknown[]) =>
    (await dono.query<{ n: number }>(sqlTexto, params)).rows[0]?.n;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo C4')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, 'Hotel 1', 'UTC', 'ativo')`,
      [H1, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
       values ($1, $2, $3, 'uh', 'UH 101', 'uh 101', 'ativo')`,
      [UH, TENANT, H1],
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
    for (const t of [U.tecnico, U.daEquipe, U.outro]) await atribuir(t, 'tecnico', 'hotel', H1);
    await dono.query(
      `insert into app.equipe (id, tenant_id, hotel_id, nome) values ($1, $2, $3, 'Manutenção')`,
      [EQUIPE, TENANT, H1],
    );
    await dono.query(
      `insert into app.equipe_membro (tenant_id, hotel_id, equipe_id, usuario_id) values ($1, $2, $3, $4)`,
      [TENANT, H1, EQUIPE, U.daEquipe],
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
    chamados = criarCasosDeUsoDeChamados({
      chamados: criarPortaChamados(banco),
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
    });
    const portaTriagem = criarPortaTriagem(banco);
    triagem = criarCasosDeUsoDeTriagem({
      triagem: portaTriagem,
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
    });
    const depsDaExecucao = {
      execucao: criarPortaExecucao(banco),
      triagem: portaTriagem,
      situacoes,
      atribuicoes,
      relogio: relogioDoSistema,
    };
    execucao = criarCasosDeUsoDeExecucao(depsDaExecucao);
    const operacoes = criarPortaOperacoesOffline(banco);
    const ativos = {
      prepararCadastro: () => Promise.reject(new Error('fora do teste')),
      prepararAlteracao: () => Promise.reject(new Error('fora do teste')),
    };
    sincronizacao = criarCasosDeUsoDeSincronizacao({ operacoes, ativos, chamados, execucao });
    // Sem as regras do domínio: só a RLS decide.
    semChecagem = criarCasosDeUsoDeSincronizacao({
      operacoes,
      ativos,
      execucao: criarCasosDeUsoDeExecucao({
        ...depsDaExecucao,
        regras: {
          decidirNaOs: () => ({ estado: 'em_execucao', chamado: null, motivo: null }),
          decidirRegistroNaOs: () => undefined,
        },
      }),
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.operacao_offline',
      'app.os_apontamento',
      'app.os_material',
      'app.os_transicao',
      'app.os',
      'app.chamado',
      'app.situacao',
      'app.prioridade',
      'app.equipe_membro',
      'app.equipe',
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

  it('fila do dia: as OS do Técnico e as da equipe dele, ainda em curso', async () => {
    const direta = await osPara({ tipo: 'tecnico', usuarioId: U.tecnico });
    const daEquipe = await osPara({ tipo: 'equipe', equipeId: EQUIPE });
    const cancelada = await osPara({ tipo: 'tecnico', usuarioId: U.tecnico });
    await triagem.cancelarOs(ctx(U.gerente), cancelada.osId, { versao: 1, motivo: 'Duplicada' });

    const doTecnico = (await execucao.osDoDia(ctx(U.tecnico))).map((o) => o.id);
    expect(doTecnico).toContain(direta.osId);
    expect(doTecnico).not.toContain(daEquipe.osId);
    expect(doTecnico).not.toContain(cancelada.osId);
    const doMembro = await execucao.osDoDia(ctx(U.daEquipe));
    expect(doMembro.map((o) => o.id)).toEqual([daEquipe.osId]);
    expect(doMembro[0]).toMatchObject({
      estado: 'atribuida',
      versao: 1,
      responsavel: { tipo: 'equipe', equipeId: EQUIPE },
      chamado: { id: daEquipe.chamadoId, localNome: 'UH 101', estado: 'em_execucao' },
    });
  });

  it('um dia offline: aplica em ordem, reenvio não duplica, concluir leva o chamado', async () => {
    const { chamadoId, osId } = await osPara({ tipo: 'equipe', equipeId: EQUIPE });
    const chaveDasHoras = randomUUID();
    const agora = Date.now();
    const horas = () =>
      sincronizacao.receberOperacao(ctx(U.daEquipe), {
        chave: chaveDasHoras,
        tipo: 'os.apontar_horas',
        dados: {
          osId,
          inicio: new Date(agora - 2 * 3_600_000).toISOString(),
          fim: new Date(agora - 3_600_000).toISOString(),
        },
      });

    const chaveDoInicio = randomUUID();
    expect((await operar(U.daEquipe, 'os.iniciar', osId, 1, chaveDoInicio)).resposta).toMatchObject(
      {
        versao: 2,
        estado: 'em_execucao',
      },
    );
    expect(await horas()).toMatchObject({ repetida: false });
    expect(
      await sincronizacao.receberOperacao(ctx(U.daEquipe), {
        chave: randomUUID(),
        tipo: 'os.registrar_material',
        dados: { osId, descricao: '  2 m de cabo  2,5 mm ' },
      }),
    ).toMatchObject({ repetida: false });
    await operar(U.daEquipe, 'os.pausar', osId, 2);
    await operar(U.daEquipe, 'os.retomar', osId, 3);
    expect((await operar(U.daEquipe, 'os.concluir', osId, 4)).resposta).toMatchObject({
      versao: 5,
      estado: 'concluida',
    });

    // Reenvio (resposta perdida): nada de novo.
    expect(await horas()).toMatchObject({ repetida: true });
    expect(await operar(U.daEquipe, 'os.iniciar', osId, 1, chaveDoInicio)).toMatchObject({
      repetida: true,
      resposta: { versao: 2 },
    });
    expect(
      await contar(`select count(*)::int as n from app.os_apontamento where os_id = $1`, [osId]),
    ).toBe(1);
    const material = await dono.query<{ descricao: string; usuario_id: string }>(
      `select descricao, usuario_id from app.os_material where os_id = $1`,
      [osId],
    );
    expect(material.rows).toEqual([{ descricao: '2 m de cabo 2,5 mm', usuario_id: U.daEquipe }]);

    expect(await chamados.chamado(ctx(U.gerente), chamadoId)).toMatchObject({
      estado: 'aguardando_aceite',
    });
    const eventos = await dono.query<{ tipo: string }>(
      `select tipo from app.evento_dominio where tenant_id = $1 and registro_id = $2 order by criado_em, id`,
      [TENANT, osId],
    );
    expect(eventos.rows.map((e) => e.tipo)).toEqual([
      'os.atribuida',
      'os.iniciada',
      'os.horas_apontadas',
      'os.material_registrado',
      'os.pausada',
      'os.retomada',
      'os.concluida',
    ]);
    // A OS concluída sai da fila do dia.
    expect((await execucao.osDoDia(ctx(U.daEquipe))).map((o) => o.id)).not.toContain(osId);
    // I5: uma transição por mudança de estado, em nome de quem fez; o reenvio não duplica.
    const transicoes = await dono.query<{
      acao: string;
      de: string | null;
      para: string;
      usuario_id: string;
    }>(
      `select acao, de, para, usuario_id from app.os_transicao
       where tenant_id = $1 and os_id = $2 order by quando, id`,
      [TENANT, osId],
    );
    expect(transicoes.rows.map((t) => [t.acao, t.de, t.para])).toEqual([
      ['gerar', null, 'atribuida'],
      ['iniciar', 'atribuida', 'em_execucao'],
      ['pausar', 'em_execucao', 'pausada'],
      ['retomar', 'pausada', 'em_execucao'],
      ['concluir', 'em_execucao', 'concluida'],
    ]);
    expect(transicoes.rows.slice(1).every((t) => t.usuario_id === U.daEquipe)).toBe(true);
  });

  it('OS reatribuída com a operação na fila: os_de_outro_responsavel, sem guardar a chave', async () => {
    const { osId } = await osPara({ tipo: 'tecnico', usuarioId: U.tecnico });
    // O técnico pôs o início na fila (versão 1) sem rede; o gerente reatribuiu antes.
    await triagem.reatribuirOs(ctx(U.gerente), osId, {
      versao: 1,
      responsavel: { tipo: 'tecnico', usuarioId: U.outro },
    });
    const chave = randomUUID();
    await expect(operar(U.tecnico, 'os.iniciar', osId, 1, chave)).rejects.toMatchObject({
      codigo: 'os_de_outro_responsavel',
    });
    await expect(
      sincronizacao.receberOperacao(ctx(U.tecnico), {
        chave: randomUUID(),
        tipo: 'os.registrar_material',
        dados: { osId, descricao: 'Fita' },
      }),
    ).rejects.toMatchObject({ codigo: 'transicao_invalida' });
    expect(
      await contar(`select count(*)::int as n from app.operacao_offline where chave = $1`, [chave]),
    ).toBe(0);
    // O novo responsável segue, com a versão atual.
    expect((await operar(U.outro, 'os.iniciar', osId, 2)).resposta).toMatchObject({ versao: 3 });
  });

  it('foto na OS (C4b e I8): o responsável, com a OS atribuída, em execução ou pausada', async () => {
    const { osId } = await osPara({ tipo: 'tecnico', usuarioId: U.tecnico });
    // A foto "antes" (I8): vale com a OS atribuída, ainda não iniciada.
    await expect(execucao.exigirFoto(ctx(U.tecnico), osId)).resolves.toBeUndefined();
    await operar(U.tecnico, 'os.iniciar', osId, 1);
    await expect(execucao.exigirFoto(ctx(U.tecnico), osId)).resolves.toBeUndefined();
    await expect(execucao.exigirFoto(ctx(U.outro), osId)).rejects.toMatchObject({
      codigo: 'os_de_outro_responsavel',
    });
    await operar(U.tecnico, 'os.concluir', osId, 2);
    await expect(execucao.exigirFoto(ctx(U.tecnico), osId)).rejects.toMatchObject({
      codigo: 'transicao_invalida',
    });
  });

  it('I9: as transições sem rede gravam a hora do aparelho, em ordem e nunca no futuro', async () => {
    const { osId } = await osPara({ tipo: 'tecnico', usuarioId: U.tecnico });
    // A geração recuada duas horas (pelo dono), para as horas do aparelho
    // ficarem no passado e o ajuste ao futuro não interferir.
    const geracao = (
      await dono.query<{ quando: Date }>(
        `update app.os_transicao set quando = quando - interval '2 hours'
         where os_id = $1 and acao = 'gerar' returning quando`,
        [osId],
      )
    ).rows[0]?.quando;
    if (!geracao) throw new Error('A geração não gravou a transição.');
    const depois = (min: number) => new Date(geracao.getTime() + min * 60_000).toISOString();
    const agir = (
      tipo: 'os.iniciar' | 'os.pausar' | 'os.retomar' | 'os.concluir',
      versao: number,
      feitaEm?: string,
    ) =>
      sincronizacao.receberOperacao(ctx(U.tecnico), {
        chave: randomUUID(),
        tipo,
        dados: { osId, versao, ...(feitaEm ? { feitaEm } : {}) },
      });
    // Iniciar 1 min depois da geração; pausar com o relógio atrasado (antes da
    // geração); retomar sem a hora (operação antiga); concluir com o relógio
    // adiantado uma hora.
    await agir('os.iniciar', 1, depois(1));
    await agir('os.pausar', 2, depois(-30));
    await agir('os.retomar', 3);
    const antesDaConclusao = new Date();
    await agir('os.concluir', 4, new Date(Date.now() + 3_600_000).toISOString());

    const linhas = (
      await dono.query<{ acao: string; quando: Date }>(
        `select acao, quando from app.os_transicao where os_id = $1 order by quando, id`,
        [osId],
      )
    ).rows;
    expect(linhas.map((l) => l.acao)).toEqual([
      'gerar',
      'iniciar',
      'pausar',
      'retomar',
      'concluir',
    ]);
    const [, iniciar, pausar, retomar, concluir] = linhas.map((l) => l.quando.getTime());
    expect(iniciar).toBe(geracao.getTime() + 60_000);
    expect(pausar).toBe(iniciar);
    expect(retomar).toBeGreaterThan(iniciar ?? 0);
    expect(concluir).toBeGreaterThanOrEqual(retomar ?? 0);
    expect(concluir).toBeLessThanOrEqual(Date.now());
    expect(concluir).toBeGreaterThanOrEqual(antesDaConclusao.getTime() - 1000);
  });

  it('versão velha: conflito_de_versao; apontamento fora do limite: 422', async () => {
    const { osId } = await osPara({ tipo: 'tecnico', usuarioId: U.tecnico });
    await operar(U.tecnico, 'os.iniciar', osId, 1);
    await expect(operar(U.tecnico, 'os.pausar', osId, 1)).rejects.toMatchObject({
      codigo: 'conflito_de_versao',
      parametros: { versaoAtual: 2 },
    });
    const chave = randomUUID();
    const agora = Date.now();
    await expect(
      sincronizacao.receberOperacao(ctx(U.tecnico), {
        chave,
        tipo: 'os.apontar_horas',
        dados: {
          osId,
          inicio: new Date(agora - 25 * 3_600_000).toISOString(),
          fim: new Date(agora).toISOString(),
        },
      }),
    ).rejects.toMatchObject({ codigo: 'apontamento_invalido' });
    expect(
      await contar(`select count(*)::int as n from app.operacao_offline where chave = $1`, [chave]),
    ).toBe(0);
  });

  it('sem as regras do domínio, a RLS recusa quem não é o responsável', async () => {
    const { osId } = await osPara({ tipo: 'tecnico', usuarioId: U.tecnico });
    await expect(
      semChecagem.receberOperacao(ctx(U.outro), {
        chave: randomUUID(),
        tipo: 'os.iniciar',
        dados: { osId, versao: 1 },
      }),
    ).rejects.toMatchObject({ codigo: 'os_nao_encontrada' });
    await expect(
      semChecagem.receberOperacao(ctx(U.outro), {
        chave: randomUUID(),
        tipo: 'os.registrar_material',
        dados: { osId, descricao: 'Não é minha' },
      }),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      semChecagem.receberOperacao(ctx(U.gerente), {
        chave: randomUUID(),
        tipo: 'os.apontar_horas',
        dados: {
          osId,
          inicio: new Date(Date.now() - 3_600_000).toISOString(),
          fim: new Date().toISOString(),
        },
      }),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await contar(`select versao as n from app.os where id = $1`, [osId])).toBe(1);
    // A transição recusada não deixa linha: só a geração.
    expect(
      await contar(`select count(*)::int as n from app.os_transicao where os_id = $1`, [osId]),
    ).toBe(1);
  });
});
