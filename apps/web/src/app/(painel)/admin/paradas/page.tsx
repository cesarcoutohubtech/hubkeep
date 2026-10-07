'use client';
// Paradas abertas com a OS concluída (fase 1a, C5; decisão do Cesar de
// 30/09/2026): o técnico concluiu e respondeu que o equipamento não voltou a
// funcionar, ou a resposta não chegou. O Admin do grupo, o Gestor CSC e o
// Gerente do hotel acompanham e encerram quando ele voltar; a API filtra os
// hotéis de cada um.
import { Botao, MensagemDeErro, MensagemVazia, Nota, Painel } from '@hubkeep/ui';
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
    <Painel dica={t('admin.paradas.descricao')}>
      {feito && <Nota tom="ok">{t('comum.feito')}</Nota>}
      {erro && <MensagemDeErro>{mensagemDeErro(erro)}</MensagemDeErro>}
      {paradas === null ? (
        !erro && <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : paradas.length === 0 ? (
        <MensagemVazia>{t('admin.paradas.vazio')}</MensagemVazia>
      ) : (
        <ul className="hk-lista">
          {paradas.map((p) => (
            <li key={p.id}>
              <div>
                <p className="hk-texto-longo">
                  {t('admin.paradas.linha', {
                    ativo: p.ativoNome,
                    inicio: intl.formatDate(p.inicio, { dateStyle: 'short', timeStyle: 'short' }),
                    duracao: duracao(p.tempoParadoMs),
                  })}
                </p>
                <p className="hk-suave">{t('admin.paradas.os_estado', { estado: p.osEstado })}</p>
              </div>
              <Botao tamanho="pequeno" onClick={() => void encerrar(p.id)}>
                {t('admin.ativos.acao.encerrar_parada')}
              </Botao>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}
