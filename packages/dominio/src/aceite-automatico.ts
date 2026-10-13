// Aceite automático da OS concluída (fase 1c, M5; ADR-044). O worker, no cron
// do SLA, aceita a OS corretiva concluída há N vezes 24 horas corridas, com N
// da política os.aceite_automatico do hotel. A contagem parte da última
// conclusão (a reabertura recomeça na nova) e não usa o calendário de SLA.
// A OS segue aguardando aceite, sem erro, quando a política está desligada,
// quando quem abriu o chamado executa a OS (pergunta 16 ao cliente), quando os
// códigos são obrigatórios e faltam, e quando o aceite exige assinatura, que
// o job não tem como dar. O chamado anda como no aceite manual.
import type { CodigosDaOs } from './codigos-manutencao';
import {
  TRANSICOES_DA_OS,
  quemAbriuExecuta,
  type EstadoDaOs,
  type EstadoDoChamado,
  type Responsavel,
} from './corretiva';
import type { AceiteAutomatico } from './politicas';

const HORA = 60 * 60 * 1000;

/** No máximo tantas OS aceitas por tenant em cada rodada do cron; o resto fica para a seguinte. */
export const LIMITE_DO_ACEITE_AUTOMATICO_POR_RODADA = 200;

export interface OsNoAceiteAutomatico {
  estado: EstadoDaOs;
  /** A última transição para concluída; null se a OS nunca foi concluída. */
  concluidaEm: Date | null;
  estadoDoChamado: EstadoDoChamado;
  abertoPor: string;
  /** As equipes ativas de que quem abriu o chamado é membro ativo. */
  equipesDeQuemAbriu: readonly string[];
  responsavel: Responsavel;
  codigos: CodigosDaOs;
}

export const MOTIVOS_SEM_ACEITE_AUTOMATICO = [
  'desligado',
  'fora_do_estado',
  'antes_do_prazo',
  'quem_abriu_executa',
  'faltam_codigos',
  'assinatura_no_aceite',
] as const;
export type MotivoSemAceiteAutomatico = (typeof MOTIVOS_SEM_ACEITE_AUTOMATICO)[number];

export type DecisaoDoAceiteAutomatico =
  | { aceitar: true; estado: EstadoDaOs; chamado: EstadoDoChamado }
  | { aceitar: false; motivo: MotivoSemAceiteAutomatico };

/** O instante a partir do qual a OS concluída em `concluidaEm` é aceita: N vezes 24 horas depois. */
export function aceiteAutomaticoEm(concluidaEm: Date, dias: number): Date {
  return new Date(concluidaEm.getTime() + dias * 24 * HORA);
}

export function decidirAceiteAutomatico(p: {
  os: OsNoAceiteAutomatico;
  politica: AceiteAutomatico;
  codigosObrigatorios: boolean;
  assinaturaNoAceite: boolean;
  agora: Date;
}): DecisaoDoAceiteAutomatico {
  const t = TRANSICOES_DA_OS.aceitar_automatico;
  const reflexo = t.chamado;
  const { os } = p;
  if (!p.politica.ligado) return { aceitar: false, motivo: 'desligado' };
  if (
    !reflexo ||
    t.para === 'nova' ||
    !t.de.includes(os.estado) ||
    !reflexo.de.includes(os.estadoDoChamado) ||
    os.concluidaEm === null
  ) {
    return { aceitar: false, motivo: 'fora_do_estado' };
  }
  if (p.agora.getTime() < aceiteAutomaticoEm(os.concluidaEm, p.politica.dias).getTime()) {
    return { aceitar: false, motivo: 'antes_do_prazo' };
  }
  if (quemAbriuExecuta(os.abertoPor, os.equipesDeQuemAbriu, os.responsavel)) {
    return { aceitar: false, motivo: 'quem_abriu_executa' };
  }
  if (
    p.codigosObrigatorios &&
    (os.codigos.falhaId === null || os.codigos.causaId === null || os.codigos.solucaoId === null)
  ) {
    return { aceitar: false, motivo: 'faltam_codigos' };
  }
  if (p.assinaturaNoAceite) return { aceitar: false, motivo: 'assinatura_no_aceite' };
  return { aceitar: true, estado: t.para, chamado: reflexo.para };
}
