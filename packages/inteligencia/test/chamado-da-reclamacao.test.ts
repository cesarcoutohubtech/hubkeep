// Abrir chamado a partir da reclamação (adendo de 19/10/2026 ao ADR-047): o
// motor confere a reclamação e monta o pedido do núcleo, e depois liga o
// chamado aberto. Quem abre é quem decide insight no hotel.
import type { Atribuicao, Escopo, Papel } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type LigacaoDoChamado,
  type PortasDoChamadoDaReclamacao,
  type ReclamacaoParaChamado,
  ligarChamadoDaReclamacao,
  prepararChamadoDaReclamacao,
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
