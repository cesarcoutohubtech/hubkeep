// Níveis permitidos de uma política de módulo (escopos na ExtensaoDePolitica,
// pedido do agente do Kaio aprovado pelo Cesar em 12/10/2026): a chave que só
// vale no grupo recusa a gravação no hotel e na bandeira, com código; voltar a
// herdar continua valendo em qualquer nível, para limpar o valor antigo.
import { type Atribuicao, type Contexto, registroDePoliticas } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { type EscopoDePolitica, criarCasosDeUsoDeConfiguracao } from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const admin: Atribuicao = {
  id: 'a',
  usuarioId: 'u',
  papel: 'admin_grupo',
  escopo: { tipo: 'grupo' },
  validoAte: null,
  revogadoEm: null,
};
const SO_GRUPO = 'modulo.so_grupo';
const LIVRE = 'modulo.livre';
const registro = registroDePoliticas([
  {
    prefixo: 'modulo.',
    chaves: [SO_GRUPO, LIVRE],
    padrao: () => ({ ligado: false }),
    valido: (_c, v) => typeof v === 'object' && v !== null && 'ligado' in v,
    escopos: (c) => (c === SO_GRUPO ? ['grupo'] : undefined),
  },
]);

function configuracao() {
  const pedidos: [string, EscopoDePolitica, unknown][] = [];
  const casos = criarCasosDeUsoDeConfiguracao({
    configuracao: {
      tenant: async () => null,
      hotel: async () => null,
      politicas: async () => [],
      configurarTenant: async () => undefined,
      configurarHotel: async () => undefined,
      gravarPolitica: async (_c, chave, escopo, valor) => void pedidos.push([chave, escopo, valor]),
    },
    atribuicoes: {
      doUsuario: async () => [admin],
      buscar: async () => null,
      conceder: async () => ({ id: 'x' }),
      revogar: async () => undefined,
    },
    relogio: { agora: () => new Date('2026-10-13T12:00:00Z') },
    politicas: async () => registro,
  });
  return { casos, pedidos };
}

const grupo: EscopoDePolitica = { tipo: 'grupo' };
const bandeira: EscopoDePolitica = { tipo: 'bandeira', bandeiraId: 'b' };
const hotel: EscopoDePolitica = { tipo: 'hotel', hotelId: 'h' };

describe('níveis permitidos da política (escopos da extensão)', () => {
  it('a chave só do grupo grava no grupo e recusa o hotel e a bandeira, sem gravar', async () => {
    const { casos, pedidos } = configuracao();
    await casos.gravarPolitica(ctx, SO_GRUPO, grupo, { ligado: true });
    for (const escopo of [hotel, bandeira]) {
      await expect(
        casos.gravarPolitica(ctx, SO_GRUPO, escopo, { ligado: true }),
      ).rejects.toMatchObject({
        codigo: 'politica_nivel_nao_permitido',
        parametros: { chave: SO_GRUPO, nivel: escopo.tipo, permitidos: 'grupo' },
      });
    }
    expect(pedidos).toEqual([[SO_GRUPO, grupo, { ligado: true }]]);
  });

  it('voltar a herdar vale em qualquer nível, para limpar o valor gravado antes', async () => {
    const { casos, pedidos } = configuracao();
    await casos.gravarPolitica(ctx, SO_GRUPO, hotel, null);
    expect(pedidos).toEqual([[SO_GRUPO, hotel, null]]);
  });

  it('a chave sem escopos e as do núcleo continuam nos três níveis', async () => {
    const { casos, pedidos } = configuracao();
    await casos.gravarPolitica(ctx, LIVRE, hotel, { ligado: true });
    await casos.gravarPolitica(ctx, 'os.foto_depois_obrigatoria', bandeira, { ligado: true });
    expect(pedidos).toHaveLength(2);
  });
});
