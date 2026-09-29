// Aceite da B1 (fase 1a) contra Postgres real (na CI, o Supabase do runner):
//   - o gerente cadastra, altera, desativa e reativa área comum no hotel dele;
//     nome repetido entre as ativas é 409; a área comum não conta licença;
//   - a UH do sistema hoteleiro aparece, com o status da licença, e é só
//     leitura (422 local_so_leitura);
//   - o técnico lê e não gere (403); gerente de outro hotel não vê (404); pela
//     porta, sem a checagem da aplicação, a RLS ainda barra o outro hotel;
//   - pendência da A4 (migração 0012, authz.hoteis_proprietario): o
//     proprietário do hotel inteiro vê o hotel ainda sem locais, e nenhum local;
//   - busca (B6): por trecho, sem acento; alterar o nome regrava a busca.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDeLocais, relogioDoSistema } from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaLocais,
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
const H3 = randomUUID();
const UH = randomUUID();
const PROPRIETARIO = randomUUID();
const U = {
  admin: randomUUID(),
  gerenteH1: randomUUID(),
  gerenteH2: randomUUID(),
  tecnico: randomUUID(),
  dono: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

describe.skipIf(!temBanco)('B1 — locais do hotel', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeLocais>;
  let porta: ReturnType<typeof criarPortaLocais>;

  const uhsAtivas = async () =>
    Number(
      (await dono.query(`select uhs_ativas from licenca.uso() where tenant_id = $1`, [TENANT]))
        .rows[0]?.uhs_ativas ?? 0,
    );

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo B1')`, [TENANT]);
    for (const [id, nome] of [
      [H1, 'Hotel 1'],
      [H2, 'Hotel 2'],
      [H3, 'Hotel 3'],
    ]) {
      await dono.query(
        `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, $3, 'UTC', 'ativo')`,
        [id, TENANT, nome],
      );
    }
    // UH que veio do CM (código externo), ainda pendente de licença.
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, andar, status, cod_externo)
       values ($1, $2, $3, 'uh', 'UH 101', '1', 'pendente_licenca', '101')`,
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
    await dono.query(
      `insert into app.proprietario (id, tenant_id, nome) values ($1, $2, 'Dono do Hotel 3')`,
      [PROPRIETARIO, TENANT],
    );
    await dono.query(
      `insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio)
       values ($1, $2, $3, $4, current_date - 1)`,
      [randomUUID(), TENANT, PROPRIETARIO, H3],
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
    await atribuir(U.gerenteH1, 'gerente_hotel', 'hotel', H1);
    await atribuir(U.gerenteH2, 'gerente_hotel', 'hotel', H2);
    await atribuir(U.tecnico, 'tecnico', 'hotel', H1);
    await atribuir(U.dono, 'proprietario', 'proprietario', null, PROPRIETARIO);
    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    porta = criarPortaLocais(banco);
    casos = criarCasosDeUsoDeLocais({
      locais: porta,
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
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

  it('o gerente cadastra área comum; o técnico vê a UH do CM e a área comum', async () => {
    const antes = await uhsAtivas();
    await casos.criarAreaComum(ctx(U.gerenteH1), H1, '  Piscina ', ' Térreo ');
    expect(await uhsAtivas()).toBe(antes); // área comum não conta licença
    const locais = await casos.listarLocais(ctx(U.tecnico), H1);
    expect(locais.map((l) => [l.nome, l.tipo, l.andar, l.status, l.origem, l.editavel])).toEqual([
      ['UH 101', 'uh', '1', 'pendente_licenca', 'sistema_hoteleiro', false],
      ['Piscina', 'area_comum', 'Térreo', 'ativo', 'manual', true],
    ]);
  });

  it('nome repetido entre as ativas é 409; desativar e reativar', async () => {
    await expect(casos.criarAreaComum(ctx(U.gerenteH1), H1, 'piscina', null)).rejects.toMatchObject(
      {
        codigo: 'local_nome_repetido',
      },
    );
    const piscina = (await casos.listarLocais(ctx(U.gerenteH1), H1)).find(
      (l) => l.nome === 'Piscina',
    );
    await casos.desativarAreaComum(ctx(U.gerenteH1), piscina?.id ?? '');
    const nova = await casos.criarAreaComum(ctx(U.gerenteH1), H1, 'Piscina', null);
    await expect(
      casos.reativarAreaComum(ctx(U.gerenteH1), piscina?.id ?? ''),
    ).rejects.toMatchObject({
      codigo: 'local_nome_repetido',
    });
    await casos.alterarAreaComum(ctx(U.gerenteH1), nova.id, 'Piscina coberta', '2');
    await casos.reativarAreaComum(ctx(U.gerenteH1), piscina?.id ?? '');
    const { rows } = await dono.query(
      `select acao from app.auditoria where tenant_id = $1 and entidade = 'local' order by em`,
      [TENANT],
    );
    expect(rows.map((r) => r.acao)).toEqual(['criar', 'desativar', 'criar', 'alterar', 'reativar']);
  });

  it('a UH do sistema hoteleiro é só leitura', async () => {
    await expect(casos.alterarAreaComum(ctx(U.gerenteH1), UH, 'Suíte', null)).rejects.toMatchObject(
      {
        codigo: 'local_so_leitura',
      },
    );
    await expect(casos.desativarAreaComum(ctx(U.admin), UH)).rejects.toMatchObject({
      codigo: 'local_so_leitura',
    });
  });

  it('o técnico não gere; outro hotel não vê; a RLS barra pela porta', async () => {
    await expect(casos.criarAreaComum(ctx(U.tecnico), H1, 'Cozinha', null)).rejects.toMatchObject({
      codigo: 'locais_fora_do_escopo',
    });
    await expect(casos.listarLocais(ctx(U.gerenteH2), H1)).rejects.toMatchObject({
      codigo: 'hotel_nao_encontrado',
    });
    // Sem a checagem da aplicação: gravar direto pela porta, no hotel de outro escopo.
    await expect(
      porta.criarAreaComum(ctx(U.gerenteH2), H1, { nome: 'Pirata', andar: null }),
    ).rejects.toMatchObject({
      code: '42501',
    });
    const piscina = (await casos.listarLocais(ctx(U.gerenteH1), H1)).find(
      (l) => l.tipo === 'area_comum',
    );
    await expect(
      porta.alterar(ctx(U.gerenteH2), piscina?.id ?? '', { status: 'inativo' }),
    ).rejects.toMatchObject({
      codigo: 'local_nao_encontrado',
    });
  });

  it('o proprietário do hotel inteiro vê o hotel ainda sem locais, e nenhum local (0012)', async () => {
    const vistos = await banco.withContext(ctx(U.dono), async (tx) => ({
      hoteis: (await tx.selectFrom('app.hotel').select('nome').execute()).map((h) => h.nome),
      locais: (await tx.selectFrom('app.local').select('nome').execute()).map((l) => l.nome),
    }));
    expect(vistos).toEqual({ hoteis: ['Hotel 3'], locais: [] });
    await expect(casos.listarLocais(ctx(U.dono), H3)).resolves.toEqual([]);
  });

  it('busca (B6): por trecho e sem acento; alterar o nome regrava a busca', async () => {
    const { id } = await casos.criarAreaComum(ctx(U.gerenteH1), H1, 'Salão de Café', null);
    const achados = async (termo: string) =>
      (await casos.listarLocais(ctx(U.tecnico), H1, termo)).map((l) => l.nome);
    expect(await achados('CAFE')).toEqual(['Salão de Café']);
    expect(await achados('lao d')).toEqual(['Salão de Café']);
    await expect(casos.listarLocais(ctx(U.tecnico), H1, 'ca')).rejects.toMatchObject({
      codigo: 'busca_curta',
    });
    await casos.alterarAreaComum(ctx(U.gerenteH1), id, 'Salão de Chá', null);
    expect(await achados('cafe')).toEqual([]);
    expect(await achados('de cha')).toEqual(['Salão de Chá']);
  });
});
