// Checklist tipado (PV1, ADR-040) com portas em memória: só o Admin gere os
// modelos e a versão sobe só com os itens; quem tria aplica o modelo ativo e
// troca o que não tem resposta; a resposta é do responsável, com a OS em
// execução ou pausada, conferida contra a cópia; a OS sem checklist recusa; e
// a conclusão, com a política ligada, exige os obrigatórios.
import {
  type Atribuicao,
  type Contexto,
  type DefinicaoDeCampo,
  type EstadoDaOs,
  type Responsavel,
} from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type ChecklistDaOsGravado,
  type ModeloDeChecklistGravado,
  type OsGravada,
  criarCasosDeUsoDeChecklists,
  criarCasosDeUsoDeExecucao,
} from '../src/index';

const HOTEL = { id: '11100000-0000-4000-8000-000000000001', bandeiraId: null };
const AGORA = new Date('2026-10-12T12:00:00Z');
const ctx: Contexto = { usuarioId: 'tec-1', tenantId: 't' };

const atr = (papel: Atribuicao['papel'], usuarioId = 'u'): Atribuicao => ({
  id: `a-${papel}`,
  usuarioId,
  papel,
  escopo: papel === 'admin_grupo' ? { tipo: 'grupo' } : { tipo: 'hotel', hotelId: HOTEL.id },
  validoAte: null,
  revogadoEm: null,
});

const ITENS: DefinicaoDeCampo[] = [
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
    obrigatorio: false,
    rotulos: { 'pt-BR': 'Pressão' },
    unidade: 'psi',
    opcoes: [],
  },
];

function montar(opcoes: {
  minhas: Atribuicao[];
  estado?: EstadoDaOs;
  responsavel?: Responsavel;
  modelos?: ModeloDeChecklistGravado[];
  copia?: ChecklistDaOsGravado | null;
  /** A OS preventiva (PV3c): sem chamado, com o hotel da própria OS. */
  preventiva?: boolean;
}) {
  const modelos: ModeloDeChecklistGravado[] = opcoes.modelos ?? [
    { id: 'm1', categoriaId: null, nomes: { 'pt-BR': 'Ar' }, itens: ITENS, versao: 2, ativa: true },
    {
      id: 'm2',
      categoriaId: null,
      nomes: { 'pt-BR': 'Velho' },
      itens: [],
      versao: 1,
      ativa: false,
    },
  ];
  let copia = opcoes.copia ?? null;
  const aplicadas: { modeloId: string; substitui: string | null }[] = [];
  const alteracoes: { id: string; mudanca: object }[] = [];
  const os: OsGravada = {
    id: 'os-1',
    hotelId: HOTEL.id,
    bandeiraId: HOTEL.bandeiraId,
    chamadoId: opcoes.preventiva ? null : 'c-1',
    preventiva: opcoes.preventiva
      ? { planoId: 'p-1', planoNome: 'PMOC', ativoId: 'a-1', dataPrevista: '2026-10-14' }
      : null,
    estado: opcoes.estado ?? 'em_execucao',
    situacaoId: 's',
    responsavel: opcoes.responsavel ?? { tipo: 'tecnico', usuarioId: 'tec-1' },
    motivoCancelamento: null,
    motivoReabertura: null,
    executadoPor: 'equipe_interna',
    fornecedorId: null,
    custoInformado: null,
    codigos: { falhaId: null, causaId: null, solucaoId: null },
    assinaturaAceiteId: null,
    responsavelArrendamento: null,
    locadorAvisadoEm: null,
    criadoPor: opcoes.preventiva ? null : 'g',
    versao: 4,
    criadoEm: AGORA,
  };
  const triagem = {
    os: async (_c: Contexto, id: string) => (id === os.id ? os : null),
    chamado: async () => ({
      id: 'c-1',
      hotel: HOTEL,
      modeloContratual: null,
      localId: 'l',
      ativoId: null,
      estado: 'em_execucao' as const,
      situacaoId: 's',
      prioridadeId: 'p',
      abertoPor: 'g',
      versao: 1,
      sla: {
        categoriaId: null,
        abertoEm: new Date('2026-10-13T12:00:00Z'),
        politicaAplicada: {},
        prazoAtendimento: null,
        prazoSolucao: null,
        pausadoSegundos: 0,
        jaTeveOs: true,
      },
    }),
  };
  const checklists = {
    idiomaPadrao: async () => 'pt-BR' as const,
    listarModelos: async () => modelos,
    criarModelo: async () => ({ id: 'novo' }),
    alterarModelo: async (_c: Contexto, id: string, mudanca: object) =>
      void alteracoes.push({ id, mudanca }),
    daOs: async () => copia,
    aplicar: async (
      _c: Contexto,
      a: { modelo: { id: string; versao: number; itens: object[] }; substitui: string | null },
    ) => {
      aplicadas.push({ modeloId: a.modelo.id, substitui: a.substitui });
      copia = {
        id: 'k1',
        osId: os.id,
        hotelId: HOTEL.id,
        modeloId: a.modelo.id,
        modeloVersao: a.modelo.versao,
        nomes: {},
        itens: a.modelo.itens,
        respostas: {},
      };
      return { id: 'k1' };
    },
  };
  const casos = criarCasosDeUsoDeChecklists({
    checklists,
    triagem,
    execucao: { equipesDoUsuario: async () => [] },
    atribuicoes: { doUsuario: async () => opcoes.minhas },
    relogio: { agora: () => AGORA },
  });
  return { casos, aplicadas, alteracoes, checklists, triagem, os };
}

const codigoDe = async (p: Promise<unknown>): Promise<string> =>
  p.then(
    () => 'sem erro',
    (e: { codigo: string }) => e.codigo,
  );

describe('modelos de checklist', () => {
  it('só o Admin do grupo cria; nome e itens validados', async () => {
    const admin = montar({ minhas: [atr('admin_grupo')] });
    await expect(
      admin.casos.criarModelo(ctx, { nomes: { 'pt-BR': 'Ar' }, categoriaId: null, itens: ITENS }),
    ).resolves.toEqual({ id: 'novo' });
    expect(
      await codigoDe(admin.casos.criarModelo(ctx, { nomes: {}, categoriaId: null, itens: ITENS })),
    ).toBe('checklist_nome_invalido');
    const gerente = montar({ minhas: [atr('gerente_hotel')] });
    expect(
      await codigoDe(
        gerente.casos.criarModelo(ctx, { nomes: { 'pt-BR': 'x' }, categoriaId: null, itens: [] }),
      ),
    ).toBe('checklists_so_admin');
  });

  it('alterar: a versão sobe só com os itens; o modelo que não existe é 404', async () => {
    const { casos, alteracoes } = montar({ minhas: [atr('admin_grupo')] });
    await expect(
      casos.alterarModelo(ctx, 'm1', {
        nomes: { 'pt-BR': 'Ar 2' },
        categoriaId: null,
        itens: ITENS,
      }),
    ).resolves.toEqual({ versao: 2 });
    await expect(
      casos.alterarModelo(ctx, 'm1', {
        nomes: { 'pt-BR': 'Ar 2' },
        categoriaId: null,
        itens: [ITENS[0]],
      }),
    ).resolves.toEqual({ versao: 3 });
    expect(alteracoes.map((a) => (a.mudanca as { versao: number }).versao)).toEqual([2, 3]);
    expect(await codigoDe(casos.desativarModelo(ctx, 'nao-existe'))).toBe(
      'checklist_nao_encontrado',
    );
  });
});

describe('aplicar o checklist na OS', () => {
  it('quem tria aplica o modelo ativo; o técnico, não', async () => {
    const gerente = montar({ minhas: [atr('gerente_hotel')], estado: 'atribuida' });
    await expect(gerente.casos.aplicarNaOs(ctx, 'os-1', 'm1')).resolves.toEqual({ id: 'k1' });
    expect(gerente.aplicadas).toEqual([{ modeloId: 'm1', substitui: null }]);
    expect(await codigoDe(gerente.casos.aplicarNaOs(ctx, 'os-1', 'm2'))).toBe(
      'checklist_modelo_inativo',
    );
    const tecnico = montar({ minhas: [atr('tecnico', 'tec-1')] });
    expect(await codigoDe(tecnico.casos.aplicarNaOs(ctx, 'os-1', 'm1'))).toBe(
      'triagem_fora_do_papel',
    );
  });

  it('troca a cópia sem resposta; com resposta, 409; OS concluída, transicao_invalida', async () => {
    const copia: ChecklistDaOsGravado = {
      id: 'k0',
      osId: 'os-1',
      hotelId: HOTEL.id,
      modeloId: 'm2',
      modeloVersao: 1,
      nomes: {},
      itens: ITENS,
      respostas: {},
    };
    const semResposta = montar({ minhas: [atr('gestor_csc')], copia });
    await semResposta.casos.aplicarNaOs(ctx, 'os-1', 'm1');
    expect(semResposta.aplicadas).toEqual([{ modeloId: 'm1', substitui: 'k0' }]);
    const respondida = montar({
      minhas: [atr('gestor_csc')],
      copia: {
        ...copia,
        respostas: { filtro_limpo: { valor: true, feitaEm: '', usuarioId: 'u' } },
      },
    });
    expect(await codigoDe(respondida.casos.aplicarNaOs(ctx, 'os-1', 'm1'))).toBe(
      'checklist_ja_respondido',
    );
    const concluida = montar({ minhas: [atr('gestor_csc')], estado: 'concluida' });
    expect(await codigoDe(concluida.casos.aplicarNaOs(ctx, 'os-1', 'm1'))).toBe(
      'transicao_invalida',
    );
  });

  it('na OS preventiva, sem chamado, quem tria no hotel da OS aplica (PV3c)', async () => {
    const gerente = montar({
      minhas: [atr('gerente_hotel')],
      estado: 'atribuida',
      preventiva: true,
    });
    await expect(gerente.casos.aplicarNaOs(ctx, 'os-1', 'm1')).resolves.toEqual({ id: 'k1' });
    const tecnico = montar({ minhas: [atr('tecnico', 'tec-1')], preventiva: true });
    expect(await codigoDe(tecnico.casos.aplicarNaOs(ctx, 'os-1', 'm1'))).toBe(
      'triagem_fora_do_papel',
    );
  });

  it('a OS que quem pede não vê é 404', async () => {
    const { casos } = montar({ minhas: [atr('gerente_hotel')] });
    expect(await codigoDe(casos.aplicarNaOs(ctx, 'outra', 'm1'))).toBe('os_nao_encontrada');
    expect(await codigoDe(casos.daOs(ctx, 'outra'))).toBe('os_nao_encontrada');
  });
});

describe('responder o checklist', () => {
  const copia: ChecklistDaOsGravado = {
    id: 'k1',
    osId: 'os-1',
    hotelId: HOTEL.id,
    modeloId: 'm1',
    modeloVersao: 2,
    nomes: { 'pt-BR': 'Ar' },
    itens: ITENS,
    respostas: {},
  };

  it('o responsável responde, com a hora do aparelho limitada à do servidor', async () => {
    const { casos } = montar({ minhas: [atr('tecnico', 'tec-1')], copia });
    await expect(
      casos.prepararRespostas(ctx, {
        osId: 'os-1',
        respostas: { filtro_limpo: true, pressao: null },
        feitaEm: new Date('2026-10-13T00:00:00Z'),
      }),
    ).resolves.toEqual({
      checklistId: 'k1',
      osId: 'os-1',
      hotelId: HOTEL.id,
      respostas: { filtro_limpo: true, pressao: null },
      feitaEm: AGORA,
    });
  });

  it('na OS preventiva, o responsável responde (PV3c)', async () => {
    const { casos } = montar({ minhas: [atr('tecnico', 'tec-1')], copia, preventiva: true });
    await expect(
      casos.prepararRespostas(ctx, {
        osId: 'os-1',
        respostas: { filtro_limpo: true, pressao: null },
        feitaEm: AGORA,
      }),
    ).resolves.toMatchObject({ checklistId: 'k1', osId: 'os-1', hotelId: HOTEL.id });
  });

  it('fora do tipo: 422; OS atribuída: transicao_invalida; outro responsável: 409; sem checklist: 404', async () => {
    const tec = [atr('tecnico', 'tec-1')];
    expect(
      await codigoDe(
        montar({ minhas: tec, copia }).casos.prepararRespostas(ctx, {
          osId: 'os-1',
          respostas: { pressao: 'alta' },
        }),
      ),
    ).toBe('checklist_resposta_invalida');
    expect(
      await codigoDe(
        montar({ minhas: tec, copia, estado: 'atribuida' }).casos.prepararRespostas(ctx, {
          osId: 'os-1',
          respostas: { filtro_limpo: true },
        }),
      ),
    ).toBe('transicao_invalida');
    expect(
      await codigoDe(
        montar({
          minhas: tec,
          copia,
          responsavel: { tipo: 'tecnico', usuarioId: 'tec-2' },
        }).casos.prepararRespostas(ctx, { osId: 'os-1', respostas: { filtro_limpo: true } }),
      ),
    ).toBe('os_de_outro_responsavel');
    expect(
      await codigoDe(
        montar({ minhas: tec }).casos.prepararRespostas(ctx, {
          osId: 'os-1',
          respostas: { filtro_limpo: true },
        }),
      ),
    ).toBe('os_sem_checklist');
  });
});

describe('conclusão com a política do checklist', () => {
  function execucao(ligada: boolean, respostas: object) {
    const m = montar({
      minhas: [atr('tecnico', 'tec-1')],
      copia: {
        id: 'k1',
        osId: 'os-1',
        hotelId: HOTEL.id,
        modeloId: 'm1',
        modeloVersao: 2,
        nomes: {},
        itens: ITENS,
        respostas,
      },
    });
    return criarCasosDeUsoDeExecucao({
      execucao: {
        equipesDoUsuario: async () => [],
        osDoDia: async () => [],
        ultimaTransicaoEm: async () => null,
        fotosDepois: async () => 0,
        ultimaPausa: async () => null,
      },
      triagem: {
        ...m.triagem,
        calendario: async () => null,
        politica: async (_c, _h, chave) =>
          chave === 'os.checklist_completo_obrigatorio' ? { hotel: { ligado: ligada } } : {},
      },
      situacoes: {
        listar: async () => [
          {
            id: 's-os',
            entidade: 'os',
            estado: 'concluida',
            chavePadrao: null,
            nomes: {},
            ordem: 1,
            cor: '#000',
            ativa: true,
          },
          {
            id: 's-ch',
            entidade: 'chamado',
            estado: 'aguardando_aceite',
            chavePadrao: null,
            nomes: {},
            ordem: 1,
            cor: '#000',
            ativa: true,
          },
        ],
      },
      atribuicoes: { doUsuario: async () => [atr('tecnico', 'tec-1')] },
      relogio: { agora: () => AGORA },
      checklists: m.checklists,
    });
  }

  it('ligada: recusa sem os obrigatórios; com eles, conclui', async () => {
    expect(
      await codigoDe(execucao(true, {}).prepararAcao(ctx, 'concluir', { osId: 'os-1', versao: 4 })),
    ).toBe('checklist_incompleto');
    await expect(
      execucao(true, {
        filtro_limpo: { valor: false, feitaEm: '', usuarioId: 'tec-1' },
      }).prepararAcao(ctx, 'concluir', { osId: 'os-1', versao: 4 }),
    ).resolves.toMatchObject({ estado: 'concluida' });
  });

  it('desligada: conclui sem as respostas', async () => {
    await expect(
      execucao(false, {}).prepararAcao(ctx, 'concluir', { osId: 'os-1', versao: 4 }),
    ).resolves.toMatchObject({ estado: 'concluida' });
  });
});
