import { describe, expect, it } from 'vitest';
import {
  TRANSICOES_DA_OS,
  aceiteAutomaticoEm,
  decidirAceiteAutomatico,
  decidirNaOs,
  type OsNoAceiteAutomatico,
} from '../src';

const CONCLUIDA_EM = new Date('2026-10-01T15:00:00Z');
const LIGADO = { ligado: true, dias: 7 };

const os = (m: Partial<OsNoAceiteAutomatico> = {}): OsNoAceiteAutomatico => ({
  estado: 'concluida',
  concluidaEm: CONCLUIDA_EM,
  estadoDoChamado: 'aguardando_aceite',
  abertoPor: 'gerente',
  equipesDeQuemAbriu: [],
  responsavel: { tipo: 'tecnico', usuarioId: 'tecnico' },
  codigos: { falhaId: null, causaId: null, solucaoId: null },
  ...m,
});

const decidir = (
  o: OsNoAceiteAutomatico,
  agora: Date,
  m: { politica?: typeof LIGADO; codigosObrigatorios?: boolean; assinaturaNoAceite?: boolean } = {},
) =>
  decidirAceiteAutomatico({
    os: o,
    politica: m.politica ?? LIGADO,
    codigosObrigatorios: m.codigosObrigatorios ?? false,
    assinaturaNoAceite: m.assinaturaNoAceite ?? false,
    agora,
  });

const NO_PRAZO = aceiteAutomaticoEm(CONCLUIDA_EM, 7);

describe('aceite automático (M5, ADR-044)', () => {
  it('N vezes 24 horas corridas desde a conclusão, sem calendário', () => {
    expect(aceiteAutomaticoEm(CONCLUIDA_EM, 7).toISOString()).toBe('2026-10-08T15:00:00.000Z');
    expect(aceiteAutomaticoEm(CONCLUIDA_EM, 1).toISOString()).toBe('2026-10-02T15:00:00.000Z');
  });

  it('no instante do prazo aceita, e o chamado vai para concluído como no aceite manual', () => {
    expect(decidir(os(), NO_PRAZO)).toEqual({
      aceitar: true,
      estado: 'aceita',
      chamado: 'concluido',
    });
    expect(TRANSICOES_DA_OS.aceitar_automatico.para).toBe(TRANSICOES_DA_OS.aceitar.para);
    expect(TRANSICOES_DA_OS.aceitar_automatico.chamado).toEqual(TRANSICOES_DA_OS.aceitar.chamado);
  });

  it('um milissegundo antes, ainda não', () => {
    expect(decidir(os(), new Date(NO_PRAZO.getTime() - 1))).toEqual({
      aceitar: false,
      motivo: 'antes_do_prazo',
    });
  });

  it('a reabertura recomeça a contagem na nova conclusão', () => {
    const nova = new Date('2026-10-05T09:00:00Z');
    expect(decidir(os({ concluidaEm: nova }), NO_PRAZO)).toMatchObject({
      motivo: 'antes_do_prazo',
    });
    expect(decidir(os({ concluidaEm: nova }), aceiteAutomaticoEm(nova, 7))).toMatchObject({
      aceitar: true,
    });
  });

  it('desligada, nunca aceita', () => {
    expect(decidir(os(), NO_PRAZO, { politica: { ligado: false, dias: 7 } })).toEqual({
      aceitar: false,
      motivo: 'desligado',
    });
  });

  it('fora de concluída, ou com o chamado fora de aguardando aceite, não aceita', () => {
    for (const estado of ['atribuida', 'em_execucao', 'pausada', 'aceita', 'cancelada'] as const) {
      expect(decidir(os({ estado }), NO_PRAZO)).toMatchObject({ motivo: 'fora_do_estado' });
    }
    expect(decidir(os({ estadoDoChamado: 'concluido' }), NO_PRAZO)).toMatchObject({
      motivo: 'fora_do_estado',
    });
    expect(decidir(os({ concluidaEm: null }), NO_PRAZO)).toMatchObject({
      motivo: 'fora_do_estado',
    });
  });

  it('quem abriu e executa fica de fora: o técnico responsável ou membro da equipe responsável', () => {
    expect(decidir(os({ abertoPor: 'tecnico' }), NO_PRAZO)).toMatchObject({
      motivo: 'quem_abriu_executa',
    });
    const daEquipe = os({
      abertoPor: 'tecnico2',
      equipesDeQuemAbriu: ['eq1'],
      responsavel: { tipo: 'equipe', equipeId: 'eq1' },
    });
    expect(decidir(daEquipe, NO_PRAZO)).toMatchObject({ motivo: 'quem_abriu_executa' });
    const deOutraEquipe = os({
      abertoPor: 'tecnico2',
      equipesDeQuemAbriu: ['eq2'],
      responsavel: { tipo: 'equipe', equipeId: 'eq1' },
    });
    expect(decidir(deOutraEquipe, NO_PRAZO)).toMatchObject({ aceitar: true });
  });

  it('com os códigos obrigatórios, aceita só com os três', () => {
    expect(decidir(os(), NO_PRAZO, { codigosObrigatorios: true })).toMatchObject({
      motivo: 'faltam_codigos',
    });
    const doisDeTres = os({ codigos: { falhaId: 'f', causaId: 'c', solucaoId: null } });
    expect(decidir(doisDeTres, NO_PRAZO, { codigosObrigatorios: true })).toMatchObject({
      motivo: 'faltam_codigos',
    });
    const completos = os({ codigos: { falhaId: 'f', causaId: 'c', solucaoId: 's' } });
    expect(decidir(completos, NO_PRAZO, { codigosObrigatorios: true })).toMatchObject({
      aceitar: true,
    });
  });

  it('com a assinatura no aceite, nunca aceita: o job não assina', () => {
    expect(decidir(os(), NO_PRAZO, { assinaturaNoAceite: true })).toEqual({
      aceitar: false,
      motivo: 'assinatura_no_aceite',
    });
  });

  it('nenhum papel faz a ação pelo caminho manual', () => {
    expect(TRANSICOES_DA_OS.aceitar_automatico.quem).toEqual([]);
    expect(() =>
      decidirNaOs('aceitar_automatico', {
        ator: {
          usuarioId: 'admin',
          equipes: [],
          atribuicoes: [
            {
              id: 'a',
              usuarioId: 'admin',
              papel: 'admin_grupo',
              escopo: { tipo: 'grupo' },
              validoAte: null,
              revogadoEm: null,
            },
          ],
        },
        chamado: {
          estado: 'aguardando_aceite',
          abertoPor: 'gerente',
          hotel: { id: 'h', bandeiraId: null },
        },
        os: { estado: 'concluida', responsavel: { tipo: 'tecnico', usuarioId: 'tecnico' } },
        agora: NO_PRAZO,
      }),
    ).toThrow(expect.objectContaining({ codigo: 'acao_fora_do_papel' }));
  });
});
