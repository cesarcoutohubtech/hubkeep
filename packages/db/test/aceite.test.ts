// Aceite da C6 (fase 1a; ADR-027, ADR-029) contra Postgres real (na CI, o Supabase do runner):
//   - a OS guarda quem abriu o chamado (0026), gravado na geração;
//   - quem abriu o chamado (aqui, o Solicitante) aceita a OS concluída, e o
//     chamado fica concluído; ou reabre com motivo, e a mesma OS e o chamado
//     voltam à execução, com o mesmo responsável;
//   - o Gerente do hotel aceita o chamado aberto por outro; o Solicitante que
//     não abriu e o Técnico, não (domínio e, sem a checagem, a RLS);
//   - versão vista (409), motivo (422) e estado (409 transicao_invalida);
//   - auditoria (com o motivo) e evento (os.aceita, os.reaberta) na mesma transação;
//   - o último motivo de reabertura fica na OS (motivo_reabertura);
//   - quem abriu e executa a OS (ele, ou a equipe dele) não decide; o Gerente sim;
//   - reabrir com o equipamento parado abre uma parada nova no mesmo chamado,
//     com a OS; ativo já parado fica com a que existe; sem ativo, 422;
//   - Gerente único do hotel que abriu e executa: decidem o Gestor CSC ou o
//     Admin (0027: o Gestor lê as atribuições de Gerente); com outro Gerente
//     no hotel, o Gestor não decide.
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
import { semFeriadosOficiais } from './feriados-de-teste';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const TENANT = randomUUID();
const H1 = randomUUID();
const H2 = randomUUID();
const L = randomUUID();
const L2 = randomUUID();
const ATIVO = randomUUID();
const EQUIPE = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
  solicitante: randomUUID(),
  outroSolicitante: randomUUID(),
  daEquipe: randomUUID(),
  gestor: randomUUID(),
  gerenteUnico: randomUUID(),
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

  /** Leva a OS e o chamado a concluída e aguardando aceite (preparo pelo dono); devolve a versão da OS. */
  async function concluir(osId: string, chamadoId: string) {
    const r = await dono.query<{ versao: number }>(
      `update app.os set estado = 'concluida', situacao_id = $2, versao = versao + 1 where id = $1 returning versao`,
      [osId, situacao['os_concluida']],
    );
    await dono.query(
      `update app.chamado set estado = 'aguardando_aceite', situacao_id = $2, versao = versao + 1 where id = $1`,
      [chamadoId, situacao['chamado_aguardando_aceite']],
    );
    return r.rows[0]?.versao ?? 0;
  }

  /** Chamado aberto por `quem`, com a OS gerada pelo Gerente e já concluída. */
  async function osConcluida(
    quem: string,
    descricao: string,
    o: {
      ativoId?: string;
      responsavel?: { tipo: 'tecnico'; usuarioId: string } | { tipo: 'equipe'; equipeId: string };
    } = {},
  ) {
    const chamadoId = (
      await chamados.abrir(ctx(quem), {
        localId: L,
        descricao,
        ...(o.ativoId ? { ativoId: o.ativoId } : {}),
      })
    ).id;
    const versao = (await chamados.chamado(ctx(U.gerente), chamadoId)).versao;
    const os = await triagem.gerarOs(ctx(U.gerente), chamadoId, {
      versao,
      responsavel: o.responsavel ?? doTecnico,
    });
    return { chamadoId, osId: os.id, versao: await concluir(os.id, chamadoId) };
  }

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo C6')`, [TENANT]);
    for (const [hotel, local] of [
      [H1, L],
      [H2, L2],
    ]) {
      await dono.query(
        `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, 'Hotel', 'UTC', 'ativo')`,
        [hotel, TENANT],
      );
      await dono.query(
        `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
         values ($1, $2, $3, 'uh', 'UH 101', 'uh 101', 'ativo')`,
        [local, TENANT, hotel],
      );
    }
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
    await atribuir(U.daEquipe, 'tecnico', 'hotel', H1);
    await atribuir(U.gestor, 'gestor_csc', 'grupo', null);
    // Hotel 2: um só Gerente, que também é Técnico.
    await atribuir(U.gerenteUnico, 'gerente_hotel', 'hotel', H2);
    await atribuir(U.gerenteUnico, 'tecnico', 'hotel', H2);
    await dono.query(
      `insert into app.equipe (id, tenant_id, hotel_id, nome) values ($1, $2, $3, 'Manutenção')`,
      [EQUIPE, TENANT, H1],
    );
    await dono.query(
      `insert into app.equipe_membro (tenant_id, hotel_id, equipe_id, usuario_id) values ($1, $2, $3, $4)`,
      [TENANT, H1, EQUIPE, U.daEquipe],
    );
    await dono.query(
      `insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome, busca)
       values ($1, $2, $3, $4, $5, 'Frigobar 101', 'frigobar 101')`,
      ['ACETE00001', ATIVO, TENANT, H1, L],
    );

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
      feriadosOficiais: semFeriadosOficiais,
    });
    const deps = {
      triagem: criarPortaTriagem(banco),
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
      feriadosOficiais: semFeriadosOficiais,
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
      'app.parada_ativo',
      'app.os_transicao',
      'app.os',
      'app.chamado',
      'app.ativo',
      'app.equipe_membro',
      'app.equipe',
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
    // I5: a conclusão foi feita pelo dono no preparo, então só a geração e o aceite.
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
    expect(transicoes.rows).toEqual([
      { acao: 'gerar', de: null, para: 'atribuida', usuario_id: U.gerente },
      { acao: 'aceitar', de: 'concluida', para: 'aceita', usuario_id: U.solicitante },
    ]);
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
    expect(reaberta.paradaId).toBeNull();
    const c = await chamados.chamado(ctx(U.gerente), chamadoId);
    expect(c).toMatchObject({ estado: 'em_execucao', versao: reaberta.versaoDoChamado });
    const lista = await triagem.osDoChamado(ctx(U.gerente), chamadoId);
    expect(lista.map((o) => [o.id, o.estado, o.responsavel, o.motivoReabertura])).toEqual([
      [osId, 'em_execucao', doTecnico, 'Continua pingando'],
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
    expect(transicoes.rows.at(-1)).toEqual({
      acao: 'reabrir',
      de: 'concluida',
      para: 'em_execucao',
      usuario_id: U.solicitante,
    });
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

  it('quem abriu e executa a OS não decide o aceite; o Gerente sim', async () => {
    const propria = await osConcluida(U.tecnico, 'Lâmpada queimada');
    await expect(
      triagem.aceitarOs(ctx(U.tecnico), propria.osId, { versao: propria.versao }),
    ).rejects.toMatchObject({ codigo: 'acao_fora_do_papel' });
    await expect(
      triagem.reabrirOs(ctx(U.tecnico), propria.osId, { versao: propria.versao, motivo: 'x' }),
    ).rejects.toMatchObject({ codigo: 'acao_fora_do_papel' });
    expect(
      (await triagem.aceitarOs(ctx(U.gerente), propria.osId, { versao: propria.versao })).versao,
    ).toBe(propria.versao + 1);

    // Membro da equipe responsável que abriu: também executa.
    const daEquipe = await osConcluida(U.daEquipe, 'Ralo entupido', {
      responsavel: { tipo: 'equipe', equipeId: EQUIPE },
    });
    await expect(
      triagem.aceitarOs(ctx(U.daEquipe), daEquipe.osId, { versao: daEquipe.versao }),
    ).rejects.toMatchObject({ codigo: 'acao_fora_do_papel' });
  });

  it('reabrir com o equipamento parado abre uma parada nova no mesmo chamado', async () => {
    const semAtivo = await osConcluida(U.solicitante, 'Janela emperrada');
    await expect(
      triagem.reabrirOs(ctx(U.solicitante), semAtivo.osId, {
        versao: semAtivo.versao,
        motivo: 'Parou',
        paradoDesde: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ codigo: 'parada_sem_ativo' });

    const { chamadoId, osId, versao } = await osConcluida(U.solicitante, 'Frigobar parou', {
      ativoId: ATIVO,
    });
    await expect(
      triagem.reabrirOs(ctx(U.solicitante), osId, {
        versao,
        motivo: 'Parou de novo',
        paradoDesde: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    ).rejects.toMatchObject({ codigo: 'parada_invalida' });
    const desde = new Date(Date.now() - 30 * 60_000);
    const reaberta = await triagem.reabrirOs(ctx(U.solicitante), osId, {
      versao,
      motivo: 'Parou de novo',
      paradoDesde: desde.toISOString(),
    });
    expect(reaberta.paradaId).not.toBeNull();
    const parada = await dono.query<{
      chamado_id: string;
      os_id: string;
      ativo_id: string;
      inicio: Date;
      fim: Date | null;
      aberta_por: string;
    }>(
      `select chamado_id, os_id, ativo_id, inicio, fim, aberta_por from app.parada_ativo where id = $1`,
      [reaberta.paradaId],
    );
    expect(parada.rows[0]).toMatchObject({
      chamado_id: chamadoId,
      os_id: osId,
      ativo_id: ATIVO,
      fim: null,
      aberta_por: U.solicitante,
    });
    expect(parada.rows[0]?.inicio.getTime()).toBe(desde.getTime());

    // Concluída de novo, com a parada ainda aberta: a reabertura fica com a que existe.
    const versao2 = await concluir(osId, chamadoId);
    const denovo = await triagem.reabrirOs(ctx(U.gerente), osId, {
      versao: versao2,
      motivo: 'Ainda parado',
      paradoDesde: new Date().toISOString(),
    });
    expect(denovo.paradaId).toBeNull();
    const abertas = await dono.query(
      `select 1 from app.parada_ativo where tenant_id = $1 and ativo_id = $2 and fim is null`,
      [TENANT, ATIVO],
    );
    expect(abertas.rowCount).toBe(1);
    const [os] = await triagem.osDoChamado(ctx(U.gerente), chamadoId);
    expect(os?.motivoReabertura).toBe('Ainda parado');
  });

  it('Gerente único que abriu e executa: decidem o Gestor CSC ou o Admin', async () => {
    const eleMesmo = { tipo: 'tecnico', usuarioId: U.gerenteUnico } as const;
    const concluidaNoHotel2 = async (descricao: string) => {
      const chamadoId = (await chamados.abrir(ctx(U.gerenteUnico), { localId: L2, descricao })).id;
      const versao = (await chamados.chamado(ctx(U.gerenteUnico), chamadoId)).versao;
      const os = await triagem.gerarOs(ctx(U.gerenteUnico), chamadoId, {
        versao,
        responsavel: eleMesmo,
      });
      return { chamadoId, osId: os.id, versao: await concluir(os.id, chamadoId) };
    };

    const a = await concluidaNoHotel2('Tomada solta');
    await expect(
      triagem.aceitarOs(ctx(U.gerenteUnico), a.osId, { versao: a.versao }),
    ).rejects.toMatchObject({ codigo: 'acao_fora_do_papel' });
    const aceita = await triagem.aceitarOs(ctx(U.gestor), a.osId, { versao: a.versao });
    expect(aceita.versao).toBe(a.versao + 1);
    expect((await chamados.chamado(ctx(U.gestor), a.chamadoId)).estado).toBe('concluido');

    const b = await concluidaNoHotel2('Porta rangendo');
    const reaberta = await triagem.reabrirOs(ctx(U.admin), b.osId, {
      versao: b.versao,
      motivo: 'Continua rangendo',
    });
    expect(reaberta.versao).toBe(b.versao + 1);

    // Hotel 1 tem outro Gerente: o Técnico que abriu e executa fica com ele, não com o Gestor.
    const c = await osConcluida(U.tecnico, 'Luz piscando');
    await expect(
      triagem.aceitarOs(ctx(U.gestor), c.osId, { versao: c.versao }),
    ).rejects.toMatchObject({ codigo: 'acao_fora_do_papel' });

    // Um segundo Gerente no Hotel 2 tira a decisão do Gestor.
    await dono.query(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
       values ($1, $2, $3, 'gerente_hotel', 'hotel', $4, $5)`,
      [randomUUID(), TENANT, U.gerente, H2, U.admin],
    );
    const d = await concluidaNoHotel2('Cortina caída');
    await expect(
      triagem.aceitarOs(ctx(U.gestor), d.osId, { versao: d.versao }),
    ).rejects.toMatchObject({ codigo: 'acao_fora_do_papel' });
    expect((await triagem.aceitarOs(ctx(U.gerente), d.osId, { versao: d.versao })).versao).toBe(
      d.versao + 1,
    );
  });
});
