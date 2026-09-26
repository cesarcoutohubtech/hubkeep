// Porta das preferências de idioma e região (F0-10b, ADR-022). Implementada
// por packages/db sobre app.preferencia_membro e app.tenant: cada usuário só
// enxerga e grava a própria preferência (RLS).
import type { Contexto } from '@hubkeep/dominio';

/** O que o membro gravou; nulo herda do tenant (ou do navegador). */
export interface PreferenciasGravadas {
  idioma: string | null;
  formatoRegional: string | null;
  fuso: string | null;
}

export interface PadroesDoTenant {
  idiomaPadrao: string;
  moeda: string;
  pais: string;
}

export interface PortaPreferencias {
  /** Preferências do usuário do contexto e padrões do tenant; null se não enxerga. */
  ler(
    ctx: Contexto,
  ): Promise<{ membro: PreferenciasGravadas | null; tenant: PadroesDoTenant | null }>;
  /** Grava (cria ou substitui) as do próprio usuário, na unit of work, com auditoria. */
  gravar(ctx: Contexto, preferencias: PreferenciasGravadas): Promise<void>;
}
