// A origem do chamado e quem executa a OS (I4) moram no domínio
// (ORIGENS_DO_CHAMADO e EXECUTORES_DA_OS), e as colunas app.chamado.origem e
// app.os.executado_por têm checks com os mesmos valores (migração 0034). O
// mesmo vale para o tipo do código de manutenção (I6,
// TIPOS_DE_CODIGO_DE_MANUTENCAO, migração 0036) e para o módulo contratado (I7,
// MODULOS_CONTRATAVEIS, migração 0037) e, no Intelligence, para o estado e o
// motivo do descarte do insight (ESTADOS_DO_INSIGHT e MOTIVOS_DE_DESCARTE,
// migração 0038), o momento da foto da OS (I8, MOMENTOS_DA_FOTO, migração
// 0041), o motivo da pausa da OS (1c, MOTIVOS_DE_PAUSA, migração 0043) e a
// unidade e a situação do plano preventivo (PV2, UNIDADES_DE_PERIODICIDADE e
// SITUACOES_DO_PLANO, migração 0045). Este
// teste lê as migrações e falha se um check e a lista do domínio divergirem:
// valor novo exige migração que amplia o check. Os pgTAP 028, 029 e 030
// provam, no banco, que o check recusa o que está fora (o 031, no insight; o
// 033, no momento da foto; o 035, no motivo da pausa; o 036, no plano).
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACOES_DA_OS,
  EXECUTORES_DA_OS,
  MODULOS_CONTRATAVEIS,
  MOMENTOS_DA_FOTO,
  MOTIVOS_DE_PAUSA,
  TIPOS_DE_ALERTA_DE_SLA,
  ORIGENS_DO_CHAMADO,
  SITUACOES_DO_PLANO,
  TIPOS_DE_CODIGO_DE_MANUTENCAO,
  UNIDADES_DE_PERIODICIDADE,
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

describe('valores canônicos: banco × domínio (1c, ADR-042)', () => {
  it('os_transicao_motivo_pausa_lista aceita exatamente os MOTIVOS_DE_PAUSA do domínio', () => {
    expect(valoresDoCheck('os_transicao_motivo_pausa_lista', 'motivo_pausa')).toEqual([
      ...MOTIVOS_DE_PAUSA,
    ]);
  });
});

describe('valores canônicos: banco × domínio (1c, ADR-043)', () => {
  it('sla_alerta_tipo_lista aceita exatamente os TIPOS_DE_ALERTA_DE_SLA do domínio', () => {
    expect(valoresDoCheck('sla_alerta_tipo_lista', 'tipo')).toEqual([...TIPOS_DE_ALERTA_DE_SLA]);
  });
});

describe('valores canônicos: banco × domínio (1c, ADR-044)', () => {
  it('a ação sem autor da transição (0046) é uma ação da OS do domínio', () => {
    const sql = readFileSync('supabase/migrations/20261013210000_aceite_automatico.sql', 'utf8');
    const m =
      /os_transicao_sem_autor_so_no_aceite_automatico\s+check\s*\(\s*\(usuario_id is null\) = \(acao = '(\w+)'\)\s*\)/.exec(
        sql,
      );
    expect(m?.[1]).toBe('aceitar_automatico');
    expect(ACOES_DA_OS).toContain(m?.[1]);
  });

  it('as ações sem autor da transição (0048: o aceite automático e a geração da preventiva) são ações da OS do domínio', () => {
    const sql = readFileSync('supabase/migrations/20261013233000_os_preventiva.sql', 'utf8');
    const m =
      /os_transicao_sem_autor_so_nos_jobs\s+check\s*\(\s*usuario_id is not null or acao in \(([^)]*)\)\s*\)/.exec(
        sql,
      );
    const acoes = [...(m?.[1] ?? '').matchAll(/'([^']+)'/g)].map((v) => v[1]);
    expect(acoes).toEqual(['aceitar_automatico', 'gerar']);
    for (const acao of acoes) expect(ACOES_DA_OS).toContain(acao);
  });
});

describe('valores canônicos: banco × domínio (PV2, ADR-041)', () => {
  it('plano_preventivo_unidade_lista aceita exatamente as UNIDADES_DE_PERIODICIDADE do domínio', () => {
    expect(valoresDoCheck('plano_preventivo_unidade_lista', 'unidade')).toEqual([
      ...UNIDADES_DE_PERIODICIDADE,
    ]);
  });

  it('plano_preventivo_situacao_lista aceita exatamente as SITUACOES_DO_PLANO do domínio', () => {
    expect(valoresDoCheck('plano_preventivo_situacao_lista', 'situacao')).toEqual([
      ...SITUACOES_DO_PLANO,
    ]);
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
