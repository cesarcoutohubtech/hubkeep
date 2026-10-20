import { describe, expect, it } from 'vitest';
import {
  META_DA_IMPLANTACAO_MS,
  podeVerImplantacao,
  resumirImplantacao,
  tempoDaImplantacao,
} from '../src/implantacao';
import type { Atribuicao } from '../src/index';

const AGORA = new Date('2026-09-27T12:00:00Z');
const H1 = 'h1';
let seq = 0;
const semModelo = (id: string) => ({
  id,
  modeloId: null,
  sugestaoDescartada: false,
  cadastroPendente: false,
});
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

  it('hotel vazio: faltam o modelo contratual, locais, gerente e técnico', () => {
    expect(resumirImplantacao(H1, [], [], AGORA).pendencias).toEqual([
      'modelo_contratual_nao_informado',
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
        { ...semModelo('a-l1'), localId: 'l1', categoriaId: 'c1', ativo: true },
        { ...semModelo('a-l2'), localId: 'l2', categoriaId: 'c1', ativo: true },
        { ...semModelo('a-l3'), localId: 'l3', categoriaId: 'c1', ativo: true },
        { ...semModelo('a-l4'), localId: 'l4', categoriaId: 'c1', ativo: true },
      ],
      { modeloContratual: 'administrado' },
    );
    expect(r.locais).toEqual({ uhsAtivas: 2, uhsPendentes: 1, areasComuns: 1, inativos: 1 });
    expect(r.ativos).toEqual({
      ativos: 4,
      semCategoria: 0,
      locaisSemAtivo: 0,
      comModeloSemPlano: 0,
    });
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
        { ...semModelo('a-l1'), localId: 'l1', categoriaId: null, ativo: true },
        { ...semModelo('a-l2'), localId: 'l2', categoriaId: null, ativo: false },
      ],
      { modeloContratual: 'proprio' },
    );
    expect(r.ativos).toEqual({
      ativos: 1,
      semCategoria: 1,
      locaisSemAtivo: 1,
      comModeloSemPlano: 0,
    });
    expect(r.pendencias).toEqual([
      'locais_sem_ativo',
      'ativos_sem_categoria',
      'sem_gerente',
      'sem_tecnico',
    ]);
  });

  it('ativos com modelo e sem plano (M1): plano que cobre, descarte, pendente e desativado não contam', () => {
    const ativo = (id: string, extra: object = {}) => ({
      id,
      localId: 'l1',
      categoriaId: 'cat-ar',
      modeloId: 'm-ar',
      ativo: true,
      sugestaoDescartada: false,
      cadastroPendente: false,
      ...extra,
    });
    const r = resumirImplantacao(
      H1,
      [{ id: 'l1', tipo: 'uh', status: 'ativo' }],
      [],
      AGORA,
      [
        ativo('a1'),
        ativo('a2'),
        ativo('a3', { sugestaoDescartada: true }),
        ativo('a4', { ativo: false }),
        ativo('a5', { modeloId: null }),
        ativo('a6', { categoriaId: 'cat-porta' }),
        ativo('a7', { cadastroPendente: true }),
      ],
      { modeloContratual: 'proprio' },
      [
        { ativoId: 'a2', categoriaId: null, situacao: 'pausado' },
        { ativoId: null, categoriaId: 'cat-porta', situacao: 'ativo' },
      ],
    );
    expect(r.ativos.comModeloSemPlano).toBe(1);
  });

  it('modelo contratual (I2): nulo é pendência; qualquer dos quatro valores resolve', () => {
    expect(
      resumirImplantacao(H1, [], [], AGORA, [], { modeloContratual: null }).pendencias,
    ).toContain('modelo_contratual_nao_informado');
    for (const modeloContratual of ['proprio', 'administrado', 'arrendado', 'afiliado'] as const) {
      expect(
        resumirImplantacao(H1, [], [], AGORA, [], { modeloContratual }).pendencias,
      ).not.toContain('modelo_contratual_nao_informado');
    }
  });
});

describe('tempo de implantação (PB1)', () => {
  const h = (horas: number) => new Date(AGORA.getTime() + horas * 3_600_000);
  const criado = { status: 'em_implantacao', criadoEm: h(-30) };

  it('em implantação: conta da entrada até agora, e passa da meta depois de 1 dia', () => {
    const t = tempoDaImplantacao(criado, [{ em: h(-30), status: 'em_implantacao' }], AGORA);
    expect(t).toEqual({
      entrouEm: h(-30),
      prontoEm: null,
      duracaoMs: 30 * 3_600_000,
      dentroDaMeta: false,
    });
    const recente = tempoDaImplantacao({ ...criado, criadoEm: h(-2) }, [], AGORA);
    expect(recente).toMatchObject({
      entrouEm: h(-2),
      duracaoMs: 2 * 3_600_000,
      dentroDaMeta: true,
    });
  });

  it('pronto: da entrada até a primeira ativação, fora de ordem na entrada', () => {
    const t = tempoDaImplantacao(
      { status: 'ativo', criadoEm: h(-50) },
      [
        { em: h(-10), status: 'ativo' },
        { em: h(-40), status: 'em_implantacao' },
        { em: h(-20), status: 'ativo' },
      ],
      AGORA,
    );
    expect(t).toEqual({
      entrouEm: h(-40),
      prontoEm: h(-20),
      duracaoMs: 20 * 3_600_000,
      dentroDaMeta: true,
    });
  });

  it('exatamente 1 dia ainda está na meta', () => {
    const t = tempoDaImplantacao(
      { status: 'ativo', criadoEm: h(-24) },
      [{ em: AGORA, status: 'ativo' }],
      AGORA,
    );
    expect(t.duracaoMs).toBe(META_DA_IMPLANTACAO_MS);
    expect(t.dentroDaMeta).toBe(true);
  });

  it('sem entrada na auditoria, vale a criação; ativação anterior à entrada não conta', () => {
    const t = tempoDaImplantacao(criado, [{ em: h(-40), status: 'ativo' }], AGORA);
    expect(t).toMatchObject({ entrouEm: h(-30), prontoEm: null, duracaoMs: 30 * 3_600_000 });
  });

  it('hotel já ativo sem a ativação registrada: sem duração', () => {
    const t = tempoDaImplantacao({ status: 'ativo', criadoEm: h(-100) }, [], AGORA);
    expect(t).toEqual({ entrouEm: h(-100), prontoEm: null, duracaoMs: null, dentroDaMeta: null });
  });
});
