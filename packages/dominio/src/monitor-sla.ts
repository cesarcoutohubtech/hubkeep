// Monitor de SLA (fase 1c; ADR-043, decisões M1 a M4 do Cesar de 13/10/2026).
// Regras puras, sem IO:
//   - os quatro avisos por chamado (atendimento e solução, em risco e
//     vencidos), com a lista canônica dos tipos (o check de app.sla_alerta
//     repete os valores; tests/valores-canonicos-banco);
//   - a política chamado.escalonamento: o percentual do aviso "em risco" e
//     quem recebe cada nível;
//   - quais avisos o chamado deve agora: o tempo de relógio que falta, no
//     calendário do hotel, contra o complemento do percentual das horas da
//     regra. O aviso sai uma vez por prazo; o prazo refeito tem os dele.
//   - os avisos em aberto, para o painel e o selo da ficha (M4): os gravados
//     para o prazo de agora, enquanto o chamado ainda deve o atendimento ou a
//     solução, e o vencido pelo próprio prazo, sem esperar o cron;
//   - quem vê os avisos: a gestão do hotel, os mesmos papéis da policy de
//     app.sla_alerta (migração 0044).
import type { EstadoDoChamado } from './corretiva';
import { escopoCobreHotel } from './equipes';
import { PermissaoNegada } from './erros';
import { type Resultado, vigente } from './permissoes';
import { type CalendarioDeSla, type RegraDeSla, tempoDeRelogioEntre } from './sla';
import type { Atribuicao, Papel } from './tipos';

const HORA_MS = 3_600_000;
const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const TIPOS_DE_ALERTA_DE_SLA = [
  'atendimento_em_risco',
  'atendimento_vencido',
  'solucao_em_risco',
  'solucao_vencida',
] as const;
export type TipoDeAlertaDeSla = (typeof TIPOS_DE_ALERTA_DE_SLA)[number];
export const ehTipoDeAlertaDeSla = (v: unknown): v is TipoDeAlertaDeSla =>
  typeof v === 'string' && (TIPOS_DE_ALERTA_DE_SLA as readonly string[]).includes(v);

export const NIVEIS_DO_AVISO = ['em_risco', 'vencido'] as const;
export type NivelDoAviso = (typeof NIVEIS_DO_AVISO)[number];

/** Quem recebe o aviso (M3); a comunicação (item 5 da 1c) resolve as pessoas. */
export const DESTINATARIOS_DO_AVISO = [
  'responsavel_da_os',
  'gerente_hotel',
  'gestor_csc',
  'admin_grupo',
] as const;
export type DestinatarioDoAviso = (typeof DESTINATARIOS_DO_AVISO)[number];

export interface EscalonamentoDeSla {
  /** O aviso "em risco" sai quando falta o complemento disto, em % das horas da regra. */
  percentualDoAviso: number;
  emRisco: DestinatarioDoAviso[];
  vencido: DestinatarioDoAviso[];
}

export const LIMITES_DO_ESCALONAMENTO = { minimo: 50, maximo: 95 } as const;

/** Padrão de M3: 80%; em risco ao responsável da OS e ao Gerente; vencido também ao Gestor CSC. */
export const ESCALONAMENTO_PADRAO: EscalonamentoDeSla = {
  percentualDoAviso: 80,
  emRisco: ['responsavel_da_os', 'gerente_hotel'],
  vencido: ['responsavel_da_os', 'gerente_hotel', 'gestor_csc'],
};

const destinatariosValidos = (v: unknown): v is DestinatarioDoAviso[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  new Set(v).size === v.length &&
  v.every((d) => (DESTINATARIOS_DO_AVISO as readonly unknown[]).includes(d));

export function escalonamentoValido(v: unknown): v is EscalonamentoDeSla {
  if (!objeto(v) || Object.keys(v).length !== 3) return false;
  const p = v['percentualDoAviso'];
  return (
    typeof p === 'number' &&
    Number.isInteger(p) &&
    p >= LIMITES_DO_ESCALONAMENTO.minimo &&
    p <= LIMITES_DO_ESCALONAMENTO.maximo &&
    destinatariosValidos(v['emRisco']) &&
    destinatariosValidos(v['vencido'])
  );
}

export const destinatariosDoAviso = (
  e: EscalonamentoDeSla,
  nivel: NivelDoAviso,
): readonly DestinatarioDoAviso[] => (nivel === 'em_risco' ? e.emRisco : e.vencido);

/** O que o monitor lê do chamado em curso. */
export interface ChamadoNoMonitor {
  estado: EstadoDoChamado;
  /** Já teve OS, de qualquer estado: o atendimento foi cumprido ou perdido. */
  jaTeveOs: boolean;
  prazoAtendimento: Date | null;
  prazoSolucao: Date | null;
  /** A OS em curso está na pausa que parou o relógio (ADR-042): a solução não avisa. */
  relogioParado: boolean;
}

export interface AvisoDeSla {
  tipo: TipoDeAlertaDeSla;
  nivel: NivelDoAviso;
  prazo: Date;
}

const SEM_OS: readonly EstadoDoChamado[] = ['aberto', 'em_triagem'];
const SEM_SERVICO_CONCLUIDO: readonly EstadoDoChamado[] = ['aberto', 'em_triagem', 'em_execucao'];

/**
 * Os avisos que o chamado deve agora (M1): o vencido depois do prazo;
 * senão, o em risco quando o tempo de relógio que falta chega ao complemento
 * do percentual das horas da regra. O atendimento vale até a primeira OS; a
 * solução, até o serviço concluído, e não avisa com o relógio parado.
 */
export function avisosDeSla(p: {
  chamado: ChamadoNoMonitor;
  regra: Pick<RegraDeSla, 'atendimentoHoras' | 'solucaoHoras' | 'relogio'>;
  calendario: CalendarioDeSla;
  agora: Date;
  percentualDoAviso: number;
}): AvisoDeSla[] {
  const { chamado, regra, calendario, agora } = p;
  const folga = (100 - p.percentualDoAviso) / 100;
  const avisos: AvisoDeSla[] = [];
  const avaliar = (
    prazo: Date | null,
    horas: number,
    tipos: { emRisco: TipoDeAlertaDeSla; vencido: TipoDeAlertaDeSla },
  ) => {
    if (prazo === null) return;
    // Vencido só depois do prazo: a conclusão no instante do prazo ainda é
    // "dentro do prazo" (glossário de métricas).
    if (agora.getTime() > prazo.getTime()) {
      avisos.push({ tipo: tipos.vencido, nivel: 'vencido', prazo });
      return;
    }
    const falta = tempoDeRelogioEntre(agora, prazo, regra.relogio, calendario);
    if (falta <= folga * horas * HORA_MS) {
      avisos.push({ tipo: tipos.emRisco, nivel: 'em_risco', prazo });
    }
  };
  if (SEM_OS.includes(chamado.estado) && !chamado.jaTeveOs) {
    avaliar(chamado.prazoAtendimento, regra.atendimentoHoras, {
      emRisco: 'atendimento_em_risco',
      vencido: 'atendimento_vencido',
    });
  }
  if (SEM_SERVICO_CONCLUIDO.includes(chamado.estado) && !chamado.relogioParado) {
    avaliar(chamado.prazoSolucao, regra.solucaoHoras, {
      emRisco: 'solucao_em_risco',
      vencido: 'solucao_vencida',
    });
  }
  return avisos;
}

/** Um aviso já gravado em app.sla_alerta: o tipo e o prazo para o qual saiu. */
export interface AvisoGravado {
  tipo: TipoDeAlertaDeSla;
  prazo: Date;
}

const NIVEL_DO_TIPO: Record<TipoDeAlertaDeSla, NivelDoAviso> = {
  atendimento_em_risco: 'em_risco',
  atendimento_vencido: 'vencido',
  solucao_em_risco: 'em_risco',
  solucao_vencida: 'vencido',
};

/**
 * Os avisos em aberto do chamado (M4), no máximo um por prazo, o mais forte:
 * o prazo que já passou é vencido mesmo antes do cron gravar; senão, vale o
 * aviso gravado para o prazo de agora (o prazo refeito descarta os antigos).
 * O atendimento conta até a primeira OS; a solução, até o serviço concluído.
 * Com o relógio parado pela pausa (ADR-042), o prazo da solução está
 * congelado até a retomada: vale só o aviso já gravado, como no monitor.
 */
export function avisosEmAberto(p: {
  chamado: ChamadoNoMonitor;
  gravados: readonly AvisoGravado[];
  agora: Date;
}): AvisoDeSla[] {
  const { chamado, gravados, agora } = p;
  const avisos: AvisoDeSla[] = [];
  const avaliar = (
    prazo: Date | null,
    tipos: { emRisco: TipoDeAlertaDeSla; vencido: TipoDeAlertaDeSla },
    relogioParado = false,
  ) => {
    if (prazo === null) return;
    const doPrazo = gravados.filter((g) => g.prazo.getTime() === prazo.getTime());
    const passou = !relogioParado && agora.getTime() > prazo.getTime();
    if (passou || doPrazo.some((g) => g.tipo === tipos.vencido)) {
      avisos.push({ tipo: tipos.vencido, nivel: NIVEL_DO_TIPO[tipos.vencido], prazo });
    } else if (doPrazo.some((g) => g.tipo === tipos.emRisco)) {
      avisos.push({ tipo: tipos.emRisco, nivel: NIVEL_DO_TIPO[tipos.emRisco], prazo });
    }
  };
  if (SEM_OS.includes(chamado.estado) && !chamado.jaTeveOs) {
    avaliar(chamado.prazoAtendimento, {
      emRisco: 'atendimento_em_risco',
      vencido: 'atendimento_vencido',
    });
  }
  if (SEM_SERVICO_CONCLUIDO.includes(chamado.estado)) {
    avaliar(
      chamado.prazoSolucao,
      { emRisco: 'solucao_em_risco', vencido: 'solucao_vencida' },
      chamado.relogioParado,
    );
  }
  return avisos;
}

/** Quem vê os avisos (M4): a gestão do hotel, como a policy de app.sla_alerta. */
export const PAPEIS_QUE_VEEM_OS_AVISOS: readonly Papel[] = [
  'admin_grupo',
  'gestor_csc',
  'gerente_hotel',
];

export function podeVerAvisosDeSla(
  minhas: readonly Atribuicao[],
  hotel: { id: string; bandeiraId: string | null },
  agora: Date,
): Resultado {
  const pode = minhas.some(
    (a) =>
      vigente(a, agora) &&
      PAPEIS_QUE_VEEM_OS_AVISOS.includes(a.papel) &&
      escopoCobreHotel(a, hotel),
  );
  return pode
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'avisos_sla_fora_do_escopo',
          'Você não vê os avisos de SLA deste hotel.',
          { hotelId: hotel.id },
        ),
      };
}
