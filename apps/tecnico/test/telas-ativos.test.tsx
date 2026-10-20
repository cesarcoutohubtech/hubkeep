// Tela de ativos do PWA (B3b) nos quatro idiomas e no pseudo-idioma, pelo
// catálogo (ADR-022). Renderiza com react-dom/server.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProvedorDeIdioma } from '../src/i18n';
import type { Referencia } from '../src/referencia/banco';
import type { PortaDeFotos } from '../src/anexos/fotos';
import { Ativos, camposDaI1, modeloDaGravacao } from '../src/telas/Ativos';
import { FotosDoAtivo } from '../src/telas/FotosDoAtivo';

const referencia: Referencia = {
  usuarioId: 'u',
  tenantId: 't',
  hoteis: [{ id: 'h1', nome: 'Hotel 1' }],
  locais: { h1: [{ id: 'l1', nome: 'UH 101', status: 'ativo' }] },
  ativos: {
    h1: [
      {
        id: 'a1',
        localId: 'l1',
        categoriaId: null,
        nome: 'Frigobar',
        fabricante: null,
        modelo: null,
        numeroSerie: null,
        campos: {},
        versao: 1,
        ativo: true,
      },
    ],
  },
  idiomaPadrao: 'pt-BR',
  categorias: [],
  lidaEm: 0,
};

const fotos: PortaDeFotos = {
  listar: async () => [],
  urlDaMiniatura: async () => null,
  enviar: async () => ({ tipo: 'ok' }),
};

const renderizarFotos = (idioma: IdiomaDeExibicao, online: boolean) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma}>
      <FotosDoAtivo
        ativo={{ id: 'a1', nome: 'Frigobar' }}
        online={online}
        fotos={fotos}
        aoFechar={() => undefined}
      />
    </ProvedorDeIdioma>,
  ).replaceAll('&#x27;', "'");

const renderizar = (idioma: IdiomaDeExibicao, r: Referencia | null) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma}>
      <Ativos
        idioma={idioma}
        referencia={r}
        pendentes={[{ chave: 'k1', nome: 'TV', localId: 'l1' }]}
        aoCadastrar={async () => undefined}
        aoAlterar={async () => undefined}
        aoVoltar={() => undefined}
        fotos={fotos}
        online
      />
    </ProvedorDeIdioma>,
  ).replaceAll('&#x27;', "'");

describe('tela de ativos do PWA', () => {
  it.each(IDIOMAS)('%s', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, referencia);
    expect(html).toContain(m['admin.ativos.titulo']);
    expect(html).toContain(m['tecnico.ativos.pendentes_envio']);
    expect(html).toContain(m['tecnico.ativos.acao.alterar']);
    expect(html).toContain(m['tecnico.fotos.abrir']);
    const comRede = renderizarFotos(idioma, true);
    expect(comRede).toContain(m['tecnico.fotos.tirar']);
    expect(comRede).toContain(m['tecnico.fotos.fechar']);
    expect(renderizarFotos(idioma, false)).toContain(m['tecnico.fotos.precisa_de_rede']);
    expect(renderizar(idioma, null)).toContain(m['tecnico.ativos.sem_referencia']);
  });

  it('lista os ativos guardados e os cadastros aguardando envio', () => {
    const html = renderizar('pt-BR', referencia);
    expect(html).toContain('Frigobar (UH 101)');
    expect(html).toContain('TV, em UH 101');
  });

  it('aberta pelo QR (B5): já vem no hotel do ativo, com o ativo aberto', () => {
    const ativo = referencia.ativos['h1']?.[0];
    if (!ativo) throw new Error('fixture sem ativo');
    const html = renderToString(
      <ProvedorDeIdioma idioma="pt-BR">
        <Ativos
          aberto={{ hotelId: 'h1', ativo }}
          idioma="pt-BR"
          referencia={referencia}
          pendentes={[]}
          aoCadastrar={async () => undefined}
          aoAlterar={async () => undefined}
          aoVoltar={() => undefined}
        />
      </ProvedorDeIdioma>,
    );
    const m = mensagensDe('pt-BR');
    expect(html).toContain('value="Frigobar"');
    expect(html).toContain(m['admin.ativos.acao.salvar']);
    expect(html).not.toContain(m['admin.ativos.novo']);
  });

  it('aberta pela etiqueta reservada (M3): o cadastro novo mostra o código; sem rede, o aviso', () => {
    const tela = (hotelId: string | null) =>
      renderToString(
        <ProvedorDeIdioma idioma="pt-BR">
          <Ativos
            etiqueta={{ hotelId, codigo: '7K3M9QX2AB' }}
            idioma="pt-BR"
            referencia={referencia}
            pendentes={[]}
            aoCadastrar={async () => undefined}
            aoAlterar={async () => undefined}
            aoVoltar={() => undefined}
          />
        </ProvedorDeIdioma>,
      ).replaceAll('&#x27;', "'");
    const m = mensagensDe('pt-BR');
    const comRede = tela('h1');
    expect(comRede).toContain(m['admin.ativos.novo']);
    expect(comRede).toContain('7K3M9-QX2AB');
    expect(comRede).not.toContain(m['tecnico.ativos.etiqueta_sem_rede']);
    expect(tela(null)).toContain(m['tecnico.ativos.etiqueta_sem_rede']);
  });

  it('pseudo-idioma: todo texto visível vem do catálogo (entre colchetes)', () => {
    const html = renderizar(PSEUDO_IDIOMA, referencia).replace(/<select[\s\S]*?<\/select>/g, '');
    const textos = [...html.matchAll(/>([^<>]+)</g)]
      .map((m) => (m[1] ?? '').trim())
      .filter(Boolean);
    expect(textos.length).toBeGreaterThan(4);
    for (const texto of textos) expect(texto, texto).toMatch(/^\[.*\]$/s);
    for (const online of [true, false]) {
      for (const m of renderizarFotos(PSEUDO_IDIOMA, online).matchAll(/>([^<>]+)</g)) {
        const texto = (m[1] ?? '').trim();
        if (texto) expect(texto, texto).toMatch(/^\[.*\]$/s);
      }
    }
  });
});

describe('compra, garantia e criticidade no PWA (I1)', () => {
  const guardado = referencia.ativos['h1']?.[0];
  if (!guardado) throw new Error('fixture sem ativo');
  const vazios = { dataCompra: null, garantiaAte: null, criticidade: null };

  it('ficam na parte recolhida do formulário, com os nomes dos níveis', () => {
    const m = mensagensDe('pt-BR');
    const html = renderizar('pt-BR', {
      ...referencia,
      nomesDeCriticidade: { h1: { 5: { 'pt-BR': 'Vital' } } },
    });
    expect(html).toContain(`<details><summary>${m['tecnico.ativos.mais_dados']}</summary>`);
    expect(html).toContain('name="garantiaAte"');
    expect(html).toContain('5 · Vital');
    expect(html).toContain('4 · Alta');
  });

  it('cadastro leva os três, mesmo vazios', () => {
    expect(camposDaI1(null, vazios)).toEqual(vazios);
  });

  it('referência anterior à I1: o vazio não vai, para não apagar o do servidor', () => {
    expect(camposDaI1(guardado, vazios)).toEqual({});
    expect(camposDaI1(guardado, { ...vazios, criticidade: 3 })).toEqual({ criticidade: 3 });
  });

  it('referência com a I1: o vazio vai como null, e apaga', () => {
    expect(camposDaI1({ ...guardado, ...vazios, criticidade: 2 }, vazios)).toEqual(vazios);
  });
});

describe('modelo de ativo no PWA (M1)', () => {
  const comModelos: Referencia = {
    ...referencia,
    modelos: [
      {
        id: 'm1',
        categoriaId: 'cat-ar',
        nome: 'Split 12.000',
        fabricante: 'Fabricante X',
        modelo: 'X-12',
        campos: {},
        ativa: true,
      },
      {
        id: 'm2',
        categoriaId: 'cat-ar',
        nome: 'Split antigo',
        fabricante: null,
        modelo: null,
        campos: {},
        ativa: false,
      },
    ],
  };

  it.each(IDIOMAS)('%s: o cadastro oferece os modelos ativos guardados', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, comModelos);
    expect(html).toContain(m['admin.ativos.sem_modelo']);
    expect(html).toContain('Split 12.000');
    expect(html).not.toContain('Split antigo');
  });

  it('só os modelos do grupo e os da bandeira do hotel (PB1b)', () => {
    const daBandeira = (id: string, nome: string, bandeiraId: string) => ({
      id,
      categoriaId: 'cat-ar',
      nome,
      fabricante: null,
      modelo: null,
      campos: {},
      ativa: true,
      bandeiraId,
    });
    const html = renderizar('pt-BR', {
      ...comModelos,
      hoteis: [{ id: 'h1', nome: 'Hotel 1', bandeiraId: 'bx' }],
      modelos: [
        ...(comModelos.modelos ?? []),
        daBandeira('m3', 'Split da X', 'bx'),
        daBandeira('m4', 'Split da Y', 'by'),
      ],
    });
    expect(html).toContain('Split 12.000');
    expect(html).toContain('Split da X');
    expect(html).not.toContain('Split da Y');
  });

  it('sem modelos guardados (referência anterior à M1), sem a escolha', () => {
    const m = mensagensDe('pt-BR');
    expect(renderizar('pt-BR', referencia)).not.toContain(m['admin.ativos.sem_modelo']);
  });

  it('cadastro leva o modelo, mesmo nulo; referência anterior à M1 só leva o escolhido', () => {
    const guardado = referencia.ativos.h1?.[0];
    if (!guardado) throw new Error('sem ativo');
    expect(modeloDaGravacao(null, null)).toEqual({ modeloId: null });
    expect(modeloDaGravacao(guardado, null)).toEqual({});
    expect(modeloDaGravacao(guardado, 'm1')).toEqual({ modeloId: 'm1' });
    expect(modeloDaGravacao({ ...guardado, modeloId: 'm1' }, null)).toEqual({ modeloId: null });
  });
});

describe('situação do cadastro no PWA (M4)', () => {
  const comSituacao = (
    situacaoCadastro: 'pendente' | 'aprovado' | 'recusado',
    motivoDaRecusa: string | null,
  ): Referencia => ({
    ...referencia,
    ativos: {
      h1: referencia.ativos.h1?.map((a) => ({ ...a, situacaoCadastro, motivoDaRecusa })) ?? [],
    },
  });

  it.each(IDIOMAS)('%s: pendente e recusado com o motivo; aprovado sem marca', (idioma) => {
    const m = mensagensDe(idioma);
    expect(renderizar(idioma, comSituacao('pendente', null))).toContain(
      m['tecnico.ativos.cadastro_pendente'],
    );
    const recusado = renderizar(idioma, comSituacao('recusado', 'Local errado'));
    expect(recusado).toContain('data-cadastro="recusado"');
    expect(recusado).toContain('Local errado');
    expect(renderizar(idioma, comSituacao('aprovado', null))).not.toContain('data-cadastro');
  });

  it('referência anterior à M4: sem marca', () => {
    expect(renderizar('pt-BR', referencia)).not.toContain('data-cadastro');
  });
});
