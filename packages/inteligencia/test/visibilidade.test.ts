import type { Atribuicao, ModuloContratado, Papel } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  FUSO_PADRAO_DO_GRUPO,
  PADRAO_VISIBILIDADE_TELAS,
  aberturaDasTelas,
  atribuicoesQueVeem,
  configVisibilidadeValida,
  diaNoFuso,
  diaValido,
  inicioDoDiaNoFuso,
  telasAbertas,
  validarPoliticaDoIntelligence,
  visibilidadeEfetiva,
} from '../src';

const SP = FUSO_PADRAO_DO_GRUPO;
const contrato = (inicio: string, fim: string | null = null): ModuloContratado => ({
  modulo: 'inteligencia',
  inicio: new Date(inicio),
  fim: fim === null ? null : new Date(fim),
});
const atribuicao = (papel: Papel, extra: Partial<Atribuicao> = {}): Atribuicao => ({
  id: `a-${papel}`,
  usuarioId: 'u1',
  papel,
  escopo: { tipo: 'grupo' },
  validoAte: null,
  revogadoEm: null,
  ...extra,
});

describe('visibilidade das telas (adendo ao ADR-035, 12/10/2026)', () => {
  it('o padrão: 60 dias depois da ativação, para o Admin do grupo e o Gestor CSC', () => {
    expect(PADRAO_VISIBILIDADE_TELAS).toEqual({
      aPartirDe: null,
      diasAposAtivacao: 60,
      papeis: ['admin_grupo', 'gestor_csc'],
    });
    expect(configVisibilidadeValida(PADRAO_VISIBILIDADE_TELAS)).toBe(true);
    expect(
      validarPoliticaDoIntelligence('inteligencia.visibilidade_telas', PADRAO_VISIBILIDADE_TELAS),
    ).toEqual(PADRAO_VISIBILIDADE_TELAS);
  });

  it('formato: dia do calendário, dias inteiros de 0 a 365, papéis que decidem insight', () => {
    const ok = (v: object) => configVisibilidadeValida({ ...PADRAO_VISIBILIDADE_TELAS, ...v });
    expect(ok({ aPartirDe: '2026-12-01' })).toBe(true);
    expect(ok({ diasAposAtivacao: 0 })).toBe(true);
    expect(ok({ papeis: ['gerente_hotel', 'admin_grupo', 'gestor_csc'] })).toBe(true);
    for (const v of [
      { aPartirDe: '2026-02-30' },
      { aPartirDe: '01/12/2026' },
      { aPartirDe: '' },
      { diasAposAtivacao: -1 },
      { diasAposAtivacao: 366 },
      { diasAposAtivacao: 1.5 },
      { papeis: [] },
      { papeis: ['admin_grupo', 'admin_grupo'] },
      { papeis: ['tecnico'] },
      { extra: 1 },
    ])
      expect(ok(v)).toBe(false);
    expect(configVisibilidadeValida(null)).toBe(false);
    expect(diaValido('2028-02-29')).toBe(true);
    expect(diaValido('2027-02-29')).toBe(false);
  });

  it('valor fora do formato no grupo cai para o padrão', () => {
    expect(visibilidadeEfetiva({ aPartirDe: 'x' })).toBe(PADRAO_VISIBILIDADE_TELAS);
    expect(visibilidadeEfetiva(undefined)).toBe(PADRAO_VISIBILIDADE_TELAS);
    const v = { aPartirDe: '2026-11-01', diasAposAtivacao: 60, papeis: ['admin_grupo'] };
    expect(visibilidadeEfetiva(v)).toBe(v);
  });

  it('o dia é cortado no fuso: 00:00 de Brasília é 03:00 UTC', () => {
    expect(inicioDoDiaNoFuso('2026-12-09', SP).toISOString()).toBe('2026-12-09T03:00:00.000Z');
    expect(inicioDoDiaNoFuso('2026-12-09', 'UTC').toISOString()).toBe('2026-12-09T00:00:00.000Z');
    // Fuso com horário de verão, nos dois lados da mudança.
    expect(inicioDoDiaNoFuso('2026-07-01', 'Europe/Lisbon').toISOString()).toBe(
      '2026-06-30T23:00:00.000Z',
    );
    expect(inicioDoDiaNoFuso('2026-03-29', 'Europe/Lisbon').toISOString()).toBe(
      '2026-03-29T00:00:00.000Z',
    );
    expect(diaNoFuso(new Date('2026-10-10T02:59:59Z'), SP)).toBe('2026-10-09');
    expect(diaNoFuso(new Date('2026-10-10T03:00:00Z'), SP)).toBe('2026-10-10');
  });

  it('sem data: 60 dias do dia do início do PRIMEIRO contrato, não do vigente', () => {
    const abertura = aberturaDasTelas(
      [contrato('2027-03-01T03:00:00Z'), contrato('2026-10-10T03:00:00Z', '2027-01-01T03:00:00Z')],
      PADRAO_VISIBILIDADE_TELAS,
      SP,
    );
    expect(abertura).toEqual({
      em: new Date('2026-12-09T03:00:00Z'),
      dia: '2026-12-09',
      origem: 'ativacao',
      primeiraAtivacao: new Date('2026-10-10T03:00:00Z'),
    });
  });

  it('o dia da ativação é o do fuso: ativado às 23:30 de Brasília conta daquele dia', () => {
    const abertura = aberturaDasTelas(
      [contrato('2026-10-11T02:30:00Z')],
      { ...PADRAO_VISIBILIDADE_TELAS, diasAposAtivacao: 1 },
      SP,
    );
    expect(abertura?.dia).toBe('2026-10-11');
  });

  it('com data: vale a data, antes ou depois dos 60 dias, e outro módulo não conta', () => {
    const config = { ...PADRAO_VISIBILIDADE_TELAS, aPartirDe: '2026-10-20' };
    const abertura = aberturaDasTelas([contrato('2026-10-10T03:00:00Z')], config, SP);
    expect([abertura?.em.toISOString(), abertura?.origem]).toEqual([
      '2026-10-20T03:00:00.000Z',
      'data',
    ]);
    const outro: ModuloContratado = { modulo: 'outro', inicio: new Date(0), fim: null };
    expect(aberturaDasTelas([outro], PADRAO_VISIBILIDADE_TELAS, SP)).toBeNull();
  });

  it('abre no instante da abertura, não antes', () => {
    const abertura = aberturaDasTelas(
      [contrato('2026-10-10T03:00:00Z')],
      PADRAO_VISIBILIDADE_TELAS,
      SP,
    );
    expect(telasAbertas(abertura, new Date('2026-12-09T02:59:59Z'))).toBe(false);
    expect(telasAbertas(abertura, new Date('2026-12-09T03:00:00Z'))).toBe(true);
    expect(telasAbertas(null, new Date('2030-01-01'))).toBe(false);
  });

  it('só as atribuições vigentes dos papéis da política', () => {
    const agora = new Date('2026-12-10T12:00:00Z');
    const minhas = [
      atribuicao('gerente_hotel'),
      atribuicao('gestor_csc'),
      atribuicao('admin_grupo', { revogadoEm: new Date('2026-12-01') }),
    ];
    expect(
      atribuicoesQueVeem(minhas, PADRAO_VISIBILIDADE_TELAS, agora).map((a) => a.papel),
    ).toEqual(['gestor_csc']);
  });
});
