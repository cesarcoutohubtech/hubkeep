'use client';
// Painel dos avisos de SLA do hotel (fase 1c; ADR-043, M4): os chamados com o
// prazo de atendimento ou de solução em risco ou vencido, os vencidos
// primeiro. Só a gestão do hotel; a recusa volta da API como código.
import { MensagemVazia, Painel } from '@hubkeep/ui';
import { useEffect, useState } from 'react';
import { chamarApi } from '../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../cliente/aviso';
import { type ChamadoNoPainel, ListaDoPainelDeSla } from '../../../cliente/avisos-sla';
import { SeletorDeHotel, useHoteis } from '../../../cliente/cadastro';
import { useT } from '../../../i18n/cliente';

export default function PainelDeSla() {
  const t = useT();
  const { hoteis, hotelId, setHotelId, erro: erroDosHoteis } = useHoteis();
  const [chamados, setChamados] = useState<ChamadoNoPainel[] | null>(null);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  useEffect(() => {
    if (!hotelId) return;
    setChamados(null);
    setAviso(null);
    void chamarApi<{ chamados: ChamadoNoPainel[] }>(`/api/v1/hoteis/${hotelId}/avisos-sla`).then(
      (r) => {
        if (r.ok) setChamados(r.dados.chamados);
        else setAviso({ tipo: 'erro', erro: r.erro });
      },
    );
  }, [hotelId]);

  return (
    <Painel>
      <div className="hk-filtros">
        <SeletorDeHotel
          rotulo={t('sla.painel.escolher_hotel')}
          hoteis={hoteis}
          valor={hotelId}
          aoEscolher={setHotelId}
        />
      </div>
      <Aviso aviso={erroDosHoteis ? { tipo: 'erro', erro: erroDosHoteis } : aviso} />
      {chamados === null ? (
        !aviso && <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : (
        <ListaDoPainelDeSla chamados={chamados} />
      )}
    </Painel>
  );
}
