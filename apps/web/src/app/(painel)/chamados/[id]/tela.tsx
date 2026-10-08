'use client';
// Detalhe do chamado (fase 1a, C7): o chamado, as OS dele com o aceite e a
// reabertura da OS concluída (C6: motivo obrigatório e, com ativo, a opção de
// equipamento parado), a triagem e a atribuição (C3: triar, prioridade, gerar,
// reatribuir e cancelar a OS, cancelar o chamado) e a linha do tempo. Quem
// pode cada ação é decidido pela API; a recusa volta como código e aparece
// traduzida. O histórico do chamado e o de cada OS (D1) mostram o antes e o
// depois de cada campo.
//
// P1c: a página (page.tsx, no servidor) entrega os dados iniciais, lidos pelos
// mesmos casos de uso da API numa transação só. Esta parte, no navegador,
// cuida das ações e recarrega pela API depois de cada uma. Sem dados iniciais
// (sem sessão ou sem grupo escolhido ainda), carrega pela API ao montar.
import { MensagemVazia, Nota, Painel } from '@hubkeep/ui';
import Link from 'next/link';
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
  CORRETIVA_VAZIA,
  carregarReferencias,
} from '../../../../cliente/corretiva';
import {
  type CandidatosAResponsavel,
  type Responsavel,
  TriagemDoChamado,
} from '../../../../cliente/triagem';
import { useT } from '../../../../i18n/cliente';
import type { TelaDoChamado as DadosDaTela } from '../../../../servidor/leituras-do-chamado';

type AvisoDaTela = { tipo: 'ok' } | { tipo: 'erro'; erro: ErroDaApi } | null;

export function TelaDoChamado({
  id,
  inicial,
  erroInicial,
}: {
  id: string;
  /** Lido no servidor; nulo quando a página não tinha sessão ou grupo. */
  inicial: DadosDaTela | null;
  /** Recusa da leitura no servidor (ex.: sem permissão), já como código. */
  erroInicial: ErroDaApi | null;
}) {
  const t = useT();
  const [refs, setRefs] = useState<Referencias | null>(
    inicial && { hoteis: inicial.hoteis, corretiva: inicial.corretiva ?? CORRETIVA_VAZIA },
  );
  const [detalhe, setDetalhe] = useState<DetalheDoChamado | null>(inicial?.detalhe ?? null);
  const [eventos, setEventos] = useState<EventoDaLinhaDoTempo[] | null>(inicial?.eventos ?? null);
  const [aviso, setAviso] = useState<AvisoDaTela>(
    erroInicial && { tipo: 'erro', erro: erroInicial },
  );
  const [paradaExistente, setParadaExistente] = useState(false);
  const [candidatos, setCandidatos] = useState<CandidatosAResponsavel | null>(
    inicial?.candidatos ?? null,
  );
  // Com os dados (ou a recusa) do servidor, nada a pedir ao montar.
  const veioDoServidor = inicial !== null || erroInicial !== null;

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
    if (veioDoServidor) return;
    void carregarReferencias().then(setRefs);
    void carregar().then(async (hotelId) => {
      if (!hotelId) return;
      const c = await chamarApi<CandidatosAResponsavel>(`/api/v1/hoteis/${hotelId}/equipes`);
      setCandidatos(c.ok ? c.dados : null);
    });
  }, [carregar, veioDoServidor]);

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
    <>
      <Link href="/chamados" className="hk-voltar">
        {t('corretiva.voltar_para_chamados')}
      </Link>
      <Aviso aviso={aviso} />
      {paradaExistente && <Nota tom="atencao">{t('corretiva.reabertura.parada_existente')}</Nota>}
      {detalhe === null ? (
        !aviso && <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : (
        <div className="hk-grade" data-colunas="2-1">
          <div className="hk-pilha">
            <ChamadoEmDetalhe
              detalhe={detalhe}
              refs={refs}
              aoAceitar={(os) => void aceitar(os)}
              aoReabrir={(os, p) => void reabrir(os, p)}
            />
            <TriagemDoChamado
              detalhe={detalhe}
              refs={refs}
              candidatos={candidatos}
              acoes={acoesDaTriagem(detalhe, enviar)}
            />
          </div>
          <div className="hk-pilha">
            {eventos !== null && <LinhaDoTempo eventos={eventos} />}
            <Painel>
              {/* A versão na chave descarta o histórico já aberto depois de cada gravação. */}
              <HistoricoDoRegistro
                key={`${id}-${detalhe.chamado.versao}`}
                entidade="chamado"
                registroId={id}
              />
            </Painel>
          </div>
        </div>
      )}
    </>
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
