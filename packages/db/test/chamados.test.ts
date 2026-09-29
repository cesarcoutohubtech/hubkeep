// Aceite da C2 (fase 1a; ADR-026, ADR-025) contra Postgres real (na CI, o Supabase do runner):
//   - o Solicitante abre; a prioridade vem da política por categoria e a
//     cópia do que foi aplicado fica no chamado, com a situação inicial;
//   - mudar a política depois não altera o chamado já aberto;
//   - o reenvio da operação offline (chamado.abrir) não duplica o chamado;
//   - UH pendente de licença, ativo de outro local e descrição vazia: 422;
//   - isolamento: o proprietário vê o chamado da UH dele, ou do hotel
//     inteiro dele, e não grava (domínio e, sem a checagem, a RLS); o gerente
//     de outro hotel não vê;
//   - auditoria e evento chamado.aberto na mesma transação.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeChamados,
  criarCasosDeUsoDeConfiguracao,
  criarCasosDeUsoDeSincronizacao,
  criarCasosDeUsoDeSituacoes,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaChamados,
  criarPortaConfiguracao,
  criarPortaOperacoesOffline,
  criarPortaPrioridades,
  criarPortaSituacoes,
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
const L = { uh101: randomUUID(), uh102: randomUUID(), lobby: randomUUID(), h2: randomUUID() };
const CAT = randomUUID();
const SPLIT = randomUUID();
const TV_LOBBY = randomUUID();
const DONO_UH = randomUUID();
const DONO_HOTEL = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  solicitante: randomUUID(),
  gerenteH2: randomUUID(),
  donoUh: randomUUID(),
  donoHotel: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });
const CHAVE = 'chamado.prioridade_padrao_por_categoria';

describe.skipIf(!temBanco)('C2 — abertura do chamado', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let chamados: ReturnType<typeof criarCasosDeUsoDeChamados>;
  let semChecagem: ReturnType<typeof criarCasosDeUsoDeChamados>;
  let configuracao: ReturnType<typeof criarCasosDeUsoDeConfiguracao>;
  let sincronizacao: ReturnType<typeof criarCasosDeUsoDeSincronizacao>;
  const prioridade: Record<string, string> = {};
  let situacaoAberto = '';
  let doSolicitante = '';

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo C2')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values
       ($1, $3, 'Hotel 1', 'UTC', 'ativo'), ($2, $3, 'Hotel 2', 'UTC', 'ativo')`,
      [H1, H2, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
       ($1, $5, $6, 'uh', 'UH 101', 'uh 101', 'ativo'),
       ($2, $5, $6, 'uh', 'UH 102', 'uh 102', 'pendente_licenca'),
       ($3, $5, $6, 'area_comum', 'Lobby', 'lobby', 'ativo'),
       ($4, $5, $7, 'area_comum', 'Lobby H2', 'lobby h2', 'ativo')`,
      [L.uh101, L.uh102, L.lobby, L.h2, TENANT, H1, H2],
    );
    await dono.query(
      `insert into app.categoria_ativo (id, tenant_id, nomes) values ($1, $2, '{"pt-BR": "Climatização"}')`,
      [CAT, TENANT],
    );
    await dono.query(
      `insert into app.ativo (id, tenant_id, hotel_id, local_id, categoria_id, nome, busca, codigo_qr) values
       ($1, $3, $4, $5, $6, 'Split 101', 'split 101', '0000C2A001'),
       ($2, $3, $4, $7, null, 'TV do lobby', 'tv do lobby', '0000C2A002')`,
      [SPLIT, TV_LOBBY, TENANT, H1, L.uh101, CAT, L.lobby],
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
    await dono.query(
      `insert into app.proprietario (id, tenant_id, nome) values ($1, $3, 'Dono da UH'), ($2, $3, 'Dono do Hotel 2')`,
      [DONO_UH, DONO_HOTEL, TENANT],
    );
    await dono.query(
      `insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio)
       values ($1, $2, $3, $4, current_date - 1)`,
      [randomUUID(), TENANT, DONO_UH, L.uh101],
    );
    await dono.query(
      `insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio)
       values ($1, $2, $3, $4, current_date - 1)`,
      [randomUUID(), TENANT, DONO_HOTEL, H2],
    );
    const atribuir = (
      usuario: string,
      papel: string,
      escopo: string,
      hotel: string | null,
      proprietario: string | null = null,
    ) =>
      dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [randomUUID(), TENANT, usuario, papel, escopo, hotel, proprietario, U.admin],
      );
    await atribuir(U.admin, 'admin_grupo', 'grupo', null);
    await atribuir(U.gerente, 'gerente_hotel', 'hotel', H1);
    await atribuir(U.solicitante, 'solicitante', 'hotel', H1);
    await atribuir(U.gerenteH2, 'gerente_hotel', 'hotel', H2);
    await atribuir(U.donoUh, 'proprietario', 'proprietario', null, DONO_UH);
    await atribuir(U.donoHotel, 'proprietario', 'proprietario', null, DONO_HOTEL);

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
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
    situacaoAberto = lista.situacoes.find((s) => s.chavePadrao === 'chamado_aberto')?.id ?? '';

    const deps = {
      chamados: criarPortaChamados(banco),
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
    };
    chamados = criarCasosDeUsoDeChamados(deps);
    semChecagem = criarCasosDeUsoDeChamados({ ...deps, podeAbrir: () => undefined });
    configuracao = criarCasosDeUsoDeConfiguracao({
      configuracao: criarPortaConfiguracao(banco),
      atribuicoes,
      relogio: relogioDoSistema,
    });
    sincronizacao = criarCasosDeUsoDeSincronizacao({
      operacoes: criarPortaOperacoesOffline(banco),
      ativos: {
        prepararCadastro: () => Promise.reject(new Error('fora do teste')),
        prepararAlteracao: () => Promise.reject(new Error('fora do teste')),
      },
      chamados,
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.operacao_offline',
      'app.chamado',
      'app.politica',
      'app.situacao',
      'app.prioridade',
      'app.ativo',
      'app.categoria_ativo',
      'app.atribuicao_escopo',
      'app.local_proprietario',
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

  it('o Solicitante abre; prioridade pela política do grupo, com a cópia e a situação inicial', async () => {
    await configuracao.gravarPolitica(
      ctx(U.admin),
      CHAVE,
      { tipo: 'grupo' },
      {
        [CAT]: prioridade['alta'],
      },
    );
    ({ id: doSolicitante } = await chamados.abrir(ctx(U.solicitante), {
      localId: L.uh101,
      ativoId: SPLIT,
      descricao: '  Split não gela  ',
    }));
    const c = await chamados.chamado(ctx(U.gerente), doSolicitante);
    expect(c).toMatchObject({
      hotelId: H1,
      localId: L.uh101,
      ativoId: SPLIT,
      descricao: 'Split não gela',
      estado: 'aberto',
      situacaoId: situacaoAberto,
      prioridadeId: prioridade['alta'],
      abertoPor: U.solicitante,
      versao: 1,
      politicaAplicada: {
        [CHAVE]: { categoriaId: CAT, prioridadeId: prioridade['alta'], origem: 'categoria' },
      },
    });
    const { rows } = await dono.query(`select busca from app.chamado where id = $1`, [
      doSolicitante,
    ]);
    expect(rows[0]).toEqual({ busca: 'split nao gela' });
  });

  it('mudar a política depois não altera o chamado já aberto', async () => {
    await configuracao.gravarPolitica(
      ctx(U.admin),
      CHAVE,
      { tipo: 'hotel', hotelId: H1 },
      {
        [CAT]: prioridade['urgente'],
      },
    );
    const antigo = await chamados.chamado(ctx(U.gerente), doSolicitante);
    expect(antigo.prioridadeId).toBe(prioridade['alta']);
    expect(antigo.politicaAplicada).toMatchObject({ [CHAVE]: { origem: 'categoria' } });
    const { id } = await chamados.abrir(ctx(U.gerente), {
      localId: L.uh101,
      ativoId: SPLIT,
      descricao: 'Split pingando',
    });
    expect((await chamados.chamado(ctx(U.gerente), id)).prioridadeId).toBe(prioridade['urgente']);
  });

  it('sem categoria (ou sem ativo): a prioridade ativa de menor peso', async () => {
    const semAtivo = await chamados.abrir(ctx(U.gerente), {
      localId: L.lobby,
      descricao: 'Lâmpada queimada',
    });
    const semCategoria = await chamados.abrir(ctx(U.gerente), {
      localId: L.lobby,
      ativoId: TV_LOBBY,
      descricao: 'TV sem sinal',
    });
    for (const { id } of [semAtivo, semCategoria]) {
      const c = await chamados.chamado(ctx(U.gerente), id);
      expect(c.prioridadeId).toBe(prioridade['baixa']);
      expect(c.politicaAplicada).toMatchObject({ [CHAVE]: { origem: 'menor_peso' } });
    }
  });

  it('o reenvio da operação offline não duplica o chamado', async () => {
    const operacao = {
      chave: randomUUID(),
      tipo: 'chamado.abrir' as const,
      dados: { localId: L.uh101, ativoId: null, descricao: 'Chuveiro frio (offline)' },
    };
    const primeira = await sincronizacao.receberOperacao(ctx(U.solicitante), operacao);
    const segunda = await sincronizacao.receberOperacao(ctx(U.solicitante), operacao);
    expect(primeira.repetida).toBe(false);
    expect(segunda).toEqual({ ...primeira, repetida: true });
    const { rows } = await dono.query(
      `select count(*)::int as n from app.chamado where tenant_id = $1 and descricao = 'Chuveiro frio (offline)'`,
      [TENANT],
    );
    expect(rows[0]).toEqual({ n: 1 });
  });

  it('UH pendente, ativo de outro local e descrição vazia: 422 com o código', async () => {
    const s = ctx(U.solicitante);
    await expect(
      chamados.abrir(s, { localId: L.uh102, descricao: 'Tomada solta' }),
    ).rejects.toMatchObject({ codigo: 'chamado_uh_pendente_licenca' });
    await expect(
      chamados.abrir(s, { localId: L.lobby, ativoId: SPLIT, descricao: 'x' }),
    ).rejects.toMatchObject({ codigo: 'chamado_ativo_fora_do_local' });
    await expect(chamados.abrir(s, { localId: L.uh101, descricao: '   ' })).rejects.toMatchObject({
      codigo: 'chamado_descricao_invalida',
    });
  });

  it('isolamento: o proprietário vê o chamado da UH dele, ou do hotel inteiro, e não grava', async () => {
    const { id: doH2 } = await chamados.abrir(ctx(U.gerenteH2), {
      localId: L.h2,
      descricao: 'Porta do lobby emperrada',
    });
    // Dono da UH 101: vê o da UH dele; não vê o do lobby nem o do Hotel 2.
    expect((await chamados.chamado(ctx(U.donoUh), doSolicitante)).id).toBe(doSolicitante);
    await expect(chamados.chamado(ctx(U.donoUh), doH2)).rejects.toMatchObject({
      codigo: 'chamado_nao_encontrado',
    });
    // Dono do Hotel 2 inteiro: vê o do hotel dele, não o do Hotel 1.
    expect((await chamados.chamado(ctx(U.donoHotel), doH2)).id).toBe(doH2);
    await expect(chamados.chamado(ctx(U.donoHotel), doSolicitante)).rejects.toMatchObject({
      codigo: 'chamado_nao_encontrado',
    });
    // Gerente do Hotel 1 não vê o do Hotel 2.
    await expect(chamados.chamado(ctx(U.gerente), doH2)).rejects.toMatchObject({
      codigo: 'chamado_nao_encontrado',
    });
    // Proprietário não abre: 403 pelo domínio e, sem a checagem, a RLS barra.
    await expect(
      chamados.abrir(ctx(U.donoUh), { localId: L.uh101, descricao: 'Quero abrir' }),
    ).rejects.toMatchObject({ codigo: 'chamado_fora_do_escopo' });
    await expect(
      semChecagem.abrir(ctx(U.donoUh), { localId: L.uh101, descricao: 'Quero abrir' }),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('auditoria e evento chamado.aberto na mesma transação', async () => {
    const auditoria = await dono.query(
      `select acao, usuario_id from app.auditoria where tenant_id = $1 and entidade = 'chamado' and registro_id = $2`,
      [TENANT, doSolicitante],
    );
    expect(auditoria.rows).toEqual([{ acao: 'abrir', usuario_id: U.solicitante }]);
    const eventos = await dono.query(
      `select tipo from app.evento_dominio where tenant_id = $1 and registro_id = $2`,
      [TENANT, doSolicitante],
    );
    expect(eventos.rows).toEqual([{ tipo: 'chamado.aberto' }]);
  });
});
