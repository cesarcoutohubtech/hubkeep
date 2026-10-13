// Auditoria geral (fase 1c; decisões 12 a 14 do Cesar de 13/10/2026): quem tem
// a tela, o período de até 92 dias, o cursor com os microssegundos e o detalhe
// que fica fora, como no histórico por registro.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  type Papel,
  escreverCursorDaAuditoria,
  lerCursorDaAuditoria,
  mudancasDaLinhaDeAuditoria,
  podeVerAuditoriaGeral,
  validarPeriodoDaAuditoria,
} from '../src/index';

const AGORA = new Date('2026-10-13T12:00:00Z');
const atribuicao = (papel: Papel, extra: Partial<Atribuicao> = {}): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel,
  escopo: papel === 'admin_grupo' ? { tipo: 'grupo' } : { tipo: 'hotel', hotelId: 'h' },
  validoAte: null,
  revogadoEm: null,
  ...extra,
});

describe('quem tem a auditoria geral (decisão 12)', () => {
  it('a gestão: Admin do grupo, Gestor CSC e Gerente do hotel', () => {
    for (const papel of ['admin_grupo', 'gestor_csc', 'gerente_hotel'] as const) {
      expect(podeVerAuditoriaGeral([atribuicao(papel)], AGORA).permitido).toBe(true);
    }
  });

  it('os outros papéis, e a gestão revogada ou vencida, não', () => {
    for (const papel of ['tecnico', 'solicitante', 'implantador', 'proprietario'] as const) {
      const r = podeVerAuditoriaGeral([atribuicao(papel)], AGORA);
      expect(r.permitido).toBe(false);
      if (!r.permitido) expect(r.erro.codigo).toBe('auditoria_sem_permissao');
    }
    expect(
      podeVerAuditoriaGeral([atribuicao('gerente_hotel', { revogadoEm: AGORA })], AGORA).permitido,
    ).toBe(false);
    expect(
      podeVerAuditoriaGeral(
        [atribuicao('gestor_csc', { validoAte: new Date('2026-10-12T00:00:00Z') })],
        AGORA,
      ).permitido,
    ).toBe(false);
  });
});

describe('período da consulta (decisão 13)', () => {
  const de = new Date('2026-07-01T03:00:00Z');
  it('até 92 dias, com o fim depois do início', () => {
    expect(() =>
      validarPeriodoDaAuditoria(de, new Date(de.getTime() + 92 * 86_400_000)),
    ).not.toThrow();
    for (const ate of [
      de,
      new Date(de.getTime() - 1),
      new Date(de.getTime() + 92 * 86_400_000 + 1),
    ]) {
      expect(() => validarPeriodoDaAuditoria(de, ate)).toThrow(
        expect.objectContaining({
          codigo: 'auditoria_periodo_invalido',
          parametros: { maximoDias: 92 },
        }),
      );
    }
    expect(() => validarPeriodoDaAuditoria(new Date('x'), de)).toThrow(
      expect.objectContaining({ codigo: 'auditoria_periodo_invalido' }),
    );
  });
});

describe('cursor', () => {
  const c = { em: '2026-10-13T12:00:00.123456Z', id: '0193a000-0000-4000-8000-000000000001' };
  it('vai e volta com os microssegundos', () => {
    expect(lerCursorDaAuditoria(escreverCursorDaAuditoria(c))).toEqual(c);
    expect(lerCursorDaAuditoria(`${c.em}~${c.id.toUpperCase()}`)).toEqual(c);
  });
  it('texto fora do formato é recusado', () => {
    for (const texto of [
      '',
      'x',
      `2026-10-13T12:00:00.123Z~${c.id}`,
      `${c.em}~nao-e-uuid`,
      `${c.em}${c.id}`,
      `2026-13-45T12:00:00.123456Z~${c.id}`,
    ]) {
      expect(() => lerCursorDaAuditoria(texto)).toThrow(
        expect.objectContaining({ codigo: 'auditoria_cursor_invalido' }),
      );
    }
  });
});

describe('o que a linha mostra', () => {
  it('as mudanças, como no histórico, menos o detalhe da ativação bloqueada', () => {
    expect(
      mudancasDaLinhaDeAuditoria('politica', 'gravar', null, { chave: 'os.x', valor: true }),
    ).toEqual([
      { campo: 'chave', chave: null, antes: null, depois: 'os.x' },
      { campo: 'valor', chave: null, antes: null, depois: true },
    ]);
    expect(
      mudancasDaLinhaDeAuditoria('hotel', 'ativacao_bloqueada_sem_saldo', null, { emUso: 40 }),
    ).toEqual([]);
  });
});
