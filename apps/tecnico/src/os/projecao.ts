// A OS como o técnico a vê no aparelho (C4b; ADR-025, ADR-029): a guardada
// (a última resposta da API) com as operações dele ainda na fila aplicadas
// por cima, na ordem em que foram feitas. Cada transição leva a versão que a
// OS tinha antes dela, e a projeção soma um; assim uma segunda ação sem rede
// sai com a versão certa. A transição só se aplica se a versão bate com a da
// projeção: se o servidor já tinha aplicado (a resposta se perdeu) e a API já
// devolveu a OS adiante, a operação não conta duas vezes. As regras de quem
// e de quando são as do domínio, as mesmas do servidor, que confere de novo.
import { ESTADOS_QUE_ACEITAM_REGISTRO, type EstadoDaOs, TRANSICOES_DA_OS } from '@hubkeep/dominio';
import type { FotoNaFila, OperacaoNaFila } from '../fila/banco';
import type { OsGuardada } from './banco';

export const ACOES_DO_TECNICO = ['iniciar', 'pausar', 'retomar', 'concluir'] as const;
export type AcaoDoTecnico = (typeof ACOES_DO_TECNICO)[number];

export interface OsNoAparelho extends OsGuardada {
  /** Operações desta OS ainda na fila: transições, horas, material e fotos. */
  pendentes: number;
}

const acaoDoTipo = (tipo: OperacaoNaFila['tipo']): AcaoDoTecnico | null => {
  const acao = tipo.startsWith('os.') ? tipo.slice('os.'.length) : '';
  return (ACOES_DO_TECNICO as readonly string[]).includes(acao) ? (acao as AcaoDoTecnico) : null;
};

/** A OS a que a operação se refere; null se não é de OS. */
export function osDaOperacao(op: Pick<OperacaoNaFila, 'tipo' | 'dados'>): string | null {
  if (op.tipo === 'anexo.foto') return (op.dados as FotoNaFila).registroId;
  if (op.tipo.startsWith('os.')) return (op.dados as { osId: string }).osId;
  return null;
}

export function projetarOs(
  guardadas: readonly OsGuardada[],
  fila: readonly OperacaoNaFila[],
): OsNoAparelho[] {
  const porId = new Map(guardadas.map((o) => [o.id, { ...o, pendentes: 0 }]));
  for (const op of fila) {
    // A recusada não aconteceu: fica na tela até o técnico dispensar.
    if (op.estado !== 'pendente') continue;
    const os = porId.get(osDaOperacao(op) ?? '');
    if (!os) continue;
    os.pendentes += 1;
    const acao = acaoDoTipo(op.tipo);
    if (!acao) continue;
    const t = TRANSICOES_DA_OS[acao];
    const { versao } = op.dados as { versao: number };
    if (versao === os.versao && (t.de as readonly string[]).includes(os.estado)) {
      os.estado = t.para as EstadoDaOs;
      os.versao += 1;
    }
  }
  return [...porId.values()];
}

/** As ações do técnico que valem no estado (o servidor confere de novo). */
export const acoesPossiveis = (estado: EstadoDaOs): AcaoDoTecnico[] =>
  ACOES_DO_TECNICO.filter((a) => (TRANSICOES_DA_OS[a].de as readonly string[]).includes(estado));

/** Horas, material e fotos: só com a OS em execução ou pausada. */
export const aceitaRegistro = (estado: EstadoDaOs): boolean =>
  ESTADOS_QUE_ACEITAM_REGISTRO.includes(estado);
