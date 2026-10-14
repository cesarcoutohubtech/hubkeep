// Fila do dia e execução da OS no PWA (C4b; ADR-025, ADR-029):
//   - a projeção: a OS guardada com as operações da fila por cima, e a versão
//     que o aparelho manda em cada transição;
//   - a fila do dia no IndexedDB, por usuário e tenant, apagada ao sair;
//   - a foto da OS na fila: sobe na ordem (antes da conclusão que veio
//     depois), e o reenvio não duplica, com o Storage recusando o arquivo
//     repetido na URL ou no PUT e a API recusando o registro repetido;
//   - a foto antes ou depois (I8): o momento vai no registro, as fotos "depois"
//     da fila contam na projeção, e a foto vale com a OS atribuída;
//   - o checklist (PV1): as respostas da fila mesclam por cima das da API, e a
//     política do hotel pede os obrigatórios para concluir.
// O servidor falso faz o papel da API e do Storage; o envio é o de verdade.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Credenciais, criarEnvio, lerOsDoDia } from '../src/api';
import { criarEnvioDeFoto, fotoParaFila } from '../src/anexos/fotos';
import { type FilaDeOperacoes, type OperacaoNaFila, abrirFila } from '../src/fila/banco';
import { sincronizar } from '../src/fila/sincronizar';
import { type OsGuardada, abrirOsDoDia } from '../src/os/banco';
import {
  aceitaFoto,
  aceitaRegistro,
  acoesPossiveis,
  type OsNoAparelho,
  checklistFaltando,
  faltaChecklist,
  faltaFotoDepois,
  localDaOs,
  paradaPossivel,
  perguntaDaUhNaConclusao,
  perguntaNaConclusao,
  projetarOs,
} from '../src/os/projecao';
import { apagarDadosLocais } from '../src/saida';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const OS1 = '0a100000-0000-4000-8000-000000000001';
const OS2 = '0a100000-0000-4000-8000-000000000002';
const credenciais: Credenciais = {
  usuarioId: () => A,
  token: async () => 'token-a',
  tenant: () => 't1',
};

/** A corretiva, com chamado: os casos da parada e da UH mexem nele. */
type OsCorretiva = OsGuardada & { chamado: NonNullable<OsGuardada['chamado']> };

const osGuardada = (id: string, estado: OsGuardada['estado'], versao: number): OsCorretiva => ({
  id,
  hotelId: 'b1000000-0000-4000-8000-000000000001',
  estado,
  situacaoId: '5a000000-0000-4000-8000-000000000001',
  responsavel: { tipo: 'tecnico', usuarioId: A },
  motivoReabertura: null,
  versao,
  criadoEm: '2026-09-29T08:00:00.000Z',
  chamado: {
    id: 'c1000000-0000-4000-8000-000000000001',
    descricao: 'Frigobar não gela',
    localId: 'd1000000-0000-4000-8000-000000000001',
    localNome: 'UH 101',
    prioridadeId: '9a000000-0000-4000-8000-000000000001',
    estado: 'em_execucao',
    ativoId: 'a1000000-0000-4000-8000-000000000001',
    paradoDesde: null,
    paradaDoChamado: false,
    uhIndisponivelDesde: null,
  },
});

let seq = 0;
const naFila = (
  tipo: OperacaoNaFila['tipo'],
  dados: OperacaoNaFila['dados'],
  estado: OperacaoNaFila['estado'] = 'pendente',
): OperacaoNaFila => ({
  chave: `k${++seq}`,
  usuarioId: A,
  tipo,
  dados,
  criadaEm: seq,
  estado,
  tentativas: 0,
  proximaTentativaEm: 0,
  ultimoErro: null,
});

describe('parada do ativo na projeção (C5)', () => {
  it('registrada aberta, o ativo aparece parado; encerrada, deixa de aparecer', () => {
    const guardada = osGuardada(OS1, 'em_execucao', 2);
    const [parada] = projetarOs(
      [guardada],
      [naFila('os.registrar_parada', { osId: OS1, inicio: '2026-09-29T09:00:00.000Z', fim: null })],
    );
    expect(parada?.chamado?.paradoDesde).toBe('2026-09-29T09:00:00.000Z');
    expect(parada).toMatchObject({ versao: 2, pendentes: 1 });
    expect(parada && paradaPossivel(parada)).toBe('encerrar');
    const [voltou] = projetarOs(
      [guardada],
      [
        naFila('os.registrar_parada', { osId: OS1, inicio: '2026-09-29T09:00:00.000Z', fim: null }),
        naFila('os.encerrar_parada', { osId: OS1, fim: '2026-09-29T10:00:00.000Z' }),
      ],
    );
    expect(voltou?.chamado?.paradoDesde).toBeNull();
    expect(voltou && paradaPossivel(voltou)).toBe('registrar');
  });

  it('parada de outro chamado do mesmo ativo: aparece, sem botão e sem pergunta', () => {
    const guardada = osGuardada(OS1, 'em_execucao', 2);
    const [os] = projetarOs(
      [{ ...guardada, chamado: { ...guardada.chamado, paradoDesde: '2026-09-29T07:00:00.000Z' } }],
      [],
    );
    expect(os?.chamado?.paradoDesde).toBe('2026-09-29T07:00:00.000Z');
    expect(os && paradaPossivel(os)).toBeNull();
    expect(os && perguntaNaConclusao(os)).toBe(false);
  });

  it('concluir com a parada do chamado: sim encerra junto, não mantém', () => {
    const guardada = osGuardada(OS1, 'em_execucao', 2);
    const parada = {
      ...guardada,
      chamado: {
        ...guardada.chamado,
        paradoDesde: '2026-09-29T07:00:00.000Z',
        paradaDoChamado: true,
      },
    };
    const [antes] = projetarOs([parada], []);
    expect(antes && perguntaNaConclusao(antes)).toBe(true);
    const concluir = (equipamentoVoltou: boolean) =>
      naFila('os.concluir', {
        osId: OS1,
        versao: 2,
        equipamentoVoltou,
        concluidaEm: '2026-09-29T10:00:00.000Z',
      });
    const [voltou] = projetarOs([parada], [concluir(true)]);
    expect(voltou).toMatchObject({ estado: 'concluida', versao: 3 });
    expect(voltou?.chamado?.paradoDesde).toBeNull();
    const [naoVoltou] = projetarOs([parada], [concluir(false)]);
    expect(naoVoltou?.estado).toBe('concluida');
    expect(naoVoltou?.chamado?.paradoDesde).toBe('2026-09-29T07:00:00.000Z');
  });

  it('concluir com a UH indisponível (I4): liberada encerra junto, não liberada mantém', () => {
    const guardada = osGuardada(OS1, 'em_execucao', 2);
    const indisponivel = {
      ...guardada,
      chamado: { ...guardada.chamado, uhIndisponivelDesde: '2026-09-29T07:00:00.000Z' },
    };
    const [antes] = projetarOs([indisponivel], []);
    expect(antes && perguntaDaUhNaConclusao(antes)).toBe(true);
    const concluir = (uhLiberada: boolean) =>
      naFila('os.concluir', {
        osId: OS1,
        versao: 2,
        uhLiberada,
        concluidaEm: '2026-09-29T10:00:00.000Z',
      });
    const [liberada] = projetarOs([indisponivel], [concluir(true)]);
    expect(liberada).toMatchObject({ estado: 'concluida', versao: 3 });
    expect(liberada?.chamado?.uhIndisponivelDesde).toBeNull();
    const [naoLiberada] = projetarOs([indisponivel], [concluir(false)]);
    expect(naoLiberada?.chamado?.uhIndisponivelDesde).toBe('2026-09-29T07:00:00.000Z');
    // A OS guardada antes da I4 não tem o campo e não pergunta.
    const semCampo: Partial<OsGuardada['chamado']> = { ...guardada.chamado };
    delete semCampo.uhIndisponivelDesde;
    const [antiga] = projetarOs([{ ...guardada, chamado: semCampo } as OsGuardada], []);
    expect(antiga && perguntaDaUhNaConclusao(antiga)).toBe(false);
  });

  it('registrada já com o fim não deixa o ativo parado', () => {
    const [os] = projetarOs(
      [osGuardada(OS1, 'em_execucao', 2)],
      [
        naFila('os.registrar_parada', {
          osId: OS1,
          inicio: '2026-09-29T08:00:00.000Z',
          fim: '2026-09-29T08:30:00.000Z',
        }),
      ],
    );
    expect(os?.chamado?.paradoDesde).toBeNull();
  });

  it('sem ativo no chamado, ou fora de execução e pausa, nada a oferecer', () => {
    const semAtivo = osGuardada(OS1, 'em_execucao', 2);
    semAtivo.chamado = { ...semAtivo.chamado, ativoId: null };
    const [a] = projetarOs([semAtivo], []);
    const [b] = projetarOs([osGuardada(OS1, 'atribuida', 1)], []);
    expect(a && paradaPossivel(a)).toBeNull();
    expect(b && paradaPossivel(b)).toBeNull();
  });
});

describe('projeção da OS no aparelho', () => {
  it('as transições na fila andam com a OS e a versão, uma por vez', () => {
    const [os] = projetarOs(
      [osGuardada(OS1, 'atribuida', 1)],
      [
        naFila('os.iniciar', { osId: OS1, versao: 1 }),
        naFila('os.apontar_horas', { osId: OS1, inicio: 'x', fim: 'y' }),
        naFila('os.pausar', { osId: OS1, versao: 2 }),
      ],
    );
    expect(os).toMatchObject({ estado: 'pausada', versao: 3, pendentes: 3 });
    // A próxima ação sai com a versão 3.
    expect(acoesPossiveis('pausada')).toEqual(['retomar']);
  });

  it('já aplicada no servidor (a resposta se perdeu) e a API já adiante: não conta duas vezes', () => {
    const [os] = projetarOs(
      [osGuardada(OS1, 'em_execucao', 2)],
      [naFila('os.iniciar', { osId: OS1, versao: 1 })],
    );
    expect(os).toMatchObject({ estado: 'em_execucao', versao: 2, pendentes: 1 });
  });

  it('a recusada não acontece, e a operação de outra OS não mexe nesta', () => {
    const lista = projetarOs(
      [osGuardada(OS1, 'em_execucao', 2), osGuardada(OS2, 'atribuida', 1)],
      [
        naFila('os.concluir', { osId: OS1, versao: 2 }, 'rejeitada'),
        naFila('os.iniciar', { osId: OS2, versao: 1 }),
        naFila('preferencias.gravar', { idioma: 'es', formatoRegional: null, fuso: null }),
      ],
    );
    expect(lista).toMatchObject([
      { id: OS1, estado: 'em_execucao', versao: 2, pendentes: 0 },
      { id: OS2, estado: 'em_execucao', versao: 2, pendentes: 1 },
    ]);
  });

  it('ações e registros pelo estado, com as regras do domínio', () => {
    expect(acoesPossiveis('atribuida')).toEqual(['iniciar']);
    expect(acoesPossiveis('em_execucao')).toEqual(['pausar', 'concluir']);
    expect(acoesPossiveis('concluida')).toEqual([]);
    expect(
      ['atribuida', 'em_execucao', 'pausada', 'concluida'].map((e) =>
        aceitaRegistro(e as 'pausada'),
      ),
    ).toEqual([false, true, true, false]);
  });
});

describe('fila do dia no aparelho', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('por usuário e tenant; sair apaga a de quem sai, e só a dele', async () => {
    const guardadas = await abrirOsDoDia();
    const fila = await abrirFila();
    await guardadas.gravar({
      usuarioId: A,
      tenantId: 't1',
      os: [osGuardada(OS1, 'atribuida', 1)],
      lidaEm: 1,
    });
    await guardadas.gravar({ usuarioId: B, tenantId: 't1', os: [], lidaEm: 1 });
    expect((await guardadas.ler(A, 't1'))?.os).toHaveLength(1);
    expect(await guardadas.ler(A, 't2')).toBeNull();

    await apagarDadosLocais(fila, A, { removeItem: () => undefined }, null, guardadas);
    guardadas.fechar();
    const reaberta = await abrirOsDoDia();
    expect(await reaberta.ler(A, 't1')).toBeNull();
    expect(await reaberta.ler(B, 't1')).not.toBeNull();
  });

  it('lê da API pelo contrato; sem rede ou fora do contrato, null', async () => {
    const resposta = (corpo: unknown, status = 200) =>
      (async () => new Response(JSON.stringify(corpo), { status })) as typeof fetch;
    const lida = await lerOsDoDia(credenciais, resposta({ os: [osGuardada(OS1, 'atribuida', 1)] }));
    expect(lida).toMatchObject({ usuarioId: A, tenantId: 't1', os: [{ id: OS1 }] });
    expect(await lerOsDoDia(credenciais, resposta({ os: [{ id: 'x' }] }))).toBeNull();
    expect(await lerOsDoDia(credenciais, resposta({}, 500))).toBeNull();
    const semRede = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect(await lerOsDoDia(credenciais, semRede)).toBeNull();
  });

  it('pede a OS preventiva (preventiva=1) e guarda a OS sem chamado (PV3c)', async () => {
    const urls: string[] = [];
    const preventiva = {
      ...osGuardada(OS2, 'atribuida', 1),
      chamado: null,
      preventiva: {
        planoId: B,
        planoNome: 'PMOC mensal',
        dataPrevista: '2026-10-13',
        ativoId: B,
        ativoNome: 'Split',
        localId: B,
        localNome: 'UH 101',
        localEdificacao: null,
      },
    };
    const requisitar = (async (entrada: RequestInfo | URL) => {
      urls.push(String(entrada));
      return new Response(JSON.stringify({ os: [osGuardada(OS1, 'atribuida', 1), preventiva] }));
    }) as typeof fetch;
    const lida = await lerOsDoDia(credenciais, requisitar);
    expect(lida?.os.map((o) => o.id)).toEqual([OS1, OS2]);
    expect(lida?.os[1]).toMatchObject({ chamado: null, preventiva: { planoNome: 'PMOC mensal' } });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/api/v1/os/do-dia?preventiva=1');
  });
});

describe('a OS preventiva no aparelho (PV3c)', () => {
  const preventiva: OsGuardada = {
    ...osGuardada(OS2, 'em_execucao', 3),
    chamado: null,
    preventiva: {
      planoId: B,
      planoNome: 'PMOC mensal',
      dataPrevista: '2026-10-13',
      ativoId: B,
      ativoNome: 'Split',
      localId: B,
      localNome: 'Casa de máquinas',
      localEdificacao: null,
    },
  };

  it('sem parada nem UH: a projeção ignora a parada da fila, e nada pergunta na conclusão', () => {
    const [os] = projetarOs(
      [preventiva],
      [
        naFila('os.registrar_parada', { osId: OS2, inicio: '2026-10-13T09:00:00.000Z', fim: null }),
        naFila('os.concluir', { osId: OS2, versao: 3, equipamentoVoltou: true, uhLiberada: true }),
      ],
    );
    expect(os).toMatchObject({ chamado: null, estado: 'concluida', versao: 4 });
    const naExecucao = projetarOs([preventiva], [])[0];
    expect(naExecucao && paradaPossivel(naExecucao)).toBeNull();
    expect(naExecucao && perguntaNaConclusao(naExecucao)).toBe(false);
    expect(naExecucao && perguntaDaUhNaConclusao(naExecucao)).toBe(false);
  });

  it('o local: o do chamado na corretiva, o da OS na preventiva; a guardada antes da PV3c, sem o campo, é corretiva', () => {
    expect(localDaOs(preventiva)).toEqual({ nome: 'Casa de máquinas', edificacao: null });
    const antiga = osGuardada(OS1, 'atribuida', 1);
    expect('preventiva' in antiga).toBe(false);
    expect(localDaOs(antiga)).toEqual({ nome: 'UH 101', edificacao: null });
  });
});

/** API e Storage falsos para a foto da OS e as operações. */
function servidor(opcoes: { storageRecusaNaUrl?: boolean } = {}) {
  const log: string[] = [];
  const noStorage = new Set<string>();
  const registrados = new Set<string>();
  let concluida = false;
  let rede = true;
  let perderRespostaDoRegistro = false;
  const json = (status: number, dados: unknown) =>
    new Response(JSON.stringify(dados), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const requisitar: typeof fetch = async (entrada, init) => {
    if (!rede) throw new TypeError('Failed to fetch');
    const url = String(entrada);
    const corpo =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, string>) : {};
    if (url.endsWith('/api/v1/anexos/url-de-upload')) {
      if (concluida) {
        return json(409, {
          erro: { codigo: 'transicao_invalida', parametros: {}, requestId: 'r' },
        });
      }
      const caminho = `t1/h1/os/${corpo.registroId}/${corpo.arquivoId}.jpg`;
      if (opcoes.storageRecusaNaUrl && noStorage.has(caminho)) {
        log.push('url:ja_enviado');
        return json(409, {
          erro: { codigo: 'arquivo_ja_enviado', parametros: { caminho }, requestId: 'r' },
        });
      }
      log.push('url');
      return json(200, {
        caminho,
        url: `https://storage/upload/${caminho}`,
        token: 'x',
        expiraEm: '2026-09-29T12:00:00.000Z',
      });
    }
    if (url.startsWith('https://storage/upload/')) {
      const caminho = url.slice('https://storage/upload/'.length);
      if (noStorage.has(caminho)) {
        log.push('put:duplicado');
        return json(400, {
          statusCode: '409',
          error: 'Duplicate',
          message: 'The resource already exists',
        });
      }
      noStorage.add(caminho);
      log.push('put');
      return json(200, { Key: caminho });
    }
    if (url.endsWith('/api/v1/anexos')) {
      if (registrados.has(corpo.caminho ?? '')) {
        log.push('registro:repetido');
        return json(409, {
          erro: { codigo: 'anexo_ja_registrado', parametros: {}, requestId: 'r' },
        });
      }
      registrados.add(corpo.caminho ?? '');
      log.push('registro');
      if (perderRespostaDoRegistro) {
        perderRespostaDoRegistro = false;
        throw new TypeError('Failed to fetch');
      }
      return json(201, { id: 'anexo-1' });
    }
    if (url.endsWith('/api/v1/sincronizacao/operacoes')) {
      if (corpo.tipo === 'os.concluir') concluida = true;
      log.push(String(corpo.tipo));
      return json(201, {
        chave: corpo.chave,
        repetida: false,
        resposta: { id: OS1, versao: 3, estado: 'concluida' },
      });
    }
    return json(404, { erro: { codigo: 'nao_encontrado', parametros: {}, requestId: 'r' } });
  };
  return {
    log,
    noStorage,
    registrados,
    requisitar,
    concluir: () => void (concluida = true),
    semRede: () => void (rede = false),
    comRede: () => void (rede = true),
    perderRespostaDoRegistro: () => void (perderRespostaDoRegistro = true),
  };
}

const preparar = async () => ({
  foto: new Blob(['foto'], { type: 'image/jpeg' }),
  miniatura: new Blob(['mini'], { type: 'image/jpeg' }),
});
let ids = 0;
const novoId = () => `f0000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

describe('foto da OS na fila', () => {
  let fila: FilaDeOperacoes;
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    fila = await abrirFila();
  });

  const envioDe = (s: ReturnType<typeof servidor>) =>
    criarEnvio(credenciais, s.requisitar, criarEnvioDeFoto(credenciais, s.requisitar));
  const tirarFoto = async () =>
    fila.enfileirar(
      {
        usuarioId: A,
        tipo: 'anexo.foto',
        dados: await fotoParaFila(OS1, new Blob(['x']), 'vazamento.jpg', 'depois', {
          preparar,
          novoId,
        }),
      },
      1,
    );

  it('sem rede fica guardada, com os bytes; com rede sobe antes da conclusão tirada depois', async () => {
    const s = servidor();
    s.semRede();
    await tirarFoto();
    await fila.enfileirar(
      { usuarioId: A, tipo: 'os.concluir', dados: { osId: OS1, versao: 2 } },
      2,
    );
    await sincronizar(fila, envioDe(s), { usuarioId: A });
    fila.fechar();
    fila = await abrirFila();
    const [foto] = await fila.doUsuario(A);
    expect(foto?.tipo).toBe('anexo.foto');
    expect(new TextDecoder().decode((foto?.dados as { foto: ArrayBuffer }).foto)).toBe('foto');

    s.comRede();
    await sincronizar(fila, envioDe(s), { usuarioId: A, ignorarEspera: true });
    expect(await fila.doUsuario(A)).toEqual([]);
    expect(s.log).toEqual(['url', 'put', 'url', 'put', 'registro', 'os.concluir']);
  });

  it('reenvio depois da resposta perdida: PUT duplicado e registro repetido contam como feitos', async () => {
    const s = servidor();
    s.perderRespostaDoRegistro();
    await tirarFoto();
    await sincronizar(fila, envioDe(s), { usuarioId: A });
    expect(await fila.doUsuario(A)).toMatchObject([{ estado: 'pendente', tentativas: 1 }]);
    await sincronizar(fila, envioDe(s), { usuarioId: A, ignorarEspera: true });
    expect(await fila.doUsuario(A)).toEqual([]);
    expect(s.registrados.size).toBe(1);
    expect(s.noStorage.size).toBe(2);
    expect(s.log.slice(5)).toEqual([
      'url',
      'put:duplicado',
      'url',
      'put:duplicado',
      'registro:repetido',
    ]);
  });

  it('com o Storage recusando já na URL, o envio segue sem o PUT', async () => {
    const s = servidor({ storageRecusaNaUrl: true });
    s.perderRespostaDoRegistro();
    await tirarFoto();
    await sincronizar(fila, envioDe(s), { usuarioId: A });
    await sincronizar(fila, envioDe(s), { usuarioId: A, ignorarEspera: true });
    expect(await fila.doUsuario(A)).toEqual([]);
    expect(s.log.slice(5)).toEqual(['url:ja_enviado', 'url:ja_enviado', 'registro:repetido']);
  });

  it('a regra da OS recusa (OS já concluída): fica como recusada, com o código', async () => {
    const s = servidor();
    s.concluir();
    await tirarFoto();
    await sincronizar(fila, envioDe(s), { usuarioId: A });
    expect(await fila.doUsuario(A)).toMatchObject([
      { tipo: 'anexo.foto', estado: 'rejeitada', ultimoErro: 'transicao_invalida' },
    ]);
  });

  it('a foto de outro usuário não sai com esta sessão', async () => {
    const s = servidor();
    const dados = await fotoParaFila(OS1, new Blob(['x']), null, null, { preparar, novoId });
    const op = await fila.enfileirar({ usuarioId: B, tipo: 'anexo.foto', dados }, 1);
    expect(await criarEnvioDeFoto(credenciais, s.requisitar)(op)).toEqual({
      tipo: 'tentar_depois',
      motivo: 'outra_sessao',
    });
    expect(s.log).toEqual([]);
  });
});

describe('foto antes ou depois (I8)', () => {
  const foto = (momento: 'antes' | 'depois' | null | undefined, osId = OS1) =>
    ({
      entidade: 'os',
      registroId: osId,
      arquivoId: 'f',
      miniaturaArquivoId: 'm',
      foto: new ArrayBuffer(1),
      miniatura: new ArrayBuffer(1),
      nome: null,
      ...(momento === undefined ? {} : { momento }),
    }) as const;

  it('a foto vale com a OS atribuída; horas e material, não', () => {
    expect(
      ['atribuida', 'em_execucao', 'pausada', 'concluida'].map((e) => aceitaFoto(e as 'pausada')),
    ).toEqual([true, true, true, false]);
    expect(aceitaRegistro('atribuida')).toBe(false);
  });

  it('as fotos "depois" da fila somam às da API; a "antes", a sem momento e a recusada, não', () => {
    const [os] = projetarOs(
      [{ ...osGuardada(OS1, 'em_execucao', 2), fotosDepois: 1, fotoDepoisObrigatoria: true }],
      [
        naFila('anexo.foto', foto('depois')),
        naFila('anexo.foto', foto('antes')),
        naFila('anexo.foto', foto(undefined)),
        naFila('anexo.foto', foto('depois'), 'rejeitada'),
        naFila('anexo.foto', foto('depois', OS2)),
      ],
    );
    expect(os).toMatchObject({ fotosDepois: 2, fotoDepoisObrigatoria: true, pendentes: 3 });
  });

  it('com a política ligada, falta foto "depois" até a primeira; desligada, nunca', () => {
    const guardada = { ...osGuardada(OS1, 'em_execucao', 2), fotoDepoisObrigatoria: true };
    const [sem] = projetarOs([guardada], [naFila('anexo.foto', foto('antes'))]);
    expect(sem && faltaFotoDepois(sem)).toBe(true);
    const [com] = projetarOs([guardada], [naFila('anexo.foto', foto('depois'))]);
    expect(com && faltaFotoDepois(com)).toBe(false);
    // A guardada antes da I8, sem os campos: nenhuma foto e a política desligada.
    const [antiga] = projetarOs([osGuardada(OS1, 'em_execucao', 2)], []);
    expect(antiga).toMatchObject({ fotosDepois: 0, fotoDepoisObrigatoria: false });
    expect(antiga && faltaFotoDepois(antiga)).toBe(false);
  });

  it('o momento vai no registro; a foto da fila antes da I8 vai sem momento', async () => {
    const corpos: unknown[] = [];
    const requisitar: typeof fetch = async (entrada, init) => {
      const url = String(entrada);
      const corpo = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
      if (url.endsWith('/api/v1/anexos/url-de-upload')) {
        const caminho = `t1/h1/os/${OS1}/${corpo.arquivoId}.jpg`;
        return new Response(
          JSON.stringify({
            caminho,
            url: `https://storage/${caminho}`,
            token: 't',
            expiraEm: '2026-10-12T12:00:00.000Z',
          }),
          { status: 200 },
        );
      }
      if (url.startsWith('https://storage/')) return new Response('{}', { status: 200 });
      corpos.push(corpo);
      return new Response(JSON.stringify({ id: 'anexo-1' }), { status: 201 });
    };
    const envio = criarEnvioDeFoto(credenciais, requisitar);
    expect(await envio(naFila('anexo.foto', foto('antes')))).toEqual({ tipo: 'aceita' });
    expect(await envio(naFila('anexo.foto', foto(undefined)))).toEqual({ tipo: 'aceita' });
    expect(corpos).toMatchObject([{ momento: 'antes' }, { momento: null }]);
  });

  it('a foto preparada para a fila leva o momento escolhido', async () => {
    const dados = await fotoParaFila(OS1, new Blob(['x']), null, 'antes', { preparar, novoId });
    expect(dados.momento).toBe('antes');
  });
});

describe('checklist na OS (PV1)', () => {
  const comChecklist = (obrigatorio: boolean): OsGuardada => ({
    ...osGuardada(OS1, 'em_execucao', 2),
    checklistCompletoObrigatorio: obrigatorio,
    checklist: {
      id: 'ac100000-0000-4000-8000-000000000001',
      modeloId: 'cc100000-0000-4000-8000-000000000001',
      modeloVersao: 2,
      nomes: { 'pt-BR': 'Inspeção do ar' },
      itens: [
        {
          chave: 'filtro_limpo',
          tipo: 'sim_nao',
          obrigatorio: true,
          rotulos: { 'pt-BR': 'Filtro limpo' },
          unidade: null,
          opcoes: [],
        },
        {
          chave: 'pressao',
          tipo: 'numero',
          obrigatorio: true,
          rotulos: { 'pt-BR': 'Pressão' },
          unidade: 'psi',
          opcoes: [],
        },
      ],
      respostas: { pressao: { valor: 30, feitaEm: '2026-10-12T08:00:00Z', usuarioId: A } },
    },
  });

  it('as respostas da fila mesclam por cima das da API; null tira; a recusada não conta', () => {
    const [os] = projetarOs(
      [comChecklist(false)],
      [
        naFila('os.responder_checklist', { osId: OS1, respostas: { filtro_limpo: true } }),
        naFila('os.responder_checklist', { osId: OS1, respostas: { pressao: null } }),
        naFila('os.responder_checklist', { osId: OS1, respostas: { pressao: 99 } }, 'rejeitada'),
      ],
    );
    expect(os?.checklist?.respostas).toEqual({
      filtro_limpo: { valor: true, feitaEm: '', usuarioId: A },
    });
    expect(os?.pendentes).toBe(2);
    expect(checklistFaltando(os as OsNoAparelho)).toEqual(['pressao']);
  });

  it('com a política ligada, falta checklist até os obrigatórios; desligada ou sem checklist, nunca', () => {
    const fila = [
      naFila('os.responder_checklist', { osId: OS1, respostas: { filtro_limpo: false } }),
    ];
    const [ligada] = projetarOs([comChecklist(true)], []);
    const [completa] = projetarOs([comChecklist(true)], fila);
    const [desligada] = projetarOs([comChecklist(false)], []);
    const [semChecklist] = projetarOs([osGuardada(OS2, 'em_execucao', 2)], []);
    expect(faltaChecklist(ligada as OsNoAparelho)).toBe(true);
    expect(faltaChecklist(completa as OsNoAparelho)).toBe(false);
    expect(faltaChecklist(desligada as OsNoAparelho)).toBe(false);
    expect(semChecklist).toMatchObject({ checklist: null, checklistCompletoObrigatorio: false });
    expect(faltaChecklist(semChecklist as OsNoAparelho)).toBe(false);
  });
});
