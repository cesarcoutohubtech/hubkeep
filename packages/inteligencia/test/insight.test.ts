import type { Atribuicao, Papel, Escopo } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  ACOES_DO_INSIGHT,
  ESTADOS_DO_INSIGHT,
  TRANSICOES_DO_INSIGHT,
  chaveDoInsight,
  decidirDeteccao,
  decidirNoInsight,
  podeDecidirInsight,
  type AlcanceDoInsight,
  type InsightExistente,
} from '../src';
import { agora, dia } from './apoio';

const atribuicao = (papel: Papel, escopo: Escopo, extra: Partial<Atribuicao> = {}): Atribuicao => ({
  id: `at-${papel}`,
  usuarioId: 'u1',
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
  ...extra,
});

const noHotel: AlcanceDoInsight = { tipo: 'hotel', hotelId: 'h1', bandeiraId: 'b1' };
const naRede: AlcanceDoInsight = { tipo: 'rede', bandeiraId: null };
const naBandeira: AlcanceDoInsight = { tipo: 'rede', bandeiraId: 'b1' };
const gerente = [atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' })];

describe('ciclo de vida do insight', () => {
  it('os sete estados canônicos do ADR-033, e toda transição sai e chega neles', () => {
    expect(ESTADOS_DO_INSIGHT).toEqual([
      'novo',
      'em_revisao',
      'aceito',
      'em_acao',
      'monitorando',
      'resolvido',
      'descartado',
    ]);
    for (const a of ACOES_DO_INSIGHT) {
      const t = TRANSICOES_DO_INSIGHT[a];
      expect(ESTADOS_DO_INSIGHT).toContain(t.para);
      for (const de of t.de) expect(ESTADOS_DO_INSIGHT).toContain(de);
    }
  });

  it('resolvido e descartado não têm saída', () => {
    for (const a of ACOES_DO_INSIGHT) {
      expect(TRANSICOES_DO_INSIGHT[a].de).not.toContain('resolvido');
      expect(TRANSICOES_DO_INSIGHT[a].de).not.toContain('descartado');
    }
  });

  it('o caminho completo: revisar, aceitar, agir, monitorar e resolver com nota', () => {
    let estado = 'novo' as (typeof ESTADOS_DO_INSIGHT)[number];
    for (const acao of ['revisar', 'aceitar', 'agir', 'monitorar'] as const) {
      estado = decidirNoInsight(acao, {
        atribuicoes: gerente,
        insight: { estado, alcance: noHotel },
        agora,
      }).estado;
    }
    expect(estado).toBe('monitorando');
    const fim = decidirNoInsight('resolver', {
      atribuicoes: gerente,
      insight: { estado, alcance: noHotel },
      nota: '  troca do compressor   resolveu ',
      agora,
    });
    expect(fim).toEqual({ estado: 'resolvido', nota: 'troca do compressor resolveu' });
  });

  it('descartar sem nota é recusado (422)', () => {
    expect(() =>
      decidirNoInsight('descartar', {
        atribuicoes: gerente,
        insight: { estado: 'novo', alcance: noHotel },
        nota: '   ',
        agora,
      }),
    ).toThrow(expect.objectContaining({ codigo: 'motivo_obrigatorio' }));
  });

  it('ação fora do estado é conflito (409)', () => {
    expect(() =>
      decidirNoInsight('agir', {
        atribuicoes: gerente,
        insight: { estado: 'novo', alcance: noHotel },
        agora,
      }),
    ).toThrow(expect.objectContaining({ codigo: 'transicao_invalida' }));
  });

  it('quem está fora do escopo ou sem o papel não decide (403)', () => {
    const tecnico = [atribuicao('tecnico', { tipo: 'hotel', hotelId: 'h1' })];
    const gerenteDeOutro = [atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' })];
    for (const atribuicoes of [tecnico, gerenteDeOutro]) {
      expect(() =>
        decidirNoInsight('aceitar', {
          atribuicoes,
          insight: { estado: 'novo', alcance: noHotel },
          agora,
        }),
      ).toThrow(expect.objectContaining({ codigo: 'insight_fora_do_escopo' }));
    }
  });

  it('atribuição vencida não decide', () => {
    const vencida = [atribuicao('gestor_csc', { tipo: 'grupo' }, { validoAte: dia(-1) })];
    expect(podeDecidirInsight(vencida, noHotel, agora)).toBe(false);
  });

  it('insight de rede: escopo de grupo decide; bandeira só a dela; gerente nunca', () => {
    const csc = [atribuicao('gestor_csc', { tipo: 'grupo' })];
    const daBandeira = [atribuicao('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b1' })];
    const gerenteGrupo = [atribuicao('gerente_hotel', { tipo: 'grupo' })];
    expect(podeDecidirInsight(csc, naRede, agora)).toBe(true);
    expect(podeDecidirInsight(daBandeira, naBandeira, agora)).toBe(true);
    expect(podeDecidirInsight(daBandeira, naRede, agora)).toBe(false);
    expect(podeDecidirInsight(gerente, naRede, agora)).toBe(false);
    expect(podeDecidirInsight(gerenteGrupo, naRede, agora)).toBe(false);
  });
});

describe('o job abre ou atualiza, sem duplicar', () => {
  const chave = chaveDoInsight('reincidencia', { ativoId: 'a1', hotelId: 'h1' });
  const existente = (p: Partial<InsightExistente>): InsightExistente => ({
    id: 'i1',
    chave,
    estado: 'novo',
    faixa: 'alta_atencao',
    encerradoEm: null,
    ...p,
  });

  it('a chave não depende da ordem do escopo', () => {
    expect(chaveDoInsight('reincidencia', { hotelId: 'h1', ativoId: 'a1' })).toBe(chave);
    expect(chave).toBe('reincidencia|ativoId=a1|hotelId=h1');
  });

  it('sem insight da chave, abre', () => {
    expect(decidirDeteccao([], { chave, faixa: 'alta_atencao' }, agora)).toEqual({
      acao: 'abrir',
      anteriorId: null,
    });
  });

  it('com insight aberto, em qualquer estado aberto, atualiza e diz se subiu de faixa', () => {
    for (const estado of ['novo', 'em_revisao', 'aceito', 'em_acao', 'monitorando'] as const) {
      expect(decidirDeteccao([existente({ estado })], { chave, faixa: 'critico' }, agora)).toEqual({
        acao: 'atualizar',
        insightId: 'i1',
        subiuDeFaixa: true,
      });
    }
    expect(decidirDeteccao([existente({})], { chave, faixa: 'alta_atencao' }, agora)).toEqual({
      acao: 'atualizar',
      insightId: 'i1',
      subiuDeFaixa: false,
    });
  });

  it('descartado há menos de 30 dias, na mesma faixa, é ignorado', () => {
    const descartado = existente({ estado: 'descartado', encerradoEm: dia(-10) });
    expect(decidirDeteccao([descartado], { chave, faixa: 'alta_atencao' }, agora)).toEqual({
      acao: 'ignorar',
      motivo: 'descartado_recente',
      insightId: 'i1',
    });
  });

  it('descartado recente, mas a faixa subiu: abre novo, ligado ao anterior', () => {
    const descartado = existente({ estado: 'descartado', encerradoEm: dia(-10) });
    expect(decidirDeteccao([descartado], { chave, faixa: 'critico' }, agora)).toEqual({
      acao: 'abrir',
      anteriorId: 'i1',
    });
  });

  it('descartado há 30 dias ou mais: abre novo', () => {
    const descartado = existente({ estado: 'descartado', encerradoEm: dia(-30) });
    expect(decidirDeteccao([descartado], { chave, faixa: 'alta_atencao' }, agora).acao).toBe(
      'abrir',
    );
  });

  it('resolvido não silencia: o problema que volta abre insight novo', () => {
    const resolvido = existente({ estado: 'resolvido', encerradoEm: dia(-2) });
    expect(decidirDeteccao([resolvido], { chave, faixa: 'alta_atencao' }, agora)).toEqual({
      acao: 'abrir',
      anteriorId: 'i1',
    });
  });

  it('vale o encerramento mais recente, e outra chave não conta', () => {
    const antigo = existente({ id: 'i0', estado: 'descartado', encerradoEm: dia(-5) });
    const recente = existente({ id: 'i2', estado: 'resolvido', encerradoEm: dia(-1) });
    const outra = existente({ id: 'i9', chave: 'outra', estado: 'novo' });
    expect(
      decidirDeteccao([antigo, recente, outra], { chave, faixa: 'alta_atencao' }, agora),
    ).toEqual({ acao: 'abrir', anteriorId: 'i2' });
  });
});
