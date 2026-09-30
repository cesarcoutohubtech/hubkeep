'use client';
// Detalhe do chamado (fase 1a, C7): o chamado, as OS dele com o aceite e a
// reabertura da OS concluída (C6: motivo obrigatório e, com ativo, a opção de
// equipamento parado) e a linha do tempo. Quem pode aceitar ou reabrir é
// decidido pela API; a recusa volta como código e aparece traduzida.
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../cliente/api';
import {
  Aviso,
  ChamadoEmDetalhe,
  type DetalheDoChamado,
  type EventoDaLinhaDoTempo,
  LinhaDoTempo,
  type OsDoChamado,
  type PedidoDeReabertura,
  type Referencias,
  carregarReferencias,
} from '../../../cliente/corretiva';
import { useT } from '../../../i18n/cliente';

type AvisoDaTela = { tipo: 'ok' } | { tipo: 'erro'; erro: ErroDaApi } | null;

export default function Chamado() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const [refs, setRefs] = useState<Referencias | null>(null);
  const [detalhe, setDetalhe] = useState<DetalheDoChamado | null>(null);
  const [eventos, setEventos] = useState<EventoDaLinhaDoTempo[] | null>(null);
  const [aviso, setAviso] = useState<AvisoDaTela>(null);
  const [paradaExistente, setParadaExistente] = useState(false);

  const carregar = useCallback(async () => {
    const [d, l] = await Promise.all([
      chamarApi<DetalheDoChamado>(`/api/v1/chamados/${id}`),
      chamarApi<{ eventos: EventoDaLinhaDoTempo[] }>(`/api/v1/chamados/${id}/linha-do-tempo`),
    ]);
    if (d.ok) setDetalhe(d.dados);
    else setAviso({ tipo: 'erro', erro: d.erro });
    setEventos(l.ok ? l.dados.eventos : []);
  }, [id]);

  useEffect(() => {
    void carregarReferencias().then(setRefs);
    void carregar();
  }, [carregar]);

  async function aceitar(os: OsDoChamado) {
    const r = await chamarApi<unknown>(`/api/v1/os/${os.id}/aceite`, {
      method: 'POST',
      body: JSON.stringify({ versao: os.versao }),
    });
    setParadaExistente(false);
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregar();
  }

  async function reabrir(os: OsDoChamado, p: PedidoDeReabertura) {
    const r = await chamarApi<{ paradaId: string | null }>(`/api/v1/os/${os.id}/reabertura`, {
      method: 'POST',
      body: JSON.stringify({ versao: os.versao, motivo: p.motivo, paradoDesde: p.paradoDesde }),
    });
    setParadaExistente(r.ok && p.paradoDesde !== null && r.dados.paradaId === null);
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregar();
  }

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <a href="/chamados">{t('corretiva.voltar_para_chamados')}</a>
      <h1>{t('corretiva.chamado.titulo')}</h1>
      <Aviso aviso={aviso} />
      {paradaExistente && <p role="status">{t('corretiva.reabertura.parada_existente')}</p>}
      {detalhe === null ? (
        !aviso && <p>{t('comum.carregando')}</p>
      ) : (
        <ChamadoEmDetalhe
          detalhe={detalhe}
          refs={refs}
          aoAceitar={(os) => void aceitar(os)}
          aoReabrir={(os, p) => void reabrir(os, p)}
        />
      )}
      {detalhe !== null && eventos !== null && <LinhaDoTempo eventos={eventos} />}
    </main>
  );
}
