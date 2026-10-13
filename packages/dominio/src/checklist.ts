// Checklist tipado (fase 1b, PV1; ADR-040, aprovado pelo Cesar em 12/10/2026,
// com as decisões 1 a 5 do desenho em docs/referencia/
// propostas-desenho-pv-implantacao.md).
//
// O modelo é do grupo e só o Admin do grupo o cadastra. Os itens são campos
// tipados (ADR-028, campos-tipados.ts), até 50, com a marca de obrigatório. A
// versão sobe a cada gravação que muda os itens; o tipo de um item que já
// existe não muda (campo_muda_de_tipo).
//
// A OS guarda a cópia dos nomes, dos itens e da versão aplicada (ADR-026).
// Quem tria aplica o modelo na corretiva (podeTriar, corretiva.ts), ao gerar a OS ou depois, com a OS
// atribuída, em execução ou pausada; trocar o modelo só vale sem resposta.
//
// As respostas chegam pela fila offline do PWA (os.responder_checklist), item
// a item, sem a versão da OS: o servidor mescla, e a última operação
// processada vence. null limpa a resposta. Responde o Técnico responsável,
// com a OS em execução ou pausada (corretiva.ts, decidirRegistroNaOs).
//
// A política os.checklist_completo_obrigatorio, por hotel e desligada por
// padrão, recusa a conclusão sem os itens obrigatórios (checklist_incompleto).
// Desligada, o PWA só avisa. A OS sem checklist não exige nada.
import {
  type DefinicaoDeCampo,
  type Rotulos,
  type ValorDeCampo,
  lerDefinicoes,
  normalizarRotulos,
  validarDefinicoes,
  validarMudancaDeDefinicoes,
} from './campos-tipados';
import type { EstadoDaOs } from './corretiva';
import { Conflito, PermissaoNegada, RegraViolada } from './erros';
import { type Resultado, ehAdminGrupo } from './permissoes';
import type { Atribuicao } from './tipos';

/** Opções do item de conformidade; os rótulos vêm do catálogo (checklist.conformidade.<chave>). */
export const OPCOES_DE_CONFORMIDADE = ['conforme', 'nao_conforme', 'nao_se_aplica'] as const;
export type OpcaoDeConformidade = (typeof OPCOES_DE_CONFORMIDADE)[number];

/** Aplicar ou trocar o modelo: com a OS atribuída, em execução ou pausada. */
export const ESTADOS_QUE_ACEITAM_CHECKLIST: readonly EstadoDaOs[] = [
  'atribuida',
  'em_execucao',
  'pausada',
];

/** Os modelos são do grupo: só o Admin do grupo cria e altera. */
export function podeGerirChecklists(minhas: readonly Atribuicao[], agora: Date): Resultado {
  return ehAdminGrupo(minhas, agora)
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'checklists_so_admin',
          'Só o Admin do grupo gere os modelos de checklist.',
        ),
      };
}

/** Nomes do modelo por idioma: ao menos um, de 1 a 120 caracteres. */
export function validarNomesDoChecklist(nomes: unknown): Rotulos {
  const r = normalizarRotulos(nomes);
  if (!r) {
    throw new RegraViolada('checklist_nome_invalido', 'Nome do checklist inválido.', {
      maximo: 120,
    });
  }
  return r;
}

const mesmosItens = (a: readonly DefinicaoDeCampo[], b: readonly DefinicaoDeCampo[]) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Itens do modelo, novo ou alterado: as definições tipadas (até 50) e, na
 * alteração, nenhum item existente mudando de tipo. A versão sobe só quando os
 * itens mudam.
 */
export function validarItensDoChecklist(
  itens: unknown,
  atual?: { itens: readonly DefinicaoDeCampo[]; versao: number },
): { itens: DefinicaoDeCampo[]; versao: number } {
  const novos = validarDefinicoes(itens);
  if (!atual) return { itens: novos, versao: 1 };
  validarMudancaDeDefinicoes(atual.itens, novos);
  return {
    itens: novos,
    versao: mesmosItens(atual.itens, novos) ? atual.versao : atual.versao + 1,
  };
}

/**
 * Aplicar ou trocar: a OS atribuída, em execução ou pausada (409
 * transicao_invalida); o modelo ativo (422 checklist_modelo_inativo); trocar só
 * com a cópia ainda sem resposta (409 checklist_ja_respondido).
 */
export function decidirAplicacaoDoChecklist(p: {
  estadoDaOs: EstadoDaOs;
  modeloAtivo: boolean;
  respostasAtuais: Readonly<Record<string, unknown>> | null;
}): void {
  if (!ESTADOS_QUE_ACEITAM_CHECKLIST.includes(p.estadoDaOs)) {
    throw new Conflito('transicao_invalida', 'A ação não vale no estado atual.', {
      acao: 'aplicar_checklist',
      estado: p.estadoDaOs,
    });
  }
  if (!p.modeloAtivo) {
    throw new RegraViolada('checklist_modelo_inativo', 'O modelo de checklist está desativado.');
  }
  if (p.respostasAtuais && Object.keys(p.respostasAtuais).length > 0) {
    throw new Conflito(
      'checklist_ja_respondido',
      'O checklist desta OS já tem respostas e não pode ser trocado.',
    );
  }
}

/** Uma resposta gravada: o valor, a hora no aparelho e quem respondeu. */
export interface RespostaDoChecklist {
  valor: ValorDeCampo;
  feitaEm: string;
  usuarioId: string;
}

const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const valorDoItem = (d: DefinicaoDeCampo, v: unknown): ValorDeCampo | undefined => {
  switch (d.tipo) {
    case 'texto': {
      if (typeof v !== 'string') return undefined;
      const limpo = v.trim();
      return limpo.length > 0 && limpo.length <= 500 ? limpo : undefined;
    }
    case 'numero':
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    case 'data':
      return typeof v === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(v) &&
        new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v
        ? v
        : undefined;
    case 'lista':
      return typeof v === 'string' && d.opcoes.some((o) => o.chave === v) ? v : undefined;
    case 'sim_nao':
      return typeof v === 'boolean' ? v : undefined;
  }
};

/**
 * Respostas de uma operação, conferidas contra a cópia na OS: só itens da
 * cópia, cada valor no tipo do item; null limpa. Fora disso, 422
 * checklist_resposta_invalida com o item e o motivo.
 */
export function validarRespostasDoChecklist(
  itens: readonly DefinicaoDeCampo[],
  respostas: unknown,
): Record<string, ValorDeCampo | null> {
  if (!objeto(respostas) || Object.keys(respostas).length === 0) {
    throw new RegraViolada('checklist_resposta_invalida', 'Respostas do checklist inválidas.', {
      item: '',
      motivo: 'formato',
    });
  }
  const saida: Record<string, ValorDeCampo | null> = {};
  for (const [chave, bruto] of Object.entries(respostas)) {
    const d = itens.find((i) => i.chave === chave);
    if (!d) {
      throw new RegraViolada('checklist_resposta_invalida', 'Item fora do checklist.', {
        item: chave,
        motivo: 'item_desconhecido',
      });
    }
    if (bruto === null) {
      saida[chave] = null;
      continue;
    }
    const v = valorDoItem(d, bruto);
    if (v === undefined) {
      throw new RegraViolada('checklist_resposta_invalida', 'Valor fora do tipo do item.', {
        item: chave,
        motivo: 'tipo',
      });
    }
    saida[chave] = v;
  }
  return saida;
}

/** A hora da resposta: a do aparelho, sem passar da hora do servidor (como na I9). */
export function horaDaResposta(feitaEm: Date | null | undefined, agora: Date): Date {
  if (!feitaEm || Number.isNaN(feitaEm.getTime())) return agora;
  return feitaEm.getTime() > agora.getTime() ? agora : feitaEm;
}

/**
 * Mescla as respostas novas nas gravadas, item a item: a operação processada
 * por último vence; null remove o item.
 */
export function mesclarRespostas(
  gravadas: Readonly<Record<string, RespostaDoChecklist>>,
  novas: Readonly<Record<string, ValorDeCampo | null>>,
  quem: { usuarioId: string; feitaEm: Date },
): Record<string, RespostaDoChecklist> {
  const removidas = new Set(Object.keys(novas).filter((chave) => novas[chave] === null));
  const saida: Record<string, RespostaDoChecklist> = Object.fromEntries(
    Object.entries(gravadas).filter(([chave]) => !removidas.has(chave)),
  );
  for (const [chave, valor] of Object.entries(novas)) {
    if (valor !== null)
      saida[chave] = { valor, feitaEm: quem.feitaEm.toISOString(), usuarioId: quem.usuarioId };
  }
  return saida;
}

/** Respostas gravadas, para exibir: nunca lança; o que a cópia não aceita fica de fora. */
export function lerRespostas(
  itens: readonly DefinicaoDeCampo[],
  gravadas: unknown,
): Record<string, RespostaDoChecklist> {
  if (!objeto(gravadas)) return {};
  const saida: Record<string, RespostaDoChecklist> = {};
  for (const d of itens) {
    const r = gravadas[d.chave];
    if (!objeto(r)) continue;
    const valor = valorDoItem(d, r['valor']);
    if (valor === undefined) continue;
    saida[d.chave] = {
      valor,
      feitaEm: typeof r['feitaEm'] === 'string' ? r['feitaEm'] : '',
      usuarioId: typeof r['usuarioId'] === 'string' ? r['usuarioId'] : '',
    };
  }
  return saida;
}

/** Os itens obrigatórios ainda sem resposta, na ordem da cópia. */
export function obrigatoriosSemResposta(
  itens: readonly DefinicaoDeCampo[],
  respostas: Readonly<Record<string, unknown>>,
): string[] {
  return itens.filter((i) => i.obrigatorio && !(i.chave in respostas)).map((i) => i.chave);
}

/**
 * Com a política ligada, a conclusão precisa dos itens obrigatórios
 * respondidos. Sem checklist na OS (itens nulos), nada é exigido.
 */
export function exigirChecklistCompletoNaConclusao(
  obrigatorio: boolean,
  checklist: { itens: unknown; respostas: unknown } | null,
): void {
  if (!obrigatorio || !checklist) return;
  const itens = lerDefinicoes(checklist.itens);
  const faltam = obrigatoriosSemResposta(itens, lerRespostas(itens, checklist.respostas));
  if (faltam.length > 0) {
    throw new RegraViolada(
      'checklist_incompleto',
      'Responda os itens obrigatórios do checklist para concluir a OS.',
      { faltam: faltam.length, itens: faltam.join(', ') },
    );
  }
}
