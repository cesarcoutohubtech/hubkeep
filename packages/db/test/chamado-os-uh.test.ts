// Aceite da I4 (fase 1b) contra Postgres real (na CI, o Supabase do runner):
//   - a abertura grava a origem (interna), o impacto no hóspede e, com a UH
//     indisponível, o período aberto da UH na mesma unit of work; área comum
//     não tem período; a operação offline antiga, sem os campos, continua
//     valendo;
//   - a triagem gera a OS com quem executa (equipe interna por padrão, ou um
//     fornecedor ativo do grupo) e corrige até a conclusão; o técnico não
//     corrige, e sem a regra do domínio a RLS recusa o técnico sem a OS;
//   - a triagem corrige o impacto no hóspede; o proprietário, não;
//   - o aceite grava o custo informado, e o custo inválido é recusado;
//   - a gestão marca a UH depois da abertura e libera; um período aberto por
//     chamado; o técnico não marca;
//   - na conclusão, "UH liberada" encerra o período na mesma operação, uma
//     vez só; a fila do dia mostra a UH indisponível;
//   - o cancelamento do chamado encerra o período aberto;
//   - o proprietário vê só a UH, o estado e as datas;
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
  criarCasosDeUsoDeUhIndisponivel,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaChamados,
  criarPortaConsultasDaCorretiva,
  criarPortaExecucao,
  criarPortaOperacoesOffline,
  criarPortaParadas,
  criarPortaPrioridades,
  criarPortaSituacoes,
  criarPortaTriagem,
  criarPortaUhIndisponivel,
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
const UH = randomUUID();
const LOBBY = randomUUID();
const PROPRIETARIO = randomUUID();
const FORNECEDOR = randomUUID();
const FORNECEDOR_INATIVO = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
  outro: randomUUID(),
  dono: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });
const haHoras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

describe.skipIf(!temBanco)('I4 — chamado, OS e UH indisponível', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let chamados: ReturnType<typeof criarCasosDeUsoDeChamados>;
  let triagem: ReturnType<typeof criarCasosDeUsoDeTriagem>;
  let triagemSemRegra: ReturnType<typeof criarCasosDeUsoDeTriagem>;
  let execucao: ReturnType<typeof criarCasosDeUsoDeExecucao>;
  let sincronizacao: ReturnType<typeof criarCasosDeUsoDeSincronizacao>;
  let uh: ReturnType<typeof criarCasosDeUsoDeUhIndisponivel>;

  const contar = async (sqlTexto: string, params: unknown[]) =>
    (await dono.query<{ n: number }>(sqlTexto, params)).rows[0]?.n;
  const abertosDo = (chamadoId: string) =>
    contar(
      `select count(*)::int as n from app.uh_indisponivel where chamado_id = $1 and fim is null`,
      [chamadoId],
    );

  /** Chamado da UH, com a OS do técnico já iniciada (versão 2). */
  async function osEmExecucao(abertura: { uhIndisponivelDesde?: string } = {}) {
    const { id: chamadoId } = await chamados.abrir(ctx(U.gerente), {
      localId: UH,
      descricao: `Chamado ${randomUUID()}`,
      ...abertura,
    });
    const { id: osId } = await triagem.gerarOs(ctx(U.gerente), chamadoId, {
      versao: 1,
      responsavel: { tipo: 'tecnico', usuarioId: U.tecnico },
    });
    await sincronizacao.receberOperacao(ctx(U.tecnico), {
      chave: randomUUID(),
      tipo: 'os.iniciar',
      dados: { osId, versao: 1 },
    });
    return { chamadoId, osId };
  }
  const concluir = (osId: string, uhLiberada: boolean | undefined, chave: string = randomUUID()) =>
    sincronizacao.receberOperacao(ctx(U.tecnico), {
      chave,
      tipo: 'os.concluir',
      dados: {
        osId,
        versao: 2,
        ...(uhLiberada === undefined ? {} : { uhLiberada }),
        concluidaEm: new Date().toISOString(),
      },
    });

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo I4')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, 'Hotel 1', 'UTC', 'ativo')`,
      [H1, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
         ($1, $3, $4, 'uh', 'UH 101', 'uh 101', 'ativo'),
         ($2, $3, $4, 'area_comum', 'Lobby', 'lobby', 'ativo')`,
      [UH, LOBBY, TENANT, H1],
    );
    await dono.query(
      `insert into app.fornecedor (id, tenant_id, nome, desativado_em) values
         ($1, $3, 'Refrigeração Ativa', null),
         ($2, $3, 'Refrigeração Antiga', now())`,
      [FORNECEDOR, FORNECEDOR_INATIVO, TENANT],
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
    for (const t of [U.tecnico, U.outro]) await atribuir(t, 'tecnico', 'hotel', H1);
    await dono.query(
      `insert into app.proprietario (id, tenant_id, nome) values ($1, $2, 'Dono da UH')`,
      [PROPRIETARIO, TENANT],
    );
    await dono.query(
      `insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio)
       values ($1, $2, $3, $4, current_date - 1)`,
      [randomUUID(), TENANT, PROPRIETARIO, UH],
    );
    await dono.query(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, proprietario_id, concedido_por)
       values ($1, $2, $3, 'proprietario', 'proprietario', $4, $5)`,
      [randomUUID(), TENANT, U.dono, PROPRIETARIO, U.admin],
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
    const portaChamados = criarPortaChamados(banco);
    chamados = criarCasosDeUsoDeChamados({
      chamados: portaChamados,
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
      feriadosOficiais: semFeriadosOficiais,
    });
    const portaTriagem = criarPortaTriagem(banco);
    const depsDaTriagem = {
      triagem: portaTriagem,
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
      feriadosOficiais: semFeriadosOficiais,
    };
    triagem = criarCasosDeUsoDeTriagem(depsDaTriagem);
    // Sem a regra do domínio: só a RLS decide.
    triagemSemRegra = criarCasosDeUsoDeTriagem({
      ...depsDaTriagem,
      regras: { podeAjustarQuemExecuta: () => undefined, podeInformarImpacto: () => undefined },
    });
    const portaUh = criarPortaUhIndisponivel(banco);
    execucao = criarCasosDeUsoDeExecucao({
      execucao: criarPortaExecucao(banco),
      triagem: portaTriagem,
      situacoes,
      atribuicoes,
      relogio: relogioDoSistema,
      paradas: criarPortaParadas(banco),
      uh: portaUh,
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
    uh = criarCasosDeUsoDeUhIndisponivel({
      uh: portaUh,
      chamados: portaChamados,
      triagem: portaTriagem,
      atribuicoes,
      relogio: relogioDoSistema,
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.operacao_offline',
      'app.uh_indisponivel',
      'app.os_transicao',
      'app.os',
      'app.chamado',
      'app.fornecedor',
      'app.situacao',
      'app.prioridade',
      'app.atribuicao_escopo',
      'app.local_proprietario',
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

  it('abertura: origem interna, impacto e o período aberto da UH na mesma unit of work', async () => {
    const desde = haHoras(1);
    const { id } = await chamados.abrir(ctx(U.gerente), {
      localId: UH,
      descricao: 'Chuveiro sem água quente',
      impactoHospede: true,
      uhIndisponivelDesde: desde,
    });
    const c = await chamados.chamado(ctx(U.gerente), id);
    expect(c).toMatchObject({ origem: 'interno', impactoHospede: true });
    const periodos = await uh.doChamado(ctx(U.gerente), id);
    expect(periodos).toHaveLength(1);
    expect(periodos[0]).toMatchObject({ localId: UH, fim: null, abertaPor: U.gerente });
    expect(periodos[0]?.inicio.toISOString()).toBe(desde);
    expect(
      await contar(
        `select count(*)::int as n from app.auditoria
         where tenant_id = $1 and entidade = 'uh_indisponivel' and acao = 'marcar'`,
        [TENANT],
      ),
    ).toBe(1);
    expect(
      await contar(
        `select count(*)::int as n from app.evento_dominio
         where tenant_id = $1 and tipo = 'uh.indisponivel' and registro_id = $2`,
        [TENANT, UH],
      ),
    ).toBe(1);
  });

  it('área comum não tem período, e nada é gravado', async () => {
    const antes = await contar(`select count(*)::int as n from app.chamado where tenant_id = $1`, [
      TENANT,
    ]);
    await expect(
      chamados.abrir(ctx(U.gerente), {
        localId: LOBBY,
        descricao: 'Lâmpada queimada',
        uhIndisponivelDesde: haHoras(1),
      }),
    ).rejects.toMatchObject({ codigo: 'uh_indisponivel_fora_de_uh' });
    expect(
      await contar(`select count(*)::int as n from app.chamado where tenant_id = $1`, [TENANT]),
    ).toBe(antes);
  });

  it('operação offline antiga, sem os campos novos, continua valendo', async () => {
    const r = await sincronizacao.receberOperacao(ctx(U.tecnico), {
      chave: randomUUID(),
      tipo: 'chamado.abrir',
      dados: { localId: UH, descricao: 'Tomada solta' },
    });
    const id = String(r.resposta.id);
    expect(await chamados.chamado(ctx(U.tecnico), id)).toMatchObject({
      origem: 'interno',
      impactoHospede: null,
    });
    expect(await abertosDo(id)).toBe(0);
  });

  it('quem executa: equipe interna por padrão, fornecedor ativo do grupo, correção até a conclusão', async () => {
    const { id: c1 } = await chamados.abrir(ctx(U.gerente), {
      localId: UH,
      descricao: 'Ar pingando',
    });
    const { id: interna } = await triagem.gerarOs(ctx(U.gerente), c1, {
      versao: 1,
      responsavel: { tipo: 'tecnico', usuarioId: U.tecnico },
    });
    expect(await triagem.osDoChamado(ctx(U.gerente), c1)).toEqual([
      expect.objectContaining({
        id: interna,
        executadoPor: 'equipe_interna',
        fornecedorId: null,
        custoInformado: null,
      }),
    ]);

    const { id: c2 } = await chamados.abrir(ctx(U.gerente), {
      localId: UH,
      descricao: 'Frigobar desligando',
    });
    await expect(
      triagem.gerarOs(ctx(U.gerente), c2, {
        versao: 1,
        responsavel: { tipo: 'tecnico', usuarioId: U.tecnico },
        execucao: { executadoPor: 'fornecedor', fornecedorId: FORNECEDOR_INATIVO },
      }),
    ).rejects.toMatchObject({ codigo: 'os_fornecedor_desativado' });
    await expect(
      triagem.gerarOs(ctx(U.gerente), c2, {
        versao: 1,
        responsavel: { tipo: 'tecnico', usuarioId: U.tecnico },
        execucao: { executadoPor: 'fornecedor' },
      }),
    ).rejects.toMatchObject({ codigo: 'os_fornecedor_obrigatorio' });
    const { id: externa } = await triagem.gerarOs(ctx(U.gerente), c2, {
      versao: 1,
      responsavel: { tipo: 'tecnico', usuarioId: U.tecnico },
      execucao: { executadoPor: 'fornecedor', fornecedorId: FORNECEDOR },
    });
    expect((await triagem.osDoChamado(ctx(U.gerente), c2))[0]).toMatchObject({
      id: externa,
      executadoPor: 'fornecedor',
      fornecedorId: FORNECEDOR,
    });

    // O técnico não corrige; a gestão volta para a equipe interna.
    await expect(
      triagem.definirQuemExecuta(ctx(U.tecnico), externa, {
        versao: 1,
        executadoPor: 'equipe_interna',
      }),
    ).rejects.toMatchObject({ codigo: 'triagem_fora_do_papel' });
    expect(
      await triagem.definirQuemExecuta(ctx(U.gerente), externa, {
        versao: 1,
        executadoPor: 'equipe_interna',
      }),
    ).toEqual({ versao: 2 });
    expect(
      await contar(
        `select count(*)::int as n from app.os
         where id = $1 and executado_por = 'equipe_interna' and fornecedor_id is null`,
        [externa],
      ),
    ).toBe(1);
    expect(
      await contar(
        `select count(*)::int as n from app.auditoria
         where tenant_id = $1 and entidade = 'os' and registro_id = $2 and acao = 'definir_executor'`,
        [TENANT, externa],
      ),
    ).toBe(1);
    // Versão vista antiga: conflito.
    await expect(
      triagem.definirQuemExecuta(ctx(U.gerente), externa, {
        versao: 1,
        executadoPor: 'fornecedor',
        fornecedorId: FORNECEDOR,
      }),
    ).rejects.toMatchObject({ codigo: 'conflito_de_versao' });
  });

  it('sem a regra do domínio, a RLS recusa o técnico que não é o responsável', async () => {
    const { id: chamadoId } = await chamados.abrir(ctx(U.gerente), {
      localId: UH,
      descricao: 'Porta emperrada',
    });
    const { id: osId } = await triagem.gerarOs(ctx(U.gerente), chamadoId, {
      versao: 1,
      responsavel: { tipo: 'tecnico', usuarioId: U.tecnico },
    });
    await expect(
      triagemSemRegra.definirQuemExecuta(ctx(U.outro), osId, {
        versao: 1,
        executadoPor: 'fornecedor',
        fornecedorId: FORNECEDOR,
      }),
    ).rejects.toMatchObject({ codigo: 'os_nao_encontrada' });
    await expect(
      triagemSemRegra.informarImpacto(ctx(U.outro), chamadoId, {
        versao: 2,
        impactoHospede: true,
      }),
    ).rejects.toMatchObject({ codigo: 'chamado_nao_encontrado' });
  });

  it('impacto no hóspede: a triagem corrige; o proprietário, não', async () => {
    const { id } = await chamados.abrir(ctx(U.gerente), { localId: UH, descricao: 'Barulho' });
    await expect(
      triagem.informarImpacto(ctx(U.dono), id, { versao: 1, impactoHospede: false }),
    ).rejects.toMatchObject({ codigo: 'triagem_fora_do_papel' });
    expect(
      await triagem.informarImpacto(ctx(U.gerente), id, { versao: 1, impactoHospede: false }),
    ).toEqual({ versao: 2 });
    expect(await chamados.chamado(ctx(U.gerente), id)).toMatchObject({ impactoHospede: false });
    expect(
      await contar(
        `select count(*)::int as n from app.evento_dominio
         where tenant_id = $1 and tipo = 'chamado.impacto_informado' and registro_id = $2`,
        [TENANT, id],
      ),
    ).toBe(1);
  });

  it('aceite com o custo informado; custo inválido é recusado', async () => {
    const { chamadoId, osId } = await osEmExecucao();
    await concluir(osId, undefined);
    await expect(
      triagem.aceitarOs(ctx(U.gerente), osId, { versao: 3, custoInformado: -1 }),
    ).rejects.toMatchObject({ codigo: 'os_custo_invalido' });
    await triagem.aceitarOs(ctx(U.gerente), osId, { versao: 3, custoInformado: 150.5 });
    expect((await triagem.osDoChamado(ctx(U.gerente), chamadoId))[0]).toMatchObject({
      estado: 'aceita',
      custoInformado: 150.5,
    });
    expect(
      await contar(
        `select count(*)::int as n from app.os where id = $1 and custo_informado = 150.50`,
        [osId],
      ),
    ).toBe(1);
  });

  it('a gestão marca depois e libera; um período aberto por chamado; o técnico não marca', async () => {
    const { id } = await chamados.abrir(ctx(U.gerente), { localId: UH, descricao: 'Infiltração' });
    await expect(uh.marcar(ctx(U.tecnico), id, {})).rejects.toMatchObject({
      codigo: 'uh_indisponivel_fora_do_papel',
    });
    const { id: periodoId } = await uh.marcar(ctx(U.gerente), id, {});
    await expect(uh.marcar(ctx(U.gerente), id, {})).rejects.toMatchObject({
      codigo: 'uh_indisponivel_ja_aberta',
    });
    await expect(uh.liberar(ctx(U.tecnico), periodoId, {})).rejects.toMatchObject({
      codigo: 'uh_indisponivel_fora_do_papel',
    });
    await uh.liberar(ctx(U.gerente), periodoId, {});
    expect(await abertosDo(id)).toBe(0);
    await expect(uh.liberar(ctx(U.gerente), periodoId, {})).rejects.toMatchObject({
      codigo: 'uh_indisponivel_nao_aberta',
    });
    // Liberada, a UH pode ficar indisponível de novo pelo mesmo chamado.
    await uh.marcar(ctx(U.admin), id, {});
    expect(await abertosDo(id)).toBe(1);
  });

  it('conclusão com "UH liberada": o período encerra na mesma operação, uma vez só', async () => {
    const { chamadoId, osId } = await osEmExecucao({ uhIndisponivelDesde: haHoras(2) });
    const daFila = (await execucao.osDoDia(ctx(U.tecnico))).find((o) => o.id === osId);
    expect(daFila?.chamado.uhIndisponivelDesde).toBeInstanceOf(Date);

    const chave = randomUUID();
    const primeira = await concluir(osId, true, chave);
    expect(primeira.resposta).toMatchObject({ estado: 'concluida', uhLiberada: true });
    expect(await abertosDo(chamadoId)).toBe(0);
    const reenvio = await concluir(osId, true, chave);
    expect(reenvio.repetida).toBe(true);
    expect(
      await contar(
        `select count(*)::int as n from app.evento_dominio
         where tenant_id = $1 and tipo = 'uh.liberada' and payload->>'chamadoId' = $2`,
        [TENANT, chamadoId],
      ),
    ).toBe(1);
  });

  it('conclusão sem resposta: o período fica aberto para a gestão liberar', async () => {
    const { chamadoId, osId } = await osEmExecucao({ uhIndisponivelDesde: haHoras(2) });
    expect((await concluir(osId, undefined)).resposta).toMatchObject({ uhLiberada: false });
    expect(await abertosDo(chamadoId)).toBe(1);
  });

  it('o cancelamento do chamado encerra o período aberto', async () => {
    const { id } = await chamados.abrir(ctx(U.gerente), {
      localId: UH,
      descricao: 'Aberto por engano',
      uhIndisponivelDesde: haHoras(1),
    });
    await triagem.cancelarChamado(ctx(U.gerente), id, { versao: 1, motivo: 'Duplicado' });
    expect(await abertosDo(id)).toBe(0);
    expect(
      await contar(
        `select count(*)::int as n from app.auditoria a
         join app.uh_indisponivel u on u.id = a.registro_id
         where a.tenant_id = $1 and a.entidade = 'uh_indisponivel' and a.acao = 'liberar'
           and u.chamado_id = $2`,
        [TENANT, id],
      ),
    ).toBe(1);
  });

  it('o proprietário vê só a UH, o estado e as datas', async () => {
    const { id } = await chamados.abrir(ctx(U.gerente), {
      localId: UH,
      descricao: 'Cortina rasgada',
      uhIndisponivelDesde: haHoras(1),
    });
    const doGerente = await uh.doChamado(ctx(U.gerente), id);
    expect(doGerente[0]).toHaveProperty('abertaPor');
    const doDono = await uh.doChamado(ctx(U.dono), id);
    expect(doDono).toHaveLength(1);
    expect(Object.keys(doDono[0] ?? {}).sort()).toEqual(
      ['fim', 'hotelId', 'id', 'inicio', 'localId', 'tempoIndisponivelMs'].sort(),
    );
  });

  it('os nomes do detalhe trazem o tipo do local e o fornecedor; o proprietário fica sem o fornecedor', async () => {
    const { id } = await chamados.abrir(ctx(U.gerente), {
      localId: UH,
      descricao: 'Ar gelando pouco',
    });
    await triagem.gerarOs(ctx(U.gerente), id, {
      versao: 1,
      responsavel: { tipo: 'tecnico', usuarioId: U.tecnico },
      execucao: { executadoPor: 'fornecedor', fornecedorId: FORNECEDOR },
    });
    const consultas = criarPortaConsultasDaCorretiva(banco);
    expect(await consultas.nomesDoChamado(ctx(U.gerente), id)).toMatchObject({
      localTipo: 'uh',
      fornecedores: { [FORNECEDOR]: 'Refrigeração Ativa' },
    });
    expect(await consultas.nomesDoChamado(ctx(U.dono), id)).toMatchObject({
      localTipo: 'uh',
      fornecedores: {},
    });
  });
});
