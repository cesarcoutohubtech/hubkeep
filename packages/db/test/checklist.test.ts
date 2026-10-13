// Checklist tipado (fase 1b, PV1; ADR-040) contra Postgres real (na CI, o
// Supabase do runner):
//   - o Admin do grupo cria e altera o modelo; a versão sobe só com os itens;
//     o Gerente não grava (domínio) e, sem a regra, a RLS também não;
//   - o Gerente aplica o modelo na OS gerada, com a cópia (ADR-026): mudar o
//     modelo depois não altera a OS; troca a cópia sem resposta; o técnico
//     não aplica;
//   - o técnico responde pela fila offline: a chave não duplica, as respostas
//     mesclam item a item (null remove), a versão da OS não muda e a
//     auditoria e o evento ficam gravados;
//   - a fila do dia traz o checklist e a política;
//   - a conclusão com a política ligada recusa sem os obrigatórios e conclui
//     com eles.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeChamados,
  criarCasosDeUsoDeChecklists,
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
  criarPortaChecklists,
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
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

const ITENS = [
  {
    chave: 'filtro_limpo',
    tipo: 'sim_nao',
    obrigatorio: true,
    rotulos: { 'pt-BR': 'Filtro limpo' },
    unidade: null,
    opcoes: [],
  },
  {
    chave: 'pressao',
    tipo: 'numero',
    obrigatorio: false,
    rotulos: { 'pt-BR': 'Pressão' },
    unidade: 'psi',
    opcoes: [],
  },
];

describe.skipIf(!temBanco)('PV1 — checklist tipado', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let chamados: ReturnType<typeof criarCasosDeUsoDeChamados>;
  let triagem: ReturnType<typeof criarCasosDeUsoDeTriagem>;
  let checklists: ReturnType<typeof criarCasosDeUsoDeChecklists>;
  let semRegra: ReturnType<typeof criarCasosDeUsoDeChecklists>;
  let execucao: ReturnType<typeof criarCasosDeUsoDeExecucao>;
  let sincronizacao: ReturnType<typeof criarCasosDeUsoDeSincronizacao>;

  async function osAtribuida() {
    const { id: chamadoId } = await chamados.abrir(ctx(U.gerente), {
      localId: UH,
      descricao: `Ar-condicionado ${randomUUID()}`,
    });
    const versaoDoChamado = (await chamados.chamado(ctx(U.gerente), chamadoId)).versao;
    const { id: osId } = await triagem.gerarOs(ctx(U.gerente), chamadoId, {
      versao: versaoDoChamado,
      responsavel: { tipo: 'tecnico', usuarioId: U.tecnico },
    });
    return osId;
  }

  const operar = (tipo: 'os.iniciar' | 'os.concluir', osId: string, versao: number) =>
    sincronizacao.receberOperacao(ctx(U.tecnico), {
      chave: randomUUID(),
      tipo,
      dados: { osId, versao },
    });

  const responder = (osId: string, respostas: Record<string, unknown>, chave = randomUUID()) =>
    sincronizacao.receberOperacao(ctx(U.tecnico), {
      chave,
      tipo: 'os.responder_checklist',
      dados: { osId, respostas, feitaEm: new Date().toISOString() },
    });

  const versaoDaOs = async (osId: string) =>
    (await dono.query<{ versao: number }>(`select versao from app.os where id = $1`, [osId]))
      .rows[0]?.versao;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo PV1')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, 'Hotel', 'UTC', 'ativo')`,
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
    await atribuir(U.tecnico, 'tecnico', 'hotel', H1);

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 4 } });
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
    const portaExecucao = criarPortaExecucao(banco);
    const portaChecklists = criarPortaChecklists(banco);
    chamados = criarCasosDeUsoDeChamados({
      chamados: criarPortaChamados(banco),
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
    });
    triagem = criarCasosDeUsoDeTriagem({
      triagem: portaTriagem,
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
    });
    const depsDoChecklist = {
      checklists: portaChecklists,
      triagem: portaTriagem,
      execucao: portaExecucao,
      atribuicoes,
      relogio: relogioDoSistema,
    };
    checklists = criarCasosDeUsoDeChecklists(depsDoChecklist);
    // Sem as regras do domínio: só a RLS decide.
    semRegra = criarCasosDeUsoDeChecklists({
      ...depsDoChecklist,
      regras: { podeGerir: () => ({ permitido: true }), podeTriar: () => {} },
    });
    execucao = criarCasosDeUsoDeExecucao({
      execucao: portaExecucao,
      triagem: portaTriagem,
      situacoes,
      atribuicoes,
      relogio: relogioDoSistema,
      checklists: portaChecklists,
    });
    sincronizacao = criarCasosDeUsoDeSincronizacao({
      operacoes: criarPortaOperacoesOffline(banco),
      ativos: {
        prepararCadastro: () => Promise.reject(new Error('fora do teste')),
        prepararAlteracao: () => Promise.reject(new Error('fora do teste')),
      },
      chamados,
      execucao,
      checklists,
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.operacao_offline',
      'app.os_checklist',
      'app.checklist_modelo',
      'app.os_transicao',
      'app.os',
      'app.chamado',
      'app.politica',
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

  let modeloId = '';

  it('o Admin cria e altera o modelo; a versão sobe só com os itens', async () => {
    ({ id: modeloId } = await checklists.criarModelo(ctx(U.admin), {
      nomes: { 'pt-BR': 'Inspeção de ar-condicionado' },
      categoriaId: null,
      itens: ITENS,
    }));
    expect(
      await checklists.alterarModelo(ctx(U.admin), modeloId, {
        nomes: { 'pt-BR': 'Inspeção do ar' },
        categoriaId: null,
        itens: ITENS,
      }),
    ).toEqual({ versao: 1 });
    const { modelos } = await checklists.listarModelos(ctx(U.gerente));
    expect(modelos).toMatchObject([
      { id: modeloId, versao: 1, nomes: { 'pt-BR': 'Inspeção do ar' } },
    ]);
    // O técnico não lê os modelos.
    expect((await checklists.listarModelos(ctx(U.tecnico))).modelos).toEqual([]);
  });

  it('o Gerente não grava o modelo: o domínio recusa e, sem a regra, a RLS também', async () => {
    await expect(
      checklists.criarModelo(ctx(U.gerente), {
        nomes: { 'pt-BR': 'x' },
        categoriaId: null,
        itens: [],
      }),
    ).rejects.toMatchObject({ codigo: 'checklists_so_admin' });
    await expect(
      semRegra.criarModelo(ctx(U.gerente), {
        nomes: { 'pt-BR': 'x' },
        categoriaId: null,
        itens: [],
      }),
    ).rejects.toThrow();
    await expect(semRegra.desativarModelo(ctx(U.gerente), modeloId)).rejects.toMatchObject({
      codigo: 'checklist_nao_encontrado',
    });
  });

  it('o Gerente aplica na OS; a cópia não muda com o modelo; o técnico não aplica', async () => {
    const osId = await osAtribuida();
    await checklists.aplicarNaOs(ctx(U.gerente), osId, modeloId);
    await checklists.alterarModelo(ctx(U.admin), modeloId, {
      nomes: { 'pt-BR': 'Inspeção nova' },
      categoriaId: null,
      itens: [ITENS[0]],
    });
    const copia = await checklists.daOs(ctx(U.tecnico), osId);
    expect(copia).toMatchObject({ modeloVersao: 1, nomes: { 'pt-BR': 'Inspeção do ar' } });
    expect(copia?.itens.map((i) => i.chave)).toEqual(['filtro_limpo', 'pressao']);
    await expect(checklists.aplicarNaOs(ctx(U.tecnico), osId, modeloId)).rejects.toMatchObject({
      codigo: 'triagem_fora_do_papel',
    });
    // Sem a regra, a RLS recusa a cópia do técnico.
    const outra = await osAtribuida();
    await expect(semRegra.aplicarNaOs(ctx(U.tecnico), outra, modeloId)).rejects.toThrow();
    // Troca sem resposta: a cópia passa à versão nova do modelo.
    await checklists.aplicarNaOs(ctx(U.gerente), osId, modeloId);
    expect((await checklists.daOs(ctx(U.gerente), osId))?.modeloVersao).toBe(2);
  });

  it('o técnico responde pela fila: sem duplicar, mescla item a item, sem mexer na versão da OS', async () => {
    const osId = await osAtribuida();
    await checklists.aplicarNaOs(ctx(U.gerente), osId, modeloId);
    await operar('os.iniciar', osId, 1);
    const versao = await versaoDaOs(osId);
    const chave = randomUUID();
    const primeira = await responder(osId, { filtro_limpo: false }, chave);
    const reenvio = await responder(osId, { filtro_limpo: false }, chave);
    expect(reenvio).toEqual({ ...primeira, repetida: true });
    await responder(osId, { filtro_limpo: true });
    const c = await checklists.daOs(ctx(U.gerente), osId);
    expect(c?.respostas).toMatchObject({ filtro_limpo: { valor: true, usuarioId: U.tecnico } });
    await responder(osId, { filtro_limpo: null });
    expect((await checklists.daOs(ctx(U.gerente), osId))?.respostas).toEqual({});
    expect(await versaoDaOs(osId)).toBe(versao);
    // Com resposta, a troca do modelo é recusada.
    await responder(osId, { filtro_limpo: true });
    await expect(checklists.aplicarNaOs(ctx(U.gerente), osId, modeloId)).rejects.toMatchObject({
      codigo: 'checklist_ja_respondido',
    });
    const auditoria = await dono.query<{ n: string }>(
      `select count(*) as n from app.auditoria
        where tenant_id = $1 and entidade = 'os_checklist' and acao = 'responder'`,
      [TENANT],
    );
    expect(Number(auditoria.rows[0]?.n)).toBe(4);
    const eventos = await dono.query<{ n: string }>(
      `select count(*) as n from app.evento_dominio
        where tenant_id = $1 and tipo = 'os.checklist_respondido' and registro_id = $2`,
      [TENANT, osId],
    );
    expect(Number(eventos.rows[0]?.n)).toBe(4);
    // Valor fora do tipo: 422, sem guardar a chave.
    await expect(responder(osId, { filtro_limpo: 'sim' })).rejects.toMatchObject({
      codigo: 'checklist_resposta_invalida',
    });
  });

  it('a fila do dia traz o checklist e a política; a conclusão com a política ligada exige os obrigatórios', async () => {
    const osId = await osAtribuida();
    await checklists.aplicarNaOs(ctx(U.gerente), osId, modeloId);
    await operar('os.iniciar', osId, 1);
    await dono.query(
      `insert into app.politica (id, tenant_id, escopo_tipo, hotel_id, chave, valor, atualizado_por)
       values ($1, $2, 'hotel', $3, 'os.checklist_completo_obrigatorio', '{"ligado": true}', $4)`,
      [randomUUID(), TENANT, H1, U.admin],
    );
    const daFila = (await execucao.osDoDia(ctx(U.tecnico))).find((o) => o.id === osId);
    expect(daFila).toMatchObject({
      checklistCompletoObrigatorio: true,
      checklist: { modeloVersao: 2 },
    });
    await expect(operar('os.concluir', osId, 2)).rejects.toMatchObject({
      codigo: 'checklist_incompleto',
    });
    await responder(osId, { filtro_limpo: true });
    await expect(operar('os.concluir', osId, 2)).resolves.toMatchObject({
      resposta: { estado: 'concluida' },
    });
  });
});
