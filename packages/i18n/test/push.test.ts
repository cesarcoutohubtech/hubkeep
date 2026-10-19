// Push do PWA (1c, ADR-046, C4): título e corpo do catálogo em cada idioma,
// sem a descrição do chamado.
import { describe, expect, it } from 'vitest';
import { IDIOMAS, pushDeAvisoDeSla, pushDeOsAtribuida } from '../src/index';

describe('push do aviso de SLA e da OS atribuída', () => {
  it.each(IDIOMAS)('%s: título e corpo do catálogo, com o hotel', (idioma) => {
    const sla = pushDeAvisoDeSla(idioma, { tipo: 'solucao_vencida', hotel: 'Hotel Centro' });
    expect(sla.titulo).not.toBe('');
    expect(sla.corpo).toContain('Hotel Centro');
    const os = pushDeOsAtribuida(idioma, { hotel: 'Hotel Centro' });
    expect(os.titulo).not.toBe('');
    expect(os.corpo).toContain('Hotel Centro');
  });

  it('o tipo do alerta escolhe o título; o caractere de controle sai do hotel', () => {
    expect(pushDeAvisoDeSla('pt-BR', { tipo: 'atendimento_em_risco', hotel: 'H' }).titulo).toBe(
      'Atendimento perto de vencer',
    );
    expect(pushDeAvisoDeSla('en', { tipo: 'solucao_vencida', hotel: 'H' }).titulo).toBe(
      'Resolution overdue',
    );
    expect(pushDeOsAtribuida('pt-BR', { hotel: 'Hotel\u0007 Sul' }).corpo).toBe(
      'Hotel Sul. Abra a fila do dia para ver a OS.',
    );
  });
});
