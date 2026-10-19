// O sinal do hóspede (ADR-047, a 1.5 sem IA; Cesar e Kaio, 16/10/2026): a
// reclamação ou avaliação de hóspede, importada por CSV e classificada à mão.
// - A importação é de um hotel por vez, com as colunas fixas do HubKeep
//   (COLUNAS_DO_CSV). O navegador lê o arquivo e manda as linhas; aqui cada
//   linha é validada e normalizada, e a resposta diz, por linha, se entrou,
//   se era repetida ou o código do erro. A mesma avaliação (hotel, fonte e
//   código externo) entra uma vez: a reimportação conta como repetida e não
//   muda a que existe.
// - A classificação é de uma pessoa: se é manutenção e, sendo, a categoria, a
//   UH e o ativo, com o estado da ligação (LIGACOES_DO_SINAL). Nada liga a
//   reclamação ao ativo sem uma pessoa ("correlação não é causa").
// - Quem vê, importa e classifica: quem decide insight no hotel, como a
//   página do ativo (podeDecidirInsight).
// - Sem dado pessoal do hóspede: as colunas não trazem nome, contato nem
//   reserva.
// Sem IA: a sugestão de classificação espera o provedor (regra 9).
import { NaoEncontrado, RegraViolada, conflitoDeVersao } from '@hubkeep/dominio';
import { podeDecidirInsight } from './insight';
import { type PortasDoPainel, ativoNaoEncontrado, exigirPainel } from './painel';

/** Os três estados da ligação com o ativo (ADR-033); o check da 0052 tem os mesmos. */
export const LIGACOES_DO_SINAL = ['sem_ligacao', 'possivel', 'confirmada'] as const;
export type LigacaoDoSinal = (typeof LIGACOES_DO_SINAL)[number];
export const ehLigacaoDoSinal = (v: string): v is LigacaoDoSinal =>
  (LIGACOES_DO_SINAL as readonly string[]).includes(v);

/** As colunas do CSV do HubKeep, na ordem do modelo. */
export const COLUNAS_DO_CSV = [
  'id_externo',
  'data',
  'fonte',
  'nota',
  'escala',
  'texto',
  'idioma',
  'uh',
] as const;
export type ColunaDoCsv = (typeof COLUNAS_DO_CSV)[number];

/** O máximo de linhas numa importação. */
export const LIMITE_DA_IMPORTACAO = 1000;

export const TAMANHO_DO_ID_EXTERNO = 200;
export const TAMANHO_DA_FONTE = 40;
export const TAMANHO_DO_TEXTO = 4000;
export const TAMANHO_DO_IDIOMA = 20;
export const TAMANHO_DA_UH = 40;
export const ESCALA_MAXIMA = 100;
/** A data da avaliação pode passar de agora só por essa folga (fusos e relógios). */
export const FOLGA_DA_DATA_MS = 24 * 60 * 60 * 1000;

/** Uma linha como veio do CSV: o texto de cada coluna, ou vazio. */
export type LinhaDoCsv = { [C in ColunaDoCsv]?: string | undefined };

export const ERROS_DA_LINHA = [
  'id_externo_ausente',
  'id_externo_longo',
  'data_invalida',
  'data_no_futuro',
  'fonte_invalida',
  'nota_invalida',
  'escala_invalida',
  'sem_conteudo',
  'texto_longo',
  'idioma_invalido',
  'uh_longa',
  'repetida_no_arquivo',
] as const;
export type ErroDaLinha = (typeof ERROS_DA_LINHA)[number];

export interface SinalNormalizado {
  fonte: string;
  idExterno: string;
  ocorridoEm: Date;
  nota: number | null;
  escala: number | null;
  texto: string | null;
  idioma: string | null;
  uhCitada: string | null;
}

export type LinhaValidada =
  { ok: true; sinal: SinalNormalizado } | { ok: false; erro: ErroDaLinha };

const vazioParaNull = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

/**
 * A fonte como código curto: sem acento, em minúsculas, com espaço e hífen
 * virando "_" ("Google Reviews" → "google_reviews"). Null se não sobra um
 * código válido.
 */
export function fonteNormalizada(v: string | undefined): string | null {
  const t = (v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return new RegExp(`^[a-z0-9_]{1,${TAMANHO_DA_FONTE}}$`).test(t) ? t : null;
}

/** Número com ponto ou vírgula decimal; null se vazio; NaN se não é número. */
function numero(v: string | undefined): number | null {
  const t = vazioParaNull(v);
  if (t === null) return null;
  return /^\d+([.,]\d+)?$/.test(t) ? Number(t.replace(',', '.')) : Number.NaN;
}

/**
 * A data da avaliação: o dia (AAAA-MM-DD), que vira o meio-dia em UTC, para
 * cair no mesmo dia em qualquer fuso do Brasil; ou o instante com fuso
 * (AAAA-MM-DDTHH:MM, com segundos opcionais, e Z ou ±HH:MM). Sem fuso, o
 * instante é ambíguo e não entra.
 */
export function dataDaAvaliacao(v: string | undefined): Date | null {
  const t = (v ?? '').trim();
  const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const instante = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(
    t,
  );
  if (!dia && !instante) return null;
  const d = new Date(dia ? `${t}T12:00:00Z` : t);
  if (Number.isNaN(d.getTime())) return null;
  // Recusa o dia que não existe (2026-02-30 vira março no Date).
  if (dia && d.toISOString().slice(0, 10) !== t) return null;
  return d;
}

/** Valida e normaliza uma linha do CSV. */
export function validarLinha(linha: LinhaDoCsv, agora: Date): LinhaValidada {
  const falha = (erro: ErroDaLinha): LinhaValidada => ({ ok: false, erro });
  const idExterno = vazioParaNull(linha.id_externo);
  if (idExterno === null) return falha('id_externo_ausente');
  if (idExterno.length > TAMANHO_DO_ID_EXTERNO) return falha('id_externo_longo');
  const ocorridoEm = dataDaAvaliacao(linha.data);
  if (!ocorridoEm) return falha('data_invalida');
  if (ocorridoEm.getTime() > agora.getTime() + FOLGA_DA_DATA_MS) return falha('data_no_futuro');
  const fonte = fonteNormalizada(linha.fonte);
  if (!fonte) return falha('fonte_invalida');
  const nota = numero(linha.nota);
  const escala = numero(linha.escala);
  if (escala !== null && (!Number.isInteger(escala) || escala < 1 || escala > ESCALA_MAXIMA)) {
    return falha('escala_invalida');
  }
  if (nota !== null && (Number.isNaN(nota) || escala === null || nota > escala)) {
    return falha('nota_invalida');
  }
  if (nota === null && escala !== null) return falha('nota_invalida');
  const texto = vazioParaNull(linha.texto);
  if (texto === null && nota === null) return falha('sem_conteudo');
  if (texto !== null && texto.length > TAMANHO_DO_TEXTO) return falha('texto_longo');
  const idioma = vazioParaNull(linha.idioma);
  if (idioma !== null && !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(idioma)) {
    return falha('idioma_invalido');
  }
  if (idioma !== null && idioma.length > TAMANHO_DO_IDIOMA) return falha('idioma_invalido');
  const uhCitada = vazioParaNull(linha.uh);
  if (uhCitada !== null && uhCitada.length > TAMANHO_DA_UH) return falha('uh_longa');
  return {
    ok: true,
    sinal: {
      fonte,
      idExterno,
      ocorridoEm,
      nota: nota === null ? null : Math.round(nota * 100) / 100,
      escala,
      texto,
      idioma,
      uhCitada,
    },
  };
}

export interface HotelDoSinal {
  id: string;
  bandeiraId: string | null;
}

export interface ImportacaoGravada {
  hotelId: string;
  importadoPor: string;
  em: Date;
  sinais: readonly SinalNormalizado[];
}

export interface SinalParaClassificar {
  id: string;
  hotelId: string;
  bandeiraId: string | null;
  versao: number;
}

export interface ReferenciasDaClassificacao {
  ativo: {
    id: string;
    hotelId: string;
    categoriaId: string | null;
    desativadoEm: Date | null;
  } | null;
  uh: { id: string; hotelId: string; tipo: string } | null;
  categoria: { id: string } | null;
}

export interface ClassificacaoGravada {
  sinalId: string;
  versaoEsperada: number;
  manutencao: boolean;
  categoriaId: string | null;
  uhId: string | null;
  ativoId: string | null;
  ligacao: LigacaoDoSinal;
  classificadoPor: string;
  em: Date;
}

/** O que o sinal do hóspede lê e grava, além das portas do painel, no contexto de quem pede. */
export interface PortasDoSinalDoHospede extends PortasDoPainel {
  /** O hotel, se quem pede o lê, com a bandeira. */
  hotelDoSinal(hotelId: string): Promise<HotelDoSinal | null>;
  /**
   * Grava os sinais de um lote (repetidos ficam de fora, sem mudar o que
   * existe), com a auditoria e o evento. Devolve o lote e as chaves
   * (`fonte|idExterno`) que entraram.
   */
  gravarSinais(i: ImportacaoGravada): Promise<{ loteId: string; inseridos: readonly string[] }>;
  /** O sinal, se quem pede o lê, com a bandeira do hotel. */
  sinalParaClassificar(id: string): Promise<SinalParaClassificar | null>;
  /** O ativo, a UH e a categoria citados, se quem pede os lê. */
  referenciasDaClassificacao(r: {
    ativoId: string | null;
    uhId: string | null;
    categoriaId: string | null;
  }): Promise<ReferenciasDaClassificacao>;
  /** Grava com a trava de versão (conflito_de_versao), a auditoria e o evento. */
  classificar(c: ClassificacaoGravada): Promise<{ versao: number }>;
}

export const chaveDoSinal = (s: { fonte: string; idExterno: string }): string =>
  `${s.fonte}|${s.idExterno}`;

export type ResultadoDaLinha =
  | { linha: number; resultado: 'entrou' | 'repetida' }
  | { linha: number; resultado: 'erro'; erro: ErroDaLinha };

export interface ResultadoDaImportacao {
  loteId: string | null;
  entraram: number;
  repetidas: number;
  erros: number;
  linhas: ResultadoDaLinha[];
}

export interface PedidoDeImportacao {
  hotelId: string;
  usuarioId: string;
  linhas: readonly LinhaDoCsv[];
}

const hotelNaoEncontrado = (): NaoEncontrado =>
  new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');

/** Quem decide insight no hotel; senão, o hotel "não existe" para quem pede. */
async function exigirHotel(
  p: PortasDoSinalDoHospede,
  hotelId: string,
  agora: Date,
): Promise<HotelDoSinal> {
  const atribuicoes = await exigirPainel(p, agora);
  const hotel = await p.hotelDoSinal(hotelId);
  if (
    !hotel ||
    !podeDecidirInsight(
      atribuicoes,
      { tipo: 'hotel', hotelId: hotel.id, bandeiraId: hotel.bandeiraId },
      agora,
    )
  ) {
    throw hotelNaoEncontrado();
  }
  return hotel;
}

/**
 * Importa as linhas do CSV num hotel. A linha com erro não impede as outras;
 * a linha 1 é a primeira depois do cabeçalho. Sem nenhuma linha válida, nada
 * é gravado e o lote fica null.
 */
export async function importarSinais(
  p: PortasDoSinalDoHospede,
  pedido: PedidoDeImportacao,
  agora: Date,
): Promise<ResultadoDaImportacao> {
  if (!pedido.linhas.length) {
    throw new RegraViolada('importacao_vazia', 'A importação não tem linhas.');
  }
  if (pedido.linhas.length > LIMITE_DA_IMPORTACAO) {
    throw new RegraViolada('importacao_grande', 'A importação passa do limite de linhas.', {
      limite: LIMITE_DA_IMPORTACAO,
    });
  }
  const hotel = await exigirHotel(p, pedido.hotelId, agora);

  const vistas = new Set<string>();
  const validas: { linha: number; sinal: SinalNormalizado }[] = [];
  const linhas: ResultadoDaLinha[] = pedido.linhas.map((l, i) => {
    const linha = i + 1;
    const v = validarLinha(l, agora);
    if (!v.ok) return { linha, resultado: 'erro', erro: v.erro };
    const chave = chaveDoSinal(v.sinal);
    if (vistas.has(chave)) return { linha, resultado: 'erro', erro: 'repetida_no_arquivo' };
    vistas.add(chave);
    validas.push({ linha, sinal: v.sinal });
    return { linha, resultado: 'entrou' };
  });

  let loteId: string | null = null;
  if (validas.length) {
    const r = await p.gravarSinais({
      hotelId: hotel.id,
      importadoPor: pedido.usuarioId,
      em: agora,
      sinais: validas.map((v) => v.sinal),
    });
    loteId = r.loteId;
    const inseridos = new Set(r.inseridos);
    for (const v of validas) {
      if (!inseridos.has(chaveDoSinal(v.sinal))) {
        linhas[v.linha - 1] = { linha: v.linha, resultado: 'repetida' };
      }
    }
  }
  const conta = (r: ResultadoDaLinha['resultado']) =>
    linhas.filter((l) => l.resultado === r).length;
  return {
    loteId,
    entraram: conta('entrou'),
    repetidas: conta('repetida'),
    erros: conta('erro'),
    linhas,
  };
}

export interface PedidoDeClassificacao {
  sinalId: string;
  usuarioId: string;
  versao: number;
  manutencao: boolean;
  categoriaId: string | null;
  uhId: string | null;
  ativoId: string | null;
  ligacao: LigacaoDoSinal;
}

const sinalNaoEncontrado = (): NaoEncontrado =>
  new NaoEncontrado('sinal_nao_encontrado', 'Reclamação não encontrada.');

/**
 * Uma pessoa classifica a reclamação. As regras:
 * - não é manutenção: sem categoria, sem ativo e sem ligação (a UH pode ficar);
 * - com ativo, a ligação é possível ou confirmada; sem ativo, sem ligação;
 * - o ativo e a UH são do hotel da reclamação; o ativo está em uso; a UH é UH;
 * - com ativo, a categoria é a dele: vazia, vem do ativo; diferente, erro.
 * Reclassificar é permitido, com a trava de versão.
 */
export async function classificarSinal(
  p: PortasDoSinalDoHospede,
  pedido: PedidoDeClassificacao,
  agora: Date,
): Promise<{ versao: number }> {
  const atribuicoes = await exigirPainel(p, agora);
  const sinal = await p.sinalParaClassificar(pedido.sinalId);
  if (
    !sinal ||
    !podeDecidirInsight(
      atribuicoes,
      { tipo: 'hotel', hotelId: sinal.hotelId, bandeiraId: sinal.bandeiraId },
      agora,
    )
  ) {
    throw sinalNaoEncontrado();
  }
  if (sinal.versao !== pedido.versao) throw conflitoDeVersao(sinal.versao);
  if (!ehLigacaoDoSinal(pedido.ligacao)) {
    throw new RegraViolada('ligacao_invalida', 'Estado de ligação inválido.');
  }
  if (!pedido.manutencao && (pedido.categoriaId || pedido.ativoId)) {
    throw new RegraViolada(
      'classificacao_sem_manutencao',
      'Sem manutenção, a reclamação não tem categoria nem ativo.',
    );
  }
  if ((pedido.ativoId === null) !== (pedido.ligacao === 'sem_ligacao')) {
    throw new RegraViolada(
      'ligacao_sem_ativo',
      'Com ativo, a ligação é possível ou confirmada; sem ativo, sem ligação.',
    );
  }

  const ref = await p.referenciasDaClassificacao({
    ativoId: pedido.ativoId,
    uhId: pedido.uhId,
    categoriaId: pedido.categoriaId,
  });
  let categoriaId = pedido.categoriaId;
  if (pedido.ativoId) {
    const a = ref.ativo;
    if (!a || a.hotelId !== sinal.hotelId) throw ativoNaoEncontrado();
    if (a.desativadoEm && a.desativadoEm.getTime() <= agora.getTime()) {
      throw new RegraViolada('ativo_baixado', 'O ativo foi baixado.');
    }
    if (categoriaId && a.categoriaId && categoriaId !== a.categoriaId) {
      throw new RegraViolada('categoria_do_ativo', 'A categoria é a do ativo.');
    }
    categoriaId = categoriaId ?? a.categoriaId;
  }
  if (pedido.uhId) {
    const u = ref.uh;
    if (!u || u.hotelId !== sinal.hotelId || u.tipo !== 'uh') {
      throw new NaoEncontrado('uh_nao_encontrada', 'UH não encontrada.');
    }
  }
  if (pedido.categoriaId && !ref.categoria) {
    throw new NaoEncontrado('categoria_nao_encontrada', 'Categoria não encontrada.');
  }

  return p.classificar({
    sinalId: sinal.id,
    versaoEsperada: pedido.versao,
    manutencao: pedido.manutencao,
    categoriaId: pedido.manutencao ? categoriaId : null,
    uhId: pedido.uhId,
    ativoId: pedido.ativoId,
    ligacao: pedido.ligacao,
    classificadoPor: pedido.usuarioId,
    em: agora,
  });
}

/** O recorte da fila: sem classificação, de manutenção, fora da manutenção ou todas. */
export const SITUACOES_DA_FILA = ['pendentes', 'manutencao', 'fora', 'todas'] as const;
export type SituacaoDaFila = (typeof SITUACOES_DA_FILA)[number];

/** O máximo de reclamações na fila, da mais recente para a mais antiga. */
export const LIMITE_DA_FILA = 200;

/** A reclamação na fila, com a classificação que tiver. */
export interface SinalDaFila {
  id: string;
  hotelId: string;
  fonte: string;
  idExterno: string;
  ocorridoEm: Date;
  nota: number | null;
  escala: number | null;
  /** Null sem texto na importação ou depois do apagamento da retenção. */
  texto: string | null;
  textoApagadoEm: Date | null;
  idioma: string | null;
  uhCitada: string | null;
  /** Null enquanto ninguém classificou. */
  manutencao: boolean | null;
  categoriaId: string | null;
  uhId: string | null;
  ativoId: string | null;
  ligacao: LigacaoDoSinal;
  classificadoEm: Date | null;
  classificadoPor: string | null;
  importadoEm: Date;
  versao: number;
  /** O chamado aberto a partir da reclamação (adendo de 19/10/2026); null sem chamado. */
  chamadoId: string | null;
}

export interface PortasDaFilaDoSinal extends PortasDoSinalDoHospede {
  /** As reclamações do hotel no recorte, da mais recente para a mais antiga, até `limite`. */
  sinaisDoHotel(
    hotelId: string,
    situacao: SituacaoDaFila,
    limite: number,
  ): Promise<readonly SinalDaFila[]>;
}

export interface FilaDoSinal {
  sinais: SinalDaFila[];
  /** Há mais reclamações no recorte do que a fila mostra. */
  limitada: boolean;
  nomes: {
    ativos: Readonly<Record<string, string>>;
    pessoas: Readonly<Record<string, string>>;
  };
}

export const ehSituacaoDaFila = (v: string): v is SituacaoDaFila =>
  (SITUACOES_DA_FILA as readonly string[]).includes(v);

/**
 * A fila de classificação de um hotel, para quem decide insight nele; o
 * hotel fora disso "não existe". O nome do ativo e o de quem classificou vêm
 * junto.
 */
export async function listarSinais(
  p: PortasDaFilaDoSinal,
  pedido: { hotelId: string; situacao: SituacaoDaFila },
  agora: Date,
): Promise<FilaDoSinal> {
  const hotel = await exigirHotel(p, pedido.hotelId, agora);
  const lidos = await p.sinaisDoHotel(hotel.id, pedido.situacao, LIMITE_DA_FILA + 1);
  const sinais = lidos.slice(0, LIMITE_DA_FILA);
  const unicos = (xs: readonly (string | null)[]) => [
    ...new Set(xs.filter((x): x is string => x !== null)),
  ];
  const nomes = await p.nomes({
    hotelIds: [],
    bandeiraIds: [],
    usuarioIds: unicos(sinais.map((s) => s.classificadoPor)),
    ativoIds: unicos(sinais.map((s) => s.ativoId)),
  });
  return {
    sinais,
    limitada: lidos.length > LIMITE_DA_FILA,
    nomes: { ativos: nomes.ativos, pessoas: nomes.pessoas },
  };
}
