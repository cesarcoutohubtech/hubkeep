// Avisos de SLA em aberto (fase 1c; ADR-043, M4): até a comunicação (item 5
// da 1c), os avisos do monitor aparecem no painel do hotel (em risco e
// vencidos) e num selo na ficha do chamado. Quem vê é a gestão do hotel
// (domínio, os mesmos papéis da RLS de app.sla_alerta). Na ficha, quem não é
// da gestão não recebe erro: o selo só não aparece. Os próximos prazos são a
// contagem regressiva da tela inicial (1c, seção 4 da paridade): os prazos a
// vencer mais perto, nos hotéis de que quem pede é da gestão.
import {
  type AvisoDeSla,
  type Contexto,
  type EstadoDoChamado,
  LIMITE_DOS_PROXIMOS_PRAZOS,
  NaoEncontrado,
  type PrioridadeParaSla,
  type ProximoPrazo,
  avisosEmAberto,
  exigir,
  pausaDoChamadoParaORelogio,
  podeVerAvisosDeSla,
  podeVerOsProximosPrazos,
  proximoPrazo,
  slaDoChamado,
} from '@hubkeep/dominio';
import type { ChamadoComAvisos, PortaAvisosDeSla } from '../portas/avisos-de-sla';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { PortaPrioridades } from '../portas/situacoes';

export interface ChamadoNoPainelDeSla {
  chamadoId: string;
  descricao: string;
  estado: EstadoDoChamado;
  prioridadeId: string | null;
  avisos: AvisoDeSla[];
}

export interface PrazoAVencer extends ProximoPrazo {
  chamadoId: string;
  hotelId: string;
  hotelNome: string;
  descricao: string;
  prioridadeId: string | null;
}

export interface CasosDeUsoDeAvisosDeSla {
  /** Os próximos prazos a vencer, do mais perto ao mais longe; 403 para quem não é da gestão. */
  proximosPrazos(ctx: Contexto): Promise<{ prazos: PrazoAVencer[] }>;
  /** Os chamados do hotel com aviso em aberto: os vencidos primeiro, depois pelo prazo. */
  doHotel(ctx: Contexto, hotelId: string): Promise<{ chamados: ChamadoNoPainelDeSla[] }>;
  /** Os avisos em aberto do chamado; vazio para quem não é da gestão do hotel. */
  doChamado(ctx: Contexto, chamadoId: string): Promise<{ avisos: AvisoDeSla[] }>;
}

const primeiroPrazo = (avisos: readonly AvisoDeSla[]) =>
  Math.min(...avisos.map((a) => a.prazo.getTime()));
const temVencido = (avisos: readonly AvisoDeSla[]) => avisos.some((a) => a.nivel === 'vencido');

export function criarCasosDeUsoDeAvisosDeSla(deps: {
  avisos: PortaAvisosDeSla;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  /** Lidas só quando há OS em pausa, para saber se a pausa parou o relógio. */
  prioridades: Pick<PortaPrioridades, 'listar'>;
  relogio: Relogio;
}): CasosDeUsoDeAvisosDeSla {
  /** Como o monitor: a pausa para o relógio pela cópia do SLA e pelo motivo. */
  const relogioParado = (c: ChamadoComAvisos, prioridades: readonly PrioridadeParaSla[]) => {
    if (c.pausaEmCurso === null || c.prioridadeId === null) return false;
    const sla = slaDoChamado({
      politicaAplicada: c.politicaAplicada,
      prioridadeId: c.prioridadeId,
      prioridades,
      categoriaId: c.categoriaId,
    });
    return pausaDoChamadoParaORelogio(sla, c.prazoSolucao, c.pausaEmCurso.motivo);
  };
  const prioridadesSeHaPausa = async (ctx: Contexto, lista: readonly ChamadoComAvisos[]) =>
    lista.some((c) => c.pausaEmCurso !== null) ? await deps.prioridades.listar(ctx) : [];
  const emAberto = async (ctx: Contexto, lista: readonly ChamadoComAvisos[], agora: Date) => {
    const prioridades = await prioridadesSeHaPausa(ctx, lista);
    return lista.map((c) =>
      avisosEmAberto({
        chamado: { ...c, relogioParado: relogioParado(c, prioridades) },
        gravados: c.gravados,
        agora,
      }),
    );
  };

  return {
    async proximosPrazos(ctx) {
      const agora = deps.relogio.agora();
      const minhas = await deps.atribuicoes.doUsuario(ctx);
      exigir(podeVerOsProximosPrazos(minhas, agora));
      // A RLS de app.chamado mostra também os hotéis de outros papéis (o técnico, o
      // proprietário): ficam só os de que quem pede é da gestão.
      const lista = (await deps.avisos.chamadosComPrazoAVencer(ctx, agora)).filter(
        (c) =>
          podeVerAvisosDeSla(minhas, { id: c.hotelId, bandeiraId: c.bandeiraId }, agora).permitido,
      );
      const prioridades = await prioridadesSeHaPausa(ctx, lista);
      const prazos = lista
        .flatMap((c): PrazoAVencer[] => {
          const p = proximoPrazo({
            chamado: { ...c, relogioParado: relogioParado(c, prioridades) },
            gravados: c.gravados,
            agora,
          });
          return p
            ? [
                {
                  ...p,
                  chamadoId: c.id,
                  hotelId: c.hotelId,
                  hotelNome: c.hotelNome,
                  descricao: c.descricao,
                  prioridadeId: c.prioridadeId,
                },
              ]
            : [];
        })
        .sort(
          (a, b) => a.prazo.getTime() - b.prazo.getTime() || a.chamadoId.localeCompare(b.chamadoId),
        )
        .slice(0, LIMITE_DOS_PROXIMOS_PRAZOS);
      return { prazos };
    },

    async doHotel(ctx, hotelId) {
      const hotel = await deps.avisos.hotel(ctx, hotelId);
      if (!hotel) throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
      const agora = deps.relogio.agora();
      exigir(podeVerAvisosDeSla(await deps.atribuicoes.doUsuario(ctx), hotel, agora));
      const lista = await deps.avisos.chamadosDoHotel(ctx, hotelId);
      const avisos = await emAberto(ctx, lista, agora);
      const chamados = lista
        .map((c, i) => ({
          chamadoId: c.id,
          descricao: c.descricao,
          estado: c.estado,
          prioridadeId: c.prioridadeId,
          avisos: avisos[i] ?? [],
        }))
        .filter((c) => c.avisos.length > 0)
        .sort(
          (a, b) =>
            Number(temVencido(b.avisos)) - Number(temVencido(a.avisos)) ||
            primeiroPrazo(a.avisos) - primeiroPrazo(b.avisos) ||
            a.chamadoId.localeCompare(b.chamadoId),
        );
      return { chamados };
    },

    async doChamado(ctx, chamadoId) {
      const c = await deps.avisos.chamado(ctx, chamadoId);
      if (!c) throw new NaoEncontrado('chamado_nao_encontrado', 'Chamado não encontrado.');
      const agora = deps.relogio.agora();
      const pode = podeVerAvisosDeSla(
        await deps.atribuicoes.doUsuario(ctx),
        { id: c.hotelId, bandeiraId: c.bandeiraId },
        agora,
      );
      if (!pode.permitido) return { avisos: [] };
      return { avisos: (await emAberto(ctx, [c], agora))[0] ?? [] };
    },
  };
}
