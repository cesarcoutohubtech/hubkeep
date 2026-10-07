'use client';
// Equipes do hotel (fase 1a, A6): criar, renomear, desativar e pôr ou tirar
// membro. Tela funcional, sem acabamento: o layout vem do protótipo validado.
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { useMensagemDeErro, useT } from '../../../../i18n/cliente';

interface Hotel {
  id: string;
  nome: string;
}
interface Equipe {
  id: string;
  nome: string;
  ativa: boolean;
  membros: { usuarioId: string; nome: string; ativo: boolean }[];
}
interface Lista {
  equipes: Equipe[];
  disponiveis: { usuarioId: string; nome: string }[];
}

type Aviso = { tipo: 'ok' } | { tipo: 'erro'; erro: ErroDaApi };

export default function EquipesDoHotel() {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  const [hoteis, setHoteis] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [lista, setLista] = useState<Lista | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    void chamarApi<{ hoteis: Hotel[] }>('/api/v1/hoteis').then((r) => {
      if (!r.ok) return setAviso({ tipo: 'erro', erro: r.erro });
      setHoteis(r.dados.hoteis);
      setHotelId((atual) => atual || r.dados.hoteis[0]?.id || '');
    });
  }, []);

  const carregar = useCallback(async () => {
    if (!hotelId) return;
    const r = await chamarApi<Lista>(`/api/v1/hoteis/${hotelId}/equipes`);
    if (r.ok) setLista(r.dados);
    else setAviso({ tipo: 'erro', erro: r.erro });
  }, [hotelId]);

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
    void executar(`/api/v1/hoteis/${hotelId}/equipes`, {
      method: 'POST',
      body: JSON.stringify({ nome }),
    });
  }

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <a href="/">{t('comum.voltar')}</a>
      <h1>{t('admin.equipes.titulo')}</h1>
      <select
        aria-label={t('admin.equipes.escolher_hotel')}
        value={hotelId}
        onChange={(e) => setHotelId(e.target.value)}
      >
        {hoteis.map((h) => (
          <option key={h.id} value={h.id}>
            {h.nome}
          </option>
        ))}
      </select>
      {aviso && (
        <p role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
          {aviso.tipo === 'ok' ? t('admin.membros.feito') : mensagemDeErro(aviso.erro)}
        </p>
      )}

      <form onSubmit={criar} style={{ display: 'flex', gap: 8 }}>
        <input name="nome" placeholder={t('admin.equipes.campo.nome')} required />
        <button type="submit">{t('admin.equipes.acao.criar')}</button>
      </form>

      {!lista ? (
        <p>{t('comum.carregando')}</p>
      ) : lista.equipes.length === 0 ? (
        <p>{t('admin.equipes.vazio')}</p>
      ) : (
        <ul style={{ display: 'grid', gap: 12, padding: 0, listStyle: 'none' }}>
          {lista.equipes.map((e) => {
            const ativos = e.membros.filter((m) => m.ativo);
            return (
              <li
                key={e.id}
                style={{ display: 'grid', gap: 6, borderTop: '1px solid #ddd', paddingTop: 8 }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <form
                    style={{ display: 'flex', gap: 4 }}
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      const nome = String(new FormData(ev.currentTarget).get('nome') ?? '');
                      void executar(`/api/v1/equipes/${e.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ nome }),
                      });
                    }}
                  >
                    <input
                      name="nome"
                      defaultValue={e.nome}
                      aria-label={t('admin.equipes.campo.nome')}
                    />
                    <button type="submit">{t('admin.equipes.acao.renomear')}</button>
                  </form>
                  <small>
                    {e.ativa ? t('admin.equipes.ativa') : t('admin.equipes.desativada')}
                  </small>
                  <button
                    onClick={() =>
                      void executar(
                        `/api/v1/equipes/${e.id}/${e.ativa ? 'desativacao' : 'reativacao'}`,
                        {
                          method: 'POST',
                        },
                      )
                    }
                  >
                    {e.ativa ? t('admin.equipes.acao.desativar') : t('admin.equipes.acao.reativar')}
                  </button>
                </div>
                {ativos.length === 0 ? (
                  <small>{t('admin.equipes.sem_membros')}</small>
                ) : (
                  <ul>
                    {ativos.map((m) => (
                      <li key={m.usuarioId} style={{ display: 'flex', gap: 8 }}>
                        <span>{m.nome}</span>
                        <button
                          onClick={() =>
                            void executar(
                              `/api/v1/equipes/${e.id}/membros/${m.usuarioId}/remocao`,
                              {
                                method: 'POST',
                              },
                            )
                          }
                        >
                          {t('admin.equipes.acao.tirar')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  style={{ display: 'flex', gap: 4 }}
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    const usuarioId = String(new FormData(ev.currentTarget).get('usuarioId') ?? '');
                    if (usuarioId) {
                      void executar(`/api/v1/equipes/${e.id}/membros`, {
                        method: 'POST',
                        body: JSON.stringify({ usuarioId }),
                      });
                    }
                  }}
                >
                  <select name="usuarioId" aria-label={t('admin.equipes.escolher_membro')}>
                    <option value="">{t('admin.equipes.escolher_membro')}</option>
                    {lista.disponiveis
                      .filter((d) => !ativos.some((m) => m.usuarioId === d.usuarioId))
                      .map((d) => (
                        <option key={d.usuarioId} value={d.usuarioId}>
                          {d.nome}
                        </option>
                      ))}
                  </select>
                  <button type="submit">{t('admin.equipes.acao.por')}</button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
