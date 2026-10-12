// A origem do chamado e quem executa a OS (I4) moram no domínio
// (ORIGENS_DO_CHAMADO e EXECUTORES_DA_OS), e as colunas app.chamado.origem e
// app.os.executado_por têm checks com os mesmos valores (migração 0034). O
// mesmo vale para o tipo do código de manutenção (I6,
// TIPOS_DE_CODIGO_DE_MANUTENCAO, migração 0036) e para o módulo contratado (I7,
// MODULOS_CONTRATAVEIS, migração 0037) e, no Intelligence, para o estado e o
// motivo do descarte do insight (ESTADOS_DO_INSIGHT e MOTIVOS_DE_DESCARTE,
// migração 0038), e o momento da foto da OS (I8, MOMENTOS_DA_FOTO, migração
// 0041). Este teste lê as migrações e
// falha se um check e a lista do domínio divergirem: valor novo exige migração
// que amplia o check. Os pgTAP 028, 029 e 030 provam, no banco, que o check
// recusa o que está fora (o 031, no insight; o 033, no momento da foto).
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXECUTORES_DA_OS,
  MODULOS_CONTRATAVEIS,
  MOMENTOS_DA_FOTO,
  ORIGENS_DO_CHAMADO,
  TIPOS_DE_CODIGO_DE_MANUTENCAO,
} from '../packages/dominio/src/index';
import { ESTADOS_DO_INSIGHT, MOTIVOS_DE_DESCARTE } from '../packages/inteligencia/src/index';

/** Última definição da restrição, pela ordem das migrações. */
function valoresDoCheck(restricao: string, coluna: string): string[] | undefined {
  const dir = 'supabase/migrations';
  const padrao = new RegExp(
    `constraint\\s+(\\w+)\\s+check\\s*\\(\\s*${coluna}\\s+in\\s*\\(([^)]*)\\)\\s*\\)`,
    'gi',
  );
  let achados: string[] | undefined;
  for (const arquivo of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(`${dir}/${arquivo}`, 'utf8');
    for (const m of sql.matchAll(padrao)) {
      if (m[1] !== restricao) continue;
      achados = [...(m[2] ?? '').matchAll(/'([^']+)'/g)].map((v) => v[1] ?? '');
    }
  }
  return achados;
}

describe('valores canônicos: banco × domínio (I4)', () => {
  it('chamado_origem_lista aceita exatamente as ORIGENS_DO_CHAMADO do domínio', () => {
    expect(valoresDoCheck('chamado_origem_lista', 'origem')).toEqual([...ORIGENS_DO_CHAMADO]);
  });

  it('os_executado_por_lista aceita exatamente os EXECUTORES_DA_OS do domínio', () => {
    expect(valoresDoCheck('os_executado_por_lista', 'executado_por')).toEqual([
      ...EXECUTORES_DA_OS,
    ]);
  });
});

describe('valores canônicos: banco × domínio (I6)', () => {
  it('codigo_manutencao_tipo_lista aceita exatamente os TIPOS_DE_CODIGO_DE_MANUTENCAO do domínio', () => {
    expect(valoresDoCheck('codigo_manutencao_tipo_lista', 'tipo')).toEqual([
      ...TIPOS_DE_CODIGO_DE_MANUTENCAO,
    ]);
  });
});

describe('valores canônicos: banco × domínio (I7)', () => {
  it('licenca_modulo_lista aceita exatamente os MODULOS_CONTRATAVEIS do domínio', () => {
    expect(valoresDoCheck('licenca_modulo_lista', 'modulo')).toEqual([...MODULOS_CONTRATAVEIS]);
  });
});

describe('valores canônicos: banco × domínio (I8)', () => {
  it('anexo_momento_lista aceita exatamente os MOMENTOS_DA_FOTO do domínio', () => {
    expect(valoresDoCheck('anexo_momento_lista', 'momento')).toEqual([...MOMENTOS_DA_FOTO]);
  });
});

describe('valores canônicos: banco × Intelligence (ADR-033)', () => {
  it('insight_estado_lista aceita exatamente os ESTADOS_DO_INSIGHT do módulo', () => {
    expect(valoresDoCheck('insight_estado_lista', 'estado')).toEqual([...ESTADOS_DO_INSIGHT]);
  });

  it('insight_motivo_descarte_lista aceita exatamente os MOTIVOS_DE_DESCARTE do módulo', () => {
    expect(valoresDoCheck('insight_motivo_descarte_lista', 'motivo_descarte')).toEqual([
      ...MOTIVOS_DE_DESCARTE,
    ]);
  });
});
