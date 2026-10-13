// O contrato da fila do dia com a OS preventiva (PV3, ADR-041): o chamado é
// anulável e entra a preventiva; a consulta preventiva=1 diz que o PWA a
// entende. O item corretivo da API anterior à PV3 continua válido.
import { describe, expect, it } from 'vitest';
import { ConsultaDaFilaDoDia, OsDoDiaApi } from '../src/index';

const ID = '0a100000-0000-4000-8000-000000000001';
const base = {
  id: ID,
  hotelId: ID,
  estado: 'atribuida',
  situacaoId: ID,
  responsavel: { tipo: 'tecnico', usuarioId: ID },
  motivoReabertura: null,
  versao: 1,
  criadoEm: '2026-10-13T08:00:00.000Z',
};
const CHAMADO = {
  id: ID,
  descricao: 'Ar-condicionado pingando',
  localId: ID,
  localNome: 'UH 101',
  prioridadeId: ID,
  estado: 'em_execucao',
  ativoId: null,
  paradoDesde: null,
  paradaDoChamado: false,
  uhIndisponivelDesde: null,
};
const PREVENTIVA = {
  planoId: ID,
  planoNome: 'PMOC mensal',
  dataPrevista: '2026-10-13',
  ativoId: ID,
  ativoNome: 'Split 12.000 BTU',
  localId: ID,
  localNome: 'UH 101',
  localEdificacao: null,
};

describe('OsDoDiaApi com a OS preventiva (PV3)', () => {
  it('o item corretivo da API anterior, sem preventiva, continua válido', () => {
    expect(OsDoDiaApi.safeParse({ ...base, chamado: CHAMADO }).success).toBe(true);
  });

  it('a OS preventiva vem sem chamado, com o plano, a data prevista, o ativo e o local', () => {
    const lida = OsDoDiaApi.parse({ ...base, chamado: null, preventiva: PREVENTIVA });
    expect(lida.chamado).toBeNull();
    expect(lida.preventiva?.dataPrevista).toBe('2026-10-13');
  });

  it('a data prevista é um dia (AAAA-MM-DD), não um instante', () => {
    const comInstante = { ...PREVENTIVA, dataPrevista: '2026-10-13T00:00:00Z' };
    expect(OsDoDiaApi.safeParse({ ...base, chamado: null, preventiva: comInstante }).success).toBe(
      false,
    );
  });
});

describe('ConsultaDaFilaDoDia', () => {
  it('sem nada, ou com preventiva=1', () => {
    expect(ConsultaDaFilaDoDia.parse({})).toEqual({});
    expect(ConsultaDaFilaDoDia.parse({ preventiva: '1' })).toEqual({ preventiva: '1' });
  });

  it('outro valor de preventiva é entrada inválida', () => {
    expect(ConsultaDaFilaDoDia.safeParse({ preventiva: 'true' }).success).toBe(false);
  });
});
