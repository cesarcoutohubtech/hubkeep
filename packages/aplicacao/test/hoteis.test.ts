// Hotéis a partir do staging (fase 1a, A1) com a porta em memória: só o Admin
// do grupo; importação valida nome e fuso; ativação consome licença, libera
// UHs pendentes até o saldo e, sem saldo, registra a tentativa antes do 409.
import {
  type Atribuicao,
  Conflito,
  type Contexto,
  NaoEncontrado,
  PermissaoNegada,
  RegraViolada,
} from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type HotelCadastrado,
  type HotelDoStaging,
  type SessaoDeHoteis,
  type UsoDaLicenca,
  criarCasosDeUsoDeHoteis,
} from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const AGORA = new Date('2026-09-27T12:00:00Z');
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

function montar(opcoes: {
  atribuicoes?: Atribuicao[];
  staging?: HotelDoStaging[];
  cadastrados?: HotelCadastrado[];
  uso?: UsoDaLicenca;
  pendentes?: number;
}) {
  const cadastrados = [...(opcoes.cadastrados ?? [])];
  const uso: UsoDaLicenca = opcoes.uso ?? {
    hoteis: { contratados: 5, emUso: 1 },
    uhs: { contratadas: 100, emUso: 10 },
  };
  const registro: string[] = [];
  const pendentes = Array.from({ length: opcoes.pendentes ?? 0 }, (_, i) => ({ id: `uh${i}` }));
  const sessao: SessaoDeHoteis = {
    usoDaLicenca: async () => uso,
    hotel: async (id) => cadastrados.find((h) => h.id === id) ?? null,
    hotelPorCodigo: async (f, c) =>
      cadastrados.find((h) => h.sistemaOrigem === f && h.codExterno === c) ?? null,
    hotelDoStaging: async (f, c) =>
      (opcoes.staging ?? []).find((s) => s.fonte === f && s.chave === c) ?? null,
    criarHotel: async (h) => {
      const id = `novo-${h.chave}`;
      cadastrados.push({
        id,
        status: 'em_implantacao',
        nome: h.nome,
        fuso: h.fuso,
        sistemaOrigem: h.fonte,
        codExterno: h.chave,
        modeloContratual: null,
      });
      registro.push(`criar:${h.nome}:${h.fuso}`);
      return id;
    },
    ativarHotel: async (id) => void registro.push(`ativar:${id}`),
    uhsPendentes: async () => pendentes,
    liberarUh: async (_h, id) => void registro.push(`liberar:${id}`),
    registrarAtivacaoBloqueada: async (id) => void registro.push(`bloqueio:${id}`),
  };
  const casos = criarCasosDeUsoDeHoteis({
    hoteis: {
      listar: async () => ({ staging: opcoes.staging ?? [], cadastrados, uso }),
      emSessao: (_c, fn) => fn(sessao),
    },
    atribuicoes: {
      doUsuario: async () => opcoes.atribuicoes ?? [admin],
      buscar: async () => null,
      conceder: async () => ({ id: 'x' }),
      revogar: async () => undefined,
    },
    relogio: { agora: () => AGORA },
  });
  return { casos, registro };
}

const doStaging = (chave: string, dados: Record<string, unknown>): HotelDoStaging => ({
  fonte: 'totvs_cm',
  chave,
  dados,
  recebidoEm: AGORA,
});
const cadastrado = (
  id: string,
  status: HotelCadastrado['status'],
  extra: Partial<HotelCadastrado> = {},
): HotelCadastrado => ({
  id,
  status,
  nome: 'Hotel',
  fuso: 'America/Sao_Paulo',
  sistemaOrigem: 'totvs_cm',
  codExterno: id,
  modeloContratual: null,
  ...extra,
});

describe('só o Admin do grupo', () => {
  it('gerente não lista, não importa e não ativa', async () => {
    const { casos, registro } = montar({
      atribuicoes: [gerente],
      staging: [doStaging('H1', { nome: 'H1' })],
    });
    await expect(casos.listarParaAtivacao(ctx)).rejects.toBeInstanceOf(PermissaoNegada);
    await expect(
      casos.importarHotel(ctx, { fonte: 'totvs_cm', chave: 'H1', fuso: 'America/Sao_Paulo' }),
    ).rejects.toBeInstanceOf(PermissaoNegada);
    await expect(casos.ativarHotel(ctx, 'h')).rejects.toBeInstanceOf(PermissaoNegada);
    expect(registro).toEqual([]);
  });
});

describe('listar', () => {
  it('junta o staging ao cadastro e aponta o que difere', async () => {
    const { casos } = montar({
      staging: [
        doStaging('H1', { nome: 'Hotel Um', fuso: 'America/Manaus' }),
        doStaging('H2', { nome: 'Hotel Dois', fuso: 'fuso-errado' }),
      ],
      cadastrados: [cadastrado('H1', 'ativo', { nome: 'Hotel 1', codExterno: 'H1' })],
    });
    const { hoteis } = await casos.listarParaAtivacao(ctx);
    expect(hoteis[0]).toMatchObject({ chave: 'H1', diferencas: ['nome', 'fuso'] });
    expect(hoteis[0]?.hotel?.id).toBe('H1');
    expect(hoteis[1]).toMatchObject({ chave: 'H2', nome: 'Hotel Dois', fuso: null, hotel: null });
  });
});

describe('importar', () => {
  it('cria em implantação com o fuso do staging ou o do pedido', async () => {
    const { casos, registro } = montar({
      staging: [
        doStaging('H1', { nome: 'Hotel Um', fuso: 'America/Manaus' }),
        doStaging('H2', { nome: 'Hotel Dois' }),
      ],
    });
    await casos.importarHotel(ctx, { fonte: 'totvs_cm', chave: 'H1' });
    await casos.importarHotel(ctx, { fonte: 'totvs_cm', chave: 'H2', fuso: 'Europe/Lisbon' });
    expect(registro).toEqual(['criar:Hotel Um:America/Manaus', 'criar:Hotel Dois:Europe/Lisbon']);
  });

  it.each([
    ['fora do staging', 'H9', undefined, NaoEncontrado, 'hotel_nao_encontrado_no_staging'],
    ['sem fuso', 'H2', undefined, RegraViolada, 'fuso_obrigatorio'],
    ['fuso inválido', 'H2', '-03:00', RegraViolada, 'fuso_invalido'],
    ['sem nome no staging', 'H3', 'UTC', RegraViolada, 'hotel_sem_nome_no_staging'],
    ['já importado', 'H1', undefined, Conflito, 'hotel_ja_importado'],
  ] as const)('%s: erro com código, nada gravado', async (_n, chave, fuso, classe, codigo) => {
    const { casos, registro } = montar({
      staging: [
        doStaging('H1', { nome: 'Hotel Um', fuso: 'UTC' }),
        doStaging('H2', { nome: 'Hotel Dois' }),
        doStaging('H3', { fuso: 'UTC' }),
      ],
      cadastrados: [cadastrado('H1', 'em_implantacao')],
    });
    const erro = await casos
      .importarHotel(ctx, { fonte: 'totvs_cm', chave, fuso })
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(classe);
    expect((erro as { codigo: string }).codigo).toBe(codigo);
    expect(registro).toEqual([]);
  });
});

describe('ativar', () => {
  it('com saldo: ativa e libera as UHs pendentes até o saldo de UHs', async () => {
    const { casos, registro } = montar({
      cadastrados: [cadastrado('h1', 'em_implantacao')],
      uso: { hoteis: { contratados: 2, emUso: 1 }, uhs: { contratadas: 12, emUso: 10 } },
      pendentes: 3,
    });
    expect(await casos.ativarHotel(ctx, 'h1')).toEqual({
      hotelId: 'h1',
      uhsLiberadas: 2,
      uhsPendentes: 1,
    });
    expect(registro).toEqual(['ativar:h1', 'liberar:uh0', 'liberar:uh1']);
  });

  it('sem saldo de hotéis: registra a tentativa e devolve 409 com o uso', async () => {
    const { casos, registro } = montar({
      cadastrados: [cadastrado('h1', 'em_implantacao')],
      uso: { hoteis: { contratados: 1, emUso: 1 }, uhs: { contratadas: 12, emUso: 0 } },
    });
    const erro = await casos.ativarHotel(ctx, 'h1').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(Conflito);
    expect(erro).toMatchObject({
      codigo: 'licenca_hoteis_sem_saldo',
      parametros: { contratados: 1, emUso: 1 },
    });
    expect(registro).toEqual(['bloqueio:h1']);
  });

  it('hotel já ativo: 409 hotel_ja_ativo; hotel invisível: 404', async () => {
    const { casos } = montar({ cadastrados: [cadastrado('h1', 'ativo')] });
    await expect(casos.ativarHotel(ctx, 'h1')).rejects.toMatchObject({ codigo: 'hotel_ja_ativo' });
    await expect(casos.ativarHotel(ctx, 'h9')).rejects.toMatchObject({
      codigo: 'hotel_nao_encontrado',
    });
  });
});
