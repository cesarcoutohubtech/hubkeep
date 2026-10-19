// A OS para imprimir (1c, item 9): a mesma OS da página, sem o custo para quem
// só enxerga o hotel como proprietário; 404 quando a OS não é visível.
import type { Atribuicao, Contexto } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { type OsGravada, type PortaTriagem, criarCasosDeUsoDeTriagem } from '../src';

const AGORA = new Date('2026-10-19T12:00:00Z');
const HOTEL = 'h1';

const OS: OsGravada = {
  id: 'os-1',
  hotelId: HOTEL,
  bandeiraId: null,
  chamadoId: 'c-1',
  preventiva: null,
  estado: 'aceita',
  situacaoId: 's',
  responsavel: { tipo: 'tecnico', usuarioId: 'tec' },
  motivoCancelamento: null,
  motivoReabertura: null,
  executadoPor: 'equipe_interna',
  fornecedorId: null,
  custoInformado: 350,
  codigos: { falhaId: null, causaId: null, solucaoId: null },
  assinaturaAceiteId: null,
  responsavelArrendamento: null,
  locadorAvisadoEm: null,
  criadoPor: 'ger',
  versao: 2,
  criadoEm: AGORA,
};

const atr = (papel: Atribuicao['papel']): Atribuicao => ({
  id: `a-${papel}`,
  usuarioId: 'u',
  papel,
  escopo: { tipo: 'hotel', hotelId: HOTEL },
  validoAte: null,
  revogadoEm: null,
});

const naoUsado = async (): Promise<never> => {
  throw new Error('não é lido na impressão');
};

function casos(minhas: Atribuicao[]) {
  return criarCasosDeUsoDeTriagem({
    triagem: {
      os: async (_c: Contexto, id: string) => (id === OS.id ? OS : null),
    } as unknown as PortaTriagem,
    situacoes: { listar: naoUsado },
    prioridades: { listar: naoUsado },
    atribuicoes: { doUsuario: async () => minhas },
    relogio: { agora: () => AGORA },
    feriadosOficiais: {
      doAno: () => {
        throw new Error('não é lido na impressão');
      },
    },
  });
}

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };

describe('a OS para imprimir', () => {
  it('o Gerente do hotel vê o custo', async () => {
    const r = await casos([atr('gerente_hotel')]).osParaImpressao(ctx, OS.id);
    expect(r).toEqual({ os: OS, custoOculto: false });
  });

  it('o proprietário do hotel recebe a OS sem o custo', async () => {
    const r = await casos([atr('proprietario')]).osParaImpressao(ctx, OS.id);
    expect(r.custoOculto).toBe(true);
    expect(r.os).toEqual({ ...OS, custoInformado: null });
  });

  it('a OS que não é visível é 404', async () => {
    await expect(casos([atr('gerente_hotel')]).osParaImpressao(ctx, 'outra')).rejects.toMatchObject(
      { codigo: 'os_nao_encontrada' },
    );
  });
});
