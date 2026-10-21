// Cliente da API /api/v1 para o PWA: o access token do Supabase no cabeçalho
// Authorization e o tenant em x-hubkeep-tenant (docs/01). O PWA fala só com a
// API; o navegador nunca acessa tabelas.
import {
  PedidoDeOperacaoOffline,
  RespostaDeAtivosDoHotel,
  RespostaDeCategorias,
  RespostaDeCodigosDeManutencao,
  RespostaDeModelosDeAtivo,
  RespostaDeHoteis,
  RespostaDeLocaisDoHotel,
  RespostaDeOperacaoOffline,
  RespostaDeOsDoDia,
} from '@hubkeep/contratos';
import type { OperacaoNaFila } from './fila/banco';
import type { OsDoDiaGuardadas } from './os/banco';
import type { Referencia } from './referencia/banco';
import { type Envio, type ResultadoDoEnvio, vaiTentarDeNovo } from './fila/sincronizar';

export interface Credenciais {
  /** Usuário da sessão atual (sub do token); null sem sessão. */
  usuarioId: () => string | null;
  token: () => Promise<string | null>;
  tenant: () => string | null;
}

/**
 * Segundo fator (SP1, ADR-049): a API recusa com 403 segundo_fator_obrigatorio
 * a sessão em aal1 de quem tem papel que o exige e ainda não cadastrou o TOTP.
 * O PWA não cadastra fator: avisa a tela (evento no window), e a operação da
 * fila fica para depois, sem ser descartada.
 */
export const EVENTO_DO_SEGUNDO_FATOR = 'hubkeep:segundo-fator';

export function pedeSegundoFator(status: number, corpo: unknown): boolean {
  const codigo = (corpo as { erro?: { codigo?: unknown } } | null)?.erro?.codigo;
  if (status !== 403 || codigo !== 'segundo_fator_obrigatorio') return false;
  globalThis.dispatchEvent?.(new Event(EVENTO_DO_SEGUNDO_FATOR));
  return true;
}

/** Base da API: vazia no dev (o Vite repassa /api para o web) ou VITE_API_URL. */
export const baseDaApi = (): string => import.meta.env.VITE_API_URL ?? '';

export async function cabecalhos(c: Credenciais): Promise<Record<string, string> | null> {
  const token = await c.token();
  const tenant = c.tenant();
  if (!token || !tenant) return null;
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    'x-hubkeep-tenant': tenant,
  };
}

/**
 * Envio de uma operação da fila; qualquer falha de rede vira tentar_depois.
 * A foto da OS (anexo.foto) não é operação da API: vai pelo envioDeFoto
 * (anexos/fotos.ts); sem ele, fica pendente.
 */
export function criarEnvio(
  c: Credenciais,
  requisitar: typeof fetch = fetch,
  envioDeFoto?: Envio,
): Envio {
  return async (op: OperacaoNaFila): Promise<ResultadoDoEnvio> => {
    if (op.tipo === 'anexo.foto') {
      return envioDeFoto ? envioDeFoto(op) : { tipo: 'tentar_depois', motivo: 'sem_envio_de_foto' };
    }
    // Segunda barreira do ajuste (a): operação de outro usuário nunca sai com
    // o token desta sessão (a passada já filtra por usuário).
    if (op.usuarioId !== c.usuarioId()) return { tipo: 'tentar_depois', motivo: 'outra_sessao' };
    const h = await cabecalhos(c);
    if (!h) return { tipo: 'tentar_depois', motivo: 'sem_sessao' };
    // Fora do contrato não adianta reenviar: recusa aqui, sem travar a fila.
    const pedido = PedidoDeOperacaoOffline.safeParse({
      chave: op.chave,
      tipo: op.tipo,
      dados: op.dados,
    });
    if (!pedido.success) return { tipo: 'recusada', codigo: 'entrada_invalida' };
    const corpo = pedido.data;
    let r: Response;
    try {
      r = await requisitar(`${baseDaApi()}/api/v1/sincronizacao/operacoes`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify(corpo),
      });
    } catch {
      return { tipo: 'tentar_depois', motivo: 'sem_rede' };
    }
    if (r.status === 200 || r.status === 201) {
      RespostaDeOperacaoOffline.parse(await r.json());
      return { tipo: 'aceita' };
    }
    if (vaiTentarDeNovo(r.status)) return { tipo: 'tentar_depois', motivo: `http_${r.status}` };
    const erro = (await r.json().catch(() => null)) as { erro?: { codigo?: string } } | null;
    if (pedeSegundoFator(r.status, erro)) return { tipo: 'tentar_depois', motivo: 'segundo_fator' };
    return { tipo: 'recusada', codigo: erro?.erro?.codigo ?? `http_${r.status}` };
  };
}

export interface PreferenciasDoServidor {
  idioma: string;
  gravadas: { idioma: string | null; formatoRegional: string | null; fuso: string | null };
}

/** Preferências resolvidas do usuário; null sem rede ou sem sessão. */
export async function lerPreferencias(
  c: Credenciais,
  requisitar: typeof fetch = fetch,
): Promise<PreferenciasDoServidor | null> {
  const h = await cabecalhos(c);
  if (!h) return null;
  try {
    const r = await requisitar(`${baseDaApi()}/api/v1/preferencias`, { headers: h });
    if (r.status === 403) pedeSegundoFator(r.status, await r.json().catch(() => null));
    return r.ok ? ((await r.json()) as PreferenciasDoServidor) : null;
  } catch {
    return null;
  }
}

/** A fila do dia do técnico (C4b); null sem rede, sem sessão ou com resposta que não seja 200. */
export async function lerOsDoDia(
  c: Credenciais,
  requisitar: typeof fetch = fetch,
): Promise<OsDoDiaGuardadas | null> {
  const h = await cabecalhos(c);
  const usuarioId = c.usuarioId();
  const tenantId = c.tenant();
  if (!h || !usuarioId || !tenantId) return null;
  try {
    // preventiva=1: este PWA entende a OS preventiva, sem chamado (PV3c).
    const r = await requisitar(`${baseDaApi()}/api/v1/os/do-dia?preventiva=1`, { headers: h });
    if (!r.ok) return null;
    const { os } = RespostaDeOsDoDia.parse(await r.json());
    return { usuarioId, tenantId, os, lidaEm: Date.now() };
  } catch {
    return null;
  }
}

/**
 * Referência do técnico (B3b): hotéis visíveis, com locais e ativos de cada um,
 * e as categorias do tenant, validados pelos contratos. null sem rede, sem
 * sessão ou com qualquer resposta que não seja 200: fica valendo a guardada.
 * Os códigos de manutenção (I6) e os modelos de ativo (M1) são sugestão: se a
 * leitura deles falhar, a referência segue sem eles.
 */
export async function lerReferencia(
  c: Credenciais,
  requisitar: typeof fetch = fetch,
): Promise<Referencia | null> {
  const h = await cabecalhos(c);
  const usuarioId = c.usuarioId();
  const tenantId = c.tenant();
  if (!h || !usuarioId || !tenantId) return null;
  const ler = async (caminho: string): Promise<unknown> => {
    const r = await requisitar(`${baseDaApi()}${caminho}`, { headers: h });
    if (!r.ok) throw new Error(`http_${r.status}`);
    return r.json();
  };
  try {
    const [{ hoteis }, categorias, codigos] = await Promise.all([
      ler('/api/v1/hoteis').then((d) => RespostaDeHoteis.parse(d)),
      ler('/api/v1/categorias-de-ativo').then((d) => RespostaDeCategorias.parse(d)),
      ler('/api/v1/codigos-de-manutencao')
        .then((d) => RespostaDeCodigosDeManutencao.parse(d).codigos)
        .catch(() => undefined),
    ]);
    // Os modelos de ativo (M1) também são sugestão: sem eles, o cadastro segue à mão.
    const modelos = await ler('/api/v1/modelos-de-ativo')
      .then((d) =>
        RespostaDeModelosDeAtivo.parse(d).modelos.map(
          ({ id, categoriaId, nome, fabricante, modelo, campos, ativa, bandeiraId }) => ({
            id,
            categoriaId,
            nome,
            fabricante,
            modelo,
            campos,
            ativa,
            bandeiraId,
          }),
        ),
      )
      .catch(() => undefined);
    const locais: Referencia['locais'] = {};
    const ativos: Referencia['ativos'] = {};
    const nomesDeCriticidade: NonNullable<Referencia['nomesDeCriticidade']> = {};
    for (const hotel of hoteis) {
      const [l, a] = await Promise.all([
        ler(`/api/v1/hoteis/${hotel.id}/locais`).then((d) => RespostaDeLocaisDoHotel.parse(d)),
        ler(`/api/v1/hoteis/${hotel.id}/ativos`).then((d) => RespostaDeAtivosDoHotel.parse(d)),
      ]);
      locais[hotel.id] = l.locais.map(({ id, nome, status, tipo }) => ({ id, nome, status, tipo }));
      ativos[hotel.id] = a.ativos;
      nomesDeCriticidade[hotel.id] = a.nomesDeCriticidade;
    }
    return {
      usuarioId,
      tenantId,
      hoteis: hoteis.map(({ id, nome, bandeiraId }) => ({ id, nome, bandeiraId })),
      locais,
      ativos,
      nomesDeCriticidade,
      idiomaPadrao: categorias.idiomaPadrao,
      categorias: categorias.categorias,
      ...(codigos ? { codigos } : {}),
      ...(modelos ? { modelos } : {}),
      lidaEm: Date.now(),
    };
  } catch {
    return null;
  }
}
