// Coluna `busca` de app.local, app.ativo (fase 1a, B6; ADR-030) e app.chamado (C2): o único
// lugar que a calcula, a partir dos campos pesquisáveis. Toda criação e toda
// alteração grava as colunas devolvidas aqui, com a busca junto. A coluna é
// obrigatória e sem default no banco, e o teste busca-unica.test.ts confere
// que nenhum outro trecho de packages/db escreve a busca por conta própria.
import { textoDeBusca } from '@hubkeep/aplicacao';

/** Local: acha-se pelo nome. */
export const colunasPesquisaveisDoLocal = (nome: string) => ({
  nome,
  busca: textoDeBusca(nome),
});

/** Ativo: acha-se pelo nome, fabricante, modelo e número de série. */
export const colunasPesquisaveisDoAtivo = (d: {
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
}) => ({
  nome: d.nome,
  fabricante: d.fabricante,
  modelo: d.modelo,
  numero_serie: d.numeroSerie,
  busca: textoDeBusca([d.nome, d.fabricante, d.modelo, d.numeroSerie].filter(Boolean).join(' ')),
});

/** Chamado: acha-se pela descrição. */
export const colunasPesquisaveisDoChamado = (descricao: string) => ({
  descricao,
  busca: textoDeBusca(descricao),
});
