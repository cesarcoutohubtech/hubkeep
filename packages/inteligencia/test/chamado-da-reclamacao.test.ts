// Abrir chamado a partir da reclamação (adendo de 19/10/2026 ao ADR-047): o
// motor confere a reclamação e monta o pedido do núcleo, e depois liga o
// chamado aberto. Quem abre é quem decide insight no hotel.
import type { Atribuicao, Escopo, Papel } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type InsightComEvidencia,
  type LigacaoDoChamado,
  type PortasDoChamadoDaReclamacao,
  type PortasDoChamadoDoInsight,
  type ReclamacaoParaChamado,
  type SinalDaFila,
  ligarChamadoDaReclamacao,
  ligarChamadoDoInsight,
  prepararChamadoDaReclamacao,
  prepararChamadoDoInsight,
} from '../src/index';

const agora = new Date('2026-10-19T12:00:00Z');
const antes = (dias: number) => new Date(agora.getTime() - dias * 86_400_000);

const atribuicao = (papel: Papel, escopo: Escopo): Atribuicao => ({
  id: `a-${papel}`,
  usuarioId: 'u1',
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
});

const reclamacao = (r: Partial<ReclamacaoParaChamado> = {}): ReclamacaoParaChamado => ({
  id: 's1',
  hotelId: 'h1',
  bandeiraId: null,
  manutencao: true,
  uhId: 'uh1',
  ativoId: 'a1',
  localDoAtivo: 'maquinas',
  chamadoId: null,
  ...r,
});

function emMemoria(
  r: ReclamacaoParaChamado | null,
  atribuicoes: Atribuicao[] = [atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' })],
): PortasDoChamadoDaReclamacao & { ligacoes: LigacaoDoChamado[] } {
  const nao = async (): Promise<never> => {
    throw new Error('não usada');
  };
  const ligacoes: LigacaoDoChamado[] = [];
  return {
    ligacoes,
    modulos: async () => [{ modulo: 'inteligencia', inicio: antes(200), fim: null }],
    atribuicoes: async () => atribuicoes,
    visibilidade: async () => ({
      aPartirDe: null,
      diasAposAtivacao: 60,
      papeis: ['admin_grupo', 'gestor_csc', 'gerente_hotel'],
    }),
    fuso: async () => 'America/Sao_Paulo',
    contagens: nao,
    insights: nao,
    insight: nao,
    ligados: nao,
    chamados: nao,
    nomes: nao,
    decidir: nao,
    ativo: nao,
    metricasDoAtivo: nao,
    insightsDoEscopo: nao,
    reclamacaoParaChamado: async (id) => (r && r.id === id ? r : null),
    ligarChamado: async (l) => {
      ligacoes.push(l);
    },
  };
}

describe('o pedido do chamado a partir da reclamação', () => {
  it('com o ativo: o local do ativo, o ativo e "afeta hóspede"', async () => {
    const abertura = await prepararChamadoDaReclamacao(
      emMemoria(reclamacao()),
      { sinalId: 's1', comAtivo: true, descricao: 'Caldeira sem água quente' },
      agora,
    );
    expect(abertura).toEqual({
      localId: 'maquinas',
      ativoId: 'a1',
      descricao: 'Caldeira sem água quente',
      impactoHospede: true,
    });
  });

  it('sem o ativo: a UH da classificação', async () => {
    const abertura = await prepararChamadoDaReclamacao(
      emMemoria(reclamacao()),
      { sinalId: 's1', comAtivo: false, descricao: 'Chuveiro fraco' },
      agora,
    );
    expect(abertura).toMatchObject({ localId: 'uh1', ativoId: null });
  });

  it.each([
    [reclamacao({ manutencao: false, ativoId: null }), true, 'reclamacao_sem_manutencao'],
    [reclamacao({ manutencao: null, ativoId: null }), false, 'reclamacao_sem_manutencao'],
    [reclamacao({ ativoId: null, localDoAtivo: null }), true, 'reclamacao_sem_ativo'],
    [reclamacao({ uhId: null }), false, 'reclamacao_sem_local'],
    [reclamacao({ chamadoId: 'c9' }), true, 'reclamacao_ja_tem_chamado'],
  ])('recusa: %#', async (r, comAtivo, codigo) => {
    await expect(
      prepararChamadoDaReclamacao(emMemoria(r), { sinalId: 's1', comAtivo, descricao: 'x' }, agora),
    ).rejects.toMatchObject({ codigo });
  });

  it('quem não decide insight no hotel: sinal_nao_encontrado', async () => {
    const p = emMemoria(reclamacao(), [
      atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' }),
    ]);
    await expect(
      prepararChamadoDaReclamacao(p, { sinalId: 's1', comAtivo: true, descricao: 'x' }, agora),
    ).rejects.toMatchObject({ codigo: 'sinal_nao_encontrado' });
    await expect(
      prepararChamadoDaReclamacao(
        emMemoria(null),
        { sinalId: 's1', comAtivo: true, descricao: 'x' },
        agora,
      ),
    ).rejects.toMatchObject({ codigo: 'sinal_nao_encontrado' });
  });
});

describe('a ligação do chamado aberto', () => {
  it('grava em nome de quem abriu, no hotel da reclamação', async () => {
    const p = emMemoria(reclamacao());
    await ligarChamadoDaReclamacao(p, { sinalId: 's1', chamadoId: 'c1', usuarioId: 'u1' }, agora);
    expect(p.ligacoes).toEqual([
      { sinalId: 's1', hotelId: 'h1', chamadoId: 'c1', ligadoPor: 'u1', em: agora },
    ]);
  });

  it('a mesma ligação de novo não grava; outro chamado já ligado é conflito', async () => {
    const p = emMemoria(reclamacao({ chamadoId: 'c1' }));
    await ligarChamadoDaReclamacao(p, { sinalId: 's1', chamadoId: 'c1', usuarioId: 'u1' }, agora);
    expect(p.ligacoes).toEqual([]);
    await expect(
      ligarChamadoDaReclamacao(p, { sinalId: 's1', chamadoId: 'c2', usuarioId: 'u1' }, agora),
    ).rejects.toMatchObject({
      codigo: 'reclamacao_ja_tem_chamado',
      parametros: { chamadoId: 'c1' },
    });
  });
});

const insight = (evidencia: unknown, hotelId: string | null = 'h1'): InsightComEvidencia => ({
  id: 'i1',
  numero: 133,
  hotelId,
  bandeiraId: null,
  hotelIds: ['h1'],
  tipo: 'sistemico',
  escopo: { regra: 'reclamacoes_categoria' },
  estado: 'novo',
  faixa: 'atencao',
  valor: null,
  versaoScore: 5,
  anteriorId: null,
  primeiraDeteccaoEm: antes(2),
  ultimaDeteccaoEm: antes(1),
  responsavelId: null,
  encerradoEm: null,
  encerradoPor: null,
  nota: null,
  motivoDeDescarte: null,
  versao: 1,
  detalhe: null,
  evidencia,
});

const daFila = (id: string, s: Partial<SinalDaFila> = {}): SinalDaFila => ({
  id,
  hotelId: 'h1',
  fonte: 'google',
  idExterno: id,
  ocorridoEm: antes(3),
  nota: 2,
  escala: 5,
  texto: 'Chuveiro fraco',
  textoApagadoEm: null,
  idioma: 'pt-BR',
  uhCitada: null,
  manutencao: true,
  categoriaId: 'k1',
  uhId: 'uh1',
  ativoId: null,
  ligacao: 'sem_ligacao',
  classificadoEm: antes(2),
  classificadoPor: 'u2',
  importadoEm: antes(2),
  versao: 2,
  chamadoId: null,
  ...s,
});

function doInsight(
  i: InsightComEvidencia | null,
  sinais: SinalDaFila[],
  atribuicoes: Atribuicao[] = [atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' })],
): PortasDoChamadoDoInsight & { lotes: LigacaoDoChamado[][] } {
  const base = emMemoria(null, atribuicoes);
  const lotes: LigacaoDoChamado[][] = [];
  return {
    ...base,
    lotes,
    insight: async (id) => (i && i.id === id ? i : null),
    sinaisPorIds: async (ids, limite) => sinais.filter((x) => ids.includes(x.id)).slice(0, limite),
    referenciasDaClassificacao: async (r) => ({
      ativo:
        r.ativoId === 'bomba'
          ? { id: 'bomba', hotelId: 'h1', categoriaId: 'k1', desativadoEm: null }
          : null,
      uh:
        r.uhId === 'uh1' || r.uhId === 'area'
          ? { id: r.uhId, hotelId: 'h1', tipo: r.uhId === 'uh1' ? 'uh' : 'area_comum' }
          : r.uhId === 'uh-de-outro'
            ? { id: r.uhId, hotelId: 'h2', tipo: 'uh' }
            : null,
      categoria: null,
    }),
    ligarChamados: async (ls) => {
      lotes.push([...ls]);
    },
  };
}

describe('um chamado para as reclamações do insight sistêmico', () => {
  const evidencia = { sinalIds: ['s1', 's2', 's3', 's4'], corretivaIds: [] };
  const sinais = [
    daFila('s1'),
    daFila('s2', { uhId: 'uh2' }),
    daFila('s3', { chamadoId: 'c0' }),
    daFila('s4', { manutencao: false, categoriaId: null }),
  ];

  it('o local escolhido, o ativo e "afeta hóspede"', async () => {
    const abertura = await prepararChamadoDoInsight(
      doInsight(insight(evidencia), sinais),
      { insightId: 'i1', localId: 'area', ativoId: 'bomba', descricao: 'Chuveiros fracos' },
      agora,
    );
    expect(abertura).toEqual({
      localId: 'area',
      ativoId: 'bomba',
      descricao: 'Chuveiros fracos',
      impactoHospede: true,
    });
  });

  it('liga numa transação só as de manutenção ainda sem chamado', async () => {
    const p = doInsight(insight(evidencia), sinais);
    expect(
      await ligarChamadoDoInsight(p, { insightId: 'i1', chamadoId: 'c1', usuarioId: 'u1' }, agora),
    ).toBe(2);
    expect(p.lotes).toEqual([
      [
        { sinalId: 's1', hotelId: 'h1', chamadoId: 'c1', ligadoPor: 'u1', em: agora },
        { sinalId: 's2', hotelId: 'h1', chamadoId: 'c1', ligadoPor: 'u1', em: agora },
      ],
    ]);
  });

  it('sem reclamação sem chamado: recusa abrir, e ligar não grava', async () => {
    const todas = sinais.map((x) => ({ ...x, chamadoId: 'c0' }));
    const p = doInsight(insight(evidencia), todas);
    await expect(
      prepararChamadoDoInsight(
        p,
        { insightId: 'i1', localId: 'uh1', ativoId: null, descricao: 'x' },
        agora,
      ),
    ).rejects.toMatchObject({ codigo: 'insight_sem_reclamacao_para_chamado' });
    expect(
      await ligarChamadoDoInsight(p, { insightId: 'i1', chamadoId: 'c1', usuarioId: 'u1' }, agora),
    ).toBe(0);
    expect(p.lotes).toEqual([]);
  });

  it.each([
    [insight({ corretivaIds: [] }), 'uh1', null, 'insight_sem_reclamacoes'],
    [insight(evidencia, null), 'uh1', null, 'insight_sem_reclamacoes'],
    [null, 'uh1', null, 'insight_nao_encontrado'],
    [insight(evidencia), 'uh-de-outro', null, 'local_nao_encontrado'],
    [insight(evidencia), 'sumiu', null, 'local_nao_encontrado'],
    [insight(evidencia), 'uh1', 'outro-ativo', 'ativo_nao_encontrado'],
  ])('recusa: %#', async (i, localId, ativoId, codigo) => {
    await expect(
      prepararChamadoDoInsight(
        doInsight(i, sinais),
        { insightId: 'i1', localId, ativoId, descricao: 'x' },
        agora,
      ),
    ).rejects.toMatchObject({ codigo });
  });

  it('quem lê o insight, mas não decide no hotel: insight_fora_do_escopo', async () => {
    const p = doInsight(insight(evidencia), sinais, [
      atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' }),
    ]);
    await expect(
      prepararChamadoDoInsight(
        p,
        { insightId: 'i1', localId: 'uh1', ativoId: null, descricao: 'x' },
        agora,
      ),
    ).rejects.toMatchObject({ codigo: 'insight_fora_do_escopo' });
  });
});
