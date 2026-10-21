// O cartão "UHs acompanhadas" da tela inicial (1c, seção 4 da paridade): que
// hotéis entram e quem vê.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  type Papel,
  type VinculoDoProprietario,
  hoteisDasUhsAcompanhadas,
  podeVerOInicioDoProprietario,
} from '../src/index';

const AGORA = new Date('2026-10-21T12:00:00Z');

const vinculo = (v: Partial<VinculoDoProprietario>): VinculoDoProprietario => ({
  hotelId: 'h',
  hotelNome: 'Hotel',
  hotelInteiro: false,
  uhs: 2,
  ...v,
});

describe('hotéis das UHs acompanhadas', () => {
  it('só o vínculo por UHs, com alguma UH ativa; o hotel inteiro fica de fora', () => {
    expect(
      hoteisDasUhsAcompanhadas([
        vinculo({ hotelId: 'uhs' }),
        vinculo({ hotelId: 'sem_uh_ativa', uhs: 0 }),
        vinculo({ hotelId: 'inteiro', hotelInteiro: true, uhs: 40 }),
      ]).map((v) => v.hotelId),
    ).toEqual(['uhs']);
  });
});

describe('quem vê o cartão', () => {
  const atribuicao = (papel: Papel, validoAte: Date | null = null): Atribuicao => ({
    id: 'a',
    usuarioId: 'u',
    papel,
    escopo:
      papel === 'proprietario'
        ? { tipo: 'proprietario', proprietarioId: 'p' }
        : { tipo: 'hotel', hotelId: 'h1' },
    validoAte,
    revogadoEm: null,
  });

  it('o proprietário vigente vê; a gestão e o vencido recebem o código, sem frase', () => {
    expect(podeVerOInicioDoProprietario([atribuicao('proprietario')], AGORA).permitido).toBe(true);
    for (const minhas of [
      [atribuicao('gerente_hotel')],
      [atribuicao('proprietario', new Date('2026-10-01T00:00:00Z'))],
    ]) {
      const r = podeVerOInicioDoProprietario(minhas, AGORA);
      expect(r.permitido ? null : r.erro.codigo).toBe('inicio_do_proprietario_sem_permissao');
    }
  });
});
