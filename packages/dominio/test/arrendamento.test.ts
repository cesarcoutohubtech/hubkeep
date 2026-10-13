// Arrendado mínimo (1c; decisões 5 a 8 do Cesar, de 13/10/2026): quem
// responde pela OS no hotel arrendado, pela categoria do chamado.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  ESTADOS_DA_OS,
  type EstadoDaOs,
  LIMITE_DA_MATRIZ,
  MODELOS_CONTRATUAIS,
  PAPEIS,
  type Papel,
  avisaOLocador,
  matrizDeArrendamentoValida,
  podeAjustarArrendamento,
  responsavelDoArrendamento,
} from '../src';

const AR = '01900000-0000-7000-8000-0000000000a1';
const ELETRICA = '01900000-0000-7000-8000-0000000000a2';
const SEM_REGRA = '01900000-0000-7000-8000-0000000000a3';
const MATRIZ = { [AR]: 'locador', [ELETRICA]: 'arrendataria' } as const;

describe('responsavelDoArrendamento', () => {
  it('no hotel arrendado, a regra da categoria do chamado', () => {
    expect(responsavelDoArrendamento('arrendado', MATRIZ, AR)).toBe('locador');
    expect(responsavelDoArrendamento('arrendado', MATRIZ, ELETRICA)).toBe('arrendataria');
  });

  it('a categoria sem regra e o chamado sem categoria ficam com a arrendatária (decisão 7)', () => {
    expect(responsavelDoArrendamento('arrendado', MATRIZ, SEM_REGRA)).toBe('arrendataria');
    expect(responsavelDoArrendamento('arrendado', MATRIZ, null)).toBe('arrendataria');
    expect(responsavelDoArrendamento('arrendado', {}, AR)).toBe('arrendataria');
    // Chave herdada do protótipo não é regra.
    expect(responsavelDoArrendamento('arrendado', MATRIZ, 'constructor')).toBe('arrendataria');
  });

  it('fora do hotel arrendado, e com o modelo não informado, a OS não tem responsável', () => {
    for (const modelo of MODELOS_CONTRATUAIS.filter((m) => m !== 'arrendado')) {
      expect(responsavelDoArrendamento(modelo, MATRIZ, AR)).toBeNull();
    }
    expect(responsavelDoArrendamento(null, MATRIZ, AR)).toBeNull();
  });
});

describe('matrizDeArrendamentoValida', () => {
  it('por categoria (id), a arrendatária ou o locador, até o limite', () => {
    expect(matrizDeArrendamentoValida({})).toBe(true);
    expect(matrizDeArrendamentoValida(MATRIZ)).toBe(true);
    const cheia = (n: number) =>
      Object.fromEntries(
        Array.from({ length: n }, (_, i) => [
          `01900000-0000-7000-8000-${String(i).padStart(12, '0')}`,
          'locador',
        ]),
      );
    expect(matrizDeArrendamentoValida(cheia(LIMITE_DA_MATRIZ))).toBe(true);
    expect(matrizDeArrendamentoValida(cheia(LIMITE_DA_MATRIZ + 1))).toBe(false);
  });

  it('recusa categoria fora do formato, responsável desconhecido e o que não é objeto', () => {
    expect(matrizDeArrendamentoValida({ ar: 'locador' })).toBe(false);
    expect(matrizDeArrendamentoValida({ [AR]: 'proprietario' })).toBe(false);
    expect(matrizDeArrendamentoValida({ [AR]: null })).toBe(false);
    expect(matrizDeArrendamentoValida([])).toBe(false);
    expect(matrizDeArrendamentoValida(null)).toBe(false);
    expect(matrizDeArrendamentoValida('locador')).toBe(false);
  });
});

describe('ajustar a marca do arrendamento na OS (ADR-045)', () => {
  const agora = new Date('2026-10-13T12:00:00Z');
  const HOTEL = { id: 'hotel-1', bandeiraId: null };
  const chamado = { hotel: HOTEL, estado: 'em_execucao' as const, abertoPor: 'outro' };
  const ator = (papel: Papel) => {
    const escopo: Atribuicao['escopo'] =
      papel === 'admin_grupo' ? { tipo: 'grupo' } : { tipo: 'hotel', hotelId: HOTEL.id };
    return {
      usuarioId: 'u',
      atribuicoes: [
        { id: 'a', usuarioId: 'u', papel, escopo, validoAte: null, revogadoEm: null },
      ] as Atribuicao[],
      equipes: [],
    };
  };
  const TRIA: Record<Papel, boolean> = {
    admin_grupo: true,
    gestor_csc: true,
    gerente_hotel: true,
    implantador: false,
    tecnico: false,
    solicitante: false,
    proprietario: false,
  };
  const codigo = (f: () => unknown): string | null => {
    try {
      f();
      return null;
    } catch (e) {
      return (e as { codigo: string }).codigo;
    }
  };
  const os = (estado: EstadoDaOs, responsavelArrendamento: 'arrendataria' | 'locador' | null) => ({
    estado,
    responsavelArrendamento,
  });

  for (const papel of PAPEIS)
    it(`papel: ${papel}`, () => {
      expect(
        codigo(() =>
          podeAjustarArrendamento(
            ator(papel),
            chamado,
            os('atribuida', 'locador'),
            'contrato',
            agora,
          ),
        ),
      ).toBe(TRIA[papel] ? null : 'triagem_fora_do_papel');
    });

  for (const estado of ESTADOS_DA_OS)
    it(`estado da OS: ${estado}`, () => {
      const vale = ['atribuida', 'em_execucao', 'pausada', 'concluida'].includes(estado);
      expect(
        codigo(() =>
          podeAjustarArrendamento(
            ator('gestor_csc'),
            chamado,
            os(estado, 'arrendataria'),
            'x',
            agora,
          ),
        ),
      ).toBe(vale ? null : 'transicao_invalida');
    });

  it('a OS sem marca (fora do arrendado, ou anterior à 0047) não tem o que ajustar', () => {
    expect(
      codigo(() =>
        podeAjustarArrendamento(ator('gestor_csc'), chamado, os('atribuida', null), 'x', agora),
      ),
    ).toBe('os_sem_arrendamento');
  });

  it('o motivo é obrigatório e volta normalizado', () => {
    const a = ator('gerente_hotel');
    expect(
      codigo(() => podeAjustarArrendamento(a, chamado, os('atribuida', 'locador'), '  ', agora)),
    ).toBe('motivo_obrigatorio');
    expect(
      podeAjustarArrendamento(a, chamado, os('atribuida', 'locador'), '  cláusula   7 ', agora),
    ).toBe('cláusula 7');
  });
});

describe('aviso ao locador, uma vez por OS (decisão 8)', () => {
  it('só com a OS do locador e ainda sem aviso', () => {
    expect(avisaOLocador('locador', null)).toBe(true);
    expect(avisaOLocador('locador', new Date('2026-10-13T12:00:00Z'))).toBe(false);
    expect(avisaOLocador('arrendataria', null)).toBe(false);
    expect(avisaOLocador(null, null)).toBe(false);
  });
});
