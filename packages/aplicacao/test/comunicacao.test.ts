// Comunicação (1c, item 5; ADR-046): o e-mail do aviso de SLA pelo outbox,
// com o registro de cada envio, e a contagem por destinatário e por dia (C8).
// Portas falsas, sem banco.
import type { Atribuicao } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type ChamadoDoAviso,
  type EnviadorDeEmail,
  type EnvioRegistrado,
  type EventoPendente,
  type PessoaDoEnvio,
  type PortaComunicacao,
  criarCasosDeUsoDeComunicacao,
  criarManipuladoresDeEventos,
} from '../src';

const AGORA = new Date('2026-10-13T12:00:00Z');
const HOTEL = { id: 'h1', nome: 'Hotel Centro', fuso: 'America/Sao_Paulo', bandeiraId: null };
const atr = (usuarioId: string, papel: Atribuicao['papel']): Atribuicao => ({
  id: `${usuarioId}-${papel}`,
  usuarioId,
  papel,
  escopo: papel === 'admin_grupo' ? { tipo: 'grupo' } : { tipo: 'hotel', hotelId: 'h1' },
  validoAte: null,
  revogadoEm: null,
});

const CHAMADO: ChamadoDoAviso = {
  id: 'c1',
  descricao: 'Elevador parado',
  hotel: HOTEL,
  idiomaDoTenant: 'pt-BR',
  atribuicoes: [atr('gerente', 'gerente_hotel'), atr('gestor', 'gestor_csc')],
  responsavelDaOs: { tipo: 'tecnico', usuarioId: 'tecnico' },
};

const PESSOAS: Record<string, PessoaDoEnvio> = {
  gerente: { usuarioId: 'gerente', ativo: true, email: 'gerente@x.test', idioma: null },
  gestor: { usuarioId: 'gestor', ativo: true, email: 'gestor@x.test', idioma: 'en' },
  tecnico: { usuarioId: 'tecnico', ativo: true, email: null, idioma: null },
};

const evento = (destinatarios: string[]): EventoPendente => ({
  id: 'ev1',
  tenantId: 't1',
  tipo: 'chamado.sla_alerta',
  registroId: 'c1',
  payload: {
    hotelId: 'h1',
    tipo: 'solucao_vencida',
    nivel: 'vencido',
    prazo: '2026-10-13T20:00:00.000Z',
    destinatarios,
  },
});

function montar(p: { email?: EnviadorDeEmail | null; jaEnviados?: string[] } = {}) {
  const registros: EnvioRegistrado[] = [];
  const pedidos: { papeis: readonly string[] }[] = [];
  const porta: PortaComunicacao = {
    chamadoDoAviso: async (_t, id, papeis) => {
      pedidos.push({ papeis });
      return id === CHAMADO.id ? CHAMADO : null;
    },
    pessoas: async (_t, ids) => ids.flatMap((id) => (PESSOAS[id] ? [PESSOAS[id]] : [])),
    jaEnviado: async (_t, g) => (p.jaEnviados ?? []).includes(g.usuarioId),
    registrarEnvio: async (_t, e) => void registros.push(e),
    contagemPorDia: async () => [],
  };
  const manipuladores = criarManipuladoresDeEventos({
    identidade: {
      garantirUsuario: async () => ({ usuarioId: 'x', criadoAgora: false }),
      removerUsuario: async () => undefined,
      vincularTenant: async () => undefined,
    },
    envio: { enviarConvite: async () => ({ enviado: true }) },
    comunicacao: {
      porta,
      email: p.email === undefined ? null : p.email,
      urlDoSite: 'https://hubkeep.test',
      relogio: { agora: () => AGORA },
    },
  });
  return { manipuladores, registros, pedidos };
}

const situacoes = (registros: EnvioRegistrado[]) =>
  Object.fromEntries(registros.map((r) => [r.usuarioId, r.situacao]));

describe('aviso de SLA por e-mail (ADR-046)', () => {
  const todos = ['responsavel_da_os', 'gerente_hotel', 'gestor_csc'];

  it('sem provedor (C1): nada sai, e cada envio fica como sem_provedor ou sem_endereco', async () => {
    const { manipuladores, registros, pedidos } = montar();
    await manipuladores['chamado.sla_alerta']?.(evento(todos));
    expect(pedidos[0]?.papeis).toEqual(['gerente_hotel', 'gestor_csc']);
    expect(situacoes(registros)).toEqual({
      gerente: 'sem_provedor',
      gestor: 'sem_provedor',
      tecnico: 'sem_endereco',
    });
    expect(registros[0]).toMatchObject({
      hotelId: 'h1',
      eventoId: 'ev1',
      tipoEvento: 'chamado.sla_alerta',
      canal: 'email',
    });
  });

  it('com provedor: um e-mail por pessoa, no idioma dela ou no do tenant (C6)', async () => {
    const enviados: { para: string; assunto: string; texto: string }[] = [];
    const { manipuladores, registros } = montar({
      email: { enviar: async (m) => void enviados.push(m) },
    });
    await manipuladores['chamado.sla_alerta']?.(evento(todos));
    expect(enviados.map((e) => [e.para, e.assunto])).toEqual([
      ['gerente@x.test', 'Solução vencida — Hotel Centro'],
      ['gestor@x.test', 'Resolution overdue — Hotel Centro'],
    ]);
    expect(enviados[0]?.texto).toContain('https://hubkeep.test/chamados/c1');
    expect(situacoes(registros)).toEqual({
      gerente: 'enviado',
      gestor: 'enviado',
      tecnico: 'sem_endereco',
    });
  });

  it('o envio já registrado não sai de novo (o outbox entrega duas vezes)', async () => {
    const enviados: string[] = [];
    const { manipuladores, registros } = montar({
      email: { enviar: async (m) => void enviados.push(m.para) },
      jaEnviados: ['gerente'],
    });
    await manipuladores['chamado.sla_alerta']?.(evento(['gerente_hotel', 'gestor_csc']));
    expect(enviados).toEqual(['gestor@x.test']);
    expect(registros.map((r) => r.usuarioId)).toEqual(['gestor']);
  });

  it('a falha de uma pessoa não para as outras; no fim, o evento falha', async () => {
    const enviados: string[] = [];
    const { manipuladores, registros } = montar({
      email: {
        enviar: async (m) => {
          if (m.para === 'gerente@x.test') throw new Error('provedor fora');
          enviados.push(m.para);
        },
      },
    });
    await expect(
      manipuladores['chamado.sla_alerta']?.(evento(['gerente_hotel', 'gestor_csc'])),
    ).rejects.toThrow(/gerente: provedor fora/);
    expect(enviados).toEqual(['gestor@x.test']);
    expect(situacoes(registros)).toEqual({ gerente: 'falhou', gestor: 'enviado' });
  });

  it('sem a comunicação na composição, o aviso não tem manipulador e fica pendente', () => {
    const manipuladores = criarManipuladoresDeEventos({
      identidade: {
        garantirUsuario: async () => ({ usuarioId: 'x', criadoAgora: false }),
        removerUsuario: async () => undefined,
        vincularTenant: async () => undefined,
      },
      envio: { enviarConvite: async () => ({ enviado: true }) },
    });
    expect(Object.keys(manipuladores)).toEqual(['membro.convidado']);
  });

  it('payload sem destinatários é erro, não aviso pela metade', async () => {
    const { manipuladores } = montar();
    const e = evento(todos);
    await expect(
      manipuladores['chamado.sla_alerta']?.({ ...e, payload: { ...e.payload, destinatarios: 1 } }),
    ).rejects.toThrow(/Evento sem destinatarios/);
  });
});

describe('contagem de envios por destinatário e por dia (C8)', () => {
  const linhas = [
    { usuarioId: 'b', nome: 'B', dia: '2026-10-12', envios: 31 },
    { usuarioId: 'a', nome: 'A', dia: '2026-10-13', envios: 5 },
    { usuarioId: 'c', nome: 'C', dia: '2026-10-13', envios: 30 },
  ];
  const caso = (papel: Atribuicao['papel']) =>
    criarCasosDeUsoDeComunicacao({
      comunicacao: { contagemPorDia: async () => linhas },
      atribuicoes: { doUsuario: async () => [atr('eu', papel)] },
      relogio: { agora: () => AGORA },
    });
  const ctx = { usuarioId: 'eu', tenantId: 't1' };
  const periodo = { de: '2026-10-01T00:00:00Z', ate: '2026-10-14T00:00:00Z' };

  it('do dia mais recente, de quem recebeu mais; acima de 30 marca o limite', async () => {
    const r = await caso('gestor_csc').contagemDeEnvios(ctx, periodo);
    expect(r.limite).toBe(30);
    expect(r.dias.map((d) => [d.dia, d.usuarioId, d.acimaDoLimite])).toEqual([
      ['2026-10-13', 'c', false],
      ['2026-10-13', 'a', false],
      ['2026-10-12', 'b', true],
    ]);
  });

  it('só a gestão vê; o período tem até 31 dias', async () => {
    await expect(caso('tecnico').contagemDeEnvios(ctx, periodo)).rejects.toMatchObject({
      codigo: 'envios_fora_do_papel',
    });
    await expect(
      caso('admin_grupo').contagemDeEnvios(ctx, {
        de: '2026-09-01T00:00:00Z',
        ate: '2026-10-14T00:00:00Z',
      }),
    ).rejects.toMatchObject({ codigo: 'periodo_invalido' });
    await expect(
      caso('admin_grupo').contagemDeEnvios(ctx, { de: periodo.ate, ate: periodo.de }),
    ).rejects.toMatchObject({ codigo: 'periodo_invalido' });
  });
});
