// Códigos de QR reservados (fase 1b, M3; desenho em
// docs/referencia/propostas-desenho-pv-implantacao.md e decisão 21 do Cesar,
// de 12/10/2026): o implantador gera um lote de códigos para o hotel antes do
// cadastro, cola as etiquetas, e o ativo é cadastrado depois a partir da
// etiqueta, com o código dela. A etiqueta reservada serve só para ativo novo:
// o código do ativo que já existe não muda.
//
//   - quem gera: o Implantador e a gestão do hotel, os mesmos da importação
//     por planilha (M2); o técnico só cadastra o ativo da etiqueta;
//   - o lote vai de 1 a 500 códigos (qr_lote_invalido);
//   - o código do cadastro tem de estar reservado no hotel do ativo
//     (qr_nao_reservado, também para o código de outro hotel, sem distinguir)
//     e livre: o código que já tem ativo dá qr_ja_ligado.
import { escopoCobreHotel } from './equipes';
import { Conflito, PermissaoNegada, RegraViolada } from './erros';
import { PAPEIS_QUE_GERENCIAM_LOCAIS } from './locais';
import { type Resultado, vigente } from './permissoes';
import type { Atribuicao } from './tipos';

export const LIMITE_DO_LOTE_DE_QR = 500;

export function podeReservarQr(
  minhas: readonly Atribuicao[],
  hotel: { id: string; bandeiraId: string | null },
  agora: Date,
): Resultado {
  const pode = minhas.some(
    (a) =>
      vigente(a, agora) &&
      PAPEIS_QUE_GERENCIAM_LOCAIS.includes(a.papel) &&
      escopoCobreHotel(a, hotel),
  );
  return pode
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'qr_reserva_fora_do_escopo',
          'Você não gera códigos de QR neste hotel.',
          { hotelId: hotel.id },
        ),
      };
}

/** O tamanho do lote, inteiro de 1 ao limite. */
export function validarTamanhoDoLote(quantidade: number): number {
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > LIMITE_DO_LOTE_DE_QR) {
    throw new RegraViolada('qr_lote_invalido', 'Tamanho de lote de QR inválido.', {
      maximo: LIMITE_DO_LOTE_DE_QR,
    });
  }
  return quantidade;
}

/** O código reservado, como a leitura o vê: o hotel e se já tem ativo. */
export interface CodigoReservado {
  hotelId: string;
  ligado: boolean;
}

/** O ativo novo do hotel pode nascer com o código: reservado nele e livre. */
export function exigirCodigoReservadoLivre(reserva: CodigoReservado | null, hotelId: string): void {
  if (reserva === null || reserva.hotelId !== hotelId) {
    throw new RegraViolada('qr_nao_reservado', 'O código não está reservado neste hotel.');
  }
  if (reserva.ligado) {
    throw new Conflito('qr_ja_ligado', 'O código já está ligado a um ativo.');
  }
}
