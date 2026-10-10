// Códigos de falha, causa e solução (fase 1b, I6) contra Postgres real (na
// CI, o Supabase do runner):
//   - o Admin do grupo instala os padrão (idempotente), cria, renomeia,
//     desativa e reativa, com auditoria e evento;
//   - o Gerente não gere (403) e, com a checagem removida, a RLS ainda barra;
//   - os códigos que servem para a OS: da categoria do ativo primeiro, sem os
//     de outra categoria nem os desativados;
//   - a conclusão no PWA grava os códigos que servem, descarta os outros e
//     nunca é recusada por eles;
//   - o aceite: com a política os.codigos_obrigatorios desligada (padrão),
//     aceita sem código; ligada no hotel, recusa sem os três e aceita com os
//     três, gravando-os; código de outra categoria é recusado.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeCategorias,
  criarCasosDeUsoDeChamados,
  criarCasosDeUsoDeCodigos,
  criarCasosDeUsoDeExecucao,
  criarCasosDeUsoDeSincronizacao,
  criarCasosDeUsoDeSituacoes,
  criarCasosDeUsoDeTriagem,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import { CODIGOS_PADRAO, type CodigosSugeridos } from '@hubkeep/dominio';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaCategorias,
  criarPortaChamados,
  criarPortaCodigos,
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
const FRIGOBAR = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

describe.skipIf(!temBanco)('I6 — códigos de falha, causa e solução', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let codigos: ReturnType<typeof criarCasosDeUsoDeCodigos>;
  let semChecagem: ReturnType<typeof criarCasosDeUsoDeCodigos>;
  let chamados: ReturnType<typeof criarCasosDeUsoDeChamados>;
  let triagem: ReturnType<typeof criarCasosDeUsoDeTriagem>;
  let sincronizacao: ReturnType<typeof criarCasosDeUsoDeSincronizacao>;
  const categoria: Record<string, string> = {};
  /** Id do código padrão por chave. */
  const padrao: Record<string, string> = {};

  const contar = async (sqlTexto: string, params: unknown[]) =>
    (await dono.query<{ n: number }>(sqlTexto, params)).rows[0]?.n;

  /** Chamado do frigobar aberto pelo Gerente, OS do Técnico, iniciada; devolve a versão da OS. */
  async function osIniciada() {
    const { id: chamadoId } = await chamados.abrir(ctx(U.gerente), {
      localId: UH,
      ativoId: FRIGOBAR,
      descricao: `Frigobar ${randomUUID()}`,
    });
    const versaoDoChamado = (await chamados.chamado(ctx(U.gerente), chamadoId)).versao;
    const { id: osId } = await triagem.gerarOs(ctx(U.gerente), chamadoId, {
      versao: versaoDoChamado,
      responsavel: { tipo: 'tecnico', usuarioId: U.tecnico },
    });
    await sincronizacao.receberOperacao(ctx(U.tecnico), {
      chave: randomUUID(),
      tipo: 'os.iniciar',
      dados: { osId, versao: 1 },
    });
    return { chamadoId, osId, versao: 2 };
  }

  /** Conclui pela fila do PWA, com os códigos sugeridos; devolve a resposta e a versão nova. */
  async function concluir(osId: string, versao: number, sugeridos?: CodigosSugeridos) {
    const { resposta } = await sincronizacao.receberOperacao(ctx(U.tecnico), {
      chave: randomUUID(),
      tipo: 'os.concluir',
      dados: { osId, versao, ...(sugeridos ? { codigos: sugeridos } : {}) },
    });
    return { resposta, versao: versao + 1 };
  }

  const codigosDaOs = async (osId: string) =>
    (
      await dono.query<{ falha: string | null; causa: string | null; solucao: string | null }>(
        `select codigo_falha_id as falha, codigo_causa_id as causa, codigo_solucao_id as solucao
           from app.os where id = $1`,
        [osId],
      )
    ).rows[0];

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo I6')`, [TENANT]);
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
    const portaCategorias = criarPortaCategorias(banco);
    await criarCasosDeUsoDeSituacoes({
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
    }).instalarPadrao(ctx(U.admin));
    const casosDeCategorias = criarCasosDeUsoDeCategorias({
      categorias: portaCategorias,
      atribuicoes,
      relogio: relogioDoSistema,
    });
    await casosDeCategorias.instalarCategoriasPadrao(ctx(U.admin));
    for (const c of (await casosDeCategorias.listarCategorias(ctx(U.admin))).categorias)
      if (c.chavePadrao) categoria[c.chavePadrao] = c.id;
    await dono.query(
      `insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, categoria_id, nome, busca)
       values ($1, $2, $3, $4, $5, $6, 'Frigobar 101', 'frigobar 101')`,
      ['CODIGO0001', FRIGOBAR, TENANT, H1, UH, categoria['refrigeracao']],
    );

    const portaCodigos = criarPortaCodigos(banco);
    const portaTriagem = criarPortaTriagem(banco);
    const depsDosCodigos = {
      codigos: portaCodigos,
      categorias: portaCategorias,
      triagem: portaTriagem,
      atribuicoes,
      relogio: relogioDoSistema,
    };
    codigos = criarCasosDeUsoDeCodigos(depsDosCodigos);
    // Sem a regra do domínio: só a RLS decide quem grava.
    semChecagem = criarCasosDeUsoDeCodigos({
      ...depsDosCodigos,
      podeGerir: () => ({ permitido: true }),
    });
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
      codigos: portaCodigos,
      atribuicoes,
      relogio: relogioDoSistema,
    });
    const execucao = criarCasosDeUsoDeExecucao({
      execucao: criarPortaExecucao(banco),
      triagem: portaTriagem,
      situacoes,
      atribuicoes,
      relogio: relogioDoSistema,
      codigos: portaCodigos,
    });
    sincronizacao = criarCasosDeUsoDeSincronizacao({
      operacoes: criarPortaOperacoesOffline(banco),
      ativos: {
        prepararCadastro: () => Promise.reject(new Error('fora do teste')),
        prepararAlteracao: () => Promise.reject(new Error('fora do teste')),
      },
      chamados,
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
      'app.chamado',
      'app.ativo',
      'app.codigo_manutencao',
      'app.categoria_ativo',
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

  it('o Admin instala os padrão do catálogo; chamar de novo não repete', async () => {
    expect(await codigos.instalarCodigosPadrao(ctx(U.admin))).toEqual({
      instalados: CODIGOS_PADRAO.length,
    });
    expect(await codigos.instalarCodigosPadrao(ctx(U.admin))).toEqual({ instalados: 0 });
    const lista = await codigos.listarCodigos(ctx(U.admin));
    expect(lista.idiomaPadrao).toBe('pt-BR');
    for (const c of lista.codigos) if (c.chavePadrao) padrao[c.chavePadrao] = c.id;
    expect(lista.codigos.find((c) => c.chavePadrao === 'falha_nao_refrigera')).toMatchObject({
      tipo: 'falha',
      categoriaId: categoria['refrigeracao'],
      nomes: {},
      ativa: true,
    });
    expect(lista.codigos.find((c) => c.chavePadrao === 'causa_mau_uso')).toMatchObject({
      tipo: 'causa',
      categoriaId: null,
    });
    // Quem lê o hotel lê os códigos (o Técnico, para a sugestão no PWA).
    expect((await codigos.listarCodigos(ctx(U.tecnico))).codigos).toHaveLength(
      lista.codigos.length,
    );
  });

  it('o Admin cria, renomeia, desativa e reativa, com auditoria e evento', async () => {
    const admin = ctx(U.admin);
    const { id } = await codigos.criarCodigo(admin, {
      tipo: 'falha',
      categoriaId: categoria['refrigeracao'] ?? null,
      nomes: { 'pt-BR': 'Borracha da porta solta' },
    });
    await codigos.alterarCodigo(admin, id, { 'pt-BR': 'Vedação da porta solta', en: 'Loose seal' });
    await codigos.desativarCodigo(admin, id);
    expect((await codigos.listarCodigos(admin)).codigos.find((c) => c.id === id)).toMatchObject({
      nomes: { 'pt-BR': 'Vedação da porta solta', en: 'Loose seal' },
      ativa: false,
    });
    await codigos.reativarCodigo(admin, id);
    expect(
      await contar(
        `select count(*)::int as n from app.auditoria where tenant_id = $1 and registro_id = $2`,
        [TENANT, id],
      ),
    ).toBe(4);
    expect(
      (
        await dono.query<{ tipo: string }>(
          `select tipo from app.evento_dominio where tenant_id = $1 and registro_id = $2 order by criado_em, id`,
          [TENANT, id],
        )
      ).rows.map((r) => r.tipo),
    ).toEqual([
      'codigo_manutencao.criado',
      'codigo_manutencao.alterado',
      'codigo_manutencao.alterado',
      'codigo_manutencao.alterado',
    ]);
    await expect(
      codigos.criarCodigo(admin, { tipo: 'defeito', categoriaId: null, nomes: { 'pt-BR': 'X' } }),
    ).rejects.toMatchObject({ codigo: 'codigo_tipo_invalido' });
    await expect(
      codigos.criarCodigo(admin, { tipo: 'causa', categoriaId: null, nomes: {} }),
    ).rejects.toMatchObject({ codigo: 'codigo_nome_invalido' });
    await expect(
      codigos.criarCodigo(admin, {
        tipo: 'causa',
        categoriaId: randomUUID(),
        nomes: { 'pt-BR': 'X' },
      }),
    ).rejects.toMatchObject({ codigo: 'categoria_nao_encontrada' });
  });

  it('o Gerente não gere; com a checagem removida, a RLS ainda barra', async () => {
    const gerente = ctx(U.gerente);
    const novo = { tipo: 'causa', categoriaId: null, nomes: { 'pt-BR': 'X' } };
    await expect(codigos.criarCodigo(gerente, novo)).rejects.toMatchObject({
      codigo: 'codigos_so_admin',
    });
    await expect(semChecagem.criarCodigo(gerente, novo)).rejects.toMatchObject({ code: '42501' });
    await expect(
      semChecagem.desativarCodigo(gerente, padrao['causa_mau_uso'] ?? ''),
    ).rejects.toMatchObject({ codigo: 'codigo_nao_encontrado' });
  });

  it('os códigos da OS: da categoria do ativo primeiro, sem outra categoria nem desativados', async () => {
    const admin = ctx(U.admin);
    const { osId } = await osIniciada();
    await codigos.desativarCodigo(admin, padrao['falha_quebra'] ?? '');
    const r = await codigos.codigosParaOs(ctx(U.gerente), osId);
    expect(r.falha.slice(0, 2)).toEqual([
      padrao['falha_nao_refrigera'],
      padrao['falha_gelo_excessivo'],
    ]);
    expect(r.falha).toContain(padrao['falha_nao_liga']);
    expect(r.falha).not.toContain(padrao['falha_sem_energia']);
    expect(r.falha).not.toContain(padrao['falha_quebra']);
    expect(r.causa).toContain(padrao['causa_mau_uso']);
    await codigos.reativarCodigo(admin, padrao['falha_quebra'] ?? '');
  });

  it('a conclusão grava o que serve, descarta o resto e nunca é recusada', async () => {
    const { osId, versao } = await osIniciada();
    const { resposta } = await concluir(osId, versao, {
      falhaId: padrao['falha_sem_energia'], // de outra categoria (elétrica)
      causaId: padrao['causa_desgaste_natural'],
      solucaoId: randomUUID(), // não existe
    });
    expect(resposta).toMatchObject({ estado: 'concluida', codigosDescartados: 2 });
    expect(await codigosDaOs(osId)).toEqual({
      falha: null,
      causa: padrao['causa_desgaste_natural'],
      solucao: null,
    });
    const auditoria = (
      await dono.query<{ depois: { codigosDescartados: unknown[] } }>(
        `select depois from app.auditoria where tenant_id = $1 and registro_id = $2 and acao = 'concluir'`,
        [TENANT, osId],
      )
    ).rows[0];
    expect(auditoria?.depois.codigosDescartados).toEqual([
      { tipo: 'falha', motivo: 'codigo_de_outra_categoria' },
      { tipo: 'solucao', motivo: 'codigo_nao_encontrado' },
    ]);
  });

  it('com a política desligada (padrão), o aceite não cobra os códigos', async () => {
    const { osId, versao } = await osIniciada();
    const concluida = await concluir(osId, versao);
    await expect(
      triagem.aceitarOs(ctx(U.gerente), osId, { versao: concluida.versao }),
    ).resolves.toMatchObject({ versao: concluida.versao + 1 });
    expect(await codigosDaOs(osId)).toEqual({ falha: null, causa: null, solucao: null });
  });

  it('com a política ligada no hotel, o aceite exige os três e grava o que foi confirmado', async () => {
    await dono.query(
      `insert into app.politica (id, tenant_id, escopo_tipo, hotel_id, chave, valor, atualizado_por)
       values ($1, $2, 'hotel', $3, 'os.codigos_obrigatorios', '{"ligado": true}', $4)`,
      [randomUUID(), TENANT, H1, U.admin],
    );
    const { osId, versao } = await osIniciada();
    const concluida = await concluir(osId, versao, { causaId: padrao['causa_mau_uso'] });
    const gerente = ctx(U.gerente);
    await expect(
      triagem.aceitarOs(gerente, osId, { versao: concluida.versao }),
    ).rejects.toMatchObject({
      codigo: 'codigos_obrigatorios_no_aceite',
      parametros: { faltam: 2 },
    });
    const tres = {
      falhaId: padrao['falha_nao_refrigera'] ?? null,
      causaId: padrao['causa_mau_uso'] ?? null,
      solucaoId: padrao['solucao_troca_de_peca'] ?? null,
    };
    await expect(
      triagem.aceitarOs(gerente, osId, {
        versao: concluida.versao,
        codigos: { ...tres, falhaId: padrao['falha_sem_energia'] ?? null },
      }),
    ).rejects.toMatchObject({ codigo: 'codigo_de_outra_categoria', parametros: { tipo: 'falha' } });
    await expect(
      triagem.aceitarOs(gerente, osId, { versao: concluida.versao, codigos: tres }),
    ).resolves.toMatchObject({ versao: concluida.versao + 1 });
    expect(await codigosDaOs(osId)).toEqual({
      falha: tres.falhaId,
      causa: tres.causaId,
      solucao: tres.solucaoId,
    });
  });
});
