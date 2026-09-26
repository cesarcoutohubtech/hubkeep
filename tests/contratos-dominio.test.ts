// @hubkeep/contratos não depende do domínio nem do i18n (o conector só conhece
// contratos), então repete a lista de papéis e a de idiomas. Este teste impede
// que divirjam.
import { describe, expect, it } from 'vitest';
import { IDIOMAS_API, PAPEIS_API } from '../packages/contratos/src/index';
import { PAPEIS } from '../packages/dominio/src/index';
import { IDIOMAS } from '../packages/i18n/src/index';

describe('contratos × domínio', () => {
  it('os papéis aceitos pela API são exatamente os do domínio', () => {
    expect([...PAPEIS_API]).toEqual([...PAPEIS]);
  });

  it('os idiomas aceitos pela API são exatamente os do @hubkeep/i18n', () => {
    expect([...IDIOMAS_API]).toEqual([...IDIOMAS]);
  });
});
