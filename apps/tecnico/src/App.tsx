// Casca do PWA do técnico (F0-11). Abre sem rede: a sessão, o idioma e a fila
// ficam no aparelho. A fila é enviada ao abrir, depois de cada operação,
// quando a rede volta (evento online) e a cada 30 s enquanto houver pendência.
import { type IdiomaDeExibicao, PSEUDO_IDIOMA, ehIdioma } from '@hubkeep/i18n';
import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Credenciais, criarEnvio, lerPreferencias } from './api';
import { type FilaDeOperacoes, abrirFila } from './fila/banco';
import { sincronizar } from './fila/sincronizar';
import { ProvedorDeIdioma, guardarIdioma, idiomaInicial } from './i18n';
import { supabase, tenantDaSessao } from './sessao';
import { type EstadoDaFila, FilaDoDia } from './telas/FilaDoDia';
import { Login } from './telas/Login';

const INTERVALO_MS = 30_000;

export function App() {
  const [idioma, setIdiomaDoEstado] = useState<IdiomaDeExibicao>(() => idiomaInicial());
  const idiomaAtual = useRef(idioma);
  const setIdioma = useCallback((novo: IdiomaDeExibicao) => {
    idiomaAtual.current = novo;
    setIdiomaDoEstado(novo);
    guardarIdioma(novo);
  }, []);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [estado, setEstado] = useState<EstadoDaFila>({ pendentes: 0, rejeitadas: 0 });
  const fila = useRef<FilaDeOperacoes | null>(null);
  const sessaoAtual = useRef<Session | null>(null);
  const gravadas = useRef<{ formatoRegional: string | null; fuso: string | null }>({
    formatoRegional: null,
    fuso: null,
  });

  const credenciais = useMemo<Credenciais>(
    () => ({
      token: async () => (await supabase().auth.getSession()).data.session?.access_token ?? null,
      tenant: () => tenantDaSessao(sessaoAtual.current),
    }),
    [],
  );

  const atualizarEstado = useCallback(async () => {
    const todas = (await fila.current?.todas()) ?? [];
    setEstado({
      pendentes: todas.filter((o) => o.estado === 'pendente').length,
      rejeitadas: todas.filter((o) => o.estado === 'rejeitada').length,
    });
  }, []);

  const enviarFila = useCallback(
    async (ignorarEspera = false) => {
      if (!fila.current || !sessaoAtual.current) return;
      await sincronizar(fila.current, criarEnvio(credenciais), { ignorarEspera });
      await atualizarEstado();
    },
    [atualizarEstado, credenciais],
  );

  useEffect(() => {
    void abrirFila().then(async (f) => {
      fila.current = f;
      await atualizarEstado();
    });
    const { data } = supabase().auth.onAuthStateChange((_evento, s) => {
      sessaoAtual.current = s;
      setSessao(s);
    });
    return () => data.subscription.unsubscribe();
  }, [atualizarEstado]);

  // Com sessão e rede: primeiro a fila (a troca feita offline chega ao perfil),
  // depois o idioma do perfil, guardado no aparelho para abrir sem rede.
  useEffect(() => {
    if (!sessao || !online) return;
    void (async () => {
      await enviarFila(true);
      const p = await lerPreferencias(credenciais);
      if (!p) return;
      gravadas.current = { formatoRegional: p.gravadas.formatoRegional, fuso: p.gravadas.fuso };
      const pendentes = (await fila.current?.todas())?.some((o) => o.estado === 'pendente');
      // Com troca ainda na fila, vale a do aparelho; o pseudo-idioma é só da tela.
      if (!pendentes && ehIdioma(p.idioma) && idiomaAtual.current !== PSEUDO_IDIOMA) {
        setIdioma(p.idioma);
      }
    })();
    const intervalo = setInterval(() => void enviarFila(), INTERVALO_MS);
    return () => clearInterval(intervalo);
  }, [sessao, online, enviarFila, credenciais, setIdioma]);

  useEffect(() => {
    const ligar = () => setOnline(true);
    const desligar = () => setOnline(false);
    window.addEventListener('online', ligar);
    window.addEventListener('offline', desligar);
    return () => {
      window.removeEventListener('online', ligar);
      window.removeEventListener('offline', desligar);
    };
  }, []);

  async function trocarIdioma(novo: IdiomaDeExibicao) {
    setIdioma(novo);
    // O pseudo-idioma (dev) é só da tela: não vai para o perfil.
    if (novo === PSEUDO_IDIOMA || !fila.current) return;
    await fila.current.enfileirar(
      { tipo: 'preferencias.gravar', dados: { idioma: novo, ...gravadas.current } },
      Date.now(),
    );
    await atualizarEstado();
    await enviarFila();
  }

  return (
    <ProvedorDeIdioma idioma={idioma}>
      {sessao ? (
        <FilaDoDia
          idioma={idioma}
          online={online}
          fila={estado}
          aoTrocarIdioma={(i) => void trocarIdioma(i)}
          aoEnviarAgora={() => void enviarFila(true)}
          aoSair={() => void supabase().auth.signOut()}
        />
      ) : (
        <Login />
      )}
    </ProvedorDeIdioma>
  );
}
