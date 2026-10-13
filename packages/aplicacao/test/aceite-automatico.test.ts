import { LIMITE_DO_ACEITE_AUTOMATICO_POR_RODADA, type NiveisDePolitica } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type AceiteAutomaticoAGravar,
  type OsParaOAceiteAutomatico,
  type PortaAceiteAutomatico,
  criarAceiteAutomatico,
} from '../src';

const AGORA = new Date('2026-10-13T12:00:00Z');
const HA_8_DIAS = new Date('2026-10-05T12:00:00Z');
const HA_2_DIAS = new Date('2026-10-11T12:00:00Z');

const SITUACOES = [
  { id: 'os-aceita', entidade: 'os' as const, estado: 'aceita', ordem: 1, ativa: true },
  { id: 'ch-concluido', entidade: 'chamado' as const, estado: 'concluido', ordem: 1, ativa: true },
];

const os = (id: string, m: Partial<OsParaOAceiteAutomatico> = {}): OsParaOAceiteAutomatico => ({
  id,
  hotelId: 'h1',
  versao: 3,
  chamadoId: `c-${id}`,
  versaoDoChamado: 5,
  estado: 'concluida',
  concluidaEm: HA_8_DIAS,
  estadoDoChamado: 'aguardando_aceite',
  abertoPor: 'gerente',
  equipesDeQuemAbriu: [],
  responsavel: { tipo: 'tecnico', usuarioId: 'tecnico' },
  codigos: { falhaId: null, causaId: null, solucaoId: null },
  ...m,
});

function emMemoria(
  lista: OsParaOAceiteAutomatico[],
  politicas: Record<string, Record<string, NiveisDePolitica>>,
  conflitos: string[] = [],
) {
  const gravados: AceiteAutomaticoAGravar[] = [];
  const tenants: string[] = [];
  const porta: PortaAceiteAutomatico = {
    emSessao: (tenantId, fn) => {
      tenants.push(tenantId);
      return fn({
        osConcluidas: async () => lista,
        politica: async (hotelId, chave) => politicas[hotelId]?.[chave] ?? {},
        situacoes: async () => SITUACOES,
        aceitar: async (a) => {
          if (conflitos.includes(a.osId)) return false;
          gravados.push(a);
          return true;
        },
      });
    },
  };
  return { porta, gravados, tenants };
}

const LIGADO_7 = { 'os.aceite_automatico': { grupo: { ligado: true, dias: 7 } } };
const executar = (porta: PortaAceiteAutomatico) =>
  criarAceiteAutomatico({ aceite: porta, relogio: { agora: () => AGORA } })('t1');

describe('aceite automático por tenant (M5, ADR-044)', () => {
  it('aceita a OS vencida, com as situações dos estados e o chamado concluído', async () => {
    const m = emMemoria([os('o1'), os('o2', { concluidaEm: HA_2_DIAS })], { h1: LIGADO_7 });
    expect(await executar(m.porta)).toEqual({ avaliadas: 2, aceitas: 1 });
    expect(m.tenants).toEqual(['t1']);
    expect(m.gravados).toEqual([
      {
        osId: 'o1',
        hotelId: 'h1',
        versao: 3,
        situacaoId: 'os-aceita',
        chamado: { id: 'c-o1', versao: 5, estado: 'concluido', situacaoId: 'ch-concluido' },
        concluidaEm: HA_8_DIAS,
        dias: 7,
      },
    ]);
  });

  it('sem a política ligada (o padrão), não aceita nada', async () => {
    const m = emMemoria([os('o1')], {});
    expect(await executar(m.porta)).toEqual({ avaliadas: 1, aceitas: 0 });
    expect(m.gravados).toEqual([]);
  });

  it('a política é a de cada hotel', async () => {
    const m = emMemoria([os('o1'), os('o2', { hotelId: 'h2' })], {
      h1: LIGADO_7,
      h2: { 'os.aceite_automatico': { hotel: { ligado: true, dias: 10 } } },
    });
    expect(await executar(m.porta)).toEqual({ avaliadas: 2, aceitas: 1 });
    expect(m.gravados.map((g) => g.osId)).toEqual(['o1']);
  });

  it('com os códigos obrigatórios ou a assinatura no aceite do hotel, a OS fica aguardando', async () => {
    const m = emMemoria([os('o1'), os('o2', { hotelId: 'h2' })], {
      h1: { ...LIGADO_7, 'os.codigos_obrigatorios': { grupo: { ligado: true } } },
      h2: { ...LIGADO_7, 'os.assinatura_no_aceite': { hotel: { ligado: true } } },
    });
    expect(await executar(m.porta)).toEqual({ avaliadas: 2, aceitas: 0 });
  });

  it('quem abriu e executa fica de fora', async () => {
    const m = emMemoria([os('o1', { abertoPor: 'tecnico' })], { h1: LIGADO_7 });
    expect(await executar(m.porta)).toEqual({ avaliadas: 1, aceitas: 0 });
  });

  it('a OS que mudou de versão no meio não conta, e as outras seguem', async () => {
    const m = emMemoria([os('o1'), os('o2')], { h1: LIGADO_7 }, ['o1']);
    expect(await executar(m.porta)).toEqual({ avaliadas: 2, aceitas: 1 });
    expect(m.gravados.map((g) => g.osId)).toEqual(['o2']);
  });

  it('no máximo o limite por rodada; o resto fica para a seguinte', async () => {
    const lista = Array.from({ length: LIMITE_DO_ACEITE_AUTOMATICO_POR_RODADA + 5 }, (_, i) =>
      os(`o${i}`),
    );
    const m = emMemoria(lista, { h1: LIGADO_7 });
    expect(await executar(m.porta)).toEqual({
      avaliadas: lista.length,
      aceitas: LIMITE_DO_ACEITE_AUTOMATICO_POR_RODADA,
    });
  });
});
