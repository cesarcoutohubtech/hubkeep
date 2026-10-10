// Códigos de falha, causa e solução (fase 1b, I6). O código é do tenant, no
// modelo da situação e da categoria (ADR-027): tipo, categoria de ativo
// opcional (nula vale para todas), nome por idioma e chave padrão. O banco
// repete os tipos num check (codigo_manutencao_tipo_lista, migração 0036), e
// tests/valores-canonicos-banco.test.ts confere a paridade.
//
// Decisões do Cesar de 10/10/2026:
// - no PWA, o técnico preenche os códigos como sugestão, e a conclusão nunca é
//   recusada por eles: código que não serve (de outro tipo, desativado ou de
//   outra categoria) é descartado, e a conclusão segue (sugestaoDosCodigos);
// - com a política os.codigos_obrigatorios ligada no hotel, o aceite no web
//   exige falha, causa e solução (exigirCodigosNoAceite). No aceite, o código
//   que não serve é recusado com código de erro (validarCodigosDaOs).
//
// A categoria: o código com categoria serve só para o ativo dessa categoria.
// Sem ativo no chamado (ou com o ativo sem categoria), não há com o que
// comparar, e vale qualquer código ativo do tipo.
import type { CategoriaPadrao } from './categorias';
import { normalizarRotulos, type Rotulos } from './campos-tipados';
import { PermissaoNegada, RegraViolada } from './erros';
import { type Resultado, ehAdminGrupo } from './permissoes';
import type { Atribuicao } from './tipos';

export const TIPOS_DE_CODIGO_DE_MANUTENCAO = ['falha', 'causa', 'solucao'] as const;
export type TipoDeCodigoDeManutencao = (typeof TIPOS_DE_CODIGO_DE_MANUTENCAO)[number];

export const ehTipoDeCodigoDeManutencao = (v: unknown): v is TipoDeCodigoDeManutencao =>
  typeof v === 'string' && (TIPOS_DE_CODIGO_DE_MANUTENCAO as readonly string[]).includes(v);

export interface CodigoPadrao {
  chave: string;
  tipo: TipoDeCodigoDeManutencao;
  /** A categoria padrão a que o código serve; null: todas. */
  categoria: CategoriaPadrao | null;
}

const falha = (chave: string, categoria: CategoriaPadrao | null = null): CodigoPadrao => ({
  chave: `falha_${chave}`,
  tipo: 'falha',
  categoria,
});
const geral = (tipo: 'causa' | 'solucao', chave: string): CodigoPadrao => ({
  chave: `${tipo}_${chave}`,
  tipo,
  categoria: null,
});

/**
 * Os códigos padrão, com nome no catálogo (codigo_manutencao.padrao.<chave>).
 * As falhas por categoria servem às categorias padrão; as gerais, a todas.
 * Causas e soluções são gerais.
 */
export const CODIGOS_PADRAO: readonly CodigoPadrao[] = [
  falha('nao_liga'),
  falha('intermitente'),
  falha('ruido_anormal'),
  falha('vazamento'),
  falha('quebra'),
  falha('nao_refrigera', 'refrigeracao'),
  falha('gelo_excessivo', 'refrigeracao'),
  falha('disjuntor_desarma', 'eletrica'),
  falha('sem_energia', 'eletrica'),
  falha('entupimento', 'hidraulica'),
  falha('baixa_pressao', 'hidraulica'),
  falha('elevador_parado', 'elevadores'),
  falha('porta_do_elevador', 'elevadores'),
  falha('nao_aquece', 'cozinha'),
  falha('nao_centrifuga', 'lavanderia'),
  falha('fechadura_dobradica', 'mobiliario'),
  falha('sem_sinal', 'eletronicos'),
  falha('agua_turva', 'piscina'),
  falha('alarme_indevido', 'seguranca'),
  geral('causa', 'desgaste_natural'),
  geral('causa', 'mau_uso'),
  geral('causa', 'falta_de_preventiva'),
  geral('causa', 'defeito_de_fabricacao'),
  geral('causa', 'instalacao_inadequada'),
  geral('causa', 'sujeira_obstrucao'),
  geral('causa', 'oscilacao_de_energia'),
  geral('causa', 'infiltracao_umidade'),
  geral('causa', 'nao_identificada'),
  geral('solucao', 'troca_de_peca'),
  geral('solucao', 'reparo_ajuste'),
  geral('solucao', 'limpeza_desobstrucao'),
  geral('solucao', 'regulagem_configuracao'),
  geral('solucao', 'lubrificacao'),
  geral('solucao', 'troca_do_equipamento'),
  geral('solucao', 'reinicializacao'),
  geral('solucao', 'servico_de_terceiro'),
  geral('solucao', 'sem_intervencao'),
];

export const LIMITE_DO_NOME_DE_CODIGO = 120;

/** Códigos são do tenant: só o Admin do grupo cria e altera. */
export function podeGerirCodigos(minhas: readonly Atribuicao[], agora: Date): Resultado {
  return ehAdminGrupo(minhas, agora)
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'codigos_so_admin',
          'Só o Admin do grupo gere os códigos de manutenção.',
        ),
      };
}

export function validarTipoDeCodigo(tipo: unknown): TipoDeCodigoDeManutencao {
  if (!ehTipoDeCodigoDeManutencao(tipo)) {
    throw new RegraViolada('codigo_tipo_invalido', 'Tipo de código inválido.');
  }
  return tipo;
}

/**
 * Nomes por idioma. O código do tenant precisa de ao menos um nome; o padrão
 * pode ficar sem nenhum (o nome vem do catálogo).
 */
export function validarNomesDeCodigo(nomes: unknown, chavePadrao: string | null): Rotulos {
  const r = normalizarRotulos(nomes, chavePadrao !== null);
  if (!r) {
    throw new RegraViolada('codigo_nome_invalido', 'Nome de código inválido.', {
      maximo: LIMITE_DO_NOME_DE_CODIGO,
    });
  }
  return r;
}

export interface CodigoParaRegra {
  id: string;
  tipo: TipoDeCodigoDeManutencao;
  categoriaId: string | null;
  ativa: boolean;
}

/** O código serve para o ativo: ativo, do tipo e da categoria dele (ou de todas). */
export const codigoServe = (
  c: CodigoParaRegra,
  tipo: TipoDeCodigoDeManutencao,
  categoriaDoAtivo: string | null,
): boolean =>
  c.ativa &&
  c.tipo === tipo &&
  (c.categoriaId === null || categoriaDoAtivo === null || c.categoriaId === categoriaDoAtivo);

/**
 * Os códigos que a tela oferece para um tipo: os que servem, os da categoria
 * do ativo primeiro (relatório de lacunas, PWA), depois os de todas.
 */
export function codigosQueServem<C extends CodigoParaRegra>(
  codigos: readonly C[],
  tipo: TipoDeCodigoDeManutencao,
  categoriaDoAtivo: string | null,
): C[] {
  const servem = codigos.filter((c) => codigoServe(c, tipo, categoriaDoAtivo));
  return [
    ...servem.filter((c) => c.categoriaId !== null),
    ...servem.filter((c) => c.categoriaId === null),
  ];
}

/** Os três códigos da OS; null: não informado. */
export interface CodigosDaOs {
  falhaId: string | null;
  causaId: string | null;
  solucaoId: string | null;
}

/** Os códigos como a conclusão os manda: cada um opcional. */
export type CodigosSugeridos = { [C in keyof CodigosDaOs]?: string | null | undefined };

export const SEM_CODIGOS: CodigosDaOs = { falhaId: null, causaId: null, solucaoId: null };

const CAMPOS: readonly { campo: keyof CodigosDaOs; tipo: TipoDeCodigoDeManutencao }[] = [
  { campo: 'falhaId', tipo: 'falha' },
  { campo: 'causaId', tipo: 'causa' },
  { campo: 'solucaoId', tipo: 'solucao' },
];

type Motivo =
  'codigo_nao_encontrado' | 'codigo_de_outro_tipo' | 'codigo_inativo' | 'codigo_de_outra_categoria';

/** Por que o código não serve; null se serve. */
function motivoDeNaoServir(
  c: CodigoParaRegra | undefined,
  tipo: TipoDeCodigoDeManutencao,
  categoriaDoAtivo: string | null,
): Motivo | null {
  if (!c) return 'codigo_nao_encontrado';
  if (c.tipo !== tipo) return 'codigo_de_outro_tipo';
  if (!c.ativa) return 'codigo_inativo';
  if (!codigoServe(c, tipo, categoriaDoAtivo)) return 'codigo_de_outra_categoria';
  return null;
}

const RECUSA: Record<Motivo, (tipo: TipoDeCodigoDeManutencao) => RegraViolada> = {
  codigo_nao_encontrado: (tipo) =>
    new RegraViolada('codigo_nao_encontrado', 'Código não encontrado.', { tipo }),
  codigo_de_outro_tipo: (tipo) =>
    new RegraViolada('codigo_de_outro_tipo', 'O código é de outro tipo.', { tipo }),
  codigo_inativo: (tipo) =>
    new RegraViolada('codigo_inativo', 'O código está desativado.', { tipo }),
  codigo_de_outra_categoria: (tipo) =>
    new RegraViolada('codigo_de_outra_categoria', 'O código é de outra categoria de ativo.', {
      tipo,
    }),
};

/**
 * No aceite (web): cada código informado precisa existir, ser do tipo da
 * coluna, estar ativo e servir para a categoria do ativo. Recusa com o código
 * do motivo e o tipo da coluna.
 */
export function validarCodigosDaOs(
  pedido: CodigosDaOs,
  codigos: readonly CodigoParaRegra[],
  categoriaDoAtivo: string | null,
): CodigosDaOs {
  const porId = new Map(codigos.map((c) => [c.id, c]));
  for (const { campo, tipo } of CAMPOS) {
    const id = pedido[campo];
    if (id === null) continue;
    const motivo = motivoDeNaoServir(porId.get(id), tipo, categoriaDoAtivo);
    if (motivo !== null) throw RECUSA[motivo](tipo);
  }
  return pedido;
}

/**
 * Na conclusão (PWA): os códigos são sugestão, e a conclusão nunca é recusada
 * por eles. O que não serve vira null e vai em `descartados`, com o motivo,
 * para a auditoria; o resto é gravado. Nunca lança: uma recusa travaria a
 * fila do aparelho.
 */
export function sugestaoDosCodigos(
  pedido: CodigosSugeridos,
  codigos: readonly CodigoParaRegra[],
  categoriaDoAtivo: string | null,
): { codigos: CodigosDaOs; descartados: { tipo: TipoDeCodigoDeManutencao; motivo: Motivo }[] } {
  const porId = new Map(codigos.map((c) => [c.id, c]));
  const saida: CodigosDaOs = { ...SEM_CODIGOS };
  const descartados: { tipo: TipoDeCodigoDeManutencao; motivo: Motivo }[] = [];
  for (const { campo, tipo } of CAMPOS) {
    const id = pedido[campo] ?? null;
    if (id === null) continue;
    const motivo = motivoDeNaoServir(porId.get(id), tipo, categoriaDoAtivo);
    if (motivo === null) saida[campo] = id;
    else descartados.push({ tipo, motivo });
  }
  return { codigos: saida, descartados };
}

/**
 * Com a política os.codigos_obrigatorios ligada no hotel, o aceite exige os
 * três códigos. Desligada, não exige nada. Nunca é chamada na conclusão.
 */
export function exigirCodigosNoAceite(obrigatorios: boolean, codigos: CodigosDaOs): void {
  if (!obrigatorios) return;
  const faltam = CAMPOS.filter(({ campo }) => codigos[campo] === null).length;
  if (faltam > 0) {
    throw new RegraViolada(
      'codigos_obrigatorios_no_aceite',
      'Informe falha, causa e solução para aceitar a OS.',
      { faltam },
    );
  }
}
