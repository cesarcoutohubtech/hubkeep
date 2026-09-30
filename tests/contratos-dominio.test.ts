// @hubkeep/contratos não depende do domínio nem do i18n (o conector só conhece
// contratos), então repete a lista de papéis e a de idiomas. Este teste impede
// que divirjam.
import { describe, expect, it } from 'vitest';
import {
  CHAVES_DE_POLITICA_API,
  FORMATOS_DE_POLITICA_API,
  IDIOMAS_API,
  PAPEIS_API,
  CATEGORIAS_PADRAO_API,
  PENDENCIAS_DE_IMPLANTACAO_API,
  TIPOS_DE_CAMPO_API,
  STATUS_DE_LOCAL_API,
  TIPOS_DE_LOCAL_API,
  ACOES_DA_OS_API,
  ACOES_DO_CHAMADO_API,
  ENTIDADES_COM_SITUACAO_API,
  ENTIDADES_DA_LINHA_DO_TEMPO_API,
  ESTADOS_DA_OS_API,
  ESTADOS_DO_CHAMADO_API,
  PRIORIDADES_PADRAO_API,
} from '../packages/contratos/src/index';
import type { StatusDeLocal, TipoDeLocal } from '../packages/dominio/src/index';
import {
  CATEGORIAS_PADRAO,
  IDIOMAS_DE_ROTULO,
  TIPOS_DE_CAMPO,
  CHAVES_DE_POLITICA,
  PAPEIS,
  PENDENCIAS_DE_IMPLANTACAO,
  POLITICAS,
  ACOES_DA_OS,
  ACOES_DO_CHAMADO,
  ENTIDADES_COM_SITUACAO,
  ENTIDADES_DA_LINHA_DO_TEMPO,
  ESTADOS_DA_OS,
  ESTADOS_DO_CHAMADO,
  PRIORIDADES_PADRAO,
} from '../packages/dominio/src/index';
import { IDIOMAS } from '../packages/i18n/src/index';

describe('contratos × domínio', () => {
  it('os papéis aceitos pela API são exatamente os do domínio', () => {
    expect([...PAPEIS_API]).toEqual([...PAPEIS]);
  });

  it('os idiomas aceitos pela API são exatamente os do @hubkeep/i18n', () => {
    expect([...IDIOMAS_API]).toEqual([...IDIOMAS]);
  });

  it('as políticas da API são as do domínio, com o mesmo formato (ADR-026)', () => {
    expect([...CHAVES_DE_POLITICA_API].sort()).toEqual([...CHAVES_DE_POLITICA].sort());
    const U = '0193a000-0000-4000-8000-000000000001';
    const amostras: Record<(typeof CHAVES_DE_POLITICA)[number], unknown[]> = {
      'os.aceite_automatico': [
        { ligado: true, dias: 1 },
        { ligado: false, dias: 60 },
        { ligado: true, dias: 0 },
        { ligado: true, dias: 61 },
        { ligado: true, dias: 2.5 },
        { ligado: 'sim', dias: 7 },
        { ligado: true, dias: 7, extra: 1 },
        { ligado: true },
        [true, 7],
        null,
      ],
      'chamado.prioridade_padrao_por_categoria': [
        {},
        { [U]: U },
        { x: U },
        { [U]: 'x' },
        { [U]: 1 },
        [],
        null,
      ],
    };
    for (const chave of CHAVES_DE_POLITICA) {
      expect(FORMATOS_DE_POLITICA_API[chave].safeParse(POLITICAS[chave].padrao).success).toBe(true);
      for (const v of amostras[chave]) {
        expect([chave, v, FORMATOS_DE_POLITICA_API[chave].safeParse(v).success]).toEqual([
          chave,
          v,
          POLITICAS[chave].valido(v),
        ]);
      }
    }
  });

  it('as pendências do painel de implantação são as do domínio', () => {
    expect([...PENDENCIAS_DE_IMPLANTACAO_API]).toEqual([...PENDENCIAS_DE_IMPLANTACAO]);
  });

  it('tipos e status de local da API são os do domínio e do banco (B1)', () => {
    const tipos: readonly TipoDeLocal[] = TIPOS_DE_LOCAL_API;
    const status: readonly StatusDeLocal[] = STATUS_DE_LOCAL_API;
    expect([...tipos].sort()).toEqual(['area_comum', 'uh']);
    expect([...status].sort()).toEqual(['ativo', 'inativo', 'pendente_licenca']);
  });

  it('tipos de campo, categorias padrão e idiomas de rótulo da API são os do domínio (ADR-028)', () => {
    expect([...TIPOS_DE_CAMPO_API]).toEqual([...TIPOS_DE_CAMPO]);
    expect([...CATEGORIAS_PADRAO_API]).toEqual([...CATEGORIAS_PADRAO]);
    expect([...IDIOMAS_DE_ROTULO]).toEqual([...IDIOMAS]);
  });

  it('estados, ações, entidades com situação e prioridades padrão da API são os do domínio (ADR-027)', () => {
    expect([...ESTADOS_DO_CHAMADO_API]).toEqual([...ESTADOS_DO_CHAMADO]);
    expect([...ESTADOS_DA_OS_API]).toEqual([...ESTADOS_DA_OS]);
    expect([...ACOES_DO_CHAMADO_API]).toEqual([...ACOES_DO_CHAMADO]);
    expect([...ACOES_DA_OS_API]).toEqual([...ACOES_DA_OS]);
    expect([...ENTIDADES_COM_SITUACAO_API]).toEqual([...ENTIDADES_COM_SITUACAO]);
    expect([...PRIORIDADES_PADRAO_API]).toEqual(PRIORIDADES_PADRAO.map((p) => p.chave));
  });

  it('as entidades da linha do tempo da API são as do domínio (C7)', () => {
    expect([...ENTIDADES_DA_LINHA_DO_TEMPO_API]).toEqual([...ENTIDADES_DA_LINHA_DO_TEMPO]);
  });
});
