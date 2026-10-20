// Interface compartilhada do HubKeep (ADR-038). O estilo entra por
// '@hubkeep/ui/estilo.css'. Nenhum texto de interface mora aqui: cada
// componente recebe o texto pronto, do catálogo do app que o usa (regra 11).

/** Os dois temas. O escuro é o padrão; o claro vale com data-tema="claro" no <html>. */
export const TEMAS = ['escuro', 'claro'] as const;
export type Tema = (typeof TEMAS)[number];

export const ehTema = (v: unknown): v is Tema =>
  typeof v === 'string' && (TEMAS as readonly string[]).includes(v);

export { Botao, comoBotao, VARIANTES_DE_BOTAO } from './botao';
export type { PropsDoBotao, TamanhoDeBotao, VarianteDeBotao } from './botao';
export { AreaDeTexto, Campo, Entrada, Selecao } from './campo';
export type { PropsDoCampo, PropsDoControle } from './campo';
export { TelaDeEntrada } from './entrada';
export type { PropsDaTelaDeEntrada } from './entrada';
export { Estrutura, GrupoDeMenu, ItemDeMenu } from './estrutura';
export type { PropsDaEstrutura, PropsDoItemDeMenu, PropsDoLink } from './estrutura';
export { Marca, SimboloDaMarca } from './marca';
export { GraficoDeLinhas, MiniLinha, passoDaGrade } from './grafico';
export type { PropsDoGraficoDeLinhas, SerieDoGrafico } from './grafico';
export { MensagemDeErro, MensagemVazia, Nota, TONS_DE_NOTA } from './mensagens';
export type { PropsDaMensagem, TomDeNota } from './mensagens';
export { Dados, Indicador, Indicadores, Painel, TONS_DE_INDICADOR } from './painel';
export type {
  ParDeDados,
  PropsDoIndicador,
  PropsDoPainel,
  PropsDosDados,
  PropsDosIndicadores,
  TomDeIndicador,
} from './painel';
export { NIVEIS_DE_PRIORIDADE, Selo, SeloDePrioridade, TONS_DE_SELO } from './selos';
export type { NivelDePrioridade, TomDeSelo } from './selos';
export { Tabela } from './tabela';
export type { PropsDaTabela } from './tabela';
