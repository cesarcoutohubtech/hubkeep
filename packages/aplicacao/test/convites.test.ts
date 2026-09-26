// Convite (ADR-018) com portas em memória: a ordem das etapas e a compensação.
// A compensação (remover o usuário criado se a gravação falhar) só é provável
// assim — no banco real não há como forçar essa falha de forma determinística.
import { Conflito, type Contexto, NaoEncontrado, PermissaoNegada } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type EnvioDeConvite,
  type PortaConvites,
  type ProvedorDeIdentidade,
  type SituacaoDoConvite,
  criarCasoDeUsoDeConvites,
  criarManipuladoresDeEventos,
} from '../src/index';

const ctx: Contexto = { usuarioId: 'admin', tenantId: 't1' };
const pedido = {
  email: 'convidada@exemplo.com',
  nome: 'Convidada',
  papel: 'tecnico' as const,
  escopo: { tipo: 'hotel' as const, hotelId: 'h1' },
  validoAte: null,
  redirecionarPara: 'https://app/auth/confirmar',
};

function montar(opcoes: {
  regraNega?: boolean;
  situacao?: Partial<SituacaoDoConvite>;
  jaExisteNoAuth?: boolean;
  gravarFalha?: Error;
  removerFalha?: boolean;
}) {
  const log: string[] = [];
  const identidade: ProvedorDeIdentidade = {
    garantirUsuario: async () => {
      log.push('auth:garantir');
      return { usuarioId: 'u1', criadoAgora: !opcoes.jaExisteNoAuth };
    },
    removerUsuario: async (id) => {
      log.push(`auth:remover:${id}`);
      if (opcoes.removerFalha) throw new Error('Auth fora do ar');
    },
    vincularTenant: async (id, t) => void log.push(`auth:vincular:${id}:${t}`),
  };
  const convites: PortaConvites = {
    situacao: async () => {
      log.push('db:situacao');
      return { nomeTenant: 'Grupo 1', escopoVisivel: true, jaMembro: false, ...opcoes.situacao };
    },
    gravar: async () => {
      log.push('db:gravar');
      if (opcoes.gravarFalha) throw opcoes.gravarFalha;
    },
  };
  const caso = criarCasoDeUsoDeConvites({
    identidade,
    convites,
    papeis: {
      verificarConcessao: async () => {
        log.push('regra');
        if (opcoes.regraNega) throw new PermissaoNegada('negado', 'negado');
      },
    },
  });
  return { caso, log };
}

describe('convidar membro — ordem das etapas (ADR-018)', () => {
  it('caminho feliz: regra → situação → Auth sem e-mail → gravação; nenhum e-mail aqui', async () => {
    const { caso, log } = montar({});
    expect(await caso.convidarMembro(ctx, pedido)).toEqual({ usuarioId: 'u1' });
    expect(log).toEqual(['regra', 'db:situacao', 'auth:garantir', 'db:gravar']);
  });

  it('a) regra negada: nada de banco nem de Auth', async () => {
    const { caso, log } = montar({ regraNega: true });
    await expect(caso.convidarMembro(ctx, pedido)).rejects.toBeInstanceOf(PermissaoNegada);
    expect(log).toEqual(['regra']);
  });

  it('b) escopo não visível ao concedente: 404 sem tocar no Auth', async () => {
    const { caso, log } = montar({ situacao: { escopoVisivel: false } });
    await expect(caso.convidarMembro(ctx, pedido)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(log).toEqual(['regra', 'db:situacao']);
  });

  it('b) quem convida não é membro do tenant: 403 sem tocar no Auth', async () => {
    const { caso, log } = montar({ situacao: { nomeTenant: null } });
    await expect(caso.convidarMembro(ctx, pedido)).rejects.toBeInstanceOf(PermissaoNegada);
    expect(log).not.toContain('auth:garantir');
  });

  it('b) já é membro (por e-mail): 409 sem tocar no Auth', async () => {
    const { caso, log } = montar({ situacao: { jaMembro: true } });
    await expect(caso.convidarMembro(ctx, pedido)).rejects.toBeInstanceOf(Conflito);
    expect(log).not.toContain('auth:garantir');
  });

  it('d) gravação falha: o usuário criado NESTA requisição é removido', async () => {
    const { caso, log } = montar({ gravarFalha: new Error('falhou') });
    await expect(caso.convidarMembro(ctx, pedido)).rejects.toThrow('falhou');
    expect(log).toEqual(['regra', 'db:situacao', 'auth:garantir', 'db:gravar', 'auth:remover:u1']);
  });

  it('d) gravação falha com usuário que já existia: ele NÃO é removido', async () => {
    const { caso, log } = montar({
      jaExisteNoAuth: true,
      gravarFalha: new Conflito('ja_e_membro', 'x'),
    });
    await expect(caso.convidarMembro(ctx, pedido)).rejects.toBeInstanceOf(Conflito);
    expect(log).not.toContain('auth:remover:u1');
  });

  it('d) convite simultâneo gravou antes: o usuário criado aqui NÃO é removido', async () => {
    // Esta requisição criou o usuário, mas a outra (que o reaproveitou) gravou
    // o membro primeiro. Remover o usuário apagaria o acesso gravado pela outra.
    const { caso, log } = montar({ gravarFalha: new Conflito('ja_e_membro', 'x') });
    await expect(caso.convidarMembro(ctx, pedido)).rejects.toBeInstanceOf(Conflito);
    expect(log).not.toContain('auth:remover:u1');
  });

  it('d) a compensação falha: vale o erro original da gravação', async () => {
    const { caso, log } = montar({ gravarFalha: new Error('falhou'), removerFalha: true });
    await expect(caso.convidarMembro(ctx, pedido)).rejects.toThrow('falhou');
    expect(log).toContain('auth:remover:u1');
  });
});

describe('manipulador do evento membro.convidado (etapa e)', () => {
  const evento = {
    id: 'e1',
    tenantId: 't1',
    tipo: 'membro.convidado',
    payload: {
      usuarioId: 'u1',
      email: 'convidada@exemplo.com',
      nome: 'Convidada',
      nomeTenant: 'Grupo 1',
      redirecionarPara: 'https://app/auth/confirmar',
    },
  };

  it('vincula o tenant e envia o e-mail pela porta', async () => {
    const log: string[] = [];
    const envio: EnvioDeConvite = {
      enviarConvite: async (c) => {
        log.push(`envio:${c.email}:${c.redirecionarPara}`);
        return { enviado: true };
      },
    };
    const manipuladores = criarManipuladoresDeEventos({
      envio,
      identidade: {
        garantirUsuario: async () => ({ usuarioId: 'x', criadoAgora: false }),
        removerUsuario: async () => undefined,
        vincularTenant: async (id, t) => void log.push(`vincular:${id}:${t}`),
      },
    });
    await manipuladores['membro.convidado']?.(evento);
    expect(log).toEqual([
      'vincular:u1:t1',
      'envio:convidada@exemplo.com:https://app/auth/confirmar',
    ]);
  });

  it('falha no envio propaga (o worker tenta de novo com backoff)', async () => {
    const manipuladores = criarManipuladoresDeEventos({
      envio: { enviarConvite: async () => Promise.reject(new Error('smtp fora')) },
      identidade: {
        garantirUsuario: async () => ({ usuarioId: 'x', criadoAgora: false }),
        removerUsuario: async () => undefined,
        vincularTenant: async () => undefined,
      },
    });
    await expect(manipuladores['membro.convidado']?.(evento)).rejects.toThrow('smtp fora');
  });

  it('payload incompleto é erro, não e-mail pela metade', async () => {
    const manipuladores = criarManipuladoresDeEventos({
      envio: { enviarConvite: async () => ({ enviado: true }) },
      identidade: {
        garantirUsuario: async () => ({ usuarioId: 'x', criadoAgora: false }),
        removerUsuario: async () => undefined,
        vincularTenant: async () => undefined,
      },
    });
    await expect(
      manipuladores['membro.convidado']?.({ ...evento, payload: { usuarioId: 'u1' } }),
    ).rejects.toThrow(/Evento sem email/);
  });
});
