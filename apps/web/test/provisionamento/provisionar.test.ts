// Provisionamento de cliente contra o Supabase do runner (Auth e banco reais):
// grupo, contrato, primeiro Admin pelo convite (o evento membro.convidado sai
// pelo outbox) e os padrões. A segunda execução, com o mesmo grupo, não
// duplica nada, não muda a licença e não reenvia o convite.
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { casosDeUsoDeConfiguracao } from '../../src/servidor/composicao';
import { grupoDaTurma } from '../demonstracao/semear';
import {
  type PedidoDeProvisionamento,
  type ResultadoDoProvisionamento,
  provisionarCliente,
} from './provisionar';

const URL_DONO = process.env['HK_TESTE_URL_DONO'];
const temAmbiente = Boolean(
  process.env['NEXT_PUBLIC_SUPABASE_URL'] &&
  URL_DONO &&
  process.env['DATABASE_URL_APP'] &&
  process.env['DATABASE_URL_WORKER'],
);
if (!temAmbiente && process.env['HK_EXIGIR_BANCO'] === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas falta o ambiente do Supabase local (URL e banco).');
}

const TENANT = randomUUID();
const DOMINIO = `cliente-${TENANT.slice(0, 8)}.example.com`;
const PEDIDO: PedidoDeProvisionamento = {
  tenantId: TENANT,
  nome: `Grupo Provisionado ${TENANT.slice(0, 8)}`,
  adminEmail: `admin@${DOMINIO}`,
  adminNome: 'Primeira Admin',
  maxHoteis: 4,
  maxUhs: 600,
  por: 'teste',
  site: 'http://localhost:3000',
};

/** Tabelas que o provisionamento grava, na ordem em que a limpeza apaga. */
const TABELAS = [
  'app.auditoria',
  'app.evento_dominio',
  'app.codigo_manutencao',
  'app.atribuicao_escopo',
  'app.categoria_ativo',
  'app.situacao',
  'app.prioridade',
  'app.politica',
  'app.membro',
  'licenca.contrato',
];

describe('grupoDaTurma (kit por turma)', () => {
  it('um grupo próprio por turma, fixo pelo número', () => {
    const t2 = grupoDaTurma(2);
    expect(t2).toEqual(grupoDaTurma(2));
    expect(t2.nome).toBe('Grupo Demonstração — Turma 2');
    expect(t2.dominio).toBe('turma2.demo.hubkeep.test');
    expect(grupoDaTurma(3).tenantId).not.toBe(t2.tenantId);
  });
});

describe.skipIf(!temAmbiente)('provisionamento de cliente', { timeout: 120_000 }, () => {
  let dono: pg.Client;
  let r: ResultadoDoProvisionamento;
  const contar = async (tabela: string) =>
    Number(
      (await dono.query(`select count(*) as n from ${tabela} where tenant_id = $1`, [TENANT]))
        .rows[0].n,
    );

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    r = await provisionarCliente(URL_DONO ?? '', PEDIDO);
  });

  afterAll(async () => {
    if (!dono) return;
    for (const t of TABELAS) await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where email like $1`, [`%@${DOMINIO}`]);
    await dono.end();
  });

  it('grava o grupo, o contrato e o primeiro Admin, convidado e ainda não confirmado', async () => {
    expect(r.conviteNovo).toBe(true);
    expect(r.contrato).toEqual({ maxHoteis: 4, maxUhs: 600 });
    // O Auth guarda um hash aleatório para quem nasce sem senha; o que importa
    // é que ninguém conhece a senha: o Admin entra pelo convite (invited_at).
    const { rows } = await dono.query(
      `select a.papel, a.escopo_tipo, u.invited_at, u.email_confirmed_at
         from app.atribuicao_escopo a join auth.users u on u.id = a.usuario_id
        where a.tenant_id = $1`,
      [TENANT],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ papel: 'admin_grupo', escopo_tipo: 'grupo' });
    expect(rows[0].invited_at).not.toBeNull();
    expect(rows[0].email_confirmed_at).toBeNull();
  });

  it('o convite sai pelo outbox, e a auditoria do backoffice fica sem usuário', async () => {
    const eventos = await dono.query(
      `select payload, processado_em from app.evento_dominio
        where tenant_id = $1 and tipo = 'membro.convidado'`,
      [TENANT],
    );
    expect(eventos.rows).toHaveLength(1);
    expect(eventos.rows[0].processado_em).not.toBeNull();
    expect(eventos.rows[0].payload).toMatchObject({
      email: PEDIDO.adminEmail,
      nomeTenant: PEDIDO.nome,
      redirecionarPara: 'http://localhost:3000/auth/confirmar',
    });
    const auditoria = await dono.query(
      `select entidade, acao from app.auditoria
        where tenant_id = $1 and usuario_id is null order by entidade`,
      [TENANT],
    );
    expect(auditoria.rows).toEqual([
      { entidade: 'atribuicao_escopo', acao: 'conceder' },
      { entidade: 'membro', acao: 'convidar' },
    ]);
  });

  it('instala os padrões, com a prioridade por categoria do grupo', async () => {
    expect(r.padroes.categorias).toBe(10);
    expect(r.padroes.prioridades).toBeGreaterThanOrEqual(4);
    expect(r.padroes.codigos).toBeGreaterThan(0);
    const { politicas } = await (
      await casosDeUsoDeConfiguracao()
    ).lerConfiguracao({ usuarioId: r.usuarioId, tenantId: TENANT });
    const prioridade = politicas.find((p) => p.chave === 'chamado.prioridade_padrao_por_categoria');
    expect(prioridade?.origem).toBe('grupo');
  });

  it('a segunda execução completa sem duplicar, sem mudar a licença e sem reenviar o convite', async () => {
    // A auditoria e o outbox ficam fora da contagem: os casos de uso dos
    // padrões podem auditar a nova conferência. O convite é contado à parte.
    const contadas = TABELAS.filter((t) => t !== 'app.auditoria' && t !== 'app.evento_dominio');
    const contagem = async () =>
      Object.fromEntries(await Promise.all(contadas.map(async (t) => [t, await contar(t)])));
    const antes = await contagem();
    const segunda = await provisionarCliente(URL_DONO ?? '', { ...PEDIDO, maxHoteis: 40 });
    expect(segunda.conviteNovo).toBe(false);
    expect(segunda.usuarioId).toBe(r.usuarioId);
    expect(segunda.contrato).toEqual({ maxHoteis: 4, maxUhs: 600 });
    expect(await contagem()).toEqual(antes);
    const convites = await dono.query(
      `select count(*) as n from app.evento_dominio where tenant_id = $1 and tipo = 'membro.convidado'`,
      [TENANT],
    );
    expect(Number(convites.rows[0].n)).toBe(1);
  });
});
