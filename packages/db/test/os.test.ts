// Aceite da C3 (fase 1a; ADR-027, ADR-029) contra Postgres real (na CI, o Supabase do runner):
//   - a triagem (Admin do grupo, Gestor CSC, Gerente do hotel) classifica,
//     ajusta a prioridade, cancela e gera, reatribui e cancela a OS; o
//     Solicitante e o Técnico, não (domínio e, sem a checagem, a RLS);
//   - a OS vai para um Técnico do hotel ou para uma equipe ativa do hotel;
//   - versão vista (ADR-029): 409 conflito_de_versao;
//   - uma OS não cancelada por chamado: o domínio e o índice
//     os_uma_ativa_por_chamado dizem o mesmo para cada estado da OS, e duas
//     triagens simultâneas que passam juntas pelo domínio gravam uma OS só;
//   - OS cancelada devolve o chamado à triagem e deixa gerar outra;
//   - auditoria e evento (os.atribuida, os.cancelada, chamado.*) na mesma transação.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  type PortaTriagem,
  criarCasosDeUsoDeChamados,
  criarCasosDeUsoDeSituacoes,
  criarCasosDeUsoDeTriagem,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import {
  ESTADOS_DA_OS,
  type EstadoDaOs,
  exigirChamadoSemOsEmAndamento,
  osOcupaOChamado,
} from '@hubkeep/dominio';
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
const H2 = randomUUID();
const L = { uh101: randomUUID(), h2: randomUUID() };
const EQ = { h1: randomUUID(), h1Inativa: randomUUID(), h2: randomUUID() };
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
  tecnicoH2: randomUUID(),
  solicitante: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });
const doTecnico = { tipo: 'tecnico', usuarioId: U.tecnico } as const;
const daEquipe = { tipo: 'equipe', equipeId: EQ.h1 } as const;

describe.skipIf(!temBanco)('C3 — triagem e atribuição', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let porta: PortaTriagem;
  let chamados: ReturnType<typeof criarCasosDeUsoDeChamados>;
  let triagem: ReturnType<typeof criarCasosDeUsoDeTriagem>;
  let semChecagem: ReturnType<typeof criarCasosDeUsoDeTriagem>;
  let depsDaTriagem: Parameters<typeof criarCasosDeUsoDeTriagem>[0];
  const prioridade: Record<string, string> = {};
  let situacaoOsAtribuida = '';

  const abrir = async (descricao: string) =>
    (await chamados.abrir(ctx(U.gerente), { localId: L.uh101, descricao })).id;
  const versaoDo = async (chamadoId: string) =>
    (await chamados.chamado(ctx(U.gerente), chamadoId)).versao;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo C3')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values
       ($1, $3, 'Hotel 1', 'UTC', 'ativo'), ($2, $3, 'Hotel 2', 'UTC', 'ativo')`,
      [H1, H2, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
       ($1, $3, $4, 'uh', 'UH 101', 'uh 101', 'ativo'),
       ($2, $3, $5, 'area_comum', 'Lobby H2', 'lobby h2', 'ativo')`,
      [L.uh101, L.h2, TENANT, H1, H2],
    );
    await dono.query(
      `insert into app.equipe (id, tenant_id, hotel_id, nome, ativa) values
       ($1, $4, $5, 'Manutenção', true), ($2, $4, $5, 'Antiga', false), ($3, $4, $6, 'Manutenção H2', true)`,
      [EQ.h1, EQ.h1Inativa, EQ.h2, TENANT, H1, H2],
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
    await atribuir(U.tecnicoH2, 'tecnico', 'hotel', H2);
    await atribuir(U.solicitante, 'solicitante', 'hotel', H1);

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 4 } });
    const atribuicoes = criarPortasDeAplicacao(banco).atribuicoes;
    const situacoes = criarPortaSituacoes(banco);
    const prioridades = criarPortaPrioridades(banco);
    const configuracaoDeSituacoes = criarCasosDeUsoDeSituacoes({
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
    });
    await configuracaoDeSituacoes.instalarPadrao(ctx(U.admin));
    const lista = await configuracaoDeSituacoes.listarSituacoesEPrioridades(ctx(U.admin));
    for (const p of lista.prioridades) if (p.chavePadrao) prioridade[p.chavePadrao] = p.id;
    situacaoOsAtribuida = lista.situacoes.find((s) => s.chavePadrao === 'os_atribuida')?.id ?? '';

    chamados = criarCasosDeUsoDeChamados({
      chamados: criarPortaChamados(banco),
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
    });
    porta = criarPortaTriagem(banco);
    depsDaTriagem = {
      triagem: porta,
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
    };
    triagem = criarCasosDeUsoDeTriagem(depsDaTriagem);
    // Sem as regras do domínio: só a RLS e o índice decidem.
    semChecagem = criarCasosDeUsoDeTriagem({
      ...depsDaTriagem,
      regras: {
        decidirNoChamado: (acao) => ({
          estado: acao === 'triar' ? 'em_triagem' : 'cancelado',
          motivo: acao === 'cancelar' ? 'Sem checagem' : null,
        }),
        decidirNaOs: () => ({ estado: 'atribuida', chamado: 'em_execucao', motivo: null }),
        podeAjustarPrioridade: () => undefined,
        exigirResponsavelDoHotel: (c) =>
          c.tipo === 'tecnico'
            ? { tipo: 'tecnico', usuarioId: c.usuarioId }
            : { tipo: 'equipe', equipeId: c.equipeId },
      },
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

  it('o Gerente tria com prioridade; a versão vista vale; auditoria e evento', async () => {
    const id = await abrir('Ar-condicionado pingando');
    const { versao } = await triagem.triar(ctx(U.gerente), id, {
      versao: 1,
      prioridadeId: prioridade['alta'],
    });
    expect(versao).toBe(2);
    const c = await chamados.chamado(ctx(U.gerente), id);
    expect(c).toMatchObject({ estado: 'em_triagem', prioridadeId: prioridade['alta'] });

    await expect(
      triagem.priorizar(ctx(U.gerente), id, { versao: 1, prioridadeId: prioridade['baixa'] ?? '' }),
    ).rejects.toMatchObject({ codigo: 'conflito_de_versao', parametros: { versaoAtual: 2 } });
    expect(
      await triagem.priorizar(ctx(U.gerente), id, {
        versao: 2,
        prioridadeId: prioridade['baixa'] ?? '',
      }),
    ).toEqual({ versao: 3 });

    const eventos = await dono.query<{ tipo: string }>(
      `select tipo from app.evento_dominio where tenant_id = $1 and registro_id = $2 order by criado_em, id`,
      [TENANT, id],
    );
    expect(eventos.rows.map((e) => e.tipo)).toEqual([
      'chamado.aberto',
      'chamado.triado',
      'chamado.prioridade_alterada',
    ]);
    const auditoria = await dono.query<{ acao: string }>(
      `select acao from app.auditoria where tenant_id = $1 and entidade = 'chamado' and registro_id = $2 order by em, id`,
      [TENANT, id],
    );
    expect(auditoria.rows.map((a) => a.acao)).toEqual(['abrir', 'triar', 'priorizar']);
  });

  it('Solicitante e Técnico não triam: o domínio recusa e, sem ele, a RLS', async () => {
    const id = await abrir('Tomada solta');
    for (const u of [U.solicitante, U.tecnico])
      await expect(triagem.triar(ctx(u), id, { versao: 1 })).rejects.toMatchObject({
        codigo: 'acao_fora_do_papel',
      });
    await expect(semChecagem.triar(ctx(U.solicitante), id, { versao: 1 })).rejects.toMatchObject({
      codigo: 'chamado_nao_encontrado',
    });
    await expect(
      semChecagem.gerarOs(ctx(U.solicitante), id, { versao: 1, responsavel: doTecnico }),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await versaoDo(id)).toBe(1);
  });

  it('gera a OS para o Técnico; recusa quem não é Técnico do hotel e equipe desativada', async () => {
    const id = await abrir('Chuveiro frio');
    const v = await versaoDo(id);
    await expect(
      triagem.gerarOs(ctx(U.gerente), id, {
        versao: v,
        responsavel: { tipo: 'tecnico', usuarioId: U.tecnicoH2 },
      }),
    ).rejects.toMatchObject({ codigo: 'responsavel_sem_papel_tecnico' });
    await expect(
      triagem.gerarOs(ctx(U.gerente), id, {
        versao: v,
        responsavel: { tipo: 'tecnico', usuarioId: U.solicitante },
      }),
    ).rejects.toMatchObject({ codigo: 'responsavel_sem_papel_tecnico' });
    await expect(
      triagem.gerarOs(ctx(U.gerente), id, {
        versao: v,
        responsavel: { tipo: 'equipe', equipeId: EQ.h1Inativa },
      }),
    ).rejects.toMatchObject({ codigo: 'equipe_indisponivel' });
    await expect(
      triagem.gerarOs(ctx(U.gerente), id, {
        versao: v,
        responsavel: { tipo: 'equipe', equipeId: EQ.h2 },
      }),
    ).rejects.toMatchObject({ codigo: 'equipe_nao_encontrada' });

    const os = await triagem.gerarOs(ctx(U.gerente), id, { versao: v, responsavel: doTecnico });
    expect(os).toMatchObject({ versao: 1, versaoDoChamado: v + 1 });
    expect(await chamados.chamado(ctx(U.gerente), id)).toMatchObject({ estado: 'em_execucao' });
    const [gravada] = await triagem.osDoChamado(ctx(U.tecnico), id);
    expect(gravada).toMatchObject({
      id: os.id,
      estado: 'atribuida',
      situacaoId: situacaoOsAtribuida,
      responsavel: doTecnico,
      criadoPor: U.gerente,
    });

    const evento = await dono.query<{ tipo: string; payload: Record<string, unknown> }>(
      `select tipo, payload from app.evento_dominio where tenant_id = $1 and registro_id = $2`,
      [TENANT, os.id],
    );
    expect(evento.rows).toHaveLength(1);
    expect(evento.rows[0]).toMatchObject({
      tipo: 'os.atribuida',
      payload: { chamadoId: id, acao: 'gerar', responsavel: doTecnico },
    });
    const auditoria = await dono.query<{ acao: string; usuario_id: string }>(
      `select acao, usuario_id from app.auditoria where tenant_id = $1 and entidade = 'os' and registro_id = $2`,
      [TENANT, os.id],
    );
    expect(auditoria.rows).toEqual([{ acao: 'gerar', usuario_id: U.gerente }]);

    await expect(
      triagem.gerarOs(ctx(U.gerente), id, { versao: v + 1, responsavel: daEquipe }),
    ).rejects.toMatchObject({ codigo: 'os_em_andamento' });
  });

  it('reatribui para a equipe, cancela a OS (o chamado volta à triagem) e gera outra', async () => {
    const id = await abrir('Porta não fecha');
    const os = await triagem.gerarOs(ctx(U.gerente), id, {
      versao: await versaoDo(id),
      responsavel: doTecnico,
    });
    expect(
      await triagem.reatribuirOs(ctx(U.admin), os.id, { versao: 1, responsavel: daEquipe }),
    ).toEqual({ versao: 2 });
    await expect(
      triagem.cancelarOs(ctx(U.gerente), os.id, { versao: 1, motivo: 'Errado' }),
    ).rejects.toMatchObject({ codigo: 'conflito_de_versao' });
    await expect(
      triagem.cancelarOs(ctx(U.gerente), os.id, { versao: 2, motivo: '   ' }),
    ).rejects.toMatchObject({ codigo: 'motivo_obrigatorio' });
    await expect(
      triagem.cancelarOs(ctx(U.tecnico), os.id, { versao: 2, motivo: 'Não é comigo' }),
    ).rejects.toMatchObject({ codigo: 'acao_fora_do_papel' });

    const cancelada = await triagem.cancelarOs(ctx(U.gerente), os.id, {
      versao: 2,
      motivo: '  Equipe   de férias ',
    });
    expect(cancelada.versao).toBe(3);
    const c = await chamados.chamado(ctx(U.gerente), id);
    expect(c.estado).toBe('em_triagem');
    expect(c.versao).toBe(cancelada.versaoDoChamado);

    const outra = await triagem.gerarOs(ctx(U.gerente), id, {
      versao: c.versao,
      responsavel: doTecnico,
    });
    const lista = await triagem.osDoChamado(ctx(U.gerente), id);
    expect(lista.map((o) => [o.id, o.estado, o.motivoCancelamento])).toEqual([
      [os.id, 'cancelada', 'Equipe de férias'],
      [outra.id, 'atribuida', null],
    ]);
    const eventos = await dono.query<{ tipo: string }>(
      `select tipo from app.evento_dominio where tenant_id = $1 and registro_id = $2 order by criado_em, id`,
      [TENANT, os.id],
    );
    expect(eventos.rows.map((e) => e.tipo)).toEqual([
      'os.atribuida',
      'os.atribuida',
      'os.cancelada',
    ]);
  });

  it('cancela o chamado antes da OS, com motivo; depois da OS, não', async () => {
    const id = await abrir('Lâmpada queimada');
    await expect(
      triagem.cancelarChamado(ctx(U.gerente), id, { versao: 1, motivo: '' }),
    ).rejects.toMatchObject({ codigo: 'motivo_obrigatorio' });
    expect(
      await triagem.cancelarChamado(ctx(U.gerente), id, { versao: 1, motivo: 'Duplicado' }),
    ).toEqual({ versao: 2 });
    expect(await chamados.chamado(ctx(U.gerente), id)).toMatchObject({
      estado: 'cancelado',
      motivoCancelamento: 'Duplicado',
    });

    const comOs = await abrir('Frigobar');
    await triagem.gerarOs(ctx(U.gerente), comOs, { versao: 1, responsavel: doTecnico });
    await expect(
      triagem.cancelarChamado(ctx(U.gerente), comOs, { versao: 2, motivo: 'Duplicado' }),
    ).rejects.toMatchObject({ codigo: 'transicao_invalida' });
  });

  it('paridade: para cada estado da OS, o domínio e o índice dizem o mesmo', async () => {
    for (const estado of ESTADOS_DA_OS) {
      const id = await abrir(`Paridade ${estado}`);
      await dono.query(
        `insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, motivo_cancelamento, criado_por)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          randomUUID(),
          TENANT,
          H1,
          id,
          L.uh101,
          estado,
          situacaoOsAtribuida,
          U.tecnico,
          estado === 'cancelada' ? 'Teste' : null,
          U.gerente,
        ],
      );
      let dominioRecusa = false;
      try {
        exigirChamadoSemOsEmAndamento([estado as EstadoDaOs]);
      } catch (e) {
        expect(e).toMatchObject({ codigo: 'os_em_andamento' });
        dominioRecusa = true;
      }
      // Sem o domínio: só o índice decide.
      let bancoRecusa = false;
      try {
        await semChecagem.gerarOs(ctx(U.gerente), id, { versao: 1, responsavel: daEquipe });
      } catch (e) {
        expect(e, estado).toMatchObject({ codigo: 'os_em_andamento' });
        bancoRecusa = true;
      }
      expect({ estado, bancoRecusa }).toEqual({ estado, bancoRecusa: dominioRecusa });
      expect(dominioRecusa).toBe(osOcupaOChamado(estado));
    }
  });

  it('duas triagens simultâneas que passam juntas pelo domínio gravam uma OS só', async () => {
    const id = await abrir('Vazamento no teto');
    // As duas leem o chamado e as OS (nenhuma) antes de qualquer uma gravar.
    let chegaram = 0;
    let liberar: () => void = () => undefined;
    const barreira = new Promise<void>((r) => {
      liberar = r;
    });
    const comBarreira: PortaTriagem = {
      ...porta,
      gerarOs: async (c, g) => {
        chegaram += 1;
        if (chegaram === 2) liberar();
        await barreira;
        return porta.gerarOs(c, g);
      },
    };
    const juntas = criarCasosDeUsoDeTriagem({ ...depsDaTriagem, triagem: comBarreira });
    const resultados = await Promise.allSettled([
      juntas.gerarOs(ctx(U.gerente), id, { versao: 1, responsavel: doTecnico }),
      juntas.gerarOs(ctx(U.admin), id, { versao: 1, responsavel: daEquipe }),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const recusada = resultados.find((r) => r.status === 'rejected');
    expect(recusada?.status === 'rejected' && recusada.reason).toMatchObject({
      codigo: 'os_em_andamento',
    });
    const ativas = await dono.query<{ n: number }>(
      `select count(*)::int as n from app.os where chamado_id = $1 and estado <> 'cancelada'`,
      [id],
    );
    expect(ativas.rows[0]?.n).toBe(1);
    // A que perdeu não deixou evento nem auditoria (a transação voltou inteira).
    const eventos = await dono.query<{ n: number }>(
      `select count(*)::int as n from app.evento_dominio where tenant_id = $1 and tipo = 'os.atribuida' and payload->>'chamadoId' = $2`,
      [TENANT, id],
    );
    expect(eventos.rows[0]?.n).toBe(1);
  });
});
