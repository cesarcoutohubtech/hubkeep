// A fila do dia com a OS preventiva (PV3, ADR-041): a OS sem chamado só vem
// quando o PWA diz que a entende (preventiva=1). O PWA antigo, ainda no
// aparelho, continua lendo só as corretivas: um item sem chamado derrubaria a
// lista inteira no contrato antigo.
import type { Contexto } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { type PortaExecucao, criarCasosDeUsoDeExecucao } from '../src';

const ctx: Contexto = { usuarioId: 'tec-1', tenantId: 't' };
const HOTEL = 'hotel-1';

type Gravada = Awaited<ReturnType<PortaExecucao['osDoDia']>>[number];

const base = (id: string): Omit<Gravada, 'chamado' | 'preventiva'> => ({
  id,
  hotelId: HOTEL,
  estado: 'atribuida',
  situacaoId: 's-1',
  responsavel: { tipo: 'tecnico', usuarioId: 'tec-1' },
  motivoReabertura: null,
  versao: 1,
  criadoEm: new Date('2026-10-13T08:00:00Z'),
  fotosDepois: 0,
  checklist: null,
});

const CORRETIVA: Gravada = {
  ...base('os-corretiva'),
  chamado: {
    id: 'ch-1',
    descricao: 'Ar-condicionado pingando',
    localId: 'l-1',
    localNome: 'UH 101',
    localEdificacao: null,
    prioridadeId: 'p-1',
    estado: 'em_execucao',
    ativoId: null,
    paradoDesde: null,
    paradaDoChamado: false,
    uhIndisponivelDesde: null,
  },
  preventiva: null,
};

const PREVENTIVA: Gravada = {
  ...base('os-preventiva'),
  chamado: null,
  preventiva: {
    planoId: 'plano-1',
    planoNome: 'PMOC mensal',
    dataPrevista: '2026-10-13',
    ativoId: 'ativo-1',
    ativoNome: 'Split 12.000 BTU',
    localId: 'l-1',
    localNome: 'UH 101',
    localEdificacao: null,
  },
};

function montar() {
  const indisponivel = async (): Promise<never> => {
    throw new Error('não usado na fila do dia');
  };
  return criarCasosDeUsoDeExecucao({
    execucao: {
      equipesDoUsuario: async () => [],
      osDoDia: async () => [CORRETIVA, PREVENTIVA],
      ultimaTransicaoEm: async () => null,
      fotosDepois: async () => 0,
      ultimaPausa: async () => null,
    },
    triagem: {
      chamado: indisponivel,
      os: indisponivel,
      calendario: async () => null,
      politica: async () => ({}),
    },
    situacoes: { listar: async () => [] },
    atribuicoes: { doUsuario: async () => [] },
    relogio: { agora: () => new Date('2026-10-13T12:00:00Z') },
  });
}

describe('fila do dia com a OS preventiva (PV3)', () => {
  it('sem preventiva, só as corretivas: o PWA antigo não recebe OS sem chamado', async () => {
    const semOpcao = await montar().osDoDia(ctx);
    const desligada = await montar().osDoDia(ctx, { preventiva: false });
    for (const fila of [semOpcao, desligada]) {
      expect(fila.map((o) => o.id)).toEqual(['os-corretiva']);
    }
  });

  it('com preventiva, as duas, com as políticas resolvidas', async () => {
    const fila = await montar().osDoDia(ctx, { preventiva: true });
    expect(fila.map((o) => o.id)).toEqual(['os-corretiva', 'os-preventiva']);
    expect(fila[1]).toMatchObject({
      chamado: null,
      preventiva: { planoNome: 'PMOC mensal', dataPrevista: '2026-10-13' },
      fotoDepoisObrigatoria: false,
      checklistCompletoObrigatorio: false,
    });
  });
});
