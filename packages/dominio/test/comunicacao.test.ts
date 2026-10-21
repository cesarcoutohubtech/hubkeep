// Comunicação (1c, item 5; ADR-046): quem recebe o aviso e o que fica
// registrado antes do envio.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  CANAIS_DE_ENVIO,
  LIMITE_DE_ENVIOS_POR_DIA,
  SITUACOES_DE_ENVIO,
  inscricaoExpirou,
  pessoasDoAviso,
  situacaoAntesDoEnvio,
  situacaoAntesDoPush,
} from '../src';

const agora = new Date('2026-10-13T12:00:00Z');
const HOTEL = { id: 'h1', bandeiraId: 'b1' };
const atr = (
  usuarioId: string,
  papel: Atribuicao['papel'],
  escopo: Atribuicao['escopo'],
  extra: Partial<Atribuicao> = {},
): Atribuicao => ({
  id: `${usuarioId}-${papel}`,
  usuarioId,
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
  ...extra,
});

const ATRIBUICOES: Atribuicao[] = [
  atr('gerente', 'gerente_hotel', { tipo: 'hotel', hotelId: 'h1' }),
  atr('gerente-h2', 'gerente_hotel', { tipo: 'hotel', hotelId: 'h2' }),
  atr('gestor-bandeira', 'gestor_csc', { tipo: 'bandeira', bandeiraId: 'b1' }),
  atr('gestor-outra', 'gestor_csc', { tipo: 'bandeira', bandeiraId: 'b2' }),
  atr('admin', 'admin_grupo', { tipo: 'grupo' }),
  atr('gerente-revogado', 'gerente_hotel', { tipo: 'hotel', hotelId: 'h1' }, { revogadoEm: agora }),
  atr(
    'gerente-vencido',
    'gerente_hotel',
    { tipo: 'hotel', hotelId: 'h1' },
    {
      validoAte: new Date('2026-10-01T00:00:00Z'),
    },
  ),
  atr('tecnico', 'tecnico', { tipo: 'hotel', hotelId: 'h1' }),
];

describe('valores canônicos', () => {
  it('canais, situações e o limite do C8', () => {
    expect([...CANAIS_DE_ENVIO]).toEqual(['email', 'push']);
    expect([...SITUACOES_DE_ENVIO]).toEqual(['enviado', 'sem_provedor', 'sem_endereco', 'falhou']);
    expect(LIMITE_DE_ENVIOS_POR_DIA).toBe(30);
  });
});

describe('pessoasDoAviso', () => {
  const base = { atribuicoes: ATRIBUICOES, hotel: HOTEL, agora };

  it('os papéis pelas atribuições vigentes que cobrem o hotel', () => {
    expect(
      pessoasDoAviso({
        ...base,
        destinatarios: ['gerente_hotel', 'gestor_csc', 'admin_grupo'],
        responsavelDaOs: null,
      }),
    ).toEqual(['admin', 'gerente', 'gestor-bandeira']);
  });

  it('o responsável da OS: o Técnico, ou os membros da equipe; sem OS, ninguém', () => {
    expect(
      pessoasDoAviso({
        ...base,
        destinatarios: ['responsavel_da_os'],
        responsavelDaOs: { tipo: 'tecnico', usuarioId: 'tecnico' },
      }),
    ).toEqual(['tecnico']);
    expect(
      pessoasDoAviso({
        ...base,
        destinatarios: ['responsavel_da_os'],
        responsavelDaOs: { tipo: 'equipe', membros: ['m2', 'm1'] },
      }),
    ).toEqual(['m1', 'm2']);
    expect(
      pessoasDoAviso({ ...base, destinatarios: ['responsavel_da_os'], responsavelDaOs: null }),
    ).toEqual([]);
  });

  it('a mesma pessoa em dois papéis recebe uma vez', () => {
    expect(
      pessoasDoAviso({
        ...base,
        atribuicoes: [...ATRIBUICOES, atr('gerente', 'gestor_csc', { tipo: 'grupo' })],
        destinatarios: ['responsavel_da_os', 'gerente_hotel', 'gestor_csc'],
        responsavelDaOs: { tipo: 'tecnico', usuarioId: 'gerente' },
      }),
    ).toEqual(['gerente', 'gestor-bandeira']);
  });
});

describe('situacaoAntesDoEnvio', () => {
  it('sem endereço antes de sem provedor; com os dois, envia', () => {
    expect(situacaoAntesDoEnvio({ membroAtivo: false, email: 'a@x', comProvedor: true })).toBe(
      'sem_endereco',
    );
    expect(situacaoAntesDoEnvio({ membroAtivo: true, email: null, comProvedor: false })).toBe(
      'sem_endereco',
    );
    expect(situacaoAntesDoEnvio({ membroAtivo: true, email: 'a@x', comProvedor: false })).toBe(
      'sem_provedor',
    );
    expect(situacaoAntesDoEnvio({ membroAtivo: true, email: 'a@x', comProvedor: true })).toBeNull();
  });
});

describe('push (C4)', () => {
  it('sem inscrição ou fora do tenant, sem endereço; sem chaves VAPID, sem provedor', () => {
    expect(situacaoAntesDoPush({ membroAtivo: true, inscricoes: 0, comProvedor: true })).toBe(
      'sem_endereco',
    );
    expect(situacaoAntesDoPush({ membroAtivo: false, inscricoes: 2, comProvedor: true })).toBe(
      'sem_endereco',
    );
    expect(situacaoAntesDoPush({ membroAtivo: true, inscricoes: 1, comProvedor: false })).toBe(
      'sem_provedor',
    );
    expect(situacaoAntesDoPush({ membroAtivo: true, inscricoes: 1, comProvedor: true })).toBeNull();
  });

  it('só 404 e 410 revogam a inscrição', () => {
    expect([404, 410].map(inscricaoExpirou)).toEqual([true, true]);
    expect([400, 401, 413, 429, 500].map(inscricaoExpirou)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});
