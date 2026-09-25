// Manipuladores dos eventos de domínio que o worker consome do outbox
// (ADR-007). Idempotentes: um evento pode ser entregue mais de uma vez se o
// worker cair entre o efeito e a marcação de processado.
import type { EnvioDeConvite, ProvedorDeIdentidade } from '../portas/identidade';

export interface EventoPendente {
  id: string;
  tenantId: string;
  tipo: string;
  payload: Record<string, unknown>;
}

export type Manipulador = (evento: EventoPendente) => Promise<void>;

const texto = (p: Record<string, unknown>, campo: string): string => {
  const v = p[campo];
  if (typeof v !== 'string' || !v) throw new Error(`Evento sem ${campo}.`);
  return v;
};

export function criarManipuladoresDeEventos(deps: {
  identidade: ProvedorDeIdentidade;
  envio: EnvioDeConvite;
}): Record<string, Manipulador> {
  return {
    // Etapa (e) do convite (ADR-018): o acesso já está gravado; agora o tenant
    // entra na lista de sugestão do usuário e o e-mail sai.
    'membro.convidado': async (evento) => {
      const p = evento.payload;
      await deps.identidade.vincularTenant(texto(p, 'usuarioId'), evento.tenantId);
      await deps.envio.enviarConvite({
        email: texto(p, 'email'),
        nomeConvidado: texto(p, 'nome'),
        nomeTenant: texto(p, 'nomeTenant'),
        redirecionarPara: texto(p, 'redirecionarPara'),
      });
    },
  };
}
