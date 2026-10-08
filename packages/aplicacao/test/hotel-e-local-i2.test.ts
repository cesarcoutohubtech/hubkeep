// Modelo contratual do hotel e edificação do local (fase 1b, I2) com as portas
// em memória: o modelo só pelo Admin do grupo, na configuração do hotel
// (ausente, fica o gravado); a edificação em qualquer local, inclusive na UH do
// sistema hoteleiro, pelos papéis que gerem locais, normalizada e com código.
// O que o banco deixa e a busca são do teste de integração (packages/db).
import type { Atribuicao, Contexto } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type LocalDoHotelCadastrado,
  type MudancaDaConfiguracaoDoHotel,
  type MudancaDeLocal,
  criarCasosDeUsoDeConfiguracao,
  criarCasosDeUsoDeLocais,
} from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const AGORA = new Date('2026-10-08T12:00:00Z');
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
const tecnico: Atribuicao = { ...gerente, papel: 'tecnico' };

const atribuicoesDe = (minhas: Atribuicao[]) => ({
  doUsuario: async () => minhas,
  buscar: async () => null,
  conceder: async () => ({ id: 'x' }),
  revogar: async () => undefined,
});

const BASE = {
  fuso: 'America/Sao_Paulo',
  pais: null,
  subdivisao: null,
  moeda: null,
  idiomaPadrao: null,
};

function configuracao(minhas: Atribuicao[]) {
  const gravadas: MudancaDaConfiguracaoDoHotel[] = [];
  const casos = criarCasosDeUsoDeConfiguracao({
    configuracao: {
      tenant: async () => null,
      hotel: async () => null,
      politicas: async () => [],
      configurarTenant: async () => undefined,
      configurarHotel: async (_c, _h, c) => void gravadas.push(c),
      gravarPolitica: async () => undefined,
    },
    atribuicoes: atribuicoesDe(minhas),
    relogio: { agora: () => AGORA },
  });
  return { casos, gravadas };
}

const UH: LocalDoHotelCadastrado = {
  id: 'uh',
  hotelId: 'h',
  nome: 'UH 101',
  tipo: 'uh',
  andar: '1',
  edificacao: null,
  status: 'ativo',
  codExterno: '101',
};
const AREA: LocalDoHotelCadastrado = {
  ...UH,
  id: 'area',
  nome: 'Piscina',
  tipo: 'area_comum',
  andar: null,
  edificacao: 'Área externa',
  codExterno: null,
};

function locais(minhas: Atribuicao[]) {
  const alteracoes: [string, MudancaDeLocal][] = [];
  const criadas: unknown[] = [];
  const todos = [UH, AREA, { ...AREA, id: 'a2', nome: 'Lobby', edificacao: 'área EXTERNA' }];
  const casos = criarCasosDeUsoDeLocais({
    locais: {
      hotel: async () => ({ id: 'h', bandeiraId: null }),
      locais: async () => todos,
      local: async (_c, id) => todos.find((l) => l.id === id) ?? null,
      criarAreaComum: async (_c, _h, dados) => {
        criadas.push(dados);
        return { id: 'nova' };
      },
      alterar: async (_c, id, m) => void alteracoes.push([id, m]),
    },
    atribuicoes: atribuicoesDe(minhas),
    relogio: { agora: () => AGORA },
  });
  return { casos, alteracoes, criadas };
}

describe('modelo contratual do hotel (I2)', () => {
  it('o Admin grava; ausente não vai para a porta; null vai como null', async () => {
    const { casos, gravadas } = configuracao([admin]);
    await casos.configurarHotel(ctx, 'h', { ...BASE, modeloContratual: 'arrendado' });
    await casos.configurarHotel(ctx, 'h', BASE);
    await casos.configurarHotel(ctx, 'h', { ...BASE, modeloContratual: null });
    expect(gravadas.map((g) => ('modeloContratual' in g ? g.modeloContratual : 'ausente'))).toEqual(
      ['arrendado', 'ausente', null],
    );
  });

  it('valor fora da lista: hotel_modelo_contratual_invalido, sem gravar', async () => {
    const { casos, gravadas } = configuracao([admin]);
    await expect(
      casos.configurarHotel(ctx, 'h', { ...BASE, modeloContratual: 'franquia' as 'proprio' }),
    ).rejects.toMatchObject({ codigo: 'hotel_modelo_contratual_invalido' });
    expect(gravadas).toEqual([]);
  });

  it('o gerente do hotel não grava o modelo (configuracao_so_admin)', async () => {
    const { casos, gravadas } = configuracao([gerente]);
    await expect(
      casos.configurarHotel(ctx, 'h', { ...BASE, modeloContratual: 'proprio' }),
    ).rejects.toMatchObject({ codigo: 'configuracao_so_admin' });
    expect(gravadas).toEqual([]);
  });
});

describe('edificação do local (I2)', () => {
  it('na UH do sistema hoteleiro, normalizada; null apaga', async () => {
    const { casos, alteracoes } = locais([gerente]);
    await casos.alterarEdificacao(ctx, 'uh', '  Torre   A ');
    await casos.alterarEdificacao(ctx, 'uh', '   ');
    expect(alteracoes).toEqual([
      ['uh', { edificacao: 'Torre A' }],
      ['uh', { edificacao: null }],
    ]);
  });

  it('quem não gere locais não grava; acima de 60 caracteres tem código', async () => {
    await expect(
      locais([tecnico]).casos.alterarEdificacao(ctx, 'uh', 'Torre'),
    ).rejects.toMatchObject({ codigo: 'locais_fora_do_escopo' });
    await expect(
      locais([gerente]).casos.alterarEdificacao(ctx, 'uh', 'x'.repeat(61)),
    ).rejects.toMatchObject({ codigo: 'local_edificacao_invalida', parametros: { maximo: 60 } });
  });

  it('área comum: ausente fica a gravada (não vai para a porta); null apaga; na criação, nula', async () => {
    const { casos, alteracoes, criadas } = locais([gerente]);
    await casos.alterarAreaComum(ctx, 'area', 'Piscina', null);
    await casos.alterarAreaComum(ctx, 'area', 'Piscina', null, null);
    await casos.criarAreaComum(ctx, 'h', 'Spa', null);
    await casos.criarAreaComum(ctx, 'h', 'Sauna', null, ' Bloco 2 ');
    expect(alteracoes).toEqual([
      ['area', { nome: 'Piscina', andar: null }],
      ['area', { nome: 'Piscina', andar: null, edificacao: null }],
    ]);
    expect(criadas).toEqual([
      { nome: 'Spa', andar: null, edificacao: null },
      { nome: 'Sauna', andar: null, edificacao: 'Bloco 2' },
    ]);
  });

  it('a UH continua só leitura no nome e no andar', async () => {
    await expect(
      locais([gerente]).casos.alterarAreaComum(ctx, 'uh', 'Suíte', null, 'Torre A'),
    ).rejects.toMatchObject({ codigo: 'local_so_leitura' });
  });

  it('sugestões: as edificações do hotel, uma por grafia sem diferença de caixa', async () => {
    expect(await locais([tecnico]).casos.edificacoesDoHotel(ctx, 'h')).toHaveLength(1);
  });
});
