// Sugestões de plano preventivo (fase 1b, M1; decisão do Cesar de
// 15/10/2026, caminho C): a gestão vê os ativos com modelo e sem plano que
// os cubra, cria o plano com um clique ou descarta a sugestão com motivo.
//
//   - entra o ativo ativo, com modelo, sem descarte e sem plano que o cubra
//     pela regra de hotelJaTemPlanoQueCobreOAtivo;
//   - o ativo pendente na fila de aprovação (M4) não entra;
//   - o plano nasce pausado e sem responsável, com a periodicidade e o
//     checklist do modelo; sem periodicidade no modelo, não há plano de um
//     clique, e a gestão cria pela tela de preventivas;
//   - o mesmo critério dá o contador do painel de implantação.
import { RegraViolada } from './erros';
import {
  type Periodicidade,
  type PlanoQueCobre,
  hotelJaTemPlanoQueCobreOAtivo,
} from './plano-preventivo';

export interface AtivoParaSugestao {
  id: string;
  categoriaId: string | null;
  modeloId: string | null;
  /** false: desativado; não entra. */
  ativo: boolean;
  /** A sugestão do ativo foi descartada (quem, quando e motivo ficam no ativo). */
  sugestaoDescartada: boolean;
  /** O cadastro ainda espera a aprovação (M4): fica fora até ser aprovado. */
  cadastroPendente: boolean;
}

/** O ativo entra na lista de sugestões (e no contador do painel). */
export function ativoSemPlanoComModelo(
  ativo: AtivoParaSugestao,
  planosDoHotel: readonly PlanoQueCobre[],
): boolean {
  return (
    ativo.ativo &&
    ativo.modeloId !== null &&
    !ativo.sugestaoDescartada &&
    !ativo.cadastroPendente &&
    !hotelJaTemPlanoQueCobreOAtivo(ativo, planosDoHotel)
  );
}

/** O nome do plano criado pela sugestão: o do ativo, no limite do nome do plano. */
export function nomeDoPlanoSugerido(nomeDoAtivo: string): string {
  return nomeDoAtivo.trim().slice(0, 120);
}

/** O plano de um clique precisa da periodicidade do modelo. */
export function exigirPeriodicidadeSugerida(p: Periodicidade | null): Periodicidade {
  if (!p) {
    throw new RegraViolada(
      'sugestao_sem_periodicidade',
      'O modelo do ativo não sugere periodicidade.',
    );
  }
  return p;
}
