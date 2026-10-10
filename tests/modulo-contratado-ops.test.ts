// Argumentos do script de módulos contratados (scripts/ops/modulo-contratado.ts),
// sem conexão: o pedido sai conferido pelas regras do domínio antes de o
// script abrir a conexão do backoffice.
import { describe, expect, it } from 'vitest';
import { lerPedidoDeModulo, uuidV7 } from '../scripts/ops/modulos.ts';

const T = '0193a000-0000-4000-8000-000000000001';
const base = ['--ambiente', 'dev', '--tenant', T];
const gravar = (...resto: string[]) =>
  lerPedidoDeModulo([...base, '--modulo', 'inteligencia', '--por', 'Cesar', ...resto]);

describe('lerPedidoDeModulo', () => {
  it('sem --modulo, lista', () => {
    expect(lerPedidoDeModulo(base)).toEqual({ acao: 'listar', tenant: T });
  });

  it('com --modulo, grava; sem --fim, sem prazo', () => {
    expect(gravar('--inicio', '2026-10-10T00:00:00-03:00')).toEqual({
      acao: 'gravar',
      tenant: T,
      modulo: 'inteligencia',
      inicio: new Date('2026-10-10T03:00:00Z'),
      fim: null,
      por: 'Cesar',
    });
    expect(
      gravar('--inicio', '2026-10-10T00:00:00Z', '--fim', '2027-10-10T00:00:00Z'),
    ).toMatchObject({ fim: new Date('2027-10-10T00:00:00Z') });
  });

  it.each([
    ['tenant fora do formato', ['--ambiente', 'dev', '--tenant', 'grupo']],
    ['sem tenant', ['--ambiente', 'dev']],
    ['vigência sem módulo', [...base, '--inicio', '2026-10-10T00:00:00Z']],
    ['módulo desconhecido', [...base, '--modulo', 'outro', '--inicio', '2026-10-10T00:00:00Z']],
    ['sem início', [...base, '--modulo', 'inteligencia', '--por', 'Cesar']],
    [
      'início sem fuso',
      [...base, '--modulo', 'inteligencia', '--inicio', '2026-10-10T00:00:00', '--por', 'Cesar'],
    ],
    [
      'início só com a data',
      [...base, '--modulo', 'inteligencia', '--inicio', '2026-10-10', '--por', 'Cesar'],
    ],
    [
      'fim antes do início',
      [
        ...base,
        '--modulo',
        'inteligencia',
        '--inicio',
        '2026-10-10T00:00:00Z',
        '--fim',
        '2026-10-01T00:00:00Z',
        '--por',
        'Cesar',
      ],
    ],
    ['sem --por', [...base, '--modulo', 'inteligencia', '--inicio', '2026-10-10T00:00:00Z']],
    [
      '--por sem valor',
      [
        ...base,
        '--modulo',
        'inteligencia',
        '--inicio',
        '2026-10-10T00:00:00Z',
        '--por',
        '--dry-run',
      ],
    ],
  ])('recusa: %s', (_caso, argv) => {
    expect(() => lerPedidoDeModulo(argv)).toThrow(Error);
  });
});

describe('uuidV7', () => {
  it('versão 7, variante RFC e o tempo nos primeiros 48 bits', () => {
    const id = uuidV7(0x0193a0000000, new Uint8Array(10).fill(0xff));
    expect(id).toBe('0193a000-0000-7fff-bfff-ffffffffffff');
    expect(uuidV7()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
