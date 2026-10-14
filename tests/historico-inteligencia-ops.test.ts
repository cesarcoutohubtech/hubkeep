// O --fim do histórico de demonstração do Intelligence (scripts/ops/
// historico-demonstracao.ts), sem conexão: conferido antes de o script conectar.
import { describe, expect, it } from 'vitest';
import { lerFimDoHistorico } from '../scripts/ops/historico-inteligencia.ts';

const AGORA = new Date('2026-10-13T12:00:00Z');

describe('lerFimDoHistorico', () => {
  it('sem --fim, null: a gravação escolhe o padrão', () => {
    expect(lerFimDoHistorico(['--ambiente', 'dev'], AGORA)).toBeNull();
  });

  it('um dia que já terminou', () => {
    expect(lerFimDoHistorico(['--fim', '2026-10-12'], AGORA)).toBe('2026-10-12');
  });

  it.each([
    ['sem valor', ['--fim']],
    ['dia inexistente', ['--fim', '2026-02-30']],
    ['dia com hora', ['--fim', '2026-10-01T00:00Z']],
    ['hoje', ['--fim', '2026-10-13']],
    ['amanhã', ['--fim', '2026-10-14']],
  ])('recusa: %s', (_nome, argv) => {
    expect(() => lerFimDoHistorico(argv, AGORA)).toThrow();
  });
});
