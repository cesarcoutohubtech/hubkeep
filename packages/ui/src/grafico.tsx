'use client';
// Gráfico de linhas (1c, decisão 6 da paridade): uma série por linha, num eixo
// só, com a grade discreta, o primeiro, o do meio e o último rótulo do eixo X,
// e a legenda quando há mais de uma série. Ao passar o ponteiro (ou com as
// setas, com o foco no gráfico), a linha vertical marca o ponto e a dica mostra
// o rótulo e o valor de cada série. A cor de cada série vem dos tokens
// --hk-serie-1 e --hk-serie-2, na ordem, nunca da posição no ranking; o texto
// fica nas cores de texto. Os números também vão numa tabela, que o app passa
// em `tabela`, para quem não lê o gráfico. A largura acompanha a do painel, e
// o texto do eixo não encolhe no celular.
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';

export interface SerieDoGrafico {
  chave: string;
  /** Nome da série (do catálogo), na legenda e na dica. */
  rotulo: string;
  /** Um valor por ponto do eixo X. */
  valores: readonly number[];
}

export interface PropsDoGraficoDeLinhas {
  /** Nome do gráfico (do catálogo), anunciado pelo leitor de tela. */
  rotulo: string;
  /** O rótulo de cada ponto do eixo X, já formatado (o dia, por exemplo). */
  eixoX: readonly string[];
  /** Até duas séries, na ordem das cores. */
  series: readonly SerieDoGrafico[];
  /** Formata o valor do eixo Y e da dica, no idioma de quem vê. */
  formatar: (n: number) => string;
  /** A tabela com os mesmos números, aberta pelo texto de `verTabela`. */
  tabela?: ReactNode;
  verTabela?: string;
}

/**
 * A linha curta dos últimos dias, dentro de um indicador: sem eixo, sem grade e
 * sem dica, na cor da primeira série. O nome vai no aria-label; os números
 * ficam no gráfico completo ou na tabela, onde o app os mostra. O dia sem
 * valor (null) deixa um vão; um valor sozinho entre dois vãos vira um ponto.
 */
export function MiniLinha({
  rotulo,
  valores,
}: {
  rotulo: string;
  valores: readonly (number | null)[];
}) {
  const numeros = valores.filter((v): v is number => v !== null);
  if (valores.length < 2 || numeros.length === 0) return null;
  const maximo = Math.max(1, ...numeros);
  const minimo = Math.min(0, ...numeros);
  const passoX = 100 / (valores.length - 1);
  const y = (v: number) => 2 + (1 - (v - minimo) / (maximo - minimo)) * 24;
  const trechos: string[][] = [[]];
  valores.forEach((v, i) => {
    if (v !== null) trechos[trechos.length - 1]?.push(`${i * passoX},${y(v)}`);
    else if (trechos[trechos.length - 1]?.length) trechos.push([]);
  });
  return (
    <svg
      className="hk-mini-linha"
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      role="img"
      aria-label={rotulo}
    >
      {trechos
        .filter((pontos) => pontos.length > 0)
        .map((pontos) => (
          <polyline
            key={pontos[0]}
            className="hk-grafico-linha hk-grafico-serie-1"
            vectorEffect="non-scaling-stroke"
            points={(pontos.length === 1 ? [pontos[0], pontos[0]] : pontos).join(' ')}
          />
        ))}
    </svg>
  );
}

/** Um item das barras horizontais: o nome, o valor e o valor já formatado. */
export interface ItemDasBarras {
  chave: string;
  rotulo: string;
  valor: number;
  texto: string;
}

/**
 * As barras horizontais de uma contagem por item, da maior para a menor, na
 * ordem recebida: o nome à esquerda, a barra no meio (proporcional ao maior
 * valor) e o número à direita. A barra é só desenho; o nome e o número ficam
 * em texto, numa lista com nome.
 */
export function BarrasHorizontais({
  rotulo,
  itens,
}: {
  rotulo: string;
  itens: readonly ItemDasBarras[];
}) {
  if (itens.length === 0) return null;
  const maior = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ol className="hk-barras" aria-label={rotulo}>
      {itens.map((i) => (
        <li key={i.chave} className="hk-barras-item">
          <span className="hk-barras-rotulo">{i.rotulo}</span>
          <svg
            className="hk-barras-barra"
            viewBox="0 0 100 8"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <rect className="hk-grafico-serie-1" width={(i.valor / maior) * 100} height={8} />
          </svg>
          <span className="hk-barras-valor">{i.texto}</span>
        </li>
      ))}
    </ol>
  );
}

const ALTURA = 200;
const MARGEM = { topo: 12, direita: 12, base: 28, esquerda: 44 };
const LARGURA_PADRAO = 640;

/**
 * O passo da grade: 1, 2 ou 5 vezes uma potência de dez, para até quatro
 * linhas acima do zero. Nunca menos que 1: os valores são contagens.
 */
export function passoDaGrade(maximo: number): number {
  if (maximo <= 4) return 1;
  const bruto = maximo / 4;
  const base = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 5, 10].map((m) => m * base).find((p) => p >= bruto) ?? 10 * base;
}

function useLargura() {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(LARGURA_PADRAO);
  useEffect(() => {
    const no = ref.current;
    if (!no || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(([e]) => {
      if (e) setLargura(Math.max(240, Math.round(e.contentRect.width)));
    });
    observador.observe(no);
    return () => observador.disconnect();
  }, []);
  return { ref, largura };
}

export function GraficoDeLinhas({
  rotulo,
  eixoX,
  series,
  formatar,
  tabela,
  verTabela,
}: PropsDoGraficoDeLinhas) {
  const { ref, largura } = useLargura();
  const [ponto, setPonto] = useState<number | null>(null);
  const n = eixoX.length;
  const maximo = Math.max(0, ...series.flatMap((s) => s.valores));
  const passo = passoDaGrade(maximo);
  const topo = Math.max(passo, Math.ceil(maximo / passo) * passo);
  const grade = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);
  const area = {
    largura: largura - MARGEM.esquerda - MARGEM.direita,
    altura: ALTURA - MARGEM.topo - MARGEM.base,
  };
  const x = (i: number) =>
    MARGEM.esquerda + (n <= 1 ? area.largura / 2 : (i * area.largura) / (n - 1));
  const y = (v: number) => MARGEM.topo + area.altura - (v / topo) * area.altura;
  const rotulosX = [...new Set(n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : [0, n - 1])].filter(
    (i) => i >= 0 && i < n,
  );
  const ancora = (i: number) => (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle');

  function aoMover(ev: { clientX: number; currentTarget: SVGRectElement }) {
    const caixa = ev.currentTarget.getBoundingClientRect();
    const relativo = ((ev.clientX - caixa.left) / caixa.width) * area.largura;
    setPonto(
      n <= 1 ? 0 : Math.min(n - 1, Math.max(0, Math.round((relativo * (n - 1)) / area.largura))),
    );
  }

  function aoTeclar(ev: KeyboardEvent<SVGSVGElement>) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    const atual = ponto ?? (ev.key === 'ArrowLeft' ? n : -1);
    setPonto(Math.min(n - 1, Math.max(0, atual + (ev.key === 'ArrowLeft' ? -1 : 1))));
  }

  return (
    <figure className="hk-grafico" ref={ref}>
      {series.length > 1 ? (
        <ul className="hk-grafico-legenda">
          {series.map((s, i) => (
            <li key={s.chave}>
              <span className={`hk-grafico-amostra hk-grafico-serie-${i + 1}`} aria-hidden />
              {s.rotulo}
            </li>
          ))}
        </ul>
      ) : null}
      <svg
        viewBox={`0 0 ${largura} ${ALTURA}`}
        width={largura}
        height={ALTURA}
        role="img"
        aria-label={rotulo}
        tabIndex={0}
        onKeyDown={aoTeclar}
        onBlur={() => setPonto(null)}
      >
        {grade.map((v) => (
          <g key={v}>
            <line
              className="hk-grafico-grade"
              x1={MARGEM.esquerda}
              x2={largura - MARGEM.direita}
              y1={y(v)}
              y2={y(v)}
            />
            <text
              className="hk-grafico-eixo"
              x={MARGEM.esquerda - 8}
              y={y(v)}
              dy="0.32em"
              textAnchor="end"
            >
              {formatar(v)}
            </text>
          </g>
        ))}
        {rotulosX.map((i) => (
          <text
            key={i}
            className="hk-grafico-eixo"
            x={x(i)}
            y={ALTURA - 8}
            textAnchor={n <= 1 ? 'middle' : ancora(i)}
          >
            {eixoX[i]}
          </text>
        ))}
        {ponto !== null ? (
          <line
            className="hk-grafico-cursor"
            x1={x(ponto)}
            x2={x(ponto)}
            y1={MARGEM.topo}
            y2={MARGEM.topo + area.altura}
          />
        ) : null}
        {series.map((s, i) =>
          n > 1 ? (
            <polyline
              key={s.chave}
              className={`hk-grafico-linha hk-grafico-serie-${i + 1}`}
              points={s.valores.map((v, j) => `${x(j)},${y(v)}`).join(' ')}
            />
          ) : null,
        )}
        {series.map((s, i) =>
          ponto !== null || n === 1 ? (
            <circle
              key={s.chave}
              className={`hk-grafico-ponto hk-grafico-serie-${i + 1}`}
              cx={x(ponto ?? 0)}
              cy={y(s.valores[ponto ?? 0] ?? 0)}
              r={4}
            />
          ) : null,
        )}
        <rect
          className="hk-grafico-alvo"
          x={MARGEM.esquerda}
          y={MARGEM.topo}
          width={area.largura}
          height={area.altura}
          onPointerMove={aoMover}
          onPointerDown={aoMover}
          onPointerLeave={() => setPonto(null)}
        />
      </svg>
      {ponto !== null ? (
        <div
          className="hk-grafico-dica"
          role="status"
          style={{
            left: `${(x(ponto) / largura) * 100}%`,
            transform: `translateX(${ponto > (n - 1) / 2 ? 'calc(-100% - 8px)' : '8px'})`,
          }}
        >
          <strong>{eixoX[ponto]}</strong>
          {series.map((s, i) => (
            <span key={s.chave} className="hk-grafico-dica-linha">
              <span>
                <span className={`hk-grafico-amostra hk-grafico-serie-${i + 1}`} aria-hidden />
                {s.rotulo}
              </span>
              <strong>{formatar(s.valores[ponto] ?? 0)}</strong>
            </span>
          ))}
        </div>
      ) : null}
      {tabela ? (
        <details className="hk-grafico-tabela">
          <summary>{verTabela}</summary>
          {tabela}
        </details>
      ) : null}
    </figure>
  );
}
