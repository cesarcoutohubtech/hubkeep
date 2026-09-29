// QR individual do ativo no web (B5): o endereço impresso é o do PWA com
// /q/<codigo>, e o SVG sai da matriz calculada no navegador.
import { describe, expect, it } from 'vitest';
import { caminhoSvgDoQr, enderecoDoQr } from '../src/cliente/QrDoAtivo';

describe('QR do ativo', () => {
  it('monta o endereço do PWA com o código, sem barra dobrada', () => {
    expect(enderecoDoQr('https://tecnico.hubkeep.com.br/', '7K3M9QX2AB')).toBe(
      'https://tecnico.hubkeep.com.br/q/7K3M9QX2AB',
    );
    expect(enderecoDoQr('http://localhost:5173', '7K3M9QX2AB')).toBe(
      'http://localhost:5173/q/7K3M9QX2AB',
    );
  });

  it('gera um QR quadrado com módulos escuros, igual para o mesmo endereço', () => {
    const a = caminhoSvgDoQr('https://tecnico.hubkeep.com.br/q/7K3M9QX2AB');
    expect(a.lado).toBeGreaterThanOrEqual(21 + 4);
    expect(a.d).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(caminhoSvgDoQr('https://tecnico.hubkeep.com.br/q/7K3M9QX2AB')).toEqual(a);
    expect(caminhoSvgDoQr('https://tecnico.hubkeep.com.br/q/ZZZZZZZZZZ').d).not.toBe(a.d);
  });
});
