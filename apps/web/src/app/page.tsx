'use client';
// Página inicial mínima da F0-05: escolhe o tenant (cookie hk_tenant) e lista
// os hotéis visíveis. Tudo passa pela API, que verifica o token no servidor.
// Idioma (F0-10b): o layout já resolve pelo perfil (membro → tenant). Aqui o
// seletor grava a escolha no perfil (PUT /api/v1/preferencias), e o idioma
// resolvido vai para o cookie hk_idioma só para a tela de login seguir nele
// depois de sair. Se o tenant escolhido mudou o idioma, a página é pedida de novo.
import { type IdiomaDeExibicao, PSEUDO_IDIOMA, ehIdioma } from '@hubkeep/i18n';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { supabaseNavegador } from '../cliente/supabase';
import {
  SeletorDeIdioma,
  gravarCookieDeIdioma,
  useIdioma,
  useT,
  useTrocarIdioma,
} from '../i18n/cliente';

interface Sessao {
  email: string | null;
  tenants: string[];
}
interface Hotel {
  id: string;
  nome: string;
  status: string;
}
interface Preferencias {
  idioma: string;
  gravadas: { idioma: string | null; formatoRegional: string | null; fuso: string | null };
}

const lerCookieTenant = () =>
  document.cookie
    .split('; ')
    .find((c) => c.startsWith('hk_tenant='))
    ?.split('=')[1] ?? null;

export default function Inicio() {
  const t = useT();
  const router = useRouter();
  const { idioma } = useIdioma();
  const trocarIdioma = useTrocarIdioma();
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [tenant, setTenant] = useState<string | null>(null);
  const [hoteis, setHoteis] = useState<Hotel[] | null>(null);
  const [preferencias, setPreferencias] = useState<Preferencias | null>(null);

  useEffect(() => {
    void fetch('/api/v1/sessao').then(async (r) => {
      if (r.status === 401) return router.replace('/login');
      const s = (await r.json()) as Sessao;
      setSessao(s);
      setTenant(lerCookieTenant() ?? s.tenants[0] ?? null);
    });
  }, [router]);

  const carregar = useCallback(
    async (tn: string) => {
      document.cookie = `hk_tenant=${tn}; path=/; samesite=lax`;
      const [rh, rp] = await Promise.all([fetch('/api/v1/hoteis'), fetch('/api/v1/preferencias')]);
      setHoteis(rh.ok ? ((await rh.json()) as { hoteis: Hotel[] }).hoteis : []);
      if (!rp.ok) return;
      const p = (await rp.json()) as Preferencias;
      setPreferencias(p);
      // O pseudo-idioma (dev) não é gravado no perfil: fica até trocar à mão.
      if (idioma === PSEUDO_IDIOMA || !ehIdioma(p.idioma)) return;
      if (p.idioma !== idioma) trocarIdioma(p.idioma);
      else gravarCookieDeIdioma(p.idioma);
    },
    [idioma, trocarIdioma],
  );

  useEffect(() => {
    if (tenant) void carregar(tenant);
  }, [tenant, carregar]);

  async function escolherIdioma(novo: IdiomaDeExibicao) {
    if (novo !== PSEUDO_IDIOMA && preferencias) {
      await fetch('/api/v1/preferencias', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...preferencias.gravadas, idioma: novo }),
      });
    }
    trocarIdioma(novo);
  }

  async function sair() {
    await supabaseNavegador().auth.signOut();
    router.replace('/login');
  }

  if (!sessao) return <p>{t('comum.carregando')}</p>;
  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{t('app.nome')}</strong>
        <span style={{ display: 'flex', gap: 8 }}>
          <span>{sessao.email}</span>
          <button onClick={sair}>{t('inicio.sair')}</button>
        </span>
      </header>
      <a href="/admin/proprietarios">{t('inicio.proprietarios')}</a>
      <SeletorDeIdioma aoEscolher={(i) => void escolherIdioma(i)} />
      <a href="/admin/hoteis">{t('inicio.administracao')}</a>
      <a href="/admin/membros">{t('inicio.membros')}</a>
      {sessao.tenants.length === 0 ? (
        <p>{t('inicio.sem_grupo')}</p>
      ) : (
        <label style={{ display: 'flex', gap: 8 }}>
          {t('inicio.grupo')}
          <select value={tenant ?? ''} onChange={(e) => setTenant(e.target.value)}>
            {sessao.tenants.map((tn) => (
              <option key={tn} value={tn}>
                {tn}
              </option>
            ))}
          </select>
        </label>
      )}
      <a href="/admin/implantacao">{t('inicio.implantacao')}</a>
      <section>
        <h2>{t('inicio.hoteis.titulo')}</h2>
        {hoteis === null ? (
          <p>{t('comum.carregando')}</p>
        ) : hoteis.length === 0 ? (
          <p>{t('inicio.hoteis.vazio')}</p>
        ) : (
          <ul>
            {hoteis.map((h) => (
              <li key={h.id} style={{ display: 'flex', gap: 6 }}>
                <span>{h.nome}</span>
                <small>{t('hotel.status', { status: h.status })}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
