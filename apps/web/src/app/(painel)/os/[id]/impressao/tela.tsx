'use client';
// A OS para imprimir (1c, item 9): GET /api/v1/os/{id}/impressao, as fotos da
// OS (as imagens, sem a assinatura, pela URL assinada da miniatura quando há)
// e a imagem da assinatura do aceite. Quem não vê a OS recebe o código da API.
import { MensagemVazia } from '@hubkeep/ui';
import { useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../../../cliente/api';
import { Aviso } from '../../../../../cliente/aviso';
import { useCodigosDoTenant } from '../../../../../cliente/codigos-manutencao';
import { type Referencias, carregarReferencias } from '../../../../../cliente/corretiva';
import {
  BarraDaImpressao,
  FolhaDaOs,
  type FotoNaFolha,
  type ImpressaoDaOs,
} from '../../../../../cliente/impressao-da-os';
import { useT } from '../../../../../i18n/cliente';

interface Anexo {
  id: string;
  tipo: string;
  temMiniatura: boolean;
  momento?: 'antes' | 'depois' | null;
  assinatura?: boolean;
  criadoEm: string;
}

const urlDe = async (id: string, miniatura: boolean) => {
  const r = await chamarApi<{ url: string }>(`/api/v1/anexos/${id}/url-de-download`, {
    method: 'POST',
    body: JSON.stringify({ miniatura }),
  });
  return r.ok ? r.dados.url : null;
};

export function TelaDaImpressao({ id }: { id: string }) {
  const t = useT();
  const { dados: codigos } = useCodigosDoTenant();
  const [refs, setRefs] = useState<Referencias | null>(null);
  const [impressao, setImpressao] = useState<ImpressaoDaOs | null>(null);
  const [fotos, setFotos] = useState<FotoNaFolha[] | null>(null);
  const [assinaturaUrl, setAssinaturaUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const [impressaEm] = useState(() => new Date());

  useEffect(() => {
    let vale = true;
    void carregarReferencias().then((r) => vale && setRefs(r));
    void chamarApi<ImpressaoDaOs>(`/api/v1/os/${id}/impressao`).then(async (r) => {
      if (!vale) return;
      if (!r.ok) return setErro(r.erro);
      setImpressao(r.dados);
      const assinaturaId = r.dados.os.assinaturaAceiteId;
      if (assinaturaId) void urlDe(assinaturaId, false).then((u) => vale && setAssinaturaUrl(u));
      const a = await chamarApi<{ anexos: Anexo[] }>(`/api/v1/os/${id}/anexos`);
      const imagens = a.ok
        ? a.dados.anexos.filter((x) => x.tipo.startsWith('image/') && !x.assinatura)
        : [];
      const lidas = await Promise.all(
        imagens.map(async (x) => {
          const url = await urlDe(x.id, x.temMiniatura);
          return url ? [{ id: x.id, url, momento: x.momento ?? null, criadoEm: x.criadoEm }] : [];
        }),
      );
      if (vale) setFotos(lidas.flat());
    });
    return () => {
      vale = false;
    };
  }, [id]);

  return (
    <>
      <BarraDaImpressao osId={id} />
      <Aviso aviso={erro ? { tipo: 'erro', erro } : null} />
      {impressao ? (
        <FolhaDaOs
          impressao={impressao}
          refs={refs}
          codigos={codigos}
          fotos={fotos}
          assinaturaUrl={assinaturaUrl}
          impressaEm={impressaEm}
        />
      ) : (
        !erro && <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      )}
    </>
  );
}
