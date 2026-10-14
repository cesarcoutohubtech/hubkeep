// As ações na OS preventiva, que não tem chamado (PV3c; ADR-041): a regra de
// papel olha o hotel da OS, o reflexo no chamado sai nulo, a pausa não para
// relógio (o SLA é do chamado), a conclusão não encerra parada nem libera UH,
// e a parada é recusada (parada_na_preventiva). Na corretiva, nada muda: os
// testes de integração do packages/db cobrem.
import {
  ESTADOS_DA_OS,
  ESTADOS_DO_CHAMADO,
  type Atribuicao,
  type Contexto,
} from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type OsGravada,
  type PortaTriagem,
  type SituacaoGravada,
  criarCasosDeUsoDeExecucao,
  criarCasosDeUsoDeTriagem,
} from '../src';

const HOTEL = { id: '11100000-0000-4000-8000-000000000001', bandeiraId: null };
const AGORA = new Date('2026-10-14T12:00:00Z');
const tecnico: Contexto = { usuarioId: 'tec-1', tenantId: 't' };
const gerente: Contexto = { usuarioId: 'ger-1', tenantId: 't' };

const atr = (papel: Atribuicao['papel'], usuarioId: string): Atribuicao => ({
  id: `a-${papel}-${usuarioId}`,
  usuarioId,
  papel,
  escopo: { tipo: 'hotel', hotelId: HOTEL.id },
  validoAte: null,
  revogadoEm: null,
});
const ATRIBUICOES: Record<string, Atribuicao[]> = {
  'tec-1': [atr('tecnico', 'tec-1')],
  'ger-1': [atr('gerente_hotel', 'ger-1')],
};

const SITUACOES: SituacaoGravada[] = [
  ...ESTADOS_DA_OS.map((e, i) => ({
    id: `s-os-${e}`,
    entidade: 'os' as const,
    chavePadrao: null,
    nomes: {},
    cor: '#000000',
    estado: e,
    ordem: i,
    ativa: true,
  })),
  ...ESTADOS_DO_CHAMADO.map((e, i) => ({
    id: `s-ch-${e}`,
    entidade: 'chamado' as const,
    chavePadrao: null,
    nomes: {},
    cor: '#000000',
    estado: e,
    ordem: i,
    ativa: true,
  })),
];

const preventiva = (estado: OsGravada['estado']): OsGravada => ({
  id: 'os-1',
  hotelId: HOTEL.id,
  bandeiraId: HOTEL.bandeiraId,
  chamadoId: null,
  preventiva: { planoId: 'p-1', ativoId: 'a-1', dataPrevista: '2026-10-14' },
  estado,
  situacaoId: `s-os-${estado}`,
  responsavel: { tipo: 'tecnico', usuarioId: 'tec-1' },
  motivoCancelamento: null,
  motivoReabertura: null,
  executadoPor: 'equipe_interna',
  fornecedorId: null,
  custoInformado: null,
  codigos: { falhaId: null, causaId: null, solucaoId: null },
  assinaturaAceiteId: null,
  responsavelArrendamento: null,
  locadorAvisadoEm: null,
  criadoPor: null,
  versao: 3,
  criadoEm: AGORA,
});

const naoUsado = (nome: string) => async (): Promise<never> => {
  throw new Error(`${nome} não é lido na preventiva`);
};

function montar(estado: OsGravada['estado']) {
  const os = preventiva(estado);
  const gravados: { metodo: string; g: unknown }[] = [];
  const politicasLidas: string[] = [];
  const dadosDoAceite: unknown[] = [];
  const categoriasLidas: string[] = [];
  const triagem = {
    os: async (_c: Contexto, id: string) => (id === os.id ? os : null),
    chamado: naoUsado('o chamado'),
    calendario: naoUsado('o calendário'),
    politica: async (_c: Contexto, hotelId: string, chave: string) => {
      politicasLidas.push(`${hotelId}:${chave}`);
      return {};
    },
    situacoes: async () => SITUACOES,
    dadosDoAceite: async (_c: Contexto, g: unknown) => {
      dadosDoAceite.push(g);
      return { equipesDeQuemAbriu: [], gerentes: ATRIBUICOES['ger-1'] ?? [] };
    },
    equipesDoUsuario: async () => [],
    atribuicoesDe: async (_c: Contexto, u: string) => ATRIBUICOES[u] ?? [],
    equipe: async () => null,
    cancelarOs: async (_c: Contexto, g: unknown) => {
      gravados.push({ metodo: 'cancelarOs', g });
      return { versao: 4, versaoDoChamado: null };
    },
    aceitarOs: async (_c: Contexto, g: unknown) => {
      gravados.push({ metodo: 'aceitarOs', g });
      return { versao: 4, versaoDoChamado: null };
    },
    reabrirOs: async (_c: Contexto, g: unknown) => {
      gravados.push({ metodo: 'reabrirOs', g });
      return { versao: 4, versaoDoChamado: null, paradaId: null };
    },
    reatribuirOs: async (_c: Contexto, g: unknown) => {
      gravados.push({ metodo: 'reatribuirOs', g });
      return { versao: 4 };
    },
  } as unknown as PortaTriagem;
  const comuns = {
    situacoes: { listar: async () => SITUACOES },
    atribuicoes: { doUsuario: async (c: Contexto) => ATRIBUICOES[c.usuarioId] ?? [] },
    relogio: { agora: () => AGORA },
  };
  const codigos = {
    listar: async () => [],
    categoriaDoAtivo: async (_c: Contexto, ativoId: string) => {
      categoriasLidas.push(ativoId);
      return null;
    },
  };
  const execucao = criarCasosDeUsoDeExecucao({
    ...comuns,
    execucao: {
      equipesDoUsuario: async () => [],
      osDoDia: async () => [],
      ultimaTransicaoEm: async () => null,
      fotosDepois: async () => 0,
      ultimaPausa: async () => ({
        em: new Date('2026-10-14T11:00:00Z'),
        motivo: 'aguardando_peca',
      }),
    },
    triagem,
    paradas: { abertaDoAtivo: naoUsado('a parada') },
    uh: { abertoDoChamado: naoUsado('a UH') },
    codigos,
    prioridades: { listar: naoUsado('as prioridades') },
  });
  const casosDaTriagem = criarCasosDeUsoDeTriagem({
    ...comuns,
    triagem,
    prioridades: { listar: naoUsado('as prioridades') },
    feriadosOficiais: {
      doAno: () => {
        throw new Error('os feriados não são lidos na preventiva');
      },
    },
    codigos,
  });
  return {
    execucao,
    triagem: casosDaTriagem,
    gravados,
    politicasLidas,
    dadosDoAceite,
    categoriasLidas,
  };
}

const codigoDe = async (p: Promise<unknown>): Promise<string> =>
  p.then(
    () => 'sem erro',
    (e: { codigo: string }) => e.codigo,
  );

describe('execução da OS preventiva', () => {
  it('o responsável inicia; sem reflexo no chamado', async () => {
    const { execucao } = montar('atribuida');
    const d = await execucao.prepararAcao(tecnico, 'iniciar', { osId: 'os-1', versao: 3 });
    expect(d).toMatchObject({
      estado: 'em_execucao',
      chamado: null,
      situacaoId: 's-os-em_execucao',
    });
  });

  it('o Gerente não inicia: a execução é do responsável', async () => {
    const { execucao } = montar('atribuida');
    expect(
      await codigoDe(execucao.prepararAcao(gerente, 'iniciar', { osId: 'os-1', versao: 3 })),
    ).toBe('acao_fora_do_papel');
  });

  it('a pausa com motivo não para relógio, e a retomada não mexe em prazo: o SLA é do chamado', async () => {
    const pausa = montar('em_execucao');
    const d = await pausa.execucao.prepararAcao(tecnico, 'pausar', {
      osId: 'os-1',
      versao: 3,
      motivo: 'aguardando_peca',
    });
    expect(d.pausa).toEqual({ motivo: 'aguardando_peca', paraORelogio: false });
    const retomada = montar('pausada');
    const r = await retomada.execucao.prepararAcao(tecnico, 'retomar', { osId: 'os-1', versao: 3 });
    expect(r).toMatchObject({ estado: 'em_execucao', slaNaRetomada: null, chamado: null });
  });

  it('a conclusão lê as políticas no hotel da OS, não encerra parada nem libera UH, e os códigos usam o ativo da ocorrência', async () => {
    const { execucao, politicasLidas, categoriasLidas } = montar('em_execucao');
    const d = await execucao.prepararAcao(tecnico, 'concluir', {
      osId: 'os-1',
      versao: 3,
      equipamentoVoltou: true,
      uhLiberada: true,
      codigos: { falhaId: null, causaId: null, solucaoId: null },
    });
    expect(d).toMatchObject({
      estado: 'concluida',
      chamado: null,
      encerrarParada: null,
      liberarUh: null,
    });
    expect(politicasLidas.every((p) => p.startsWith(`${HOTEL.id}:`))).toBe(true);
    expect(categoriasLidas).toEqual(['a-1']);
  });

  it('a parada é recusada na preventiva', async () => {
    const { execucao } = montar('em_execucao');
    expect(
      await codigoDe(execucao.prepararParada(tecnico, { osId: 'os-1', inicio: AGORA, fim: null })),
    ).toBe('parada_na_preventiva');
    expect(
      await codigoDe(execucao.prepararEncerramentoDeParada(tecnico, { osId: 'os-1', fim: AGORA })),
    ).toBe('parada_na_preventiva');
  });

  it('apontamento e material: o responsável registra no hotel da OS', async () => {
    const { execucao } = montar('em_execucao');
    await expect(
      execucao.prepararMaterial(tecnico, { osId: 'os-1', descricao: 'Filtro G4' }),
    ).resolves.toEqual({ osId: 'os-1', hotelId: HOTEL.id, descricao: 'Filtro G4' });
  });
});

describe('triagem e aceite da OS preventiva', () => {
  it('o Gerente cancela; o reflexo no chamado vai nulo', async () => {
    const { triagem, gravados } = montar('atribuida');
    await expect(
      triagem.cancelarOs(gerente, 'os-1', { versao: 3, motivo: 'Ativo em reforma' }),
    ).resolves.toEqual({ versao: 4, versaoDoChamado: null });
    expect(gravados).toEqual([
      {
        metodo: 'cancelarOs',
        g: expect.objectContaining({ osId: 'os-1', chamado: null, situacaoId: 's-os-cancelada' }),
      },
    ]);
  });

  it('o técnico não cancela', async () => {
    const { triagem } = montar('atribuida');
    expect(
      await codigoDe(triagem.cancelarOs(tecnico, 'os-1', { versao: 3, motivo: 'x' })),
    ).not.toBe('sem erro');
  });

  it('o Gerente aceita a concluída: sem quem abriu, e sem reflexo no chamado', async () => {
    const { triagem, gravados, dadosDoAceite } = montar('concluida');
    await expect(triagem.aceitarOs(gerente, 'os-1', { versao: 3 })).resolves.toEqual({
      versao: 4,
      versaoDoChamado: null,
    });
    expect(dadosDoAceite).toEqual([{ hotel: HOTEL, abertoPor: null }]);
    expect(gravados[0]).toMatchObject({
      metodo: 'aceitarOs',
      g: { chamado: null, situacaoId: 's-os-aceita' },
    });
  });

  it('a reabertura volta a OS à execução; com parada pedida, recusa', async () => {
    const ok = montar('concluida');
    await ok.triagem.reabrirOs(gerente, 'os-1', { versao: 3, motivo: 'Vazamento voltou' });
    expect(ok.gravados[0]).toMatchObject({
      metodo: 'reabrirOs',
      g: { chamado: null, parada: null },
    });
    const comParada = montar('concluida');
    expect(
      await codigoDe(
        comParada.triagem.reabrirOs(gerente, 'os-1', {
          versao: 3,
          motivo: 'Vazamento voltou',
          paradoDesde: '2026-10-14T10:00:00Z',
        }),
      ),
    ).toBe('parada_na_preventiva');
  });

  it('versão velha: 409 antes de qualquer gravação', async () => {
    const { triagem, gravados } = montar('atribuida');
    expect(await codigoDe(triagem.cancelarOs(gerente, 'os-1', { versao: 2, motivo: 'x' }))).toBe(
      'conflito_de_versao',
    );
    expect(gravados).toEqual([]);
  });
});
