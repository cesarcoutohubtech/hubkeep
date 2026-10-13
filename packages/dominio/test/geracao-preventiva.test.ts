// Geração da OS preventiva (PV3; ADR-041, decisões 9 a 11): a regra pura do job.
import { describe, expect, it } from 'vitest';
import {
  type AtivoParaGerar,
  type PlanoParaGerar,
  type PreventivaGerada,
  planejarGeracao,
} from '../src/geracao-preventiva';

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
