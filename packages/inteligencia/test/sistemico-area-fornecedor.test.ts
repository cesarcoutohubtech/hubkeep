// Possível problema sistêmico pela mesma área comum e pelo mesmo fornecedor
// (fornecedor da OS, pelo id do cadastro). Sempre "possível", com a evidência.
import { describe, expect, it } from 'vitest';
import { type Corretiva, type ExecutadoPor, type LocalAnalisado, detectarSistemicos } from '../src';
import { agora, corretiva, dia } from './apoio';

const areaComum: LocalAnalisado = { id: 'cozinha', hotelId: 'h1', andar: null, tipo: 'area_comum' };

describe('mesma área comum', () => {
  const na = (local: LocalAnalisado, n: number, codigoFalha = 'vazamento') =>
    Array.from({ length: n }, (_, i) =>
      corretiva({
        localId: local.id,
        ativoId: i % 2 ? `a${i}` : null,
        codigoFalha,
        abertaEm: dia(-i * 5),
      }),
    );

  it('5 vazamentos na cozinha em 30 dias → possível problema na área', () => {
    const sinais = detectarSistemicos(
      { corretivas: na(areaComum, 5), ativos: [], locais: [areaComum] },
      agora,
    ).filter((s) => s.regra === 'mesma_area_comum');
    expect(sinais).toHaveLength(1);
    expect(sinais[0]).toMatchObject({
      situacao: 'possivel',
      chave: { hotelId: 'h1', localId: 'cozinha', falha: 'vazamento' },
      evidencia: { quantidade: 5, distintos: 2, janelaDias: 30 },
    });
  });

  it('abaixo do mínimo, em UH ou com local sem tipo, nada', () => {
    const uh: LocalAnalisado = { id: 'uh1', hotelId: 'h1', andar: null, tipo: 'uh' };
    const semTipo: LocalAnalisado = { id: 'x', hotelId: 'h1', andar: null };
    for (const [local, n] of [
      [areaComum, 4],
      [uh, 8],
      [semTipo, 8],
    ] as const)
      expect(
        detectarSistemicos({ corretivas: na(local, n), ativos: [], locais: [local] }, agora).filter(
          (s) => s.regra === 'mesma_area_comum',
        ),
      ).toEqual([]);
  });
});

describe('mesmo fornecedor', () => {
  // Uma OS por ativo, concluída há 60 dias; `volta` abre outra no mesmo ativo
  // 10 dias depois da conclusão.
  function os(
    i: number,
    executadoPor: ExecutadoPor,
    fornecedorId: string | null,
    volta: boolean,
  ): Corretiva[] {
    const ativoId = `${executadoPor}-${fornecedorId}-${i}`;
    const primeira = corretiva({
      ativoId,
      abertaEm: dia(-62),
      concluidaEm: dia(-60),
      executadoPor,
      fornecedorId,
    });
    return volta ? [primeira, corretiva({ ativoId, abertaEm: dia(-50) })] : [primeira];
  }
  const varias = (n: number, voltas: number, por: ExecutadoPor, fornecedorId: string | null) =>
    Array.from({ length: n }, (_, i) => os(i, por, fornecedorId, i < voltas)).flat();

  it('fornecedor com 3 voltas em 6 OS (50%) passa do limiar de 30%, com a taxa interna de referência', () => {
    const corretivas = [
      ...varias(6, 3, 'fornecedor', 'f-silva'),
      ...varias(10, 1, 'equipe_interna', null),
    ];
    const sinais = detectarSistemicos({ corretivas, ativos: [], locais: [] }, agora).filter(
      (s) => s.regra === 'mesmo_fornecedor',
    );
    expect(sinais).toHaveLength(1);
    expect(sinais[0]).toMatchObject({
      situacao: 'possivel',
      chave: { fornecedorId: 'f-silva' },
      evidencia: {
        quantidade: 6,
        voltas: 3,
        taxaPercentual: 50,
        taxaInternaPercentual: 10,
        janelaDias: 180,
      },
    });
    expect(sinais[0]?.evidencia.corretivaIds).toHaveLength(3);
  });

  it('abaixo do limiar ou com poucas OS, nada; a equipe interna nunca vira sinal', () => {
    for (const corretivas of [
      varias(10, 2, 'fornecedor', 'f-silva'), // 20%
      varias(4, 4, 'fornecedor', 'f-silva'), // só 4 OS
      varias(10, 9, 'equipe_interna', null),
    ])
      expect(
        detectarSistemicos({ corretivas, ativos: [], locais: [] }, agora).filter(
          (s) => s.regra === 'mesmo_fornecedor',
        ),
      ).toEqual([]);
  });

  it('o nome digitado não entra: fornecedores de nome parecido seguem separados, e OS sem fornecedor não conta', () => {
    const corretivas = [
      ...varias(3, 3, 'fornecedor', 'f-silva'),
      ...varias(3, 3, 'fornecedor', 'f-silva-2'),
      ...varias(6, 6, 'fornecedor', null),
    ];
    expect(
      detectarSistemicos({ corretivas, ativos: [], locais: [] }, agora).filter(
        (s) => s.regra === 'mesmo_fornecedor',
      ),
    ).toEqual([]);
  });
  it('a OS concluída há menos de 30 dias ainda não conta', () => {
    const recentes = Array.from({ length: 6 }, (_, i) =>
      corretiva({
        ativoId: `r${i}`,
        abertaEm: dia(-12),
        concluidaEm: dia(-10),
        executadoPor: 'fornecedor',
        fornecedorId: 'f-silva',
      }),
    );
    const voltas = recentes.map((c) => corretiva({ ativoId: c.ativoId, abertaEm: dia(-5) }));
    expect(
      detectarSistemicos(
        { corretivas: [...recentes, ...voltas], ativos: [], locais: [] },
        agora,
      ).filter((s) => s.regra === 'mesmo_fornecedor'),
    ).toEqual([]);
  });
});
