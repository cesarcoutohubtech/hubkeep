// @hubkeep/contratos não depende do domínio (o conector só conhece contratos),
// então repete a lista de papéis. Este teste impede que as duas divirjam.
import { describe, expect, it } from 'vitest';
import { PAPEIS_API } from '../packages/contratos/src/index';
import { PAPEIS } from '../packages/dominio/src/index';

describe('contratos × domínio', () => {
  it('os papéis aceitos pela API são exatamente os do domínio', () => {
    expect([...PAPEIS_API]).toEqual([...PAPEIS]);
  });
});
