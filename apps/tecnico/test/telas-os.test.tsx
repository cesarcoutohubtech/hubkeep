// Fila do dia com OS e tela da OS no PWA (C4b), nos quatro idiomas e no
// pseudo-idioma, pelo catálogo (ADR-022). Renderiza com react-dom/server.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProvedorDeIdioma } from '../src/i18n';
import type { OsNoAparelho } from '../src/os/projecao';
import { FilaDoDia } from '../src/telas/FilaDoDia';
import { Os } from '../src/telas/Os';

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(<ProvedorDeIdioma idioma={idioma}>{tela}</ProvedorDeIdioma>).replaceAll(
    '&#x27;',
    "'",
  );

const os = (estado: OsNoAparelho['estado'], pendentes = 0): OsNoAparelho => ({
  id: '0a100000-0000-4000-8000-000000000001',
  hotelId: 'b1000000-0000-4000-8000-000000000001',
  estado,
  situacaoId: '5a000000-0000-4000-8000-000000000001',
  responsavel: { tipo: 'equipe', equipeId: 'e1000000-0000-4000-8000-000000000001' },
  versao: 1,
  criadoEm: '2026-09-29T08:00:00.000Z',
  chamado: {
    id: 'c1000000-0000-4000-8000-000000000001',
    descricao: 'Chuveiro frio',
    localId: 'd1000000-0000-4000-8000-000000000001',
    localNome: 'UH 101',
    prioridadeId: '9a000000-0000-4000-8000-000000000001',
    estado: 'em_execucao',
  },
  pendentes,
});

const fila = (lista: OsNoAparelho[] | null, antigaDesde: number | null = null) => (
  <FilaDoDia
    idioma="pt-BR"
    online
    fila={{ pendentes: antigaDesde ? 1 : 0, rejeitadas: [], antigaDesde }}
    os={lista}
    lidaEm={lista ? Date.UTC(2026, 8, 29, 11) : null}
    aoAbrirOs={() => undefined}
    aoTrocarIdioma={() => undefined}
    aoEnviarAgora={() => undefined}
    aoDispensar={() => undefined}
    aoAbrirAtivos={() => undefined}
    aoAbrirChamado={() => undefined}
    aoSair={() => undefined}
  />
);

const tela = (o: OsNoAparelho) => (
  <Os
    os={o}
    aoAgir={async () => undefined}
    aoApontar={async () => undefined}
    aoRegistrarMaterial={async () => undefined}
    aoFotografar={async () => undefined}
    aoVoltar={() => undefined}
  />
);

describe('fila do dia com OS', () => {
  it.each(IDIOMAS)('%s', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, fila([os('atribuida'), os('pausada', 2)]));
    expect(html).toContain('UH 101');
    expect(html).toContain('Chuveiro frio');
    expect(html).toContain(m['situacao.padrao.os_atribuida']);
    expect(html).toContain(m['situacao.padrao.os_pausada']);
    expect(renderizar(idioma, fila(null))).toContain(m['tecnico.fila.sem_leitura']);
    expect(renderizar(idioma, fila([]))).toContain(m['tecnico.fila.vazia']);
  });

  it.each(IDIOMAS)('%s: aviso de pendência antiga (adendo ao ADR-025)', (idioma) => {
    const m = mensagensDe(idioma);
    const inicio = m['tecnico.sincronizacao.antiga'].split('{desde}')[0] ?? '';
    expect(inicio.length).toBeGreaterThan(5);
    expect(renderizar(idioma, fila([], Date.UTC(2026, 8, 27, 11)))).toContain(inicio);
    expect(renderizar(idioma, fila([]))).not.toContain('pendencia_antiga');
  });

  it('os registros ainda na fila aparecem na OS, com plural', () => {
    expect(renderizar('pt-BR', fila([os('pausada', 2)]))).toContain('2 registros aguardando envio');
    expect(renderizar('en', fila([os('pausada', 1)]))).toContain('1 entry waiting to be sent');
  });
});

describe('tela da OS', () => {
  it.each(IDIOMAS)('%s', (idioma) => {
    const m = mensagensDe(idioma);
    const emExecucao = renderizar(idioma, tela(os('em_execucao')));
    expect(emExecucao).toContain(m['tecnico.os.acao.pausar']);
    expect(emExecucao).toContain(m['tecnico.os.acao.concluir']);
    expect(emExecucao).toContain(m['tecnico.os.horas.apontar']);
    expect(emExecucao).toContain(m['tecnico.os.material.registrar']);
    expect(emExecucao).toContain(m['tecnico.fotos.tirar']);
    const atribuida = renderizar(idioma, tela(os('atribuida')));
    expect(atribuida).toContain(m['tecnico.os.acao.iniciar']);
    expect(atribuida).toContain(m['tecnico.os.sem_registro']);
    expect(atribuida).not.toContain(m['tecnico.os.horas.apontar']);
  });

  it('as ações pelo estado, com as regras do domínio', () => {
    const botoes = (o: OsNoAparelho) =>
      [...renderizar('pt-BR', tela(o)).matchAll(/<button>([^<]+)<\/button>/g)].map((b) => b[1]);
    expect(botoes(os('atribuida'))).toEqual(['Voltar', 'Iniciar']);
    expect(botoes(os('em_execucao'))).toEqual(['Voltar', 'Pausar', 'Concluir']);
    expect(botoes(os('pausada'))).toEqual(['Voltar', 'Retomar']);
    expect(botoes(os('concluida'))).toEqual(['Voltar']);
  });

  it('pseudo-idioma: todo texto visível vem do catálogo (entre colchetes)', () => {
    const html = renderizar(PSEUDO_IDIOMA, tela(os('em_execucao', 1)));
    const textos = [...html.matchAll(/>([^<>]+)</g)]
      .map((m) => (m[1] ?? '').trim())
      .filter(Boolean)
      // O que vem do chamado é dado, não texto de interface.
      .filter((t) => t !== 'Chuveiro frio');
    expect(textos.length).toBeGreaterThan(8);
    for (const texto of textos) expect(texto, texto).toMatch(/^\[.*\]$/s);
  });
});
