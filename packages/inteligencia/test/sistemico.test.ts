// Possível problema sistêmico. Casos da seção 37 do PRD: 8 UHs do mesmo andar
// com água fria em 10 dias e 17 equipamentos iguais, em hotéis diferentes,
// com a mesma falha. O resultado é sempre "possível".
import { describe, expect, it } from 'vitest';
import { type AtivoAnalisado, type LocalAnalisado, detectarSistemicos } from '../src';
import { agora, corretiva, dia } from './apoio';

const uhs = (n: number, andar: string | null, hotelId = 'h1'): LocalAnalisado[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${hotelId}-uh${i}`, hotelId, andar }));

describe('mesmo andar', () => {
  it('PRD 37: 8 UHs do mesmo andar com água fria em 10 dias → possível problema sistêmico', () => {
    const locais = uhs(8, '3');
    const corretivas = locais.map((l, i) =>
      corretiva({
        hotelId: 'h1',
        localId: l.id,
        ativoId: null,
        codigoFalha: 'agua_fria',
        abertaEm: dia(-i),
      }),
    );
    const sinais = detectarSistemicos({ corretivas, ativos: [], locais }, agora);
    expect(sinais).toHaveLength(1);
    expect(sinais[0]).toMatchObject({
      regra: 'mesmo_andar',
      situacao: 'possivel',
      chave: { hotelId: 'h1', andar: '3', falha: 'agua_fria' },
      evidencia: { quantidade: 8, distintos: 8, janelaDias: 10 },
    });
  });

  it('abaixo do mínimo de UHs, fora da janela ou em andares diferentes, nada', () => {
    const quatro = uhs(4, '3');
    const espalhadas = uhs(8, '3');
    const andares = Array.from({ length: 8 }, (_, i) => ({
      id: `x${i}`,
      hotelId: 'h1',
      andar: `${i}`,
    }));
    const de = (ls: LocalAnalisado[], passo: number) =>
      ls.map((l, i) =>
        corretiva({
          localId: l.id,
          ativoId: null,
          codigoFalha: 'agua_fria',
          abertaEm: dia(-i * passo),
        }),
      );
    for (const [locais, passo] of [
      [quatro, 1],
      [espalhadas, 3], // só 4 caem nos últimos 10 dias
      [andares, 1],
    ] as const)
      expect(
        detectarSistemicos(
          { corretivas: de([...locais], passo), ativos: [], locais: [...locais] },
          agora,
        ).filter((s) => s.regra === 'mesmo_andar'),
      ).toEqual([]);
  });

  it('sem código de falha nem ativo com categoria, a corretiva não agrupa', () => {
    const locais = uhs(8, '3');
    const corretivas = locais.map((l) =>
      corretiva({ localId: l.id, ativoId: null, abertaEm: dia(-1) }),
    );
    expect(detectarSistemicos({ corretivas, ativos: [], locais }, agora)).toEqual([]);
  });
});

describe('mesmo modelo', () => {
  const ativos: AtivoAnalisado[] = Array.from({ length: 17 }, (_, i) => ({
    id: `a${i}`,
    hotelId: `h${i % 3}`,
    categoriaId: 'hvac',
    // Grafias diferentes do mesmo modelo, como chegam do cadastro.
    fabricante: i % 2 ? ' Carrier ' : 'carrier',
    modelo: i % 2 ? 'XPower 12' : 'xpower 12',
  }));

  it('PRD 37: 17 equipamentos iguais em hotéis diferentes com a mesma falha → insight por modelo', () => {
    const corretivas = ativos.map((a, i) =>
      corretiva({
        hotelId: a.hotelId,
        localId: `l${i}`,
        ativoId: a.id,
        codigoFalha: 'compressor',
        abertaEm: dia(-i * 4),
      }),
    );
    const sinais = detectarSistemicos({ corretivas, ativos, locais: [] }, agora).filter(
      (s) => s.regra === 'mesmo_modelo',
    );
    expect(sinais).toHaveLength(1);
    expect(sinais[0]).toMatchObject({
      situacao: 'possivel',
      chave: { modelo: 'carrier|xpower 12', falha: 'compressor' },
      evidencia: { quantidade: 17, distintos: 17, hotelIds: ['h0', 'h1', 'h2'] },
    });
  });

  it('o mesmo modelo com falhas diferentes não é sinal', () => {
    const corretivas = ativos.map((a, i) =>
      corretiva({
        hotelId: a.hotelId,
        localId: `l${i}`,
        ativoId: a.id,
        codigoFalha: `f${i % 9}`,
        abertaEm: dia(-i),
      }),
    );
    // Nove falhas entre 17 ativos: no máximo 2 ativos por falha, abaixo do mínimo de 5.
    expect(detectarSistemicos({ corretivas, ativos, locais: [] }, agora)).toEqual([]);
  });

  it('sem código de falha, agrupa pela categoria do ativo', () => {
    const corretivas = ativos.map((a, i) =>
      corretiva({ hotelId: a.hotelId, localId: `l${i}`, ativoId: a.id, abertaEm: dia(-i) }),
    );
    const [sinal] = detectarSistemicos({ corretivas, ativos, locais: [] }, agora).filter(
      (s) => s.regra === 'mesmo_modelo',
    );
    expect(sinal?.chave).toEqual({ modelo: 'carrier|xpower 12', falha: 'hvac' });
  });
});

describe('crescimento da mesma falha no hotel', () => {
  const em = (dias: readonly number[]) =>
    dias.map((d, i) =>
      corretiva({ localId: `l${i}`, ativoId: null, codigoFalha: 'vazamento', abertaEm: dia(d) }),
    );

  it('de 4 para 8 em 30 dias → +100%, possível problema sistêmico', () => {
    const corretivas = em([-35, -40, -45, -50, -1, -3, -5, -7, -9, -11, -13, -15]);
    const [sinal] = detectarSistemicos({ corretivas, ativos: [], locais: [] }, agora);
    expect(sinal).toMatchObject({
      regra: 'crescimento_categoria',
      chave: { hotelId: 'h1', falha: 'vazamento' },
      evidencia: { quantidade: 8, anterior: 4, variacaoPercentual: 100 },
    });
  });

  it('sem nada na janela anterior não há base, e crescimento pequeno não conta', () => {
    expect(
      detectarSistemicos(
        { corretivas: em([-1, -2, -3, -4, -5, -6]), ativos: [], locais: [] },
        agora,
      ),
    ).toEqual([]);
    expect(
      detectarSistemicos(
        { corretivas: em([-35, -40, -45, -50, -1, -2, -3, -4, -5]), ativos: [], locais: [] },
        agora,
      ),
    ).toEqual([]);
  });
});
