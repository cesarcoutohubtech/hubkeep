'use client';
// Ativos do hotel (fase 1a, B3; ADR-028 e ADR-029): cadastro com local,
// categoria, campos estendidos da categoria, fabricante, modelo e número de
// série; alteração com a versão vista (se outra pessoa gravou antes, a API
// recusa com conflito_de_versao e a tela recarrega). O local só muda pela
// ação de mover, para outro local do mesmo hotel (B3c), com o histórico das
// movimentações. Cada ativo mostra os anexos (B4) e o QR individual (B5). O
// ativo parado (C5) aparece na lista, com as paradas e o tempo parado
// (calculado no domínio) e o encerramento da parada aberta, que a API só
// aceita da gestão do hotel. Visual do pacote de interface (ADR-038, U4b).
// Compra, garantia e criticidade (fase 1b, I1): o nome de cada nível vem da
// política do hotel (na resposta da lista) ou do catálogo.
import { preencherComModelo } from '@hubkeep/dominio';
import { type Idioma, resolverNome } from '@hubkeep/i18n';
import {
  Botao,
  Campo as CampoDoFormulario,
  Entrada,
  MensagemDeErro,
  MensagemVazia,
  Painel,
  Selecao,
  Selo,
  type TomDeSelo,
} from '@hubkeep/ui';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { AnexosDoRegistro } from '../../../../cliente/AnexosDoRegistro';
import { HistoricoDoRegistro } from '../../../../cliente/HistoricoDoRegistro';
import { QrDoAtivo } from '../../../../cliente/QrDoAtivo';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import {
  type Hotel,
  SeletorDeHotel,
  useHoteis,
  valeParaOHotel,
} from '../../../../cliente/cadastro';
import { CampoDeBusca, comBusca } from '../../../../cliente/CampoDeBusca';
import {
  CamposDaCategoria,
  type DefinicaoDeCampo,
  type ValorDeCampo,
  camposDoFormulario,
} from '../../../../cliente/campos-da-categoria';
import { useIdioma, useMensagemDeErro, useT } from '../../../../i18n/cliente';

const PADRAO = [
  'refrigeracao',
  'eletrica',
  'hidraulica',
  'elevadores',
  'cozinha',
  'lavanderia',
  'mobiliario',
  'eletronicos',
  'piscina',
  'seguranca',
] as const;
type Rotulos = Partial<Record<Idioma, string>>;
const NIVEIS = [1, 2, 3, 4, 5] as const;
type NomesDeCriticidade = Partial<Record<string, Rotulos>>;
const TOM_DA_CRITICIDADE: Record<number, TomDeSelo> = { 4: 'ambar', 5: 'vermelho' };
type Campo = DefinicaoDeCampo;
interface Categoria {
  id: string;
  chavePadrao: string | null;
  nomes: Rotulos;
  campos: Campo[];
  ativa: boolean;
}
interface Local {
  id: string;
  nome: string;
  status: 'ativo' | 'pendente_licenca' | 'inativo';
}
type Valor = ValorDeCampo;
interface Ativo {
  id: string;
  localId: string;
  categoriaId: string | null;
  modeloId: string | null;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  dataCompra: string | null;
  garantiaAte: string | null;
  criticidade: number | null;
  campos: Record<string, Valor>;
  versao: number;
  ativo: boolean;
  codigoQr: string;
  /** Início da parada aberta (C5); null se não está parado. */
  paradoDesde: string | null;
  /** A situação do cadastro (M4) e o motivo da recusa. */
  situacaoCadastro?: 'pendente' | 'aprovado' | 'recusado';
  motivoDaRecusa?: string | null;
}

interface Parada {
  id: string;
  inicio: string;
  fim: string | null;
  tempoParadoMs: number;
}

interface Movimentacao {
  id: string;
  localOrigemId: string;
  localDestinoId: string;
  usuarioId: string;
  nomeUsuario: string | null;
  movidoEm: string;
}

const texto = (f: FormData, campo: string) => {
  const v = String(f.get(campo) ?? '').trim();
  return v === '' ? null : v;
};

/** O modelo de ativo (M1) que o cadastro oferece. */
interface ModeloDeAtivo {
  id: string;
  categoriaId: string;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  campos: Record<string, Valor>;
  ativa: boolean;
  /** PB1b: nulo vale para o grupo. */
  bandeiraId?: string | null;
}

/** O que o formulário mostra: o gravado, ou o rascunho depois de escolher o modelo. */
interface Rascunho {
  localId: string;
  nome: string;
  fabricante: string;
  modelo: string;
  numeroSerie: string;
  dataCompra: string;
  garantiaAte: string;
  criticidade: string;
  campos: Record<string, Valor>;
}

const rascunhoDoAtivo = (a: Ativo | null): Rascunho => ({
  localId: '',
  nome: a?.nome ?? '',
  fabricante: a?.fabricante ?? '',
  modelo: a?.modelo ?? '',
  numeroSerie: a?.numeroSerie ?? '',
  dataCompra: a?.dataCompra ?? '',
  garantiaAte: a?.garantiaAte ?? '',
  criticidade: a?.criticidade === null || a?.criticidade === undefined ? '' : String(a.criticidade),
  campos: a?.campos ?? {},
});

/**
 * Formulário de um ativo, novo ou existente: a categoria escolhida decide os
 * campos. Escolher o modelo (M1) preenche só o que está vazio e nunca
 * sobrescreve (preencherComModelo, do domínio); sem categoria, o ativo fica
 * com a do modelo. Os campos não são controlados: o formulário remonta com o
 * rascunho preenchido. Só os modelos do grupo e os da bandeira do hotel
 * entram na escolha (PB1b); o que o ativo já tem continua.
 */
function FormularioDeAtivo({
  ativo,
  hotel,
  locais,
  categorias,
  modelos,
  nomeDaCategoria,
  nomeDaCriticidade,
  rotulo,
  executar,
}: {
  ativo: Ativo | null;
  hotel: Hotel | undefined;
  locais: readonly Local[];
  categorias: readonly Categoria[];
  modelos: readonly ModeloDeAtivo[];
  nomeDaCategoria: (c: Categoria) => string;
  nomeDaCriticidade: (nivel: number) => string;
  rotulo: (r: Rotulos, reserva: string) => string;
  executar: (caminho: string, init: RequestInit) => Promise<void>;
}) {
  const t = useT();
  const categoria = (id: string | null) => categorias.find((c) => c.id === id) ?? null;
  const [categoriaId, setCategoriaId] = useState<string | null>(ativo?.categoriaId ?? null);
  const [modeloId, setModeloId] = useState<string | null>(ativo?.modeloId ?? null);
  const [rascunho, setRascunho] = useState<Rascunho>(() => rascunhoDoAtivo(ativo));
  const [geracao, setGeracao] = useState(0);
  const formulario = useRef<HTMLFormElement>(null);
  const definicoes = categoria(categoriaId)?.campos ?? [];
  const valorDe = (chave: string) =>
    geracao > 0 || categoriaId === ativo?.categoriaId ? rascunho.campos[chave] : undefined;
  const modelosQueCabem = modelos.filter(
    (m) =>
      (m.ativa &&
        (categoriaId === null || m.categoriaId === categoriaId) &&
        valeParaOHotel(m, hotel)) ||
      m.id === ativo?.modeloId,
  );

  function escolherModelo(id: string) {
    const m = modelos.find((x) => x.id === id);
    if (!m || !formulario.current) {
      setModeloId(null);
      return;
    }
    const f = new FormData(formulario.current);
    const atual = (campo: string) => String(f.get(campo) ?? '');
    const preenchido = preencherComModelo(
      {
        categoriaId,
        nome: atual('nome'),
        fabricante: atual('fabricante'),
        modelo: atual('modelo'),
        campos: camposDoFormulario(f, definicoes),
      },
      m,
      categoria(m.categoriaId)?.campos ?? [],
    );
    setRascunho({
      localId: atual('localId'),
      nome: preenchido.nome,
      fabricante: preenchido.fabricante ?? '',
      modelo: preenchido.modelo ?? '',
      numeroSerie: atual('numeroSerie'),
      dataCompra: atual('dataCompra'),
      garantiaAte: atual('garantiaAte'),
      criticidade: atual('criticidade'),
      campos: preenchido.campos,
    });
    setCategoriaId(preenchido.categoriaId);
    setModeloId(m.id);
    setGeracao((g) => g + 1);
  }

  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const gravacao = {
      categoriaId,
      nome: texto(f, 'nome') ?? '',
      fabricante: texto(f, 'fabricante'),
      modelo: texto(f, 'modelo'),
      numeroSerie: texto(f, 'numeroSerie'),
      dataCompra: texto(f, 'dataCompra'),
      garantiaAte: texto(f, 'garantiaAte'),
      criticidade: texto(f, 'criticidade') === null ? null : Number(texto(f, 'criticidade')),
      campos: camposDoFormulario(f, definicoes),
      modeloId,
    };
    void (ativo
      ? executar(`/api/v1/ativos/${ativo.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...gravacao, versao: ativo.versao }),
        })
      : executar('/api/v1/ativos', {
          method: 'POST',
          body: JSON.stringify({ ...gravacao, localId: texto(f, 'localId') ?? '' }),
        }));
  }

  return (
    <form key={geracao} ref={formulario} onSubmit={enviar} className="hk-em-linha">
      {!ativo && (
        <CampoDoFormulario rotulo={t('admin.ativos.campo.local')}>
          {(p) => (
            <Selecao {...p} name="localId" defaultValue={rascunho.localId || undefined} required>
              {locais
                .filter((l) => l.status !== 'inativo')
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
            </Selecao>
          )}
        </CampoDoFormulario>
      )}
      <CampoDoFormulario rotulo={t('admin.ativos.campo.nome')}>
        {(p) => <Entrada {...p} name="nome" defaultValue={rascunho.nome} required />}
      </CampoDoFormulario>
      {modelosQueCabem.length > 0 && (
        <CampoDoFormulario rotulo={t('admin.ativos.campo.modelo_de_ativo')}>
          {(p) => (
            <Selecao {...p} value={modeloId ?? ''} onChange={(e) => escolherModelo(e.target.value)}>
              <option value="">{t('admin.ativos.sem_modelo')}</option>
              {modelosQueCabem.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </Selecao>
          )}
        </CampoDoFormulario>
      )}
      <CampoDoFormulario rotulo={t('admin.ativos.campo.categoria')}>
        {(p) => (
          <Selecao
            {...p}
            value={categoriaId ?? ''}
            onChange={(e) => {
              const nova = e.target.value || null;
              setCategoriaId(nova);
              // O modelo é de uma categoria só: trocar a categoria tira o modelo.
              if (modelos.find((m) => m.id === modeloId)?.categoriaId !== nova) setModeloId(null);
            }}
          >
            <option value="">{t('admin.ativos.sem_categoria')}</option>
            {categorias
              .filter((c) => c.ativa || c.id === ativo?.categoriaId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {nomeDaCategoria(c)}
                </option>
              ))}
          </Selecao>
        )}
      </CampoDoFormulario>
      {(['fabricante', 'modelo', 'numeroSerie'] as const).map((campo) => (
        <CampoDoFormulario key={campo} rotulo={t(`admin.ativos.campo.${campo}`)}>
          {(p) => <Entrada {...p} name={campo} defaultValue={rascunho[campo]} />}
        </CampoDoFormulario>
      ))}
      {(['dataCompra', 'garantiaAte'] as const).map((campo) => (
        <CampoDoFormulario key={campo} rotulo={t(`admin.ativos.campo.${campo}`)}>
          {(p) => <Entrada {...p} type="date" name={campo} defaultValue={rascunho[campo]} />}
        </CampoDoFormulario>
      ))}
      <CampoDoFormulario rotulo={t('admin.ativos.campo.criticidade')}>
        {(p) => (
          <Selecao {...p} name="criticidade" defaultValue={rascunho.criticidade}>
            <option value="">{t('admin.ativos.sem_criticidade')}</option>
            {NIVEIS.map((n) => (
              <option key={n} value={n}>
                {t('ativo.criticidade.opcao', { nivel: n, nome: nomeDaCriticidade(n) })}
              </option>
            ))}
          </Selecao>
        )}
      </CampoDoFormulario>
      <CamposDaCategoria
        definicoes={definicoes}
        valorDe={valorDe}
        rotulo={rotulo}
        prefixoDaChave={`${geracao}|${categoriaId}`}
      />
      <div className="hk-linha-de-botoes">
        <Botao type="submit" variante={ativo ? 'padrao' : 'primario'}>
          {ativo ? t('admin.ativos.acao.salvar') : t('admin.ativos.acao.cadastrar')}
        </Botao>
        {ativo && (
          <Botao
            onClick={() =>
              void executar(
                `/api/v1/ativos/${ativo.id}/${ativo.ativo ? 'desativacao' : 'reativacao'}`,
                { method: 'POST', body: JSON.stringify({ versao: ativo.versao }) },
              )
            }
          >
            {ativo.ativo ? t('admin.ativos.acao.desativar') : t('admin.ativos.acao.reativar')}
          </Botao>
        )}
      </div>
    </form>
  );
}

/** Mover o ativo para outro local do hotel (B3c) e ver as movimentações. */
function MoverAtivo({
  ativo,
  locais,
  executar,
}: {
  ativo: Ativo;
  locais: readonly Local[];
  executar: (caminho: string, init: RequestInit) => Promise<void>;
}) {
  const t = useT();
  const intl = useIntl();
  const mensagemDeErro = useMensagemDeErro();
  const [historico, setHistorico] = useState<Movimentacao[] | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const nomeDoLocal = (id: string) => locais.find((l) => l.id === id)?.nome ?? id;
  const destinos = locais.filter((l) => l.status !== 'inativo' && l.id !== ativo.localId);

  function mover(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const localDestinoId = String(new FormData(ev.currentTarget).get('localDestinoId') ?? '');
    void executar(`/api/v1/ativos/${ativo.id}/movimentacao`, {
      method: 'POST',
      body: JSON.stringify({ localDestinoId, versao: ativo.versao }),
    });
  }

  async function verHistorico() {
    const r = await chamarApi<{ movimentacoes: Movimentacao[] }>(
      `/api/v1/ativos/${ativo.id}/movimentacoes`,
    );
    if (r.ok) setHistorico(r.dados.movimentacoes);
    else setErro(r.erro);
  }

  return (
    <div className="hk-bloco">
      <div className="hk-em-linha">
        {ativo.ativo && destinos.length > 0 && (
          <form onSubmit={mover} className="hk-em-linha">
            <Selecao name="localDestinoId" aria-label={t('admin.ativos.mover.destino')} required>
              {destinos.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </Selecao>
            <Botao type="submit" tamanho="pequeno">
              {t('admin.ativos.acao.mover')}
            </Botao>
          </form>
        )}
        <Botao tamanho="pequeno" onClick={() => void verHistorico()}>
          {t('admin.ativos.acao.ver_movimentacoes')}
        </Botao>
      </div>
      {erro && <MensagemDeErro>{mensagemDeErro(erro)}</MensagemDeErro>}
      {historico &&
        (historico.length === 0 ? (
          <p className="hk-suave">{t('admin.ativos.mover.sem_movimentacoes')}</p>
        ) : (
          <ol className="hk-tempo">
            {historico.map((m) => (
              <li key={m.id}>
                {t('admin.ativos.mover.linha', {
                  origem: nomeDoLocal(m.localOrigemId),
                  destino: nomeDoLocal(m.localDestinoId),
                  quem: m.nomeUsuario ?? m.usuarioId,
                  quando: intl.formatDate(m.movidoEm, { dateStyle: 'short', timeStyle: 'short' }),
                })}
              </li>
            ))}
          </ol>
        ))}
    </div>
  );
}

/** O ativo parado (C5): as paradas com o tempo parado e o encerramento da aberta. */
function ParadasDoAtivo({
  ativo,
  executar,
}: {
  ativo: Ativo;
  executar: (caminho: string, init: RequestInit) => Promise<void>;
}) {
  const t = useT();
  const intl = useIntl();
  const mensagemDeErro = useMensagemDeErro();
  const [paradas, setParadas] = useState<{ paradas: Parada[]; tempoParadoMs: number } | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const quando = (iso: string) => intl.formatDate(iso, { dateStyle: 'short', timeStyle: 'short' });
  const duracao = (ms: number) => {
    const minutos = Math.floor(ms / 60_000);
    return t('admin.ativos.parada.duracao', {
      horas: Math.floor(minutos / 60),
      minutos: minutos % 60,
    });
  };

  async function verParadas() {
    const r = await chamarApi<{ paradas: Parada[]; tempoParadoMs: number }>(
      `/api/v1/ativos/${ativo.id}/paradas`,
    );
    if (r.ok) setParadas(r.dados);
    else setErro(r.erro);
  }

  const aberta = paradas?.paradas.find((p) => p.fim === null);
  return (
    <div className="hk-bloco" {...(ativo.paradoDesde ? { 'data-tom': 'atencao' } : {})}>
      <div className="hk-linha-de-botoes">
        <Botao tamanho="pequeno" onClick={() => void verParadas()}>
          {t('admin.ativos.acao.ver_paradas')}
        </Botao>
        {aberta && (
          <Botao
            tamanho="pequeno"
            variante="ambar"
            onClick={() =>
              void executar(`/api/v1/paradas/${aberta.id}/encerramento`, {
                method: 'POST',
                body: JSON.stringify({}),
              })
            }
          >
            {t('admin.ativos.acao.encerrar_parada')}
          </Botao>
        )}
      </div>
      {erro && <MensagemDeErro>{mensagemDeErro(erro)}</MensagemDeErro>}
      {paradas &&
        (paradas.paradas.length === 0 ? (
          <p className="hk-suave">{t('admin.ativos.parada.sem_paradas')}</p>
        ) : (
          <>
            <ul className="hk-sublista">
              {paradas.paradas.map((p) => (
                <li key={p.id}>
                  {p.fim === null
                    ? t('admin.ativos.parada.aberta', {
                        inicio: quando(p.inicio),
                        duracao: duracao(p.tempoParadoMs),
                      })
                    : t('admin.ativos.parada.encerrada', {
                        inicio: quando(p.inicio),
                        fim: quando(p.fim),
                        duracao: duracao(p.tempoParadoMs),
                      })}
                </li>
              ))}
            </ul>
            <p className="hk-suave">
              {t('admin.ativos.parada.total', { duracao: duracao(paradas.tempoParadoMs) })}
            </p>
          </>
        ))}
    </div>
  );
}

interface PlanoDoAtivo {
  id: string;
  nome: string;
  intervalo: number;
  unidade: string;
  situacao: 'ativo' | 'pausado' | 'encerrado';
  proximaData: string | null;
  /** O que a tela avisa (PV3c): o modelo de checklist desativado e o responsável que deixou de valer. */
  pendencias: ('checklist_inativo' | 'responsavel_invalido')[];
}

/** Os planos preventivos do ativo (PV2), sob demanda; quem não gere o hotel recebe a lista vazia. */
function PlanosDoAtivo({ ativo }: { ativo: Ativo }) {
  const t = useT();
  const intl = useIntl();
  const mensagemDeErro = useMensagemDeErro();
  const [planos, setPlanos] = useState<PlanoDoAtivo[] | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const data = (d: string) =>
    intl.formatDate(new Date(`${d}T12:00:00Z`), { dateStyle: 'short', timeZone: 'UTC' });

  async function ver() {
    const r = await chamarApi<{ planos: PlanoDoAtivo[] }>(
      `/api/v1/ativos/${ativo.id}/planos-preventivos`,
    );
    if (r.ok) setPlanos(r.dados.planos);
    else setErro(r.erro);
  }

  return (
    <div className="hk-bloco">
      <div className="hk-linha-de-botoes">
        <Botao tamanho="pequeno" onClick={() => void ver()}>
          {t('admin.ativos.acao.ver_planos')}
        </Botao>
      </div>
      {erro && <MensagemDeErro>{mensagemDeErro(erro)}</MensagemDeErro>}
      {planos &&
        (planos.length === 0 ? (
          <p className="hk-suave">{t('admin.preventivas.do_ativo_vazio')}</p>
        ) : (
          <ul className="hk-sublista" aria-label={t('admin.preventivas.do_ativo')}>
            {planos.map((p) => (
              <li key={p.id} className="hk-em-linha">
                <span>{p.nome}</span>
                <span>
                  {t('admin.preventivas.periodicidade', {
                    intervalo: p.intervalo,
                    unidade: p.unidade,
                  })}
                </span>
                <span>
                  {p.proximaData
                    ? t('admin.preventivas.proxima', { data: data(p.proximaData) })
                    : t('admin.preventivas.sem_proxima')}
                </span>
                <Selo
                  tom={
                    p.situacao === 'ativo' ? 'verde' : p.situacao === 'pausado' ? 'ambar' : 'cinza'
                  }
                >
                  {t('admin.preventivas.situacao', { situacao: p.situacao })}
                </Selo>
                {p.pendencias.map((pendencia) => (
                  <Selo key={pendencia} tom="ambar">
                    {t('admin.preventivas.pendencia', { pendencia })}
                  </Selo>
                ))}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

export default function AtivosDoHotel() {
  const t = useT();
  const intl = useIntl();
  const { idioma } = useIdioma();
  const { hoteis, hotelId, setHotelId, erro: erroDosHoteis } = useHoteis();
  const [locais, setLocais] = useState<Local[]>([]);
  const [categorias, setCategorias] = useState<{
    idiomaPadrao: Idioma;
    categorias: Categoria[];
  } | null>(null);
  const [ativos, setAtivos] = useState<Ativo[] | null>(null);
  const [modelos, setModelos] = useState<ModeloDeAtivo[]>([]);
  const [nomesDeCriticidade, setNomesDeCriticidade] = useState<NomesDeCriticidade>({});
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  useEffect(() => {
    void chamarApi<{ idiomaPadrao: Idioma; categorias: Categoria[] }>(
      '/api/v1/categorias-de-ativo',
    ).then((r) => (r.ok ? setCategorias(r.dados) : setAviso({ tipo: 'erro', erro: r.erro })));
    // Os modelos de ativo (M1) são opcionais no cadastro: sem eles, a escolha some.
    void chamarApi<{ modelos: ModeloDeAtivo[] }>('/api/v1/modelos-de-ativo').then((r) => {
      if (r.ok) setModelos(r.dados.modelos);
    });
  }, []);

  const carregar = useCallback(async () => {
    if (!hotelId) return;
    const [l, a] = await Promise.all([
      chamarApi<{ locais: Local[] }>(`/api/v1/hoteis/${hotelId}/locais`),
      chamarApi<{ ativos: Ativo[]; nomesDeCriticidade: NomesDeCriticidade }>(
        comBusca(`/api/v1/hoteis/${hotelId}/ativos`, busca),
      ),
    ]);
    if (l.ok) setLocais(l.dados.locais);
    if (a.ok) {
      setAtivos(a.dados.ativos);
      setNomesDeCriticidade(a.dados.nomesDeCriticidade);
    }
    if (!l.ok) setAviso({ tipo: 'erro', erro: l.erro });
    else if (!a.ok) setAviso({ tipo: 'erro', erro: a.erro });
  }, [hotelId, busca]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function executar(caminho: string, init: RequestInit) {
    const r = await chamarApi<unknown>(caminho, init);
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregar();
  }

  const idiomaPadrao = categorias?.idiomaPadrao ?? 'pt-BR';
  const doCatalogo = (chave: string | null) =>
    chave && (PADRAO as readonly string[]).includes(chave)
      ? t(`categoria_ativo.padrao.${chave as (typeof PADRAO)[number]}` as const)
      : null;
  const nomeDaCategoria = (c: Categoria) =>
    resolverNome(c.nomes, idioma, { doCatalogo: doCatalogo(c.chavePadrao), idiomaPadrao }) ?? c.id;
  const rotulo = (r: Rotulos, reserva: string) =>
    resolverNome(r, idioma, { idiomaPadrao }) ?? reserva;
  const nomeDaCriticidade = (nivel: number) =>
    resolverNome(nomesDeCriticidade[String(nivel)] ?? {}, idioma, {
      doCatalogo: t('ativo.criticidade.nivel', { nivel }),
      idiomaPadrao,
    }) ?? String(nivel);
  const nomeDoLocal = (id: string) => locais.find((l) => l.id === id)?.nome ?? id;

  return (
    <div className="hk-pilha">
      <div className="hk-filtros">
        <SeletorDeHotel
          rotulo={t('admin.ativos.escolher_hotel')}
          hoteis={hoteis}
          valor={hotelId}
          aoEscolher={setHotelId}
        />
      </div>
      <Aviso aviso={erroDosHoteis ? { tipo: 'erro', erro: erroDosHoteis } : aviso} />
      {!ativos || !categorias ? (
        <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : (
        <>
          <Painel titulo={t('admin.ativos.novo')}>
            <FormularioDeAtivo
              key={hotelId}
              ativo={null}
              hotel={hoteis.find((h) => h.id === hotelId)}
              locais={locais}
              categorias={categorias.categorias}
              modelos={modelos}
              nomeDaCategoria={nomeDaCategoria}
              nomeDaCriticidade={nomeDaCriticidade}
              rotulo={rotulo}
              executar={executar}
            />
          </Painel>
          <Painel titulo={t('admin.ativos.cadastrados')}>
            <CampoDeBusca
              aoBuscar={(termo) => {
                setAviso(null);
                setBusca(termo);
              }}
            />
            {ativos.length === 0 ? (
              <MensagemVazia>
                {busca === ''
                  ? t('admin.ativos.vazio')
                  : t('comum.busca.sem_resultado', { termo: busca })}
              </MensagemVazia>
            ) : (
              <ul className="hk-lista hk-itens">
                {ativos.map((a) => (
                  <li key={`${a.id}|${a.versao}|${a.paradoDesde ?? ''}`}>
                    <div className="hk-item-cabecalho">
                      <strong>{a.nome}</strong>
                      <span className="hk-suave">
                        {t('admin.ativos.no_local', { local: nomeDoLocal(a.localId) })}
                      </span>
                      {a.paradoDesde && (
                        <span data-parado-desde={a.paradoDesde}>
                          <Selo tom="vermelho">
                            {t('admin.ativos.parado_desde', {
                              quando: intl.formatDate(a.paradoDesde, {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              }),
                            })}
                          </Selo>
                        </span>
                      )}
                      {a.criticidade !== null && (
                        <Selo tom={TOM_DA_CRITICIDADE[a.criticidade] ?? 'cinza'}>
                          {t('ativo.criticidade.opcao', {
                            nivel: a.criticidade,
                            nome: nomeDaCriticidade(a.criticidade),
                          })}
                        </Selo>
                      )}
                      {!a.ativo && <Selo tom="cinza">{t('admin.ativos.desativado')}</Selo>}
                      {a.situacaoCadastro === 'pendente' && (
                        <Selo tom="ambar">{t('admin.ativos.cadastro_pendente')}</Selo>
                      )}
                      {a.situacaoCadastro === 'recusado' && (
                        <Selo tom="cinza">
                          {t('admin.ativos.cadastro_recusado', { motivo: a.motivoDaRecusa ?? '' })}
                        </Selo>
                      )}
                    </div>
                    <FormularioDeAtivo
                      ativo={a}
                      hotel={hoteis.find((h) => h.id === hotelId)}
                      locais={locais}
                      categorias={categorias.categorias}
                      modelos={modelos}
                      nomeDaCategoria={nomeDaCategoria}
                      nomeDaCriticidade={nomeDaCriticidade}
                      rotulo={rotulo}
                      executar={executar}
                    />
                    <ParadasDoAtivo ativo={a} executar={executar} />
                    <PlanosDoAtivo ativo={a} />
                    <MoverAtivo ativo={a} locais={locais} executar={executar} />
                    <div className="hk-grade" data-colunas="2">
                      <QrDoAtivo ativo={a} />
                      <AnexosDoRegistro entidade="ativo" registroId={a.id} />
                    </div>
                    <HistoricoDoRegistro entidade="ativo" registroId={a.id} />
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        </>
      )}
    </div>
  );
}
