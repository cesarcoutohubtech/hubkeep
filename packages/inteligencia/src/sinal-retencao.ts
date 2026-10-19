// A retenção do texto do sinal do hóspede (ADR-047, LGPD): a política
// `inteligencia.sinal_hospede` diz por quantos dias, contados da data da
// avaliação, o texto do hóspede fica guardado. Depois disso, o job do dia
// apaga o texto e mantém a classificação, a nota e as datas. Vale a do grupo:
// quem responde pelo dado é o grupo. O padrão espera a resposta do cliente
// (pergunta 4 ao Slaviero) e é detalhe do Kaio (ADR-033). Fica à parte do
// sinal-hospede.ts para as políticas não importarem o painel.
import { DIA_MS } from './score';

export interface ConfigSinalHospede {
  retencaoTextoDias: number;
}
export const MINIMO_DA_RETENCAO_DIAS = 30;
export const MAXIMO_DA_RETENCAO_DIAS = 1825;
export const PADRAO_SINAL_HOSPEDE: ConfigSinalHospede = { retencaoTextoDias: 365 };

export const configSinalHospedeValida = (v: unknown): v is ConfigSinalHospede => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const dias = (v as Record<string, unknown>)['retencaoTextoDias'];
  return (
    Object.keys(v).length === 1 &&
    Number.isInteger(dias) &&
    (dias as number) >= MINIMO_DA_RETENCAO_DIAS &&
    (dias as number) <= MAXIMO_DA_RETENCAO_DIAS
  );
};

/** O texto da avaliação feita antes deste instante já passou da retenção. */
export const limiteDaRetencao = (agora: Date, c: ConfigSinalHospede): Date =>
  new Date(agora.getTime() - c.retencaoTextoDias * DIA_MS);
