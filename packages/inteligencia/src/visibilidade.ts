// Visibilidade das telas do Intelligence (adendo ao ADR-035 de 12/10/2026,
// aprovado por Cesar; aguarda a aprovação do Kaio). O módulo fica vigente
// desde a contratação, e o job diário roda desde o primeiro dia; as telas (e
// as rotas que as servem, e o item do menu) só existem a partir da abertura:
//
// - `aPartirDe` preenchido: 00:00 desse dia;
// - senão: 00:00 do dia do início do PRIMEIRO contrato do módulo no tenant,
//   mais `diasAposAtivacao` (decisão 3 do Cesar: não o contrato vigente).
//
// O dia é cortado no fuso do grupo, com Brasília como padrão (decisão 4). O
// grupo ainda não tem fuso próprio (app.tenant não tem a coluna; pedido ao
// núcleo no diário), então a ligação passa o padrão até a coluna existir.
//
// Só os `papeis` da política veem as telas (decisão 1: o padrão é o Admin do
// grupo e o Gestor CSC; o Gerente do hotel entra só por configuração). O
// Admin do grupo também não as vê antes da abertura (decisão 2): ele vê a
// data em aberturaDoPainel e a muda pela política.
//
// A política vale só no nível do grupo: a leitura ignora hotel e bandeira
// (pedido de `escopos: ['grupo']` ao núcleo, no diário).
import { type Atribuicao, type ModuloContratado, type Papel, vigente } from '@hubkeep/dominio';
import { PAPEIS_DO_INSIGHT } from './insight';

export interface ConfigVisibilidadeTelas {
  /** AAAA-MM-DD; nulo: conta `diasAposAtivacao` a partir do primeiro contrato. */
  aPartirDe: string | null;
  diasAposAtivacao: number;
  /** Os papéis que veem as telas, dentre os que decidem insight. */
  papeis: Papel[];
}

export const MAXIMO_DE_DIAS_APOS_ATIVACAO = 365;

export const PADRAO_VISIBILIDADE_TELAS: ConfigVisibilidadeTelas = {
  aPartirDe: null,
  diasAposAtivacao: 60,
  papeis: ['admin_grupo', 'gestor_csc'],
};

/** O fuso do grupo enquanto o núcleo não o grava (decisão 4: Brasília). */
export const FUSO_PADRAO_DO_GRUPO = 'America/Sao_Paulo';

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** AAAA-MM-DD de um dia que existe no calendário. */
export function diaValido(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = DIA.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === v;
}

const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function configVisibilidadeValida(v: unknown): v is ConfigVisibilidadeTelas {
  if (!objeto(v) || Object.keys(v).length !== 3) return false;
  const { aPartirDe, diasAposAtivacao, papeis } = v;
  if (aPartirDe !== null && !diaValido(aPartirDe)) return false;
  if (
    !Number.isInteger(diasAposAtivacao) ||
    (diasAposAtivacao as number) < 0 ||
    (diasAposAtivacao as number) > MAXIMO_DE_DIAS_APOS_ATIVACAO
  )
    return false;
  if (!Array.isArray(papeis) || papeis.length === 0) return false;
  if (new Set(papeis).size !== papeis.length) return false;
  return papeis.every((p) => (PAPEIS_DO_INSIGHT as readonly unknown[]).includes(p));
}

/** O valor gravado no grupo, se valer; senão, o padrão (como o registro faz). */
export const visibilidadeEfetiva = (doGrupo: unknown): ConfigVisibilidadeTelas =>
  configVisibilidadeValida(doGrupo) ? doGrupo : PADRAO_VISIBILIDADE_TELAS;

/** A diferença entre o relógio do fuso e o UTC no instante `t`, em ms. */
function deslocamento(t: number, fuso: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(t));
  const n = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((p) => p.type === tipo)?.value);
  const relogio = Date.UTC(
    n('year'),
    n('month') - 1,
    n('day'),
    n('hour'),
    n('minute'),
    n('second'),
  );
  return relogio - Math.floor(t / 1000) * 1000;
}

/** O dia (AAAA-MM-DD) do instante no fuso. */
export function diaNoFuso(instante: Date, fuso: string): string {
  return new Date(instante.getTime() + deslocamento(instante.getTime(), fuso))
    .toISOString()
    .slice(0, 10);
}

/** 00:00 do dia no fuso, como instante. */
export function inicioDoDiaNoFuso(dia: string, fuso: string): Date {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number];
  const meiaNoiteUtc = Date.UTC(a, m - 1, d);
  // Duas voltas: o deslocamento no palpite pode diferir do da meia-noite local
  // quando o fuso muda de horário entre os dois instantes.
  let t = meiaNoiteUtc - deslocamento(meiaNoiteUtc, fuso);
  t = meiaNoiteUtc - deslocamento(t, fuso);
  return new Date(t);
}

const somarDias = (dia: string, dias: number): string => {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
};

export interface AberturaDasTelas {
  em: Date;
  /** O dia da abertura no fuso (AAAA-MM-DD). */
  dia: string;
  origem: 'data' | 'ativacao';
  /** O início do primeiro contrato do módulo, se houver. */
  primeiraAtivacao: Date | null;
}

/**
 * Quando as telas abrem. Sem `aPartirDe` e sem contrato nenhum do módulo,
 * nulo: não há de onde contar.
 */
export function aberturaDasTelas(
  modulos: readonly ModuloContratado[],
  config: ConfigVisibilidadeTelas,
  fuso: string,
): AberturaDasTelas | null {
  const inicios = modulos
    .filter((c) => c.modulo === 'inteligencia' && !Number.isNaN(c.inicio.getTime()))
    .map((c) => c.inicio.getTime());
  const primeiraAtivacao = inicios.length ? new Date(Math.min(...inicios)) : null;
  if (config.aPartirDe !== null) {
    return {
      em: inicioDoDiaNoFuso(config.aPartirDe, fuso),
      dia: config.aPartirDe,
      origem: 'data',
      primeiraAtivacao,
    };
  }
  if (!primeiraAtivacao) return null;
  const dia = somarDias(diaNoFuso(primeiraAtivacao, fuso), config.diasAposAtivacao);
  return { em: inicioDoDiaNoFuso(dia, fuso), dia, origem: 'ativacao', primeiraAtivacao };
}

/** As atribuições vigentes com papel que vê as telas. */
export const atribuicoesQueVeem = (
  atribuicoes: readonly Atribuicao[],
  config: ConfigVisibilidadeTelas,
  agora: Date,
): Atribuicao[] => atribuicoes.filter((a) => vigente(a, agora) && config.papeis.includes(a.papel));

export const telasAbertas = (abertura: AberturaDasTelas | null, agora: Date): boolean =>
  abertura !== null && agora.getTime() >= abertura.em.getTime();
