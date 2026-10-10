// Sugestão de códigos na tela da OS do PWA (I6), nos quatro idiomas e no
// pseudo-idioma, pelo catálogo (ADR-022): os três campos aparecem com a OS em
// execução ou pausada e a referência com códigos; a lista de cada tipo traz os
// que servem para a categoria do ativo (os dela primeiro), sem os de outra
// categoria nem os desativados. Renderiza com react-dom/server.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProvedorDeIdioma } from '../src/i18n';
import type { OsNoAparelho } from '../src/os/projecao';
import type { CodigoGuardado } from '../src/referencia/banco';
import { Os } from '../src/telas/Os';

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(<ProvedorDeIdioma idioma={idioma}>{tela}</ProvedorDeIdioma>).replaceAll(
    '&#x27;',
    "'",
  );

const REFRIGERACAO = 'ca000000-0000-4000-8000-000000000001';
const ELETRICA = 'ca000000-0000-4000-8000-000000000002';

const codigo = (
  id: string,
  tipo: CodigoGuardado['tipo'],
  chavePadrao: string | null,
  categoriaId: string | null = null,
  extra: Partial<CodigoGuardado> = {},
): CodigoGuardado => ({
  id: `c0000000-0000-4000-8000-00000000000${id}`,
  tipo,
  categoriaId,
  chavePadrao,
  nomes: {},
  ativa: true,
  ...extra,
});

const LISTA: CodigoGuardado[] = [
  codigo('1', 'falha', 'falha_nao_liga'),
  codigo('2', 'falha', 'falha_nao_refrigera', REFRIGERACAO),
  codigo('3', 'falha', 'falha_sem_energia', ELETRICA),
  codigo('4', 'falha', 'falha_quebra', null, { ativa: false }),
  codigo('5', 'causa', null, null, { nomes: { 'pt-BR': 'Borracha ressecada', en: 'Dry seal' } }),
  codigo('6', 'solucao', 'solucao_troca_de_peca'),
];

const os = (estado: OsNoAparelho['estado']): OsNoAparelho => ({
  id: '0a100000-0000-4000-8000-000000000001',
  hotelId: 'b1000000-0000-4000-8000-000000000001',
  estado,
  situacaoId: '5a000000-0000-4000-8000-000000000001',
  responsavel: { tipo: 'equipe', equipeId: 'e1000000-0000-4000-8000-000000000001' },
  motivoReabertura: null,
  versao: 2,
  criadoEm: '2026-10-10T08:00:00.000Z',
  chamado: {
    id: 'c1000000-0000-4000-8000-000000000001',
    descricao: 'Frigobar quente',
    localId: 'd1000000-0000-4000-8000-000000000001',
    localNome: 'UH 101',
    prioridadeId: '9a000000-0000-4000-8000-000000000001',
    estado: 'em_execucao',
    ativoId: 'a1000000-0000-4000-8000-000000000001',
    paradoDesde: null,
    paradaDoChamado: false,
    uhIndisponivelDesde: null,
  },
  pendentes: 0,
});

const tela = (o: OsNoAparelho, idioma: IdiomaDeExibicao, lista = LISTA) => (
  <Os
    os={o}
    codigos={{ lista, categoriaDoAtivo: REFRIGERACAO, idiomaPadrao: 'pt-BR', idioma }}
    aoAgir={async () => undefined}
    aoApontar={async () => undefined}
    aoRegistrarMaterial={async () => undefined}
    aoFotografar={async () => undefined}
    aoRegistrarParada={async () => undefined}
    aoEncerrarParada={async () => undefined}
    aoVoltar={() => undefined}
  />
);

describe('sugestão de códigos na OS do PWA (I6)', () => {
  it.each(IDIOMAS)('%s: os que servem, da categoria do ativo primeiro', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, tela(os('em_execucao'), idioma));
    expect(html).toContain(m['tecnico.os.codigos.titulo']);
    expect(html).toContain(m['tecnico.os.codigos.nenhum']);
    const refri = m['codigo_manutencao.padrao.falha_nao_refrigera'];
    const geral = m['codigo_manutencao.padrao.falha_nao_liga'];
    expect(html).toContain(refri);
    expect(html.indexOf(refri)).toBeLessThan(html.indexOf(geral));
    expect(html).not.toContain(m['codigo_manutencao.padrao.falha_sem_energia']);
    expect(html).not.toContain(m['codigo_manutencao.padrao.falha_quebra']);
    expect(html).toContain(m['codigo_manutencao.padrao.solucao_troca_de_peca']);
  });

  it('o nome do grupo vale antes do catálogo; sem nome no idioma, o do idioma padrão', () => {
    expect(renderizar('en', tela(os('pausada'), 'en'))).toContain('Dry seal');
    expect(renderizar('fr', tela(os('pausada'), 'fr'))).toContain('Borracha ressecada');
  });

  it('só com a OS em execução ou pausada, e só com códigos na referência', () => {
    const m = mensagensDe('pt-BR');
    expect(renderizar('pt-BR', tela(os('atribuida'), 'pt-BR'))).not.toContain(
      m['tecnico.os.codigos.titulo'],
    );
    expect(renderizar('pt-BR', tela(os('em_execucao'), 'pt-BR', []))).not.toContain(
      m['tecnico.os.codigos.titulo'],
    );
  });

  it('pseudo-idioma: os textos novos vêm do catálogo (entre colchetes)', () => {
    const html = renderizar(PSEUDO_IDIOMA, tela(os('em_execucao'), PSEUDO_IDIOMA));
    const m = mensagensDe(PSEUDO_IDIOMA);
    expect(html).toContain(m['tecnico.os.codigos.titulo']);
    expect(m['tecnico.os.codigos.titulo']).toMatch(/^\[.*\]$/);
  });
});
