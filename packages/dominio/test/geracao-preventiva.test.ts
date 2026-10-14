// Geração da OS preventiva (PV3; ADR-041, decisões 9 a 11): a regra pura do job.
import { describe, expect, it } from 'vitest';
import {
  type AtivoParaGerar,
  type PlanoParaGerar,
  type PreventivaGerada,
  type ResponsavelDoPlano,
  modeloParaACopia,
  planejarGeracao,
  responsavelQueVale,
} from '../src/geracao-preventiva';
import type { Atribuicao } from '../src/tipos';

const TECNICO = { tipo: 'tecnico', usuarioId: 'u-tecnico' } as const;

const plano = (p: Partial<PlanoParaGerar> = {}): PlanoParaGerar => ({
  id: 'plano-1',
  nome: 'Limpeza do filtro',
  versao: 3,
  inicio: '2026-01-31',
  intervalo: 1,
  unidade: 'mes',
  checklistModeloId: 'modelo-1',
  responsavel: TECNICO,
  ...p,
});

const ativo = (id: string, cadastradoEm = '2025-12-01'): AtivoParaGerar => ({
  id,
  localId: `local-${id}`,
  cadastradoEm,
});

const gerar = (
  hoje: string,
  ativos: AtivoParaGerar[] = [ativo('a1')],
  geradas: PreventivaGerada[] = [],
  p: Partial<PlanoParaGerar> = {},
) => planejarGeracao({ plano: plano(p), ativos, geradas, hoje });

describe('planejarGeracao', () => {
  it('antes do início, nada sai nem é pulado', () => {
    expect(gerar('2026-01-30')).toEqual({ dataPrevista: null, geradas: [], puladas: [] });
  });

  it('no dia previsto, gera a OS no local do ativo, com o responsável e a cópia do plano', () => {
    expect(gerar('2026-01-31')).toEqual({
      dataPrevista: '2026-01-31',
      puladas: [],
      geradas: [
        {
          planoId: 'plano-1',
          ativoId: 'a1',
          localId: 'local-a1',
          dataPrevista: '2026-01-31',
          responsavel: TECNICO,
          checklistModeloId: 'modelo-1',
          planoAplicado: {
            planoId: 'plano-1',
            nome: 'Limpeza do filtro',
            versao: 3,
            intervalo: 1,
            unidade: 'mes',
          },
        },
      ],
    });
  });

  it('sem avalanche: com várias vencidas, só a mais recente (o dia que não existe cai no último)', () => {
    const r = gerar('2026-04-15');
    expect(r.dataPrevista).toBe('2026-03-31');
    expect(r.geradas.map((g) => g.dataPrevista)).toEqual(['2026-03-31']);
    expect(gerar('2026-03-01').dataPrevista).toBe('2026-02-28');
  });

  it('idempotente: a ocorrência que já tem OS, mesmo cancelada, não sai de novo', () => {
    for (const estado of ['atribuida', 'aceita', 'cancelada'] as const) {
      const r = gerar(
        '2026-01-31',
        [ativo('a1')],
        [{ ativoId: 'a1', dataPrevista: '2026-01-31', estado }],
      );
      expect(r.geradas).toEqual([]);
      expect(r.puladas).toEqual([{ ativoId: 'a1', motivo: 'ja_gerada' }]);
    }
  });

  it('sem acúmulo: a OS anterior aberta segura a nova; concluída, aceita ou cancelada, não', () => {
    for (const estado of ['atribuida', 'em_execucao', 'pausada'] as const) {
      const r = gerar(
        '2026-02-28',
        [ativo('a1')],
        [{ ativoId: 'a1', dataPrevista: '2026-01-31', estado }],
      );
      expect(r.puladas).toEqual([{ ativoId: 'a1', motivo: 'os_anterior_aberta' }]);
    }
    for (const estado of ['concluida', 'aceita', 'cancelada'] as const) {
      const r = gerar(
        '2026-02-28',
        [ativo('a1')],
        [{ ativoId: 'a1', dataPrevista: '2026-01-31', estado }],
      );
      expect(r.geradas.map((g) => g.dataPrevista)).toEqual(['2026-02-28']);
    }
  });

  it('plano por categoria: uma OS por ativo, cada ativo com a sua regra', () => {
    const r = gerar(
      '2026-02-28',
      [ativo('a3'), ativo('a1'), ativo('a2', '2026-03-01')],
      [{ ativoId: 'a3', dataPrevista: '2026-01-31', estado: 'pausada' }],
    );
    expect(r.geradas.map((g) => [g.ativoId, g.localId])).toEqual([['a1', 'local-a1']]);
    expect(r.puladas).toEqual([
      { ativoId: 'a2', motivo: 'ativo_posterior' },
      { ativoId: 'a3', motivo: 'os_anterior_aberta' },
    ]);
  });

  it('o ativo cadastrado no próprio dia previsto entra', () => {
    expect(gerar('2026-01-31', [ativo('a1', '2026-01-31')]).geradas).toHaveLength(1);
  });

  it('sem responsável válido ou sem ativo, o plano inteiro é pulado', () => {
    expect(gerar('2026-01-31', [ativo('a1')], [], { responsavel: null }).puladas).toEqual([
      { ativoId: null, motivo: 'sem_responsavel' },
    ]);
    expect(gerar('2026-01-31', []).puladas).toEqual([{ ativoId: null, motivo: 'sem_ativo' }]);
  });

  it('a equipe também é responsável padrão; o plano sem checklist gera OS sem checklist', () => {
    const equipe = { tipo: 'equipe', equipeId: 'e1' } as const;
    const [g] = gerar('2026-01-31', [ativo('a1')], [], {
      responsavel: equipe,
      checklistModeloId: null,
    }).geradas;
    expect(g).toMatchObject({ responsavel: equipe, checklistModeloId: null });
  });

  it('semana e dia, no calendário fixo ancorado no início', () => {
    expect(
      gerar('2026-02-20', [ativo('a1')], [], { unidade: 'semana', intervalo: 2 }).dataPrevista,
    ).toBe('2026-02-14');
    expect(
      gerar('2026-02-02', [ativo('a1')], [], { unidade: 'dia', intervalo: 1 }).dataPrevista,
    ).toBe('2026-02-02');
  });
});

describe('responsavelQueVale: quem recebe a OS do plano, no dia da geração', () => {
  const AGORA = new Date('2026-03-01T12:00:00Z');
  const HOTEL = { id: 'h1', bandeiraId: 'b1' };
  const tecnico = (escopo: Atribuicao['escopo'], extra: Partial<Atribuicao> = {}): Atribuicao => ({
    id: 'a1',
    usuarioId: 'u1',
    papel: 'tecnico',
    escopo,
    validoAte: null,
    revogadoEm: null,
    ...extra,
  });
  const doTecnico = (atribuicoes: Atribuicao[], membroAtivo = true): ResponsavelDoPlano => ({
    tipo: 'tecnico',
    usuarioId: 'u1',
    membroAtivo,
    atribuicoes,
  });
  const daEquipe = (p: Partial<{ hotelId: string; ativa: boolean }> = {}): ResponsavelDoPlano => ({
    tipo: 'equipe',
    equipeId: 'e1',
    hotelId: 'h1',
    ativa: true,
    ...p,
  });

  it('o técnico ativo com papel vigente no hotel, na bandeira ou no grupo vale', () => {
    for (const escopo of [
      { tipo: 'hotel', hotelId: 'h1' },
      { tipo: 'bandeira', bandeiraId: 'b1' },
      { tipo: 'grupo' },
    ] as const) {
      expect(responsavelQueVale(doTecnico([tecnico(escopo)]), HOTEL, AGORA)).toEqual({
        tipo: 'tecnico',
        usuarioId: 'u1',
      });
    }
  });

  it('o técnico desativado, vencido, revogado, de outro hotel ou sem o papel não vale', () => {
    const noHotel = { tipo: 'hotel', hotelId: 'h1' } as const;
    for (const r of [
      doTecnico([tecnico(noHotel)], false),
      doTecnico([tecnico(noHotel, { validoAte: new Date('2026-02-01') })]),
      doTecnico([tecnico(noHotel, { revogadoEm: new Date('2026-02-01') })]),
      doTecnico([tecnico({ tipo: 'hotel', hotelId: 'h2' })]),
      doTecnico([tecnico(noHotel, { papel: 'solicitante' })]),
      doTecnico([tecnico(noHotel, { usuarioId: 'outro' })]),
      doTecnico([]),
    ]) {
      expect(responsavelQueVale(r, HOTEL, AGORA)).toBeNull();
    }
  });

  it('a equipe ativa do hotel vale; a desativada ou de outro hotel, não', () => {
    expect(responsavelQueVale(daEquipe(), HOTEL, AGORA)).toEqual({
      tipo: 'equipe',
      equipeId: 'e1',
    });
    expect(responsavelQueVale(daEquipe({ ativa: false }), HOTEL, AGORA)).toBeNull();
    expect(responsavelQueVale(daEquipe({ hotelId: 'h2' }), HOTEL, AGORA)).toBeNull();
  });

  it('o plano sem responsável não tem quem receba', () => {
    expect(responsavelQueVale(null, HOTEL, AGORA)).toBeNull();
  });
});

describe('modeloParaACopia: a OS copia o checklist do plano só de modelo ativo', () => {
  it('ativo, copia; desativado ou sem modelo, a OS sai sem checklist', () => {
    const modelo = { id: 'm1', ativa: true };
    expect(modeloParaACopia(modelo)).toBe(modelo);
    expect(modeloParaACopia({ ...modelo, ativa: false })).toBeNull();
    expect(modeloParaACopia(null)).toBeNull();
  });
});
