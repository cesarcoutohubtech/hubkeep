// Execução da OS pelo Técnico (fase 1a, C4; ADR-025, ADR-027, ADR-029). O
// responsável (ele, ou uma equipe de que é membro ativo) inicia, pausa, retoma
// e conclui a OS, aponta horas e registra material. Tudo chega pelas operações
// offline do PWA: aqui fica a validação que lê o banco (preparar*), e a
// gravação vai na unit of work da operação, uma vez só (sincronizacao.ts).
//
// A transição leva a versão que o aparelho calculou (a vista mais uma por
// transição já na fila); se a OS mudou no servidor (reatribuída, cancelada),
// a recusa volta como conflito, visível ao Técnico (ADR-025, ADR-029).
import {
  type AtorDaCorretiva,
  type Contexto,
  NaoEncontrado,
  type RegistroNaOs,
  conflitoDeVersao,
  decidirNaOs,
  decidirRegistroNaOs,
  normalizarMaterial,
  situacaoPara,
  validarApontamento,
} from '@hubkeep/dominio';
import type { AcaoNaOsDecidida, OsDoDia, PortaExecucao } from '../portas/execucao';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { PortaSituacoes } from '../portas/situacoes';
import type { ChamadoParaTriagem, OsGravada, PortaTriagem } from '../portas/triagem';

export type AcaoDoTecnico = AcaoNaOsDecidida['acao'];

export interface CasosDeUsoDeExecucao {
  prepararAcao(
    ctx: Contexto,
    acao: AcaoDoTecnico,
    p: { osId: string; versao: number },
  ): Promise<AcaoNaOsDecidida>;
  prepararApontamento(
    ctx: Contexto,
    p: { osId: string; inicio: Date; fim: Date },
  ): Promise<{ osId: string; hotelId: string; inicio: Date; fim: Date }>;
  prepararMaterial(
    ctx: Contexto,
    p: { osId: string; descricao: string },
  ): Promise<{ osId: string; hotelId: string; descricao: string }>;
  /** A foto na OS (anexos, regraParaAnexar): responsável, com a OS em execução ou pausada. */
  exigirFoto(ctx: Contexto, osId: string): Promise<void>;
  /** A fila do dia do Técnico: as OS dele e das equipes dele ainda em curso. */
  osDoDia(ctx: Contexto): Promise<OsDoDia[]>;
}

export function criarCasosDeUsoDeExecucao(deps: {
  execucao: PortaExecucao;
  triagem: Pick<PortaTriagem, 'chamado' | 'os'>;
  situacoes: Pick<PortaSituacoes, 'listar'>;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Padrão: as do domínio. Só o teste de aceite troca, para provar a RLS sozinha. */
  regras?: {
    decidirNaOs?: typeof decidirNaOs;
    decidirRegistroNaOs?: typeof decidirRegistroNaOs;
  };
}): CasosDeUsoDeExecucao {
  const decidir = deps.regras?.decidirNaOs ?? decidirNaOs;
  const decidirRegistro = deps.regras?.decidirRegistroNaOs ?? decidirRegistroNaOs;

  async function ator(ctx: Contexto): Promise<AtorDaCorretiva> {
    const [atribuicoes, equipes] = await Promise.all([
      deps.atribuicoes.doUsuario(ctx),
      deps.execucao.equipesDoUsuario(ctx),
    ]);
    return { usuarioId: ctx.usuarioId, atribuicoes, equipes };
  }

  async function osEChamado(
    ctx: Contexto,
    osId: string,
  ): Promise<{ os: OsGravada; chamado: ChamadoParaTriagem }> {
    const os = await deps.triagem.os(ctx, osId);
    const chamado = os ? await deps.triagem.chamado(ctx, os.chamadoId) : null;
    if (!os || !chamado) {
      throw new NaoEncontrado('os_nao_encontrada', 'Ordem de serviço não encontrada.');
    }
    return { os, chamado };
  }

  async function registro(ctx: Contexto, qual: RegistroNaOs, osId: string) {
    const { os, chamado } = await osEChamado(ctx, osId);
    decidirRegistro(qual, {
      ator: await ator(ctx),
      chamado,
      os: { estado: os.estado, responsavel: os.responsavel },
      agora: deps.relogio.agora(),
    });
    return os;
  }

  return {
    async prepararAcao(ctx, acao, p) {
      const { os, chamado } = await osEChamado(ctx, p.osId);
      // A regra antes da versão: a OS reatribuída no servidor, com a operação
      // na fila, volta como os_de_outro_responsavel, e não como versão.
      const d = decidir(acao, {
        ator: await ator(ctx),
        chamado,
        os: { estado: os.estado, responsavel: os.responsavel },
        agora: deps.relogio.agora(),
      });
      if (os.versao !== p.versao) throw conflitoDeVersao(os.versao);
      const situacoes = await deps.situacoes.listar(ctx);
      return {
        acao,
        osId: os.id,
        versao: p.versao,
        estado: d.estado,
        situacaoId: situacaoPara(situacoes, 'os', d.estado),
        chamado:
          d.chamado === null
            ? null
            : {
                id: chamado.id,
                versao: chamado.versao,
                estado: d.chamado,
                situacaoId: situacaoPara(situacoes, 'chamado', d.chamado),
              },
      };
    },

    async prepararApontamento(ctx, p) {
      const os = await registro(ctx, 'apontar_horas', p.osId);
      const { inicio, fim } = validarApontamento(p, deps.relogio.agora());
      return { osId: os.id, hotelId: os.hotelId, inicio, fim };
    },

    async prepararMaterial(ctx, p) {
      const os = await registro(ctx, 'registrar_material', p.osId);
      return { osId: os.id, hotelId: os.hotelId, descricao: normalizarMaterial(p.descricao) };
    },

    async exigirFoto(ctx, osId) {
      await registro(ctx, 'anexar_foto', osId);
    },

    osDoDia: (ctx) => deps.execucao.osDoDia(ctx),
  };
}
