// B6 (docs/11): o banco repete alguns estados do domínio por integridade e
// autorização (o índice os_uma_ativa_por_chamado e as policies que olham a OS
// não cancelada). Se o domínio renomear um estado, a policy continuaria
// comparando com o nome velho, sem erro. Este teste lê o catálogo do banco de
// verdade e confere cada literal comparado com `estado` contra os estados do
// chamado e da OS.
import { ESTADOS_DA_OS, ESTADOS_DO_CHAMADO } from '@hubkeep/dominio';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const URL_DONO = process.env.HK_TESTE_URL_DONO;
if (!URL_DONO && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas falta HK_TESTE_URL_DONO.');
}

// pg_get_expr escreve "(o.estado <> 'cancelada'::text)" e "estado = ANY (ARRAY['a'::text, 'b'::text])".
const COMPARACAO = /estado\)?\s*(?:<>|!=|=)\s*'([a-z_]+)'/g;
const LISTA = /estado\)?\s*(?:<>|=)\s*(?:ANY|ALL)\s*\(\s*(?:ARRAY)?\[([^\]]*)\]/gi;

function literais(texto: string): string[] {
  const achados = [...texto.matchAll(COMPARACAO)].map((m) => m[1] ?? '');
  for (const m of texto.matchAll(LISTA)) {
    for (const item of (m[1] ?? '').matchAll(/'([a-z_]+)'/g)) achados.push(item[1] ?? '');
  }
  return achados;
}

describe.skipIf(!URL_DONO)('estados do banco existem no domínio (B6)', () => {
  let dono: pg.Client;
  let textos: { origem: string; texto: string }[] = [];

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    const { rows } = await dono.query<{ origem: string; texto: string }>(`
      select schemaname || '.' || tablename || '.' || policyname as origem,
             coalesce(qual, '') || ' ' || coalesce(with_check, '') as texto
      from pg_policies where schemaname in ('app', 'staging', 'licenca')
      union all
      select schemaname || '.' || indexname, indexdef
      from pg_indexes where schemaname in ('app', 'staging', 'licenca')
    `);
    textos = rows;
  });

  afterAll(async () => {
    await dono?.end();
  });

  it('controle: a leitura acha o cancelada do índice e das policies da OS', () => {
    const origens = textos
      .filter((t) => literais(t.texto).includes('cancelada'))
      .map((t) => t.origem);
    expect(origens).toContain('app.os_uma_ativa_por_chamado');
    expect(origens.length).toBeGreaterThan(1);
  });

  it('controle: a leitura entende a forma de lista', () => {
    expect(literais("(estado = ANY (ARRAY['aberto'::text, 'em_triagem'::text]))")).toEqual([
      'aberto',
      'em_triagem',
    ]);
  });

  it('todo estado comparado em policy ou índice existe no chamado ou na OS', () => {
    const conhecidos = new Set<string>([...ESTADOS_DA_OS, ...ESTADOS_DO_CHAMADO]);
    const estranhos = textos.flatMap((t) =>
      literais(t.texto)
        .filter((l) => !conhecidos.has(l))
        .map((l) => `${t.origem}: ${l}`),
    );
    expect(estranhos).toEqual([]);
  });
});
