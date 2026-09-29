// Busca no aparelho (fase 1a, B6; ADR-030): filtra os ativos guardados, sem
// rede, com a mesma normalização e os mesmos campos da busca da API (nome,
// fabricante, modelo e número de série). Filtra enquanto se digita; abaixo de
// 3 caracteres, a lista vem inteira, sem aviso.
import { TAMANHO_MINIMO_DA_BUSCA, textoDeBusca } from '@hubkeep/i18n';

interface Pesquisavel {
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
}

export function filtrarPorBusca<T extends Pesquisavel>(itens: readonly T[], digitado: string): T[] {
  const termo = textoDeBusca(digitado);
  if (termo.length < TAMANHO_MINIMO_DA_BUSCA) return [...itens];
  return itens.filter((a) =>
    textoDeBusca(
      [a.nome, a.fabricante, a.modelo, a.numeroSerie].filter(Boolean).join(' '),
    ).includes(termo),
  );
}
