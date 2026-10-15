// A gravação do histórico de demonstração do Intelligence (gravacao-historico.ts):
//   - sem rede: recusa a Vercel e o banco de produção antes de conectar, e o
//     fim padrão é o último dia cujo job já rodou;
//   - contra o Supabase do runner (só na CI, com Auth e banco reais): grava o
//     roteiro mínimo pela base do kit, e cada cenário abre o insight esperado e
//     termina no estado do roteiro, sem nenhum insight do ruído; rodar de novo
//     com o mesmo fim não grava nada; com outro fim, recusa antes de gravar.
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import {
  FimDiferente,
  type ResumoDaGravacao,
  baseDoKit,
  fimPadraoDoHistorico,
  gravarHistorico,
} from './gravacao-historico';
import { VOLUME_MINIMO, roteiroDoHistorico } from './historico-inteligencia';

const FIM = '2026-10-12';
const REF_PRODUCAO = 'cccccccccccccccccccc';
const doPooler = (papel: string, ref: string) =>
  `postgresql://${papel}.${ref}:x@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;

describe('a gravação recusa antes de conectar', () => {
  const base = async () => {
    throw new Error('a base não pode rodar');
  };
  it('na Vercel', async () => {
    await expect(
      gravarHistorico({
        fim: FIM,
        urlDono: 'postgresql://postgres@127.0.0.1:54322/postgres',
        base,
        ambiente: {
          VERCEL: '1',
          DATABASE_URL_APP: 'postgresql://hk_app:x@127.0.0.1:54322/postgres',
          DATABASE_URL_WORKER: 'postgresql://hk_worker:x@127.0.0.1:54322/postgres',
        },
        configToml: '',
      }),
    ).rejects.toThrow(/Vercel/);
  });
  it('no banco de produção', async () => {
    await expect(
      gravarHistorico({
        fim: FIM,
        urlDono: doPooler('postgres', REF_PRODUCAO),
        base,
        ambiente: {
          HK_REF_PRODUCAO: REF_PRODUCAO,
          DATABASE_URL_APP: doPooler('hk_app', REF_PRODUCAO),
          DATABASE_URL_WORKER: doPooler('hk_worker', REF_PRODUCAO),
        },
        configToml: '',
      }),
    ).rejects.toThrow(/produção/);
  });
  it('com o job do último dia ainda por rodar', async () => {
    await expect(
      gravarHistorico({
        fim: FIM,
        urlDono: 'x',
        base,
        agoraReal: new Date('2026-10-13T05:00:00Z'),
        momento: 'como_em_producao',
      }),
    ).rejects.toThrow(/depois de agora/);
  });
});

describe('fimPadraoDoHistorico', () => {
  it('como em produção: ontem depois das 06:00 UTC, anteontem antes', () => {
    expect(fimPadraoDoHistorico(new Date('2026-10-13T06:00:00Z'), 'como_em_producao')).toBe(
      '2026-10-12',
    );
    expect(fimPadraoDoHistorico(new Date('2026-10-13T05:59:59Z'), 'como_em_producao')).toBe(
      '2026-10-11',
    );
  });
  it('no fim do dia local: ontem depois da meia-noite de São Paulo', () => {
    expect(fimPadraoDoHistorico(new Date('2026-10-13T03:00:00Z'), 'fim_do_dia_local')).toBe(
      '2026-10-12',
    );
    expect(fimPadraoDoHistorico(new Date('2026-10-13T02:59:00Z'), 'fim_do_dia_local')).toBe(
      '2026-10-11',
    );
  });
});

const URL_DONO = process.env['HK_TESTE_URL_DONO'];
const temAmbiente = Boolean(
  process.env['NEXT_PUBLIC_SUPABASE_URL'] &&
  URL_DONO &&
  process.env['DATABASE_URL_APP'] &&
  process.env['DATABASE_URL_WORKER'] &&
  process.env['DATABASE_URL_INGESTAO'],
);
if (!temAmbiente && process.env['HK_EXIGIR_BANCO'] === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas falta o ambiente do Supabase local (URL, chave, banco).');
}

/**
 * As tabelas do grupo, na ordem em que a limpeza apaga (filhas antes das mães):
 * as do kit (semear.test.ts) e as do Intelligence. O banco do runner volta ao
 * que era, porque o pgTAP roda de novo depois e conta linhas de todos os
 * tenants (o modelo contratual dos hotéis do kit, por exemplo).
 */
const TABELAS = [
  'app.auditoria',
  'app.evento_dominio',
  'app.operacao_offline',
  'app.metrica_ativo_diaria',
  'app.insight',
  'app.anexo',
  'app.os_material',
  'app.os_apontamento',
  'app.parada_ativo',
  'app.os_checklist',
  'app.os_transicao',
  'app.os',
  'app.chamado',
  'app.codigo_manutencao',
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
  'app.checklist_modelo',
  'app.categoria_ativo',
  'app.fornecedor',
  'app.situacao',
  'app.prioridade',
  'app.politica',
  'app.hotel',
  'app.bandeira',
  'app.membro',
  'staging.registro_externo',
  'staging.carga',
  'staging.credencial_agente',
  'licenca.modulo',
  'licenca.contrato',
];

// O roteiro mínimo passa por cerca de 1.600 operações e 183 rodadas do job,
// duas vezes: 84 s num Postgres local, contra cerca de 320 s do roteiro curto,
// que levava 11 minutos no runner e estourava o job do banco (pedido da 1b,
// 14/10/2026). O limite é próprio, com folga.
const LIMITE_MS = 30 * 60_000;

describe.skipIf(!temAmbiente)('a gravação no Supabase do runner', () => {
  const tenantId = randomUUID();
  const opcoes = {
    fim: FIM,
    volume: VOLUME_MINIMO,
    urlDono: URL_DONO as string,
    tenantId,
    dominio: `historico-${tenantId.slice(0, 8)}.hubkeep.test`,
    base: baseDoKit({ senha: `Senha-do-historico-${randomUUID().slice(0, 8)}` }),
  };
  const contar = async () => {
    const dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    try {
      const n = async (tabela: string) =>
        Number(
          (
            await dono.query<{ n: string }>(
              `select count(*) as n from ${tabela} where tenant_id = $1`,
              [tenantId],
            )
          ).rows[0]?.n,
        );
      return {
        chamados: await n('app.chamado'),
        transicoes: await n('app.os_transicao'),
        metricas: await n('app.metrica_ativo_diaria'),
        insights: await n('app.insight'),
      };
    } finally {
      await dono.end();
    }
  };
  let primeira: ResumoDaGravacao;

  afterAll(async () => {
    const dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    try {
      for (const t of TABELAS)
        await dono.query(`delete from ${t} where tenant_id = $1`, [tenantId]);
      await dono.query(`delete from app.tenant where id = $1`, [tenantId]);
      await dono.query(`delete from auth.users where email like $1`, [`%@${opcoes.dominio}`]);
    } finally {
      await dono.end();
    }
  });

  it(
    'cada cenário abre o insight esperado e termina no estado do roteiro',
    async () => {
      primeira = await gravarHistorico(opcoes);
      expect(primeira.inesperados).toEqual([]);
      const r = roteiroDoHistorico({ fim: FIM, volume: VOLUME_MINIMO });
      const esperados = Object.fromEntries(
        r.cenarios.filter((c) => c.alvo).map((c) => [c.chave, c.estadoFinal]),
      );
      expect(primeira.estados).toEqual(esperados);
      expect(primeira.diasCalculados).toBe(r.dias.length);
    },
    LIMITE_MS,
  );

  it(
    'rodar de novo com o mesmo fim não grava nada; com outro fim, recusa',
    async () => {
      const antes = await contar();
      const linhas: string[] = [];
      const segunda = await gravarHistorico({ ...opcoes, log: (l) => linhas.push(l) });
      // A retomada pula, sem consulta, o que vem antes do último dia gravado.
      expect(linhas.some((l) => l.startsWith('Retomada no dia '))).toBe(true);
      expect(segunda.diasCalculados).toBe(0);
      expect(segunda.decisoes).toBe(0);
      expect(segunda.estados).toEqual(primeira.estados);
      expect(await contar()).toEqual(antes);
      await expect(gravarHistorico({ ...opcoes, fim: '2026-10-05' })).rejects.toThrow(FimDiferente);
    },
    LIMITE_MS,
  );
});
