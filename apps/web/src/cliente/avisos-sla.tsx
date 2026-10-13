'use client';
// Avisos de SLA em aberto (fase 1c; ADR-043, M4): o selo de cada aviso, a
// lista do painel do hotel e o selo da ficha do chamado. Até a comunicação
// (item 5 da 1c), é aqui que a gestão vê o prazo em risco e o vencido. Quem
// vê é decidido pela API: na ficha, quem não é da gestão recebe a lista vazia
// e não vê nada.
import type { RespostaDoPainelDeSla, RespostaDosAvisosDoChamado, z } from '@hubkeep/contratos';
import { MensagemVazia, Selo } from '@hubkeep/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { chamarApi } from './api';
import { useT } from '../i18n/cliente';

export type AvisoNaTela = z.infer<typeof RespostaDosAvisosDoChamado>['avisos'][number];
export type ChamadoNoPainel = z.infer<typeof RespostaDoPainelDeSla>['chamados'][number];

const dataCurta = { dateStyle: 'short', timeStyle: 'short' } as const;

export function SeloDoAviso({ aviso }: { aviso: AvisoNaTela }) {
  const t = useT();
  const intl = useIntl();
  return (
    <Selo tom={aviso.nivel === 'vencido' ? 'vermelho' : 'ambar'}>
      {t('sla.aviso', { tipo: aviso.tipo, data: intl.formatDate(aviso.prazo, dataCurta) })}
    </Selo>
  );
}

export function SelosDosAvisos({ avisos }: { avisos: readonly AvisoNaTela[] }) {
  if (avisos.length === 0) return null;
  return (
    <div className="hk-linha-de-botoes" data-avisos-sla>
      {avisos.map((a) => (
        <SeloDoAviso key={a.tipo} aviso={a} />
      ))}
    </div>
  );
}

/** A lista do painel: cada chamado com o link para a ficha e os selos. */
export function ListaDoPainelDeSla({ chamados }: { chamados: readonly ChamadoNoPainel[] }) {
  const t = useT();
  if (chamados.length === 0) return <MensagemVazia>{t('sla.painel.vazio')}</MensagemVazia>;
  return (
    <ul className="hk-lista hk-itens">
      {chamados.map((c) => (
        <li key={c.chamadoId}>
          <div className="hk-pilha">
            <Link href={`/chamados/${c.chamadoId}`}>{c.descricao}</Link>
            <SelosDosAvisos avisos={c.avisos} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** O selo da ficha do chamado: lê os avisos pela API e some sem aviso. */
export function AvisosDoChamado({ chamadoId }: { chamadoId: string }) {
  const [avisos, setAvisos] = useState<AvisoNaTela[]>([]);
  useEffect(() => {
    void chamarApi<{ avisos: AvisoNaTela[] }>(`/api/v1/chamados/${chamadoId}/avisos-sla`).then(
      (r) => setAvisos(r.ok ? r.dados.avisos : []),
    );
  }, [chamadoId]);
  return <SelosDosAvisos avisos={avisos} />;
}
