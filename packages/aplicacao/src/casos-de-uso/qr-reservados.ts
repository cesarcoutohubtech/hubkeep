// Códigos de QR reservados (fase 1b, M3; decisão 21): gerar um lote para o
// hotel, listar os códigos com o que já está ligado, e consultar um código
// lido da etiqueta (o PWA abre o cadastro com ele). Quem gera é o Implantador
// e a gestão do hotel (podeReservarQr); o cadastro do ativo com o código fica
// nos casos de uso dos ativos. A regra é injetável para o teste provar que o
// banco ainda barra.
import {
  type Atribuicao,
  type CodigoReservado,
  type Contexto,
  NaoEncontrado,
  type Resultado,
  exigir,
  lerCodigoQr,
  podeReservarQr,
  validarTamanhoDoLote,
} from '@hubkeep/dominio';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { CodigoDoLote, PortaQrReservados } from '../portas/qr-reservados';

export interface CasosDeUsoDeQrReservados {
  gerar(
    ctx: Contexto,
    hotelId: string,
    quantidade: number,
  ): Promise<{ loteId: string; codigos: string[] }>;
  listar(ctx: Contexto, hotelId: string): Promise<CodigoDoLote[]>;
  /** O código como uma pessoa digitaria; não reservado ou fora do escopo: qr_nao_reservado. */
  consultar(ctx: Contexto, codigo: string): Promise<CodigoReservado & { codigo: string }>;
}

export function criarCasosDeUsoDeQrReservados(deps: {
  qr: PortaQrReservados;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Padrão: podeReservarQr do domínio. Só o teste de aceite troca. */
  podeReservar?: (
    minhas: readonly Atribuicao[],
    hotel: { id: string; bandeiraId: string | null },
    agora: Date,
  ) => Resultado;
}): CasosDeUsoDeQrReservados {
  const podeReservar = deps.podeReservar ?? podeReservarQr;
  const hotelVisivel = async (ctx: Contexto, hotelId: string) => {
    const h = await deps.qr.hotel(ctx, hotelId);
    if (!h) throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
    return h;
  };
  return {
    async gerar(ctx, hotelId, quantidade) {
      const hotel = await hotelVisivel(ctx, hotelId);
      exigir(podeReservar(await deps.atribuicoes.doUsuario(ctx), hotel, deps.relogio.agora()));
      return deps.qr.reservar(ctx, hotelId, validarTamanhoDoLote(quantidade));
    },
    async listar(ctx, hotelId) {
      await hotelVisivel(ctx, hotelId);
      return deps.qr.codigos(ctx, hotelId);
    },
    async consultar(ctx, codigo) {
      const lido = lerCodigoQr(codigo);
      const r = lido === null ? null : await deps.qr.reserva(ctx, lido);
      if (!r || lido === null) {
        throw new NaoEncontrado('qr_nao_reservado', 'O código não está reservado.');
      }
      return { codigo: lido, ...r };
    },
  };
}
