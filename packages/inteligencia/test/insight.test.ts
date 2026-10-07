import type { Atribuicao, Papel, Escopo } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  ACOES_DO_INSIGHT,
  ESTADOS_DO_INSIGHT,
  TRANSICOES_DO_INSIGHT,
  MOTIVOS_DE_DESCARTE,
  decidirDeteccao,
  decidirNoInsight,
  familiaDoInsight,
  listaCanonicaDeHoteis,
  podeDecidirInsight,
  substituidoPor,
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
    expect(fim).toEqual({
      estado: 'resolvido',
      nota: 'troca do compressor resolveu',
      motivoDeDescarte: null,
    });
  });

  it('descartar sem nota é recusado (422)', () => {
    expect(() =>
      decidirNoInsight('descartar', {
        atribuicoes: gerente,
        insight: { estado: 'novo', alcance: noHotel },
        nota: '   ',
        motivoDeDescarte: 'nao_relevante',
        agora,
      }),
    ).toThrow(expect.objectContaining({ codigo: 'motivo_obrigatorio' }));
  });

  it('descartar pede um dos motivos canônicos (422), e o motivo sai no resultado', () => {
    expect(MOTIVOS_DE_DESCARTE).toEqual(['nao_relevante', 'substituido']);
    for (const motivoDeDescarte of [undefined, null, '', 'outro']) {
      expect(() =>
        decidirNoInsight('descartar', {
          atribuicoes: gerente,
          insight: { estado: 'novo', alcance: noHotel },
          nota: 'falso alarme',
          motivoDeDescarte,
          agora,
        }),
      ).toThrow(expect.objectContaining({ codigo: 'motivo_de_descarte_invalido' }));
    }
    expect(
      decidirNoInsight('descartar', {
        atribuicoes: gerente,
        insight: { estado: 'novo', alcance: noHotel },
        nota: 'já tem o insight novo',
        motivoDeDescarte: 'substituido',
        agora,
      }),
    ).toEqual({
      estado: 'descartado',
      nota: 'já tem o insight novo',
      motivoDeDescarte: 'substituido',
    });
  });

  it('o motivo só vale no descartar: nas outras ações sai null', () => {
    expect(
      decidirNoInsight('aceitar', {
        atribuicoes: gerente,
        insight: { estado: 'novo', alcance: noHotel },
        motivoDeDescarte: 'nao_relevante',
        agora,
      }).motivoDeDescarte,
    ).toBeNull();
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

describe('o job decide pela família, sem duplicar nem mudar estado', () => {
  const familia = familiaDoInsight('sistemico', {
    regra: 'mesmo_modelo',
    modelo: 'acme x1',
    falha: 'ruido',
  });
  const h12 = listaCanonicaDeHoteis(['h2', 'h1']);
  const h123 = listaCanonicaDeHoteis(['h3', 'h1', 'h2']);
  const existente = (p: Partial<InsightExistente>): InsightExistente => ({
    id: 'i1',
    familia,
    hotelIds: h12,
    estado: 'novo',
    faixa: 'atencao',
    abertoEm: dia(-20),
    anteriorId: null,
    encerradoEm: null,
    motivoDeDescarte: null,
    ...p,
  });
  const deteccao = (hotelIds: readonly string[], faixa = 'atencao') => ({
    familia,
    hotelIds,
    faixa,
  });

  it('a família não depende da ordem do escopo, e a lista de hotéis é canônica', () => {
    expect(familiaDoInsight('atencao_ativo', { hotelId: 'h1', ativoId: 'a1' })).toBe(
      'atencao_ativo|ativoId=a1|hotelId=h1',
    );
    expect(listaCanonicaDeHoteis(['H2', 'h1', 'h2', 'h1'])).toEqual(['h1', 'h2']);
  });

  it('sem insight da família, abre', () => {
    expect(decidirDeteccao([], deteccao(h12), agora)).toEqual({ acao: 'abrir', anteriorId: null });
  });

  it('o mesmo conjunto, em qualquer estado aberto, atualiza e diz se subiu de faixa', () => {
    for (const estado of ['novo', 'em_revisao', 'aceito', 'em_acao', 'monitorando'] as const) {
      expect(decidirDeteccao([existente({ estado })], deteccao(h12, 'critico'), agora)).toEqual({
        acao: 'atualizar',
        insightId: 'i1',
        subiuDeFaixa: true,
      });
    }
    expect(decidirDeteccao([existente({})], deteccao(h12), agora)).toEqual({
      acao: 'atualizar',
      insightId: 'i1',
      subiuDeFaixa: false,
    });
  });

  it('conjunto contido no do aberto (saiu hotel): nada a fazer', () => {
    expect(decidirDeteccao([existente({ hotelIds: h123 })], deteccao(h12), agora)).toEqual({
      acao: 'ignorar',
      motivo: 'conjunto_contido',
      insightId: 'i1',
    });
  });

  it('hotel a mais: abre o novo, ligado ao anterior, que continua aberto', () => {
    expect(decidirDeteccao([existente({})], deteccao(h123), agora)).toEqual({
      acao: 'abrir',
      anteriorId: 'i1',
    });
  });

  it('com vários abertos, liga ao mais recente; o conjunto igual tem precedência', () => {
    const velho = existente({
      id: 'i0',
      abertoEm: dia(-30),
      hotelIds: listaCanonicaDeHoteis(['h1']),
    });
    const novo = existente({ id: 'i2', abertoEm: dia(-5) });
    const outro = listaCanonicaDeHoteis(['h1', 'h9']);
    expect(decidirDeteccao([velho, novo], deteccao(outro), agora)).toEqual({
      acao: 'abrir',
      anteriorId: 'i2',
    });
    expect(decidirDeteccao([velho, novo], deteccao(h12), agora)).toMatchObject({
      acao: 'atualizar',
      insightId: 'i2',
    });
  });

  it('outra família não conta', () => {
    const outra = existente({ id: 'i9', familia: 'outra' });
    expect(decidirDeteccao([outra], deteccao(h12), agora)).toEqual({
      acao: 'abrir',
      anteriorId: null,
    });
  });

  it('descartado "não relevante" há menos de 30 dias, na mesma faixa: ignorado, pela família', () => {
    const descartado = existente({
      estado: 'descartado',
      encerradoEm: dia(-10),
      motivoDeDescarte: 'nao_relevante',
    });
    for (const hotelIds of [h12, h123]) {
      expect(decidirDeteccao([descartado], deteccao(hotelIds), agora)).toEqual({
        acao: 'ignorar',
        motivo: 'descartado_recente',
        insightId: 'i1',
      });
    }
  });

  it('descartado "não relevante" recente, mas a faixa subiu: abre novo, ligado ao anterior', () => {
    const descartado = existente({
      estado: 'descartado',
      encerradoEm: dia(-10),
      motivoDeDescarte: 'nao_relevante',
    });
    expect(decidirDeteccao([descartado], deteccao(h12, 'critico'), agora)).toEqual({
      acao: 'abrir',
      anteriorId: 'i1',
    });
  });

  it('descartado "substituído" não gera silêncio', () => {
    const descartado = existente({
      estado: 'descartado',
      encerradoEm: dia(-1),
      motivoDeDescarte: 'substituido',
    });
    expect(decidirDeteccao([descartado], deteccao(h12), agora)).toEqual({
      acao: 'abrir',
      anteriorId: 'i1',
    });
  });

  it('descartado há 30 dias ou mais: abre novo', () => {
    const descartado = existente({
      estado: 'descartado',
      encerradoEm: dia(-30),
      motivoDeDescarte: 'nao_relevante',
    });
    expect(decidirDeteccao([descartado], deteccao(h12), agora).acao).toBe('abrir');
  });

  it('resolvido não silencia: o problema que volta abre insight novo', () => {
    const resolvido = existente({ estado: 'resolvido', encerradoEm: dia(-2) });
    expect(decidirDeteccao([resolvido], deteccao(h12), agora)).toEqual({
      acao: 'abrir',
      anteriorId: 'i1',
    });
  });

  it('vale o encerramento mais recente da família', () => {
    const antigo = existente({
      id: 'i0',
      estado: 'descartado',
      encerradoEm: dia(-5),
      motivoDeDescarte: 'nao_relevante',
    });
    const recente = existente({ id: 'i2', estado: 'resolvido', encerradoEm: dia(-1) });
    expect(decidirDeteccao([antigo, recente], deteccao(h12), agora)).toEqual({
      acao: 'abrir',
      anteriorId: 'i2',
    });
  });
});

describe('"substituído pelo insight X", calculado pelo vínculo', () => {
  const nasceu = (id: string, anteriorId: string | null, d: number) => ({
    id,
    anteriorId,
    abertoEm: dia(d),
  });

  it('o anterior aberto aponta para o novo mais recente ligado a ele', () => {
    const anterior = { id: 'i1', encerradoEm: null };
    expect(
      substituidoPor(anterior, [
        nasceu('i2', 'i1', -3),
        nasceu('i3', 'i1', -1),
        nasceu('i4', 'i9', 0),
      ]),
    ).toBe('i3');
    expect(substituidoPor(anterior, [])).toBeNull();
  });

  it('o que abriu depois do encerramento é recorrência, não substituição', () => {
    const resolvido = { id: 'i1', encerradoEm: dia(-5) };
    expect(substituidoPor(resolvido, [nasceu('i2', 'i1', -2)])).toBeNull();
    expect(substituidoPor(resolvido, [nasceu('i2', 'i1', -8)])).toBe('i2');
  });
});
