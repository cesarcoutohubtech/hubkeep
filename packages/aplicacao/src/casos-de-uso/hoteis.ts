// Hotéis a partir do staging (fase 1a, A1).
//
//   listar      o que chegou do sistema hoteleiro, com o hotel já cadastrado
//               (se houver) e os campos que diferem, e o uso da licença.
//   importar    traz o hotel para implantação: cria em app.hotel, sem consumir
//               licença. O Implantador só trabalha em hotel que existe.
//   ativar      consome uma licença de hotel. Sem saldo, bloqueia com código
//               próprio e avisa a EasyGov (evento no outbox). Com saldo, as UHs
//               pendentes do hotel entram até onde o saldo de UHs deixar.
//
// Só o Admin do grupo faz as três (docs/00). A regra é injetável, como nos
// papéis: o teste de aceite troca por uma que permite tudo e prova que a RLS
// ainda barra quem não é admin.
import {
  type Atribuicao,
  Conflito,
  type Contexto,
  NaoEncontrado,
  RegraViolada,
  type Resultado,
  exigir,
  podeAtivarHotel,
  decidirAtivacao,
} from '@hubkeep/dominio';
import { fusoValido } from '@hubkeep/i18n';
import type {
  HotelCadastrado,
  HotelDoStaging,
  PortaHoteisDoStaging,
  UsoDaLicenca,
} from '../portas/hoteis';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export interface HotelParaAtivacao {
  fonte: string;
  chave: string;
  nome: string | null;
  fuso: string | null;
  recebidoEm: Date;
  /** Hotel já cadastrado com este código, ou null (ainda não importado). */
  hotel: HotelCadastrado | null;
  /** Campos em que o cadastro difere do que chegou do sistema hoteleiro. */
  diferencas: ('nome' | 'fuso')[];
}

export interface ResultadoDaAtivacao {
  hotelId: string;
  uhsLiberadas: number;
  uhsPendentes: number;
}

export interface CasosDeUsoDeHoteis {
  listarParaAtivacao(ctx: Contexto): Promise<{ hoteis: HotelParaAtivacao[]; uso: UsoDaLicenca }>;
  importarHotel(
    ctx: Contexto,
    pedido: { fonte: string; chave: string; fuso?: string | null | undefined },
  ): Promise<{ hotelId: string }>;
  ativarHotel(ctx: Contexto, hotelId: string): Promise<ResultadoDaAtivacao>;
}

const texto = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null;

/** Os campos do hotel no staging (contrato DadosDeHotel); o que não vale, fica null. */
const dadosDoHotel = (h: HotelDoStaging) => ({
  nome: texto(h.dados['nome'], 200),
  fuso: fusoValido(h.dados['fuso']) ? (h.dados['fuso'] as string) : null,
});

export function criarCasosDeUsoDeHoteis(deps: {
  hoteis: PortaHoteisDoStaging;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  /** Padrão: podeAtivarHotel do domínio. Só o teste de aceite troca. */
  podeAtivar?: (atribuicoes: readonly Atribuicao[], agora: Date) => Resultado;
}): CasosDeUsoDeHoteis {
  const podeAtivar = deps.podeAtivar ?? podeAtivarHotel;
  const exigirAdmin = async (ctx: Contexto) =>
    exigir(podeAtivar(await deps.atribuicoes.doUsuario(ctx), deps.relogio.agora()));

  return {
    async listarParaAtivacao(ctx) {
      await exigirAdmin(ctx);
      const { staging, cadastrados, uso } = await deps.hoteis.listar(ctx);
      const porCodigo = new Map(cadastrados.map((h) => [`${h.sistemaOrigem}|${h.codExterno}`, h]));
      const hoteis = staging.map((s): HotelParaAtivacao => {
        const dados = dadosDoHotel(s);
        const hotel = porCodigo.get(`${s.fonte}|${s.chave}`) ?? null;
        const diferencas: HotelParaAtivacao['diferencas'] = [];
        if (hotel && dados.nome && hotel.nome !== dados.nome) diferencas.push('nome');
        if (hotel && dados.fuso && hotel.fuso !== dados.fuso) diferencas.push('fuso');
        return {
          fonte: s.fonte,
          chave: s.chave,
          ...dados,
          recebidoEm: s.recebidoEm,
          hotel,
          diferencas,
        };
      });
      return { hoteis, uso };
    },

    async importarHotel(ctx, pedido) {
      await exigirAdmin(ctx);
      return deps.hoteis.emSessao(ctx, async (s) => {
        const doStaging = await s.hotelDoStaging(pedido.fonte, pedido.chave);
        if (!doStaging) {
          throw new NaoEncontrado('hotel_nao_encontrado_no_staging', 'Hotel não está no staging.');
        }
        const existente = await s.hotelPorCodigo(pedido.fonte, pedido.chave);
        if (existente) {
          throw new Conflito('hotel_ja_importado', 'Hotel já importado.', {
            hotelId: existente.id,
          });
        }
        const dados = dadosDoHotel(doStaging);
        if (!dados.nome) {
          throw new RegraViolada('hotel_sem_nome_no_staging', 'Hotel sem nome no staging.');
        }
        // O fuso do pedido vale por cima do que veio do sistema hoteleiro.
        const fuso = pedido.fuso ?? dados.fuso;
        if (!fuso) throw new RegraViolada('fuso_obrigatorio', 'Informe o fuso do hotel.');
        if (!fusoValido(fuso)) {
          throw new RegraViolada('fuso_invalido', 'Fuso horário inválido.', { fuso });
        }
        const hotelId = await s.criarHotel({
          nome: dados.nome,
          fuso,
          fonte: pedido.fonte,
          chave: pedido.chave,
        });
        return { hotelId };
      });
    },

    async ativarHotel(ctx, hotelId) {
      await exigirAdmin(ctx);
      const r = await deps.hoteis.emSessao(ctx, async (s) => {
        const hotel = await s.hotel(hotelId);
        if (!hotel) throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
        const uso = await s.usoDaLicenca();
        const pendentes = await s.uhsPendentes(hotelId);
        const decisao = decidirAtivacao({
          status: hotel.status,
          hoteis: uso.hoteis,
          uhs: uso.uhs,
          uhsPendentes: pendentes.length,
        });
        if (!decisao.ativar) {
          if (decisao.motivo === 'ja_ativo') {
            throw new Conflito('hotel_ja_ativo', 'Hotel já está ativo.');
          }
          // A tentativa fica registrada (a unit of work grava), e o erro sai depois.
          await s.registrarAtivacaoBloqueada(hotelId, uso);
          return { bloqueada: true as const, uso };
        }
        await s.ativarHotel(hotelId);
        for (const uh of pendentes.slice(0, decisao.uhsALiberar)) await s.liberarUh(hotelId, uh.id);
        return {
          bloqueada: false as const,
          resultado: {
            hotelId,
            uhsLiberadas: decisao.uhsALiberar,
            uhsPendentes: pendentes.length - decisao.uhsALiberar,
          },
        };
      });
      if (r.bloqueada) {
        throw new Conflito('licenca_hoteis_sem_saldo', 'Sem licença de hotel disponível.', {
          contratados: r.uso.hoteis.contratados,
          emUso: r.uso.hoteis.emUso,
        });
      }
      return r.resultado;
    },
  };
}
