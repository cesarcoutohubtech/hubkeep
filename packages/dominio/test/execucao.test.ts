// Execução da OS (C4): quem registra na OS e em que estado, o apontamento de
// horas e o material. As tabelas esperadas são escritas à mão.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  type ChamadoParaRegra,
  ESTADOS_DA_OS,
  type EstadoDaOs,
  type Papel,
  REGISTROS_NA_OS,
  type Responsavel,
  decidirNaOs,
  decidirRegistroNaOs,
  normalizarMaterial,
  validarApontamento,
} from '../src';

const agora = new Date('2026-09-29T12:00:00Z');
const HOTEL = { id: 'hotel-1', bandeiraId: null };
const noHotel = { tipo: 'hotel', hotelId: HOTEL.id } as const;
let seq = 0;
const atr = (
  usuarioId: string,
  papel: Papel,
  escopo: Atribuicao['escopo'] = noHotel,
): Atribuicao => ({
  id: `a-${++seq}`,
  usuarioId,
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
});
const ator = (usuarioId: string, papel: Papel, equipes: string[] = []) => ({
  usuarioId,
  atribuicoes: [atr(usuarioId, papel)],
  equipes,
});
const chamado: ChamadoParaRegra = { hotel: HOTEL, estado: 'em_execucao', abertoPor: 'sol' };
const DO_TECNICO: Responsavel = { tipo: 'tecnico', usuarioId: 'tec-1' };
const DA_EQUIPE: Responsavel = { tipo: 'equipe', equipeId: 'eq-1' };
const codigo = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

describe('registro na OS: responsável, com a OS em execução ou pausada', () => {
  const ACEITA: Record<EstadoDaOs, boolean> = {
    atribuida: false,
    em_execucao: true,
    pausada: true,
    concluida: false,
    aceita: false,
    cancelada: false,
  };
  for (const registro of REGISTROS_NA_OS)
    for (const estado of ESTADOS_DA_OS)
      it(`${registro} em ${estado}`, () => {
        const f = () =>
          decidirRegistroNaOs(registro, {
            ator: ator('tec-1', 'tecnico'),
            chamado,
            os: { estado, responsavel: DO_TECNICO },
            agora,
          });
        if (ACEITA[estado]) expect(f).not.toThrow();
        else expect(codigo(f)).toBe('transicao_invalida');
      });

  it('membro da equipe responsável registra; outro técnico do hotel, não', () => {
    const os = { estado: 'em_execucao' as const, responsavel: DA_EQUIPE };
    expect(() =>
      decidirRegistroNaOs('apontar_horas', {
        ator: ator('tec-2', 'tecnico', ['eq-1']),
        chamado,
        os,
        agora,
      }),
    ).not.toThrow();
    expect(
      codigo(() =>
        decidirRegistroNaOs('apontar_horas', {
          ator: ator('tec-3', 'tecnico'),
          chamado,
          os,
          agora,
        }),
      ),
    ).toBe('os_de_outro_responsavel');
  });

  it('fora do papel de Técnico no hotel: 403, mesmo sendo o responsável gravado', () => {
    for (const papel of ['gerente_hotel', 'gestor_csc', 'admin_grupo', 'solicitante'] as const)
      expect(
        codigo(() =>
          decidirRegistroNaOs('registrar_material', {
            ator: ator('tec-1', papel),
            chamado,
            os: { estado: 'em_execucao', responsavel: DO_TECNICO },
            agora,
          }),
        ),
      ).toBe('acao_fora_do_papel');
  });

  it('as transições do Técnico usam as equipes do ator', () => {
    const r = decidirNaOs('iniciar', {
      ator: ator('tec-2', 'tecnico', ['eq-1']),
      chamado,
      os: { estado: 'atribuida', responsavel: DA_EQUIPE },
      agora,
    });
    expect(r).toMatchObject({ estado: 'em_execucao', chamado: null });
    const concluir = decidirNaOs('concluir', {
      ator: ator('tec-2', 'tecnico', ['eq-1']),
      chamado,
      os: { estado: 'em_execucao', responsavel: DA_EQUIPE },
      agora,
    });
    expect(concluir).toMatchObject({ estado: 'concluida', chamado: 'aguardando_aceite' });
  });
});

describe('apontamento de horas', () => {
  const h = (iso: string) => new Date(`2026-09-29T${iso}:00Z`);

  it('fim depois do início, até 24 h e até 10 min no futuro', () => {
    expect(validarApontamento({ inicio: h('08:00'), fim: h('11:30') }, agora)).toEqual({
      inicio: h('08:00'),
      fim: h('11:30'),
    });
    expect(() => validarApontamento({ inicio: h('11:00'), fim: h('12:10') }, agora)).not.toThrow();
    expect(() =>
      validarApontamento({ inicio: new Date('2026-09-28T12:00:00Z'), fim: h('12:00') }, agora),
    ).not.toThrow();
  });

  it('recusa com apontamento_invalido', () => {
    const casos = [
      { inicio: h('10:00'), fim: h('10:00') },
      { inicio: h('10:00'), fim: h('09:00') },
      { inicio: new Date('2026-09-28T11:59:00Z'), fim: h('12:00') },
      { inicio: h('11:00'), fim: h('12:11') },
      { inicio: new Date('x'), fim: h('10:00') },
    ];
    for (const a of casos)
      expect(codigo(() => validarApontamento(a, agora))).toBe('apontamento_invalido');
  });
});

describe('material em texto livre', () => {
  it('normaliza os espaços e aceita até 500', () => {
    expect(normalizarMaterial('  2 m de  cabo\n 2,5 mm ')).toBe('2 m de cabo 2,5 mm');
    expect(normalizarMaterial('x'.repeat(500))).toHaveLength(500);
  });
  it('vazio ou acima de 500: material_invalido', () => {
    for (const d of ['', '   ', 'x'.repeat(501)])
      expect(codigo(() => normalizarMaterial(d))).toBe('material_invalido');
  });
});
