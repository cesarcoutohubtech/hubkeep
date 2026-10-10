// Pedido do script de módulos contratados (modulo-contratado.ts), sem conexão:
// lê e confere os argumentos, para o teste cobrir sem banco
// (tests/modulo-contratado-ops.test.ts).
//
// A lista dos módulos e a vigência são as do domínio (licenca.ts, importado
// pelo caminho: o Node roda o script sem o bundler).
import {
  MODULOS_CONTRATAVEIS,
  type ModuloContratavel,
  ehModuloContratavel,
  vigenciaDeModuloValida,
} from '../../packages/dominio/src/licenca.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Data e hora com o fuso explícito: sem ele, o mesmo texto vira instantes
// diferentes conforme a máquina de quem roda.
const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export type PedidoDeModulo =
  | { acao: 'listar'; tenant: string }
  | {
      acao: 'gravar';
      tenant: string;
      modulo: ModuloContratavel;
      inicio: Date;
      fim: Date | null;
      por: string;
    };

const valorDe = (argv: readonly string[], nome: string): string | undefined => {
  const i = argv.indexOf(nome);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`Informe o valor de ${nome}.`);
  return v;
};

const instante = (nome: string, texto: string): Date => {
  const d = new Date(texto);
  if (!INSTANTE.test(texto) || Number.isNaN(d.getTime())) {
    throw new Error(
      `${nome} precisa de data, hora e fuso, como 2026-10-10T00:00:00-03:00 (recebido: ${texto}).`,
    );
  }
  return d;
};

/**
 * Sem --modulo, lista os módulos do tenant. Com --modulo, grava a vigência:
 * --inicio obrigatório; sem --fim, sem prazo; --por diz quem pediu (vai para
 * atualizado_por).
 */
export function lerPedidoDeModulo(argv: readonly string[]): PedidoDeModulo {
  const tenant = valorDe(argv, '--tenant');
  if (!tenant || !UUID.test(tenant)) throw new Error('Informe --tenant com o id (uuid) do grupo.');
  const modulo = valorDe(argv, '--modulo');
  if (modulo === undefined) {
    for (const nome of ['--inicio', '--fim', '--por']) {
      if (argv.includes(nome)) throw new Error(`${nome} só vale com --modulo.`);
    }
    return { acao: 'listar', tenant };
  }
  if (!ehModuloContratavel(modulo)) {
    throw new Error(
      `Módulo desconhecido: ${modulo}. Os módulos: ${MODULOS_CONTRATAVEIS.join(', ')}.`,
    );
  }
  const textoInicio = valorDe(argv, '--inicio');
  if (!textoInicio) throw new Error('Informe --inicio.');
  const textoFim = valorDe(argv, '--fim');
  const inicio = instante('--inicio', textoInicio);
  const fim = textoFim === undefined ? null : instante('--fim', textoFim);
  if (!vigenciaDeModuloValida({ inicio, fim }))
    throw new Error('--fim precisa ser depois de --inicio.');
  const por = valorDe(argv, '--por')?.trim() ?? '';
  if (por.length < 1 || por.length > 200) {
    throw new Error('Informe --por com quem pediu a mudança (até 200 caracteres).');
  }
  return { acao: 'gravar', tenant, modulo, inicio, fim, por };
}

/** UUID v7 (RFC 9562): IDs gerados pela aplicação, ordenados pelo tempo. */
export function uuidV7(
  agora = Date.now(),
  aleatorio = crypto.getRandomValues(new Uint8Array(10)),
): string {
  const b = new Uint8Array(16);
  let ms = agora;
  for (let i = 5; i >= 0; i--) {
    b[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  b.set(aleatorio, 6);
  b[6] = 0x70 | ((b[6] ?? 0) & 0x0f);
  b[8] = 0x80 | ((b[8] ?? 0) & 0x3f);
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
