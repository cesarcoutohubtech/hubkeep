// Manipuladores dos eventos de domínio que o worker consome do outbox
// (ADR-007). Idempotentes: um evento pode ser entregue mais de uma vez se o
// worker cair entre o efeito e a marcação de processado.
//
// Na 1c (ADR-046): o aviso de SLA (chamado.sla_alerta) vai por e-mail a cada
// pessoa dos papéis do nível, no idioma dela (C6), um e-mail por aviso (C8).
// Cada envio fica registrado, e o já registrado não sai de novo. Sem
// provedor (C1), nada sai, e o envio fica como sem_provedor. A falha de uma
// pessoa não para as outras; no fim, o evento falha e o outbox tenta de novo
// só com quem ficou sem envio.
//
// O push (C4) segue o mesmo registro, no canal push: o aviso de SLA vai a
// cada aparelho inscrito das mesmas pessoas, e a OS atribuída (os.atribuida)
// vai só por push, a quem a recebeu no evento. Sem as chaves VAPID, nada sai
// (sem_provedor); sem aparelho inscrito, sem_endereco. A inscrição que o
// serviço de push recusa (404 ou 410) é revogada.
import {
  DESTINATARIOS_DO_AVISO,
  type DestinatarioDoAviso,
  type Papel,
  type Responsavel,
  type SituacaoDeEnvio,
  pessoasDoAviso,
  situacaoAntesDoEnvio,
  situacaoAntesDoPush,
} from '@hubkeep/dominio';
import {
  type IdiomaDeExibicao,
  type Push,
  emailDeAvisoDeSla,
  pushDeAvisoDeSla,
  pushDeOsAtribuida,
  resolverIdioma,
} from '@hubkeep/i18n';
import type {
  ChamadoDoAviso,
  EnviadorDePush,
  InscricaoAtiva,
  PessoaDoEnvio,
  PortaComunicacao,
} from '../portas/comunicacao';
import type { EnviadorDeEmail, EnvioDeConvite, ProvedorDeIdentidade } from '../portas/identidade';

export interface EventoPendente {
  id: string;
  tenantId: string;
  tipo: string;
  /** O registro do evento: no aviso de SLA, o chamado. */
  registroId: string;
  payload: Record<string, unknown>;
}

export type Manipulador = (evento: EventoPendente) => Promise<void>;

const texto = (p: Record<string, unknown>, campo: string): string => {
  const v = p[campo];
  if (typeof v !== 'string' || !v) throw new Error(`Evento sem ${campo}.`);
  return v;
};

const destinatarios = (p: Record<string, unknown>): DestinatarioDoAviso[] => {
  const v = p['destinatarios'];
  if (!Array.isArray(v)) throw new Error('Evento sem destinatarios.');
  return v.filter((d): d is DestinatarioDoAviso =>
    (DESTINATARIOS_DO_AVISO as readonly unknown[]).includes(d),
  );
};

const responsavel = (p: Record<string, unknown>): Responsavel => {
  const r = p['responsavel'] as Partial<{ tipo: string; usuarioId: string; equipeId: string }>;
  if (r?.tipo === 'tecnico' && typeof r.usuarioId === 'string')
    return { tipo: 'tecnico', usuarioId: r.usuarioId };
  if (r?.tipo === 'equipe' && typeof r.equipeId === 'string')
    return { tipo: 'equipe', equipeId: r.equipeId };
  throw new Error('Evento sem responsavel.');
};

/**
 * O que os avisos usam: a porta, o e-mail e o push (null: sem provedor, C1)
 * e o site.
 */
export interface DependenciasDaComunicacao {
  porta: PortaComunicacao;
  email: EnviadorDeEmail | null;
  push: EnviadorDePush | null;
  /** A URL do site, sem a barra no fim, para o link do chamado. */
  urlDoSite: string;
  relogio: { agora(): Date };
}

export function criarManipuladoresDeEventos(deps: {
  identidade: ProvedorDeIdentidade;
  envio: EnvioDeConvite;
  /** Sem ela, o aviso de SLA não tem manipulador e fica pendente no outbox. */
  comunicacao?: DependenciasDaComunicacao;
}): Record<string, Manipulador> {
  const manipuladores: Record<string, Manipulador> = {
    // Etapa (e) do convite (ADR-018): o acesso já está gravado; agora o tenant
    // entra na lista de sugestão do usuário e o e-mail sai.
    'membro.convidado': async (evento) => {
      const p = evento.payload;
      await deps.identidade.vincularTenant(texto(p, 'usuarioId'), evento.tenantId);
      await deps.envio.enviarConvite({
        email: texto(p, 'email'),
        nomeConvidado: texto(p, 'nome'),
        nomeTenant: texto(p, 'nomeTenant'),
        redirecionarPara: texto(p, 'redirecionarPara'),
      });
    },
  };
  const c = deps.comunicacao;
  if (c) {
    manipuladores['chamado.sla_alerta'] = (evento) => avisoDeSla(c, evento);
    manipuladores['os.atribuida'] = (evento) => osAtribuida(c, evento);
  }
  return manipuladores;
}

async function avisoDeSla(c: DependenciasDaComunicacao, evento: EventoPendente): Promise<void> {
  const p = evento.payload;
  const tipo = texto(p, 'tipo');
  const prazo = new Date(texto(p, 'prazo'));
  const lista = destinatarios(p);
  const papeis: Papel[] = lista.filter(
    (d): d is Exclude<DestinatarioDoAviso, 'responsavel_da_os'> => d !== 'responsavel_da_os',
  );
  const chamado = await c.porta.chamadoDoAviso(evento.tenantId, evento.registroId, papeis);
  // O chamado sumiu do tenant (não acontece: não há DELETE); nada a enviar.
  if (!chamado) return;
  const ids = pessoasDoAviso({
    destinatarios: lista,
    atribuicoes: chamado.atribuicoes,
    hotel: chamado.hotel,
    responsavelDaOs: chamado.responsavelDaOs,
    agora: c.relogio.agora(),
  });
  const pessoas = await c.porta.pessoas(evento.tenantId, ids);
  const inscricoes = await c.porta.inscricoesAtivas(evento.tenantId, ids);
  const falhas: string[] = [];
  for (const pessoa of pessoas) {
    try {
      await emailDoAviso(c, evento, chamado, pessoa, { tipo, prazo });
    } catch (e) {
      falhas.push(`${pessoa.usuarioId}: ${(e as Error).message}`);
    }
    try {
      await pushParaPessoa(c, evento, chamado.hotel.id, pessoa, inscricoes, {
        caminho: chamado.osAtivaId ? `/os/${chamado.osAtivaId}` : '/',
        mensagem: (idioma) => pushDeAvisoDeSla(idioma, { tipo, hotel: chamado.hotel.nome }),
        idiomaDoTenant: chamado.idiomaDoTenant,
      });
    } catch (e) {
      falhas.push(`${pessoa.usuarioId} (push): ${(e as Error).message}`);
    }
  }
  if (falhas.length > 0) throw new Error(`Envio do aviso falhou para ${falhas.join('; ')}`);
}

/** A OS atribuída (C2): só push, a quem a recebeu no evento. */
async function osAtribuida(c: DependenciasDaComunicacao, evento: EventoPendente): Promise<void> {
  const os = await c.porta.osDoAviso(
    evento.tenantId,
    evento.registroId,
    responsavel(evento.payload),
  );
  if (!os) return;
  const ids = pessoasDoAviso({
    destinatarios: ['responsavel_da_os'],
    atribuicoes: [],
    hotel: { id: os.hotel.id, bandeiraId: null },
    responsavelDaOs: os.responsavelDaOs,
    agora: c.relogio.agora(),
  });
  const pessoas = await c.porta.pessoas(evento.tenantId, ids);
  const inscricoes = await c.porta.inscricoesAtivas(evento.tenantId, ids);
  const falhas: string[] = [];
  for (const pessoa of pessoas) {
    try {
      await pushParaPessoa(c, evento, os.hotel.id, pessoa, inscricoes, {
        caminho: `/os/${os.id}`,
        mensagem: (idioma) => pushDeOsAtribuida(idioma, { hotel: os.hotel.nome }),
        idiomaDoTenant: os.idiomaDoTenant,
      });
    } catch (e) {
      falhas.push(`${pessoa.usuarioId}: ${(e as Error).message}`);
    }
  }
  if (falhas.length > 0) throw new Error(`Push da OS falhou para ${falhas.join('; ')}`);
}

/**
 * O push a uma pessoa, em cada aparelho inscrito. "enviado" se algum aparelho
 * recebeu; os que o serviço recusou são revogados, e, sem nenhum que
 * receba, fica sem_endereco. O erro de um aparelho é falhou, e o outbox tenta
 * de novo.
 */
async function pushParaPessoa(
  c: DependenciasDaComunicacao,
  evento: EventoPendente,
  hotelId: string,
  pessoa: PessoaDoEnvio,
  todas: readonly InscricaoAtiva[],
  aviso: {
    caminho: string;
    mensagem: (idioma: IdiomaDeExibicao) => Push;
    idiomaDoTenant: string;
  },
): Promise<void> {
  const chave = { eventoId: evento.id, usuarioId: pessoa.usuarioId, canal: 'push' as const };
  if (await c.porta.jaEnviado(evento.tenantId, chave)) return;
  const registrar = (situacao: SituacaoDeEnvio) =>
    c.porta.registrarEnvio(evento.tenantId, {
      ...chave,
      hotelId,
      tipoEvento: evento.tipo,
      situacao,
    });
  const aparelhos = todas.filter((i) => i.usuarioId === pessoa.usuarioId);
  const antes = situacaoAntesDoPush({
    membroAtivo: pessoa.ativo,
    inscricoes: aparelhos.length,
    comProvedor: c.push !== null,
  });
  if (antes !== null || c.push === null) {
    await registrar(antes ?? 'sem_provedor');
    return;
  }
  const idioma = resolverIdioma({ membro: pessoa.idioma, tenant: aviso.idiomaDoTenant });
  const { titulo, corpo } = aviso.mensagem(idioma);
  let entregues = 0;
  try {
    for (const a of aparelhos) {
      const r = await c.push.enviar(a, { titulo, corpo, caminho: aviso.caminho });
      if (r === 'expirada') await c.porta.revogarInscricaoRecusada(evento.tenantId, a.id);
      else entregues++;
    }
  } catch (e) {
    await registrar('falhou');
    throw e;
  }
  await registrar(entregues > 0 ? 'enviado' : 'sem_endereco');
}

async function emailDoAviso(
  c: DependenciasDaComunicacao,
  evento: EventoPendente,
  chamado: ChamadoDoAviso,
  pessoa: PessoaDoEnvio,
  aviso: { tipo: string; prazo: Date },
): Promise<void> {
  const chave = { eventoId: evento.id, usuarioId: pessoa.usuarioId, canal: 'email' as const };
  if (await c.porta.jaEnviado(evento.tenantId, chave)) return;
  const registrar = (situacao: 'enviado' | 'sem_provedor' | 'sem_endereco' | 'falhou') =>
    c.porta.registrarEnvio(evento.tenantId, {
      ...chave,
      hotelId: chamado.hotel.id,
      tipoEvento: evento.tipo,
      situacao,
    });
  const antes = situacaoAntesDoEnvio({
    membroAtivo: pessoa.ativo,
    email: pessoa.email,
    comProvedor: c.email !== null,
  });
  if (antes !== null || c.email === null || pessoa.email === null) {
    await registrar(antes ?? 'sem_provedor');
    return;
  }
  const idioma = resolverIdioma({ membro: pessoa.idioma, tenant: chamado.idiomaDoTenant });
  const mensagem = emailDeAvisoDeSla(idioma, {
    tipo: aviso.tipo,
    descricao: chamado.descricao,
    hotel: chamado.hotel.nome,
    prazo: aviso.prazo,
    fuso: chamado.hotel.fuso,
    link: `${c.urlDoSite}/chamados/${chamado.id}`,
  });
  try {
    await c.email.enviar({
      para: pessoa.email,
      assunto: mensagem.assunto,
      texto: mensagem.texto,
      html: mensagem.html,
    });
  } catch (e) {
    await registrar('falhou');
    throw e;
  }
  await registrar('enviado');
}
