// Interface compartilhada do HubKeep (ADR-038). O estilo entra por
// '@hubkeep/ui/estilo.css'; os componentes base chegam na U2. Nenhum texto de
// interface mora aqui: cada componente recebe o texto pronto, do catálogo do
// app que o usa (regra 11).

/** Os dois temas. O escuro é o padrão; o claro vale com data-tema="claro" no <html>. */
export const TEMAS = ['escuro', 'claro'] as const;
export type Tema = (typeof TEMAS)[number];

export const ehTema = (v: unknown): v is Tema =>
  typeof v === 'string' && (TEMAS as readonly string[]).includes(v);
