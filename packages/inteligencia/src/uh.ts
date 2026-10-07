// UH indisponível por manutenção (revisão de 07/10/2026): quantos UH-dias a
// manutenção tirou da operação. É a medida da proposta em
// docs/referencia/proposta-uh-indisponivel-intelligence.md, que ainda aguarda
// aprovação: nenhum score a usa, e o `calcularDia` não a chama. O período vem do
// chamado (início e fim da indisponibilidade da UH); os nomes das colunas
// seguem as propostas do agente do núcleo, e a camada que lê o banco adapta.
import { type Parada, tempoParadoTotal } from '@hubkeep/dominio';
import { DIA_MS } from './score';

export interface PeriodoDeUhIndisponivel {
  chamadoId: string;
  hotelId: string;
  localId: string;
  /** O ativo do chamado, se houver: a UH pode ficar indisponível sem ativo definido. */
  ativoId: string | null;
  inicio: Date;
  /** null: a UH ainda está indisponível. */
  fim: Date | null;
}

/**
 * UH-dias perdidos no intervalo [de, ate): a soma, por UH, do tempo indisponível
 * dentro do intervalo, dividido por 24 horas. Períodos que se sobrepõem na mesma
 * UH contam uma vez (duas OS no mesmo quarto no mesmo dia não perdem dois
 * dias), e o período aberto conta até `agora`. Quem chama filtra os períodos
 * pelo escopo que quer medir (um ativo, um hotel, a rede).
 */
export function uhDiasPerdidos(
  periodos: readonly PeriodoDeUhIndisponivel[],
  de: Date,
  ate: Date,
  agora: Date,
): number {
  const porUh = new Map<string, Parada[]>();
  for (const p of periodos) {
    const inicio = Math.max(p.inicio.getTime(), de.getTime());
    const fim = Math.min((p.fim ?? agora).getTime(), ate.getTime());
    if (fim <= inicio) continue;
    const chave = `${p.hotelId}|${p.localId}`;
    porUh.set(chave, [
      ...(porUh.get(chave) ?? []),
      { inicio: new Date(inicio), fim: new Date(fim) },
    ]);
  }
  let ms = 0;
  for (const paradas of porUh.values()) ms += tempoParadoTotal(paradas, agora);
  return Math.round((ms / DIA_MS) * 10) / 10;
}
