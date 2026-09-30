'use client';
// Histórico de um hotel, local, ativo, chamado ou OS (fase 1a, D1): quem
// gravou, quando, a ação e o antes e o depois de cada campo, pela rota
// GET /api/v1/auditoria. Carrega só quando pedido, como os anexos. A ação, o
// campo e os valores conhecidos (estado, situação do cadastro, tipo de local)
// saem do catálogo; os ids viram o nome que a API devolve em `referencias`, e
// o que quem vê não lê aparece como "sem acesso". Tela funcional, sem
// acabamento: o layout vem do protótipo.
import type { RespostaDoHistorico, z } from '@hubkeep/contratos';
import { REFERENCIA_DO_CAMPO } from '@hubkeep/dominio';
import { type Chave, type Idioma, resolverNome } from '@hubkeep/i18n';
import { useCallback, useState } from 'react';
import { useIntl } from 'react-intl';
import { type ErroDaApi, chamarApi } from './api';
import { useIdioma, useMensagemDeErro, useT } from '../i18n/cliente';

export type Historico = z.infer<typeof RespostaDoHistorico>;
type Entidade = Historico['entidade'];
type Mudanca = Historico['eventos'][number]['mudancas'][number];
type Valor = Mudanca['antes'];

const ROTULO_DA_ACAO = {
  hotel: 'auditoria.acao.hotel',
  local: 'auditoria.acao.local',
  ativo: 'auditoria.acao.ativo',
  chamado: 'corretiva.linha_do_tempo.chamado',
  os: 'corretiva.linha_do_tempo.os',
} as const satisfies Record<Entidade, Chave>;

/** Campos cujo valor é um código com nome no catálogo. */
const VALOR_DO_CATALOGO: Record<string, Chave> = {
  estado: 'auditoria.valor.estado',
  estadoDoChamado: 'auditoria.valor.estado',
  status: 'auditoria.valor.status',
  tipo: 'auditoria.valor.tipo',
};

/** Prefixo do nome padrão no catálogo, para situação, prioridade e categoria (ADR-027). */
const PADRAO_NO_CATALOGO = {
  situacao: 'situacao.padrao',
  prioridade: 'prioridade.padrao',
  categoria: 'categoria_ativo.padrao',
} as const;

const DATA_E_HORA = { dateStyle: 'short', timeStyle: 'short' } as const;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function useFormatarValor(historico: Historico) {
  const t = useT();
  const intl = useIntl();
  const { idioma } = useIdioma();
  const idiomaPadrao = historico.idiomaPadrao as Idioma;

  const nomeDaReferencia = (id: string): string => {
    const r = historico.referencias[id];
    if (!r) return t('auditoria.sem_acesso');
    if ('nome' in r) return r.nome;
    const chave = r.chavePadrao ? `${PADRAO_NO_CATALOGO[r.tipo]}.${r.chavePadrao}` : null;
    const doCatalogo = chave && chave in intl.messages ? t(chave as Chave) : null;
    return resolverNome(r.nomes, idioma, { doCatalogo, idiomaPadrao }) ?? t('auditoria.sem_acesso');
  };

  return (m: Mudanca, v: Valor): string => {
    if (v === null) return t('auditoria.sem_valor');
    if (typeof v === 'boolean') return v ? t('auditoria.sim') : t('auditoria.nao');
    if (typeof v === 'number') return intl.formatNumber(v);
    if (m.chave === null) {
      const doCatalogo = VALOR_DO_CATALOGO[m.campo];
      if (doCatalogo) return t(doCatalogo, { valor: v });
      if (m.campo in REFERENCIA_DO_CAMPO) return nomeDaReferencia(v);
    }
    if (DATA_ISO.test(v) && !Number.isNaN(Date.parse(v))) return intl.formatDate(v, DATA_E_HORA);
    return v;
  };
}

/** O histórico já carregado: uma linha por gravação, com as mudanças embaixo. */
export function ListaDoHistorico({ historico }: { historico: Historico }) {
  const t = useT();
  const intl = useIntl();
  const formatar = useFormatarValor(historico);
  const rotuloDoCampo = (m: Mudanca) => {
    const campo = t('auditoria.campo', { campo: m.campo });
    return m.chave === null ? campo : t('auditoria.campo_com_chave', { campo, chave: m.chave });
  };
  const quem = (e: Historico['eventos'][number]) =>
    e.usuarioId === null
      ? t('auditoria.por_sistema')
      : e.usuarioNome === null
        ? t('auditoria.por_outra_pessoa')
        : t('auditoria.por', { nome: e.usuarioNome });

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <strong>{t('auditoria.titulo')}</strong>
      {historico.eventos.length === 0 ? (
        <small>{t('auditoria.vazio')}</small>
      ) : (
        <ol style={{ margin: 0, display: 'grid', gap: 6 }}>
          {historico.eventos.map((e) => (
            <li key={e.id} style={{ display: 'grid' }}>
              <span>
                {t('auditoria.evento', {
                  quando: intl.formatDate(e.em, DATA_E_HORA),
                  acao: t(ROTULO_DA_ACAO[historico.entidade], { acao: e.acao }),
                })}
              </span>
              <small>{quem(e)}</small>
              {e.mudancas.length > 0 && (
                <ul style={{ margin: 0 }}>
                  {e.mudancas.map((m) => (
                    <li key={`${m.campo}.${m.chave ?? ''}`}>
                      <small>
                        {t('auditoria.mudanca', {
                          campo: rotuloDoCampo(m),
                          antes: formatar(m, m.antes),
                          depois: formatar(m, m.depois),
                        })}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function HistoricoDoRegistro({
  entidade,
  registroId,
}: {
  entidade: Entidade;
  registroId: string;
}) {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  const [historico, setHistorico] = useState<Historico | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);

  const carregar = useCallback(async () => {
    const consulta = new URLSearchParams({ entidade, registroId });
    const r = await chamarApi<Historico>(`/api/v1/auditoria?${consulta.toString()}`);
    if (r.ok) setHistorico(r.dados);
    else setErro(r.erro);
  }, [entidade, registroId]);

  if (historico === null) {
    return (
      <div>
        <button type="button" onClick={() => void carregar()}>
          {t('auditoria.ver')}
        </button>
        {erro && <small role="alert">{mensagemDeErro(erro)}</small>}
      </div>
    );
  }
  return <ListaDoHistorico historico={historico} />;
}
