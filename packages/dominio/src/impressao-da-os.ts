// Impressão da OS (fase 1c, item 9; seção 6 de docs/referencia/paridade-mock-1c.md).
// O custo informado não sai na impressão de quem só enxerga o hotel como
// proprietário ("Não copiar do mock"): aparece para quem tem algum papel
// vigente, que não o de proprietário, com escopo sobre o hotel da OS. O aceite
// impresso diz se a OS foi assinada no celular, aceita sem assinatura ou se o
// aceite está pendente.
import type { EstadoDaOs } from './corretiva';
import { escopoCobreHotel } from './equipes';
import { vigente } from './permissoes';
import type { Atribuicao } from './tipos';

export function custoNaImpressao(
  minhas: readonly Atribuicao[],
  hotel: { id: string; bandeiraId: string | null },
  agora: Date,
): boolean {
  return minhas.some(
    (a) => vigente(a, agora) && a.papel !== 'proprietario' && escopoCobreHotel(a, hotel),
  );
}

export type AceiteNaImpressao = 'assinado' | 'aceito' | 'pendente';

/** O aceite da OS no papel; null na OS cancelada, que não tem aceite. */
export function aceiteNaImpressao(os: {
  estado: EstadoDaOs;
  assinaturaAceiteId: string | null;
}): AceiteNaImpressao | null {
  if (os.estado === 'cancelada') return null;
  if (os.estado !== 'aceita') return 'pendente';
  return os.assinaturaAceiteId === null ? 'aceito' : 'assinado';
}
