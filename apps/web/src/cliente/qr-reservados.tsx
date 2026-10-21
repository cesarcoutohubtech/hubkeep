'use client';
// Códigos de QR reservados (fase 1b, M3; decisão 21): gerar um lote para o
// hotel antes do cadastro, escolher o lote e imprimir as etiquetas dele (por
// padrão, só os códigos ainda sem ativo). O ativo nasce depois, pelo PWA, a
// partir da etiqueta; a etiqueta reservada serve só para ativo novo. Quem pode
// gerar decide o servidor; a tela mostra a recusa.
import { Botao, Campo, Entrada, MensagemVazia, Selecao } from '@hubkeep/ui';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { chamarApi } from './api';
import { Aviso, type AvisoDeAcao } from './aviso';
import { BarraDasEtiquetas, FolhaDeEtiquetas, type TamanhoDeEtiqueta } from './etiquetas';
import { useT } from '../i18n/cliente';

export interface CodigoReservado {
  codigo: string;
  loteId: string;
  criadoEm: string;
  ligado: boolean;
}

export interface LoteDeCodigos {
  loteId: string;
  criadoEm: string;
  total: number;
  livres: number;
}

/** Os lotes, na ordem em que os códigos vêm (o mais novo primeiro). */
export function lotesDosCodigos(codigos: readonly CodigoReservado[]): LoteDeCodigos[] {
  const lotes = new Map<string, LoteDeCodigos>();
  for (const c of codigos) {
    const l = lotes.get(c.loteId) ?? {
      loteId: c.loteId,
      criadoEm: c.criadoEm,
      total: 0,
      livres: 0,
    };
    l.total += 1;
    if (!c.ligado) l.livres += 1;
    lotes.set(c.loteId, l);
  }
  return [...lotes.values()];
}

/** As etiquetas do lote: o código, sem nome (ainda não há ativo). */
export function etiquetasDoLote(
  codigos: readonly CodigoReservado[],
  loteId: string,
  soLivres: boolean,
) {
  return codigos
    .filter((c) => c.loteId === loteId && (!soLivres || !c.ligado))
    .map((c) => ({ id: c.codigo, nome: null, codigoQr: c.codigo }));
}

export function CodigosReservados({
  hotelId,
  tamanho,
}: {
  hotelId: string;
  tamanho: TamanhoDeEtiqueta;
}) {
  const t = useT();
  const intl = useIntl();
  const [codigos, setCodigos] = useState<CodigoReservado[] | null>(null);
  const [loteId, setLoteId] = useState('');
  const [soLivres, setSoLivres] = useState(true);
  const [quantidade, setQuantidade] = useState('50');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamarApi<{ codigos: CodigoReservado[] }>(
      `/api/v1/hoteis/${hotelId}/qr-reservados`,
    );
    if (!r.ok) return setAviso({ tipo: 'erro', erro: r.erro });
    setCodigos(r.dados.codigos);
    setLoteId((atual) =>
      r.dados.codigos.some((c) => c.loteId === atual) ? atual : (r.dados.codigos[0]?.loteId ?? ''),
    );
  }, [hotelId]);

  useEffect(() => {
    setCodigos(null);
    setAviso(null);
    void carregar();
  }, [carregar]);

  async function gerar(ev: FormEvent) {
    ev.preventDefault();
    setOcupado(true);
    try {
      const r = await chamarApi<{ loteId: string; codigos: string[] }>(
        `/api/v1/hoteis/${hotelId}/qr-reservados`,
        { method: 'POST', body: JSON.stringify({ quantidade: Number(quantidade) }) },
      );
      if (!r.ok) return setAviso({ tipo: 'erro', erro: r.erro });
      setAviso({
        tipo: 'ok',
        texto: t('etiquetas.reservados.gerados', { total: r.dados.codigos.length }),
      });
      setLoteId(r.dados.loteId);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  const lotes = useMemo(() => lotesDosCodigos(codigos ?? []), [codigos]);
  const daFolha = useMemo(
    () => etiquetasDoLote(codigos ?? [], loteId, soLivres),
    [codigos, loteId, soLivres],
  );

  return (
    <>
      <div className="hk-nao-imprimir">
        <p className="hk-suave">{t('etiquetas.reservados.dica')}</p>
        <form className="hk-filtros" onSubmit={(ev) => void gerar(ev)}>
          <Campo rotulo={t('etiquetas.reservados.quantidade')}>
            {(p) => (
              <Entrada
                {...p}
                type="number"
                min={1}
                max={500}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            )}
          </Campo>
          <Botao type="submit" disabled={ocupado || quantidade === ''}>
            {t('etiquetas.reservados.gerar')}
          </Botao>
        </form>
        <Aviso aviso={aviso} />
      </div>
      {codigos === null ? (
        <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : lotes.length === 0 ? (
        <MensagemVazia>{t('etiquetas.reservados.vazio')}</MensagemVazia>
      ) : (
        <>
          <div className="hk-filtros hk-nao-imprimir">
            <Campo rotulo={t('etiquetas.reservados.lote')}>
              {(p) => (
                <Selecao {...p} value={loteId} onChange={(e) => setLoteId(e.target.value)}>
                  {lotes.map((l) => (
                    <option key={l.loteId} value={l.loteId}>
                      {t('etiquetas.reservados.lote_opcao', {
                        data: intl.formatDate(l.criadoEm, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }),
                        total: l.total,
                        livres: l.livres,
                      })}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
            <label className="hk-marcar">
              <input
                type="checkbox"
                checked={soLivres}
                onChange={(e) => setSoLivres(e.target.checked)}
              />
              {t('etiquetas.reservados.so_livres')}
            </label>
          </div>
          <BarraDasEtiquetas total={daFolha.length} />
          <FolhaDeEtiquetas ativos={daFolha} tamanho={tamanho} />
        </>
      )}
    </>
  );
}
