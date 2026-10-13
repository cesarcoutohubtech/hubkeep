// Nível bandeira nas políticas (fase 1c, item 2 da ordem), com as portas em
// memória: a leitura da configuração mostra o valor de cada nível e a origem
// do efetivo (hotel → bandeira → grupo → padrão); só o Admin do grupo grava na
// bandeira. O que o banco devolve (a bandeira do hotel) e a RLS são do teste de
// integração (packages/db/test/configuracao.test.ts).
import type { Atribuicao, Contexto } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type EscopoDePolitica,
  type PoliticaGravada,
  criarCasosDeUsoDeConfiguracao,
} from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const admin: Atribuicao = {
  id: 'a',
  usuarioId: 'u',
  papel: 'admin_grupo',
  escopo: { tipo: 'grupo' },
  validoAte: null,
  revogadoEm: null,
};
const gerente: Atribuicao = {
  ...admin,
  papel: 'gerente_hotel',
  escopo: { tipo: 'hotel', hotelId: 'h' },
};
const FOTO = 'os.foto_depois_obrigatoria';

function configuracao(minhas: Atribuicao[], gravadas: PoliticaGravada[]) {
  const pedidos: [string, EscopoDePolitica, unknown][] = [];
  const casos = criarCasosDeUsoDeConfiguracao({
    configuracao: {
      tenant: async () => ({
        nome: 'Grupo',
        pais: 'BR',
        subdivisao: null,
        moeda: 'BRL',
        idiomaPadrao: 'pt-BR',
      }),
      hotel: async () => ({
        id: 'h',
        nome: 'Hotel',
        fuso: 'America/Sao_Paulo',
        pais: null,
        subdivisao: null,
        moeda: null,
        idiomaPadrao: null,
        modeloContratual: null,
        bandeira: { id: 'b', nome: 'Bandeira' },
      }),
      politicas: async () => gravadas,
      configurarTenant: async () => undefined,
      configurarHotel: async () => undefined,
      gravarPolitica: async (_c, chave, escopo, valor) => void pedidos.push([chave, escopo, valor]),
    },
    atribuicoes: {
      doUsuario: async () => minhas,
      buscar: async () => null,
      conceder: async () => ({ id: 'x' }),
      revogar: async () => undefined,
    },
    relogio: { agora: () => new Date('2026-10-13T12:00:00Z') },
  });
  return { casos, pedidos };
}

const naBandeira: PoliticaGravada = {
  chave: FOTO,
  escopo: { tipo: 'bandeira', bandeiraId: 'b' },
  valor: { ligado: true },
};

describe('políticas com o nível bandeira (1c)', () => {
  it('a bandeira vale acima do grupo, com a origem', async () => {
    const grupo: PoliticaGravada = {
      chave: FOTO,
      escopo: { tipo: 'grupo' },
      valor: { ligado: false },
    };
    const { casos } = configuracao([gerente], [grupo, naBandeira]);
    const lida = await casos.lerConfiguracao(ctx, 'h');
    expect(lida.hotel?.bandeira).toEqual({ id: 'b', nome: 'Bandeira' });
    expect(lida.politicas.find((p) => p.chave === FOTO)).toMatchObject({
      grupo: { ligado: false },
      bandeira: { ligado: true },
      hotel: null,
      efetiva: { ligado: true },
      origem: 'bandeira',
    });
  });

  it('o hotel vence a bandeira; a bandeira fora do formato não vale', async () => {
    const hotel: PoliticaGravada = {
      chave: FOTO,
      escopo: { tipo: 'hotel', hotelId: 'h' },
      valor: { ligado: false },
    };
    const comHotel = configuracao([gerente], [naBandeira, hotel]);
    expect(
      (await comHotel.casos.lerConfiguracao(ctx, 'h')).politicas.find((p) => p.chave === FOTO),
    ).toMatchObject({ efetiva: { ligado: false }, origem: 'hotel' });

    const torta = configuracao([gerente], [{ ...naBandeira, valor: { ligado: 'sim' } }]);
    expect(
      (await torta.casos.lerConfiguracao(ctx, 'h')).politicas.find((p) => p.chave === FOTO),
    ).toMatchObject({ bandeira: null, origem: 'padrao' });
  });

  it('só o Admin do grupo grava na bandeira, com o formato conferido', async () => {
    const escopo: EscopoDePolitica = { tipo: 'bandeira', bandeiraId: 'b' };
    const doAdmin = configuracao([admin], []);
    await doAdmin.casos.gravarPolitica(ctx, FOTO, escopo, { ligado: true });
    expect(doAdmin.pedidos).toEqual([[FOTO, escopo, { ligado: true }]]);
    await expect(
      doAdmin.casos.gravarPolitica(ctx, FOTO, escopo, { ligado: 'sim' }),
    ).rejects.toMatchObject({ codigo: 'politica_valor_invalido' });

    const doGerente = configuracao([gerente], []);
    await expect(
      doGerente.casos.gravarPolitica(ctx, FOTO, escopo, { ligado: true }),
    ).rejects.toMatchObject({ codigo: 'configuracao_so_admin' });
    expect(doGerente.pedidos).toEqual([]);
  });
});
