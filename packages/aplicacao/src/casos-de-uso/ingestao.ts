// Casos de uso da F0-08: receber lote do agente, gerenciar a credencial dele e
// promover UHs do staging para app.local.
//
//   receberLote   credencial conferida pelo hash contra as NÃO revogadas do
//                 tenant do prefixo; lote idempotente pelo hash do conteúdo.
//   credenciais   só o Admin do grupo cria e revoga (domínio); o segredo sai
//                 uma vez, e o banco guarda o hash.
//   promoverUhs   worker, um tenant por vez: UH nova entra ativa só em hotel
//                 ativo com saldo de licença, senão pendente_licenca (domínio).
import {
  type Contexto,
  NaoEncontrado,
  RegraViolada,
  exigir,
  podeGerenciarCredencialDeAgente,
  saldoDeUhs,
  statusDaUhNova,
} from '@hubkeep/dominio';
import {
  CredencialInvalida,
  formatarCredencial,
  hashesIguais,
  lerCredencial,
} from '../credencial-agente';
import type {
  Criptografia,
  LoteRecebido,
  PortaCredenciaisDeAgente,
  PortaIngestao,
  PortaPromocaoDeUhs,
} from '../portas/ingestao';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

/** JSON com as chaves em ordem: o mesmo conteúdo dá sempre o mesmo texto. */
function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  if (valor !== null && typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    const chaves = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${chaves.map((k) => `${JSON.stringify(k)}:${canonico(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(valor);
}

/**
 * Hash do lote, calculado pelo servidor sobre o conteúdo (fonte, entidade e
 * registros em ordem de chave). O agente não escolhe o hash: lote igual tem
 * hash igual, e é isso que faz o reenvio não duplicar nada.
 */
export function hashDoLote(lote: LoteRecebido, cripto: Criptografia): Promise<string> {
  const registros = [...lote.registros].sort((a, b) =>
    a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0,
  );
  return cripto.sha256Hex(canonico({ fonte: lote.fonte, entidade: lote.entidade, registros }));
}

/**
 * Hash guardado no banco. SHA-256 basta: o segredo tem 256 bits aleatórios, não
 * é senha escolhida por pessoa, então não há dicionário a atacar.
 */
const hashDoSegredo = async (segredo: string, cripto: Criptografia) =>
  `sha256:${await cripto.sha256Hex(segredo)}`;

export interface ResultadoDaPromocao {
  criadas: number;
  ativas: number;
  pendentes: number;
  atualizadas: number;
  /** UH cujo hotel ainda não existe em app.hotel (o Admin ativa o hotel antes). */
  semHotel: number;
  /** Registro de UH sem os campos que a promoção precisa. */
  invalidas: number;
}

export interface DependenciasDeIngestao {
  ingestao: PortaIngestao;
  credenciais: PortaCredenciaisDeAgente;
  promocao: PortaPromocaoDeUhs;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  cripto: Criptografia;
}

export interface CasosDeUsoDeIngestao {
  receberLote(
    credencial: string,
    lote: LoteRecebido,
  ): Promise<{ tenantId: string; cargaId: string; loteHash: string; novo: boolean }>;
  criarCredencial(ctx: Contexto, descricao: string): Promise<{ id: string; credencial: string }>;
  revogarCredencial(ctx: Contexto, id: string): Promise<{ revogadaEm: Date }>;
  promoverUhs(tenantId: string): Promise<ResultadoDaPromocao>;
}

const texto = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null;

/**
 * Cada caso de uso exige só as portas dele: a rota de ingestão compõe só com
 * `ingestao` e `cripto` (não abre os pools do app nem do worker), a de
 * credenciais com `credenciais`, `atribuicoes`, `relogio` e `cripto`, e o job
 * de promoção só com `promocao`.
 */
export function criarCasosDeUsoDeIngestao(
  deps: Partial<DependenciasDeIngestao>,
): CasosDeUsoDeIngestao {
  const precisa = <K extends keyof DependenciasDeIngestao>(nome: K): DependenciasDeIngestao[K] => {
    const dep = deps[nome];
    if (!dep) throw new Error(`Caso de uso de ingestão composto sem a porta ${nome}.`);
    return dep as DependenciasDeIngestao[K];
  };
  const exigirAdmin = async (ctx: Contexto) => {
    const minhas = await precisa('atribuicoes').doUsuario(ctx);
    exigir(podeGerenciarCredencialDeAgente(minhas, precisa('relogio').agora()));
  };

  return {
    async receberLote(credencial, lote) {
      const lida = lerCredencial(credencial);
      if (!lida) throw new CredencialInvalida();

      const vistas = new Set<string>();
      for (const r of lote.registros) {
        if (vistas.has(r.chave)) {
          throw new RegraViolada('lote_com_chave_repetida', 'Chave repetida no lote.', {
            chave: r.chave,
          });
        }
        vistas.add(r.chave);
      }

      const cripto = precisa('cripto');
      const [hash, loteHash] = await Promise.all([
        hashDoSegredo(lida.segredo, cripto),
        hashDoLote(lote, cripto),
      ]);
      return precisa('ingestao').emSessao(lida.tenantId, async (s) => {
        const ativas = await s.credenciaisAtivas();
        // Confere todas, sem parar na primeira: o tempo não diz qual bateu.
        let confere = false;
        for (const c of ativas) confere = hashesIguais(c.hash, hash) || confere;
        if (!confere) throw new CredencialInvalida();
        const registros = await Promise.all(
          lote.registros.map(async (r) => ({
            ...r,
            hash: await cripto.sha256Hex(canonico(r.dados)),
          })),
        );
        const r = await s.registrarLote({ ...lote, registros }, loteHash);
        return { tenantId: lida.tenantId, cargaId: r.cargaId, loteHash, novo: r.novo };
      });
    },

    async criarCredencial(ctx, descricao) {
      await exigirAdmin(ctx);
      const cripto = precisa('cripto');
      const segredo = cripto.segredoAleatorio();
      const { id } = await precisa('credenciais').criar(ctx, {
        descricao,
        hash: await hashDoSegredo(segredo, cripto),
      });
      return { id, credencial: formatarCredencial(ctx.tenantId, segredo) };
    },

    async revogarCredencial(ctx, id) {
      await exigirAdmin(ctx);
      const r = await precisa('credenciais').revogar(ctx, id);
      if (!r) {
        throw new NaoEncontrado(
          'credencial_nao_encontrada',
          'Credencial não encontrada ou já revogada.',
        );
      }
      return r;
    },

    promoverUhs(tenantId) {
      return precisa('promocao').emSessao(tenantId, async (s) => {
        const resultado: ResultadoDaPromocao = {
          criadas: 0,
          ativas: 0,
          pendentes: 0,
          atualizadas: 0,
          semHotel: 0,
          invalidas: 0,
        };
        const uhs = await s.uhsDoStaging();
        const hoteis = await s.hoteisPorCodigo();
        const locais = await s.locaisPorCodigo();
        let saldo = saldoDeUhs(await s.usoDeLicenca());

        for (const uh of uhs) {
          const dados = (uh.dados ?? {}) as Record<string, unknown>;
          const codHotel = texto(dados['hotel'], 200);
          const nome = texto(dados['nome'], 200);
          const andar = dados['andar'] == null ? null : texto(dados['andar'], 50);
          if (!codHotel || !nome || (dados['andar'] != null && andar === null)) {
            resultado.invalidas++;
            continue;
          }
          const hotel = hoteis.get(`${uh.fonte}|${codHotel}`);
          if (!hotel) {
            resultado.semHotel++;
            continue;
          }
          const existente = locais.get(`${hotel.id}|${uh.chave}`);
          if (existente) {
            if (existente.nome !== nome || existente.andar !== andar) {
              await s.atualizarUh(existente.id, { nome, andar });
              resultado.atualizadas++;
            }
            continue;
          }
          const status = statusDaUhNova(hotel.status, saldo);
          if (status === 'ativo') saldo--;
          await s.criarUh({ hotelId: hotel.id, chave: uh.chave, nome, andar, status });
          resultado.criadas++;
          if (status === 'ativo') resultado.ativas++;
          else resultado.pendentes++;
        }
        return resultado;
      });
    },
  };
}
