// Sugestões de plano (M1, caminho C), com portas em memória: entra o ativo
// com modelo e sem plano que o cubra; o plano de um clique nasce pausado, sem
// responsável, com a periodicidade, o checklist ativo do modelo e o nome do
// ativo; descartar exige motivo; o que já tem plano não cria nem descarta; e
// só quem gere planos no hotel mexe.
import type { Atribuicao, Contexto } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type AtivoComSugestao,
  type PedidoDeNovoPlano,
  criarCasosDeUsoDeSugestoesDePlano,
} from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const HOTEL = { id: 'h-1', bandeiraId: null, fuso: 'America/Sao_Paulo' };
const gerente = (hotelId: string): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel: 'gerente_hotel',
  escopo: { tipo: 'hotel', hotelId },
  validoAte: null,
  revogadoEm: null,
});

const ativo = (id: string, extra: Partial<AtivoComSugestao> = {}): AtivoComSugestao => ({
  id,
  hotelId: HOTEL.id,
  nome: `Split ${id}`,
  categoriaId: 'cat-ar',
  modeloId: 'm-ar',
  versao: 3,
  ativo: true,
  sugestaoDescartada: false,
  ...extra,
});

const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

function montar(opcoes: { hotelDoPapel?: string; planos?: { ativoId: string | null }[] } = {}) {
  const ativos = [
    ativo('a1'),
    ativo('a2', { modeloId: 'm-sem' }),
    ativo('a3', { sugestaoDescartada: true }),
    ativo('a4'),
  ];
  const planos = (opcoes.planos ?? [{ ativoId: 'a4' }]).map((p, i) => ({
    id: `p${i}`,
    hotelId: HOTEL.id,
    ativoId: p.ativoId,
    categoriaId: null,
    nome: 'x',
    intervalo: 1,
    unidade: 'mes' as const,
    inicio: '2026-10-01',
    checklistModeloId: null,
    tecnicoId: null,
    equipeId: null,
    situacao: 'pausado' as const,
    versao: 1,
  }));
  const criados: PedidoDeNovoPlano[] = [];
  const descartes: { ativoId: string; versao: number; motivo: string }[] = [];
  const casos = criarCasosDeUsoDeSugestoesDePlano({
    sugestoes: {
      ativos: async () => ativos,
      ativo: async (_c, id) => ativos.find((a) => a.id === id) ?? null,
      modelos: async (_c, ids) =>
        [
          {
            id: 'm-ar',
            nome: 'Split 12.000',
            planoSugerido: { intervalo: 3, unidade: 'mes' },
            checklistModeloId: 'ck-1',
            checklistAtivo: true,
          },
          {
            id: 'm-sem',
            nome: 'Sem periodicidade',
            planoSugerido: null,
            checklistModeloId: 'ck-2',
            checklistAtivo: false,
          },
        ].filter((m) => ids.includes(m.id)),
      descartar: async (_c, ativoId, versao, motivo) => {
        descartes.push({ ativoId, versao, motivo });
        return { versao: versao + 1 };
      },
    },
    planos: { hotel: async () => HOTEL, doHotel: async () => planos },
    criarPlano: async (_c, _h, p) => {
      criados.push(p);
      return { id: 'novo', versao: 1 };
    },
    atribuicoes: { doUsuario: async () => [gerente(opcoes.hotelDoPapel ?? HOTEL.id)] },
    relogio: { agora: () => new Date('2026-10-19T02:00:00Z') },
  });
  return { casos, criados, descartes };
}

describe('sugestões de plano (M1)', () => {
  it('lista o ativo com modelo e sem plano, sem o descartado e o que já tem plano', async () => {
    const { casos } = montar();
    const { sugestoes } = await casos.listar(ctx, HOTEL.id);
    expect(sugestoes).toEqual([
      {
        ativoId: 'a1',
        ativoNome: 'Split a1',
        ativoVersao: 3,
        modeloId: 'm-ar',
        modeloNome: 'Split 12.000',
        periodicidade: { intervalo: 3, unidade: 'mes' },
        checklistModeloId: 'ck-1',
      },
      {
        ativoId: 'a2',
        ativoNome: 'Split a2',
        ativoVersao: 3,
        modeloId: 'm-sem',
        modeloNome: 'Sem periodicidade',
        periodicidade: null,
        checklistModeloId: null,
      },
    ]);
  });

  it('o plano de um clique nasce pausado, sem responsável, no dia do hotel', async () => {
    const { casos, criados } = montar();
    expect(await casos.criarPlano(ctx, 'a1')).toEqual({ id: 'novo', versao: 1 });
    expect(criados).toEqual([
      {
        nome: 'Split a1',
        intervalo: 3,
        unidade: 'mes',
        inicio: '2026-10-18',
        checklistModeloId: 'ck-1',
        tecnicoId: null,
        equipeId: null,
        ativoId: 'a1',
        categoriaId: null,
        ativar: false,
      },
    ]);
  });

  it('sem periodicidade, já com plano ou descartado não cria', async () => {
    const { casos, criados } = montar();
    expect(await codigoDe(casos.criarPlano(ctx, 'a2'))).toBe('sugestao_sem_periodicidade');
    expect(await codigoDe(casos.criarPlano(ctx, 'a4'))).toBe('sugestao_de_plano_indisponivel');
    expect(await codigoDe(casos.criarPlano(ctx, 'a3'))).toBe('sugestao_de_plano_indisponivel');
    expect(await codigoDe(casos.criarPlano(ctx, 'a9'))).toBe('ativo_nao_encontrado');
    expect(criados).toEqual([]);
  });

  it('descartar exige o motivo e leva a versão do ativo', async () => {
    const { casos, descartes } = montar();
    expect(await codigoDe(casos.descartar(ctx, 'a1', 3, '  '))).toBe('motivo_obrigatorio');
    expect(await casos.descartar(ctx, 'a1', 3, ' Ativo  reserva ')).toEqual({ versao: 4 });
    expect(await codigoDe(casos.descartar(ctx, 'a4', 3, 'Já coberto'))).toBe(
      'sugestao_de_plano_indisponivel',
    );
    expect(descartes).toEqual([{ ativoId: 'a1', versao: 3, motivo: 'Ativo reserva' }]);
  });

  it('quem não gere planos no hotel não lista, não cria e não descarta', async () => {
    const { casos } = montar({ hotelDoPapel: 'h-outro' });
    expect(await codigoDe(casos.listar(ctx, HOTEL.id))).toBe('planos_fora_do_escopo');
    expect(await codigoDe(casos.criarPlano(ctx, 'a1'))).toBe('planos_fora_do_escopo');
    expect(await codigoDe(casos.descartar(ctx, 'a1', 3, 'x'))).toBe('planos_fora_do_escopo');
  });
});
