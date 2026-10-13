// Responsável do arrendamento na OS (fase 1c, item 6; ADR-045) contra Postgres
// real (na CI, o Supabase do runner):
//   - no hotel arrendado, a OS nasce com a marca da matriz resolvida no hotel,
//     pela categoria do chamado; a do locador grava a hora do aviso, entra na
//     auditoria (a linha do tempo) e publica os.locador_avisado;
//   - a categoria sem regra fica com a arrendatária, sem aviso;
//   - quem tria ajusta a marca com motivo: o primeiro ajuste para o locador
//     avisa, a volta para a arrendatária mantém a hora, e o aviso não se
//     repete; a mesma marca não grava nada; sem motivo e fora do papel, não;
//   - fora do hotel arrendado, a OS fica sem marca e o ajuste é recusado;
//   - o locador (proprietário do hotel inteiro) lê as OS do hotel e filtra as
//     dele, sem gravar.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeChamados,
  criarCasosDeUsoDeConfiguracao,
  criarCasosDeUsoDeConsultas,
  criarCasosDeUsoDeSituacoes,
  criarCasosDeUsoDeTriagem,
} from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaChamados,
  criarPortaConfiguracao,
  criarPortaConsultasDaCorretiva,
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
/** O hotel arrendado e um próprio, no mesmo grupo. */
const ARRENDADO = randomUUID();
const PROPRIO = randomUUID();
const LOBBY = randomUUID();
const LOBBY_PROPRIO = randomUUID();
/** Ar-condicionado é do locador na matriz do grupo; elétrica não tem regra. */
const CAT_AR = randomUUID();
const CAT_ELETRICA = randomUUID();
const SPLIT = randomUUID();
const QUADRO = randomUUID();
const SPLIT_PROPRIO = randomUUID();
const LOCADOR = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
  locador: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });
const relogio = { agora: () => new Date() };

describe.skipIf(!temBanco)('1c — responsável do arrendamento na OS', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let chamados: ReturnType<typeof criarCasosDeUsoDeChamados>;
  let triagem: ReturnType<typeof criarCasosDeUsoDeTriagem>;
  let consultas: ReturnType<typeof criarCasosDeUsoDeConsultas>;
  const prioridade: Record<string, string> = {};
  const os = { doLocador: '', daArrendataria: '', doProprio: '' };

  /** Abre, tria e gera a OS do ativo, pelo Gerente. */
  async function osDoAtivo(localId: string, ativoId: string): Promise<string> {
    const { id } = await chamados.abrir(ctx(U.gerente), {
      localId,
      ativoId,
      descricao: 'Não liga',
    });
    await triagem.triar(ctx(U.gerente), id, { versao: 1, prioridadeId: prioridade['alta'] });
    const gerada = await triagem.gerarOs(ctx(U.gerente), id, {
      versao: 2,
      responsavel: { tipo: 'tecnico', usuarioId: U.tecnico },
    });
    return gerada.id;
  }

  const marca = async (osId: string) =>
    (
      await dono.query<{ r: string | null; avisado: Date | null; versao: number }>(
        `select responsavel_arrendamento as r, locador_avisado_em as avisado, versao
         from app.os where id = $1`,
        [osId],
      )
    ).rows[0];

  const contar = async (sql: string, ...p: unknown[]) =>
    Number((await dono.query<{ n: string }>(sql, [TENANT, ...p])).rows[0]?.n ?? '0');
  const eventos = (osId: string, tipo: string) =>
    contar(
      `select count(*) as n from app.evento_dominio
       where tenant_id = $1 and registro_id = $2 and tipo = $3`,
      osId,
      tipo,
    );
  const auditorias = (osId: string, acao: string) =>
    contar(
      `select count(*) as n from app.auditoria
       where tenant_id = $1 and entidade = 'os' and registro_id = $2 and acao = $3`,
      osId,
      acao,
    );

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo Arrendado')`, [TENANT]);
    for (const [hotel, nome, modelo] of [
      [ARRENDADO, 'Hotel Arrendado', 'arrendado'],
      [PROPRIO, 'Hotel Próprio', 'proprio'],
    ])
      await dono.query(
        `insert into app.hotel (id, tenant_id, nome, fuso, status, modelo_contratual)
         values ($1, $2, $3, 'America/Sao_Paulo', 'ativo', $4)`,
        [hotel, TENANT, nome, modelo],
      );
    for (const [local, hotel] of [
      [LOBBY, ARRENDADO],
      [LOBBY_PROPRIO, PROPRIO],
    ])
      await dono.query(
        `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
         values ($1, $2, $3, 'area_comum', 'Lobby', 'lobby', 'ativo')`,
        [local, TENANT, hotel],
      );
    await dono.query(
      `insert into app.categoria_ativo (id, tenant_id, nomes) values
       ($1, $3, '{"pt-BR": "Ar-condicionado"}'), ($2, $3, '{"pt-BR": "Elétrica"}')`,
      [CAT_AR, CAT_ELETRICA, TENANT],
    );
    for (const [ativo, hotel, local, categoria, nome, qr] of [
      [SPLIT, ARRENDADO, LOBBY, CAT_AR, 'Split do lobby', '0000AR0001'],
      [QUADRO, ARRENDADO, LOBBY, CAT_ELETRICA, 'Quadro geral', '0000AR0002'],
      [SPLIT_PROPRIO, PROPRIO, LOBBY_PROPRIO, CAT_AR, 'Split do próprio', '0000AR0003'],
    ])
      await dono.query(
        `insert into app.ativo (id, tenant_id, hotel_id, local_id, categoria_id, nome, busca, codigo_qr)
         values ($1, $2, $3, $4, $5, $6, $6, $7)`,
        [ativo, TENANT, hotel, local, categoria, nome, qr],
      );
    for (const [nome, u] of Object.entries(U)) {
      await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
        u,
        `${u}@hubkeep.invalid`,
      ]);
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
        [TENANT, u, nome, `${u}@hubkeep.invalid`],
      );
    }
    const atribuir = (usuario: string, papel: string, escopo: string, hotel: string | null) =>
      dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), TENANT, usuario, papel, escopo, hotel, U.admin],
      );
    await atribuir(U.admin, 'admin_grupo', 'grupo', null);
    for (const hotel of [ARRENDADO, PROPRIO]) {
      await atribuir(U.gerente, 'gerente_hotel', 'hotel', hotel);
      await atribuir(U.tecnico, 'tecnico', 'hotel', hotel);
    }
    // O locador é o proprietário do hotel arrendado inteiro (ADR-031).
    await dono.query(
      `insert into app.proprietario (id, tenant_id, nome) values ($1, $2, 'Locador')`,
      [LOCADOR, TENANT],
    );
    await dono.query(
      `insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio)
       values ($1, $2, $3, $4, current_date - 1)`,
      [randomUUID(), TENANT, LOCADOR, ARRENDADO],
    );
    await dono.query(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, proprietario_id, concedido_por)
       values ($1, $2, $3, 'proprietario', 'proprietario', $4, $5)`,
      [randomUUID(), TENANT, U.locador, LOCADOR, U.admin],
    );

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    const atribuicoes = criarPortasDeAplicacao(banco).atribuicoes;
    const situacoes = criarPortaSituacoes(banco);
    const prioridades = criarPortaPrioridades(banco);
    const instalar = criarCasosDeUsoDeSituacoes({ situacoes, prioridades, atribuicoes, relogio });
    await instalar.instalarPadrao(ctx(U.admin));
    const lista = await instalar.listarSituacoesEPrioridades(ctx(U.admin));
    for (const p of lista.prioridades) if (p.chavePadrao) prioridade[p.chavePadrao] = p.id;

    const comuns = { situacoes, prioridades, atribuicoes, relogio };
    chamados = criarCasosDeUsoDeChamados({
      ...comuns,
      chamados: criarPortaChamados(banco),
      feriadosOficiais: semFeriadosOficiais,
    });
    triagem = criarCasosDeUsoDeTriagem({
      ...comuns,
      triagem: criarPortaTriagem(banco),
      feriadosOficiais: semFeriadosOficiais,
    });
    consultas = criarCasosDeUsoDeConsultas({ consultas: criarPortaConsultasDaCorretiva(banco) });
    await criarCasosDeUsoDeConfiguracao({
      configuracao: criarPortaConfiguracao(banco),
      atribuicoes,
      relogio,
    }).gravarPolitica(
      ctx(U.admin),
      'hotel.matriz_arrendamento',
      { tipo: 'grupo' },
      { [CAT_AR]: 'locador' },
    );
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.os_transicao',
      'app.os',
      'app.chamado',
      'app.politica',
      'app.situacao',
      'app.prioridade',
      'app.ativo',
      'app.categoria_ativo',
      'app.atribuicao_escopo',
      'app.hotel_proprietario',
      'app.proprietario',
      'app.local',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  it('a OS da categoria do locador nasce marcada, com o aviso registrado uma vez', async () => {
    os.doLocador = await osDoAtivo(LOBBY, SPLIT);
    const m = await marca(os.doLocador);
    expect(m?.r).toBe('locador');
    expect(m?.avisado).toBeInstanceOf(Date);
    expect(await eventos(os.doLocador, 'os.locador_avisado')).toBe(1);
    expect(await auditorias(os.doLocador, 'avisar_locador')).toBe(1);
    const gerar = await dono.query<{ depois: Record<string, unknown> }>(
      `select depois from app.auditoria
       where tenant_id = $1 and registro_id = $2 and acao = 'gerar'`,
      [TENANT, os.doLocador],
    );
    expect(gerar.rows[0]?.depois).toMatchObject({ responsavelArrendamento: 'locador' });
  });

  it('a categoria sem regra fica com a arrendatária, sem aviso', async () => {
    os.daArrendataria = await osDoAtivo(LOBBY, QUADRO);
    const m = await marca(os.daArrendataria);
    expect(m?.r).toBe('arrendataria');
    expect(m?.avisado).toBeNull();
    expect(await eventos(os.daArrendataria, 'os.locador_avisado')).toBe(0);
  });

  it('o ajuste com motivo: o primeiro para o locador avisa, a volta mantém a hora', async () => {
    const id = os.daArrendataria;
    let versao = (await marca(id))?.versao ?? 0;
    await expect(
      triagem.ajustarArrendamento(ctx(U.gerente), id, {
        versao,
        responsavel: 'locador',
        motivo: '  ',
      }),
    ).rejects.toMatchObject({ codigo: 'motivo_obrigatorio' });
    await expect(
      triagem.ajustarArrendamento(ctx(U.tecnico), id, {
        versao,
        responsavel: 'locador',
        motivo: 'Cláusula 7',
      }),
    ).rejects.toMatchObject({ codigo: 'triagem_fora_do_papel' });

    ({ versao } = await triagem.ajustarArrendamento(ctx(U.gerente), id, {
      versao,
      responsavel: 'locador',
      motivo: 'Cláusula 7 do contrato',
    }));
    let m = await marca(id);
    expect(m?.r).toBe('locador');
    const avisado = m?.avisado;
    expect(avisado).toBeInstanceOf(Date);
    expect(await eventos(id, 'os.arrendamento_ajustado')).toBe(1);
    expect(await eventos(id, 'os.locador_avisado')).toBe(1);
    const ajuste = await dono.query<{
      antes: Record<string, unknown>;
      depois: Record<string, unknown>;
    }>(
      `select antes, depois from app.auditoria
       where tenant_id = $1 and registro_id = $2 and acao = 'ajustar_arrendamento'`,
      [TENANT, id],
    );
    expect(ajuste.rows[0]?.antes).toMatchObject({ responsavelArrendamento: 'arrendataria' });
    expect(ajuste.rows[0]?.depois).toMatchObject({
      responsavelArrendamento: 'locador',
      motivo: 'Cláusula 7 do contrato',
    });

    // A volta para a arrendatária mantém a hora do aviso (decisão 8).
    ({ versao } = await triagem.ajustarArrendamento(ctx(U.admin), id, {
      versao,
      responsavel: 'arrendataria',
      motivo: 'Revisão do contrato',
    }));
    m = await marca(id);
    expect(m?.r).toBe('arrendataria');
    expect(m?.avisado?.toISOString()).toBe(avisado?.toISOString());

    // De novo para o locador: o aviso não se repete.
    ({ versao } = await triagem.ajustarArrendamento(ctx(U.gerente), id, {
      versao,
      responsavel: 'locador',
      motivo: 'Cláusula 7, afinal',
    }));
    expect(await eventos(id, 'os.locador_avisado')).toBe(1);
    expect(await auditorias(id, 'ajustar_arrendamento')).toBe(3);

    // A mesma marca não grava nada.
    const mesma = await triagem.ajustarArrendamento(ctx(U.gerente), id, {
      versao,
      responsavel: 'locador',
      motivo: 'Sem mudança',
    });
    expect(mesma.versao).toBe(versao);
    expect(await auditorias(id, 'ajustar_arrendamento')).toBe(3);
  });

  it('fora do hotel arrendado, a OS fica sem marca e o ajuste é recusado', async () => {
    os.doProprio = await osDoAtivo(LOBBY_PROPRIO, SPLIT_PROPRIO);
    const m = await marca(os.doProprio);
    expect(m?.r).toBeNull();
    expect(m?.avisado).toBeNull();
    await expect(
      triagem.ajustarArrendamento(ctx(U.gerente), os.doProprio, {
        versao: m?.versao ?? 0,
        responsavel: 'locador',
        motivo: 'Não vale',
      }),
    ).rejects.toMatchObject({ codigo: 'os_sem_arrendamento' });
  });

  it('o locador lê as OS do hotel arrendado e filtra as dele, sem gravar', async () => {
    const ids = async (quem: string, doLocador: boolean) =>
      (await consultas.listarOs(ctx(quem), { doLocador })).itens.map((o) => o.id).sort();
    expect(await ids(U.locador, false)).toEqual([os.doLocador, os.daArrendataria].sort());
    expect(await ids(U.locador, true)).toEqual([os.doLocador, os.daArrendataria].sort());
    const lista = await consultas.listarOs(ctx(U.gerente), { doLocador: false });
    const doProprio = lista.itens.find((o) => o.id === os.doProprio);
    expect(doProprio?.responsavelArrendamento).toBeNull();
    expect(lista.itens.find((o) => o.id === os.doLocador)?.responsavelArrendamento).toBe('locador');
    // As duas do arrendado estão com o locador agora; o filtro tira a do próprio, sem marca.
    expect(await ids(U.gerente, true)).toEqual([os.doLocador, os.daArrendataria].sort());
    await expect(
      triagem.ajustarArrendamento(ctx(U.locador), os.doLocador, {
        versao: (await marca(os.doLocador))?.versao ?? 0,
        responsavel: 'arrendataria',
        motivo: 'Não sou eu',
      }),
    ).rejects.toMatchObject({ codigo: 'triagem_fora_do_papel' });
  });
});
