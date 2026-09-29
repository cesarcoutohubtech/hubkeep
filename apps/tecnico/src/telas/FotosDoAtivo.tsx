// Fotos de um ativo no PWA (fase 1a, B4): tirar ou escolher a foto, que sai
// comprimida e com a miniatura gerada no aparelho, e ver as miniaturas das que
// já foram enviadas. Com rede; sem rede, a tela avisa (a fila de fotos entra
// com a execução da OS, C4).
import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { FotoListada, PortaDeFotos } from '../anexos/fotos';
import { useT } from '../i18n';
import { useMotivo } from './FilaDoDia';

function Miniatura({ foto, fotos }: { foto: FotoListada; fotos: PortaDeFotos }) {
  const t = useT();
  const intl = useIntl();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (foto.temMiniatura) void fotos.urlDaMiniatura(foto.id).then(setUrl);
  }, [foto, fotos]);
  const quando = intl.formatDate(foto.criadoEm, { dateStyle: 'short', timeStyle: 'short' });
  return url ? (
    <img src={url} alt={t('tecnico.fotos.miniatura', { quando })} width={96} />
  ) : (
    <small>{foto.nome ?? quando}</small>
  );
}

export function FotosDoAtivo(props: {
  ativo: { id: string; nome: string };
  online: boolean;
  fotos: PortaDeFotos;
  aoFechar: () => void;
}) {
  const t = useT();
  const motivo = useMotivo();
  const { ativo, online, fotos } = props;
  const [lista, setLista] = useState<FotoListada[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' } | { tipo: 'erro'; codigo: string } | null>(
    null,
  );

  const carregar = useCallback(async () => {
    if (online) setLista(await fotos.listar(ativo.id));
  }, [online, fotos, ativo.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function enviar(arquivo: File) {
    setEnviando(true);
    setAviso(null);
    try {
      const r = await fotos.enviar(ativo.id, arquivo, arquivo.name || null);
      setAviso(r.tipo === 'ok' ? { tipo: 'ok' } : { tipo: 'erro', codigo: r.codigo });
      await carregar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <header className="linha">
        <h2>{t('tecnico.fotos.titulo', { ativo: ativo.nome })}</h2>
        <button onClick={props.aoFechar}>{t('tecnico.fotos.fechar')}</button>
      </header>
      {!online ? (
        <p role="status">{t('tecnico.fotos.precisa_de_rede')}</p>
      ) : (
        <>
          <label style={{ display: 'grid', gap: 4 }}>
            {enviando ? t('tecnico.fotos.enviando') : t('tecnico.fotos.tirar')}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={enviando}
              onChange={(e) => {
                const arquivo = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (arquivo) void enviar(arquivo);
              }}
            />
          </label>
          {aviso && (
            <p role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
              {aviso.tipo === 'ok' ? t('tecnico.fotos.enviada') : motivo(aviso.codigo)}
            </p>
          )}
          {lista && lista.length === 0 && <p>{t('tecnico.fotos.vazio')}</p>}
          {lista && lista.length > 0 && (
            <ul className="linha">
              {lista.map((f) => (
                <li key={f.id}>
                  <Miniatura foto={f} fotos={fotos} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
