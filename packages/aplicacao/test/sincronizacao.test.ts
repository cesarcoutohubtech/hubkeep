// Operações offline (F0-11, ADR-025) com a porta em memória: validação antes
// de aplicar e aplicação uma vez só por chave.
import { type Contexto, RegraViolada } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
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
  const operacoes: PortaOperacoesOffline = {
    async aplicarUmaVez(_c, op, efeito) {
      const antes = guardadas.get(op.chave);
      if (antes) return { repetida: true, resposta: antes };
      const resposta = await efeito({ gravarPreferencias: async (p) => void gravadas.push(p) });
      guardadas.set(op.chave, resposta);
      return { repetida: false, resposta };
    },
  };
  return { casos: criarCasosDeUsoDeSincronizacao({ operacoes }), gravadas, guardadas };
}

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
});
