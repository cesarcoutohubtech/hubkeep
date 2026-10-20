'use client';
// Importação de ativos por planilha (fase 1b, M2): baixar o modelo (as
// colunas fixas e uma por campo estendido das categorias), escolher o CSV,
// ver a prévia linha a linha e importar as linhas novas. A análise e as
// regras são do servidor; a tela só lê o arquivo, chama e mostra. O teste da
// tela entra com o resultado já pronto (ResultadoDaPlanilha).
import { LIMITES_DA_IMPORTACAO, lerDefinicoes, modeloDaPlanilha } from '@hubkeep/dominio';
import { separadorDeCsv } from '@hubkeep/i18n';
import {
  Botao,
  Campo,
  Entrada,
  MensagemVazia,
  Nota,
  Painel,
  Selo,
  type TomDeSelo,
} from '@hubkeep/ui';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { chamarApi } from './api';
import { Aviso, type AvisoDeAcao } from './aviso';
import { SeletorDeHotel, useHoteis } from './cadastro';
import { EtiquetasDaImportacao } from './etiquetas';
import { useMensagemDeErro, useT } from '../i18n/cliente';

export type SituacaoDaLinhaNaTela = 'nova' | 'criada' | 'ja_importada' | 'invalida';

export interface LinhaDaPlanilha {
  numero: number;
  situacao: SituacaoDaLinhaNaTela;
  nome: string | null;
  erros: { codigo: string; coluna: string | null; parametros: Record<string, unknown> }[];
}

export interface ResumoDaPlanilha {
  /** Na prévia, as novas; depois da gravação, as criadas. */
  prontas: number;
  jaImportadas: number;
  invalidas: number;
}

const TOM: Record<SituacaoDaLinhaNaTela, TomDeSelo> = {
  nova: 'azul',
  criada: 'verde',
  ja_importada: 'cinza',
  invalida: 'vermelho',
};

/** O resumo e as linhas que pedem atenção (as já importadas e as com erro). */
export function ResultadoDaPlanilha({
  gravada,
  resumo,
  linhas,
}: {
  /** false: prévia; true: resultado da gravação. */
  gravada: boolean;
  resumo: ResumoDaPlanilha;
  linhas: readonly LinhaDaPlanilha[];
}) {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  const comAtencao = linhas.filter(
    (l) => l.situacao === 'invalida' || l.situacao === 'ja_importada',
  );
  return (
    <>
      <Nota tom={resumo.invalidas > 0 ? 'atencao' : 'ok'}>
        {t(gravada ? 'admin.importacao.resumo_gravacao' : 'admin.importacao.resumo_previa', {
          prontas: resumo.prontas,
          jaImportadas: resumo.jaImportadas,
          invalidas: resumo.invalidas,
        })}
      </Nota>
      {comAtencao.length === 0 ? (
        <MensagemVazia>{t('admin.importacao.sem_problemas')}</MensagemVazia>
      ) : (
        <ul className="hk-lista hk-itens">
          {comAtencao.map((l) => (
            <li key={l.numero}>
              <div className="hk-item-cabecalho">
                <strong>{t('admin.importacao.linha', { numero: l.numero })}</strong>
                {l.nome ? <span>{l.nome}</span> : null}
                <Selo tom={TOM[l.situacao]}>
                  {t('admin.importacao.situacao', { situacao: l.situacao })}
                </Selo>
              </div>
              {l.erros.length > 0 ? (
                <ul className="hk-suave">
                  {l.erros.map((e, i) => (
                    <li key={i}>
                      {e.coluna
                        ? t('admin.importacao.coluna', {
                            coluna: e.coluna,
                            mensagem: mensagemDeErro(e),
                          })
                        : mensagemDeErro(e)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

interface RespostaDaPrevia {
  linhas: LinhaDaPlanilha[];
  novas: number;
  jaImportadas: number;
  invalidas: number;
}
interface RespostaDaGravacao {
  linhas: (LinhaDaPlanilha & { ativoId?: string | null })[];
  criadas: number;
  jaImportadas: number;
  invalidas: number;
}

export function ImportacaoDeAtivos() {
  const t = useT();
  const intl = useIntl();
  const { hoteis, hotelId, setHotelId, erro: erroDosHoteis } = useHoteis();
  const [csv, setCsv] = useState<string | null>(null);
  const [previa, setPrevia] = useState<RespostaDaPrevia | null>(null);
  const [gravacao, setGravacao] = useState<RespostaDaGravacao | null>(null);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);

  async function baixarModelo() {
    const r = await chamarApi<{ categorias: { ativa: boolean; campos: unknown }[] }>(
      '/api/v1/categorias-de-ativo',
    );
    if (!r.ok) return setAviso({ tipo: 'erro', erro: r.erro });
    const categorias = r.dados.categorias
      .filter((c) => c.ativa)
      .map((c) => ({ definicoes: lerDefinicoes(c.campos) }));
    const conteudo = modeloDaPlanilha(categorias, separadorDeCsv(intl.locale));
    const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = t('admin.importacao.modelo_arquivo');
    a.click();
    URL.revokeObjectURL(url);
  }

  async function escolher(arquivo: File | undefined) {
    setPrevia(null);
    setGravacao(null);
    setImprimindo(false);
    setAviso(null);
    setCsv(arquivo ? await arquivo.text() : null);
  }

  async function enviar<T>(caminho: string): Promise<T | null> {
    if (!hotelId || csv === null) return null;
    setOcupado(true);
    try {
      const r = await chamarApi<T>(caminho, { method: 'POST', body: JSON.stringify({ csv }) });
      if (!r.ok) {
        setAviso({ tipo: 'erro', erro: r.erro });
        return null;
      }
      setAviso(null);
      return r.dados;
    } finally {
      setOcupado(false);
    }
  }

  async function prever() {
    setGravacao(null);
    setPrevia(
      await enviar<RespostaDaPrevia>(`/api/v1/hoteis/${hotelId}/importacao-de-ativos/previa`),
    );
  }

  async function importar() {
    const r = await enviar<RespostaDaGravacao>(`/api/v1/hoteis/${hotelId}/importacao-de-ativos`);
    if (r) {
      setPrevia(null);
      setImprimindo(false);
      setGravacao(r);
    }
  }

  const criados = (gravacao?.linhas ?? []).flatMap((l) =>
    l.situacao === 'criada' && l.ativoId ? [l.ativoId] : [],
  );

  return (
    <Painel>
      <div className={imprimindo ? 'hk-nao-imprimir' : undefined}>
        <div className="hk-filtros">
          <SeletorDeHotel
            rotulo={t('admin.importacao.escolher_hotel')}
            hoteis={hoteis}
            valor={hotelId}
            aoEscolher={(id) => {
              setHotelId(id);
              setPrevia(null);
              setGravacao(null);
              setImprimindo(false);
            }}
          />
        </div>
        <p className="hk-suave">
          {t('admin.importacao.dica', {
            linhas: LIMITES_DA_IMPORTACAO.linhas,
            mb: LIMITES_DA_IMPORTACAO.bytes / (1024 * 1024),
          })}
        </p>
        <div className="hk-linha-de-botoes">
          <Botao tamanho="pequeno" onClick={() => void baixarModelo()}>
            {t('admin.importacao.baixar_modelo')}
          </Botao>
        </div>
        <Campo rotulo={t('admin.importacao.arquivo')}>
          {(p) => (
            <Entrada
              {...p}
              type="file"
              accept=".csv,text/csv"
              onChange={(ev) => void escolher(ev.currentTarget.files?.[0])}
            />
          )}
        </Campo>
        <div className="hk-linha-de-botoes">
          <Botao
            tamanho="pequeno"
            disabled={!hotelId || csv === null || ocupado}
            onClick={() => void prever()}
          >
            {t('admin.importacao.prever')}
          </Botao>
          {previa && previa.novas > 0 ? (
            <Botao
              tamanho="pequeno"
              variante="primario"
              disabled={ocupado}
              onClick={() => void importar()}
            >
              {t('admin.importacao.importar', { novas: previa.novas })}
            </Botao>
          ) : null}
        </div>
        <Aviso aviso={erroDosHoteis ? { tipo: 'erro', erro: erroDosHoteis } : aviso} />
        {ocupado ? <MensagemVazia>{t('comum.carregando')}</MensagemVazia> : null}
        {previa ? (
          <ResultadoDaPlanilha
            gravada={false}
            resumo={{
              prontas: previa.novas,
              jaImportadas: previa.jaImportadas,
              invalidas: previa.invalidas,
            }}
            linhas={previa.linhas}
          />
        ) : null}
        {gravacao ? (
          <ResultadoDaPlanilha
            gravada
            resumo={{
              prontas: gravacao.criadas,
              jaImportadas: gravacao.jaImportadas,
              invalidas: gravacao.invalidas,
            }}
            linhas={gravacao.linhas}
          />
        ) : null}
      </div>
      {hotelId && criados.length > 0 ? (
        <EtiquetasDaImportacao hotelId={hotelId} ids={criados} aoAbrir={setImprimindo} />
      ) : null}
    </Painel>
  );
}
