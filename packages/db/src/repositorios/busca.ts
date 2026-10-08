// Coluna `busca` de app.local, app.ativo (fase 1a, B6; ADR-030) e app.chamado (C2): o único
// lugar que a calcula, a partir dos campos pesquisáveis. Toda criação e toda
// alteração grava as colunas devolvidas aqui, com a busca junto. A coluna é
// obrigatória e sem default no banco, e o teste busca-unica.test.ts confere
// que nenhum outro trecho de packages/db escreve a busca por conta própria.
import { textoDeBusca } from '@hubkeep/aplicacao';

const buscaDoLocal = (nome: string, edificacao: string | null) =>
  textoDeBusca([nome, edificacao].filter(Boolean).join(' '));

/** Local: acha-se pelo nome e pela edificação (I2). */
export const colunasPesquisaveisDoLocal = (d: { nome: string; edificacao: string | null }) => ({
  nome: d.nome,
  edificacao: d.edificacao,
  busca: buscaDoLocal(d.nome, d.edificacao),
});

/**
 * UH gravada pelo worker a partir do sistema hoteleiro (promoção): o nome vem
 * do CM, e a edificação é a que já está gravada (o HubKeep a edita, o conector
 * não; o worker nem tem UPDATE na coluna). Só o nome e a busca são gravados.
 */
export const colunasPesquisaveisDaUhDoSistema = (
  nome: string,
  edificacaoGravada: string | null,
) => ({
  nome,
  busca: buscaDoLocal(nome, edificacaoGravada),
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
