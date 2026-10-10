// Os códigos de manutenção padrão (I6) moram no domínio (CODIGOS_PADRAO) e o
// nome de cada um no catálogo (codigo_manutencao.padrao.<chave>, ADR-027).
// Este teste falha se um código padrão ficar sem nome ou se o catálogo tiver
// nome de código que o domínio não instala.
import { describe, expect, it } from 'vitest';
import { CODIGOS_PADRAO } from '../packages/dominio/src/index';
import { CATALOGOS } from '../packages/i18n/src/index';

const PREFIXO = 'codigo_manutencao.padrao.';

describe('códigos padrão × catálogo (I6)', () => {
  it('cada código padrão tem nome no catálogo, e o catálogo não tem nome sobrando', () => {
    const doCatalogo = Object.keys(CATALOGOS['pt-BR'])
      .filter((c) => c.startsWith(PREFIXO))
      .map((c) => c.slice(PREFIXO.length))
      .sort();
    expect(doCatalogo).toEqual(CODIGOS_PADRAO.map((c) => c.chave).sort());
  });
});
