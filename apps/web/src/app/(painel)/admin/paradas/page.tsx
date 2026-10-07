'use client';
// Paradas abertas com a OS concluída (fase 1a, C5; decisão do Cesar de
// 30/09/2026): o técnico concluiu e respondeu que o equipamento não voltou a
// funcionar, ou a resposta não chegou. O Admin do grupo, o Gestor CSC e o
// Gerente do hotel acompanham e encerram quando ele voltar; a API filtra os
// hotéis de cada um. Tela funcional, sem acabamento.
import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { useMensagemDeErro, useT } from '../../../../i18n/cliente';

interface ParadaPendente {
  id: string;
  hotelId: string;
  ativoId: string;
  ativoNome: string;
  chamadoId: string;
  osId: string;
  osEstado: 'concluida' | 'aceita';
  inicio: string;
  tempoParadoMs: number;
}

export default function ParadasPendentes() {
  const t = useT();
  const intl = useIntl();
  const mensagemDeErro = useMensagemDeErro();
  const [paradas, setParadas] = useState<ParadaPendente[] | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const [feito, setFeito] = useState(false);

  const carregar = useCallback(async () => {
    const r = await chamarApi<{ paradas: ParadaPendente[] }>(
      '/api/v1/paradas/abertas-com-os-concluida',
    );
    if (r.ok) setParadas(r.dados.paradas);
    else setErro(r.erro);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function encerrar(id: string) {
    const r = await chamarApi<unknown>(`/api/v1/paradas/${id}/encerramento`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setFeito(r.ok);
    setErro(r.ok ? null : r.erro);
    await carregar();
  }

  const duracao = (ms: number) => {
    const minutos = Math.floor(ms / 60_000);
    return t('admin.ativos.parada.duracao', {
      horas: Math.floor(minutos / 60),
      minutos: minutos % 60,
    });
  };

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <a href="/">{t('comum.voltar')}</a>
      <h1>{t('admin.paradas.titulo')}</h1>
      <p>{t('admin.paradas.descricao')}</p>
      {feito && <p role="status">{t('comum.feito')}</p>}
      {erro && <p role="alert">{mensagemDeErro(erro)}</p>}
      {paradas === null ? (
        !erro && <p>{t('comum.carregando')}</p>
      ) : paradas.length === 0 ? (
        <p>{t('admin.paradas.vazio')}</p>
      ) : (
        <ul>
          {paradas.map((p) => (
            <li key={p.id} style={{ display: 'grid', gap: 4 }}>
              <span>
                {t('admin.paradas.linha', {
                  ativo: p.ativoNome,
                  inicio: intl.formatDate(p.inicio, { dateStyle: 'short', timeStyle: 'short' }),
                  duracao: duracao(p.tempoParadoMs),
                })}
              </span>
              <small>{t('admin.paradas.os_estado', { estado: p.osEstado })}</small>
              <button type="button" onClick={() => void encerrar(p.id)}>
                {t('admin.ativos.acao.encerrar_parada')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
