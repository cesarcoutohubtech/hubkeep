'use client';
// Proprietários e vínculos (fase 1a, A4; ADR-031): cadastro, vínculo com UH ou
// hotel inteiro, vigência e acesso (papel proprietario, somente leitura). Tela
// funcional, sem acabamento: o layout vem do protótipo validado.
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { useMensagemDeErro, useT } from '../../../../i18n/cliente';

interface Hotel {
  id: string;
  nome: string;
}
interface Local {
  id: string;
  nome: string;
  tipo: 'uh' | 'area_comum';
}
interface Vinculo {
  id: string;
  tipo: 'uh' | 'hotel';
  hotelNome: string;
  localNome: string | null;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  vigente: boolean;
}
interface Proprietario {
  id: string;
  nome: string;
  documento: string | null;
  vinculos: Vinculo[];
}
interface Membro {
  usuarioId: string;
  nome: string;
  ativo: boolean;
}

type Aviso = { tipo: 'ok' } | { tipo: 'erro'; erro: ErroDaApi };

const hoje = () => new Date().toISOString().slice(0, 10);
const texto = (f: FormData, campo: string) => {
  const v = String(f.get(campo) ?? '').trim();
  return v === '' ? null : v;
};

export default function ProprietariosEVinculos() {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  const [proprietarios, setProprietarios] = useState<Proprietario[] | null>(null);
  const [hoteis, setHoteis] = useState<Hotel[]>([]);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [hotelDoVinculo, setHotelDoVinculo] = useState('');
  const [locais, setLocais] = useState<Local[]>([]);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const carregar = useCallback(async () => {
    const [p, h, m] = await Promise.all([
      chamarApi<{ proprietarios: Proprietario[] }>('/api/v1/proprietarios'),
      chamarApi<{ hoteis: Hotel[] }>('/api/v1/hoteis'),
      chamarApi<{ membros: Membro[] }>('/api/v1/membros'),
    ]);
    if (p.ok) setProprietarios(p.dados.proprietarios);
    else setAviso({ tipo: 'erro', erro: p.erro });
    if (h.ok) setHoteis(h.dados.hoteis);
    if (m.ok) setMembros(m.dados.membros.filter((x) => x.ativo));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!hotelDoVinculo) return setLocais([]);
    void chamarApi<{ locais: Local[] }>(`/api/v1/hoteis/${hotelDoVinculo}/locais`).then((r) => {
      if (r.ok) setLocais(r.dados.locais.filter((l) => l.tipo === 'uh'));
    });
  }, [hotelDoVinculo]);

  async function executar(caminho: string, init: RequestInit) {
    const r = await chamarApi<unknown>(caminho, init);
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregar();
  }

  function criar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    void executar('/api/v1/proprietarios', {
      method: 'POST',
      body: JSON.stringify({ nome: texto(f, 'nome') ?? '', documento: texto(f, 'documento') }),
    });
  }

  function vincular(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const localId = texto(f, 'localId');
    const vigencia = { vigenciaInicio: texto(f, 'inicio') ?? '', vigenciaFim: texto(f, 'fim') };
    void executar(`/api/v1/proprietarios/${texto(f, 'proprietarioId') ?? ''}/vinculos`, {
      method: 'POST',
      body: JSON.stringify(
        localId
          ? { tipo: 'uh', localId, ...vigencia }
          : { tipo: 'hotel', hotelId: hotelDoVinculo, ...vigencia },
      ),
    });
  }

  function darAcesso(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    void executar('/api/v1/atribuicoes', {
      method: 'POST',
      body: JSON.stringify({
        usuarioId: texto(f, 'usuarioId') ?? '',
        papel: 'proprietario',
        escopo: { tipo: 'proprietario', proprietarioId: texto(f, 'proprietarioId') ?? '' },
        validoAte: null,
      }),
    });
  }

  function convidar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    void executar('/api/v1/convites', {
      method: 'POST',
      body: JSON.stringify({
        nome: texto(f, 'nome') ?? '',
        email: texto(f, 'email') ?? '',
        papel: 'proprietario',
        proprietarioId: texto(f, 'proprietarioId'),
      }),
    });
  }

  if (!proprietarios) {
    return aviso?.tipo === 'erro' ? (
      <p role="alert">{mensagemDeErro(aviso.erro)}</p>
    ) : (
      <p>{t('comum.carregando')}</p>
    );
  }

  const campoProprietario = (
    <select
      name="proprietarioId"
      aria-label={t('admin.proprietarios.escolher_proprietario')}
      required
    >
      <option value="">{t('admin.proprietarios.escolher_proprietario')}</option>
      {proprietarios.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}
        </option>
      ))}
    </select>
  );

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <a href="/">{t('comum.voltar')}</a>
      <h1>{t('admin.proprietarios.titulo')}</h1>
      {aviso && (
        <p role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
          {aviso.tipo === 'ok' ? t('admin.membros.feito') : mensagemDeErro(aviso.erro)}
        </p>
      )}

      <section style={{ display: 'grid', gap: 8 }}>
        <h2>{t('admin.proprietarios.novo')}</h2>
        <form onSubmit={criar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            name="nome"
            placeholder={t('admin.proprietarios.campo.nome')}
            aria-label={t('admin.proprietarios.campo.nome')}
            required
          />
          <input
            name="documento"
            placeholder={t('admin.proprietarios.campo.documento')}
            aria-label={t('admin.proprietarios.campo.documento')}
          />
          <button type="submit">{t('admin.proprietarios.acao.criar')}</button>
        </form>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h2>{t('admin.proprietarios.vincular')}</h2>
        <form onSubmit={vincular} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {campoProprietario}
          <select
            aria-label={t('admin.proprietarios.escolher_hotel')}
            value={hotelDoVinculo}
            onChange={(e) => setHotelDoVinculo(e.target.value)}
            required
          >
            <option value="">{t('admin.proprietarios.escolher_hotel')}</option>
            {hoteis.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nome}
              </option>
            ))}
          </select>
          <select name="localId" aria-label={t('admin.proprietarios.alvo.hotel_inteiro')}>
            <option value="">{t('admin.proprietarios.alvo.hotel_inteiro')}</option>
            {locais.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
          <label style={{ display: 'flex', gap: 4 }}>
            {t('admin.proprietarios.campo.inicio')}
            <input type="date" name="inicio" defaultValue={hoje()} required />
          </label>
          <label style={{ display: 'flex', gap: 4 }}>
            {t('admin.proprietarios.campo.fim')}
            <input type="date" name="fim" />
          </label>
          <button type="submit">{t('admin.proprietarios.acao.vincular')}</button>
        </form>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h2>{t('admin.proprietarios.acesso')}</h2>
        <small>{t('admin.proprietarios.acesso_ajuda')}</small>
        <form onSubmit={darAcesso} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {campoProprietario}
          <select name="usuarioId" aria-label={t('admin.proprietarios.escolher_membro')} required>
            <option value="">{t('admin.proprietarios.escolher_membro')}</option>
            {membros.map((m) => (
              <option key={m.usuarioId} value={m.usuarioId}>
                {m.nome}
              </option>
            ))}
          </select>
          <button type="submit">{t('admin.proprietarios.acao.dar_acesso')}</button>
        </form>
        <form onSubmit={convidar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {campoProprietario}
          <input
            name="nome"
            placeholder={t('admin.membros.campo.nome')}
            aria-label={t('admin.membros.campo.nome')}
            required
          />
          <input
            name="email"
            type="email"
            placeholder={t('login.campo.email')}
            aria-label={t('login.campo.email')}
            required
          />
          <button type="submit">{t('admin.proprietarios.acao.convidar')}</button>
        </form>
      </section>

      {proprietarios.length === 0 ? (
        <p>{t('admin.proprietarios.vazio')}</p>
      ) : (
        <ul style={{ display: 'grid', gap: 12, padding: 0, listStyle: 'none' }}>
          {proprietarios.map((p) => (
            <li
              key={p.id}
              style={{ display: 'grid', gap: 6, borderTop: '1px solid #ddd', paddingTop: 8 }}
            >
              <form
                key={`${p.nome}|${p.documento ?? ''}`}
                style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}
                onSubmit={(ev) => {
                  ev.preventDefault();
                  const f = new FormData(ev.currentTarget);
                  void executar(`/api/v1/proprietarios/${p.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                      nome: texto(f, 'nome') ?? '',
                      documento: texto(f, 'documento'),
                    }),
                  });
                }}
              >
                <input
                  name="nome"
                  defaultValue={p.nome}
                  aria-label={t('admin.proprietarios.campo.nome')}
                />
                <input
                  name="documento"
                  defaultValue={p.documento ?? ''}
                  aria-label={t('admin.proprietarios.campo.documento')}
                />
                <button type="submit">{t('admin.proprietarios.acao.salvar')}</button>
              </form>
              {p.vinculos.length === 0 ? (
                <small>{t('admin.proprietarios.sem_vinculos')}</small>
              ) : (
                <ul>
                  {p.vinculos.map((v) => (
                    <li key={v.id}>
                      <form
                        key={`${v.vigenciaInicio}|${v.vigenciaFim ?? ''}`}
                        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          const f = new FormData(ev.currentTarget);
                          void executar(`/api/v1/vinculos-de-proprietario/${v.id}/vigencia`, {
                            method: 'PUT',
                            body: JSON.stringify({
                              tipo: v.tipo,
                              vigenciaInicio: texto(f, 'inicio') ?? '',
                              vigenciaFim: texto(f, 'fim'),
                            }),
                          });
                        }}
                      >
                        <span>
                          {t('admin.proprietarios.vinculo', {
                            tipo: v.tipo,
                            hotel: v.hotelNome,
                            local: v.localNome ?? '',
                          })}
                        </span>
                        <small>
                          {t('admin.proprietarios.vigente', { vigente: String(v.vigente) })}
                        </small>
                        <input
                          type="date"
                          name="inicio"
                          defaultValue={v.vigenciaInicio}
                          aria-label={t('admin.proprietarios.campo.inicio')}
                          required
                        />
                        <input
                          type="date"
                          name="fim"
                          defaultValue={v.vigenciaFim ?? ''}
                          aria-label={t('admin.proprietarios.campo.fim')}
                        />
                        <button type="submit">
                          {t('admin.proprietarios.acao.alterar_vigencia')}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
