// Casca do PWA do técnico (F0-11). Abre sem rede: a sessão, o idioma e a fila
// ficam no aparelho. A fila é enviada ao abrir, depois de cada operação,
// quando a rede volta (evento online) e a cada 30 s enquanto houver pendência.
// Tudo o que a fila lê, mostra, envia ou apaga é do usuário da sessão (ADR-025).
// A referência (hotéis, locais, categorias e ativos, B3b) é relida da API com
// sessão e rede e depois de cada envio que tirou algo da fila; sem rede, vale
// a guardada no aparelho. O QR impresso (B5) abre em /q/<codigo>: depois do
// login e da leitura da referência guardada, o ativo abre pelo aparelho, ou
// pela API com rede (qr.ts); o caminho volta para / em seguida. A abertura
// de chamado (C2) também vai pela fila (chamado.abrir).
// A fila do dia (C4b) é relida da API junto com a referência e guardada no
// aparelho; a tela mostra a guardada com a fila de operações por cima
// (os/projecao.ts). As ações da OS, as horas, o material e as fotos vão pela
// fila, na ordem em que foram feitos, e a parada do ativo (C5) também. O
// espaço do aparelho (persistência, aviso de pendência antiga, teto das fotos)
// está em armazenamento.ts.
import { RegraViolada } from '@hubkeep/dominio';
import { type IdiomaDeExibicao, PSEUDO_IDIOMA, ehIdioma } from '@hubkeep/i18n';
import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { type Credenciais, criarEnvio, lerOsDoDia, lerPreferencias, lerReferencia } from './api';
import { type FilaDeOperacoes, type OperacaoNaFila, abrirFila } from './fila/banco';
import { type OsDoDiaDoAparelho, type OsDoDiaGuardadas, abrirOsDoDia } from './os/banco';
import { type AcaoDoTecnico, type OsNoAparelho, projetarOs } from './os/projecao';
import {
  type AtivoGuardado,
  type Referencia,
  type ReferenciaDoAparelho,
  abrirReferencia,
} from './referencia/banco';
import { sincronizar } from './fila/sincronizar';
import { ProvedorDeIdioma, guardarIdioma, idiomaInicial } from './i18n';
import { apagarDadosLocais, podeApagar } from './saida';
import {
  conferirEspacoParaFoto,
  faltouEspaco,
  pedirPersistencia,
  pendenteAntigaDesde,
  tamanhoDaFoto,
} from './armazenamento';
import { supabase, tenantDaSessao } from './sessao';
import { criarEnvioDeFoto, criarFotos, fotoParaFila } from './anexos/fotos';
import { abrirQr, codigoDoCaminho } from './qr';
import {
  Ativos,
  type AtivoAberto,
  type CadastroPendente,
  type GravacaoDeAtivo,
} from './telas/Ativos';
import { AbrirChamado, type AberturaDeChamado } from './telas/AbrirChamado';
import { type EstadoDaFila, FilaDoDia, useMotivo } from './telas/FilaDoDia';
import { Login } from './telas/Login';
import { Os } from './telas/Os';

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
  const motivo = useMotivo();
  const [sessao, setSessao] = useState<Session | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [estado, setEstado] = useState<EstadoDaFila>(FILA_VAZIA);
  const fila = useRef<FilaDeOperacoes | null>(null);
  const guardada = useRef<ReferenciaDoAparelho | null>(null);
  const [referencia, setReferencia] = useState<Referencia | null>(null);
  const [cadastrosPendentes, setCadastrosPendentes] = useState<CadastroPendente[]>([]);
  const [tela, setTela] = useState<'fila' | 'ativos' | 'chamado' | 'os'>('fila');
  const guardadasDoDia = useRef<OsDoDiaDoAparelho | null>(null);
  const [osDoDia, setOsDoDia] = useState<OsDoDiaGuardadas | null>(null);
  const [minhas, setMinhas] = useState<OperacaoNaFila[]>([]);
  const [osAberta, setOsAberta] = useState<string | null>(null);
  const [referenciaLida, setReferenciaLida] = useState(false);
  const [qr, setQr] = useState<string | null>(() => codigoDoCaminho(window.location.pathname));
  const [aberto, setAberto] = useState<AtivoAberto | null>(null);
  const [avisoDoQr, setAvisoDoQr] = useState<string | null>(null);
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
  const envio = useMemo(
    () => criarEnvio(credenciais, fetch, criarEnvioDeFoto(credenciais)),
    [credenciais],
  );
  const os = useMemo<OsNoAparelho[] | null>(
    () => (osDoDia ? projetarOs(osDoDia.os, minhas) : null),
    [osDoDia, minhas],
  );

  const atualizarEstado = useCallback(async () => {
    const usuarioId = sessaoAtual.current?.user.id;
    const minhas = usuarioId && fila.current ? await fila.current.doUsuario(usuarioId) : [];
    setMinhas(minhas);
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
      antigaDesde: pendenteAntigaDesde(minhas, Date.now()),
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
    if (guardada.current) setReferenciaLida(true);
    setOsDoDia(
      usuarioId && tenantId && guardadasDoDia.current
        ? await guardadasDoDia.current.ler(usuarioId, tenantId)
        : null,
    );
  }, []);

  /** Relê da API e guarda (a referência e a fila do dia); sem rede ou com erro, fica a guardada. */
  const atualizarReferencia = useCallback(async () => {
    const [nova, novasOs] = await Promise.all([
      lerReferencia(credenciais),
      lerOsDoDia(credenciais),
    ]);
    const usuarioId = sessaoAtual.current?.user.id;
    if (nova && nova.usuarioId === usuarioId) {
      await guardada.current?.gravar(nova);
      setReferencia(nova);
    }
    if (novasOs && novasOs.usuarioId === usuarioId) {
      await guardadasDoDia.current?.gravar(novasOs);
      setOsDoDia(novasOs);
    }
  }, [credenciais]);

  const enviarFila = useCallback(
    async (ignorarEspera = false) => {
      const usuarioId = sessaoAtual.current?.user.id;
      if (!fila.current || !usuarioId) return;
      const antes = (await fila.current.doUsuario(usuarioId)).length;
      await sincronizar(fila.current, envio, { usuarioId, ignorarEspera });
      await atualizarEstado();
      if ((await fila.current.doUsuario(usuarioId)).length < antes) await atualizarReferencia();
    },
    [atualizarEstado, atualizarReferencia, envio],
  );

  useEffect(() => {
    void abrirFila().then(async (f) => {
      fila.current = f;
      await atualizarEstado();
    });
    void Promise.all([abrirReferencia(), abrirOsDoDia()]).then(async ([r, o]) => {
      guardada.current = r;
      guardadasDoDia.current = o;
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

  // Ao entrar: pede ao navegador para não descartar a fila (adendo ao ADR-025, (a)).
  useEffect(() => {
    if (sessao) void pedirPersistencia();
  }, [sessao]);

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

  // QR (B5): só depois do login e da leitura da guardada, para não dizer
  // "sem rede" antes de olhar o aparelho.
  useEffect(() => {
    if (!sessao || qr === null || !referenciaLida) return;
    const codigo = qr;
    setQr(null);
    window.history.replaceState(null, '', '/');
    void abrirQr(codigo, { referencia, online, credenciais }).then((r) => {
      if (r.tipo === 'erro') return setAvisoDoQr(r.codigo);
      setAvisoDoQr(null);
      setAberto({ hotelId: r.hotelId, ativo: r.ativo });
      setTela('ativos');
    });
  }, [sessao, qr, referenciaLida, referencia, online, credenciais]);

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

  /** A chave nasce no aparelho: o reenvio não duplica o chamado (ADR-025). */
  async function abrirChamado(pedido: AberturaDeChamado) {
    const usuarioId = sessaoAtual.current?.user.id;
    if (!fila.current || !usuarioId) return;
    await fila.current.enfileirar({ usuarioId, tipo: 'chamado.abrir', dados: pedido }, Date.now());
    await atualizarEstado();
    void enviarFila();
  }

  /** Enfileira e já tenta enviar; a tela da OS se atualiza pela projeção. */
  async function enfileirar(op: Pick<OperacaoNaFila, 'tipo' | 'dados'>) {
    const usuarioId = sessaoAtual.current?.user.id;
    if (!fila.current || !usuarioId) return;
    await fila.current.enfileirar({ usuarioId, ...op }, Date.now());
    await atualizarEstado();
    void enviarFila();
  }

  /** A transição leva a versão da OS no aparelho (a guardada mais as transições na fila). */
  const agirNaOs = (o: OsNoAparelho, acao: AcaoDoTecnico) =>
    enfileirar({ tipo: `os.${acao}`, dados: { osId: o.id, versao: o.versao } });

  const apontarHoras = (osId: string, inicio: Date, fim: Date) =>
    enfileirar({
      tipo: 'os.apontar_horas',
      dados: { osId, inicio: inicio.toISOString(), fim: fim.toISOString() },
    });

  const registrarMaterial = (osId: string, descricao: string) =>
    enfileirar({ tipo: 'os.registrar_material', dados: { osId, descricao } });

  /** Parada do ativo do chamado (C5), na hora do aparelho; o servidor confere de novo. */
  const registrarParada = (osId: string) =>
    enfileirar({
      tipo: 'os.registrar_parada',
      dados: { osId, inicio: new Date().toISOString(), fim: null },
    });

  const encerrarParada = (osId: string) =>
    enfileirar({ tipo: 'os.encerrar_parada', dados: { osId, fim: new Date().toISOString() } });

  /** A foto entra comprimida e só abaixo do teto de espaço (adendo ao ADR-025, (b)). */
  async function fotografarOs(osId: string, arquivo: File) {
    const usuarioId = sessaoAtual.current?.user.id;
    if (!fila.current || !usuarioId) return;
    let dados;
    try {
      dados = await fotoParaFila(osId, arquivo, arquivo.name || null);
    } catch {
      throw new RegraViolada('foto_ilegivel', 'Foto ilegível.');
    }
    await conferirEspacoParaFoto(await fila.current.doUsuario(usuarioId), tamanhoDaFoto(dados));
    try {
      await enfileirar({ tipo: 'anexo.foto', dados });
    } catch (erro) {
      if (faltouEspaco(erro)) throw new RegraViolada('espaco_insuficiente', 'Sem espaço.');
      throw erro;
    }
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
      const confirmou = await podeApagar(fila.current, usuarioId, (n) =>
        window.confirm(intl.formatMessage({ id: 'tecnico.sair.pendentes' }, { n })),
      );
      if (!confirmou) return;
      await apagarDadosLocais(
        fila.current,
        usuarioId,
        undefined,
        guardada.current,
        guardadasDoDia.current,
      );
    }
    await supabase().auth.signOut();
    setEstado(FILA_VAZIA);
    setReferencia(null);
    setOsDoDia(null);
    setMinhas([]);
    setOsAberta(null);
    setCadastrosPendentes([]);
    setAberto(null);
    setTela('fila');
  }

  if (sessao && tela === 'ativos') {
    return (
      <Ativos
        key={aberto?.ativo.id ?? 'lista'}
        aberto={aberto}
        idioma={props.idioma}
        referencia={referencia}
        pendentes={cadastrosPendentes}
        aoCadastrar={cadastrarAtivo}
        aoAlterar={alterarAtivo}
        aoVoltar={() => {
          setAberto(null);
          setTela('fila');
        }}
        fotos={fotos}
        online={online}
      />
    );
  }

  const aberta = os?.find((o) => o.id === osAberta);
  if (sessao && tela === 'os' && aberta) {
    return (
      <Os
        os={aberta}
        aoAgir={agirNaOs}
        aoApontar={apontarHoras}
        aoRegistrarMaterial={registrarMaterial}
        aoFotografar={fotografarOs}
        aoRegistrarParada={registrarParada}
        aoEncerrarParada={encerrarParada}
        aoVoltar={() => {
          setOsAberta(null);
          setTela('fila');
        }}
      />
    );
  }

  if (sessao && tela === 'chamado') {
    return (
      <AbrirChamado
        referencia={referencia}
        aoAbrir={abrirChamado}
        aoVoltar={() => setTela('fila')}
      />
    );
  }

  return sessao ? (
    <>
      {avisoDoQr && <p role="alert">{motivo(avisoDoQr)}</p>}
      <FilaDoDia
        idioma={props.idioma}
        online={online}
        fila={estado}
        os={os}
        lidaEm={osDoDia?.lidaEm ?? null}
        aoAbrirOs={(id) => {
          setOsAberta(id);
          setTela('os');
        }}
        aoTrocarIdioma={(i) => void trocarIdioma(i)}
        aoEnviarAgora={() => void enviarFila(true)}
        aoDispensar={(chave) => void dispensar(chave)}
        aoAbrirAtivos={() => {
          setAvisoDoQr(null);
          setTela('ativos');
        }}
        aoAbrirChamado={() => setTela('chamado')}
        aoSair={() => void sair()}
      />
    </>
  ) : (
    <Login />
  );
}
