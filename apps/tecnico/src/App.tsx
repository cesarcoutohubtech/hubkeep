// Casca do PWA do técnico (F0-11). Abre sem rede: a sessão, o idioma e a fila
// ficam no aparelho. A fila é enviada ao abrir, depois de cada operação,
// quando a rede volta (evento online) e a cada 30 s enquanto houver pendência.
// Tudo o que a fila lê, mostra, envia ou apaga é do usuário da sessão (ADR-025).
// A referência (hotéis, locais, categorias e ativos, B3b) é relida da API com
// sessão e rede e depois de cada envio que tirou algo da fila; sem rede, vale
// a guardada no aparelho.
import { type IdiomaDeExibicao, PSEUDO_IDIOMA, ehIdioma } from '@hubkeep/i18n';
import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { type Credenciais, criarEnvio, lerPreferencias, lerReferencia } from './api';
import { type FilaDeOperacoes, abrirFila } from './fila/banco';
import {
  type AtivoGuardado,
  type Referencia,
  type ReferenciaDoAparelho,
  abrirReferencia,
} from './referencia/banco';
import { sincronizar } from './fila/sincronizar';
import { ProvedorDeIdioma, guardarIdioma, idiomaInicial } from './i18n';
import { apagarDadosLocais } from './saida';
import { supabase, tenantDaSessao } from './sessao';
import { criarFotos } from './anexos/fotos';
import { Ativos, type CadastroPendente, type GravacaoDeAtivo } from './telas/Ativos';
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
  const guardada = useRef<ReferenciaDoAparelho | null>(null);
  const [referencia, setReferencia] = useState<Referencia | null>(null);
  const [cadastrosPendentes, setCadastrosPendentes] = useState<CadastroPendente[]>([]);
  const [tela, setTela] = useState<'fila' | 'ativos'>('fila');
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
  const fotos = useMemo(() => criarFotos(credenciais), [credenciais]);

  const atualizarEstado = useCallback(async () => {
    const usuarioId = sessaoAtual.current?.user.id;
    const minhas = usuarioId && fila.current ? await fila.current.doUsuario(usuarioId) : [];
    setCadastrosPendentes(
      minhas
        .filter((o) => o.estado === 'pendente' && o.tipo === 'ativo.cadastrar')
        .map((o) => {
          const d = o.dados as { nome: string; localId: string };
          return { chave: o.chave, nome: d.nome, localId: d.localId };
        }),
    );
    setEstado({
      pendentes: minhas.filter((o) => o.estado === 'pendente').length,
      rejeitadas: minhas
        .filter((o) => o.estado === 'rejeitada')
        .map((o) => ({ chave: o.chave, tipo: o.tipo, codigo: o.ultimoErro ?? 'erro_interno' })),
    });
  }, []);

  /** A guardada no aparelho, do usuário e do tenant da sessão. */
  const lerGuardada = useCallback(async () => {
    const usuarioId = sessaoAtual.current?.user.id;
    const tenantId = tenantDaSessao(sessaoAtual.current);
    setReferencia(
      usuarioId && tenantId && guardada.current
        ? await guardada.current.ler(usuarioId, tenantId)
        : null,
    );
  }, []);

  /** Relê da API e guarda; sem rede ou com erro, fica a guardada. */
  const atualizarReferencia = useCallback(async () => {
    const nova = await lerReferencia(credenciais);
    if (!nova || nova.usuarioId !== sessaoAtual.current?.user.id) return;
    await guardada.current?.gravar(nova);
    setReferencia(nova);
  }, [credenciais]);

  const enviarFila = useCallback(
    async (ignorarEspera = false) => {
      const usuarioId = sessaoAtual.current?.user.id;
      if (!fila.current || !usuarioId) return;
      const antes = (await fila.current.doUsuario(usuarioId)).length;
      await sincronizar(fila.current, criarEnvio(credenciais), { usuarioId, ignorarEspera });
      await atualizarEstado();
      if ((await fila.current.doUsuario(usuarioId)).length < antes) await atualizarReferencia();
    },
    [atualizarEstado, atualizarReferencia, credenciais],
  );

  useEffect(() => {
    void abrirFila().then(async (f) => {
      fila.current = f;
      await atualizarEstado();
    });
    void abrirReferencia().then(async (r) => {
      guardada.current = r;
      await lerGuardada();
    });
    const { data } = supabase().auth.onAuthStateChange((_evento, s) => {
      sessaoAtual.current = s;
      setSessao(s);
      void atualizarEstado();
      void lerGuardada();
    });
    return () => data.subscription.unsubscribe();
  }, [atualizarEstado, lerGuardada]);

  // Com sessão e rede: primeiro a fila (a troca feita offline chega ao perfil),
  // depois o idioma do perfil, guardado no aparelho para abrir sem rede.
  useEffect(() => {
    if (!sessao || !online) return;
    void (async () => {
      await enviarFila(true);
      await atualizarReferencia();
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
  }, [sessao, online, enviarFila, atualizarReferencia, credenciais, setIdioma, idiomaAtual]);

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

  async function cadastrarAtivo(localId: string, g: GravacaoDeAtivo) {
    const usuarioId = sessaoAtual.current?.user.id;
    if (!fila.current || !usuarioId) return;
    await fila.current.enfileirar(
      { usuarioId, tipo: 'ativo.cadastrar', dados: { localId, ...g } },
      Date.now(),
    );
    await atualizarEstado();
    void enviarFila();
  }

  /**
   * A alteração leva a versão guardada. A referência passa a ter a versão
   * seguinte, para uma segunda alteração sem rede sair em ordem; se a primeira
   * for recusada, a segunda também volta com conflito_de_versao (ADR-029).
   */
  async function alterarAtivo(ativo: AtivoGuardado, g: GravacaoDeAtivo) {
    const usuarioId = sessaoAtual.current?.user.id;
    if (!fila.current || !usuarioId || !referencia) return;
    await fila.current.enfileirar(
      {
        usuarioId,
        tipo: 'ativo.alterar',
        dados: { ativoId: ativo.id, versao: ativo.versao, ...g },
      },
      Date.now(),
    );
    const ativos = Object.fromEntries(
      Object.entries(referencia.ativos).map(([hotel, lista]) => [
        hotel,
        lista.map((a) => (a.id === ativo.id ? { ...a, ...g, versao: a.versao + 1 } : a)),
      ]),
    );
    const nova = { ...referencia, ativos };
    await guardada.current?.gravar(nova);
    setReferencia(nova);
    await atualizarEstado();
    void enviarFila();
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
      await apagarDadosLocais(fila.current, usuarioId, undefined, guardada.current);
    }
    await supabase().auth.signOut();
    setEstado(FILA_VAZIA);
    setReferencia(null);
    setCadastrosPendentes([]);
    setTela('fila');
  }

  if (sessao && tela === 'ativos') {
    return (
      <Ativos
        idioma={props.idioma}
        referencia={referencia}
        pendentes={cadastrosPendentes}
        aoCadastrar={cadastrarAtivo}
        aoAlterar={alterarAtivo}
        aoVoltar={() => setTela('fila')}
        fotos={fotos}
        online={online}
      />
    );
  }

  return sessao ? (
    <FilaDoDia
      idioma={props.idioma}
      online={online}
      fila={estado}
      aoTrocarIdioma={(i) => void trocarIdioma(i)}
      aoEnviarAgora={() => void enviarFila(true)}
      aoDispensar={(chave) => void dispensar(chave)}
      aoAbrirAtivos={() => setTela('ativos')}
      aoSair={() => void sair()}
    />
  ) : (
    <Login />
  );
}
