// Detalhe do chamado no servidor (P1c), sem banco: a montagem da tela pelos
// casos de uso (falsos aqui) e o carregamento da página com contexto, escopo
// de leitura, log e classificação de erro. A página em si está em
// pagina-do-chamado.test.tsx.
import { ErroHttp } from '../src/servidor/erro-http';
import { NaoEncontrado, PermissaoNegada } from '@hubkeep/dominio';
import { describe, expect, it, vi } from 'vitest';
import { type FontesDoChamado, telaDoChamado } from '../src/servidor/leituras-do-chamado';
import type { CamposDeLog, Nivel } from '../src/servidor/log';
import {
  type CargaDaPagina,
  type DependenciasDaPagina,
  carregarNaPagina,
} from '../src/servidor/pagina';

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

const TENANT = '10000000-0000-4000-8000-000000000001';
const USUARIO = 'aaaaaaaa-0000-4000-8000-000000000001';
const C = '55555555-5555-4555-8555-555555555555';
const H = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const P = '44444444-4444-4444-8444-444444444444';
const OS = '66666666-6666-4666-8666-666666666666';
const L = '77777777-7777-4777-8777-777777777777';
const E = '88888888-8888-4888-8888-888888888888';
const CTX = { usuarioId: USUARIO, tenantId: TENANT };
const EM = new Date('2026-10-08T12:00:00.000Z');

function fontes(sobrescrever: Partial<Record<string, unknown>> = {}) {
  const chamadas: string[] = [];
  const marcar =
    <T>(nome: string, valor: T) =>
    async (ctx: unknown, ...resto: unknown[]) => {
      chamadas.push(`${nome}:${JSON.stringify([ctx, ...resto])}`);
      const s = sobrescrever[nome];
      if (s instanceof Error) throw s;
      return (s ?? valor) as T;
    };
  const f: FontesDoChamado = {
    chamados: async () => ({
      chamado: marcar('chamado', {
        id: C,
        hotelId: H,
        localId: L,
        ativoId: null,
        descricao: 'Ar não liga',
        estado: 'aberto',
        situacaoId: S,
        prioridadeId: P,
        politicaAplicada: null,
        abertoPor: USUARIO,
        motivoCancelamento: null,
        origem: 'interno',
        impactoHospede: null,
        versao: 2,
        criadoEm: EM,
      }) as never,
    }),
    triagem: async () => ({
      osDoChamado: marcar('osDoChamado', [
        {
          id: OS,
          hotelId: H,
          chamadoId: C,
          estado: 'atribuida',
          situacaoId: S,
          responsavel: { tipo: 'tecnico', usuarioId: USUARIO },
          motivoCancelamento: null,
          motivoReabertura: null,
          executadoPor: 'equipe_interna',
          fornecedorId: null,
          custoInformado: null,
          codigos: { falhaId: null, causaId: null, solucaoId: null },
          criadoPor: USUARIO,
          versao: 1,
          criadoEm: EM,
        },
      ]) as never,
    }),
    consultas: async () => ({
      nomesDoChamado: marcar('nomesDoChamado', {
        hotel: 'Hotel Um',
        local: 'UH 101',
        localTipo: 'uh',
        ativo: null,
        pessoas: { [USUARIO]: 'Ana' },
        equipes: {},
        fornecedores: {},
      }) as never,
      linhaDoTempo: marcar('linhaDoTempo', [
        {
          id: E,
          em: EM,
          entidade: 'chamado',
          registroId: C,
          acao: 'abrir',
          usuarioId: USUARIO,
          usuarioNome: 'Ana',
          motivo: null,
        },
      ]) as never,
    }),
    papeis: async () => ({
      listarHoteisVisiveis: marcar('hoteis', [
        { id: H, nome: 'Hotel Um', status: 'ativo', bandeiraId: null },
      ]) as never,
    }),
    situacoes: async () => ({
      listarSituacoesEPrioridades: marcar('situacoes', {
        idiomaPadrao: 'pt-BR',
        situacoes: [],
        prioridades: [],
      }) as never,
    }),
    equipes: async () => ({
      listarEquipes: marcar('equipes', { equipes: [], disponiveis: [] }) as never,
    }),
  };
  return { f, chamadas };
}

describe('telaDoChamado: montagem pelos casos de uso da API', () => {
  it('entrega o detalhe, a linha do tempo, as referências e os candidatos no formato da API', async () => {
    const { f, chamadas } = fontes();
    const falhas: unknown[] = [];
    const tela = await telaDoChamado(CTX, C, (e) => falhas.push(e), f);
    expect(tela.detalhe.chamado).toMatchObject({
      id: C,
      politicaAplicada: {},
      criadoEm: EM.toISOString(),
    });
    expect(tela.detalhe.os[0]?.criadoEm).toBe(EM.toISOString());
    expect(tela.detalhe.nomes.hotel).toBe('Hotel Um');
    expect(tela.eventos[0]?.em).toBe(EM.toISOString());
    expect(tela.hoteis).toEqual([{ id: H, nome: 'Hotel Um', status: 'ativo', bandeiraId: null }]);
    expect(tela.corretiva?.idiomaPadrao).toBe('pt-BR');
    expect(tela.candidatos).toEqual({ equipes: [], disponiveis: [] });
    expect(falhas).toEqual([]);
    // O chamado é lido primeiro, com o contexto de quem pede; as equipes, do hotel dele.
    expect(chamadas[0]).toBe(`chamado:${JSON.stringify([CTX, C])}`);
    expect(chamadas).toContain(`equipes:${JSON.stringify([CTX, H])}`);
  });

  it('quem não vê o chamado: o NaoEncontrado sobe e nada mais é lido', async () => {
    const { f, chamadas } = fontes({
      chamado: new NaoEncontrado('chamado_nao_encontrado', 'Chamado não encontrado.'),
    });
    await expect(telaDoChamado(CTX, C, () => undefined, f)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(chamadas).toHaveLength(1);
  });

  it('complemento que falha vira vazio, como na tela que chamava a API, e vai para quem registra', async () => {
    const recusa = new PermissaoNegada('sem_permissao', 'Sem permissão.');
    const { f } = fontes({ equipes: recusa, linhaDoTempo: new Error('caiu') });
    const falhas: unknown[] = [];
    const tela = await telaDoChamado(CTX, C, (e) => falhas.push(e), f);
    expect(tela.candidatos).toBeNull();
    expect(tela.eventos).toEqual([]);
    expect(tela.detalhe.chamado.id).toBe(C);
    expect(falhas).toHaveLength(2);
    expect(falhas).toContain(recusa);
  });
});

function montar(resolver: DependenciasDaPagina['resolverContexto']) {
  const logs: { nivel: Nivel; evento: string; campos: CamposDeLog }[] = [];
  const relatados: unknown[] = [];
  const escopos: string[] = [];
  const deps: Partial<DependenciasDaPagina> = {
    requisicao: async () => new Request('http://pagina.interna/'),
    resolverContexto: resolver,
    registrar: (nivel, evento, campos) => void logs.push({ nivel, evento, campos }),
    relatar: (erro) => void relatados.push(erro),
    escopoDeLeitura: async (fn) => {
      escopos.push('aberto');
      try {
        return await fn();
      } finally {
        escopos.push('fechado');
      }
    },
  };
  return { deps, logs, relatados, escopos };
}

const comContexto = async () => CTX;

describe('carregarNaPagina: contexto, escopo de leitura e erros como a API', () => {
  it('lê num escopo de leitura, com o contexto resolvido, e registra uma linha de log', async () => {
    const { deps, logs, escopos } = montar(comContexto);
    const r = await carregarNaPagina('pagina.teste', async (ctx) => ctx.tenantId, deps);
    expect(r).toEqual({ tipo: 'ok', dados: TENANT });
    expect(escopos).toEqual(['aberto', 'fechado']);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      nivel: 'info',
      evento: 'pagina',
      campos: { rota: 'pagina.teste', resultado: 'ok', tenant_id: TENANT, usuario_id: USUARIO },
    });
    expect(typeof logs[0]?.campos['duracao_ms']).toBe('number');
  });

  it('NaoEncontrado vira nao_encontrado (a página responde 404), sem Sentry', async () => {
    const { deps, relatados } = montar(comContexto);
    const r = await carregarNaPagina(
      'pagina.teste',
      async () => {
        throw new NaoEncontrado('chamado_nao_encontrado', 'Chamado não encontrado.');
      },
      deps,
    );
    expect(r).toEqual({ tipo: 'nao_encontrado' });
    expect(relatados).toEqual([]);
  });

  it.each([
    ['sem sessão', new ErroHttp(401, 'nao_autenticado', { motivo: 'sessao_ausente' })],
    ['sem grupo', new ErroHttp(400, 'tenant_ausente', { cabecalho: 'x-hubkeep-tenant' })],
  ])('%s: sem_contexto, nada é lido e a tela segue pela API', async (_, erro) => {
    const { deps, escopos } = montar(async () => {
      throw erro;
    });
    const ler = vi.fn();
    const r = await carregarNaPagina('pagina.teste', ler, deps);
    expect(r).toEqual({ tipo: 'sem_contexto' });
    expect(ler).not.toHaveBeenCalled();
    expect(escopos).toEqual([]);
  });

  it('recusa do domínio vira erro com código e parâmetros, sem frase', async () => {
    const { deps } = montar(comContexto);
    const r = await carregarNaPagina(
      'pagina.teste',
      async () => {
        throw new PermissaoNegada('sem_permissao', 'Frase que não sai.', { acao: 'ler' });
      },
      deps,
    );
    expect(r).toEqual({
      tipo: 'erro',
      erro: { codigo: 'sem_permissao', parametros: { acao: 'ler' } },
    });
  });

  it('erro inesperado: erro_interno, Sentry e log de erro', async () => {
    const { deps, logs, relatados } = montar(comContexto);
    const falha = new Error('conexão caiu');
    const r: CargaDaPagina<never> = await carregarNaPagina(
      'pagina.teste',
      async () => {
        throw falha;
      },
      deps,
    );
    expect(r).toEqual({ tipo: 'erro', erro: { codigo: 'erro_interno', parametros: {} } });
    expect(relatados).toEqual([falha]);
    expect(logs.map((l) => [l.nivel, l.evento])).toEqual([
      ['error', 'erro_inesperado'],
      ['error', 'pagina'],
    ]);
  });

  it('registrarErro: o inesperado vai ao Sentry; a recusa do domínio, não', async () => {
    const { deps, relatados } = montar(comContexto);
    const inesperado = new Error('x');
    await carregarNaPagina(
      'pagina.teste',
      async (_, registrarErro) => {
        registrarErro(new PermissaoNegada('sem_permissao', 'Sem permissão.'));
        registrarErro(inesperado);
        return null;
      },
      deps,
    );
    expect(relatados).toEqual([inesperado]);
  });
});
