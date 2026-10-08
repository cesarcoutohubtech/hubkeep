// Dados de demonstração do kit de teste contra o Supabase do runner (Auth e
// banco reais): o script roda duas vezes e a segunda não duplica nada; cada
// papel entra com a senha de teste e vê só o próprio escopo; cada chamado fica
// no estado que o roteiro do kit descreve (docs/10-kit-de-teste.md). No fim, o
// passo a passo da triagem do roteiro, pelos casos de uso que as rotas chamam.
import { randomUUID } from 'node:crypto';
import { ErroDeDominio } from '@hubkeep/dominio';
import { mensagensDe } from '@hubkeep/i18n';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  casosDeUsoDeConsultas,
  casosDeUsoDeChamados,
  casosDeUsoDeEquipes,
  casosDeUsoDeHistorico,
  casosDeUsoDeSituacoes,
  casosDeUsoDeTriagem,
} from '../../src/servidor/composicao';
import { type Pessoa, type ResultadoDaDemonstracao, semearDemonstracao } from './semear';

const URL_SUPABASE = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const CHAVE_PUBLICA = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
const URL_DONO = process.env['HK_TESTE_URL_DONO'];
const temAmbiente = Boolean(
  URL_SUPABASE &&
  CHAVE_PUBLICA &&
  URL_DONO &&
  process.env['DATABASE_URL_APP'] &&
  process.env['DATABASE_URL_WORKER'] &&
  process.env['DATABASE_URL_INGESTAO'],
);
if (!temAmbiente && process.env['HK_EXIGIR_BANCO'] === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas falta o ambiente do Supabase local (URL, chave, banco).');
}
const exigir = (v: string | undefined): string => {
  if (!v) throw new Error('variável de teste ausente');
  return v;
};

const TENANT = randomUUID();
const SENHA = `Senha-de-demonstracao-${randomUUID().slice(0, 8)}`;
const DOMINIO = `demo-${TENANT.slice(0, 8)}.hubkeep.test`;

/** Tabelas do tenant, na ordem em que a limpeza apaga (filhas antes das mães). */
const TABELAS = [
  'app.auditoria',
  'app.evento_dominio',
  'app.operacao_offline',
  'app.anexo',
  'app.os_material',
  'app.os_apontamento',
  'app.parada_ativo',
  'app.os_transicao',
  'app.os',
  'app.chamado',
  'app.ativo_movimentacao',
  'app.ativo',
  'app.equipe_membro',
  'app.equipe',
  'app.local_proprietario',
  'app.hotel_proprietario',
  'app.atribuicao_escopo',
  'app.proprietario',
  'app.preferencia_membro',
  'app.local',
  'app.categoria_ativo',
  'app.situacao',
  'app.prioridade',
  'app.politica',
  'app.hotel',
  'app.bandeira',
  'app.membro',
  'staging.registro_externo',
  'staging.carga',
  'staging.credencial_agente',
  'licenca.contrato',
];
/** O que a segunda execução não pode duplicar (a auditoria cresce com a credencial do agente). */
const CONTADAS = TABELAS.filter(
  (t) => !['app.auditoria', 'app.evento_dominio', 'staging.credencial_agente'].includes(t),
);

describe.skipIf(!temAmbiente)('dados de demonstração do kit de teste', { timeout: 180_000 }, () => {
  let dono: pg.Client;
  let r: ResultadoDaDemonstracao;
  const contagem = async () => {
    const n: Record<string, number> = {};
    for (const t of CONTADAS) {
      n[t] = Number(
        (await dono.query(`select count(*) as n from ${t} where tenant_id = $1`, [TENANT])).rows[0]
          .n,
      );
    }
    return n;
  };
  const ctx = (p: Pessoa) => ({ usuarioId: r.usuarios[p].usuarioId, tenantId: TENANT });
  const semear = () =>
    semearDemonstracao({
      urlDono: exigir(URL_DONO),
      senha: SENHA,
      tenantId: TENANT,
      dominio: DOMINIO,
    });

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: exigir(URL_DONO) });
    await dono.connect();
    r = await semear();
  });

  afterAll(async () => {
    if (!dono) return;
    for (const t of TABELAS) await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where email like $1`, [`%@${DOMINIO}`]);
    await dono.end();
  });

  it('a segunda execução devolve os mesmos registros e não duplica nada', async () => {
    const antes = await contagem();
    const segunda = await semear();
    expect(segunda).toEqual(r);
    expect(await contagem()).toEqual(antes);
    expect(antes['app.chamado']).toBe(7);
    expect(antes['app.ativo']).toBe(7);
    expect(antes['app.membro']).toBe(10);
  });

  it('cada papel entra com a senha de teste, já confirmado', async () => {
    for (const p of ['admin', 'tecnicoCentro', 'donoUh'] as const) {
      const cliente = createClient(exigir(URL_SUPABASE), exigir(CHAVE_PUBLICA), {
        auth: { persistSession: false },
      });
      const { data, error } = await cliente.auth.signInWithPassword({
        email: r.usuarios[p].email,
        password: SENHA,
      });
      expect(error).toBeNull();
      expect(data.session?.user.app_metadata['hk_tenants']).toContain(TENANT);
    }
  });

  it('cada papel lista só os chamados do próprio escopo', async () => {
    const consultas = await casosDeUsoDeConsultas();
    const quantos = async (p: Pessoa) => (await consultas.listarChamados(ctx(p), {})).itens.length;
    expect(await quantos('admin')).toBe(7);
    expect(await quantos('gestor')).toBe(6);
    expect(await quantos('gerenteCentro')).toBe(6);
    expect(await quantos('gerentePraia')).toBe(1);
    expect(await quantos('tecnicoCentro')).toBe(6);
    expect(await quantos('tecnicoPraia')).toBe(1);
    expect(await quantos('solicitante')).toBe(6);
    expect(await quantos('implantador')).toBe(0);
    expect(await quantos('donoUh')).toBe(1);
    expect(await quantos('donoHotel')).toBe(1);
  });

  it('cada chamado fica no estado do roteiro', async () => {
    const chamados = await casosDeUsoDeChamados();
    const triagem = await casosDeUsoDeTriagem();
    const estado = async (c: keyof ResultadoDaDemonstracao['chamados']) => {
      const chamado = await chamados.chamado(ctx('admin'), r.chamados[c]);
      const os = await triagem.osDoChamado(ctx('admin'), r.chamados[c]);
      return [chamado.estado, ...os.map((o) => o.estado)];
    };
    expect(await estado('aberto')).toEqual(['aberto']);
    expect(await estado('atribuido')).toEqual(['em_execucao', 'atribuida']);
    expect(await estado('emExecucaoParado')).toEqual(['em_execucao', 'em_execucao']);
    expect(await estado('aguardandoAceite')).toEqual(['aguardando_aceite', 'concluida']);
    expect(await estado('cancelado')).toEqual(['cancelado']);
    expect(await estado('concluido')).toEqual(['concluido', 'aceita']);
    expect(await estado('praiaAberto')).toEqual(['aberto']);
    const parada = await dono.query(
      `select count(*) as n from app.parada_ativo where tenant_id = $1 and chamado_id = $2 and fim is null`,
      [TENANT, r.chamados.emExecucaoParado],
    );
    expect(Number(parada.rows[0].n)).toBe(1);
  });

  it('cada chamado com a prioridade do roteiro, pela política da categoria', async () => {
    const chamados = await casosDeUsoDeChamados();
    const { prioridades } = await (
      await casosDeUsoDeSituacoes()
    ).listarSituacoesEPrioridades(ctx('admin'));
    const chave = async (c: keyof ResultadoDaDemonstracao['chamados']) => {
      const { prioridadeId } = await chamados.chamado(ctx('admin'), r.chamados[c]);
      return prioridades.find((p) => p.id === prioridadeId)?.chavePadrao;
    };
    expect(await chave('aberto')).toBe('alta');
    expect(await chave('atribuido')).toBe('alta');
    expect(await chave('emExecucaoParado')).toBe('alta');
    expect(await chave('aguardandoAceite')).toBe('media');
    expect(await chave('cancelado')).toBe('media');
    expect(await chave('concluido')).toBe('alta');
    expect(await chave('praiaAberto')).toBe('alta');
  });

  it('o terceiro hotel fica em implantação, com as UHs pendentes de licença', async () => {
    const hotel = await dono.query(`select status from app.hotel where id = $1`, [r.hoteis.serra]);
    expect(hotel.rows[0].status).toBe('em_implantacao');
    const uhs = await dono.query(
      `select status, count(*) as n from app.local where hotel_id = $1 and tipo = 'uh' group by status`,
      [r.hoteis.serra],
    );
    expect(uhs.rows).toEqual([{ status: 'pendente_licenca', n: '3' }]);
  });

  it('o passo a passo da triagem do roteiro, com as recusas traduzidas', async () => {
    const triagem = await casosDeUsoDeTriagem();
    const chamados = await casosDeUsoDeChamados();
    const c = r.chamados.aberto;
    const recusa = async (p: Promise<unknown>) => {
      const e = await p.then(
        () => null,
        (x: unknown) => x,
      );
      expect(e).toBeInstanceOf(ErroDeDominio);
      const codigo = (e as ErroDeDominio).codigo;
      expect(mensagensDe('pt-BR')[`erro.${codigo}` as never], codigo).toBeTruthy();
      return codigo;
    };
    const versao = async () => (await chamados.chamado(ctx('admin'), c)).versao;

    // O seletor do painel: Gerente e Gestor recebem a equipe e o Técnico do Centro.
    for (const p of ['gerenteCentro', 'gestor'] as const) {
      const lista = await (await casosDeUsoDeEquipes()).listarEquipes(ctx(p), r.hoteis.centro);
      expect(lista.equipes.map((e) => e.nome)).toContain('Equipe Centro');
      expect(lista.disponiveis.map((d) => d.usuarioId)).toContain(
        r.usuarios.tecnicoCentro.usuarioId,
      );
    }
    const equipe = (
      await (await casosDeUsoDeEquipes()).listarEquipes(ctx('gerenteCentro'), r.hoteis.centro)
    ).equipes.find((e) => e.nome === 'Equipe Centro');
    const urgente = (
      await (await casosDeUsoDeSituacoes()).listarSituacoesEPrioridades(ctx('gerenteCentro'))
    ).prioridades.find((p) => p.chavePadrao === 'urgente');

    // A Solicitante não tria; o Gerente tria com a prioridade urgente.
    await recusa(triagem.triar(ctx('solicitante'), c, { versao: await versao() }));
    await triagem.triar(ctx('gerenteCentro'), c, {
      versao: await versao(),
      prioridadeId: urgente?.id ?? null,
    });
    expect((await chamados.chamado(ctx('admin'), c)).estado).toBe('em_triagem');

    // OS para quem não é Técnico: recusada. Para a Equipe Centro: gerada.
    expect(
      await recusa(
        triagem.gerarOs(ctx('gerenteCentro'), c, {
          versao: await versao(),
          responsavel: { tipo: 'tecnico', usuarioId: r.usuarios.solicitante.usuarioId },
        }),
      ),
    ).toBe('responsavel_sem_papel_tecnico');
    const os = await triagem.gerarOs(ctx('gerenteCentro'), c, {
      versao: await versao(),
      responsavel: { tipo: 'equipe', equipeId: equipe?.id ?? '' },
    });

    // Reatribuir ao Técnico do Centro e cancelar a OS: o chamado volta à triagem.
    const reatribuida = await triagem.reatribuirOs(ctx('gerenteCentro'), os.id, {
      versao: os.versao,
      responsavel: { tipo: 'tecnico', usuarioId: r.usuarios.tecnicoCentro.usuarioId },
    });
    await triagem.cancelarOs(ctx('gerenteCentro'), os.id, {
      versao: reatribuida.versao,
      motivo: 'Aberto em duplicidade',
    });
    expect((await chamados.chamado(ctx('admin'), c)).estado).toBe('em_triagem');

    // Cancelar o chamado pede motivo; com motivo, cancela.
    expect(
      await recusa(
        triagem.cancelarChamado(ctx('gerenteCentro'), c, { versao: await versao(), motivo: '' }),
      ),
    ).toBe('motivo_obrigatorio');
    await triagem.cancelarChamado(ctx('gerenteCentro'), c, {
      versao: await versao(),
      motivo: 'Resolvido pela recepção',
    });
    const fim = await chamados.chamado(ctx('admin'), c);
    expect(fim.estado).toBe('cancelado');
    expect((await triagem.osDoChamado(ctx('admin'), c)).map((o) => o.estado)).toEqual([
      'cancelada',
    ]);
  });

  it('o histórico de cada registro, no escopo de cada papel (D1)', async () => {
    const historico = await casosDeUsoDeHistorico();
    const acoes = async (
      p: Pessoa,
      entidade: 'hotel' | 'chamado' | 'os',
      id: string,
    ): Promise<string[]> =>
      (await historico.historico(ctx(p), entidade, id)).eventos.map((e) => e.acao);
    const fora = async (p: Pessoa, entidade: 'hotel' | 'chamado', id: string) => {
      const e = await historico.historico(ctx(p), entidade, id).then(
        () => null,
        (x: unknown) => x,
      );
      expect(e).toBeInstanceOf(ErroDeDominio);
      return (e as ErroDeDominio).codigo;
    };

    // O chamado do frigobar (UH 101 do Centro): a abertura com o que foi gravado.
    const frigobar = r.chamados.atribuido;
    const gerente = await historico.historico(ctx('gerenteCentro'), 'chamado', frigobar);
    expect(gerente.eventos[0]?.acao).toBe('abrir');
    expect(gerente.eventos[0]?.usuarioNome).toBeTruthy();
    expect(gerente.eventos[0]?.mudancas).toContainEqual({
      campo: 'descricao',
      chave: null,
      antes: null,
      depois: 'Frigobar não gela',
    });

    // O dono da UH 101 lê o histórico do chamado e da OS dele (migração da D1).
    expect(await acoes('donoUh', 'chamado', frigobar)).toContain('abrir');
    const [os] = await (await casosDeUsoDeTriagem()).osDoChamado(ctx('donoUh'), frigobar);
    expect(await acoes('donoUh', 'os', os?.id ?? '')).toContain('gerar');

    // Fora do escopo, 404: outro chamado do Centro para o dono, o Centro para o Gerente do Praia.
    expect(await fora('donoUh', 'chamado', r.chamados.aberto)).toBe('registro_nao_encontrado');
    expect(await fora('gerentePraia', 'chamado', frigobar)).toBe('registro_nao_encontrado');

    // O hotel: o Admin lê a importação; o dono do hotel inteiro vê o hotel, sem a auditoria dele.
    expect(await acoes('admin', 'hotel', r.hoteis.praia)).toContain(
      'importar_do_sistema_hoteleiro',
    );
    expect(await acoes('donoHotel', 'hotel', r.hoteis.praia)).toEqual([]);
  });
});
