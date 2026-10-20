// Consultas da corretiva (C7): o filtro chega à porta, a página tem o tamanho
// do domínio e o cursor, o período inválido para antes do banco, e o chamado
// fora do escopo dá 404 (a linha do tempo não é lida).
import {
  type FiltroDaLista,
  LIMITES_DA_EXPORTACAO_DA_LISTA,
  TAMANHO_DA_PAGINA,
} from '@hubkeep/dominio';
import { describe, expect, it, vi } from 'vitest';
import { criarCasosDeUsoDeConsultas } from '../src/casos-de-uso/consultas';
import type { ChamadoResumido, PortaConsultasDaCorretiva } from '../src/portas/consultas';

const ctx = { usuarioId: 'u1', tenantId: 't1' };
const chamado = (i: number): ChamadoResumido => ({
  id: `c${String(i).padStart(3, '0')}`,
  hotelId: 'h1',
  hotelNome: 'Hotel',
  localId: 'l1',
  localNome: 'UH 101',
  ativoId: null,
  ativoNome: null,
  descricao: 'Pinga',
  estado: 'aberto',
  situacaoId: 's1',
  prioridadeId: 'p1',
  criadoEm: new Date('2026-09-30T12:00:00Z'),
});

function porta(total: number) {
  const todos = Array.from({ length: total }, (_, i) => chamado(total - i));
  const p: PortaConsultasDaCorretiva = {
    chamados: vi.fn(async (_c, _f: FiltroDaLista, limite: number) => todos.slice(0, limite)),
    os: vi.fn(async () => []),
    nomesDoChamado: vi.fn(async (_c, id: string) =>
      id === 'visivel'
        ? {
            hotel: 'Hotel',
            local: null,
            localTipo: null,
            ativo: null,
            pessoas: {},
            equipes: {},
            fornecedores: {},
          }
        : null,
    ),
    nomesDaOs: vi.fn(async (_c, id: string) =>
      id === 'os-visivel'
        ? {
            hotel: 'Hotel',
            local: 'Casa de máquinas',
            localTipo: 'area_comum' as const,
            ativo: 'Chiller',
            pessoas: {},
            equipes: {},
            fornecedores: {},
          }
        : null,
    ),
    linhaDoTempo: vi.fn(async () => []),
  };
  return p;
}

describe('consultas da corretiva (C7)', () => {
  it('passa o filtro à porta, com as datas, e pede um a mais que a página', async () => {
    const p = porta(3);
    const uc = criarCasosDeUsoDeConsultas({ consultas: p });
    const r = await uc.listarChamados(ctx, {
      hotelId: 'h1',
      prioridadeId: 'p1',
      de: '2026-09-01T03:00:00.000Z',
      ate: '2026-10-01T03:00:00.000Z',
    });
    expect(p.chamados).toHaveBeenCalledWith(
      ctx,
      {
        hotelId: 'h1',
        situacaoId: null,
        prioridadeId: 'p1',
        de: new Date('2026-09-01T03:00:00.000Z'),
        ate: new Date('2026-10-01T03:00:00.000Z'),
        depoisDe: null,
        doLocador: false,
      },
      TAMANHO_DA_PAGINA + 1,
    );
    expect(r).toEqual({ itens: expect.any(Array), proximo: null });
    expect(r.itens).toHaveLength(3);
  });

  it('a lista de OS passa o filtro "do locador" à porta (1c, ADR-045)', async () => {
    const p = porta(1);
    const uc = criarCasosDeUsoDeConsultas({ consultas: p });
    await uc.listarOs(ctx, { doLocador: true });
    expect(p.os).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ doLocador: true }),
      TAMANHO_DA_PAGINA + 1,
    );
  });

  it('a exportação da lista de chamados pede 1.000 por página (1c, item 9)', async () => {
    const p = porta(TAMANHO_DA_PAGINA + 5);
    const uc = criarCasosDeUsoDeConsultas({ consultas: p });
    const r = await uc.listarChamados(ctx, { exportacao: true });
    expect(p.chamados).toHaveBeenCalledWith(
      ctx,
      expect.any(Object),
      LIMITES_DA_EXPORTACAO_DA_LISTA.porPagina + 1,
    );
    expect(r.itens).toHaveLength(TAMANHO_DA_PAGINA + 5);
    expect(r.proximo).toBeNull();
  });

  it('com mais que a página: devolve a página e o id do último como próximo', async () => {
    const uc = criarCasosDeUsoDeConsultas({ consultas: porta(TAMANHO_DA_PAGINA + 5) });
    const r = await uc.listarChamados(ctx, {});
    expect(r.itens).toHaveLength(TAMANHO_DA_PAGINA);
    expect(r.proximo).toBe(r.itens.at(-1)?.id);
  });

  it('período invertido: 422 periodo_invalido, sem ler o banco', async () => {
    const p = porta(1);
    const uc = criarCasosDeUsoDeConsultas({ consultas: p });
    for (const listar of [uc.listarChamados, uc.listarOs])
      await expect(
        listar(ctx, { de: '2026-10-01T00:00:00Z', ate: '2026-09-01T00:00:00Z' }),
      ).rejects.toMatchObject({ codigo: 'periodo_invalido' });
    expect(p.chamados).not.toHaveBeenCalled();
    expect(p.os).not.toHaveBeenCalled();
  });

  it('chamado fora do escopo: 404 nos nomes e na linha do tempo, que não é lida', async () => {
    const p = porta(1);
    const uc = criarCasosDeUsoDeConsultas({ consultas: p });
    await expect(uc.nomesDoChamado(ctx, 'outro')).rejects.toMatchObject({
      codigo: 'chamado_nao_encontrado',
    });
    await expect(uc.linhaDoTempo(ctx, 'outro')).rejects.toMatchObject({
      codigo: 'chamado_nao_encontrado',
    });
    expect(p.linhaDoTempo).not.toHaveBeenCalled();
    await expect(uc.linhaDoTempo(ctx, 'visivel')).resolves.toEqual([]);
  });
});

describe('nomes da página da OS (PV3c)', () => {
  it('os nomes da OS visível; a invisível é 404 os_nao_encontrada', async () => {
    const uc = criarCasosDeUsoDeConsultas({ consultas: porta(0) });
    await expect(uc.nomesDaOs(ctx, 'os-visivel')).resolves.toMatchObject({
      local: 'Casa de máquinas',
      ativo: 'Chiller',
    });
    await expect(uc.nomesDaOs(ctx, 'outra')).rejects.toMatchObject({
      codigo: 'os_nao_encontrada',
    });
  });
});
