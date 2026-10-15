// Comunicação (1c, item 5; ADR-046, decisões C1 a C9 do Cesar de 13/10/2026):
// quem recebe cada aviso e o que fica registrado de cada envio. O envio é do
// worker, pelo outbox; o texto sai do catálogo, no idioma de quem recebe (C6).
//
//   - o papel vira pessoa na hora do envio, pelas atribuições vigentes no
//     hotel do chamado (grupo, bandeira do hotel ou o hotel); o "responsável
//     da OS" é o Técnico da OS ativa, ou os membros ativos da equipe dela;
//   - quem não é membro ativo, ou não tem e-mail, fica fora do envio, com o
//     registro (sem_endereco);
//   - sem provedor configurado (C1), nada sai, e o envio é registrado como
//     sem_provedor;
//   - um envio por evento, destinatário e canal: o índice da 0049 recusa o
//     segundo, e a falha não conta (a nova tentativa grava outra linha).
import { escopoCobreHotel } from './equipes';
import { PermissaoNegada, RegraViolada } from './erros';
import { type DestinatarioDoAviso, PAPEIS_QUE_VEEM_OS_AVISOS } from './monitor-sla';
import { type Resultado, vigente } from './permissoes';
import type { Atribuicao } from './tipos';

export const CANAIS_DE_ENVIO = ['email', 'push'] as const;
export type CanalDeEnvio = (typeof CANAIS_DE_ENVIO)[number];

export const SITUACOES_DE_ENVIO = ['enviado', 'sem_provedor', 'sem_endereco', 'falhou'] as const;
export type SituacaoDeEnvio = (typeof SITUACOES_DE_ENVIO)[number];

/**
 * Acima disto, por pessoa e por dia, abre-se o resumo agrupado (C8). O MVP
 * manda um e-mail por aviso; a contagem mostra quem passou do limite.
 */
export const LIMITE_DE_ENVIOS_POR_DIA = 30;

/** Quem responde pela OS ativa do chamado, como o banco guarda. */
export type ResponsavelDaOsAtiva =
  { tipo: 'tecnico'; usuarioId: string } | { tipo: 'equipe'; membros: readonly string[] } | null;

/**
 * As pessoas de um aviso, sem repetição e em ordem: os papéis pelas
 * atribuições vigentes que cobrem o hotel, e o responsável da OS ativa.
 */
export function pessoasDoAviso(p: {
  destinatarios: readonly DestinatarioDoAviso[];
  atribuicoes: readonly Atribuicao[];
  hotel: { id: string; bandeiraId: string | null };
  responsavelDaOs: ResponsavelDaOsAtiva;
  agora: Date;
}): string[] {
  const pessoas = new Set<string>();
  for (const d of p.destinatarios) {
    if (d === 'responsavel_da_os') {
      const r = p.responsavelDaOs;
      if (r?.tipo === 'tecnico') pessoas.add(r.usuarioId);
      if (r?.tipo === 'equipe') for (const m of r.membros) pessoas.add(m);
      continue;
    }
    for (const a of p.atribuicoes) {
      if (a.papel === d && vigente(a, p.agora) && escopoCobreHotel(a, p.hotel)) {
        pessoas.add(a.usuarioId);
      }
    }
  }
  return [...pessoas].sort();
}

/** O que registrar do envio a uma pessoa, antes de mandar (C1, C3). */
export function situacaoAntesDoEnvio(p: {
  membroAtivo: boolean;
  email: string | null;
  comProvedor: boolean;
}): SituacaoDeEnvio | null {
  if (!p.membroAtivo || !p.email) return 'sem_endereco';
  if (!p.comProvedor) return 'sem_provedor';
  return null;
}

/**
 * Quem vê a contagem de envios por destinatário e por dia (C8): a gestão,
 * como os avisos de SLA. A RLS de app.envio_notificacao mostra só os hotéis
 * de cada um.
 */
export function podeVerContagemDeEnvios(minhas: readonly Atribuicao[], agora: Date): Resultado {
  return minhas.some((a) => vigente(a, agora) && PAPEIS_QUE_VEEM_OS_AVISOS.includes(a.papel))
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada('envios_fora_do_papel', 'Só a gestão vê a contagem de envios.'),
      };
}

/** O período da contagem tem no máximo isto, em dias. */
export const LIMITE_DO_PERIODO_DA_CONTAGEM_DIAS = 31;

/** O início antes do fim e até 31 dias; senão 422 periodo_invalido. */
export function validarPeriodoDaContagem(de: Date, ate: Date): void {
  const dias = (ate.getTime() - de.getTime()) / 86_400_000;
  if (Number.isNaN(dias) || dias <= 0 || dias > LIMITE_DO_PERIODO_DA_CONTAGEM_DIAS) {
    throw new RegraViolada('periodo_invalido', 'O início do período precisa ser antes do fim.', {
      maximoDias: LIMITE_DO_PERIODO_DA_CONTAGEM_DIAS,
    });
  }
}
