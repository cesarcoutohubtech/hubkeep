'use client';
// Detalhe do chamado (fase 1a, C7): o chamado, as OS dele com o aceite e a
// reabertura da OS concluída (C6: motivo obrigatório e, com ativo, a opção de
// equipamento parado), a triagem e a atribuição (C3: triar, prioridade, gerar,
// reatribuir e cancelar a OS, cancelar o chamado) e a linha do tempo. Quem
// pode cada ação é decidido pela API; a recusa volta como código e aparece
// traduzida. O histórico do chamado e o de cada OS (D1) mostram o antes e o
// depois de cada campo.
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { HistoricoDoRegistro } from '../../../../cliente/HistoricoDoRegistro';
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
} from '../../../../cliente/corretiva';
import {
  type CandidatosAResponsavel,
  type Responsavel,
  TriagemDoChamado,
} from '../../../../cliente/triagem';
import { useT } from '../../../../i18n/cliente';

type AvisoDaTela = { tipo: 'ok' } | { tipo: 'erro'; erro: ErroDaApi } | null;

export default function Chamado() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const [refs, setRefs] = useState<Referencias | null>(null);
  const [detalhe, setDetalhe] = useState<DetalheDoChamado | null>(null);
  const [eventos, setEventos] = useState<EventoDaLinhaDoTempo[] | null>(null);
  const [aviso, setAviso] = useState<AvisoDaTela>(null);
  const [paradaExistente, setParadaExistente] = useState(false);
  const [candidatos, setCandidatos] = useState<CandidatosAResponsavel | null>(null);

  const carregar = useCallback(async () => {
    const [d, l] = await Promise.all([
      chamarApi<DetalheDoChamado>(`/api/v1/chamados/${id}`),
      chamarApi<{ eventos: EventoDaLinhaDoTempo[] }>(`/api/v1/chamados/${id}/linha-do-tempo`),
    ]);
    if (d.ok) setDetalhe(d.dados);
    else setAviso({ tipo: 'erro', erro: d.erro });
    setEventos(l.ok ? l.dados.eventos : []);
    return d.ok ? d.dados.chamado.hotelId : null;
  }, [id]);

  useEffect(() => {
    void carregarReferencias().then(setRefs);
    void carregar().then(async (hotelId) => {
      if (!hotelId) return;
      const c = await chamarApi<CandidatosAResponsavel>(`/api/v1/hoteis/${hotelId}/equipes`);
      setCandidatos(c.ok ? c.dados : null);
    });
  }, [carregar]);

  /** Ação da triagem: POST na rota, com a versão vista; depois, recarrega. */
  async function enviar(caminho: string, corpo: Record<string, unknown>) {
    const r = await chamarApi<unknown>(caminho, { method: 'POST', body: JSON.stringify(corpo) });
    setParadaExistente(false);
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregar();
  }

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
      {detalhe !== null && (
        <TriagemDoChamado
          detalhe={detalhe}
          refs={refs}
          candidatos={candidatos}
          acoes={acoesDaTriagem(detalhe, enviar)}
        />
      )}
      {detalhe !== null && eventos !== null && <LinhaDoTempo eventos={eventos} />}
      {detalhe !== null && (
        // A versão na chave descarta o histórico já aberto depois de cada gravação.
        <HistoricoDoRegistro
          key={`${id}-${detalhe.chamado.versao}`}
          entidade="chamado"
          registroId={id}
        />
      )}
    </main>
  );
}

/** As rotas da C3 para cada formulário da triagem, na versão vista do chamado ou da OS. */
function acoesDaTriagem(
  detalhe: DetalheDoChamado,
  enviar: (caminho: string, corpo: Record<string, unknown>) => Promise<void>,
) {
  const { id, versao } = detalhe.chamado;
  const chamado = `/api/v1/chamados/${id}`;
  return {
    triar: (prioridadeId: string | null) =>
      void enviar(`${chamado}/triagem`, { versao, prioridadeId }),
    priorizar: (prioridadeId: string) =>
      void enviar(`${chamado}/prioridade`, { versao, prioridadeId }),
    gerarOs: (responsavel: Responsavel) => void enviar(`${chamado}/os`, { versao, responsavel }),
    cancelarChamado: (motivo: string) => void enviar(`${chamado}/cancelamento`, { versao, motivo }),
    reatribuirOs: (os: OsDoChamado, responsavel: Responsavel) =>
      void enviar(`/api/v1/os/${os.id}/reatribuicao`, { versao: os.versao, responsavel }),
    cancelarOs: (os: OsDoChamado, motivo: string) =>
      void enviar(`/api/v1/os/${os.id}/cancelamento`, { versao: os.versao, motivo }),
  };
}
