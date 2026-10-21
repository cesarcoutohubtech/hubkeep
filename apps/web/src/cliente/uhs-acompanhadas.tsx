'use client';
// O cartão "UHs acompanhadas" da tela inicial (1c, seção 4 da paridade): para
// o proprietário ligado a UHs (condo-hotel), as UHs ativas de cada hotel, pela
// GET /api/v1/inicio/proprietario. Quem não é proprietário recebe 403, e o
// cartão não aparece; o dono do hotel inteiro também fica sem ele.
import type { RespostaDoInicioDoProprietario, z } from '@hubkeep/contratos';
import { Indicador, Indicadores, Painel } from '@hubkeep/ui';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { useT } from '../i18n/cliente';
import { chamarApi } from './api';

type Resposta = z.infer<typeof RespostaDoInicioDoProprietario>;

export function CartaoDasUhs({ hoteis }: { hoteis: Resposta['uhsAcompanhadas'] }) {
  const t = useT();
  const intl = useIntl();
  if (hoteis.length === 0) return null;
  return (
    <Painel titulo={t('inicio.proprietario.titulo')} dica={t('inicio.proprietario.dica')}>
      <Indicadores rotulo={t('inicio.proprietario.uhs')}>
        {hoteis.map((h) => (
          <Indicador
            key={h.hotelId}
            rotulo={t('inicio.proprietario.uhs')}
            valor={intl.formatNumber(h.uhs)}
            detalhe={h.hotelNome}
          />
        ))}
      </Indicadores>
    </Painel>
  );
}

/** Lê o cartão ao abrir; sem permissão (403) ou com erro, não aparece. */
export function UhsAcompanhadas() {
  const [hoteis, setHoteis] = useState<Resposta['uhsAcompanhadas']>([]);
  useEffect(() => {
    let vale = true;
    void chamarApi<Resposta>('/api/v1/inicio/proprietario').then((r) => {
      if (vale && r.ok) setHoteis(r.dados.uhsAcompanhadas);
    });
    return () => {
      vale = false;
    };
  }, []);
  return <CartaoDasUhs hoteis={hoteis} />;
}
