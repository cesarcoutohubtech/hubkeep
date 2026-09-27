// Proprietários e vínculos com UH ou hotel inteiro (fase 1a, A4; ADR-031).
//
//   gerir     só o Admin do grupo: cadastro, vínculo e vigência; o nome e o
//             documento são dado pessoal (LGPD) e ficam fora da auditoria;
//   vínculo   com UH (não com área comum) ou com hotel inteiro, com vigência
//             que não se sobrepõe a outro vínculo do mesmo proprietário com o
//             mesmo alvo. Encerrar é gravar o fim da vigência.
// O acesso que o vínculo dá é calculado no banco (authz.locais_proprietario):
// UH nova no hotel vinculado entra no escopo sem ação aqui. A regra de quem
// gere é injetável para o teste provar que a RLS ainda barra.
import {
  type Atribuicao,
  type Contexto,
  NaoEncontrado,
  RegraViolada,
  type Resultado,
  type Vigencia,
  diaDe,
  exigir,
  exigirSemSobreposicao,
  normalizarDocumento,
  normalizarNomeDeProprietario,
  podeGerirProprietarios,
  validarVigencia,
  vigenciaCobre,
} from '@hubkeep/dominio';
import type {
  LocalDoHotel,
  PortaProprietarios,
  Proprietario,
  TipoDeVinculo,
  VinculoDeProprietario,
} from '../portas/proprietarios';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export interface ProprietarioComVinculos extends Proprietario {
  vinculos: (VinculoDeProprietario & { vigente: boolean })[];
}

export type AlvoDoVinculo = { tipo: 'uh'; localId: string } | { tipo: 'hotel'; hotelId: string };

export interface CasosDeUsoDeProprietarios {
  listarProprietarios(ctx: Contexto): Promise<ProprietarioComVinculos[]>;
  locaisDoHotel(ctx: Contexto, hotelId: string): Promise<LocalDoHotel[]>;
  criarProprietario(ctx: Contexto, nome: string, documento: string | null): Promise<{ id: string }>;
  alterarProprietario(
    ctx: Contexto,
    id: string,
    nome: string,
    documento: string | null,
  ): Promise<void>;
  vincular(
    ctx: Contexto,
    proprietarioId: string,
    alvo: AlvoDoVinculo,
    vigencia: Vigencia,
  ): Promise<{ id: string }>;
  alterarVigencia(
    ctx: Contexto,
    tipo: TipoDeVinculo,
    vinculoId: string,
    vigencia: Vigencia,
  ): Promise<void>;
}

export function criarCasosDeUsoDeProprietarios(deps: {
  proprietarios: PortaProprietarios;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  /** Padrão: podeGerirProprietarios do domínio. Só o teste de aceite troca. */
  podeGerir?: (minhas: readonly Atribuicao[], agora: Date) => Resultado;
}): CasosDeUsoDeProprietarios {
  const podeGerir = deps.podeGerir ?? podeGerirProprietarios;
  const exigirAdmin = async (ctx: Contexto) =>
    exigir(podeGerir(await deps.atribuicoes.doUsuario(ctx), deps.relogio.agora()));

  const mesmoAlvo = (v: VinculoDeProprietario, tipo: TipoDeVinculo, alvoId: string) =>
    v.tipo === tipo && (tipo === 'uh' ? v.localId === alvoId : v.hotelId === alvoId);

  return {
    async listarProprietarios(ctx) {
      await exigirAdmin(ctx);
      const hoje = diaDe(deps.relogio.agora());
      const { proprietarios, vinculos } = await deps.proprietarios.listar(ctx);
      return proprietarios.map((p) => ({
        ...p,
        vinculos: vinculos
          .filter((v) => v.proprietarioId === p.id)
          .map((v) => ({ ...v, vigente: vigenciaCobre(v.vigencia, hoje) })),
      }));
    },

    async locaisDoHotel(ctx, hotelId) {
      if (!(await deps.proprietarios.hotel(ctx, hotelId))) {
        throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
      }
      return deps.proprietarios.locaisDoHotel(ctx, hotelId);
    },

    async criarProprietario(ctx, nome, documento) {
      await exigirAdmin(ctx);
      return deps.proprietarios.criar(ctx, {
        nome: normalizarNomeDeProprietario(nome),
        documento: normalizarDocumento(documento),
      });
    },

    async alterarProprietario(ctx, id, nome, documento) {
      await exigirAdmin(ctx);
      await deps.proprietarios.alterar(ctx, id, {
        nome: normalizarNomeDeProprietario(nome),
        documento: normalizarDocumento(documento),
      });
    },

    async vincular(ctx, proprietarioId, alvo, vigencia) {
      await exigirAdmin(ctx);
      validarVigencia(vigencia);
      const { proprietarios, vinculos } = await deps.proprietarios.listar(ctx);
      if (!proprietarios.some((p) => p.id === proprietarioId)) {
        throw new NaoEncontrado('proprietario_nao_encontrado', 'Proprietário não encontrado.');
      }
      let hotelId: string;
      let localId: string | null = null;
      if (alvo.tipo === 'uh') {
        const local = await deps.proprietarios.local(ctx, alvo.localId);
        if (!local) throw new NaoEncontrado('local_nao_encontrado', 'Local não encontrado.');
        if (local.tipo !== 'uh')
          throw new RegraViolada('vinculo_so_com_uh', 'O vínculo por local é só com UH.');
        hotelId = local.hotelId;
        localId = local.id;
      } else {
        if (!(await deps.proprietarios.hotel(ctx, alvo.hotelId))) {
          throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
        }
        hotelId = alvo.hotelId;
      }
      const alvoId = alvo.tipo === 'uh' ? alvo.localId : alvo.hotelId;
      exigirSemSobreposicao(
        vinculos
          .filter((v) => v.proprietarioId === proprietarioId && mesmoAlvo(v, alvo.tipo, alvoId))
          .map((v) => v.vigencia),
        vigencia,
      );
      return deps.proprietarios.vincular(ctx, {
        tipo: alvo.tipo,
        proprietarioId,
        hotelId,
        localId,
        vigencia,
      });
    },

    async alterarVigencia(ctx, tipo, vinculoId, vigencia) {
      await exigirAdmin(ctx);
      validarVigencia(vigencia);
      const { vinculos } = await deps.proprietarios.listar(ctx);
      const atual = vinculos.find((v) => v.id === vinculoId && v.tipo === tipo);
      if (!atual) throw new NaoEncontrado('vinculo_nao_encontrado', 'Vínculo não encontrado.');
      const alvoId = tipo === 'uh' ? (atual.localId ?? '') : atual.hotelId;
      exigirSemSobreposicao(
        vinculos
          .filter(
            (v) =>
              v.id !== vinculoId &&
              v.proprietarioId === atual.proprietarioId &&
              mesmoAlvo(v, tipo, alvoId),
          )
          .map((v) => v.vigencia),
        vigencia,
      );
      await deps.proprietarios.alterarVigencia(ctx, tipo, vinculoId, vigencia);
    },
  };
}
