// Planos preventivos (fase 1b, PV2; ADR-041), com as portas em memória: quem
// gere, as referências conferidas no hotel, a próxima data no fuso do hotel,
// a versão e as transições. A RLS e o banco são do teste de integração
// (packages/db/test/planos-preventivos.test.ts).
import { type Atribuicao, type Contexto, conflitoDeVersao } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type NovoPlano,
  type PedidoDeNovoPlano,
  type PlanoGravado,
  criarCasosDeUsoDePlanosPreventivos,
} from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const atr = (papel: Atribuicao['papel'], escopo: Atribuicao['escopo'], usuarioId = 'u') => ({
  id: `${usuarioId}-${papel}`,
  usuarioId,
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
});
const gerente = atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' });
const tecnicoDoH1 = atr('tecnico', { tipo: 'hotel', hotelId: 'h1' }, 'tec');
// 2026-10-14 02:30 UTC ainda é 13/10 em Brasília.
const AGORA = new Date('2026-10-14T02:30:00Z');

function cenario(minhas: Atribuicao[] = [gerente]) {
  const planos = new Map<string, PlanoGravado>();
  const criados: NovoPlano[] = [];
  let seq = 0;
  const casos = criarCasosDeUsoDePlanosPreventivos({
    planos: {
      hotel: async (_c, id) =>
        id === 'h1' || id === 'h2' ? { id, bandeiraId: null, fuso: 'America/Sao_Paulo' } : null,
      doHotel: async (_c, hotelId) => [...planos.values()].filter((p) => p.hotelId === hotelId),
      doAtivo: async (_c, ativoId) => [...planos.values()].filter((p) => p.ativoId === ativoId),
      plano: async (_c, id) => planos.get(id) ?? null,
      ativo: async (_c, id) =>
        ({
          a1: { hotelId: 'h1', ativo: true },
          a2: { hotelId: 'h2', ativo: true },
          velho: { hotelId: 'h1', ativo: false },
        })[id] ?? null,
      categoriaExiste: async (_c, id) => id === 'cat',
      modeloDeChecklist: async (_c, id) =>
        ({ m1: { ativa: true }, antigo: { ativa: false } })[id] ?? null,
      criar: async (_c, p) => {
        criados.push(p);
        const id = `p${++seq}`;
        planos.set(id, { ...p, id, versao: 1 });
        return { id, versao: 1 };
      },
      alterar: async (_c, id, versaoEsperada, mudanca) => {
        const atual = planos.get(id);
        if (!atual) throw new Error('sem plano');
        if (atual.versao !== versaoEsperada) throw conflitoDeVersao(atual.versao);
        const novo = { ...atual, ...mudanca, versao: atual.versao + 1 };
        planos.set(id, novo);
        return { versao: novo.versao };
      },
    },
    triagem: {
      atribuicoesDe: async (_c, usuarioId) => (usuarioId === 'tec' ? [tecnicoDoH1] : []),
      equipe: async (_c, id) =>
        ({
          e1: { hotelId: 'h1', ativa: true },
          e2: { hotelId: 'h2', ativa: true },
          parada: { hotelId: 'h1', ativa: false },
        })[id] ?? null,
    },
    atribuicoes: { doUsuario: async () => minhas },
    relogio: { agora: () => AGORA },
  });
  return { casos, planos, criados };
}

const pedido = (p: Partial<PedidoDeNovoPlano> = {}): PedidoDeNovoPlano => ({
  nome: ' Limpeza  do filtro ',
  intervalo: 1,
  unidade: 'mes',
  inicio: '2026-01-31',
  checklistModeloId: null,
  tecnicoId: null,
  equipeId: null,
  ativoId: 'a1',
  categoriaId: null,
  ativar: false,
  ...p,
});

describe('planos preventivos: cadastro', () => {
  it('cadastra pausado, com o nome normalizado, e lista com a próxima data no fuso do hotel', async () => {
    const { casos, criados } = cenario();
    const { id } = await casos.criar(ctx, 'h1', pedido());
    expect(criados[0]).toMatchObject({
      nome: 'Limpeza do filtro',
      situacao: 'pausado',
      hotelId: 'h1',
      ativoId: 'a1',
    });
    const lista = await casos.doHotel(ctx, 'h1');
    expect(lista.hoje).toBe('2026-10-13');
    expect(lista.planos).toEqual([expect.objectContaining({ id, proximaData: '2026-10-31' })]);
    expect((await casos.doAtivo(ctx, 'a1')).planos.map((p) => p.id)).toEqual([id]);
  });

  it('nasce ativo só com o responsável', async () => {
    const { casos, criados } = cenario();
    await expect(casos.criar(ctx, 'h1', pedido({ ativar: true }))).rejects.toMatchObject({
      codigo: 'plano_sem_responsavel',
    });
    await casos.criar(ctx, 'h1', pedido({ ativar: true, tecnicoId: 'tec' }));
    await casos.criar(ctx, 'h1', pedido({ ativar: true, equipeId: 'e1' }));
    expect(criados.map((c) => c.situacao)).toEqual(['ativo', 'ativo']);
  });

  it.each([
    ['ativo de outro hotel', { ativoId: 'a2' }, 'plano_ativo_invalido'],
    ['ativo desativado', { ativoId: 'velho' }, 'plano_ativo_invalido'],
    ['ativo que não existe', { ativoId: 'x' }, 'plano_ativo_invalido'],
    ['categoria que não existe', { ativoId: null, categoriaId: 'x' }, 'plano_categoria_invalida'],
    ['sem alvo', { ativoId: null }, 'plano_alvo_invalido'],
    ['dois alvos', { categoriaId: 'cat' }, 'plano_alvo_invalido'],
    ['checklist desativado', { checklistModeloId: 'antigo' }, 'plano_checklist_invalido'],
    ['checklist que não existe', { checklistModeloId: 'x' }, 'plano_checklist_invalido'],
    ['técnico de outro hotel', { tecnicoId: 'outro' }, 'plano_tecnico_invalido'],
    ['equipe de outro hotel', { equipeId: 'e2' }, 'plano_equipe_invalida'],
    ['equipe desativada', { equipeId: 'parada' }, 'plano_equipe_invalida'],
    ['técnico e equipe', { tecnicoId: 'tec', equipeId: 'e1' }, 'plano_responsavel_duplo'],
    ['periodicidade fora do limite', { intervalo: 25 }, 'periodicidade_invalida'],
    ['início que não existe', { inicio: '2026-02-30' }, 'plano_inicio_invalido'],
    ['nome vazio', { nome: '  ' }, 'plano_nome_invalido'],
  ] as const)('recusa: %s', async (_caso, mudanca, codigo) => {
    const { casos, criados } = cenario();
    await expect(casos.criar(ctx, 'h1', pedido(mudanca))).rejects.toMatchObject({ codigo });
    expect(criados).toEqual([]);
  });

  it('plano por categoria com checklist ativo', async () => {
    const { casos, criados } = cenario();
    await casos.criar(
      ctx,
      'h1',
      pedido({ ativoId: null, categoriaId: 'cat', checklistModeloId: 'm1', intervalo: 3 }),
    );
    expect(criados[0]).toMatchObject({ categoriaId: 'cat', checklistModeloId: 'm1' });
  });

  it('quem não gere o hotel não cadastra; hotel que não vê dá 404', async () => {
    const doTecnico = cenario([atr('tecnico', { tipo: 'hotel', hotelId: 'h1' })]);
    await expect(doTecnico.casos.criar(ctx, 'h1', pedido())).rejects.toMatchObject({
      codigo: 'planos_fora_do_escopo',
    });
    const outroHotel = cenario([atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' })]);
    await expect(outroHotel.casos.criar(ctx, 'h1', pedido())).rejects.toMatchObject({
      codigo: 'planos_fora_do_escopo',
    });
    await expect(cenario().casos.doHotel(ctx, 'h9')).rejects.toMatchObject({
      codigo: 'hotel_nao_encontrado',
    });
    await expect(cenario().casos.doAtivo(ctx, 'x')).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
  });

  it('o Implantador do hotel também cadastra (decisão 8)', async () => {
    const { casos, criados } = cenario([atr('implantador', { tipo: 'hotel', hotelId: 'h1' })]);
    await casos.criar(ctx, 'h1', pedido());
    expect(criados).toHaveLength(1);
  });
});

describe('planos preventivos: alteração e situação', () => {
  it('altera pela versão; a versão velha dá conflito', async () => {
    const { casos, planos } = cenario();
    const { id } = await casos.criar(ctx, 'h1', pedido());
    const r = await casos.alterar(ctx, id, 1, { ...pedido(), intervalo: 2, unidade: 'semana' });
    expect(r.versao).toBe(2);
    expect(planos.get(id)).toMatchObject({ intervalo: 2, unidade: 'semana', ativoId: 'a1' });
    await expect(casos.alterar(ctx, id, 1, pedido())).rejects.toMatchObject({
      codigo: 'conflito_de_versao',
    });
  });

  it('ativa com responsável, pausa, encerra, e o encerrado não muda mais', async () => {
    const { casos } = cenario();
    const { id } = await casos.criar(ctx, 'h1', pedido());
    await expect(casos.mudarSituacao(ctx, id, 1, 'ativar')).rejects.toMatchObject({
      codigo: 'plano_sem_responsavel',
    });
    await casos.alterar(ctx, id, 1, { ...pedido(), tecnicoId: 'tec' });
    expect(await casos.mudarSituacao(ctx, id, 2, 'ativar')).toEqual({
      versao: 3,
      situacao: 'ativo',
    });
    // O ativo não perde o responsável numa alteração.
    await expect(casos.alterar(ctx, id, 3, pedido())).rejects.toMatchObject({
      codigo: 'plano_sem_responsavel',
    });
    expect(await casos.mudarSituacao(ctx, id, 3, 'pausar')).toEqual({
      versao: 4,
      situacao: 'pausado',
    });
    expect(await casos.mudarSituacao(ctx, id, 4, 'encerrar')).toEqual({
      versao: 5,
      situacao: 'encerrado',
    });
    await expect(casos.mudarSituacao(ctx, id, 5, 'ativar')).rejects.toMatchObject({
      codigo: 'plano_encerrado',
    });
    await expect(casos.alterar(ctx, id, 5, pedido())).rejects.toMatchObject({
      codigo: 'plano_encerrado',
    });
    const [encerrado] = (await casos.doHotel(ctx, 'h1')).planos;
    expect(encerrado?.proximaData).toBeNull();
  });

  it('plano que não existe ou fora do escopo', async () => {
    const { casos } = cenario();
    await expect(casos.mudarSituacao(ctx, 'x', 1, 'pausar')).rejects.toMatchObject({
      codigo: 'plano_nao_encontrado',
    });
    const { id } = await casos.criar(ctx, 'h1', pedido());
    const doOutro = cenario([atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' })]);
    // Mesmo plano, outro usuário: a regra recusa antes da porta.
    const p = (await casos.doHotel(ctx, 'h1')).planos[0] as PlanoGravado;
    doOutro.planos.set(id, p);
    await expect(doOutro.casos.mudarSituacao(ctx, id, 1, 'encerrar')).rejects.toMatchObject({
      codigo: 'planos_fora_do_escopo',
    });
  });
});
