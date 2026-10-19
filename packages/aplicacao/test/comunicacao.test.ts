// Comunicação (1c, item 5; ADR-046): o e-mail do aviso de SLA pelo outbox,
// com o registro de cada envio, e a contagem por destinatário e por dia (C8).
// Portas falsas, sem banco.
import type { Atribuicao } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type ChamadoDoAviso,
  type EnviadorDeEmail,
  type EnviadorDePush,
  type EnvioRegistrado,
  type EventoPendente,
  type InscricaoAtiva,
  type MensagemDePush,
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
  osAtivaId: 'os1',
};

const INSCRICOES: InscricaoAtiva[] = [
  {
    id: 'i-tec-1',
    usuarioId: 'tecnico',
    endpoint: 'https://push.test/1',
    chaves: { p256dh: 'p', auth: 'a' },
  },
  {
    id: 'i-tec-2',
    usuarioId: 'tecnico',
    endpoint: 'https://push.test/2',
    chaves: { p256dh: 'p', auth: 'a' },
  },
  {
    id: 'i-ger',
    usuarioId: 'gerente',
    endpoint: 'https://push.test/3',
    chaves: { p256dh: 'p', auth: 'a' },
  },
];

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

function montar(
  p: {
    email?: EnviadorDeEmail | null;
    push?: EnviadorDePush | null;
    jaEnviados?: string[];
    inscricoes?: InscricaoAtiva[];
  } = {},
) {
  const registros: EnvioRegistrado[] = [];
  const pedidos: { papeis: readonly string[] }[] = [];
  const revogadas: string[] = [];
  const porta: PortaComunicacao = {
    chamadoDoAviso: async (_t, id, papeis) => {
      pedidos.push({ papeis });
      return id === CHAMADO.id ? CHAMADO : null;
    },
    osDoAviso: async (_t, id, r) =>
      id === 'os1'
        ? {
            id,
            hotel: { id: 'h1', nome: 'Hotel Centro' },
            idiomaDoTenant: 'pt-BR',
            responsavelDaOs:
              r.tipo === 'tecnico'
                ? { tipo: 'tecnico', usuarioId: r.usuarioId }
                : { tipo: 'equipe', membros: ['tecnico', 'gerente'] },
          }
        : null,
    pessoas: async (_t, ids) => ids.flatMap((id) => (PESSOAS[id] ? [PESSOAS[id]] : [])),
    inscricoesAtivas: async (_t, ids) =>
      (p.inscricoes ?? INSCRICOES).filter((i) => ids.includes(i.usuarioId)),
    revogarInscricaoRecusada: async (_t, id) => void revogadas.push(id),
    jaEnviado: async (_t, g) =>
      (p.jaEnviados ?? []).includes(`${g.usuarioId}:${g.canal}`) ||
      (p.jaEnviados ?? []).includes(g.usuarioId),
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
      push: p.push === undefined ? null : p.push,
      urlDoSite: 'https://hubkeep.test',
      relogio: { agora: () => AGORA },
    },
  });
  return { manipuladores, registros, pedidos, revogadas };
}

const situacoes = (registros: EnvioRegistrado[], canal: 'email' | 'push' = 'email') =>
  Object.fromEntries(
    registros.filter((r) => r.canal === canal).map((r) => [r.usuarioId, r.situacao]),
  );

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
    expect(registros.filter((r) => r.canal === 'email').map((r) => r.usuarioId)).toEqual([
      'gestor',
    ]);
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
    expect(Object.keys(montar().manipuladores)).toEqual([
      'membro.convidado',
      'chamado.sla_alerta',
      'os.atribuida',
    ]);
  });

  it('payload sem destinatários é erro, não aviso pela metade', async () => {
    const { manipuladores } = montar();
    const e = evento(todos);
    await expect(
      manipuladores['chamado.sla_alerta']?.({ ...e, payload: { ...e.payload, destinatarios: 1 } }),
    ).rejects.toThrow(/Evento sem destinatarios/);
  });
});

const PUSH_OK = (destinos: { endpoint: string; mensagem: MensagemDePush }[]): EnviadorDePush => ({
  enviar: async (d, m) => {
    destinos.push({ endpoint: d.endpoint, mensagem: m });
    return 'entregue';
  },
});

describe('push (ADR-046, C4)', () => {
  const todos = ['responsavel_da_os', 'gerente_hotel', 'gestor_csc'];

  it('sem as chaves VAPID: nada sai; sem aparelho inscrito, sem_endereco', async () => {
    const { manipuladores, registros } = montar();
    await manipuladores['chamado.sla_alerta']?.(evento(todos));
    expect(situacoes(registros, 'push')).toEqual({
      gerente: 'sem_provedor',
      gestor: 'sem_endereco',
      tecnico: 'sem_provedor',
    });
  });

  it('o aviso de SLA vai a cada aparelho, no idioma da pessoa, e abre a OS ativa', async () => {
    const destinos: { endpoint: string; mensagem: MensagemDePush }[] = [];
    const { manipuladores, registros } = montar({ push: PUSH_OK(destinos) });
    await manipuladores['chamado.sla_alerta']?.(evento(todos));
    expect(destinos.map((d) => d.endpoint)).toEqual([
      'https://push.test/3',
      'https://push.test/1',
      'https://push.test/2',
    ]);
    expect(destinos[0]?.mensagem).toEqual({
      titulo: 'Solução vencida',
      corpo: 'Hotel Centro. Abra o HubKeep para ver o chamado.',
      caminho: '/os/os1',
    });
    expect(destinos.some((d) => d.mensagem.corpo.includes('Elevador'))).toBe(false);
    expect(situacoes(registros, 'push')).toEqual({
      gerente: 'enviado',
      gestor: 'sem_endereco',
      tecnico: 'enviado',
    });
  });

  it('a inscrição recusada (404 ou 410) é revogada; sem outra, sem_endereco', async () => {
    const { manipuladores, registros, revogadas } = montar({
      push: {
        enviar: async (d) => (d.endpoint === 'https://push.test/3' ? 'expirada' : 'entregue'),
      },
    });
    await manipuladores['chamado.sla_alerta']?.(evento(['gerente_hotel']));
    expect(revogadas).toEqual(['i-ger']);
    expect(situacoes(registros, 'push')).toEqual({ gerente: 'sem_endereco' });
  });

  it('o erro do serviço de push é falhou; o e-mail das pessoas não para', async () => {
    const enviados: string[] = [];
    const { manipuladores, registros } = montar({
      email: { enviar: async (m) => void enviados.push(m.para) },
      push: {
        enviar: async () => {
          throw new Error('serviço fora');
        },
      },
    });
    await expect(manipuladores['chamado.sla_alerta']?.(evento(['gerente_hotel']))).rejects.toThrow(
      /gerente \(push\): serviço fora/,
    );
    expect(enviados).toEqual(['gerente@x.test']);
    expect(situacoes(registros, 'push')).toEqual({ gerente: 'falhou' });
    expect(situacoes(registros, 'email')).toEqual({ gerente: 'enviado' });
  });

  it('a OS atribuída vai só por push, ao técnico ou aos membros da equipe', async () => {
    const destinos: { endpoint: string; mensagem: MensagemDePush }[] = [];
    const { manipuladores, registros } = montar({ push: PUSH_OK(destinos) });
    const os = (responsavel: Record<string, string>): EventoPendente => ({
      id: 'ev-os',
      tenantId: 't1',
      tipo: 'os.atribuida',
      registroId: 'os1',
      payload: { hotelId: 'h1', acao: 'gerar', responsavel },
    });
    await manipuladores['os.atribuida']?.(os({ tipo: 'tecnico', usuarioId: 'tecnico' }));
    expect(destinos.map((d) => d.endpoint)).toEqual(['https://push.test/1', 'https://push.test/2']);
    expect(destinos[0]?.mensagem).toEqual({
      titulo: 'Nova OS para você',
      corpo: 'Hotel Centro. Abra a fila do dia para ver a OS.',
      caminho: '/os/os1',
    });
    expect(registros.map((r) => [r.usuarioId, r.canal, r.situacao, r.tipoEvento])).toEqual([
      ['tecnico', 'push', 'enviado', 'os.atribuida'],
    ]);

    registros.length = 0;
    await manipuladores['os.atribuida']?.({
      ...os({ tipo: 'equipe', equipeId: 'e1' }),
      id: 'ev-os-2',
    });
    expect(situacoes(registros, 'push')).toEqual({ gerente: 'enviado', tecnico: 'enviado' });
    expect(registros.every((r) => r.canal === 'push')).toBe(true);
  });

  it('a OS que não existe mais não manda nada; o evento sem responsável é erro', async () => {
    const { manipuladores, registros } = montar({ push: PUSH_OK([]) });
    await manipuladores['os.atribuida']?.({
      id: 'ev',
      tenantId: 't1',
      tipo: 'os.atribuida',
      registroId: 'os-sumiu',
      payload: { responsavel: { tipo: 'tecnico', usuarioId: 'tecnico' } },
    });
    expect(registros).toEqual([]);
    await expect(
      manipuladores['os.atribuida']?.({
        id: 'ev',
        tenantId: 't1',
        tipo: 'os.atribuida',
        registroId: 'os1',
        payload: {},
      }),
    ).rejects.toThrow(/Evento sem responsavel/);
  });
});

describe('contagem de envios por destinatário e por dia (C8)', () => {
  const linhas = [
    { usuarioId: 'b', nome: 'B', canal: 'email' as const, dia: '2026-10-12', envios: 31 },
    { usuarioId: 'a', nome: 'A', canal: 'email' as const, dia: '2026-10-13', envios: 5 },
    { usuarioId: 'c', nome: 'C', canal: 'push' as const, dia: '2026-10-13', envios: 30 },
    { usuarioId: 'c', nome: 'C', canal: 'email' as const, dia: '2026-10-13', envios: 30 },
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
    expect(r.dias.map((d) => [d.dia, d.usuarioId, d.canal, d.acimaDoLimite])).toEqual([
      ['2026-10-13', 'c', 'email', false],
      ['2026-10-13', 'c', 'push', false],
      ['2026-10-13', 'a', 'email', false],
      ['2026-10-12', 'b', 'email', true],
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
