// Recebimento das operações que o PWA do técnico fez sem rede (F0-11, ADR-025).
//
// Cada operação chega com a chave gerada no aparelho. O reenvio de chave já
// aplicada devolve a resposta guardada antes de qualquer validação: ela olha
// o estado de agora (a OS já concluída, a versão já adiante) e recusaria o que
// já foi feito. A validação roda antes de aplicar (operação inválida é 422 e
// não guarda a chave: o aparelho a descarta); a operação válida é aplicada
// uma vez só, pela porta. Tipos: a troca das
// próprias preferências (fase 0), o cadastro e a alteração de ativo (B3), a
// abertura do chamado (C2), com a mesma preparação do web, e a execução da OS
// pelo Técnico (C4: iniciar, pausar, retomar, concluir, horas e material; C5:
// registrar e encerrar a parada do ativo do chamado). No
// ativo, a validação que lê o banco (local, categoria, permissão) é a mesma
// do web (preparar*); a versão é conferida na gravação, e o conflito volta
// como 409 conflito_de_versao, sem guardar a chave (ADR-029). As respostas
// do checklist (PV1, ADR-040) vão sem a versão da OS: o servidor mescla item a
// item, e a última operação processada vence.
import type { Contexto } from '@hubkeep/dominio';
import type { PortaOperacoesOffline, RespostaDeOperacao } from '../portas/sincronizacao';
import type { PreferenciasGravadas } from '../portas/preferencias';
import type {
  CasosDeUsoDeAtivos,
  PedidoDeAlteracaoDeAtivo,
  PedidoDeCadastroDeAtivo,
} from './ativos';
import type { CasosDeUsoDeChamados, PedidoDeAberturaDeChamado } from './chamados';
import type { CasosDeUsoDeChecklists } from './checklists';
import type { AcaoDoTecnico, CasosDeUsoDeExecucao } from './execucao';
import { validarPreferencias } from './preferencias';

export type OperacaoOffline =
  | { chave: string; tipo: 'preferencias.gravar'; dados: PreferenciasGravadas }
  | { chave: string; tipo: 'ativo.cadastrar'; dados: PedidoDeCadastroDeAtivo }
  | {
      chave: string;
      tipo: 'ativo.alterar';
      dados: PedidoDeAlteracaoDeAtivo & { ativoId: string };
    }
  | { chave: string; tipo: 'chamado.abrir'; dados: PedidoDeAberturaDeChamado }
  | {
      chave: string;
      tipo: `os.${AcaoDoTecnico}`;
      /**
       * Na conclusão, com a parada do chamado aberta: a resposta a "o
       * equipamento voltou a funcionar?" e a hora do aparelho (ISO 8601).
       */
      dados: {
        osId: string;
        versao: number;
        /** A hora do aparelho em que o técnico agiu (I9, ISO 8601). */
        feitaEm?: string | undefined;
        equipamentoVoltou?: boolean | undefined;
        /** Na conclusão, com a UH do chamado indisponível: "a UH foi liberada?" (I4). */
        uhLiberada?: boolean | undefined;
        concluidaEm?: string | undefined;
        /** Na conclusão, os códigos sugeridos pelo técnico (I6); nunca recusam. */
        codigos?:
          | {
              falhaId?: string | null | undefined;
              causaId?: string | null | undefined;
              solucaoId?: string | null | undefined;
            }
          | undefined;
      };
    }
  | {
      chave: string;
      tipo: 'os.apontar_horas';
      /** Instantes em ISO 8601, como o aparelho registrou. */
      dados: { osId: string; inicio: string; fim: string };
    }
  | { chave: string; tipo: 'os.registrar_material'; dados: { osId: string; descricao: string } }
  | {
      chave: string;
      tipo: 'os.registrar_parada';
      /** Instantes em ISO 8601; sem fim, a parada fica aberta. */
      dados: { osId: string; inicio: string; fim: string | null };
    }
  | { chave: string; tipo: 'os.encerrar_parada'; dados: { osId: string; fim: string } }
  | {
      chave: string;
      tipo: 'os.responder_checklist';
      /** Por item, o valor ou null (limpa); a hora do aparelho em ISO 8601 (PV1). */
      dados: { osId: string; respostas: Record<string, unknown>; feitaEm?: string | undefined };
    };

export interface ResultadoDaOperacao {
  chave: string;
  /** true: a chave já tinha sido recebida; nada foi aplicado de novo. */
  repetida: boolean;
  resposta: RespostaDeOperacao;
}

export interface CasosDeUsoDeSincronizacao {
  receberOperacao(ctx: Contexto, operacao: OperacaoOffline): Promise<ResultadoDaOperacao>;
}

export function criarCasosDeUsoDeSincronizacao(deps: {
  operacoes: PortaOperacoesOffline;
  ativos: Pick<CasosDeUsoDeAtivos, 'prepararCadastro' | 'prepararAlteracao'>;
  /** Opcional só para os testes que não abrem chamado; a composição sempre passa. */
  chamados?: Pick<CasosDeUsoDeChamados, 'prepararAbertura'>;
  /** Opcional só para os testes que não executam OS; a composição sempre passa. */
  execucao?: Pick<
    CasosDeUsoDeExecucao,
    | 'prepararAcao'
    | 'prepararApontamento'
    | 'prepararMaterial'
    | 'prepararParada'
    | 'prepararEncerramentoDeParada'
  >;
  /** Opcional só para os testes sem checklist; a composição sempre passa. */
  checklists?: Pick<CasosDeUsoDeChecklists, 'prepararRespostas'>;
}): CasosDeUsoDeSincronizacao {
  const execucao = () => {
    if (!deps.execucao) throw new Error('Operação da OS sem os casos de uso de execução.');
    return deps.execucao;
  };

  return {
    async receberOperacao(ctx, operacao) {
      const guardada = await deps.operacoes.respostaGuardada(ctx, operacao.chave);
      if (guardada) return { chave: operacao.chave, repetida: true, resposta: guardada };
      switch (operacao.tipo) {
        case 'preferencias.gravar': {
          validarPreferencias(operacao.dados);
          const r = await deps.operacoes.aplicarUmaVez(ctx, operacao, async (s) => {
            await s.gravarPreferencias(operacao.dados);
            return { aplicada: true };
          });
          return { chave: operacao.chave, ...r };
        }
        case 'ativo.cadastrar': {
          const c = await deps.ativos.prepararCadastro(ctx, operacao.dados);
          const r = await deps.operacoes.aplicarUmaVez(ctx, operacao, async (s) => {
            const { id, versao } = await s.cadastrarAtivo(c.hotelId, c.localId, c.dados);
            return { id, versao };
          });
          return { chave: operacao.chave, ...r };
        }
        case 'ativo.alterar': {
          const { ativoId, ...pedido } = operacao.dados;
          const c = await deps.ativos.prepararAlteracao(ctx, ativoId, pedido);
          const r = await deps.operacoes.aplicarUmaVez(ctx, operacao, async (s) => {
            const { versao } = await s.alterarAtivo(c.ativoId, c.versaoEsperada, c.dados);
            return { id: c.ativoId, versao };
          });
          return { chave: operacao.chave, ...r };
        }
        case 'chamado.abrir': {
          if (!deps.chamados) throw new Error('chamado.abrir sem os casos de uso de chamados.');
          const c = await deps.chamados.prepararAbertura(ctx, operacao.dados);
          const r = await deps.operacoes.aplicarUmaVez(ctx, operacao, async (s) => {
            const { id, versao } = await s.abrirChamado(c.hotelId, c.dados);
            return { id, versao };
          });
          return { chave: operacao.chave, ...r };
        }
        case 'os.iniciar':
        case 'os.pausar':
        case 'os.retomar':
        case 'os.concluir': {
          const acao = operacao.tipo.slice('os.'.length) as AcaoDoTecnico;
          const { osId, versao, feitaEm, equipamentoVoltou, uhLiberada, concluidaEm, codigos } =
            operacao.dados;
          const g = await execucao().prepararAcao(ctx, acao, {
            osId,
            versao,
            feitaEm: feitaEm === undefined ? undefined : new Date(feitaEm),
            equipamentoVoltou,
            uhLiberada,
            concluidaEm: concluidaEm === undefined ? undefined : new Date(concluidaEm),
            codigos,
          });
          // A parada e a UH encerram na mesma unit of work da conclusão: o
          // reenvio devolve a resposta guardada e não encerra de novo.
          const r = await deps.operacoes.aplicarUmaVez(ctx, operacao, async (s) => {
            const { versao } = await s.andarComOs(g);
            if (g.encerrarParada) await s.encerrarParada(g.encerrarParada);
            if (g.liberarUh) await s.liberarUh(g.liberarUh);
            return {
              id: g.osId,
              versao,
              estado: g.estado,
              ...(acao === 'concluir'
                ? {
                    paradaEncerrada: Boolean(g.encerrarParada),
                    uhLiberada: Boolean(g.liberarUh),
                    codigosDescartados: g.codigos?.descartados.length ?? 0,
                  }
                : {}),
            };
          });
          return { chave: operacao.chave, ...r };
        }
        case 'os.apontar_horas': {
          const g = await execucao().prepararApontamento(ctx, {
            osId: operacao.dados.osId,
            inicio: new Date(operacao.dados.inicio),
            fim: new Date(operacao.dados.fim),
          });
          const r = await deps.operacoes.aplicarUmaVez(ctx, operacao, async (s) => {
            const { id } = await s.apontarHoras(g);
            return { id };
          });
          return { chave: operacao.chave, ...r };
        }
        case 'os.registrar_material': {
          const g = await execucao().prepararMaterial(ctx, operacao.dados);
          const r = await deps.operacoes.aplicarUmaVez(ctx, operacao, async (s) => {
            const { id } = await s.registrarMaterial(g);
            return { id };
          });
          return { chave: operacao.chave, ...r };
        }
        case 'os.registrar_parada': {
          const g = await execucao().prepararParada(ctx, {
            osId: operacao.dados.osId,
            inicio: new Date(operacao.dados.inicio),
            fim: operacao.dados.fim === null ? null : new Date(operacao.dados.fim),
          });
          const r = await deps.operacoes.aplicarUmaVez(ctx, operacao, async (s) => {
            const { id } = await s.registrarParada(g);
            return { id };
          });
          return { chave: operacao.chave, ...r };
        }
        case 'os.encerrar_parada': {
          const g = await execucao().prepararEncerramentoDeParada(ctx, {
            osId: operacao.dados.osId,
            fim: new Date(operacao.dados.fim),
          });
          const r = await deps.operacoes.aplicarUmaVez(ctx, operacao, async (s) => {
            await s.encerrarParada(g);
            return { id: g.id };
          });
          return { chave: operacao.chave, ...r };
        }
        case 'os.responder_checklist': {
          if (!deps.checklists) throw new Error('os.responder_checklist sem os casos de uso.');
          const { osId, respostas, feitaEm } = operacao.dados;
          const g = await deps.checklists.prepararRespostas(ctx, {
            osId,
            respostas,
            feitaEm: feitaEm === undefined ? undefined : new Date(feitaEm),
          });
          const r = await deps.operacoes.aplicarUmaVez(ctx, operacao, async (s) => {
            await s.responderChecklist(g);
            return { id: g.checklistId, itens: Object.keys(g.respostas).length };
          });
          return { chave: operacao.chave, ...r };
        }
      }
    },
  };
}
