// Anexos (F0-10 e B4) com portas em memória: escopo antes de qualquer URL,
// caminho calculado aqui, download conferido de novo e 404 para tudo fora do
// escopo; o registro confere o caminho e a miniatura antes de gravar.
import {
  type Atribuicao,
  type Contexto,
  NaoEncontrado,
  PermissaoNegada,
  RegraViolada,
} from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { type AnexoGravado, type DadosDeAnexo, criarCasosDeUsoDeAnexos } from '../src/index';

const TENANT = '10000000-0000-4000-8000-000000000001';
const HOTEL = '11100000-0000-4000-8000-000000000001';
const OUTRO_HOTEL = '11100000-0000-4000-8000-000000000002';
const LOCAL = '11110000-0000-4000-8000-000000000001';
const ID = '01939a6e-0000-7000-8000-000000000001';
const ctx: Contexto = { usuarioId: 'u', tenantId: TENANT };
const AGORA = new Date('2026-09-26T12:00:00Z');

function montar(opcoes: {
  hotel?: string | null;
  escreve?: boolean;
  le?: boolean;
  anexos?: AnexoGravado[];
  minhas?: Atribuicao[];
}) {
  const emitidas: string[] = [];
  const registrados: DadosDeAnexo[] = [];
  const removidos: string[] = [];
  const guardados = opcoes.anexos ?? [];
  const casos = criarCasosDeUsoDeAnexos({
    relogio: { agora: () => AGORA },
    novoId: () => ID,
    atribuicoes: { doUsuario: async () => opcoes.minhas ?? [] },
    anexos: {
      hotel: async (_c, id) => ({ id, bandeiraId: null }),
      anexos: async () => guardados.filter((a) => !a.removidoEm),
      anexo: async (_c, id) => guardados.find((a) => a.id === id) ?? null,
      registrar: async (_c, d) => {
        registrados.push(d);
        return { id: 'novo' };
      },
      remover: async (_c, id) => void removidos.push(id),
    },
    escopo: {
      hotelDoRegistro: async () => (opcoes.hotel === undefined ? HOTEL : opcoes.hotel),
      escreveNoHotel: async () => opcoes.escreve ?? true,
      leNoHotel: async () => opcoes.le ?? true,
    },
    armazenamento: {
      urlDeUpload: async (c) => {
        emitidas.push(`upload:${c}`);
        return { url: `https://storage/upload/${c}`, token: 't' };
      },
      urlDeDownload: async (c, s) => {
        emitidas.push(`download:${c}:${s}`);
        return `https://storage/download/${c}`;
      },
    },
  });
  return { casos, emitidas, registrados, removidos };
}

const CAMINHO = `${TENANT}/${HOTEL}/local/${LOCAL}/${ID}.jpg`;

describe('URL de upload', () => {
  it('caminho calculado aqui: tenant/hotel/entidade/registro/id.ext', async () => {
    const { casos, emitidas } = montar({});
    const r = await casos.pedirUrlDeUpload(ctx, {
      entidade: 'local',
      registroId: LOCAL,
      tipo: 'image/jpeg',
    });
    expect(r.caminho).toBe(CAMINHO);
    expect(r.expiraEm.getTime() - AGORA.getTime()).toBe(2 * 60 * 60 * 1000);
    expect(emitidas).toEqual([`upload:${CAMINHO}`]);
  });

  it('registro fora do escopo (a RLS não mostra): 404, sem URL', async () => {
    const { casos, emitidas } = montar({ hotel: null });
    await expect(
      casos.pedirUrlDeUpload(ctx, { entidade: 'local', registroId: LOCAL, tipo: 'image/png' }),
    ).rejects.toBeInstanceOf(NaoEncontrado);
    expect(emitidas).toEqual([]);
  });

  it('quem só lê o hotel (ex.: proprietário) não anexa: 403, sem URL', async () => {
    const { casos, emitidas } = montar({ escreve: false });
    await expect(
      casos.pedirUrlDeUpload(ctx, { entidade: 'local', registroId: LOCAL, tipo: 'image/png' }),
    ).rejects.toBeInstanceOf(PermissaoNegada);
    expect(emitidas).toEqual([]);
  });

  it('tipo fora da lista: 422, antes de olhar o escopo', async () => {
    const { casos, emitidas } = montar({});
    await expect(
      casos.pedirUrlDeUpload(ctx, { entidade: 'local', registroId: LOCAL, tipo: 'text/html' }),
    ).rejects.toBeInstanceOf(RegraViolada);
    expect(emitidas).toEqual([]);
  });
});

describe('URL de download', () => {
  it('caminho do próprio escopo: URL de 5 minutos', async () => {
    const { casos, emitidas } = montar({});
    const r = await casos.pedirUrlDeDownload(ctx, CAMINHO);
    expect(r.expiraEm.getTime() - AGORA.getTime()).toBe(300 * 1000);
    expect(emitidas).toEqual([`download:${CAMINHO}:300`]);
  });

  it.each([
    [
      'caminho de outro tenant',
      CAMINHO.replace(TENANT, '20000000-0000-4000-8000-000000000001'),
      {},
    ],
    ['hotel que o usuário não lê', CAMINHO, { le: false }],
    ['registro que não é daquele hotel', CAMINHO, { hotel: OUTRO_HOTEL }],
    ['registro que o usuário não enxerga', CAMINHO, { hotel: null }],
    ['caminho fora do formato', '../../outro/arquivo.jpg', {}],
    ['entidade sem anexo', CAMINHO.replace('/local/', '/membro/'), {}],
  ] as const)('%s: 404, sem URL', async (_n, caminho, opcoes) => {
    const { casos, emitidas } = montar(opcoes);
    await expect(casos.pedirUrlDeDownload(ctx, caminho)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(emitidas).toEqual([]);
  });
});

const MINIATURA = `${TENANT}/${HOTEL}/local/${LOCAL}/01939a6e-0000-7000-8000-000000000002.webp`;

describe('registro do anexo (B4)', () => {
  it('grava o caminho, a miniatura, o tipo e o nome, no hotel do caminho', async () => {
    const { casos, registrados } = montar({});
    await casos.registrar(ctx, {
      caminho: CAMINHO,
      miniaturaCaminho: MINIATURA,
      nome: '  foto da UH.jpg ',
    });
    expect(registrados).toEqual([
      {
        hotelId: HOTEL,
        entidade: 'local',
        registroId: LOCAL,
        caminho: CAMINHO,
        miniaturaCaminho: MINIATURA,
        tipo: 'image/jpeg',
        nome: 'foto da UH.jpg',
      },
    ]);
  });

  it.each([
    [
      'caminho de outro tenant',
      CAMINHO.replace(TENANT, '20000000-0000-4000-8000-000000000001'),
      {},
    ],
    ['registro que não é daquele hotel', CAMINHO, { hotel: OUTRO_HOTEL }],
    ['registro que o usuário não enxerga', CAMINHO, { hotel: null }],
  ] as const)('%s: 404, sem gravar', async (_n, caminho, opcoes) => {
    const { casos, registrados } = montar(opcoes);
    await expect(casos.registrar(ctx, { caminho })).rejects.toMatchObject({
      codigo: 'registro_nao_encontrado',
    });
    expect(registrados).toEqual([]);
  });

  it('quem só lê o hotel não registra: 403', async () => {
    const { casos, registrados } = montar({ escreve: false });
    await expect(casos.registrar(ctx, { caminho: CAMINHO })).rejects.toBeInstanceOf(
      PermissaoNegada,
    );
    expect(registrados).toEqual([]);
  });

  it.each([
    [
      'caminho fora do formato',
      { caminho: '../../outro/arquivo.jpg' },
      'caminho_de_anexo_invalido',
    ],
    ['caminho em maiúsculas', { caminho: CAMINHO.toUpperCase() }, 'caminho_de_anexo_invalido'],
    [
      'miniatura de outro registro',
      { caminho: CAMINHO, miniaturaCaminho: MINIATURA.replace(LOCAL, HOTEL) },
      'miniatura_invalida',
    ],
    [
      'miniatura que não é imagem',
      { caminho: CAMINHO, miniaturaCaminho: MINIATURA.replace('.webp', '.pdf') },
      'miniatura_invalida',
    ],
    [
      'miniatura igual ao arquivo',
      { caminho: CAMINHO, miniaturaCaminho: CAMINHO },
      'miniatura_invalida',
    ],
  ] as const)('%s: 422, sem gravar', async (_n, pedido, codigo) => {
    const { casos, registrados } = montar({});
    await expect(casos.registrar(ctx, pedido)).rejects.toMatchObject({ codigo });
    expect(registrados).toEqual([]);
  });
});

const gravado = (extra: Partial<AnexoGravado> = {}): AnexoGravado => ({
  id: 'x1',
  hotelId: HOTEL,
  entidade: 'local',
  registroId: LOCAL,
  caminho: CAMINHO,
  miniaturaCaminho: MINIATURA,
  tipo: 'image/jpeg',
  nome: null,
  usuarioId: 'u',
  nomeUsuario: 'Usuário',
  criadoEm: AGORA,
  removidoEm: null,
  ...extra,
});

describe('anexos registrados (B4)', () => {
  it('a lista não expõe o caminho e diz quem pode remover', async () => {
    const { casos } = montar({
      anexos: [gravado(), gravado({ id: 'x2', usuarioId: 'v', miniaturaCaminho: null })],
    });
    const lista = await casos.listar(ctx, 'local', LOCAL);
    expect(lista.map((a) => [a.id, a.temMiniatura, a.podeRemover])).toEqual([
      ['x1', true, true],
      ['x2', false, false],
    ]);
    expect(lista[0]).not.toHaveProperty('caminho');
  });

  it('quem só lê não remove nada, nem o que enviou', async () => {
    const { casos } = montar({ escreve: false, anexos: [gravado()] });
    expect((await casos.listar(ctx, 'local', LOCAL))[0]?.podeRemover).toBe(false);
  });

  it('registro invisível: 404 na lista', async () => {
    const { casos } = montar({ hotel: null });
    await expect(casos.listar(ctx, 'local', LOCAL)).rejects.toBeInstanceOf(NaoEncontrado);
  });

  it('download pelo anexo: o arquivo ou a miniatura, 5 minutos', async () => {
    const { casos, emitidas } = montar({ anexos: [gravado()] });
    await casos.pedirUrlDoAnexo(ctx, 'x1', false);
    await casos.pedirUrlDoAnexo(ctx, 'x1', true);
    expect(emitidas).toEqual([`download:${CAMINHO}:300`, `download:${MINIATURA}:300`]);
  });

  it.each([
    ['anexo que a RLS não mostra', 'x9', []],
    ['anexo removido', 'x1', [gravado({ removidoEm: AGORA })]],
  ] as const)('%s: 404, sem URL', async (_n, id, anexos) => {
    const { casos, emitidas } = montar({ anexos: [...anexos] });
    await expect(casos.pedirUrlDoAnexo(ctx, id, false)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(emitidas).toEqual([]);
  });

  it('miniatura que não existe: 404', async () => {
    const { casos } = montar({ anexos: [gravado({ miniaturaCaminho: null })] });
    await expect(casos.pedirUrlDoAnexo(ctx, 'x1', true)).rejects.toBeInstanceOf(NaoEncontrado);
  });

  it('remove quem enviou; outro usuário sem papel de gestão, não', async () => {
    const { casos, removidos } = montar({
      anexos: [gravado(), gravado({ id: 'x2', usuarioId: 'v' })],
    });
    await casos.remover(ctx, 'x1');
    await expect(casos.remover(ctx, 'x2')).rejects.toMatchObject({
      codigo: 'remover_anexo_fora_do_escopo',
    });
    expect(removidos).toEqual(['x1']);
  });

  it('o gerente do hotel remove o anexo de outro usuário', async () => {
    const gerente: Atribuicao = {
      id: 'a',
      usuarioId: 'u',
      papel: 'gerente_hotel',
      escopo: { tipo: 'hotel', hotelId: HOTEL },
      validoAte: null,
      revogadoEm: null,
    };
    const { casos, removidos } = montar({
      anexos: [gravado({ usuarioId: 'v' })],
      minhas: [gerente],
    });
    await casos.remover(ctx, 'x1');
    expect(removidos).toEqual(['x1']);
  });
});
