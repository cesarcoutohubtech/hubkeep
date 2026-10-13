// Checklist tipado (fase 1b, PV1; ADR-040): os modelos do grupo (listar,
// criar, alterar, desativar e reativar, só o Admin do grupo), a aplicação na
// OS por quem tria, a leitura da cópia na OS e a preparação das respostas
// que chegam pela fila offline (os.responder_checklist, sincronizacao.ts).
// As regras são do domínio (checklist.ts); a RLS decide por último. As
// regras de quem pode são injetáveis para o teste provar que a RLS ainda
// barra.
import {
  type Atribuicao,
  type Contexto,
  type DefinicaoDeCampo,
  NaoEncontrado,
  type Resultado,
  type Rotulos,
  decidirAplicacaoDoChecklist,
  decidirRegistroNaOs,
  exigir,
  horaDaResposta,
  lerDefinicoes,
  lerRespostas,
  normalizarRotulos,
  podeGerirChecklists,
  podeTriar,
  validarItensDoChecklist,
  validarNomesDoChecklist,
  validarRespostasDoChecklist,
} from '@hubkeep/dominio';
import type { Idioma } from '@hubkeep/i18n';
import type {
  ChecklistDaOs,
  ChecklistDaOsGravado,
  ModeloDeChecklistGravado,
  PortaChecklists,
  RespostasDoChecklistDecididas,
} from '../portas/checklists';
import type { PortaExecucao } from '../portas/execucao';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { ChamadoParaTriagem, OsGravada, PortaTriagem } from '../portas/triagem';

export interface ModeloDeChecklist {
  id: string;
  categoriaId: string | null;
  nomes: Rotulos;
  itens: DefinicaoDeCampo[];
  versao: number;
  ativa: boolean;
}

export interface PedidoDeModeloDeChecklist {
  nomes: unknown;
  categoriaId: string | null;
  itens: unknown;
}

export interface CasosDeUsoDeChecklists {
  listarModelos(ctx: Contexto): Promise<{ idiomaPadrao: Idioma; modelos: ModeloDeChecklist[] }>;
  criarModelo(ctx: Contexto, p: PedidoDeModeloDeChecklist): Promise<{ id: string }>;
  /** A versão sobe só quando os itens mudam (validarItensDoChecklist). */
  alterarModelo(
    ctx: Contexto,
    id: string,
    p: PedidoDeModeloDeChecklist,
  ): Promise<{ versao: number }>;
  desativarModelo(ctx: Contexto, id: string): Promise<void>;
  reativarModelo(ctx: Contexto, id: string): Promise<void>;
  /** Quem tria aplica o modelo ativo na OS, ou troca o que ainda não tem resposta. */
  aplicarNaOs(ctx: Contexto, osId: string, modeloId: string): Promise<{ id: string }>;
  /** A cópia na OS; null quando a OS não tem checklist. 404 se quem pede não vê a OS. */
  daOs(ctx: Contexto, osId: string): Promise<ChecklistDaOs | null>;
  /** Para a operação offline os.responder_checklist: o responsável, com a OS em execução ou pausada. */
  prepararRespostas(
    ctx: Contexto,
    p: { osId: string; respostas: unknown; feitaEm?: Date | undefined },
  ): Promise<RespostasDoChecklistDecididas>;
}

/** Leitura sem lançar: o que foi gravado fora do formato não quebra a lista. */
const paraModelo = (m: ModeloDeChecklistGravado): ModeloDeChecklist => ({
  id: m.id,
  categoriaId: m.categoriaId,
  nomes: normalizarRotulos(m.nomes, true) ?? {},
  itens: lerDefinicoes(m.itens),
  versao: m.versao,
  ativa: m.ativa,
});

export const paraChecklistDaOs = (c: ChecklistDaOsGravado): ChecklistDaOs => {
  const itens = lerDefinicoes(c.itens);
  return {
    id: c.id,
    osId: c.osId,
    modeloId: c.modeloId,
    modeloVersao: c.modeloVersao,
    nomes: normalizarRotulos(c.nomes, true) ?? {},
    itens,
    respostas: lerRespostas(itens, c.respostas),
  };
};

export function criarCasosDeUsoDeChecklists(deps: {
  checklists: PortaChecklists;
  triagem: Pick<PortaTriagem, 'os' | 'chamado'>;
  execucao: Pick<PortaExecucao, 'equipesDoUsuario'>;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Padrão: as do domínio. Só o teste de aceite troca, para provar a RLS sozinha. */
  regras?: {
    podeGerir?: (minhas: readonly Atribuicao[], agora: Date) => Resultado;
    podeTriar?: typeof podeTriar;
    decidirRegistroNaOs?: typeof decidirRegistroNaOs;
  };
}): CasosDeUsoDeChecklists {
  const podeGerir = deps.regras?.podeGerir ?? podeGerirChecklists;
  const triar = deps.regras?.podeTriar ?? podeTriar;
  const decidirRegistro = deps.regras?.decidirRegistroNaOs ?? decidirRegistroNaOs;

  const exigirAdmin = async (ctx: Contexto) =>
    exigir(podeGerir(await deps.atribuicoes.doUsuario(ctx), deps.relogio.agora()));
  const existente = async (ctx: Contexto, id: string) => {
    const m = (await deps.checklists.listarModelos(ctx)).find((x) => x.id === id);
    if (!m) throw new NaoEncontrado('checklist_nao_encontrado', 'Checklist não encontrado.');
    return paraModelo(m);
  };
  const ator = async (ctx: Contexto) => {
    const [atribuicoes, equipes] = await Promise.all([
      deps.atribuicoes.doUsuario(ctx),
      deps.execucao.equipesDoUsuario(ctx),
    ]);
    return { usuarioId: ctx.usuarioId, atribuicoes, equipes };
  };
  const osEChamado = async (
    ctx: Contexto,
    osId: string,
  ): Promise<{ os: OsGravada; chamado: ChamadoParaTriagem }> => {
    const os = await deps.triagem.os(ctx, osId);
    const chamado = os ? await deps.triagem.chamado(ctx, os.chamadoId) : null;
    if (!os || !chamado) {
      throw new NaoEncontrado('os_nao_encontrada', 'Ordem de serviço não encontrada.');
    }
    return { os, chamado };
  };

  return {
    async listarModelos(ctx) {
      const [idiomaPadrao, modelos] = await Promise.all([
        deps.checklists.idiomaPadrao(ctx),
        deps.checklists.listarModelos(ctx),
      ]);
      return { idiomaPadrao, modelos: modelos.map(paraModelo) };
    },

    async criarModelo(ctx, p) {
      await exigirAdmin(ctx);
      const { itens } = validarItensDoChecklist(p.itens);
      return deps.checklists.criarModelo(ctx, {
        categoriaId: p.categoriaId,
        nomes: validarNomesDoChecklist(p.nomes),
        itens,
      });
    },

    async alterarModelo(ctx, id, p) {
      await exigirAdmin(ctx);
      const atual = await existente(ctx, id);
      const { itens, versao } = validarItensDoChecklist(p.itens, atual);
      await deps.checklists.alterarModelo(ctx, id, {
        categoriaId: p.categoriaId,
        nomes: validarNomesDoChecklist(p.nomes),
        itens,
        versao,
      });
      return { versao };
    },

    async desativarModelo(ctx, id) {
      await exigirAdmin(ctx);
      await existente(ctx, id);
      await deps.checklists.alterarModelo(ctx, id, { ativa: false });
    },

    async reativarModelo(ctx, id) {
      await exigirAdmin(ctx);
      await existente(ctx, id);
      await deps.checklists.alterarModelo(ctx, id, { ativa: true });
    },

    async aplicarNaOs(ctx, osId, modeloId) {
      const { os, chamado } = await osEChamado(ctx, osId);
      triar(await ator(ctx), chamado.hotel, deps.relogio.agora());
      const [modelos, atual] = await Promise.all([
        deps.checklists.listarModelos(ctx),
        deps.checklists.daOs(ctx, osId),
      ]);
      const gravado = modelos.find((m) => m.id === modeloId);
      if (!gravado) {
        throw new NaoEncontrado('checklist_nao_encontrado', 'Checklist não encontrado.');
      }
      const modelo = paraModelo(gravado);
      decidirAplicacaoDoChecklist({
        estadoDaOs: os.estado,
        modeloAtivo: modelo.ativa,
        respostasAtuais: atual ? paraChecklistDaOs(atual).respostas : null,
      });
      return deps.checklists.aplicar(ctx, {
        osId: os.id,
        hotelId: os.hotelId,
        modelo: {
          id: modelo.id,
          versao: modelo.versao,
          nomes: modelo.nomes,
          itens: modelo.itens,
        },
        substitui: atual?.id ?? null,
      });
    },

    async daOs(ctx, osId) {
      // A OS que quem pede não vê é 404, e não "sem checklist".
      await osEChamado(ctx, osId);
      const c = await deps.checklists.daOs(ctx, osId);
      return c ? paraChecklistDaOs(c) : null;
    },

    async prepararRespostas(ctx, p) {
      const { os, chamado } = await osEChamado(ctx, p.osId);
      const agora = deps.relogio.agora();
      decidirRegistro('responder_checklist', {
        ator: await ator(ctx),
        chamado,
        os: { estado: os.estado, responsavel: os.responsavel },
        agora,
      });
      const c = await deps.checklists.daOs(ctx, os.id);
      if (!c) {
        throw new NaoEncontrado('os_sem_checklist', 'Esta ordem de serviço não tem checklist.');
      }
      return {
        checklistId: c.id,
        osId: os.id,
        hotelId: os.hotelId,
        respostas: validarRespostasDoChecklist(lerDefinicoes(c.itens), p.respostas),
        feitaEm: horaDaResposta(p.feitaEm, agora),
      };
    },
  };
}
