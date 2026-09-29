'use client';
// Locais do hotel (fase 1a, B1): UHs do sistema hoteleiro, só leitura, com o
// status da licença, e áreas comuns cadastradas aqui. Tela funcional, sem
// acabamento: o layout vem do protótipo validado.
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AnexosDoRegistro } from '../../../cliente/AnexosDoRegistro';
import { type ErroDaApi, chamarApi } from '../../../cliente/api';
import { CampoDeBusca, comBusca } from '../../../cliente/CampoDeBusca';
import { useMensagemDeErro, useT } from '../../../i18n/cliente';

interface Hotel {
  id: string;
  nome: string;
}
interface Local {
  id: string;
  nome: string;
  tipo: 'uh' | 'area_comum';
  andar: string | null;
  status: 'ativo' | 'pendente_licenca' | 'inativo';
  origem: 'sistema_hoteleiro' | 'manual';
  editavel: boolean;
}

type Aviso = { tipo: 'ok' } | { tipo: 'erro'; erro: ErroDaApi };

const texto = (f: FormData, campo: string) => {
  const v = String(f.get(campo) ?? '').trim();
  return v === '' ? null : v;
};

export default function LocaisDoHotel() {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  const [hoteis, setHoteis] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [locais, setLocais] = useState<Local[] | null>(null);
  const [busca, setBusca] = useState('');
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
    const r = await chamarApi<{ locais: Local[] }>(
      comBusca(`/api/v1/hoteis/${hotelId}/locais`, busca),
    );
    if (r.ok) setLocais(r.dados.locais);
    else setAviso({ tipo: 'erro', erro: r.erro });
  }, [hotelId, busca]);

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
    const f = new FormData(ev.currentTarget);
    void executar(`/api/v1/hoteis/${hotelId}/locais`, {
      method: 'POST',
      body: JSON.stringify({ nome: texto(f, 'nome') ?? '', andar: texto(f, 'andar') }),
    });
  }

  const uhs = locais?.filter((l) => l.tipo === 'uh') ?? [];
  const areas = locais?.filter((l) => l.tipo === 'area_comum') ?? [];

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <a href="/">{t('comum.voltar')}</a>
      <h1>{t('admin.locais.titulo')}</h1>
      <select
        aria-label={t('admin.locais.escolher_hotel')}
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
      <CampoDeBusca
        aoBuscar={(termo) => {
          setAviso(null);
          setBusca(termo);
        }}
      />
      {!locais ? (
        <p>{t('comum.carregando')}</p>
      ) : (
        <>
          <section style={{ display: 'grid', gap: 8 }}>
            <h2>{t('admin.locais.areas_comuns')}</h2>
            <form onSubmit={criar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                name="nome"
                placeholder={t('admin.locais.campo.nome')}
                aria-label={t('admin.locais.campo.nome')}
                required
              />
              <input
                name="andar"
                placeholder={t('admin.locais.campo.andar')}
                aria-label={t('admin.locais.campo.andar')}
              />
              <button type="submit">{t('admin.locais.acao.criar')}</button>
            </form>
            {areas.length === 0 ? (
              <p>
                {busca === ''
                  ? t('admin.locais.sem_areas')
                  : t('comum.busca.sem_resultado', { termo: busca })}
              </p>
            ) : (
              <ul style={{ display: 'grid', gap: 6, padding: 0, listStyle: 'none' }}>
                {areas.map((l) => (
                  <li key={l.id}>
                    <form
                      key={`${l.nome}|${l.andar ?? ''}`}
                      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        const f = new FormData(ev.currentTarget);
                        void executar(`/api/v1/locais/${l.id}`, {
                          method: 'PUT',
                          body: JSON.stringify({
                            nome: texto(f, 'nome') ?? '',
                            andar: texto(f, 'andar'),
                          }),
                        });
                      }}
                    >
                      <input
                        name="nome"
                        defaultValue={l.nome}
                        aria-label={t('admin.locais.campo.nome')}
                        disabled={!l.editavel}
                      />
                      <input
                        name="andar"
                        defaultValue={l.andar ?? ''}
                        aria-label={t('admin.locais.campo.andar')}
                        disabled={!l.editavel}
                      />
                      <small>{t('admin.locais.status', { status: l.status })}</small>
                      {l.editavel ? (
                        <>
                          <button type="submit">{t('admin.locais.acao.salvar')}</button>
                          <button
                            type="button"
                            onClick={() =>
                              void executar(
                                `/api/v1/locais/${l.id}/${l.status === 'inativo' ? 'reativacao' : 'desativacao'}`,
                                {
                                  method: 'POST',
                                },
                              )
                            }
                          >
                            {l.status === 'inativo'
                              ? t('admin.locais.acao.reativar')
                              : t('admin.locais.acao.desativar')}
                          </button>
                        </>
                      ) : (
                        <small>{t('admin.locais.do_sistema_hoteleiro')}</small>
                      )}
                    </form>
                    <AnexosDoRegistro entidade="local" registroId={l.id} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section style={{ display: 'grid', gap: 8 }}>
            <h2>{t('admin.locais.uhs')}</h2>
            <small>{t('admin.locais.uhs_ajuda')}</small>
            {uhs.length === 0 ? (
              <p>
                {busca === ''
                  ? t('admin.locais.sem_uhs')
                  : t('comum.busca.sem_resultado', { termo: busca })}
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{t('admin.locais.campo.nome')}</th>
                    <th>{t('admin.locais.campo.andar')}</th>
                    <th>{t('admin.locais.campo.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {uhs.map((l) => (
                    <tr key={l.id}>
                      <td>{l.nome}</td>
                      <td>{l.andar ?? ''}</td>
                      <td>{t('admin.locais.status', { status: l.status })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}
