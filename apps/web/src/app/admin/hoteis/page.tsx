'use client';
// Administração de hotéis (fase 1a, A1): o que chegou do sistema hoteleiro, a
// importação para implantação e a ativação, que consome licença. Tela
// funcional, sem acabamento: o layout vem do protótipo validado com o cliente.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../cliente/api';
import { useMensagemDeErro, useT } from '../../../i18n/cliente';

interface HotelParaAtivacao {
  fonte: string;
  chave: string;
  nome: string | null;
  fuso: string | null;
  hotel: { id: string; status: string; nome: string; fuso: string } | null;
  diferencas: ('nome' | 'fuso')[];
}
interface Lista {
  hoteis: HotelParaAtivacao[];
  uso: {
    hoteis: { contratados: number; emUso: number };
    uhs: { contratadas: number; emUso: number };
  };
}

type Aviso = { tipo: 'ok'; texto: string } | { tipo: 'erro'; erro: ErroDaApi };

export default function HoteisDoSistemaHoteleiro() {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  const [lista, setLista] = useState<Lista | null>(null);
  const [erroDaLista, setErroDaLista] = useState<ErroDaApi | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [fusos, setFusos] = useState<Record<string, string>>({});
  const opcoesDeFuso = useMemo(() => Intl.supportedValuesOf('timeZone'), []);

  const carregar = useCallback(async () => {
    const r = await chamarApi<Lista>('/api/v1/hoteis/staging');
    if (r.ok) {
      setLista(r.dados);
      setErroDaLista(null);
    } else setErroDaLista(r.erro);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function importar(h: HotelParaAtivacao) {
    const fuso = fusos[`${h.fonte}|${h.chave}`] ?? h.fuso;
    const r = await chamarApi<{ hotelId: string }>('/api/v1/hoteis/importacoes', {
      method: 'POST',
      body: JSON.stringify({ fonte: h.fonte, chave: h.chave, fuso }),
    });
    setAviso(
      r.ok ? { tipo: 'ok', texto: t('admin.hoteis.importado') } : { tipo: 'erro', erro: r.erro },
    );
    await carregar();
  }

  async function ativar(hotelId: string) {
    const r = await chamarApi<{ uhsLiberadas: number; uhsPendentes: number }>(
      `/api/v1/hoteis/${hotelId}/ativacao`,
      { method: 'POST' },
    );
    setAviso(
      r.ok
        ? {
            tipo: 'ok',
            texto: t('admin.hoteis.ativado', {
              liberadas: r.dados.uhsLiberadas,
              pendentes: r.dados.uhsPendentes,
            }),
          }
        : { tipo: 'erro', erro: r.erro },
    );
    await carregar();
  }

  if (erroDaLista) return <p role="alert">{mensagemDeErro(erroDaLista)}</p>;
  if (!lista) return <p>{t('comum.carregando')}</p>;

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <a href="/">{t('comum.voltar')}</a>
      <h1>{t('admin.hoteis.titulo')}</h1>
      <p>
        {t('admin.hoteis.licenca', {
          hoteisEmUso: lista.uso.hoteis.emUso,
          hoteisContratados: lista.uso.hoteis.contratados,
          uhsEmUso: lista.uso.uhs.emUso,
          uhsContratadas: lista.uso.uhs.contratadas,
        })}
      </p>
      {aviso && (
        <p role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
          {aviso.tipo === 'ok' ? aviso.texto : mensagemDeErro(aviso.erro)}
        </p>
      )}
      {lista.hoteis.length === 0 ? (
        <p>{t('admin.hoteis.vazio')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('admin.hoteis.coluna.hotel')}</th>
              <th>{t('admin.hoteis.coluna.codigo')}</th>
              <th>{t('admin.hoteis.coluna.situacao')}</th>
              <th>{t('admin.hoteis.coluna.fuso')}</th>
              <th>{t('admin.hoteis.coluna.acao')}</th>
            </tr>
          </thead>
          <tbody>
            {lista.hoteis.map((h) => {
              const chave = `${h.fonte}|${h.chave}`;
              return (
                <tr key={chave}>
                  <td>
                    <span>{h.hotel?.nome ?? h.nome}</span>
                    {h.diferencas.length > 0 && (
                      <small style={{ display: 'block' }}>
                        {t('admin.hoteis.diferencas', {
                          campos: h.diferencas
                            .map((d) =>
                              t(
                                d === 'nome'
                                  ? 'admin.hoteis.campo.nome'
                                  : 'admin.hoteis.campo.fuso',
                              ),
                            )
                            .join(', '),
                        })}
                      </small>
                    )}
                  </td>
                  <td>
                    <code>{h.chave}</code>
                  </td>
                  <td>
                    {h.hotel
                      ? t('hotel.status', { status: h.hotel.status })
                      : t('admin.hoteis.nao_importado')}
                  </td>
                  <td>
                    {h.hotel ? (
                      h.hotel.fuso
                    ) : (
                      <select
                        aria-label={t('admin.hoteis.escolher_fuso')}
                        value={fusos[chave] ?? h.fuso ?? ''}
                        onChange={(e) => setFusos({ ...fusos, [chave]: e.target.value })}
                      >
                        <option value="">{t('admin.hoteis.escolher_fuso')}</option>
                        {opcoesDeFuso.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {!h.hotel && (
                      <button onClick={() => void importar(h)}>
                        {t('admin.hoteis.acao.importar')}
                      </button>
                    )}
                    {h.hotel && h.hotel.status !== 'ativo' && (
                      <button onClick={() => void ativar(h.hotel?.id ?? '')}>
                        {t('admin.hoteis.acao.ativar')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
