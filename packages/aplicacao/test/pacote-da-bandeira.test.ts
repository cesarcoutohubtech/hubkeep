// Pacote da bandeira (PB1), com portas em memória: só o Admin mantém o
// pacote; a bandeira e o checklist são conferidos; a prévia não grava;
// aplicar copia só o que vale para o hotel e falta, pausado e com o início no
// dia do hotel; reaplicar não copia de novo; e quem não aplica é recusado.
import type { Atribuicao, Contexto, CopiaDoPlanoPadrao } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { type PlanoPadraoGravado, criarCasosDeUsoDoPacoteDaBandeira } from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const HOTEL = { id: 'h-1', bandeiraId: 'bx', fuso: 'America/Sao_Paulo' };
const papel = (p: Atribuicao['papel'], escopo: Atribuicao['escopo']): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel: p,
  escopo,
  validoAte: p === 'implantador' ? new Date('2026-12-01T00:00:00Z') : null,
  revogadoEm: null,
});
const ADMIN = papel('admin_grupo', { tipo: 'grupo' });
const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

function montar(minhas: Atribuicao[] = [ADMIN]) {
  const planos: PlanoPadraoGravado[] = [
    {
      id: 'p1',
      bandeiraId: 'bx',
      categoriaId: 'cat',
      nome: 'Limpeza',
      intervalo: 1,
      unidade: 'mes',
      checklistModeloId: null,
      ativa: true,
      versao: 1,
    },
    {
      id: 'p2',
      bandeiraId: 'by',
      categoriaId: 'cat',
      nome: 'Outra bandeira',
      intervalo: 1,
      unidade: 'mes',
      checklistModeloId: null,
      ativa: true,
      versao: 1,
    },
  ];
  const copiados = new Set<string>();
  const copias: CopiaDoPlanoPadrao[] = [];
  const criados: unknown[] = [];
  const casos = criarCasosDeUsoDoPacoteDaBandeira({
    pacote: {
      planos: async () => planos,
      plano: async (_c, id) => planos.find((p) => p.id === id) ?? null,
      bandeira: async (_c, id) => (id === 'bx' ? { id } : null),
      categoria: async (_c, id) => (id === 'cat' ? { id, ativa: true } : null),
      checklist: async (_c, id) =>
        id === 'ck-by' ? { ativa: true, categoriaId: null, bandeiraId: 'by' } : null,
      criar: async (_c, d) => {
        criados.push(d);
        return { id: 'novo' };
      },
      alterar: async (_c, _id, versao) => ({ versao: versao + 1 }),
      hotel: async (_c, id) => (id === HOTEL.id ? HOTEL : null),
      copiados: async () => [...copiados],
      copiar: async (_c, _h, c) => {
        if (copiados.has(c.planoPadraoId)) return 'ja_copiado';
        copiados.add(c.planoPadraoId);
        copias.push(c);
        return { id: `plano-${c.planoPadraoId}` };
      },
    },
    atribuicoes: { doUsuario: async () => minhas },
    relogio: { agora: () => new Date('2026-10-21T01:00:00Z') },
  });
  return { casos, criados, copias };
}

const PEDIDO = {
  bandeiraId: 'bx',
  categoriaId: 'cat',
  nome: ' Revisão ',
  intervalo: 3,
  unidade: 'mes',
  checklistModeloId: null,
};

describe('pacote da bandeira (PB1)', () => {
  it('o Admin cria o plano do pacote, com o nome normalizado', async () => {
    const { casos, criados } = montar();
    expect(await casos.criar(ctx, PEDIDO)).toEqual({ id: 'novo' });
    expect(criados).toEqual([
      {
        bandeiraId: 'bx',
        categoriaId: 'cat',
        checklistModeloId: null,
        nome: 'Revisão',
        intervalo: 3,
        unidade: 'mes',
      },
    ]);
  });

  it('recusa quem não é Admin, a bandeira que não existe e o checklist de outra bandeira', async () => {
    const gestor = papel('gestor_csc', { tipo: 'grupo' });
    expect(await codigoDe(montar([gestor]).casos.criar(ctx, PEDIDO))).toBe('pacote_so_do_admin');
    const { casos } = montar();
    expect(await codigoDe(casos.criar(ctx, { ...PEDIDO, bandeiraId: 'bz' }))).toBe(
      'bandeira_nao_encontrada',
    );
    expect(await codigoDe(casos.criar(ctx, { ...PEDIDO, checklistModeloId: 'ck-by' }))).toBe(
      'plano_checklist_invalido',
    );
    expect(await codigoDe(casos.criar(ctx, { ...PEDIDO, checklistModeloId: 'sumiu' }))).toBe(
      'plano_checklist_invalido',
    );
    expect(await codigoDe(casos.alterar(ctx, 'sumiu', { ...PEDIDO, versao: 1 }))).toBe(
      'plano_padrao_nao_encontrado',
    );
  });

  it('a prévia não grava; aplicar copia o que vale para o hotel, no dia do hotel', async () => {
    const implantador = papel('implantador', { tipo: 'hotel', hotelId: HOTEL.id });
    const { casos, copias } = montar([implantador]);
    const previa = await casos.previa(ctx, HOTEL.id);
    expect(previa.map((c) => c.planoPadraoId)).toEqual(['p1']);
    expect(copias).toEqual([]);
    const r = await casos.aplicar(ctx, HOTEL.id);
    expect(r.jaCopiados).toBe(0);
    expect(r.copiados).toEqual([
      expect.objectContaining({
        planoPadraoId: 'p1',
        planoId: 'plano-p1',
        situacao: 'pausado',
        tecnicoId: null,
        equipeId: null,
        // 01:00 UTC do dia 21 ainda é dia 20 em São Paulo.
        inicio: '2026-10-20',
      }),
    ]);
    expect((await casos.aplicar(ctx, HOTEL.id)).copiados).toEqual([]);
  });

  it('o Gerente não aplica; hotel invisível dá 404', async () => {
    const gerente = papel('gerente_hotel', { tipo: 'hotel', hotelId: HOTEL.id });
    expect(await codigoDe(montar([gerente]).casos.aplicar(ctx, HOTEL.id))).toBe(
      'pacote_fora_do_escopo',
    );
    expect(await codigoDe(montar().casos.previa(ctx, 'outro'))).toBe('hotel_nao_encontrado');
  });
});
