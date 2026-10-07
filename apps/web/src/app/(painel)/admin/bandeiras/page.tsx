'use client';
// Bandeiras (fase 1a, A2): criar, renomear, desativar e a bandeira de cada
// hotel. Tela funcional, sem acabamento: o layout vem do protótipo validado.
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { useMensagemDeErro, useT } from '../../../../i18n/cliente';

interface Bandeira {
  id: string;
  nome: string;
  ativa: boolean;
}
interface Hotel {
  id: string;
  nome: string;
  bandeiraId: string | null;
}

type Aviso = { tipo: 'ok' } | { tipo: 'erro'; erro: ErroDaApi };

export default function Bandeiras() {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  const [bandeiras, setBandeiras] = useState<Bandeira[] | null>(null);
  const [hoteis, setHoteis] = useState<Hotel[]>([]);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const carregar = useCallback(async () => {
    const [b, h] = await Promise.all([
      chamarApi<{ bandeiras: Bandeira[] }>('/api/v1/bandeiras'),
      chamarApi<{ hoteis: Hotel[] }>('/api/v1/hoteis'),
    ]);
    if (b.ok) setBandeiras(b.dados.bandeiras);
    else setAviso({ tipo: 'erro', erro: b.erro });
    if (h.ok) setHoteis(h.dados.hoteis);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function executar(caminho: string, init: RequestInit) {
    const r = await chamarApi<unknown>(caminho, init);
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregar();
  }

  function criar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const nome = String(new FormData(ev.currentTarget).get('nome') ?? '');
    void executar('/api/v1/bandeiras', { method: 'POST', body: JSON.stringify({ nome }) });
  }

  if (!bandeiras) {
    return aviso?.tipo === 'erro' ? (
      <p role="alert">{mensagemDeErro(aviso.erro)}</p>
    ) : (
      <p>{t('comum.carregando')}</p>
    );
  }

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <a href="/">{t('comum.voltar')}</a>
      <h1>{t('admin.bandeiras.titulo')}</h1>
      {aviso && (
        <p role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
          {aviso.tipo === 'ok' ? t('comum.feito') : mensagemDeErro(aviso.erro)}
        </p>
      )}

      <form onSubmit={criar} style={{ display: 'flex', gap: 8 }}>
        <input name="nome" placeholder={t('admin.bandeiras.campo.nome')} required />
        <button type="submit">{t('admin.bandeiras.acao.criar')}</button>
      </form>

      {bandeiras.length === 0 ? (
        <p>{t('admin.bandeiras.vazio')}</p>
      ) : (
        <ul style={{ display: 'grid', gap: 8 }}>
          {bandeiras.map((b) => (
            <li
              key={b.id}
              style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
            >
              <form
                style={{ display: 'flex', gap: 4 }}
                onSubmit={(ev) => {
                  ev.preventDefault();
                  const nome = String(new FormData(ev.currentTarget).get('nome') ?? '');
                  void executar(`/api/v1/bandeiras/${b.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ nome }),
                  });
                }}
              >
                <input
                  name="nome"
                  defaultValue={b.nome}
                  aria-label={t('admin.bandeiras.campo.nome')}
                />
                <button type="submit">{t('admin.bandeiras.acao.renomear')}</button>
              </form>
              <small>
                {b.ativa ? t('admin.bandeiras.ativa') : t('admin.bandeiras.desativada')}
              </small>
              <button
                onClick={() =>
                  void executar(
                    `/api/v1/bandeiras/${b.id}/${b.ativa ? 'desativacao' : 'reativacao'}`,
                    {
                      method: 'POST',
                    },
                  )
                }
              >
                {b.ativa ? t('admin.bandeiras.acao.desativar') : t('admin.bandeiras.acao.reativar')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <section>
        <h2>{t('admin.bandeiras.hoteis')}</h2>
        <ul style={{ display: 'grid', gap: 6 }}>
          {hoteis.map((h) => (
            <li key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>{h.nome}</span>
              <select
                aria-label={t('admin.bandeiras.titulo')}
                value={h.bandeiraId ?? ''}
                onChange={(e) =>
                  void executar(`/api/v1/hoteis/${h.id}/bandeira`, {
                    method: 'PUT',
                    body: JSON.stringify({ bandeiraId: e.target.value || null }),
                  })
                }
              >
                <option value="">{t('admin.bandeiras.sem_bandeira')}</option>
                {bandeiras
                  .filter((b) => b.ativa || b.id === h.bandeiraId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome}
                    </option>
                  ))}
              </select>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
