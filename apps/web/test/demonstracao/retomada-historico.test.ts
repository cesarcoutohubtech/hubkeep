// O plano da retomada da gravação do histórico (gravacao-historico.ts), sem
// banco: pula as operações dos chamados já gravados antes do corte e devolve,
// em ordem, as dos chamados que o roteiro ganhou depois da gravação.
import { describe, expect, it } from 'vitest';
import { planoDaRetomada } from './gravacao-historico';

const d = (h: number) => new Date(Date.UTC(2026, 5, 1, h));
const ev = (h: number, tipo: string, chave: string) => ({ quando: d(h), tipo, chamado: { chave } });

describe('planoDaRetomada', () => {
  const eventos = [
    ev(1, 'abrir', 'ch00001'),
    ev(2, 'abrir', 'novo'),
    ev(3, 'passo', 'ch00001'),
    ev(4, 'passo', 'novo'),
    ev(10, 'passo', 'ch00001'),
    ev(11, 'passo', 'novo'),
  ];
  const gravados = new Map([['ch00001', 'id-1']]);

  it('pula os chamados gravados e devolve, em ordem, as operações dos novos antes do corte', () => {
    const p = planoDaRetomada(eventos, d(10), (c) => gravados.get(c.chave));
    expect(p.fim).toBe(4);
    expect([...p.ids]).toEqual([['ch00001', 'id-1']]);
    expect(p.faltam).toEqual([eventos[1], eventos[3]]);
  });

  it('com todos gravados, não sobra nada antes do corte', () => {
    const p = planoDaRetomada(eventos.slice(0, 1), d(10), (c) => gravados.get(c.chave));
    expect(p).toEqual({ fim: 1, ids: new Map([['ch00001', 'id-1']]), faltam: [] });
  });
});
