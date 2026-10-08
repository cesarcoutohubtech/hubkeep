// Execução da OS pelo Técnico (fase 1a, C4; ADR-025, ADR-027, ADR-029). O
// responsável (ele, ou uma equipe de que é membro ativo) inicia, pausa, retoma
// e conclui a OS, aponta horas e registra material. Tudo chega pelas operações
// offline do PWA: aqui fica a validação que lê o banco (preparar*), e a
// gravação vai na unit of work da operação, uma vez só (sincronizacao.ts).
//
// A transição leva a versão que o aparelho calculou (a vista mais uma por
// transição já na fila); se a OS mudou no servidor (reatribuída, cancelada),
// a recusa volta como conflito, visível ao Técnico (ADR-025, ADR-029).
//
// Parada do ativo na execução (C5): o responsável registra (aberta, ou já com
// o fim) e encerra a parada do ativo do chamado, com a regra dos registros.
// Só uma aberta por ativo; a que ele encerra é a do chamado desta OS. Na
// conclusão, com a parada do chamado aberta, o técnico responde se o
// equipamento voltou a funcionar; sim, a parada encerra com a hora da
// conclusão, na mesma operação (paradaAEncerrarNaConclusao).
import {
  type AtorDaCorretiva,
  type Contexto,
  Conflito,
  NaoEncontrado,
  type RegistroNaOs,
  conflitoDeVersao,
  decidirNaOs,
  decidirRegistroNaOs,
  exigirAtivoNoChamado,
  exigirParadaAberta,
  exigirSemParadaAberta,
  normalizarMaterial,
  paradaAEncerrarNaConclusao,
  situacaoPara,
  validarApontamento,
  validarFimDaParada,
  validarParada,
} from '@hubkeep/dominio';
import type { AcaoNaOsDecidida, OsDoDia, PortaExecucao } from '../portas/execucao';
import type { EncerramentoDeParada, PortaParadas, RegistroDeParada } from '../portas/paradas';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { PortaSituacoes } from '../portas/situacoes';
import type { ChamadoParaTriagem, OsGravada, PortaTriagem } from '../portas/triagem';

export type AcaoDoTecnico = AcaoNaOsDecidida['acao'];

export interface CasosDeUsoDeExecucao {
  prepararAcao(
    ctx: Contexto,
    acao: AcaoDoTecnico,
    p: {
      osId: string;
      versao: number;
      /** Só na conclusão: a resposta à pergunta sobre a parada do chamado. */
      equipamentoVoltou?: boolean | undefined;
      /** Só na conclusão: a hora do aparelho, que vira o fim da parada. */
      concluidaEm?: Date | undefined;
    },
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
  /** Parada do ativo do chamado, registrada na OS (C5): aberta, ou já com o fim. */
  prepararParada(
    ctx: Contexto,
    p: { osId: string; inicio: Date; fim: Date | null },
  ): Promise<RegistroDeParada>;
  /** Encerra a parada aberta do ativo do chamado da OS (C5). */
  prepararEncerramentoDeParada(
    ctx: Contexto,
    p: { osId: string; fim: Date },
  ): Promise<EncerramentoDeParada>;
  /** A fila do dia do Técnico: as OS dele e das equipes dele ainda em curso. */
  osDoDia(ctx: Contexto): Promise<OsDoDia[]>;
}

export function criarCasosDeUsoDeExecucao(deps: {
  execucao: PortaExecucao;
  triagem: Pick<PortaTriagem, 'chamado' | 'os'>;
  situacoes: Pick<PortaSituacoes, 'listar'>;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Opcional só para os testes que não registram parada; a composição sempre passa. */
  paradas?: Pick<PortaParadas, 'abertaDoAtivo'>;
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
    return { os, chamado };
  }

  const paradas = () => {
    if (!deps.paradas) throw new Error('Parada sem a porta de paradas.');
    return deps.paradas;
  };

  async function paradaDaConclusao(
    ctx: Contexto,
    os: OsGravada,
    chamado: ChamadoParaTriagem,
    p: { equipamentoVoltou?: boolean | undefined; concluidaEm?: Date | undefined },
  ): Promise<EncerramentoDeParada | null> {
    if (chamado.ativoId === null || p.equipamentoVoltou !== true) return null;
    const alvo = paradaAEncerrarNaConclusao(
      await paradas().abertaDoAtivo(ctx, chamado.ativoId),
      chamado.id,
      p.equipamentoVoltou,
    );
    if (!alvo) return null;
    const agora = deps.relogio.agora();
    const fim = validarFimDaParada(alvo.inicio, p.concluidaEm ?? agora, agora);
    return { id: alvo.id, hotelId: os.hotelId, fim };
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
      const encerrarParada =
        acao === 'concluir' ? await paradaDaConclusao(ctx, os, chamado, p) : null;
      const situacoes = await deps.situacoes.listar(ctx);
      return {
        encerrarParada,
        acao,
        osId: os.id,
        versao: p.versao,
        de: os.estado,
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
      const { os } = await registro(ctx, 'apontar_horas', p.osId);
      const { inicio, fim } = validarApontamento(p, deps.relogio.agora());
      return { osId: os.id, hotelId: os.hotelId, inicio, fim };
    },

    async prepararMaterial(ctx, p) {
      const { os } = await registro(ctx, 'registrar_material', p.osId);
      return { osId: os.id, hotelId: os.hotelId, descricao: normalizarMaterial(p.descricao) };
    },

    async exigirFoto(ctx, osId) {
      await registro(ctx, 'anexar_foto', osId);
    },

    async prepararParada(ctx, p) {
      const { os, chamado } = await registro(ctx, 'registrar_parada', p.osId);
      const ativoId = exigirAtivoNoChamado(chamado.ativoId);
      const { inicio, fim } = validarParada(p, deps.relogio.agora());
      exigirSemParadaAberta(await paradas().abertaDoAtivo(ctx, ativoId));
      return { hotelId: os.hotelId, ativoId, chamadoId: chamado.id, osId: os.id, inicio, fim };
    },

    async prepararEncerramentoDeParada(ctx, p) {
      const { os, chamado } = await registro(ctx, 'encerrar_parada', p.osId);
      const ativoId = exigirAtivoNoChamado(chamado.ativoId);
      const aberta = exigirParadaAberta(await paradas().abertaDoAtivo(ctx, ativoId));
      // A aberta de outro chamado do mesmo ativo não é desta OS: quem encerra é
      // o responsável por aquele chamado, ou a gestão do hotel pelo web.
      if (aberta.chamadoId !== chamado.id) {
        throw new Conflito('parada_de_outro_chamado', 'A parada aberta é de outro chamado.');
      }
      const fim = validarFimDaParada(aberta.inicio, p.fim, deps.relogio.agora());
      return { id: aberta.id, hotelId: os.hotelId, fim };
    },

    osDoDia: (ctx) => deps.execucao.osDoDia(ctx),
  };
}
