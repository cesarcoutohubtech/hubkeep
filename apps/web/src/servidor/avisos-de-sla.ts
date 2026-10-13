// Avisos de SLA na resposta da API (1c, ADR-043, M4): o prazo em ISO.
import type { AvisoDeSla } from '@hubkeep/dominio';

export const avisoNaApi = (a: AvisoDeSla) => ({
  tipo: a.tipo,
  nivel: a.nivel,
  prazo: a.prazo.toISOString(),
});
