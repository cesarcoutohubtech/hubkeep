import { describe, expect, it } from 'vitest';
import { podeVerImplantacao, resumirImplantacao } from '../src/implantacao';
import type { Atribuicao } from '../src/index';

const AGORA = new Date('2026-09-27T12:00:00Z');
const H1 = 'h1';
let seq = 0;
const atr = (
  usuarioId: string,
  papel: Atribuicao['papel'],
  hotelId: string | null,
  extra: Partial<Atribuicao> = {},
): Atribuicao => ({
  id: `a${++seq}`,
  usuarioId,
  papel,
  escopo: hotelId ? { tipo: 'hotel', hotelId } : { tipo: 'grupo' },
  validoAte: null,
  revogadoEm: null,
  ...extra,
});

describe('painel de implantação (A5)', () => {
  it('quem vê: Admin e Implantador vigente do hotel', () => {
    const futuro = new Date('2026-12-31T00:00:00Z');
    const passado = new Date('2026-09-01T00:00:00Z');
    expect(podeVerImplantacao([atr('u', 'admin_grupo', null)], H1, AGORA).permitido).toBe(true);
    expect(
      podeVerImplantacao([atr('u', 'implantador', H1, { validoAte: futuro })], H1, AGORA).permitido,
    ).toBe(true);
    for (const minhas of [
      [atr('u', 'implantador', H1, { validoAte: passado })],
      [atr('u', 'implantador', 'h2', { validoAte: futuro })],
      [atr('u', 'gerente_hotel', H1)],
    ]) {
      const r = podeVerImplantacao(minhas, H1, AGORA);
      expect(r.permitido ? 'ok' : r.erro.codigo).toBe('implantacao_fora_do_escopo');
    }
  });

  it('hotel vazio: faltam locais, gerente e técnico', () => {
    expect(resumirImplantacao(H1, [], [], AGORA).pendencias).toEqual([
      'sem_locais',
      'sem_gerente',
      'sem_tecnico',
    ]);
  });

  it('conta locais e papéis vigentes no hotel; aponta quem ficou sem papel', () => {
    const r = resumirImplantacao(
      H1,
      [
        { id: 'l1', tipo: 'uh', status: 'ativo' },
        { id: 'l2', tipo: 'uh', status: 'ativo' },
        { id: 'l3', tipo: 'uh', status: 'pendente_licenca' },
        { id: 'l4', tipo: 'area_comum', status: 'ativo' },
        { id: 'l5', tipo: 'uh', status: 'inativo' },
      ],
      [
        {
          usuarioId: 'g',
          nome: 'Gerente',
          ativo: true,
          atribuicoes: [atr('g', 'gerente_hotel', H1)],
        },
        {
          usuarioId: 't',
          nome: 'Técnico',
          ativo: true,
          atribuicoes: [atr('t', 'tecnico', H1), atr('t', 'solicitante', H1)],
        },
        {
          usuarioId: 'r',
          nome: 'Revogado',
          ativo: true,
          atribuicoes: [atr('r', 'tecnico', H1, { revogadoEm: new Date('2026-09-20T00:00:00Z') })],
        },
        { usuarioId: 'i', nome: 'Inativo', ativo: false, atribuicoes: [atr('i', 'tecnico', H1)] },
        {
          usuarioId: 'o',
          nome: 'Outro hotel',
          ativo: true,
          atribuicoes: [atr('o', 'tecnico', 'h2')],
        },
        {
          usuarioId: 'a',
          nome: 'Admin',
          ativo: true,
          atribuicoes: [atr('a', 'admin_grupo', null)],
        },
      ],
      AGORA,
      [
        { localId: 'l1', categoriaId: 'c1', ativo: true },
        { localId: 'l2', categoriaId: 'c1', ativo: true },
        { localId: 'l3', categoriaId: 'c1', ativo: true },
        { localId: 'l4', categoriaId: 'c1', ativo: true },
      ],
    );
    expect(r.locais).toEqual({ uhsAtivas: 2, uhsPendentes: 1, areasComuns: 1, inativos: 1 });
    expect(r.ativos).toEqual({ ativos: 4, semCategoria: 0, locaisSemAtivo: 0 });
    expect(r.papeis).toEqual([
      { papel: 'gerente_hotel', pessoas: 1 },
      { papel: 'solicitante', pessoas: 1 },
      { papel: 'tecnico', pessoas: 1 },
    ]);
    expect(r.pessoasSemPapelVigente.map((p) => p.nome)).toEqual(['Revogado', 'Inativo']);
    expect(r.pendencias).toEqual(['uhs_pendentes_de_licenca', 'pessoas_sem_papel_vigente']);
  });

  it('locais sem ativo e ativos sem categoria (B3): desativado não conta', () => {
    const r = resumirImplantacao(
      H1,
      [
        { id: 'l1', tipo: 'uh', status: 'ativo' },
        { id: 'l2', tipo: 'area_comum', status: 'ativo' },
        { id: 'l3', tipo: 'uh', status: 'inativo' },
      ],
      [],
      AGORA,
      [
        { localId: 'l1', categoriaId: null, ativo: true },
        { localId: 'l2', categoriaId: null, ativo: false },
      ],
    );
    expect(r.ativos).toEqual({ ativos: 1, semCategoria: 1, locaisSemAtivo: 1 });
    expect(r.pendencias).toEqual([
      'locais_sem_ativo',
      'ativos_sem_categoria',
      'sem_gerente',
      'sem_tecnico',
    ]);
  });
});
