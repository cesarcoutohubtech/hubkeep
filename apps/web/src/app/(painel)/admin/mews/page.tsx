'use client';
// Mews V1: painel de integracao SOMENTE LEITURA, exclusivo do Admin do grupo.
// Nenhum botao de sincronizar, credencial, alteracao de UH/OS ou escrita no PMS.
import { type RespostaDoStatusMews, type z } from '@hubkeep/contratos';
import { MensagemDeErro, MensagemVazia, Painel, Tabela } from '@hubkeep/ui';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { useMensagemDeErro, useT } from '../../../../i18n/cliente';

type Status = z.infer<typeof RespostaDoStatusMews>;

export default function PainelAdministrativoMews() {
  const t = useT();
  const intl = useIntl();
  const mensagemDeErro = useMensagemDeErro();
  const [status, setStatus] = useState<Status | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);

  useEffect(() => {
    let ativo = true;
    void chamarApi<Status>('/api/v1/mews/status').then((resposta) => {
      if (!ativo) return;
      if (resposta.ok) {
        setStatus(resposta.dados);
        setErro(null);
      } else setErro(resposta.erro);
    });
    return () => { ativo = false; };
  }, []);

  const data = (valor: string | null) =>
    valor ? intl.formatDate(new Date(valor), { dateStyle: 'short', timeStyle: 'short' }) :
      t('admin.mews.sem_dado');

  if (erro) return <MensagemDeErro>{mensagemDeErro(erro)}</MensagemDeErro>;
  if (!status) return <MensagemVazia>{t('comum.carregando')}</MensagemVazia>;

  return (
    <Painel dica={t('admin.mews.descricao')}>
      {status.hoteis.length === 0 ? (
        <MensagemVazia>{t('admin.mews.sem_vinculos')}</MensagemVazia>
      ) : (
        <Tabela legenda={t('admin.mews.titulo')}>
          <thead>
            <tr>
              <th scope="col">{t('admin.mews.hotel')}</th>
              <th scope="col">{t('admin.mews.versao')}</th>
              <th scope="col">{t('admin.mews.incremental')}</th>
              <th scope="col">{t('admin.mews.varredura')}</th>
              <th scope="col">{t('admin.mews.concluido')}</th>
              <th scope="col">{t('admin.mews.recursos')}</th>
              <th scope="col">{t('admin.mews.fora_de_uso')}</th>
              <th scope="col">{t('admin.mews.uso_interno')}</th>
            </tr>
          </thead>
          <tbody>
            {status.hoteis.map((h) => (
              <tr key={h.hotelId}>
                <td><strong>{h.nome}</strong></td>
                <td>{h.versao ?? t('admin.mews.sem_checkpoint')}</td>
                <td>{data(h.ultimoUpdatedUtc)}</td>
                <td>{data(h.ultimoSweepUtc)}</td>
                <td>{data(h.concluidoEm)}</td>
                <td>{h.recursosAtivos}</td>
                <td>{h.bloqueiosOutOfOrder}</td>
                <td>{h.bloqueiosInternalUse}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </Painel>
  );
}
