// @hubkeep/contratos não depende do domínio nem do i18n (o conector só conhece
// contratos), então repete a lista de papéis e a de idiomas. Este teste impede
// que divirjam.
import { describe, expect, it } from 'vitest';
import {
  CHAVES_DE_POLITICA_API,
  FORMATOS_DE_POLITICA_API,
  IDIOMAS_API,
  PAPEIS_API,
  PENDENCIAS_DE_IMPLANTACAO_API,
  STATUS_DE_LOCAL_API,
  TIPOS_DE_LOCAL_API,
} from '../packages/contratos/src/index';
import type { StatusDeLocal, TipoDeLocal } from '../packages/dominio/src/index';
import {
  CHAVES_DE_POLITICA,
  PAPEIS,
  PENDENCIAS_DE_IMPLANTACAO,
  POLITICAS,
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
});
