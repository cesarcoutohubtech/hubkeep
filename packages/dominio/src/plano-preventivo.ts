// Planos preventivos (fase 1b, PV2; ADR-041, aprovado pelo Cesar em
// 12/10/2026 com as decisões 6 a 8 de
// docs/referencia/propostas-desenho-pv-implantacao.md).
//
// O plano é do hotel e tem um alvo, o ativo ou a categoria. A periodicidade
// é por tempo, em dias, semanas ou meses (decisão 7), num calendário fixo
// ancorado no início (decisão 6). As colunas app.plano_preventivo.unidade e
// .situacao têm checks com os mesmos valores destas listas (migração 0045,
// tests/valores-canonicos-banco.test.ts): valor novo exige migração que
// amplia o check.
import { ehDataDeCalendario } from './ativos';
import { escopoCobreHotel } from './equipes';
import { PermissaoNegada, RegraViolada } from './erros';
import { type Resultado, vigente } from './permissoes';
import type { Atribuicao, Papel } from './tipos';

/** A unidade da periodicidade (decisão 7: por uso fica para depois do MVP). */
export const UNIDADES_DE_PERIODICIDADE = ['dia', 'semana', 'mes'] as const;
export type UnidadeDePeriodicidade = (typeof UNIDADES_DE_PERIODICIDADE)[number];

export const ehUnidadeDePeriodicidade = (v: unknown): v is UnidadeDePeriodicidade =>
  typeof v === 'string' && (UNIDADES_DE_PERIODICIDADE as readonly string[]).includes(v);

/** A situação do plano: só o ativo gera OS; encerrar é a desativação lógica e não volta. */
export const SITUACOES_DO_PLANO = ['ativo', 'pausado', 'encerrado'] as const;
export type SituacaoDoPlano = (typeof SITUACOES_DO_PLANO)[number];

export const ehSituacaoDoPlano = (v: unknown): v is SituacaoDoPlano =>
  typeof v === 'string' && (SITUACOES_DO_PLANO as readonly string[]).includes(v);

// ---------------------------------------------------------------------------
// Quem gere, nome, início e periodicidade
// ---------------------------------------------------------------------------

/**
 * Papéis que cadastram e alteram planos no hotel, no escopo deles: a gestão do
 * hotel e o Implantador (decisão 8). O banco garante o mesmo "quem" pela policy
 * de app.plano_preventivo; aqui a aplicação recusa antes, com código claro.
 */
export const PAPEIS_QUE_GEREM_PLANOS: readonly Papel[] = [
  'admin_grupo',
  'gestor_csc',
  'implantador',
  'gerente_hotel',
];

export function podeGerirPlanos(
  minhas: readonly Atribuicao[],
  hotel: { id: string; bandeiraId: string | null },
  agora: Date,
): Resultado {
  const pode = minhas.some(
    (a) =>
      vigente(a, agora) && PAPEIS_QUE_GEREM_PLANOS.includes(a.papel) && escopoCobreHotel(a, hotel),
  );
  return pode
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'planos_fora_do_escopo',
          'Você não gere os planos preventivos deste hotel.',
          { hotelId: hotel.id },
        ),
      };
}

/** Nome do plano: sem espaços nas pontas nem repetidos, de 1 a 120 caracteres. */
export function normalizarNomeDoPlano(nome: unknown): string {
  const limpo = typeof nome === 'string' ? nome.trim().replace(/\s+/g, ' ') : '';
  if (limpo.length === 0 || limpo.length > 120) {
    throw new RegraViolada('plano_nome_invalido', 'Nome do plano inválido.', { maximo: 120 });
  }
  return limpo;
}

/** A primeira data prevista, em aaaa-mm-dd, no fuso do hotel. */
export function validarInicioDoPlano(inicio: unknown): string {
  if (typeof inicio !== 'string' || !ehDataDeCalendario(inicio)) {
    throw new RegraViolada('plano_inicio_invalido', 'Data de início do plano inválida.');
  }
  return inicio;
}

/** Os maiores intervalos aceitos, por unidade: um ano, mais ou menos, e dois anos no mês. */
export const MAXIMOS_DA_PERIODICIDADE: Readonly<Record<UnidadeDePeriodicidade, number>> = {
  dia: 366,
  semana: 52,
  mes: 24,
};

export interface Periodicidade {
  intervalo: number;
  unidade: UnidadeDePeriodicidade;
}

/** Intervalo inteiro, de 1 ao máximo da unidade; fora disso, 422 periodicidade_invalida. */
export function validarPeriodicidade(p: { intervalo: unknown; unidade: unknown }): Periodicidade {
  if (!ehUnidadeDePeriodicidade(p.unidade)) {
    throw new RegraViolada('periodicidade_invalida', 'Periodicidade inválida.', {
      unidade: String(p.unidade),
    });
  }
  const maximo = MAXIMOS_DA_PERIODICIDADE[p.unidade];
  if (
    typeof p.intervalo !== 'number' ||
    !Number.isInteger(p.intervalo) ||
    p.intervalo < 1 ||
    p.intervalo > maximo
  ) {
    throw new RegraViolada('periodicidade_invalida', 'Periodicidade inválida.', {
      unidade: p.unidade,
      maximo,
    });
  }
  return { intervalo: p.intervalo, unidade: p.unidade };
}

// ---------------------------------------------------------------------------
// Calendário fixo, ancorado no início (decisão 6)
// ---------------------------------------------------------------------------
// A ocorrência k (k = 0, 1, 2...) é inicio + k × intervalo. No mês, o dia do
// início vale em todo mês; o dia que não existe cai no último dia do mês, sem
// deslizar: com início em 31/01 e um mês, 31/01, 28/02 (ou 29/02), 31/03. O
// atraso numa OS não empurra as seguintes. As datas são de calendário
// (aaaa-mm-dd), no fuso do hotel; a conta é feita em UTC, sem hora.

const DIA_MS = 86_400_000;

function partes(data: string): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = data.split('-').map(Number);
  return { ano: ano ?? 0, mes: mes ?? 0, dia: dia ?? 0 };
}

const emDias = (data: string) => {
  const { ano, mes, dia } = partes(data);
  return Date.UTC(ano, mes - 1, dia) / DIA_MS;
};

const deDias = (dias: number) => new Date(dias * DIA_MS).toISOString().slice(0, 10);

const ultimoDiaDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** Meses corridos entre o mês do início e o da data (pode ser negativo). */
const mesesEntre = (inicio: string, data: string) => {
  const a = partes(inicio);
  const b = partes(data);
  return (b.ano - a.ano) * 12 + (b.mes - a.mes);
};

/** A data da ocorrência k do plano. */
export function dataDaOcorrencia(inicio: string, p: Periodicidade, k: number): string {
  if (p.unidade === 'dia') return deDias(emDias(inicio) + k * p.intervalo);
  if (p.unidade === 'semana') return deDias(emDias(inicio) + k * p.intervalo * 7);
  const { ano, mes, dia } = partes(inicio);
  const total = mes - 1 + k * p.intervalo;
  const anoAlvo = ano + Math.floor(total / 12);
  const mesAlvo = (((total % 12) + 12) % 12) + 1;
  const diaAlvo = Math.min(dia, ultimoDiaDoMes(anoAlvo, mesAlvo));
  return `${String(anoAlvo).padStart(4, '0')}-${String(mesAlvo).padStart(2, '0')}-${String(diaAlvo).padStart(2, '0')}`;
}

/** O índice da primeira ocorrência na data ou depois dela (0 se a data é até o início). */
function primeiroIndiceDesde(inicio: string, p: Periodicidade, data: string): number {
  if (data <= inicio) return 0;
  const passo = p.unidade === 'dia' ? p.intervalo : p.unidade === 'semana' ? p.intervalo * 7 : 0;
  if (passo > 0) return Math.ceil((emDias(data) - emDias(inicio)) / passo);
  // No mês, a conta pelos meses dá o índice ou o anterior a ele (o dia do mês
  // pode estar antes ou depois); avança até a data.
  let k = Math.max(0, Math.floor(mesesEntre(inicio, data) / p.intervalo));
  while (dataDaOcorrencia(inicio, p, k) < data) k++;
  return k;
}

/** As próximas datas previstas, a partir de uma data (inclusive): a prévia do formulário mostra cinco. */
export function ocorrencias(
  plano: { inicio: string } & Periodicidade,
  desde: string,
  quantidade: number,
): string[] {
  const k0 = primeiroIndiceDesde(plano.inicio, plano, desde);
  return Array.from({ length: Math.max(0, quantidade) }, (_, i) =>
    dataDaOcorrencia(plano.inicio, plano, k0 + i),
  );
}

/** A próxima data prevista, no dia (inclusive) ou depois dele. */
export function proximaOcorrencia(plano: { inicio: string } & Periodicidade, dia: string): string {
  return dataDaOcorrencia(plano.inicio, plano, primeiroIndiceDesde(plano.inicio, plano, dia));
}

/**
 * A ocorrência mais recente no dia ou antes dele, ou null antes do início. É a
 * única que a geração da PV3 cria quando há várias vencidas (sem avalanche,
 * decisão 10).
 */
export function ocorrenciaMaisRecenteAte(
  plano: { inicio: string } & Periodicidade,
  dia: string,
): string | null {
  if (dia < plano.inicio) return null;
  const k = primeiroIndiceDesde(plano.inicio, plano, dia);
  const data = dataDaOcorrencia(plano.inicio, plano, k);
  return data === dia ? data : dataDaOcorrencia(plano.inicio, plano, k - 1);
}

// ---------------------------------------------------------------------------
// Situação: ativar, pausar e encerrar
// ---------------------------------------------------------------------------

export const ACOES_DO_PLANO = ['ativar', 'pausar', 'encerrar'] as const;
export type AcaoDoPlano = (typeof ACOES_DO_PLANO)[number];

export const ehAcaoDoPlano = (v: unknown): v is AcaoDoPlano =>
  typeof v === 'string' && (ACOES_DO_PLANO as readonly string[]).includes(v);

/** O plano encerrado não muda mais: nem situação, nem dados. */
export function exigirPlanoNaoEncerrado(situacao: SituacaoDoPlano): void {
  if (situacao === 'encerrado') {
    throw new RegraViolada('plano_encerrado', 'O plano está encerrado e não muda mais.');
  }
}

/** Ativar exige o responsável padrão (técnico ou equipe). */
export function exigirResponsavelParaAtivar(responsavel: {
  tecnicoId: string | null;
  equipeId: string | null;
}): void {
  if (responsavel.tecnicoId === null && responsavel.equipeId === null) {
    throw new RegraViolada(
      'plano_sem_responsavel',
      'O plano precisa de um responsável padrão para ser ativado.',
    );
  }
}

/**
 * A situação depois da ação: ativar vale do pausado; pausar, do ativo;
 * encerrar, dos dois, e não volta. Ativar exige o responsável.
 */
export function decidirSituacaoDoPlano(
  atual: SituacaoDoPlano,
  acao: AcaoDoPlano,
  responsavel: { tecnicoId: string | null; equipeId: string | null },
): SituacaoDoPlano {
  exigirPlanoNaoEncerrado(atual);
  const valida =
    (acao === 'ativar' && atual === 'pausado') ||
    (acao === 'pausar' && atual === 'ativo') ||
    acao === 'encerrar';
  if (!valida) {
    throw new RegraViolada('plano_transicao_invalida', 'Ação não vale na situação do plano.', {
      situacao: atual,
      acao,
    });
  }
  if (acao === 'ativar') exigirResponsavelParaAtivar(responsavel);
  return acao === 'ativar' ? 'ativo' : acao === 'pausar' ? 'pausado' : 'encerrado';
}

/** No máximo um responsável: o técnico ou a equipe (o check do banco repete). */
export function validarResponsavelDoPlano(r: {
  tecnicoId: string | null;
  equipeId: string | null;
}): void {
  if (r.tecnicoId !== null && r.equipeId !== null) {
    throw new RegraViolada('plano_responsavel_duplo', 'O plano tem um responsável só.');
  }
}

/** Exatamente um alvo: o ativo ou a categoria (o check do banco repete). */
export function validarAlvoDoPlano(a: {
  ativoId: string | null;
  categoriaId: string | null;
}): void {
  if ((a.ativoId === null) === (a.categoriaId === null)) {
    throw new RegraViolada('plano_alvo_invalido', 'O plano tem um alvo: o ativo ou a categoria.');
  }
}
