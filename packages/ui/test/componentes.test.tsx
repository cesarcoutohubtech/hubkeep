// Componentes base (ADR-038, U2), renderizados no servidor: a marcação que o
// estilo e o leitor de tela esperam. O texto aqui é de teste; nos apps ele
// vem do catálogo. Que cada tom, nível e variante tem regra no CSS, e que
// toda cor do CSS vem de um token, está em tests/ui-contraste.test.ts.
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AreaDeTexto,
  BarrasHorizontais,
  Botao,
  Campo,
  comoBotao,
  Entrada,
  Estrutura,
  GraficoDeLinhas,
  GrupoDeMenu,
  Dados,
  Indicador,
  Indicadores,
  ItemDeMenu,
  Marca,
  MensagemDeErro,
  MensagemVazia,
  MiniLinha,
  NIVEIS_DE_PRIORIDADE,
  Nota,
  Painel,
  passoDaGrade,
  Selecao,
  Selo,
  SeloDePrioridade,
  Tabela,
  TelaDeEntrada,
  TONS_DE_INDICADOR,
  TONS_DE_SELO,
  VARIANTES_DE_BOTAO,
} from '../src/index';

const html = (no: ReactNode) => renderToString(no);

describe('Estrutura', () => {
  const tela = (pular?: string) =>
    html(
      <Estrutura
        marca="HubKeep"
        rotuloDoMenu="Menu principal"
        titulo="Chamados"
        acoes={<button type="button">tema</button>}
        escopo="Grupo Exemplo"
        {...(pular ? { rotuloPularParaConteudo: pular } : {})}
        menu={
          <GrupoDeMenu rotulo="Operação">
            <ItemDeMenu href="/chamados" ativo contagem={3}>
              Chamados
            </ItemDeMenu>
            <ItemDeMenu href="/os">Ordens de serviço</ItemDeMenu>
          </GrupoDeMenu>
        }
      >
        <p>conteúdo</p>
      </Estrutura>,
    );

  it('menu com nome, item atual marcado e título como h1', () => {
    const h = tela();
    expect(h).toMatch(/<nav class="hk-menu" aria-label="Menu principal"/);
    expect(h).toMatch(/<a href="\/chamados" class="hk-menu-item" aria-current="page">/);
    expect(h).toMatch(/<a href="\/os" class="hk-menu-item">/);
    expect(h).toContain('<span class="hk-menu-contagem">3</span>');
    expect(h).toContain('<h1>Chamados</h1>');
    expect(h).toContain('<div class="hk-escopo">Grupo Exemplo</div>');
    expect(h).toMatch(/<main class="hk-conteudo"/);
  });

  it('o botão do celular nomeia e controla o menu, que começa fechado', () => {
    const h = tela();
    const id = /<aside class="hk-lateral" id="([^"]+)"/.exec(h)?.[1];
    expect(id).toBeTruthy();
    expect(h).toContain(`aria-controls="${id}" aria-expanded="false"`);
    expect(h).not.toContain('data-menu-aberto');
  });

  it('o atalho para o conteúdo só aparece com o texto', () => {
    expect(tela()).not.toContain('hk-pular');
    const h = tela('Pular para o conteúdo');
    const alvo = /<a class="hk-pular" href="#([^"]+)"/.exec(h)?.[1];
    expect(h).toContain(`<main class="hk-conteudo" id="${alvo}" tabindex="-1">`);
  });

  it('o item usa o componente de link do app', () => {
    const Link = ({
      href,
      className,
      children,
    }: {
      href: string;
      className: string;
      children: ReactNode;
    }) => (
      <a href={href} className={className} data-proprio="">
        {children}
      </a>
    );
    expect(
      html(
        <ItemDeMenu href="/x" componente={Link}>
          X
        </ItemDeMenu>,
      ),
    ).toContain('data-proprio=""');
  });
});

describe('Painel e Indicador', () => {
  it('a seção é nomeada pelo título', () => {
    const h = html(
      <Painel titulo="Fila" dica="hoje" acoes={<button type="button">a</button>}>
        corpo
      </Painel>,
    );
    const id = /<h2 id="([^"]+)">Fila<\/h2>/.exec(h)?.[1];
    expect(h).toContain(`<section class="hk-painel" aria-labelledby="${id}">`);
    expect(h).toContain('<span class="hk-painel-dica">hoje</span>');
  });

  it('sem título, sem cabeçalho; nível 3 vira h3', () => {
    expect(html(<Painel>corpo</Painel>)).not.toContain('hk-painel-cabecalho');
    expect(
      html(
        <Painel titulo="T" nivel={3}>
          c
        </Painel>,
      ),
    ).toMatch(/<h3 id=/);
  });

  it('a fileira de indicadores é um grupo nomeado quando tem rótulo', () => {
    expect(html(<Indicadores rotulo="Resumo">x</Indicadores>)).toBe(
      '<div class="hk-indicadores" role="group" aria-label="Resumo">x</div>',
    );
    expect(html(<Indicadores>x</Indicadores>)).toBe('<div class="hk-indicadores">x</div>');
  });

  it('os dados são pares dt e dd numa dl', () => {
    expect(
      html(
        <Dados
          itens={[
            { rotulo: 'Calculado em', valor: '10/10/2026' },
            { rotulo: 'Cálculo', valor: '1' },
          ]}
        />,
      ),
    ).toBe(
      '<dl class="hk-dados"><div class="hk-dados-par"><dt>Calculado em</dt><dd>10/10/2026</dd></div>' +
        '<div class="hk-dados-par"><dt>Cálculo</dt><dd>1</dd></div></dl>',
    );
  });

  it.each(TONS_DE_INDICADOR)('indicador %s', (tom) => {
    expect(html(<Indicador rotulo="r" valor="12" unidade="h" tom={tom} />)).toContain(
      `data-tom="${tom}"`,
    );
  });
});

describe('Tabela', () => {
  it('a legenda nomeia a tabela; escondida só visualmente por padrão', () => {
    expect(
      html(
        <Tabela legenda="Chamados abertos">
          <tbody />
        </Tabela>,
      ),
    ).toContain('<caption class="hk-so-leitor">Chamados abertos</caption>');
    expect(
      html(
        <Tabela legenda="L" legendaVisivel>
          <tbody />
        </Tabela>,
      ),
    ).toContain('<caption>L</caption>');
  });
});

describe('Selos e botões', () => {
  it.each(TONS_DE_SELO)('selo %s', (tom) => {
    expect(html(<Selo tom={tom}>Aberto</Selo>)).toBe(
      `<span class="hk-selo" data-tom="${tom}">Aberto</span>`,
    );
  });

  it.each(NIVEIS_DE_PRIORIDADE)('prioridade %s', (nivel) => {
    expect(html(<SeloDePrioridade nivel={nivel}>Alta</SeloDePrioridade>)).toContain(
      `data-nivel="${nivel}"`,
    );
  });

  it.each(VARIANTES_DE_BOTAO)('botão %s', (variante) => {
    const h = html(<Botao variante={variante}>Salvar</Botao>);
    expect(h).toContain('type="button"');
    expect(h).toContain(`data-variante="${variante}"`);
  });

  it('submit quando pedido, e o link com cara de botão', () => {
    expect(html(<Botao type="submit">Enviar</Botao>)).toContain('type="submit"');
    expect(
      html(
        <a href="/novo" {...comoBotao('primario', 'pequeno')}>
          Novo
        </a>,
      ),
    ).toBe(
      '<a href="/novo" class="hk-botao" data-variante="primario" data-tamanho="pequeno">Novo</a>',
    );
  });
});

describe('Campo', () => {
  it('liga rótulo, ajuda e erro ao controle', () => {
    const h = html(
      <Campo rotulo="Título" ajuda="Até 120 caracteres" erro="Obrigatório">
        {(p) => <Entrada {...p} name="titulo" />}
      </Campo>,
    );
    const id = /<label for="([^"]+)">Título<\/label>/.exec(h)?.[1];
    expect(h).toContain(
      `<input id="${id}" aria-describedby="${id}-ajuda ${id}-erro" aria-invalid="true"`,
    );
    expect(h).toContain(`<span class="hk-campo-erro" id="${id}-erro">Obrigatório</span>`);
  });

  it('sem ajuda nem erro, o controle não ganha descrição', () => {
    const h = html(<Campo rotulo="Hotel">{(p) => <Selecao {...p} />}</Campo>);
    expect(h).not.toContain('aria-describedby');
    expect(h).not.toContain('aria-invalid');
    expect(html(<AreaDeTexto className="x" />)).toBe('<textarea class="hk-controle x"></textarea>');
  });
});

describe('Mensagens', () => {
  it('o erro é anunciado; a lista vazia não', () => {
    expect(html(<MensagemDeErro titulo="Falhou">Tente de novo</MensagemDeErro>)).toContain(
      'role="alert"',
    );
    expect(html(<MensagemVazia titulo="Nada aqui" />)).not.toContain('role=');
  });
});

describe('Estrutura sem título', () => {
  it('a barra fica sem h1, e a tela traz o próprio', () => {
    const h = html(
      <Estrutura marca="M" rotuloDoMenu="Menu" menu={null}>
        <h1>Da tela</h1>
      </Estrutura>,
    );
    expect(h.match(/<h1>/g)).toHaveLength(1);
    expect(h).toContain('<span class="hk-barra-vao"></span>');
  });
});

describe('Marca e tela de entrada', () => {
  it('o símbolo é decorativo e o nome aparece em texto', () => {
    const h = html(<Marca nome="HubKeep" />);
    expect(h).toMatch(/<svg class="hk-marca-simbolo"[^>]*aria-hidden="true"/);
    expect(h).toContain('<span>HubKeep</span>');
  });

  it('cartão com marca, título como h1, formulário e rodapé', () => {
    const h = html(
      <TelaDeEntrada marca="M" titulo="Entrar" acoes={<select />} rodape="Por convite">
        <form />
      </TelaDeEntrada>,
    );
    expect(h).toMatch(/^<main class="hk-entrada"><div class="hk-entrada-cartao">/);
    expect(h).toContain(
      '<div class="hk-entrada-acoes"><select></select></div><h1>Entrar</h1><form></form>',
    );
    expect(h).toContain('<div class="hk-entrada-rodape">Por convite</div>');
  });
});

describe('Nota', () => {
  it('a informação não é anunciada; a confirmação e a atenção são', () => {
    expect(html(<Nota>Dica</Nota>)).toBe('<p class="hk-nota" data-tom="info">Dica</p>');
    expect(html(<Nota tom="ok">Feito</Nota>)).toContain('role="status"');
    expect(html(<Nota tom="atencao">Cuidado</Nota>)).toContain('role="status"');
  });
});

describe('GraficoDeLinhas', () => {
  const eixoX = ['01/10', '02/10', '03/10'];
  const formatar = (n: number) => String(n);

  it('duas séries: a legenda, uma linha por série com a cor na ordem, a grade e a tabela', () => {
    const saida = html(
      <GraficoDeLinhas
        rotulo="Fluxo"
        eixoX={eixoX}
        formatar={formatar}
        series={[
          { chave: 'a', rotulo: 'Abertos', valores: [3, 9, 4] },
          { chave: 'b', rotulo: 'Concluídos', valores: [1, 2, 7] },
        ]}
        tabela={<table />}
        verTabela="Ver os números"
      />,
    );
    expect(saida).toContain('role="img"');
    expect(saida).toContain('aria-label="Fluxo"');
    expect(saida).toContain('class="hk-grafico-legenda"');
    expect(saida.match(/<polyline/g)).toHaveLength(2);
    expect(saida).toContain('hk-grafico-linha hk-grafico-serie-1');
    expect(saida).toContain('hk-grafico-linha hk-grafico-serie-2');
    // Topo 10 com passo 5 (até 9): grade em 0, 5 e 10; o primeiro, o do meio e o último dia.
    expect(saida.match(/class="hk-grafico-grade"/g)).toHaveLength(3);
    for (const d of eixoX) expect(saida).toContain(`>${d}</text>`);
    expect(saida).toContain('<summary>Ver os números</summary>');
  });

  it('uma série: sem legenda; um ponto só vira marcador', () => {
    const saida = html(
      <GraficoDeLinhas
        rotulo="Backlog"
        eixoX={['01/10']}
        formatar={formatar}
        series={[{ chave: 'b', rotulo: 'Backlog', valores: [2] }]}
      />,
    );
    expect(saida).not.toContain('hk-grafico-legenda');
    expect(saida).not.toContain('<polyline');
    expect(saida).toContain('<circle');
  });

  it('o passo da grade: 1 até quatro, depois 1, 2 ou 5 vezes uma potência de dez', () => {
    expect([0, 3, 4, 7, 9, 18, 40, 130].map(passoDaGrade)).toEqual([1, 1, 1, 2, 5, 5, 10, 50]);
  });
});

describe('BarrasHorizontais', () => {
  it('uma linha por item, com o nome e o número em texto, e a barra pelo maior valor', () => {
    const saida = html(
      <BarrasHorizontais
        rotulo="Onde mais quebra"
        itens={[
          { chave: 'a', rotulo: 'Elevadores', valor: 8, texto: '8' },
          { chave: 'b', rotulo: 'Ar-condicionado', valor: 2, texto: '2' },
        ]}
      />,
    );
    expect(saida).toContain('aria-label="Onde mais quebra"');
    expect(saida.match(/class="hk-barras-item"/g)).toHaveLength(2);
    expect(saida).toContain('width="100"');
    expect(saida).toContain('width="25"');
    expect(saida).toContain('aria-hidden="true"');
    expect(html(<BarrasHorizontais rotulo="x" itens={[]} />)).toBe('');
  });
});

describe('MiniLinha', () => {
  it('uma linha com um ponto por valor, com nome, na cor da primeira série', () => {
    const saida = html(<MiniLinha rotulo="Backlog, 3 dias" valores={[0, 5, 10]} />);
    expect(saida).toContain('role="img"');
    expect(saida).toContain('aria-label="Backlog, 3 dias"');
    expect(saida).toContain('hk-grafico-linha hk-grafico-serie-1');
    expect(saida).toContain('points="0,26 50,14 100,2"');
  });

  it('com menos de dois valores, nada; só zeros, a linha no chão', () => {
    expect(html(<MiniLinha rotulo="x" valores={[3]} />)).toBe('');
    expect(html(<MiniLinha rotulo="x" valores={[0, 0]} />)).toContain('points="0,26 100,26"');
  });

  it('o dia sem valor deixa um vão; o valor sozinho vira um ponto; só vãos, nada', () => {
    const saida = html(<MiniLinha rotulo="x" valores={[0, 10, null, 5, null, null, 0]} />);
    const pontos = [...saida.matchAll(/points="([^"]+)"/g)].map((m) => m[1]);
    expect(pontos).toEqual(['0,26 16.666666666666668,2', '50,14 50,14', '100,26 100,26']);
    expect(html(<MiniLinha rotulo="x" valores={[null, null]} />)).toBe('');
  });

  it('no indicador, a linha vai embaixo do detalhe', () => {
    const saida = html(
      <Indicador
        rotulo="Backlog"
        valor="12"
        detalhe="+2"
        tendencia={<MiniLinha rotulo="x" valores={[1, 2]} />}
      />,
    );
    expect(saida).toMatch(/hk-indicador-detalhe[\s\S]*hk-indicador-tendencia[\s\S]*hk-mini-linha/);
  });
});
