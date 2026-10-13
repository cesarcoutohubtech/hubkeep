// Aceite da C5 (fase 1a) contra Postgres real (na CI, o Supabase do runner):
//   - quem abre o chamado marca o equipamento parado, e a parada aberta nasce
//     na mesma unit of work; se o ativo já está parado, fica a que existe e o
//     chamado abre do mesmo jeito;
//   - o ativo e a fila do dia mostram a parada aberta;
//   - na execução, o responsável registra e encerra pela operação offline, uma
//     vez só mesmo com reenvio; uma aberta por ativo; a aberta de outro
//     chamado não é encerrada pela OS deste;
//   - pelo web, a gestão do hotel encerra e o técnico não; a lista traz o
//     tempo parado;
//   - sem a regra do domínio, a RLS recusa o técnico sem OS no chamado;
//   - na conclusão, "o equipamento voltou a funcionar" encerra a parada do
//     chamado na mesma operação, uma vez só; senão ela fica aberta e aparece
//     na lista da gestão (paradas abertas com OS concluída);
//   - o proprietário vê só o ativo, o estado e as datas;
//   - auditoria e eventos na mesma transação.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeChamados,
  criarCasosDeUsoDeExecucao,
  criarCasosDeUsoDeParadas,
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
  criarPortaAtivos,
  criarPortaChamados,
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
const UH = randomUUID();
const A1 = randomUUID();
const A2 = randomUUID();
const A3 = randomUUID();
const A4 = randomUUID();
const A5 = randomUUID();
const A6 = randomUUID();
const PROPRIETARIO = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
  outro: randomUUID(),
  dono: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });
const haHoras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

describe.skipIf(!temBanco)('C5 — parada do equipamento', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let chamados: ReturnType<typeof criarCasosDeUsoDeChamados>;
  let triagem: ReturnType<typeof criarCasosDeUsoDeTriagem>;
  let execucao: ReturnType<typeof criarCasosDeUsoDeExecucao>;
  let sincronizacao: ReturnType<typeof criarCasosDeUsoDeSincronizacao>;
  let paradas: ReturnType<typeof criarCasosDeUsoDeParadas>;
  let paradasSemRegra: ReturnType<typeof criarCasosDeUsoDeParadas>;
  let ativos: ReturnType<typeof criarPortaAtivos>;

  const contar = async (sqlTexto: string, params: unknown[]) =>
    (await dono.query<{ n: number }>(sqlTexto, params)).rows[0]?.n;
  const abertasDo = (ativoId: string) =>
    contar(`select count(*)::int as n from app.parada_ativo where ativo_id = $1 and fim is null`, [
      ativoId,
    ]);

  /** Chamado do ativo, com a OS do técnico já iniciada. */
  async function osEmExecucao(ativoId: string) {
    const { id: chamadoId } = await chamados.abrir(ctx(U.gerente), {
      localId: UH,
      ativoId,
      descricao: `Chamado ${randomUUID()}`,
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
  const registrar = (osId: string, fim: string | null = null, chave: string = randomUUID()) =>
    sincronizacao.receberOperacao(ctx(U.tecnico), {
      chave,
      tipo: 'os.registrar_parada',
      dados: { osId, inicio: haHoras(2), fim },
    });
  const encerrar = (osId: string, chave: string = randomUUID()) =>
    sincronizacao.receberOperacao(ctx(U.tecnico), {
      chave,
      tipo: 'os.encerrar_parada',
      dados: { osId, fim: new Date().toISOString() },
    });

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo C5')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, 'Hotel 1', 'UTC', 'ativo')`,
      [H1, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
       values ($1, $2, $3, 'uh', 'UH 101', 'uh 101', 'ativo')`,
      [UH, TENANT, H1],
    );
    for (const [id, codigo, nome] of [
      [A1, 'PARADA0001', 'Frigobar'],
      [A2, 'PARADA0002', 'Ar'],
      [A3, 'PARADA0003', 'TV'],
      [A4, 'PARADA0004', 'Cofre'],
      [A5, 'PARADA0005', 'Micro-ondas'],
      [A6, 'PARADA0006', 'Secador'],
    ] as const) {
      await dono.query(
        `insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome, busca)
         values ($1, $2, $3, $4, $5, $6, lower($6))`,
        [codigo, id, TENANT, H1, UH, nome],
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
    chamados = criarCasosDeUsoDeChamados({
      chamados: criarPortaChamados(banco),
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
      feriadosOficiais: semFeriadosOficiais,
    });
    const portaTriagem = criarPortaTriagem(banco);
    triagem = criarCasosDeUsoDeTriagem({
      triagem: portaTriagem,
      situacoes,
      prioridades,
      atribuicoes,
      relogio: relogioDoSistema,
      feriadosOficiais: semFeriadosOficiais,
    });
    const portaParadas = criarPortaParadas(banco);
    execucao = criarCasosDeUsoDeExecucao({
      execucao: criarPortaExecucao(banco),
      triagem: portaTriagem,
      situacoes,
      atribuicoes,
      relogio: relogioDoSistema,
      paradas: portaParadas,
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
    ativos = criarPortaAtivos(banco);
    const depsDasParadas = {
      paradas: portaParadas,
      ativos,
      triagem: portaTriagem,
      atribuicoes,
      relogio: relogioDoSistema,
    };
    paradas = criarCasosDeUsoDeParadas(depsDasParadas);
    // Sem a regra do domínio: só a RLS decide.
    paradasSemRegra = criarCasosDeUsoDeParadas({
      ...depsDasParadas,
      podeEncerrar: () => undefined,
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.operacao_offline',
      'app.parada_ativo',
      'app.os_transicao',
      'app.os',
      'app.chamado',
      'app.ativo',
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

  it('abertura com o equipamento parado: a parada aberta nasce com o chamado', async () => {
    const desde = haHoras(1);
    const { id } = await chamados.abrir(ctx(U.gerente), {
      localId: UH,
      ativoId: A1,
      descricao: 'Frigobar não gela',
      paradoDesde: desde,
    });
    expect(
      await contar(
        `select count(*)::int as n from app.parada_ativo
         where chamado_id = $1 and ativo_id = $2 and fim is null and os_id is null and aberta_por = $3`,
        [id, A1, U.gerente],
      ),
    ).toBe(1);
    expect((await ativos.ativo(ctx(U.tecnico), A1))?.paradoDesde?.toISOString()).toBe(desde);
    expect(
      await contar(
        `select count(*)::int as n from app.auditoria where tenant_id = $1 and entidade = 'parada_ativo' and acao = 'registrar'`,
        [TENANT],
      ),
    ).toBe(1);
    expect(
      await contar(
        `select count(*)::int as n from app.evento_dominio where tenant_id = $1 and tipo = 'parada.registrada'`,
        [TENANT],
      ),
    ).toBe(1);

    // O ativo já parado: o chamado abre, e fica a parada que existe.
    await chamados.abrir(ctx(U.gerente), {
      localId: UH,
      ativoId: A1,
      descricao: 'Frigobar fazendo barulho',
      paradoDesde: haHoras(0.5),
    });
    expect(await abertasDo(A1)).toBe(1);
  });

  it('equipamento parado sem ativo no chamado: parada_sem_ativo', async () => {
    await expect(
      chamados.abrir(ctx(U.gerente), {
        localId: UH,
        descricao: 'Algo parado',
        paradoDesde: haHoras(1),
      }),
    ).rejects.toMatchObject({ codigo: 'parada_sem_ativo' });
  });

  it('execução: o responsável registra e encerra, uma vez só mesmo com reenvio', async () => {
    const { osId } = await osEmExecucao(A2);
    const CHAVE = randomUUID();
    const primeira = await registrar(osId, null, CHAVE);
    expect(await registrar(osId, null, CHAVE)).toMatchObject({
      repetida: true,
      resposta: primeira.resposta,
    });
    expect(await abertasDo(A2)).toBe(1);
    const naFila = (await execucao.osDoDia(ctx(U.tecnico))).find((o) => o.id === osId);
    expect(naFila?.chamado).toMatchObject({ ativoId: A2 });
    expect(naFila?.chamado.paradoDesde).toBeInstanceOf(Date);

    await expect(registrar(osId)).rejects.toMatchObject({ codigo: 'parada_ja_aberta' });

    const FIM = randomUUID();
    await encerrar(osId, FIM);
    expect(await encerrar(osId, FIM)).toMatchObject({ repetida: true });
    expect(await abertasDo(A2)).toBe(0);
    await expect(encerrar(osId)).rejects.toMatchObject({ codigo: 'parada_nao_aberta' });

    // Registrada já com o fim (o técnico conta o que aconteceu): não fica aberta.
    await registrar(osId, haHoras(1));
    expect(await abertasDo(A2)).toBe(0);
    expect(
      await contar(
        `select count(*)::int as n from app.parada_ativo where ativo_id = $1 and os_id = $2`,
        [A2, osId],
      ),
    ).toBe(2);
  });

  it('a aberta de outro chamado do mesmo ativo não é desta OS', async () => {
    // A1 está parado pelo primeiro chamado; esta OS é de outro chamado do A1.
    const { osId } = await osEmExecucao(A1);
    await expect(encerrar(osId)).rejects.toMatchObject({ codigo: 'parada_de_outro_chamado' });
    await expect(registrar(osId)).rejects.toMatchObject({ codigo: 'parada_ja_aberta' });
  });

  it('pelo web: a gestão encerra, o técnico não; a lista traz o tempo parado', async () => {
    const [aberta] = (await paradas.doAtivo(ctx(U.gerente), A1)).paradas.filter(
      (p) => p.fim === null,
    );
    if (!aberta) throw new Error('sem parada aberta no A1');
    expect(aberta.tempoParadoMs).toBeGreaterThan(0);
    await expect(paradas.encerrar(ctx(U.tecnico), aberta.id, {})).rejects.toMatchObject({
      codigo: 'parada_fora_do_papel',
    });
    await paradas.encerrar(ctx(U.gerente), aberta.id, {});
    expect(await abertasDo(A1)).toBe(0);
    expect((await ativos.ativo(ctx(U.gerente), A1))?.paradoDesde).toBeNull();
    await expect(paradas.encerrar(ctx(U.gerente), aberta.id, {})).rejects.toMatchObject({
      codigo: 'parada_nao_aberta',
    });
    const lista = await paradas.doAtivo(ctx(U.gerente), A1);
    expect(lista.paradas.every((p) => p.fim !== null)).toBe(true);
    expect(lista.tempoParadoMs).toBeGreaterThan(0);
    await expect(paradas.doAtivo(ctx(U.gerente), randomUUID())).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
    expect(
      await contar(
        `select count(*)::int as n from app.evento_dominio where tenant_id = $1 and tipo = 'parada.encerrada'`,
        [TENANT],
      ),
    ).toBeGreaterThanOrEqual(2);
  });

  it('sem a regra do domínio, a RLS recusa o técnico sem OS no chamado', async () => {
    const { id } = await chamados.abrir(ctx(U.gerente), {
      localId: UH,
      ativoId: A3,
      descricao: 'TV não liga',
      paradoDesde: haHoras(1),
    });
    const [aberta] = (await paradas.doAtivo(ctx(U.gerente), A3)).paradas;
    expect(aberta && 'chamadoId' in aberta ? aberta.chamadoId : null).toBe(id);
    await expect(
      paradasSemRegra.encerrar(ctx(U.outro), aberta?.id ?? '', {}),
    ).rejects.toMatchObject({ codigo: 'parada_nao_encontrada' });
    expect(await abertasDo(A3)).toBe(1);
  });

  const concluir = (
    osId: string,
    equipamentoVoltou: boolean | undefined,
    chave: string = randomUUID(),
  ) =>
    sincronizacao.receberOperacao(ctx(U.tecnico), {
      chave,
      tipo: 'os.concluir',
      dados: {
        osId,
        versao: 2,
        ...(equipamentoVoltou === undefined
          ? {}
          : { equipamentoVoltou, concluidaEm: new Date().toISOString() }),
      },
    });

  it('conclusão com o equipamento de volta: a parada encerra na mesma operação, uma vez só', async () => {
    const { osId } = await osEmExecucao(A4);
    await registrar(osId);
    const [daFila] = (await execucao.osDoDia(ctx(U.tecnico))).filter((o) => o.id === osId);
    expect(daFila?.chamado.paradaDoChamado).toBe(true);
    const chave = randomUUID();
    const primeira = await concluir(osId, true, chave);
    expect(primeira.resposta).toMatchObject({ estado: 'concluida', paradaEncerrada: true });
    expect(await abertasDo(A4)).toBe(0);
    const reenvio = await concluir(osId, true, chave);
    expect(reenvio.repetida).toBe(true);
    expect(
      await contar(
        // O evento da parada é do ativo (registro_id = ativo), com a parada no payload.
        `select count(*)::int as n from app.evento_dominio
         where tenant_id = $1 and tipo = 'parada.encerrada' and registro_id = $2`,
        [TENANT, A4],
      ),
    ).toBe(1);
  });

  it('conclusão sem o equipamento de volta: fica aberta e aparece para a gestão', async () => {
    const { chamadoId, osId } = await osEmExecucao(A5);
    await registrar(osId);
    expect((await concluir(osId, false)).resposta).toMatchObject({ paradaEncerrada: false });
    expect(await abertasDo(A5)).toBe(1);

    const pendentes = await paradas.abertasComOsConcluida(ctx(U.gerente));
    const daA5 = pendentes.find((p) => p.ativoId === A5);
    expect(daA5).toMatchObject({
      chamadoId,
      ativoNome: 'Micro-ondas',
      os: { id: osId, estado: 'concluida' },
    });
    expect(pendentes.some((p) => p.ativoId === A3)).toBe(false);
    await expect(paradas.abertasComOsConcluida(ctx(U.tecnico))).rejects.toMatchObject({
      codigo: 'parada_fora_do_papel',
    });

    await paradas.encerrar(ctx(U.gerente), daA5?.id ?? '', {});
    expect((await paradas.abertasComOsConcluida(ctx(U.admin))).some((p) => p.ativoId === A5)).toBe(
      false,
    );
  });

  it('sem resposta (operação de antes da pergunta): a parada fica aberta', async () => {
    const { osId } = await osEmExecucao(A6);
    await registrar(osId);
    expect((await concluir(osId, undefined)).resposta).toMatchObject({ paradaEncerrada: false });
    expect(await abertasDo(A6)).toBe(1);
  });

  it('o proprietário vê só o ativo, o estado e as datas', async () => {
    const doGerente = (await paradas.doAtivo(ctx(U.gerente), A5)).paradas[0];
    expect(doGerente).toHaveProperty('abertaPor');
    expect(doGerente).toHaveProperty('chamadoId');
    const doDono = await paradas.doAtivo(ctx(U.dono), A5);
    expect(doDono.paradas.length).toBeGreaterThan(0);
    for (const p of doDono.paradas) {
      expect(Object.keys(p).sort()).toEqual(
        ['ativoId', 'fim', 'hotelId', 'id', 'inicio', 'tempoParadoMs'].sort(),
      );
    }
  });
});
