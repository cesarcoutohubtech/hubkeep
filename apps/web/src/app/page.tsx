'use client';
// Página inicial mínima da F0-05: escolhe o tenant (cookie hk_tenant) e lista
// os hotéis visíveis. Tudo passa pela API, que verifica o token no servidor.
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { supabaseNavegador } from '../cliente/supabase';

interface Sessao {
  email: string | null;
  tenants: string[];
}
interface Hotel {
  id: string;
  nome: string;
  status: string;
}

const lerCookieTenant = () =>
  document.cookie
    .split('; ')
    .find((c) => c.startsWith('hk_tenant='))
    ?.split('=')[1] ?? null;

export default function Inicio() {
  const router = useRouter();
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [tenant, setTenant] = useState<string | null>(null);
  const [hoteis, setHoteis] = useState<Hotel[] | null>(null);

  useEffect(() => {
    void fetch('/api/v1/sessao').then(async (r) => {
      if (r.status === 401) return router.replace('/login');
      const s = (await r.json()) as Sessao;
      setSessao(s);
      setTenant(lerCookieTenant() ?? s.tenants[0] ?? null);
    });
  }, [router]);

  const carregar = useCallback(async (t: string) => {
    document.cookie = `hk_tenant=${t}; path=/; samesite=lax`;
    const r = await fetch('/api/v1/hoteis');
    setHoteis(r.ok ? ((await r.json()) as { hoteis: Hotel[] }).hoteis : []);
  }, []);

  useEffect(() => {
    if (tenant) void carregar(tenant);
  }, [tenant, carregar]);

  async function sair() {
    await supabaseNavegador().auth.signOut();
    router.replace('/login');
  }

  if (!sessao) return <p>Carregando…</p>;
  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>HubKeep</strong>
        <span>
          {sessao.email} · <button onClick={sair}>Sair</button>
        </span>
      </header>
      {sessao.tenants.length === 0 ? (
        <p>Você ainda não tem acesso a nenhum grupo.</p>
      ) : (
        <label>
          Grupo:{' '}
          <select value={tenant ?? ''} onChange={(e) => setTenant(e.target.value)}>
            {sessao.tenants.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      )}
      <section>
        <h2>Hotéis</h2>
        {hoteis === null ? (
          <p>Carregando…</p>
        ) : hoteis.length === 0 ? (
          <p>Nenhum hotel visível para você neste grupo.</p>
        ) : (
          <ul>
            {hoteis.map((h) => (
              <li key={h.id}>
                {h.nome} <small>({h.status})</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
