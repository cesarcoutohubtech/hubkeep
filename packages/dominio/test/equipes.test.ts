import { describe, expect, it } from 'vitest';
import type { Atribuicao } from '../src/index';
import { normalizarNomeDeEquipe, podeGerirEquipes } from '../src/equipes';

const AGORA = new Date('2026-09-27T12:00:00Z');
const atr = (
  papel: Atribuicao['papel'],
  escopo: Atribuicao['escopo'],
  validoAte: Date | null = null,
): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel,
  escopo,
  validoAte,
  revogadoEm: null,
});
const hotel = { id: 'h1', bandeiraId: 'b1' };
const codigo = (r: ReturnType<typeof podeGerirEquipes>) => (r.permitido ? 'ok' : r.erro.codigo);

describe('quem gerencia equipes do hotel', () => {
  it.each([
    ['admin do grupo', atr('admin_grupo', { tipo: 'grupo' }), 'ok'],
    [
      'gestor da bandeira do hotel',
      atr('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b1' }),
      'ok',
    ],
    [
      'gestor de outra bandeira',
      atr('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b2' }),
      'equipes_fora_do_escopo',
    ],
    ['gerente do hotel', atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' }), 'ok'],
    [
      'gerente de outro hotel',
      atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' }),
      'equipes_fora_do_escopo',
    ],
    [
      'implantador do hotel',
      atr('implantador', { tipo: 'hotel', hotelId: 'h1' }, new Date('2026-12-01')),
      'ok',
    ],
    [
      'implantador vencido',
      atr('implantador', { tipo: 'hotel', hotelId: 'h1' }, new Date('2026-09-01')),
      'equipes_fora_do_escopo',
    ],
    [
      'técnico do hotel',
      atr('tecnico', { tipo: 'hotel', hotelId: 'h1' }),
      'equipes_fora_do_escopo',
    ],
    [
      'proprietário do hotel',
      atr('proprietario', { tipo: 'hotel', hotelId: 'h1' }),
      'equipes_fora_do_escopo',
    ],
  ] as const)('%s', (_n, a, esperado) => {
    expect(codigo(podeGerirEquipes([a], hotel, AGORA))).toBe(esperado);
  });

  it('gestor de bandeira não gerencia hotel sem bandeira', () => {
    const a = atr('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b1' });
    expect(codigo(podeGerirEquipes([a], { id: 'h3', bandeiraId: null }, AGORA))).toBe(
      'equipes_fora_do_escopo',
    );
  });

  it('nome: limpa espaços e recusa vazio', () => {
    expect(normalizarNomeDeEquipe('  Elétrica   noite ')).toBe('Elétrica noite');
    expect(() => normalizarNomeDeEquipe('')).toThrow(
      expect.objectContaining({ codigo: 'equipe_nome_invalido' }),
    );
  });
});
