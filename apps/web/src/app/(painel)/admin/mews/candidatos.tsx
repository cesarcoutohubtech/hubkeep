'use client';
// Pré-seleção informativa de hotel DEMO. Sem botão de vínculo, sync ou escrita.
import { RespostaDeCandidatosMews, type z } from '@hubkeep/contratos';
import { MensagemDeErro, MensagemVazia, Painel, Tabela } from '@hubkeep/ui';
import { useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { useMensagemDeErro, useT } from '../../../../i18n/cliente';

type Lista = z.infer<typeof RespostaDeCandidatosMews>;

export function CandidatosMewsDemo() {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  const [lista, setLista] = useState<Lista | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  useEffect(() => {
    let ativo = true;
    void chamarApi<Lista>('/api/v1/mews/candidatos').then((r) => {
      if (!ativo) return;
      if (r.ok) {
        setLista(r.dados);
        setErro(null);
      } else setErro(r.erro);
    });
    return () => { ativo = false; };
  }, []);

  if (erro) return <MensagemDeErro>{mensagemDeErro(erro)}</MensagemDeErro>;
  return (
    <Painel dica={t('admin.mews.candidatos.descricao')}>
      {!lista ? (
        <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : lista.hoteis.length === 0 ? (
        <MensagemVazia>{t('admin.mews.candidatos.vazio')}</MensagemVazia>
      ) : (
        <>
          <Tabela legenda={t('admin.mews.candidatos.titulo')}>
            <thead>
              <tr>
                <th scope="col">{t('admin.mews.hotel')}</th>
                <th scope="col">{t('admin.mews.candidatos.codigo')}</th>
                <th scope="col">{t('admin.mews.candidatos.situacao')}</th>
                <th scope="col">{t('admin.mews.candidatos.vinculo')}</th>
                <th scope="col">{t('admin.mews.candidatos.aptidao')}</th>
              </tr>
            </thead>
            <tbody>
              {lista.hoteis.map((h) => (
                <tr key={h.hotelId}>
                  <td><strong>{h.nome}</strong></td>
                  <td><code>{h.hotelId}</code></td>
                  <td>{t('hotel.status', { status: h.status })}</td>
                  <td>{t('admin.mews.candidatos.estado', { estado: h.vinculo })}</td>
                  <td>{h.candidato
                    ? t('admin.mews.candidatos.para_revisao')
                    : t('admin.mews.candidatos.nao_apto')}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
          {lista.truncado && <p>{t('admin.mews.candidatos.truncado')}</p>}
        </>
      )}
    </Painel>
  );
}
