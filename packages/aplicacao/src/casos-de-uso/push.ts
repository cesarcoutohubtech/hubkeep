// Push do PWA do técnico (1c, ADR-046, C4): o aparelho pede a chave pública
// do servidor, inscreve-se no serviço de push do navegador e grava a
// inscrição aqui; ao desativar, revoga. Cada pessoa mexe só nas próprias
// inscrições (a RLS de app.inscricao_push), e qualquer membro pode ativar o
// push no próprio aparelho: quem recebe o quê é da política de escalonamento
// e da OS, não da inscrição. A inscrição não vai para a auditoria: a própria
// tabela guarda a criação e a revogação.
import type { Contexto } from '@hubkeep/dominio';
import type { PortaInscricoesPush } from '../portas/comunicacao';

export interface CasosDeUsoDePush {
  /** A chave pública VAPID; null: o push não está ligado neste ambiente (C1). */
  configuracao(): { chavePublica: string | null };
  inscrever(
    ctx: Contexto,
    d: { endpoint: string; chaves: { p256dh: string; auth: string } },
  ): Promise<{ id: string }>;
  revogar(ctx: Contexto, endpoint: string): Promise<void>;
}

export function criarCasosDeUsoDePush(deps: {
  inscricoes: PortaInscricoesPush;
  chavePublica: string | null;
}): CasosDeUsoDePush {
  return {
    configuracao: () => ({ chavePublica: deps.chavePublica }),
    inscrever: (ctx, d) => deps.inscricoes.inscrever(ctx, d),
    revogar: (ctx, endpoint) => deps.inscricoes.revogar(ctx, endpoint),
  };
}
