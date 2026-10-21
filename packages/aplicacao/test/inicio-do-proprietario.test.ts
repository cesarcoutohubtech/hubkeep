// O cartão "UHs acompanhadas" da tela inicial (1c, seção 4 da paridade), com as
// portas em memória: quem não é proprietário recebe 403 sem ler o banco; o
// hotel inteiro não entra. O SQL e a RLS são do teste de integração
// (packages/db/test/indicadores.test.ts).
import type { Atribuicao, VinculoDoProprietario } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { criarCasosDeUsoDoInicioDoProprietario } from '../src/index';

const AGORA = new Date('2026-10-21T12:00:00Z');
const ctx = { tenantId: 't', usuarioId: 'u' };

const proprietario: Atribuicao = {
  id: 'a',
  usuarioId: 'u',
  papel: 'proprietario',
  escopo: { tipo: 'proprietario', proprietarioId: 'p' },
  validoAte: null,
  revogadoEm: null,
};

function casos(minhas: Atribuicao[], vinculos: VinculoDoProprietario[] = []) {
  const lidos: string[] = [];
  const c = criarCasosDeUsoDoInicioDoProprietario({
    inicio: {
      vinculos: async () => {
        lidos.push('vinculos');
        return vinculos;
      },
    },
    atribuicoes: { doUsuario: async () => minhas },
    relogio: { agora: () => AGORA },
  });
  return { c, lidos };
}

describe('UHs acompanhadas', () => {
  it('quem não é proprietário recebe 403, sem ler os vínculos', async () => {
    const { c, lidos } = casos([
      { ...proprietario, papel: 'gerente_hotel', escopo: { tipo: 'hotel', hotelId: 'h1' } },
    ]);
    await expect(c.consultar(ctx)).rejects.toMatchObject({
      codigo: 'inicio_do_proprietario_sem_permissao',
    });
    expect(lidos).toEqual([]);
  });

  it('as UHs de cada hotel ligado por UHs; o hotel inteiro não entra', async () => {
    const { c } = casos(
      [proprietario],
      [
        { hotelId: 'h1', hotelNome: 'Alfa', hotelInteiro: false, uhs: 2 },
        { hotelId: 'h2', hotelNome: 'Beta', hotelInteiro: true, uhs: 40 },
      ],
    );
    expect(await c.consultar(ctx)).toEqual({
      uhsAcompanhadas: [{ hotelId: 'h1', hotelNome: 'Alfa', uhs: 2 }],
    });
  });
});
