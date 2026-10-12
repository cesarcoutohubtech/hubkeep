// Anexos (F0-10 e B4) com portas em memória: escopo antes de qualquer URL,
// caminho calculado aqui, download conferido de novo e 404 para tudo fora do
// escopo; o registro confere o caminho e a miniatura antes de gravar. Na I8,
// o momento da foto da OS e a URL da assinatura do aceite.
import {
  type Atribuicao,
  Conflito,
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
  /** Caminhos que já têm arquivo no Storage. */
  noStorage?: string[];
  regraParaAnexar?: (ctx: Contexto, entidade: string, registroId: string) => Promise<void>;
  regraParaAssinar?: (ctx: Contexto, osId: string) => Promise<void>;
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
    ...(opcoes.regraParaAnexar ? { regraParaAnexar: opcoes.regraParaAnexar } : {}),
    ...(opcoes.regraParaAssinar ? { regraParaAssinar: opcoes.regraParaAssinar } : {}),
    armazenamento: {
      urlDeUpload: async (c) => {
        if (opcoes.noStorage?.includes(c)) return null;
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

  it('com o arquivoId do aparelho (foto offline, C4), o caminho sai igual no reenvio', async () => {
    const { casos } = montar({});
    const arquivoId = '0193b000-0000-7000-8000-00000000abcd';
    const pedir = () =>
      casos.pedirUrlDeUpload(ctx, {
        entidade: 'local',
        registroId: LOCAL,
        tipo: 'image/jpeg',
        arquivoId,
      });
    const [a, b] = [await pedir(), await pedir()];
    expect(a.caminho).toBe(`${TENANT}/${HOTEL}/local/${LOCAL}/${arquivoId}.jpg`);
    expect(b.caminho).toBe(a.caminho);
  });

  it('reenvio com o arquivo já no Storage: 409 arquivo_ja_enviado, com o caminho', async () => {
    const arquivoId = '0193b000-0000-7000-8000-00000000abcd';
    const caminho = `${TENANT}/${HOTEL}/os/${LOCAL}/${arquivoId}.jpg`;
    const { casos, emitidas } = montar({ noStorage: [caminho] });
    await expect(
      casos.pedirUrlDeUpload(ctx, {
        entidade: 'os',
        registroId: LOCAL,
        tipo: 'image/jpeg',
        arquivoId,
      }),
    ).rejects.toMatchObject({ codigo: 'arquivo_ja_enviado', parametros: { caminho } });
    expect(emitidas).toEqual([]);
  });

  it('a regra da entidade (a OS, C4) vale no upload e no registro, depois do escopo', async () => {
    const vistas: string[] = [];
    const { casos, emitidas, registrados } = montar({
      regraParaAnexar: async (_c, entidade, registroId) => {
        vistas.push(`${entidade}:${registroId}`);
        if (entidade === 'os') throw new Conflito('transicao_invalida', 'OS concluída.');
      },
    });
    await expect(
      casos.pedirUrlDeUpload(ctx, { entidade: 'os', registroId: LOCAL, tipo: 'image/jpeg' }),
    ).rejects.toMatchObject({ codigo: 'transicao_invalida' });
    await expect(
      casos.registrar(ctx, { caminho: `${TENANT}/${HOTEL}/os/${LOCAL}/${ID}.jpg`, nome: null }),
    ).rejects.toMatchObject({ codigo: 'transicao_invalida' });
    expect(emitidas).toEqual([]);
    expect(registrados).toEqual([]);
    // As outras entidades passam pela mesma porta e seguem.
    await casos.pedirUrlDeUpload(ctx, { entidade: 'local', registroId: LOCAL, tipo: 'image/jpeg' });
    expect(vistas).toEqual([`os:${LOCAL}`, `os:${LOCAL}`, `local:${LOCAL}`]);
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
        momento: null,
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
  momento: null,
  assinatura: false,
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

const OS = '0a100000-0000-4000-8000-000000000001';
const FOTO_DA_OS = `${TENANT}/${HOTEL}/os/${OS}/${ID}.jpg`;

describe('foto antes ou depois (I8)', () => {
  it('a foto da OS grava o momento', async () => {
    const { casos, registrados } = montar({});
    await casos.registrar(ctx, { caminho: FOTO_DA_OS, momento: 'depois' });
    expect(registrados[0]).toMatchObject({ entidade: 'os', registroId: OS, momento: 'depois' });
  });

  it('sem momento, a foto fica sem (nulo)', async () => {
    const { casos, registrados } = montar({});
    await casos.registrar(ctx, { caminho: FOTO_DA_OS, momento: null });
    expect(registrados[0]?.momento).toBeNull();
  });

  it('momento fora da OS: 422 momento_so_na_os, sem gravar', async () => {
    const { casos, registrados } = montar({});
    await expect(
      casos.registrar(ctx, { caminho: CAMINHO, momento: 'antes' }),
    ).rejects.toMatchObject({ codigo: 'momento_so_na_os' });
    expect(registrados).toEqual([]);
  });

  it('a lista devolve o momento e a assinatura; a assinatura ninguém remove', async () => {
    const { casos } = montar({
      anexos: [
        gravado({ entidade: 'os', registroId: OS, momento: 'antes' }),
        gravado({ id: 'x2', entidade: 'os', registroId: OS, assinatura: true }),
      ],
    });
    const lista = await casos.listar(ctx, 'os', OS);
    expect(lista.map((a) => [a.id, a.momento, a.assinatura, a.podeRemover])).toEqual([
      ['x1', 'antes', false, true],
      ['x2', null, true, false],
    ]);
  });

  it('remover a assinatura: 403 assinatura_nao_se_remove', async () => {
    const { casos, removidos } = montar({
      anexos: [gravado({ entidade: 'os', registroId: OS, assinatura: true })],
    });
    await expect(casos.remover(ctx, 'x1')).rejects.toMatchObject({
      codigo: 'assinatura_nao_se_remove',
    });
    expect(removidos).toEqual([]);
  });
});

describe('URL da assinatura do aceite (I8)', () => {
  it('quem aceita recebe a URL de um PNG novo na pasta da OS', async () => {
    const regras: string[] = [];
    const { casos, emitidas } = montar({
      regraParaAssinar: async (_c, id) => void regras.push(id),
    });
    const r = await casos.pedirUrlDaAssinatura(ctx, OS);
    expect(r.caminho).toBe(`${TENANT}/${HOTEL}/os/${OS}/${ID}.png`);
    expect(regras).toEqual([OS]);
    expect(emitidas).toEqual([`upload:${r.caminho}`]);
  });

  it('quem não pode aceitar não recebe URL', async () => {
    const { casos, emitidas } = montar({
      regraParaAssinar: async () => {
        throw new PermissaoNegada('aceitar_os_fora_do_papel', 'x');
      },
    });
    await expect(casos.pedirUrlDaAssinatura(ctx, OS)).rejects.toBeInstanceOf(PermissaoNegada);
    expect(emitidas).toEqual([]);
  });

  it.each([
    ['OS que o usuário não enxerga', { hotel: null }, NaoEncontrado],
    ['sem escrita no hotel', { escreve: false }, PermissaoNegada],
  ] as const)('%s: sem URL', async (_n, opcoes, erro) => {
    const { casos, emitidas } = montar({ ...opcoes, regraParaAssinar: async () => {} });
    await expect(casos.pedirUrlDaAssinatura(ctx, OS)).rejects.toBeInstanceOf(erro);
    expect(emitidas).toEqual([]);
  });
});
