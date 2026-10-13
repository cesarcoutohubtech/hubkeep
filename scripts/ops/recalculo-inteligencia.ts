// Pedido do recálculo do Intelligence (recalcular-inteligencia.ts), sem
// conexão: lê e confere os argumentos, para o teste cobrir sem banco
// (tests/recalculo-inteligencia-ops.test.ts).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const UM_DIA = 86_400_000;

/** O período mais longo de um pedido: um ano, cerca de meia hora no piloto (docs/referencia/carga-job-inteligencia.md). */
export const MAXIMO_DE_DIAS_DO_RECALCULO = 366;

export interface PedidoDeRecalculo {
  tenant: string;
  /** Os dias `AAAA-MM-DD`, em ordem, do --de ao --ate. */
  dias: string[];
  /** Quem pediu: vai para o registro da execução, na auditoria, como `ops:<por>`. */
  por: string;
}

const valorDe = (argv: readonly string[], nome: string): string | undefined => {
  const i = argv.indexOf(nome);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`Informe o valor de ${nome}.`);
  return v;
};

const dia = (nome: string, texto: string | undefined): number => {
  if (!texto) throw new Error(`Informe ${nome} (AAAA-MM-DD).`);
  const t = Date.parse(`${texto}T00:00:00Z`);
  if (!DIA.test(texto) || Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== texto) {
    throw new Error(`${nome} precisa ser um dia AAAA-MM-DD (recebido: ${texto}).`);
  }
  return t;
};

/**
 * --tenant, --de e --ate (inclusive, dias em UTC, como o motor corta o dia) e
 * --por. Só dias que já terminaram: o --ate é antes de hoje (UTC).
 */
export function lerPedidoDeRecalculo(
  argv: readonly string[],
  agora: Date = new Date(),
): PedidoDeRecalculo {
  const tenant = valorDe(argv, '--tenant');
  if (!tenant || !UUID.test(tenant)) throw new Error('Informe --tenant com o id (uuid) do grupo.');
  const de = dia('--de', valorDe(argv, '--de'));
  const ate = dia('--ate', valorDe(argv, '--ate'));
  if (ate < de) throw new Error('--ate precisa ser o mesmo dia do --de ou depois.');
  const hoje = Date.parse(`${agora.toISOString().slice(0, 10)}T00:00:00Z`);
  if (ate >= hoje)
    throw new Error('Só se recalcula dia que já terminou: --ate antes de hoje (UTC).');
  const total = (ate - de) / UM_DIA + 1;
  if (total > MAXIMO_DE_DIAS_DO_RECALCULO) {
    throw new Error(`No máximo ${MAXIMO_DE_DIAS_DO_RECALCULO} dias por pedido (pedido: ${total}).`);
  }
  const por = valorDe(argv, '--por')?.trim() ?? '';
  if (por.length < 1 || por.length > 200) {
    throw new Error('Informe --por com quem pediu o recálculo (até 200 caracteres).');
  }
  const dias = Array.from({ length: total }, (_, i) =>
    new Date(de + i * UM_DIA).toISOString().slice(0, 10),
  );
  return { tenant, dias, por };
}
