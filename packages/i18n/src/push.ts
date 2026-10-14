// Push do PWA do técnico (1c, ADR-046, C4), no idioma de quem recebe (C6).
// Leva só o título e uma linha com o hotel: a descrição do chamado, que pode
// ter dado pessoal, não passa pelo serviço de push. O resto o técnico vê no
// PWA, depois do login.
import type { IdiomaDeExibicao } from './idiomas';
import { criarTradutor } from './tradutor';

export interface Push {
  titulo: string;
  corpo: string;
}

const semControle = (v: string) =>
  [...v].filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127).join('');

/** O aviso de SLA (ADR-043): o tipo do alerta e o hotel. */
export function pushDeAvisoDeSla(
  idioma: IdiomaDeExibicao,
  dados: { tipo: string; hotel: string },
): Push {
  const { t } = criarTradutor(idioma);
  return {
    titulo: t('push.sla.titulo', { tipo: dados.tipo }),
    corpo: t('push.sla.corpo', { hotel: semControle(dados.hotel) }),
  };
}

/** A OS atribuída ao técnico ou à equipe dele. */
export function pushDeOsAtribuida(idioma: IdiomaDeExibicao, dados: { hotel: string }): Push {
  const { t } = criarTradutor(idioma);
  return {
    titulo: t('push.os_atribuida.titulo'),
    corpo: t('push.os_atribuida.corpo', { hotel: semControle(dados.hotel) }),
  };
}
