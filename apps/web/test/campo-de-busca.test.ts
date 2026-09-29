import { describe, expect, it } from 'vitest';
import { comBusca } from '../src/cliente/CampoDeBusca';

describe('comBusca (B6)', () => {
  it('sem termo, o caminho como está', () => {
    expect(comBusca('/api/v1/hoteis/h/ativos', '')).toBe('/api/v1/hoteis/h/ativos');
  });

  it('com termo, em ?busca= e codificado', () => {
    expect(comBusca('/api/v1/hoteis/h/locais', 'Café & chá')).toBe(
      '/api/v1/hoteis/h/locais?busca=Caf%C3%A9%20%26%20ch%C3%A1',
    );
  });
});
