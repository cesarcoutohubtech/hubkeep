// Operações offline (F0-11, ADR-025) com a porta em memória: validação antes
// de aplicar e aplicação uma vez só por chave; ativos (B3) sem duplicar no
// reenvio e com o conflito de versão recusado sem guardar a chave.
import { type Contexto, RegraViolada, conflitoDeVersao } from '@hubkeep/dominio';
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
  const operacoes: PortaOperacoesOffline = {
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
  });
  return { casos, gravadas, guardadas, ativos };
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
});
