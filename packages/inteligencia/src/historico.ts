// HubKeep Intelligence: o histórico que o motor lê. São formas mínimas,
// montadas pela aplicação a partir das portas do núcleo (chamado, OS, parada,
// ativo, local). O motor nunca lê banco. Os campos marcados com "(fase A)"
// dependem da instrumentação do núcleo (relatório de lacunas do PR-I1) e ficam
// null enquanto ela não existir; o score marca o componente como ausente.

/** Uma corretiva: o chamado e a OS dele, vistos pelo que importa à análise. */
export interface Corretiva {
  id: string;
  hotelId: string;
  localId: string;
  ativoId: string | null;
  abertaEm: Date;
  /** Conclusão da OS; null enquanto não concluída. */
  concluidaEm: Date | null;
  /** Vezes que a OS foi reaberta (auditoria, ação 'reabrir'). */
  reaberturas: number;
  /** Código de falha do catálogo da categoria (fase A); null sem dado. */
  codigoFalha: string | null;
  /** Aberta pouco depois de uma preventiva do ativo (fase 1b); undefined sem dado. */
  aposPreventiva?: boolean;
}

/** O ativo, com o que a análise por modelo e por idade usa. */
export interface AtivoAnalisado {
  id: string;
  hotelId: string;
  categoriaId: string | null;
  fabricante: string | null;
  modelo: string | null;
}

/** O local da corretiva, para a análise por andar. */
export interface LocalAnalisado {
  id: string;
  hotelId: string;
  andar: string | null;
}

/** Criticidade do ativo na escala configurada pelo tenant (fase A). */
export interface Criticidade {
  nivel: number;
  maximo: number;
}

export const ordenarPorAbertura = <T extends { abertaEm: Date }>(xs: readonly T[]): T[] =>
  [...xs].sort((a, b) => a.abertaEm.getTime() - b.abertaEm.getTime());

/** Fabricante e modelo comparáveis entre hotéis: sem espaço sobrando, sem caixa. */
export const chaveDeModelo = (a: Pick<AtivoAnalisado, 'fabricante' | 'modelo'>): string | null => {
  const f = a.fabricante?.trim().toLowerCase() ?? '';
  const m = a.modelo?.trim().toLowerCase() ?? '';
  return f && m ? `${f}|${m}` : null;
};
