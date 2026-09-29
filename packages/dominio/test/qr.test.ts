import { describe, expect, it } from 'vitest';
import {
  ALFABETO_DO_QR,
  TAMANHO_DO_CODIGO_QR,
  caminhoDoQr,
  codigoQrDeBytes,
  lerCodigoQr,
} from '../src/qr';

describe('codigoQrDeBytes', () => {
  it('gera 10 caracteres do alfabeto, um por byte', () => {
    const bytes = Uint8Array.from([0, 1, 2, 31, 32, 33, 255, 128, 64, 10]);
    const codigo = codigoQrDeBytes(bytes);
    expect(codigo).toHaveLength(TAMANHO_DO_CODIGO_QR);
    expect(codigo).toBe('012Z01Z00A');
    expect([...codigo].every((c) => ALFABETO_DO_QR.includes(c))).toBe(true);
  });

  it('o alfabeto tem 32 caracteres, sem I, L, O e U', () => {
    expect(ALFABETO_DO_QR).toHaveLength(32);
    expect(ALFABETO_DO_QR).not.toMatch(/[ILOU]/);
  });

  it('recusa bytes de menos', () => {
    expect(() => codigoQrDeBytes(new Uint8Array(9))).toThrow();
  });
});

describe('lerCodigoQr', () => {
  it('aceita o código como gravado', () => {
    expect(lerCodigoQr('7K3M9QX2AB')).toBe('7K3M9QX2AB');
  });

  it('aceita minúsculas, hífens e espaços, e troca O, I e L', () => {
    expect(lerCodigoQr(' 7k3m-9qx2-ab ')).toBe('7K3M9QX2AB');
    expect(lerCodigoQr('OOIIL12345')).toBe('0011112345');
  });

  it('recusa tamanho errado e caracteres fora do alfabeto', () => {
    expect(lerCodigoQr('7K3M9QX2A')).toBeNull();
    expect(lerCodigoQr('7K3M9QX2ABC')).toBeNull();
    expect(lerCodigoQr('7K3M9QX2AU')).toBeNull();
    expect(lerCodigoQr('../../x')).toBeNull();
    expect(lerCodigoQr('')).toBeNull();
  });
});

describe('caminhoDoQr', () => {
  it('é relativo ao endereço do PWA', () => {
    expect(caminhoDoQr('7K3M9QX2AB')).toBe('/q/7K3M9QX2AB');
  });
});
