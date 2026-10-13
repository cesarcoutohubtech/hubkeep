// Operações offline (F0-11, ADR-025) com a porta em memória: validação antes
// de aplicar e aplicação uma vez só por chave; ativos (B3) sem duplicar no
// reenvio e com o conflito de versão recusado sem guardar a chave.
import { Conflito, type Contexto, RegraViolada, conflitoDeVersao } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type DadosDeAtivo,
  type PortaOperacoesOffline,
  type PreferenciasGravadas,
  type RespostaDeOperacao,
  criarCasosDeUsoDeSincronizacao,
} from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const CHAVE = '0193a000-0000-4000-8000-000000000001';

function montar() {
  const guardadas = new Map<string, RespostaDeOperacao>();
  const gravadas: PreferenciasGravadas[] = [];
  const ativos = new Map<string, { versao: number; dados: DadosDeAtivo }>();
  const os = { concluida: false };
  // A parada aberta do ativo do chamado (C5), como o banco a guardaria.
  const parada = { aberta: false, registradas: 0 };
  // As respostas do checklist (PV1) que chegaram à unit of work.
  const respondidas: Record<string, unknown>[] = [];
  const operacoes: PortaOperacoesOffline = {
    respostaGuardada: async (_c, chave) => guardadas.get(chave) ?? null,
    async aplicarUmaVez(_c, op, efeito) {
      const antes = guardadas.get(op.chave);
      if (antes) return { repetida: true, resposta: antes };
      const resposta = await efeito({
        gravarPreferencias: async (p) => void gravadas.push(p),
        cadastrarAtivo: async (_h, _l, dados) => {
          const id = `ativo-${ativos.size + 1}`;
          ativos.set(id, { versao: 1, dados });
          return { id, versao: 1 };
        },
        alterarAtivo: async (id, esperada, mudanca) => {
          const a = ativos.get(id);
          if (!a) throw new Error('sem ativo');
          if (a.versao !== esperada) throw conflitoDeVersao(a.versao);
          if ('nome' in mudanca) a.dados = mudanca;
          a.versao += 1;
          return { versao: a.versao };
        },
        abrirChamado: async () => ({ id: 'chamado-1', versao: 1 }),
        andarComOs: async (g) => ({ versao: g.versao + 1 }),
        apontarHoras: async () => ({ id: 'apontamento-1' }),
        registrarMaterial: async () => ({ id: 'material-1' }),
        registrarParada: async (g) => {
          parada.registradas += 1;
          parada.aberta = g.fim === null;
          return { id: `parada-${parada.registradas}` };
        },
        encerrarParada: async () => {
          parada.aberta = false;
        },
        liberarUh: async () => {},
        responderChecklist: async (g) => void respondidas.push(g.respostas),
      });
      guardadas.set(op.chave, resposta);
      return { repetida: false, resposta };
    },
  };
  const semCampos = (p: { nome: string; categoriaId: string | null }): DadosDeAtivo => ({
    categoriaId: p.categoriaId,
    nome: p.nome,
    fabricante: null,
    modelo: null,
    numeroSerie: null,
    dataCompra: null,
    garantiaAte: null,
    criticidade: null,
    campos: {},
  });
  const casos = criarCasosDeUsoDeSincronizacao({
    operacoes,
    ativos: {
      prepararCadastro: async (_c, p) => ({
        hotelId: 'h1',
        localId: p.localId,
        dados: semCampos(p),
      }),
      prepararAlteracao: async (_c, ativoId, p) => ({
        ativoId,
        versaoEsperada: p.versao,
        dados: semCampos(p),
      }),
    },
    execucao: {
      prepararAcao: async () => {
        throw new Error('fora deste teste');
      },
      // Como o de verdade: com a OS concluída, o registro é recusado.
      prepararApontamento: async (_c, p) => {
        if (os.concluida) throw new Conflito('transicao_invalida', 'OS concluída.');
        return { ...p, hotelId: 'h1' };
      },
      prepararMaterial: async () => {
        throw new Error('fora deste teste');
      },
      // Como os de verdade: uma parada aberta por ativo; encerrar exige a aberta.
      prepararParada: async (_c, p) => {
        if (parada.aberta) throw new Conflito('parada_ja_aberta', 'Já parado.');
        return { ...p, hotelId: 'h1', ativoId: 'a1', chamadoId: 'c1' };
      },
      prepararEncerramentoDeParada: async (_c, p) => {
        if (!parada.aberta) throw new Conflito('parada_nao_aberta', 'Não parado.');
        return { id: `parada-${parada.registradas}`, hotelId: 'h1', fim: p.fim };
      },
    },
    // Como o de verdade: valida contra a cópia e devolve as respostas decididas.
    checklists: {
      prepararRespostas: async (_c, p) => {
        const respostas = p.respostas as Record<string, unknown>;
        if ('fora' in respostas) {
          throw new RegraViolada('checklist_resposta_invalida', 'Item fora do checklist.');
        }
        return {
          checklistId: 'k1',
          osId: p.osId,
          hotelId: 'h1',
          respostas: respostas as Record<string, boolean | null>,
          feitaEm: p.feitaEm ?? new Date('2026-10-12T12:00:00Z'),
        };
      },
    },
  });
  return { casos, gravadas, guardadas, ativos, os, parada, respondidas };
}

const pedidoDeAtivo = {
  localId: 'l1',
  categoriaId: null,
  nome: 'Frigobar 101',
  fabricante: null,
  modelo: null,
  numeroSerie: null,
};

const operacao = {
  chave: CHAVE,
  tipo: 'preferencias.gravar' as const,
  dados: { idioma: 'es', formatoRegional: null, fuso: null },
};

describe('receber operação offline', () => {
  it('aplica na primeira vez e devolve a resposta guardada no reenvio, sem aplicar de novo', async () => {
    const { casos, gravadas } = montar();
    const primeira = await casos.receberOperacao(ctx, operacao);
    const reenvio = await casos.receberOperacao(ctx, operacao);
    expect(primeira).toEqual({ chave: CHAVE, repetida: false, resposta: { aplicada: true } });
    expect(reenvio).toEqual({ chave: CHAVE, repetida: true, resposta: { aplicada: true } });
    expect(gravadas).toHaveLength(1);
  });

  it('operação inválida: 422 antes de aplicar, e a chave não é guardada', async () => {
    const { casos, gravadas, guardadas } = montar();
    const invalida = {
      ...operacao,
      dados: { idioma: null, formatoRegional: null, fuso: '-03:00' },
    };
    await expect(casos.receberOperacao(ctx, invalida)).rejects.toBeInstanceOf(RegraViolada);
    expect(gravadas).toEqual([]);
    expect(guardadas.size).toBe(0);
  });

  it('ativo.cadastrar: o reenvio devolve o mesmo ativo, sem cadastrar de novo', async () => {
    const { casos, ativos } = montar();
    const op = { chave: CHAVE, tipo: 'ativo.cadastrar' as const, dados: pedidoDeAtivo };
    const primeira = await casos.receberOperacao(ctx, op);
    const reenvio = await casos.receberOperacao(ctx, op);
    expect(primeira.resposta).toEqual({ id: 'ativo-1', versao: 1 });
    expect(reenvio).toEqual({
      chave: CHAVE,
      repetida: true,
      resposta: { id: 'ativo-1', versao: 1 },
    });
    expect(ativos.size).toBe(1);
  });

  it('ativo.alterar com versão velha: conflito_de_versao, e a chave não é guardada', async () => {
    const { casos, guardadas } = montar();
    await casos.receberOperacao(ctx, {
      chave: CHAVE,
      tipo: 'ativo.cadastrar',
      dados: pedidoDeAtivo,
    });
    const alterar = (chave: string, versao: number) =>
      casos.receberOperacao(ctx, {
        chave,
        tipo: 'ativo.alterar',
        dados: { ...pedidoDeAtivo, ativoId: 'ativo-1', nome: 'Frigobar', versao },
      });
    const CHAVE2 = '0193a000-0000-4000-8000-000000000002';
    const CHAVE3 = '0193a000-0000-4000-8000-000000000003';
    expect((await alterar(CHAVE2, 1)).resposta).toEqual({ id: 'ativo-1', versao: 2 });
    await expect(alterar(CHAVE3, 1)).rejects.toMatchObject({
      codigo: 'conflito_de_versao',
      parametros: { versaoAtual: 2 },
    });
    expect(guardadas.has(CHAVE3)).toBe(false);
  });

  it('reenvio depois de o estado mudar: a resposta guardada, sem validar de novo', async () => {
    const { casos, os } = montar();
    const horas = (chave: string) =>
      casos.receberOperacao(ctx, {
        chave,
        tipo: 'os.apontar_horas',
        dados: { osId: 'os-1', inicio: '2026-09-29T08:00:00Z', fim: '2026-09-29T09:00:00Z' },
      });
    expect(await horas(CHAVE)).toMatchObject({ repetida: false });
    os.concluida = true;
    expect(await horas(CHAVE)).toEqual({
      chave: CHAVE,
      repetida: true,
      resposta: { id: 'apontamento-1' },
    });
    await expect(horas('0193a000-0000-4000-8000-000000000009')).rejects.toMatchObject({
      codigo: 'transicao_invalida',
    });
  });

  it('parada (C5): registrar e encerrar uma vez só, mesmo com reenvio', async () => {
    const { casos, parada } = montar();
    const CHAVE2 = '0193a000-0000-4000-8000-000000000002';
    const registrar = () =>
      casos.receberOperacao(ctx, {
        chave: CHAVE,
        tipo: 'os.registrar_parada',
        dados: { osId: 'os-1', inicio: '2026-09-29T08:00:00Z', fim: null },
      });
    const encerrar = () =>
      casos.receberOperacao(ctx, {
        chave: CHAVE2,
        tipo: 'os.encerrar_parada',
        dados: { osId: 'os-1', fim: '2026-09-29T10:00:00Z' },
      });
    expect((await registrar()).resposta).toEqual({ id: 'parada-1' });
    expect(await registrar()).toMatchObject({ repetida: true, resposta: { id: 'parada-1' } });
    expect(parada).toEqual({ aberta: true, registradas: 1 });
    expect((await encerrar()).resposta).toEqual({ id: 'parada-1' });
    // Reenvio com a parada já encerrada: a resposta guardada, não parada_nao_aberta.
    expect(await encerrar()).toMatchObject({ repetida: true, resposta: { id: 'parada-1' } });
    expect(parada).toEqual({ aberta: false, registradas: 1 });
  });

  it('checklist (PV1): as respostas entram uma vez só; inválida não guarda a chave', async () => {
    const { casos, guardadas, respondidas } = montar();
    const resposta = {
      chave: '0193a000-0000-4000-8000-0000000000c1',
      tipo: 'os.responder_checklist' as const,
      dados: { osId: 'os-1', respostas: { filtro_limpo: true }, feitaEm: '2026-10-12T09:00:00Z' },
    };
    const primeira = await casos.receberOperacao(ctx, resposta);
    const reenvio = await casos.receberOperacao(ctx, resposta);
    expect(primeira.resposta).toEqual({ id: 'k1', itens: 1 });
    expect(reenvio.repetida).toBe(true);
    expect(respondidas).toEqual([{ filtro_limpo: true }]);
    const invalida = {
      ...resposta,
      chave: '0193a000-0000-4000-8000-0000000000c2',
      dados: { osId: 'os-1', respostas: { fora: true } },
    };
    await expect(casos.receberOperacao(ctx, invalida)).rejects.toMatchObject({
      codigo: 'checklist_resposta_invalida',
    });
    expect(guardadas.has(invalida.chave)).toBe(false);
  });
});
