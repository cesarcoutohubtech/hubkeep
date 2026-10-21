'use client';
// Folha de etiquetas do QR em lote (fase 1b, M3): o QR, o nome e o código de
// cada ativo, gerados no navegador como o QR individual (B5), sem o id do
// ativo. Os ativos vêm da API, no escopo de quem pede (RLS). Três tamanhos de
// etiqueta até a resposta do cliente (pergunta 24 do docs/12). O QR fica
// branco com módulos pretos nos dois temas, o papel sai no tema claro, e a
// impressão esconde o resto da tela (hk-nao-imprimir).
import { codigoQrLegivel } from '@hubkeep/dominio';
import { Botao, Campo, MensagemDeErro, MensagemVazia, Selecao } from '@hubkeep/ui';
import { type CSSProperties, useState } from 'react';
import { chamarApi } from './api';
import { URL_DO_TECNICO, caminhoSvgDoQr, enderecoDoQr } from './QrDoAtivo';
import { useTemaClaroNaImpressao } from './impressao';
import { useIdioma, useMensagemDeErro, useT } from '../i18n/cliente';
import type { ErroDaApi } from './api';

export const TAMANHOS_DE_ETIQUETA = {
  pequena: { larguraMm: 40, alturaMm: 25, qrMm: 21 },
  media: { larguraMm: 60, alturaMm: 35, qrMm: 30 },
  grande: { larguraMm: 90, alturaMm: 50, qrMm: 44 },
} as const;
export type TamanhoDeEtiqueta = keyof typeof TAMANHOS_DE_ETIQUETA;

/** O que a etiqueta leva do ativo. */
export interface AtivoDaEtiqueta {
  id: string;
  nome: string;
  codigoQr: string;
  localId: string;
  categoriaId: string | null;
  ativo: boolean;
  situacaoCadastro?: 'pendente' | 'aprovado' | 'recusado';
}

export interface FiltroDeEtiquetas {
  localId?: string | undefined;
  categoriaId?: string | undefined;
  /** Os ativos de uma importação (M2). */
  ids?: ReadonlySet<string> | undefined;
}

/** Os ativos que ganham etiqueta: os em uso e não recusados, do filtro, por nome. */
export function ativosDaFolha<A extends AtivoDaEtiqueta>(
  ativos: readonly A[],
  filtro: FiltroDeEtiquetas,
  idioma: string,
): A[] {
  return ativos
    .filter(
      (a) =>
        a.ativo &&
        a.situacaoCadastro !== 'recusado' &&
        (!filtro.localId || a.localId === filtro.localId) &&
        (!filtro.categoriaId || a.categoriaId === filtro.categoriaId) &&
        (!filtro.ids || filtro.ids.has(a.id)),
    )
    .sort((x, y) => x.nome.localeCompare(y.nome, idioma));
}

export function SeletorDeTamanho({
  valor,
  aoEscolher,
}: {
  valor: TamanhoDeEtiqueta;
  aoEscolher: (t: TamanhoDeEtiqueta) => void;
}) {
  const t = useT();
  return (
    <Campo rotulo={t('etiquetas.tamanho')}>
      {(p) => (
        <Selecao
          {...p}
          value={valor}
          onChange={(e) => aoEscolher(e.target.value as TamanhoDeEtiqueta)}
        >
          {(Object.keys(TAMANHOS_DE_ETIQUETA) as TamanhoDeEtiqueta[]).map((k) => (
            <option key={k} value={k}>
              {t('etiquetas.tamanho_opcao', {
                tamanho: k,
                largura: TAMANHOS_DE_ETIQUETA[k].larguraMm,
                altura: TAMANHOS_DE_ETIQUETA[k].alturaMm,
              })}
            </option>
          ))}
        </Selecao>
      )}
    </Campo>
  );
}

/** O botão de imprimir e o total da folha; não saem no papel. */
export function BarraDasEtiquetas({ total }: { total: number }) {
  const t = useT();
  useTemaClaroNaImpressao();
  return (
    <div className="hk-linha-de-botoes hk-nao-imprimir">
      <span className="hk-suave">{t('etiquetas.total', { total })}</span>
      <Botao variante="primario" disabled={total === 0} onClick={() => window.print()}>
        {t('etiquetas.imprimir')}
      </Botao>
    </div>
  );
}

export function FolhaDeEtiquetas({
  ativos,
  tamanho,
}: {
  /** nome null: a etiqueta reservada (M3), ainda sem ativo. */
  ativos: readonly { id: string; nome: string | null; codigoQr: string }[];
  tamanho: TamanhoDeEtiqueta;
}) {
  const t = useT();
  if (!URL_DO_TECNICO) return <MensagemDeErro>{t('admin.ativos.qr.sem_endereco')}</MensagemDeErro>;
  if (ativos.length === 0) return <MensagemVazia>{t('etiquetas.vazia')}</MensagemVazia>;
  const medidas = TAMANHOS_DE_ETIQUETA[tamanho];
  const estilo = {
    '--etiqueta-largura': `${medidas.larguraMm}mm`,
    '--etiqueta-altura': `${medidas.alturaMm}mm`,
    '--etiqueta-qr': `${medidas.qrMm}mm`,
  } as CSSProperties;
  const base = URL_DO_TECNICO;
  return (
    <div className="hk-etiquetas" style={estilo} aria-label={t('etiquetas.folha')}>
      {ativos.map((a) => {
        const svg = caminhoSvgDoQr(enderecoDoQr(base, a.codigoQr));
        return (
          <figure key={a.id} className="hk-etiqueta">
            <svg
              role="img"
              aria-label={t('admin.ativos.qr.imagem', { ativo: a.nome ?? a.codigoQr })}
              viewBox={`0 0 ${svg.lado} ${svg.lado}`}
              shapeRendering="crispEdges"
            >
              <rect width={svg.lado} height={svg.lado} fill="#ffffff" />
              <path d={svg.d} fill="#000000" />
            </svg>
            <figcaption>
              <span className="hk-etiqueta-nome">{a.nome ?? t('etiquetas.reservada')}</span>
              <span className="hk-etiqueta-codigo">{codigoQrLegivel(a.codigoQr)}</span>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/**
 * As etiquetas dos ativos criados por uma importação (M2): abre com o botão,
 * lê os ativos do hotel e fica só com os ids da gravação. Aberta, a tela da
 * importação some do papel (aoAbrir).
 */
export function EtiquetasDaImportacao({
  hotelId,
  ids,
  aoAbrir,
}: {
  hotelId: string;
  ids: readonly string[];
  aoAbrir: (aberta: boolean) => void;
}) {
  const t = useT();
  const { idioma } = useIdioma();
  const mensagemDeErro = useMensagemDeErro();
  const [ativos, setAtivos] = useState<AtivoDaEtiqueta[] | null>(null);
  const [aberta, setAberta] = useState(false);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const [tamanho, setTamanho] = useState<TamanhoDeEtiqueta>('media');

  async function abrir() {
    setAberta(true);
    aoAbrir(true);
    const r = await chamarApi<{ ativos: AtivoDaEtiqueta[] }>(`/api/v1/hoteis/${hotelId}/ativos`);
    if (!r.ok) return setErro(r.erro);
    setErro(null);
    setAtivos(ativosDaFolha(r.dados.ativos, { ids: new Set(ids) }, idioma));
  }

  function fechar() {
    setAberta(false);
    aoAbrir(false);
  }

  if (!aberta) {
    return (
      <div className="hk-linha-de-botoes">
        <Botao tamanho="pequeno" onClick={() => void abrir()}>
          {t('etiquetas.da_importacao', { total: ids.length })}
        </Botao>
      </div>
    );
  }
  return (
    <section aria-label={t('etiquetas.folha')}>
      <div className="hk-filtros hk-nao-imprimir">
        <SeletorDeTamanho valor={tamanho} aoEscolher={setTamanho} />
        <Botao tamanho="pequeno" onClick={fechar}>
          {t('etiquetas.fechar')}
        </Botao>
      </div>
      {erro ? <MensagemDeErro>{mensagemDeErro(erro)}</MensagemDeErro> : null}
      {ativos === null ? (
        erro ? null : (
          <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
        )
      ) : (
        <>
          <BarraDasEtiquetas total={ativos.length} />
          <FolhaDeEtiquetas ativos={ativos} tamanho={tamanho} />
        </>
      )}
    </section>
  );
}
