// Página da OS (PV3c): a id que não é UUID é 404 no servidor; a válida vai
// para a tela, que lê a OS pela API no navegador.
import { describe, expect, it, vi } from 'vitest';
import Os from '../src/app/(painel)/os/[id]/page';
import { TelaDaOs } from '../src/app/(painel)/os/[id]/tela';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const ID = '55555555-5555-4555-8555-555555555555';

describe('página da OS', () => {
  const abrir = (id: string) => Os({ params: Promise.resolve({ id }) });

  it('entrega a id à tela', async () => {
    const el = await abrir(ID);
    expect(el.type).toBe(TelaDaOs);
    expect(el.props).toEqual({ id: ID });
  });

  it('a id que não é UUID é 404', async () => {
    await expect(abrir('nao-e-uuid')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
