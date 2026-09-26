// Casca do PWA do técnico (F0-11). Abre sem rede: a sessão, o idioma e a fila
// ficam no aparelho. A fila é enviada ao abrir, depois de cada operação,
// quando a rede volta (evento online) e a cada 30 s enquanto houver pendência.
// Tudo o que a fila lê, mostra, envia ou apaga é do usuário da sessão (ADR-025).
import { type IdiomaDeExibicao, PSEUDO_IDIOMA, ehIdioma } from '@hubkeep/i18n';
import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { type Credenciais, criarEnvio, lerPreferencias } from './api';
import { type FilaDeOperacoes, abrirFila } from './fila/banco';
import { sincronizar } from './fila/sincronizar';
import { ProvedorDeIdioma, guardarIdioma, idiomaInicial } from './i18n';
import { apagarDadosLocais } from './saida';
import { supabase, tenantDaSessao } from './sessao';
import { type EstadoDaFila, FilaDoDia } from './telas/FilaDoDia';
import { Login } from './telas/Login';

const INTERVALO_MS = 30_000;
const FILA_VAZIA: EstadoDaFila = { pendentes: 0, rejeitadas: [] };

export function App() {
  const [idioma, setIdiomaDoEstado] = useState<IdiomaDeExibicao>(() => idiomaInicial());
  const idiomaAtual = useRef(idioma);
  const setIdioma = useCallback((novo: IdiomaDeExibicao) => {
    idiomaAtual.current = novo;
    setIdiomaDoEstado(novo);
    guardarIdioma(novo);
  }, []);
  return (
    <ProvedorDeIdioma idioma={idioma}>
      <Casca idioma={idioma} setIdioma={setIdioma} idiomaAtual={idiomaAtual} />
    </ProvedorDeIdioma>
  );
}

function Casca(props: {
  idioma: IdiomaDeExibicao;
  setIdioma: (i: IdiomaDeExibicao) => void;
  idiomaAtual: { readonly current: IdiomaDeExibicao };
}) {
  const { setIdioma, idiomaAtual } = props;
  const intl = useIntl();
  const [sessao, setSessao] = useState<Session | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [estado, setEstado] = useState<EstadoDaFila>(FILA_VAZIA);
  const fila = useRef<FilaDeOperacoes | null>(null);
  const sessaoAtual = useRef<Session | null>(null);
  const gravadas = useRef<{ formatoRegional: string | null; fuso: string | null }>({
    formatoRegional: null,
    fuso: null,
  });

  const credenciais = useMemo<Credenciais>(
    () => ({
      usuarioId: () => sessaoAtual.current?.user.id ?? null,
      token: async () => (await supabase().auth.getSession()).data.session?.access_token ?? null,
      tenant: () => tenantDaSessao(sessaoAtual.current),
    }),
    [],
  );

  const atualizarEstado = useCallback(async () => {
    const usuarioId = sessaoAtual.current?.user.id;
    const minhas = usuarioId && fila.current ? await fila.current.doUsuario(usuarioId) : [];
    setEstado({
      pendentes: minhas.filter((o) => o.estado === 'pendente').length,
      rejeitadas: minhas
        .filter((o) => o.estado === 'rejeitada')
        .map((o) => ({ chave: o.chave, tipo: o.tipo, codigo: o.ultimoErro ?? 'erro_interno' })),
    });
  }, []);

  const enviarFila = useCallback(
    async (ignorarEspera = false) => {
      const usuarioId = sessaoAtual.current?.user.id;
      if (!fila.current || !usuarioId) return;
      await sincronizar(fila.current, criarEnvio(credenciais), { usuarioId, ignorarEspera });
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
      void atualizarEstado();
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
      const minhas = (await fila.current?.doUsuario(sessao.user.id)) ?? [];
      // Com troca ainda na fila, vale a do aparelho; o pseudo-idioma é só da tela.
      if (
        !minhas.some((o) => o.estado === 'pendente') &&
        ehIdioma(p.idioma) &&
        idiomaAtual.current !== PSEUDO_IDIOMA
      ) {
        setIdioma(p.idioma);
      }
    })();
    const intervalo = setInterval(() => void enviarFila(), INTERVALO_MS);
    return () => clearInterval(intervalo);
  }, [sessao, online, enviarFila, credenciais, setIdioma, idiomaAtual]);

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
    const usuarioId = sessaoAtual.current?.user.id;
    // O pseudo-idioma (dev) é só da tela: não vai para o perfil.
    if (novo === PSEUDO_IDIOMA || !fila.current || !usuarioId) return;
    await fila.current.enfileirar(
      { usuarioId, tipo: 'preferencias.gravar', dados: { idioma: novo, ...gravadas.current } },
      Date.now(),
    );
    await atualizarEstado();
    await enviarFila();
  }

  async function dispensar(chave: string) {
    await fila.current?.remover(chave);
    await atualizarEstado();
  }

  async function sair() {
    const usuarioId = sessaoAtual.current?.user.id;
    if (fila.current && usuarioId) {
      // Tenta enviar antes; o que sobrar seria perdido, então pergunta.
      if (online) await enviarFila(true);
      const pendentes = (await fila.current.doUsuario(usuarioId)).filter(
        (o) => o.estado === 'pendente',
      ).length;
      if (
        pendentes > 0 &&
        !window.confirm(intl.formatMessage({ id: 'tecnico.sair.pendentes' }, { n: pendentes }))
      ) {
        return;
      }
      await apagarDadosLocais(fila.current, usuarioId);
    }
    await supabase().auth.signOut();
    setEstado(FILA_VAZIA);
  }

  return sessao ? (
    <FilaDoDia
      idioma={props.idioma}
      online={online}
      fila={estado}
      aoTrocarIdioma={(i) => void trocarIdioma(i)}
      aoEnviarAgora={() => void enviarFila(true)}
      aoDispensar={(chave) => void dispensar(chave)}
      aoSair={() => void sair()}
    />
  ) : (
    <Login />
  );
}
