// "Por que estou vendo isso?" (ADR-034; PRD, seção 24): os motivos do score
// viram chave de catálogo e valores, e quem exibe formata pelo i18n (regra
// 11). O motor nunca devolve frase. A chave de cada motivo é
// `inteligencia.motivo.<score>.<componente>`, e os valores são os números e
// textos da evidência do componente (ids e listas ficam de fora: a tela mostra
// os registros pela evidência, filtrados pela RLS da origem).
import { type Componente, type Score, motivosDoScore } from './score';
import type { SinalSistemico } from './sistemico';

export interface Explicacao {
  chave: string;
  valores: Readonly<Record<string, string | number>>;
}

/** Chave do catálogo para o nome do score (`inteligencia.score.<chave>`). */
export const chaveDoNomeDoScore = (score: Pick<Score, 'chave'>): string =>
  `inteligencia.score.${score.chave}`;

/** Chave do catálogo para a faixa, inclusive 'dados_insuficientes'. */
export const chaveDaFaixa = (faixa: string): string => `inteligencia.faixa.${faixa}`;

/** Os motivos que mais pesaram, do maior para o menor, prontos para o catálogo. */
export function explicacaoDoScore(score: Score, quantos = 3): Explicacao[] {
  return motivosDoScore(score, quantos).map((c) => {
    const valores: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(c.evidencia))
      if (typeof v === 'number' || typeof v === 'string') valores[k] = v;
    // O impacto no hóspede pelas reclamações (atenção versão 7) tem frase própria.
    const sufixo =
      c.chave === 'impacto_hospede' && c.evidencia['fonte'] === 'reclamacoes' ? '_reclamacoes' : '';
    return { chave: `inteligencia.motivo.${score.chave}.${c.chave}${sufixo}`, valores };
  });
}

/** Chave do catálogo para o nome do componente (`inteligencia.componente.<score>.<componente>`). */
export const chaveDoNomeDoComponente = (score: Pick<Score, 'chave'>, componente: string): string =>
  `inteligencia.componente.${score.chave}.${componente}`;

/** Chave do aviso de componente sem dado e de peso redistribuído (ADR-034). */
export const CHAVE_DO_AVISO_SEM_DADO = 'inteligencia.detalhamento.sem_dado';

export interface LinhaDoDetalhamento {
  componente: string;
  chaveDoNome: string;
  /** O componente não tem dado: não soma pontos e não recebe peso. */
  semDado: boolean;
  /** Peso configurado, de 0 a 1 sobre a soma dos pesos. */
  peso: number;
  /** Peso usado no cálculo, depois da redistribuição; 0 sem dado. */
  pesoUsado: number;
  /** De 0 a 1; null sem dado. */
  valor: number | null;
  pontos: number;
  valores: Readonly<Record<string, string | number>>;
  /**
   * O que a linha precisa dizer além do valor, pronto para o catálogo: o custo
   * informado em X de Y corretivas, o custo sem dado no tenant, as medições
   * abaixo do mínimo, a garantia sem data e a fonte do impacto no hóspede
   * (atenção versão 7). null quando não há.
   */
  nota: Explicacao | null;
}

export interface Detalhamento {
  linhas: readonly LinhaDoDetalhamento[];
  /**
   * Os componentes sem dado que tinham peso, na ordem do score. Vazio quando
   * nada foi redistribuído (o componente sem dado e com peso 0 não conta).
   */
  semDadoComPeso: readonly string[];
  /** Fração do peso configurado que foi dividida entre os componentes com dado, de 0 a 1. */
  pesoRedistribuido: number;
  /** A chave do aviso, ou null quando não houve redistribuição. */
  chaveDoAviso: string | null;
  /** Os valores do aviso, além dos nomes (`componentes`), que quem exibe monta pelo `chaveDoNome`. */
  valoresDoAviso: { quantidade: number; peso: number };
}

/** A nota de uma linha da atenção (respostas de 10/10/2026), ou null. */
function notaDaLinha(score: Pick<Score, 'chave'>, c: Componente): Explicacao | null {
  if (score.chave !== 'atencao_ativo') return null;
  const ev = c.evidencia;
  const n = (k: string): number => (typeof ev[k] === 'number' ? (ev[k] as number) : 0);
  // Da versão 3 da atenção em diante, a base do custo são as corretivas
  // aceitas (`aceitas`); a versão 2, já gravada, contava as concluídas
  // (`encerradas`) e segue com o texto dela.
  if (c.chave === 'custo' && typeof ev['aceitas'] === 'number') {
    return ev['disponivelNoTenant'] === true
      ? {
          chave: 'inteligencia.detalhamento.custo_informado_nas_aceitas',
          valores: { informadas: n('informadas'), aceitas: n('aceitas') },
        }
      : {
          chave: 'inteligencia.detalhamento.custo_sem_dado_no_tenant_aceitas',
          valores: { percentual: n('percentualNoTenant'), minimo: n('minimoNoTenant') },
        };
  }
  if (c.chave === 'custo' && typeof ev['encerradas'] === 'number') {
    return ev['disponivelNoTenant'] === true
      ? {
          chave: 'inteligencia.detalhamento.custo_informado_em',
          valores: { informadas: n('informadas'), encerradas: n('encerradas') },
        }
      : {
          chave: 'inteligencia.detalhamento.custo_sem_dado_no_tenant',
          valores: { percentual: n('percentualNoTenant'), minimo: n('minimoNoTenant') },
        };
  }
  if (c.chave === 'medicoes_fora_da_faixa' && ev['abaixoDoMinimo'] === true)
    return {
      chave: 'inteligencia.detalhamento.medicoes_abaixo_do_minimo',
      valores: { total: n('total'), minimo: n('minimo') },
    };
  // Atenção versão 7 (ADR-047): de onde veio o impacto no hóspede.
  if (c.chave === 'impacto_hospede' && ev['fonte'] === 'reclamacoes')
    return {
      chave: 'inteligencia.detalhamento.impacto_pelas_reclamacoes',
      valores: {
        confirmadas: n('confirmadas'),
        possiveis: n('possiveis'),
        uhs: n('uhs'),
        janelaDias: n('janelaDias'),
      },
    };
  if (c.chave === 'impacto_hospede' && ev['fonte'] === 'chamados')
    return { chave: 'inteligencia.detalhamento.impacto_pelos_chamados', valores: {} };
  if (c.chave === 'garantia_vencida' && ev['semData'] === true)
    return { chave: 'inteligencia.detalhamento.garantia_sem_data', valores: {} };
  return null;
}

/**
 * "Como o score foi composto": uma linha por componente, o "sem dado" e a
 * redistribuição do peso, prontos para o catálogo. A regra é a mesma para
 * todo o tenant: o peso do componente sem dado vai para os presentes, na
 * proporção dos pesos (`combinar`).
 */
export function detalhamentoDoScore(score: Score): Detalhamento {
  const total = score.componentes.reduce((s, c) => s + c.peso, 0);
  const linhas = score.componentes.map((c): LinhaDoDetalhamento => {
    const valores: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(c.evidencia))
      if (typeof v === 'number' || typeof v === 'string') valores[k] = v;
    return {
      componente: c.chave,
      chaveDoNome: chaveDoNomeDoComponente(score, c.chave),
      semDado: c.valor === null,
      peso: total > 0 ? c.peso / total : 0,
      pesoUsado: c.pesoEfetivo,
      valor: c.valor,
      pontos: c.pontos,
      valores,
      nota: notaDaLinha(score, c),
    };
  });
  const semDadoComPeso = score.componentes
    .filter((c) => c.valor === null && c.peso > 0)
    .map((c) => c.chave);
  const pesoRedistribuido = linhas
    .filter((l) => l.semDado && semDadoComPeso.includes(l.componente))
    .reduce((s, l) => s + l.peso, 0);
  const ha = semDadoComPeso.length > 0 && score.valor !== null;
  return {
    linhas,
    semDadoComPeso: ha ? semDadoComPeso : [],
    pesoRedistribuido: ha ? pesoRedistribuido : 0,
    chaveDoAviso: ha ? CHAVE_DO_AVISO_SEM_DADO : null,
    valoresDoAviso: {
      quantidade: ha ? semDadoComPeso.length : 0,
      peso: ha ? pesoRedistribuido : 0,
    },
  };
}

/**
 * A evidência do sinal sistêmico, pronta para o catálogo. A regra do mesmo
 * modelo tem frase própria, com as taxas, e a das reclamações de hóspede
 * (sistêmico v5), com as UHs; as outras, a genérica (chamados, hotéis e
 * janela), até ganharem a sua.
 */
export function explicacaoDoSinal(sinal: Pick<SinalSistemico, 'regra' | 'evidencia'>): Explicacao {
  const e = sinal.evidencia;
  const comuns = { quantidade: e.quantidade, hoteis: e.hotelIds.length, janelaDias: e.janelaDias };
  if (sinal.regra === 'mesmo_modelo') {
    return {
      chave: 'inteligencia.sistemico.evidencia.mesmo_modelo',
      valores: {
        ...comuns,
        distintos: e.distintos,
        // O sinal gravado antes da v4 já trazia os ativos do modelo.
        populacao: e.ativosDoModelo ?? e.distintos,
        taxa: e.taxaPorAtivo ?? 0,
        base: e.basePorAtivo ?? 0,
      },
    };
  }
  if (sinal.regra === 'reclamacoes_categoria') {
    return {
      chave: 'inteligencia.sistemico.evidencia.reclamacoes_categoria',
      valores: { quantidade: e.quantidade, uhs: e.distintos, janelaDias: e.janelaDias },
    };
  }
  return { chave: 'inteligencia.sistemico.evidencia.generica', valores: comuns };
}
