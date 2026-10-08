// Histórico de um registro (fase 1a, D1): o que mudou em cada linha da
// auditoria, a partir do antes e do depois que a unit of work gravou. Os
// repositórios gravam o antes com o nome da coluna (situacao_id) e o depois
// com o nome do domínio (situacaoId); aqui os dois viram o mesmo campo, para a
// tela mostrar "campo: antes → depois" sem saber de onde veio cada um.
//
//   - só entram os campos do depois (o que a gravação mudou); o antes completo
//     da linha não vira mudança;
//   - sem depois (remoção), entram os campos do antes;
//   - objeto aninhado (campos estendidos do ativo) vira um campo por chave;
//   - o responsável da OS vira técnico e equipe, como as colunas;
//   - valores iguais dos dois lados não aparecem.

export const ENTIDADES_COM_HISTORICO = [
  'hotel',
  'local',
  'ativo',
  'chamado',
  'os',
  'fornecedor',
] as const;
export type EntidadeComHistorico = (typeof ENTIDADES_COM_HISTORICO)[number];

export type ValorAuditado = string | number | boolean | null;

export interface MudancaAuditada {
  /** Nome do campo no domínio (situacaoId, nome, campos). */
  campo: string;
  /** Chave dentro do campo, quando ele é um objeto (o campo estendido do ativo). */
  chave: string | null;
  antes: ValorAuditado;
  depois: ValorAuditado;
}

/**
 * Fora do histórico: controle interno, o próprio registro e o hotel dele, o chamado
 * da OS (que é o registro pai), a cópia da política e a coluna de busca.
 */
export const CAMPOS_FORA_DO_HISTORICO: readonly string[] = [
  'versao',
  'acao',
  'busca',
  'politicaAplicada',
  'id',
  'hotelId',
  'chamadoId',
];

/**
 * Ações cujo detalhe fica fora do histórico: a ativação bloqueada grava o uso
 * da licença, que só o Admin do grupo lê (licenca.contrato). A ação aparece;
 * os números, não.
 */
export const ACOES_SEM_DETALHE: Readonly<Record<EntidadeComHistorico, readonly string[]>> = {
  hotel: ['ativacao_bloqueada_sem_saldo'],
  local: [],
  ativo: [],
  chamado: [],
  os: [],
  fornecedor: [],
};

/** O tipo de registro que um campo de id aponta, para a tela mostrar o nome. */
export const REFERENCIA_DO_CAMPO = {
  localId: 'local',
  ativoId: 'ativo',
  situacaoId: 'situacao',
  prioridadeId: 'prioridade',
  categoriaId: 'categoria',
  bandeiraId: 'bandeira',
  tecnicoId: 'pessoa',
  equipeId: 'equipe',
  usuarioId: 'pessoa',
} as const;
export type TipoDeReferencia = (typeof REFERENCIA_DO_CAMPO)[keyof typeof REFERENCIA_DO_CAMPO];

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const camelo = (chave: string) => chave.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function valor(v: unknown): ValorAuditado {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return JSON.stringify(v);
}

/** Nomes do domínio no primeiro nível, e o responsável como as colunas da OS. */
function normalizar(registro: unknown): Record<string, unknown> {
  if (!ehObjeto(registro)) return {};
  const saida: Record<string, unknown> = {};
  for (const [chave, v] of Object.entries(registro)) {
    const campo = camelo(chave);
    if (CAMPOS_FORA_DO_HISTORICO.includes(campo)) continue;
    if (campo === 'responsavel' && ehObjeto(v)) {
      saida['tecnicoId'] = v['tipo'] === 'tecnico' ? (v['usuarioId'] ?? null) : null;
      saida['equipeId'] = v['tipo'] === 'equipe' ? (v['equipeId'] ?? null) : null;
      continue;
    }
    saida[campo] = v;
  }
  return saida;
}

/** Um valor por (campo, chave); o objeto aninhado abre uma chave por nível. */
function achatar(registro: Record<string, unknown>): Map<string, MudancaAuditada> {
  const saida = new Map<string, MudancaAuditada>();
  const abrir = (campo: string, chave: string | null, v: unknown) => {
    if (ehObjeto(v)) {
      for (const [k, filho] of Object.entries(v)) abrir(campo, chave ? `${chave}.${k}` : k, filho);
      return;
    }
    saida.set(`${campo}\u0000${chave ?? ''}`, { campo, chave, antes: null, depois: valor(v) });
  };
  for (const [campo, v] of Object.entries(registro)) abrir(campo, null, v);
  return saida;
}

/** As mudanças de uma linha da auditoria, na ordem em que o depois as grava. */
export function mudancasDaAuditoria(antes: unknown, depois: unknown): MudancaAuditada[] {
  const a = achatar(normalizar(antes));
  if (!ehObjeto(depois)) {
    return [...a.values()]
      .map((m) => ({ ...m, antes: m.depois, depois: null }))
      .filter((m) => m.antes !== null);
  }
  const d = achatar(normalizar(depois));
  const camposDoDepois = new Set([...d.values()].map((m) => m.campo));
  const chaves = [
    ...d.keys(),
    ...[...a.entries()]
      .filter(([k, m]) => !d.has(k) && camposDoDepois.has(m.campo))
      .map(([k]) => k),
  ];
  const mudancas: MudancaAuditada[] = [];
  for (const k of chaves) {
    const base = d.get(k) ?? a.get(k);
    if (!base) continue;
    const va = a.get(k)?.depois ?? null;
    const vd = d.get(k)?.depois ?? null;
    if (va !== vd) mudancas.push({ campo: base.campo, chave: base.chave, antes: va, depois: vd });
  }
  return mudancas;
}

/** O que o histórico mostra de uma linha: a ação sempre; as mudanças, se a ação as mostra. */
export function mudancasVisiveis(
  entidade: EntidadeComHistorico,
  acao: string,
  antes: unknown,
  depois: unknown,
): MudancaAuditada[] {
  if (ACOES_SEM_DETALHE[entidade].includes(acao)) return [];
  return mudancasDaAuditoria(antes, depois);
}

/** Os ids que as mudanças apontam, por tipo, para buscar os nomes. */
export function referenciasDasMudancas(
  mudancas: readonly MudancaAuditada[],
): Map<string, TipoDeReferencia> {
  const saida = new Map<string, TipoDeReferencia>();
  for (const m of mudancas) {
    if (m.chave !== null || !(m.campo in REFERENCIA_DO_CAMPO)) continue;
    const tipo = REFERENCIA_DO_CAMPO[m.campo as keyof typeof REFERENCIA_DO_CAMPO];
    for (const v of [m.antes, m.depois]) if (typeof v === 'string') saida.set(v, tipo);
  }
  return saida;
}
