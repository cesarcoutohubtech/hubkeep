// Preferências de idioma e região (F0-10b) com a porta em memória: resolução
// membro → tenant → navegador → pt-BR, e validação antes de gravar. O fuso
// inválido é recusado aqui, não no banco (ADR-005).
import { type Contexto, RegraViolada } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type PadroesDoTenant,
  type PreferenciasGravadas,
  criarCasosDeUsoDePreferencias,
} from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const TENANT_BR: PadroesDoTenant = { idiomaPadrao: 'pt-BR', moeda: 'BRL', pais: 'BR' };

function montar(membro: PreferenciasGravadas | null, tenant: PadroesDoTenant | null = TENANT_BR) {
  const gravadas: PreferenciasGravadas[] = [];
  const casos = criarCasosDeUsoDePreferencias({
    preferencias: {
      ler: async () => ({ membro, tenant }),
      gravar: async (_c, p) => void gravadas.push(p),
    },
  });
  return { casos, gravadas };
}

describe('ler preferências', () => {
  it('sem escolha do membro: idioma do tenant, formato do idioma, fuso padrão', async () => {
    const { casos } = montar(null, { idiomaPadrao: 'es', moeda: 'CLP', pais: 'CL' });
    expect(await casos.lerPreferencias(ctx, 'fr')).toEqual({
      idioma: 'es',
      formatoRegional: 'es-419',
      fuso: 'America/Sao_Paulo',
      moeda: 'CLP',
      gravadas: { idioma: null, formatoRegional: null, fuso: null },
    });
  });

  it('escolha do membro vence o tenant e o navegador', async () => {
    const { casos } = montar({ idioma: 'fr', formatoRegional: 'fr-CA', fuso: 'America/Toronto' });
    const p = await casos.lerPreferencias(ctx, 'en-US');
    expect([p.idioma, p.formatoRegional, p.fuso]).toEqual(['fr', 'fr-CA', 'America/Toronto']);
  });

  it('sem tenant visível: cai no navegador', async () => {
    const { casos } = montar(null, null);
    expect((await casos.lerPreferencias(ctx, 'en-GB,en;q=0.9')).idioma).toBe('en');
  });
});

describe('gravar preferências', () => {
  it('grava o que é válido; nulo volta a herdar', async () => {
    const { casos, gravadas } = montar(null);
    const pedido = { idioma: 'en', formatoRegional: null, fuso: 'Europe/Lisbon' };
    await casos.gravarPreferencias(ctx, pedido);
    expect(gravadas).toEqual([pedido]);
  });

  it.each([
    [
      'idioma fora da lista',
      { idioma: 'de', formatoRegional: null, fuso: null },
      'idioma_nao_aceito',
    ],
    [
      'formato regional fora da lista',
      { idioma: null, formatoRegional: 'de-DE', fuso: null },
      'formato_regional_nao_aceito',
    ],
    [
      'fuso inexistente',
      { idioma: null, formatoRegional: null, fuso: 'America/Atlantida' },
      'fuso_invalido',
    ],
    [
      'deslocamento em vez de fuso',
      { idioma: null, formatoRegional: null, fuso: '-03:00' },
      'fuso_invalido',
    ],
  ] as const)('%s: 422 com código, sem gravar', async (_n, pedido, codigo) => {
    const { casos, gravadas } = montar(null);
    const erro = await casos.gravarPreferencias(ctx, pedido).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(RegraViolada);
    expect((erro as RegraViolada).codigo).toBe(codigo);
    expect(gravadas).toEqual([]);
  });
});
