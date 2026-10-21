// A OS como o técnico a vê no aparelho (C4b; ADR-025, ADR-029): a guardada
// (a última resposta da API) com as operações dele ainda na fila aplicadas
// por cima, na ordem em que foram feitas. Cada transição leva a versão que a
// OS tinha antes dela, e a projeção soma um; assim uma segunda ação sem rede
// sai com a versão certa. A transição só se aplica se a versão bate com a da
// projeção: se o servidor já tinha aplicado (a resposta se perdeu) e a API já
// devolveu a OS adiante, a operação não conta duas vezes. As regras de quem
// e de quando são as do domínio, as mesmas do servidor, que confere de novo.
// A parada do ativo (C5) também: registrada aberta, o ativo aparece parado
// desde o início dela; encerrada, deixa de aparecer. A conclusão com "o
// equipamento voltou a funcionar" encerra a parada do chamado junto, e a com
// "UH liberada" (I4), o período da UH indisponível. As fotos "depois" na fila
// somam às que a API contou (I8): com a política do hotel ligada, a tela só
// conclui com ao menos uma. As respostas do checklist na fila (PV1) mesclam
// por cima das que a API deu, item a item, como o servidor fará (null tira).
import {
  ESTADOS_QUE_ACEITAM_FOTO,
  ESTADOS_QUE_ACEITAM_REGISTRO,
  type EstadoDaOs,
  TRANSICOES_DA_OS,
  obrigatoriosSemResposta,
} from '@hubkeep/dominio';
import type { FotoNaFila, OperacaoNaFila } from '../fila/banco';
import type { OsGuardada } from './banco';

export const ACOES_DO_TECNICO = ['iniciar', 'pausar', 'retomar', 'concluir'] as const;
export type AcaoDoTecnico = (typeof ACOES_DO_TECNICO)[number];

type ChecklistGuardado = NonNullable<OsGuardada['checklist']>;

export interface OsNoAparelho extends Omit<
  OsGuardada,
  'fotosDepois' | 'fotoDepoisObrigatoria' | 'checklist' | 'checklistCompletoObrigatorio'
> {
  /** Operações desta OS ainda na fila: transições, horas, material e fotos. */
  pendentes: number;
  /** Fotos "depois" da OS: as que a API contou e as da fila (I8). */
  fotosDepois: number;
  /** A política da foto "depois" do hotel (I8); a guardada antes da I8 conta como desligada. */
  fotoDepoisObrigatoria: boolean;
  /** O checklist da OS (PV1), com as respostas da fila por cima; null: sem checklist. */
  checklist: ChecklistGuardado | null;
  /** A política do checklist completo do hotel (PV1); a guardada antes da PV1, desligada. */
  checklistCompletoObrigatorio: boolean;
}

const acaoDoTipo = (tipo: OperacaoNaFila['tipo']): AcaoDoTecnico | null => {
  const acao = tipo.startsWith('os.') ? tipo.slice('os.'.length) : '';
  return (ACOES_DO_TECNICO as readonly string[]).includes(acao) ? (acao as AcaoDoTecnico) : null;
};

/** A OS a que a operação se refere; null se não é de OS. */
export function osDaOperacao(op: Pick<OperacaoNaFila, 'tipo' | 'dados'>): string | null {
  if (op.tipo === 'anexo.foto') return (op.dados as FotoNaFila).registroId;
  if (op.tipo.startsWith('os.')) return (op.dados as { osId: string }).osId;
  return null;
}

export function projetarOs(
  guardadas: readonly OsGuardada[],
  fila: readonly OperacaoNaFila[],
): OsNoAparelho[] {
  const porId = new Map<string, OsNoAparelho>(
    guardadas.map((o) => [
      o.id,
      {
        ...o,
        pendentes: 0,
        fotosDepois: o.fotosDepois ?? 0,
        fotoDepoisObrigatoria: o.fotoDepoisObrigatoria === true,
        checklist: o.checklist ? { ...o.checklist, respostas: { ...o.checklist.respostas } } : null,
        checklistCompletoObrigatorio: o.checklistCompletoObrigatorio === true,
      },
    ]),
  );
  for (const op of fila) {
    // A recusada não aconteceu: fica na tela até o técnico dispensar.
    if (op.estado !== 'pendente') continue;
    const os = porId.get(osDaOperacao(op) ?? '');
    if (!os) continue;
    os.pendentes += 1;
    if (op.tipo === 'anexo.foto') {
      if ((op.dados as FotoNaFila).momento === 'depois') os.fotosDepois += 1;
      continue;
    }
    if (op.tipo === 'os.registrar_parada') {
      const d = op.dados as { inicio: string; fim: string | null };
      // A preventiva não tem parada (parada_na_preventiva): nada a projetar.
      if (d.fim === null && os.chamado) {
        os.chamado = { ...os.chamado, paradoDesde: d.inicio, paradaDoChamado: true };
      }
      continue;
    }
    if (op.tipo === 'os.encerrar_parada') {
      if (os.chamado) os.chamado = { ...os.chamado, paradoDesde: null, paradaDoChamado: false };
      continue;
    }
    if (op.tipo === 'os.responder_checklist') {
      if (!os.checklist) continue;
      const d = op.dados as {
        respostas: Record<string, string | number | boolean | null>;
        feitaEm?: string;
      };
      const removidas = new Set(
        Object.keys(d.respostas).filter((chave) => d.respostas[chave] === null),
      );
      const respostas = Object.fromEntries(
        Object.entries(os.checklist.respostas).filter(([chave]) => !removidas.has(chave)),
      );
      for (const [chave, valor] of Object.entries(d.respostas)) {
        if (valor !== null)
          respostas[chave] = { valor, feitaEm: d.feitaEm ?? '', usuarioId: op.usuarioId };
      }
      os.checklist = { ...os.checklist, respostas };
      continue;
    }
    const acao = acaoDoTipo(op.tipo);
    if (!acao) continue;
    const t = TRANSICOES_DA_OS[acao];
    const { versao, equipamentoVoltou, uhLiberada } = op.dados as {
      versao: number;
      equipamentoVoltou?: boolean;
      uhLiberada?: boolean;
    };
    if (versao === os.versao && (t.de as readonly string[]).includes(os.estado)) {
      os.estado = t.para as EstadoDaOs;
      os.versao += 1;
      if (acao === 'concluir' && equipamentoVoltou === true && os.chamado?.paradaDoChamado) {
        os.chamado = { ...os.chamado, paradoDesde: null, paradaDoChamado: false };
      }
      if (acao === 'concluir' && uhLiberada === true && os.chamado) {
        os.chamado = { ...os.chamado, uhIndisponivelDesde: null };
      }
    }
  }
  return [...porId.values()];
}

/** As ações do técnico que valem no estado (o servidor confere de novo). */
export const acoesPossiveis = (estado: EstadoDaOs): AcaoDoTecnico[] =>
  ACOES_DO_TECNICO.filter((a) => (TRANSICOES_DA_OS[a].de as readonly string[]).includes(estado));

/** Horas, material e parada: só com a OS em execução ou pausada. */
export const aceitaRegistro = (estado: EstadoDaOs): boolean =>
  ESTADOS_QUE_ACEITAM_REGISTRO.includes(estado);

/** Foto: também com a OS atribuída, a foto "antes" (I8). */
export const aceitaFoto = (estado: EstadoDaOs): boolean =>
  ESTADOS_QUE_ACEITAM_FOTO.includes(estado);

/** Com a política do hotel ligada, concluir pede ao menos uma foto "depois" (I8). */
export const faltaFotoDepois = (os: OsNoAparelho): boolean =>
  os.fotoDepoisObrigatoria && os.fotosDepois < 1;

/**
 * O que a tela oferece sobre a parada do ativo do chamado (C5). A parada
 * aberta por outro chamado do mesmo ativo aparece, mas não é desta OS: sem
 * botão (o servidor recusaria com parada_de_outro_chamado).
 */
export function paradaPossivel(os: OsNoAparelho): 'registrar' | 'encerrar' | null {
  // A preventiva não tem chamado nem parada (parada_na_preventiva, PV3c).
  if (!os.chamado || !aceitaRegistro(os.estado) || os.chamado.ativoId === null) return null;
  if (os.chamado.paradoDesde == null) return 'registrar';
  return os.chamado.paradaDoChamado ? 'encerrar' : null;
}

/** Concluir com a parada do chamado aberta pede a resposta: o equipamento voltou? */
export const perguntaNaConclusao = (os: OsNoAparelho): boolean =>
  os.chamado?.paradoDesde != null && os.chamado.paradaDoChamado === true;

/**
 * Concluir com a UH do chamado indisponível pede a resposta: a UH foi liberada?
 * (I4). A OS guardada antes da I4 não tem o campo e não pergunta.
 */
export const perguntaDaUhNaConclusao = (os: OsNoAparelho): boolean =>
  os.chamado?.uhIndisponivelDesde != null;

/** O local da OS: o do chamado, na corretiva, ou o da OS, na preventiva (PV3c). */
export function localDaOs(os: Pick<OsGuardada, 'chamado' | 'preventiva'>): {
  nome: string;
  edificacao: string | null;
} {
  if (os.chamado)
    return { nome: os.chamado.localNome, edificacao: os.chamado.localEdificacao ?? null };
  return {
    nome: os.preventiva?.localNome ?? '',
    edificacao: os.preventiva?.localEdificacao ?? null,
  };
}

/**
 * Desde quando o ativo da OS está parado (C5): na corretiva, o do chamado; na
 * preventiva, o ativo da ocorrência (Cesar, 21/10/2026). null: não está parado,
 * ou a OS foi guardada antes do campo.
 */
export const paradoDesdeDaOs = (os: Pick<OsGuardada, 'chamado' | 'preventiva'>): string | null =>
  (os.chamado ? os.chamado.paradoDesde : os.preventiva?.paradoDesde) ?? null;

/** O ativo da OS: o do chamado, na corretiva, ou o da ocorrência, na preventiva (PV3c). */
export const ativoDaOs = (os: Pick<OsGuardada, 'chamado' | 'preventiva'>): string | null =>
  os.chamado ? os.chamado.ativoId : (os.preventiva?.ativoId ?? null);

/** Os itens obrigatórios do checklist ainda sem resposta (PV1); sem checklist, nenhum. */
export const checklistFaltando = (os: OsNoAparelho): string[] =>
  os.checklist ? obrigatoriosSemResposta(os.checklist.itens, os.checklist.respostas) : [];

/** Com a política do hotel ligada, concluir pede os obrigatórios do checklist (PV1). */
export const faltaChecklist = (os: OsNoAparelho): boolean =>
  os.checklistCompletoObrigatorio && checklistFaltando(os).length > 0;
