// Implementação das portas de packages/aplicacao sobre o acesso ao banco.
// Leitura com withContext, escrita com executar (unit of work): o que cada
// método vê ou grava é o que a RLS permite ao usuário do contexto.
import type {
  PortaEscopoDeAnexo,
  PortaAtribuicoes,
  PortaImplantacao,
  PortaHoteisDoStaging,
  PortaConvites,
  PortaCredenciaisDeAgente,
  PortaHoteis,
  PortaIngestao,
  PortaMembros,
  PortaOperacoesOffline,
  PortaPreferencias,
  PortaPromocaoDeUhs,
} from '@hubkeep/aplicacao';
import { type Atribuicao, Conflito, type Escopo } from '@hubkeep/dominio';
import type { AcessoBanco } from './acesso';
import type { Tx } from './conexao';
import {
  ehMembro,
  escopoVisivel,
  hotelDoRegistro,
  hotelNoEscopo,
  listarHoteisVisiveis,
  nomeDoTenant,
  preferenciasDoUsuario,
  respostaDaOperacao,
} from './consultas';
import { gravarConvite } from './repositorios/convites';
import {
  hoteisCadastrados,
  hoteisDoStaging,
  sessaoDeHoteis,
  travarLicenca,
  usoDaLicenca,
} from './repositorios/hoteis';
import { criarCredencialDeAgente, revogarCredencialDeAgente } from './repositorios/credenciais';
import {
  alterarValidadeDaAtribuicao,
  concederPapel,
  definirAtivoDoMembro,
  revogarPapel,
} from './repositorios/membros';
import { OperacaoJaRecebida, registrarOperacao } from './repositorios/operacoes-offline';
import { gravarPreferencias } from './repositorios/preferencias';
import { sessaoDePromocao } from './repositorios/promocao';
import { credenciaisAtivas, registrarLote } from './repositorios/staging';

interface LinhaAtribuicao {
  id: string;
  usuario_id: string;
  papel: Atribuicao['papel'];
  escopo_tipo: Escopo['tipo'];
  bandeira_id: string | null;
  hotel_id: string | null;
  proprietario_id: string | null;
  valido_ate: Date | null;
  revogado_em: Date | null;
}

function escopoDe(l: LinhaAtribuicao): Escopo {
  // A constraint escopo_coerente garante que a coluna do tipo está preenchida.
  switch (l.escopo_tipo) {
    case 'grupo':
      return { tipo: 'grupo' };
    case 'bandeira':
      return { tipo: 'bandeira', bandeiraId: l.bandeira_id ?? '' };
    case 'hotel':
      return { tipo: 'hotel', hotelId: l.hotel_id ?? '' };
    case 'proprietario':
      return { tipo: 'proprietario', proprietarioId: l.proprietario_id ?? '' };
  }
}

const paraAtribuicao = (l: LinhaAtribuicao): Atribuicao => ({
  id: l.id,
  usuarioId: l.usuario_id,
  papel: l.papel,
  escopo: escopoDe(l),
  validoAte: l.valido_ate,
  revogadoEm: l.revogado_em,
});

const COLUNAS = [
  'id',
  'usuario_id',
  'papel',
  'escopo_tipo',
  'bandeira_id',
  'hotel_id',
  'proprietario_id',
  'valido_ate',
  'revogado_em',
] as const;

const selecionar = (tx: Tx) => tx.selectFrom('app.atribuicao_escopo').select(COLUNAS);

export function criarPortasDeAplicacao(banco: AcessoBanco): {
  hoteis: PortaHoteis;
  atribuicoes: PortaAtribuicoes;
  convites: PortaConvites;
} {
  return {
    convites: {
      situacao: (ctx, pedido) =>
        banco.withContext(ctx, async (tx) => ({
          nomeTenant: await nomeDoTenant(tx),
          escopoVisivel: await escopoVisivel(tx, pedido.escopo),
          jaMembro: await ehMembro(tx, { email: pedido.email }),
        })),
      gravar: async (ctx, g) => {
        try {
          await banco.executar(ctx, (uow) => gravarConvite(uow, g));
        } catch (e) {
          // Dois convites simultâneos para a mesma pessoa: os dois passam pela
          // checagem de membro antes de qualquer commit, e a chave primária
          // decide quem fica. Quem perde recebe o mesmo 409 do reconvite.
          const { code, constraint } = e as { code?: string; constraint?: string };
          if (code === '23505' && constraint === 'membro_pkey') {
            throw new Conflito('ja_e_membro', 'Esta pessoa já é membro deste grupo.');
          }
          throw e;
        }
      },
    },
    hoteis: { listarVisiveis: (ctx) => banco.withContext(ctx, listarHoteisVisiveis) },
    atribuicoes: {
      doUsuario: (ctx) =>
        banco.withContext(ctx, async (tx) =>
          (await selecionar(tx).where('usuario_id', '=', ctx.usuarioId).execute()).map(
            paraAtribuicao,
          ),
        ),
      buscar: (ctx, id) =>
        banco.withContext(ctx, async (tx) => {
          const l = await selecionar(tx).where('id', '=', id).executeTakeFirst();
          return l ? paraAtribuicao(l) : null;
        }),
      conceder: (ctx, pedido) =>
        banco.executar(ctx, (uow) =>
          concederPapel(uow, {
            usuarioId: pedido.usuarioId,
            papel: pedido.papel,
            escopo: pedido.escopo,
            validoAte: pedido.validoAte ?? null,
          }),
        ),
      revogar: (ctx, id) => banco.executar(ctx, (uow) => revogarPapel(uow, id)),
    },
  };
}

/** Painel de implantação do hotel (fase 1a, A5), pelo hk_app: hotel e locais pela RLS. */
export function criarPortaImplantacao(banco: AcessoBanco): PortaImplantacao {
  return {
    hotel: (ctx, hotelId) =>
      banco.withContext(
        ctx,
        async (tx) =>
          (await tx
            .selectFrom('app.hotel')
            .select(['id', 'nome', 'status'])
            .where('id', '=', hotelId)
            .executeTakeFirst()) ?? null,
      ),
    locais: (ctx, hotelId) =>
      banco.withContext(ctx, async (tx) =>
        (
          await tx
            .selectFrom('app.local')
            .select(['tipo', 'status'])
            .where('hotel_id', '=', hotelId)
            .execute()
        ).map((l) => ({ tipo: l.tipo, status: l.status })),
      ),
  };
}

/** Gestão de membros (fase 1a, A3), pelo hk_app: o que cada um vê é da RLS. */
export function criarPortaMembros(banco: AcessoBanco): PortaMembros {
  return {
    listar: (ctx) =>
      banco.withContext(ctx, async (tx) => {
        const membros = await tx
          .selectFrom('app.membro')
          .select(['usuario_id', 'nome', 'email', 'ativo'])
          .orderBy('nome')
          .execute();
        const atribuicoes = (await selecionar(tx).orderBy('papel').execute()).map(paraAtribuicao);
        return membros.map((m) => ({
          usuarioId: m.usuario_id,
          nome: m.nome,
          email: m.email,
          ativo: m.ativo,
          atribuicoes: atribuicoes.filter((a) => a.usuarioId === m.usuario_id),
        }));
      }),
    definirAtivo: (ctx, usuarioId, ativo) =>
      banco.executar(ctx, (uow) => definirAtivoDoMembro(uow, usuarioId, ativo)),
    alterarValidade: (ctx, id, validoAte) =>
      banco.executar(ctx, (uow) => alterarValidadeDaAtribuicao(uow, id, validoAte)),
  };
}

/** Preferências de idioma e região do próprio usuário (F0-10b), pelo hk_app. */
export function criarPortaPreferencias(banco: AcessoBanco): PortaPreferencias {
  return {
    ler: (ctx) => banco.withContext(ctx, preferenciasDoUsuario),
    gravar: (ctx, p) => banco.executar(ctx, (uow) => gravarPreferencias(uow, p)),
  };
}

/** Hotéis a partir do staging (fase 1a, A1): listar, importar e ativar, pelo hk_app. */
export function criarPortaHoteisDoStaging(banco: AcessoBanco): PortaHoteisDoStaging {
  return {
    listar: (ctx) =>
      banco.withContext(ctx, async (tx) => ({
        staging: await hoteisDoStaging(tx),
        cadastrados: await hoteisCadastrados(tx),
        uso: await usoDaLicenca(tx),
      })),
    emSessao: (ctx, fn) =>
      banco.executar(ctx, async (uow) => {
        await travarLicenca(uow);
        return fn(sessaoDeHoteis(uow));
      }),
  };
}

/**
 * Operações offline do PWA (F0-11, ADR-025): o efeito e a chave na mesma unit
 * of work. Reenvio de chave conhecida devolve a resposta guardada sem repetir;
 * dois envios simultâneos: o que perde volta inteiro e lê a resposta do outro.
 */
export function criarPortaOperacoesOffline(banco: AcessoBanco): PortaOperacoesOffline {
  const guardada = (ctx: Parameters<AcessoBanco['withContext']>[0], chave: string) =>
    banco.withContext(ctx, (tx) => respostaDaOperacao(tx, chave));
  return {
    async aplicarUmaVez(ctx, operacao, efeito) {
      const antes = await guardada(ctx, operacao.chave);
      if (antes) return { repetida: true, resposta: antes };
      try {
        return await banco.executar(ctx, async (uow) => {
          const resposta = await efeito({ gravarPreferencias: (p) => gravarPreferencias(uow, p) });
          await registrarOperacao(uow, operacao, resposta);
          return { repetida: false, resposta };
        });
      } catch (e) {
        if (!(e instanceof OperacaoJaRecebida)) throw e;
        const depois = await guardada(ctx, operacao.chave);
        if (!depois) throw e;
        return { repetida: true, resposta: depois };
      }
    },
  };
}

/** Portas da ingestão (F0-08): staging pelo hk_ingestao, credenciais pelo hk_app, promoção pelo hk_worker. */
export function criarPortasDeIngestao(banco: AcessoBanco): {
  ingestao: PortaIngestao;
  credenciais: PortaCredenciaisDeAgente;
  promocao: PortaPromocaoDeUhs;
} {
  return {
    ingestao: {
      emSessao: (tenantId, fn) =>
        banco.withIngestao({ tenantId }, (tx) =>
          fn({
            credenciaisAtivas: () => credenciaisAtivas(tx),
            registrarLote: (lote, loteHash) => registrarLote(tx, tenantId, lote, loteHash),
          }),
        ),
    },
    credenciais: {
      criar: (ctx, c) => banco.executar(ctx, (uow) => criarCredencialDeAgente(uow, c)),
      revogar: (ctx, id) => banco.executar(ctx, (uow) => revogarCredencialDeAgente(uow, id)),
    },
    promocao: {
      emSessao: (tenantId, fn) =>
        // Mesmo lock da ativação de hotel: a promoção também consome saldo de UH.
        banco.executarComoSistema({ tenantId }, async (uow) => {
          await travarLicenca(uow);
          return fn(sessaoDePromocao(uow));
        }),
    },
  };
}

/** Escopo dos anexos (F0-10): tudo pela RLS e pelas funções authz.*, no hk_app. */
export function criarPortaEscopoDeAnexo(banco: AcessoBanco): PortaEscopoDeAnexo {
  return {
    hotelDoRegistro: (ctx, entidade, id) =>
      banco.withContext(ctx, (tx) => hotelDoRegistro(tx, entidade, id)),
    escreveNoHotel: (ctx, hotelId) =>
      banco.withContext(ctx, (tx) => hotelNoEscopo(tx, hotelId, 'escrita')),
    leNoHotel: (ctx, hotelId) =>
      banco.withContext(ctx, (tx) => hotelNoEscopo(tx, hotelId, 'leitura')),
  };
}
