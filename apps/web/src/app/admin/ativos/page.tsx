'use client';
// Ativos do hotel (fase 1a, B3; ADR-028 e ADR-029): cadastro com local,
// categoria, campos estendidos da categoria, fabricante, modelo e número de
// série; alteração com a versão vista (se outra pessoa gravou antes, a API
// recusa com conflito_de_versao e a tela recarrega). O local só muda pela
// ação de mover, para outro local do mesmo hotel (B3c), com o histórico das
// movimentações. Cada ativo mostra os anexos (B4) e o QR individual (B5). Tela funcional, sem
// acabamento: o layout vem do protótipo.
import { type Idioma, resolverNome } from '@hubkeep/i18n';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { AnexosDoRegistro } from '../../../cliente/AnexosDoRegistro';
import { QrDoAtivo } from '../../../cliente/QrDoAtivo';
import { type ErroDaApi, chamarApi } from '../../../cliente/api';
import { CampoDeBusca, comBusca } from '../../../cliente/CampoDeBusca';
import { useIdioma, useMensagemDeErro, useT } from '../../../i18n/cliente';

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
interface Campo {
  chave: string;
  tipo: 'texto' | 'numero' | 'data' | 'lista' | 'sim_nao';
  obrigatorio: boolean;
  rotulos: Rotulos;
  unidade: string | null;
  opcoes: { chave: string; rotulos: Rotulos }[];
}
interface Categoria {
  id: string;
  chavePadrao: string | null;
  nomes: Rotulos;
  campos: Campo[];
  ativa: boolean;
}
interface Hotel {
  id: string;
  nome: string;
}
interface Local {
  id: string;
  nome: string;
  status: 'ativo' | 'pendente_licenca' | 'inativo';
}
type Valor = string | number | boolean;
interface Ativo {
  id: string;
  localId: string;
  categoriaId: string | null;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  campos: Record<string, Valor>;
  versao: number;
  ativo: boolean;
  codigoQr: string;
}

interface Movimentacao {
  id: string;
  localOrigemId: string;
  localDestinoId: string;
  usuarioId: string;
  nomeUsuario: string | null;
  movidoEm: string;
}

type Aviso = { tipo: 'ok' } | { tipo: 'erro'; erro: ErroDaApi };

const texto = (f: FormData, campo: string) => {
  const v = String(f.get(campo) ?? '').trim();
  return v === '' ? null : v;
};

/** Valores dos campos estendidos do formulário, no tipo de cada definição; vazio fica de fora. */
function camposDoFormulario(f: FormData, definicoes: readonly Campo[]): Record<string, Valor> {
  const saida: Record<string, Valor> = {};
  for (const d of definicoes) {
    const nome = `campo.${d.chave}`;
    if (d.tipo === 'sim_nao') {
      const v = f.get(nome);
      if (v === 'sim' || v === 'nao') saida[d.chave] = v === 'sim';
      continue;
    }
    const v = texto(f, nome);
    if (v === null) continue;
    saida[d.chave] = d.tipo === 'numero' ? Number(v) : v;
  }
  return saida;
}

/** Formulário de um ativo, novo ou existente: a categoria escolhida decide os campos. */
function FormularioDeAtivo({
  ativo,
  locais,
  categorias,
  nomeDaCategoria,
  rotulo,
  executar,
}: {
  ativo: Ativo | null;
  locais: readonly Local[];
  categorias: readonly Categoria[];
  nomeDaCategoria: (c: Categoria) => string;
  rotulo: (r: Rotulos, reserva: string) => string;
  executar: (caminho: string, init: RequestInit) => Promise<void>;
}) {
  const t = useT();
  const categoria = (id: string | null) => categorias.find((c) => c.id === id) ?? null;
  const nomeDoLocal = (id: string) => locais.find((l) => l.id === id)?.nome ?? id;
  const [categoriaId, setCategoriaId] = useState<string | null>(ativo?.categoriaId ?? null);
  const definicoes = categoria(categoriaId)?.campos ?? [];
  const valorDe = (chave: string) =>
    categoriaId === ativo?.categoriaId ? ativo?.campos[chave] : undefined;

  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const gravacao = {
      categoriaId,
      nome: texto(f, 'nome') ?? '',
      fabricante: texto(f, 'fabricante'),
      modelo: texto(f, 'modelo'),
      numeroSerie: texto(f, 'numeroSerie'),
      campos: camposDoFormulario(f, definicoes),
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
    <form onSubmit={enviar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {ativo ? (
        <small>{t('admin.ativos.no_local', { local: nomeDoLocal(ativo.localId) })}</small>
      ) : (
        <select name="localId" aria-label={t('admin.ativos.campo.local')} required>
          {locais
            .filter((l) => l.status !== 'inativo')
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
        </select>
      )}
      <input
        name="nome"
        defaultValue={ativo?.nome ?? ''}
        placeholder={t('admin.ativos.campo.nome')}
        aria-label={t('admin.ativos.campo.nome')}
        required
      />
      <select
        aria-label={t('admin.ativos.campo.categoria')}
        value={categoriaId ?? ''}
        onChange={(e) => setCategoriaId(e.target.value || null)}
      >
        <option value="">{t('admin.ativos.sem_categoria')}</option>
        {categorias
          .filter((c) => c.ativa || c.id === ativo?.categoriaId)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {nomeDaCategoria(c)}
            </option>
          ))}
      </select>
      {(['fabricante', 'modelo', 'numeroSerie'] as const).map((campo) => (
        <input
          key={campo}
          name={campo}
          defaultValue={ativo?.[campo] ?? ''}
          placeholder={t(`admin.ativos.campo.${campo}`)}
          aria-label={t(`admin.ativos.campo.${campo}`)}
        />
      ))}
      {definicoes.map((d) => {
        const nome = `campo.${d.chave}`;
        const etiqueta = rotulo(d.rotulos, d.chave) + (d.unidade ? ` (${d.unidade})` : '');
        const atual = valorDe(d.chave);
        return (
          <label key={`${categoriaId}|${d.chave}`} style={{ display: 'grid' }}>
            <small>
              {d.obrigatorio ? t('admin.ativos.obrigatorio', { campo: etiqueta }) : etiqueta}
            </small>
            {d.tipo === 'lista' ? (
              <select name={nome} defaultValue={typeof atual === 'string' ? atual : ''}>
                <option value="" />
                {d.opcoes.map((o) => (
                  <option key={o.chave} value={o.chave}>
                    {rotulo(o.rotulos, o.chave)}
                  </option>
                ))}
              </select>
            ) : d.tipo === 'sim_nao' ? (
              <select
                name={nome}
                defaultValue={atual === true ? 'sim' : atual === false ? 'nao' : ''}
              >
                <option value="" />
                <option value="sim">{t('admin.ativos.sim')}</option>
                <option value="nao">{t('admin.ativos.nao')}</option>
              </select>
            ) : (
              <input
                name={nome}
                type={d.tipo === 'numero' ? 'number' : d.tipo === 'data' ? 'date' : 'text'}
                step={d.tipo === 'numero' ? 'any' : undefined}
                defaultValue={atual === undefined ? '' : String(atual)}
              />
            )}
          </label>
        );
      })}
      <button type="submit">
        {ativo ? t('admin.ativos.acao.salvar') : t('admin.ativos.acao.cadastrar')}
      </button>
      {ativo && (
        <button
          type="button"
          onClick={() =>
            void executar(
              `/api/v1/ativos/${ativo.id}/${ativo.ativo ? 'desativacao' : 'reativacao'}`,
              { method: 'POST', body: JSON.stringify({ versao: ativo.versao }) },
            )
          }
        >
          {ativo.ativo ? t('admin.ativos.acao.desativar') : t('admin.ativos.acao.reativar')}
        </button>
      )}
      {ativo && !ativo.ativo && <small>{t('admin.ativos.desativado')}</small>}
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
    <div style={{ display: 'grid', gap: 4 }}>
      {ativo.ativo && destinos.length > 0 && (
        <form onSubmit={mover} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select name="localDestinoId" aria-label={t('admin.ativos.mover.destino')} required>
            {destinos.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
          <button type="submit">{t('admin.ativos.acao.mover')}</button>
        </form>
      )}
      <button type="button" onClick={() => void verHistorico()}>
        {t('admin.ativos.acao.ver_movimentacoes')}
      </button>
      {erro && <small role="alert">{mensagemDeErro(erro)}</small>}
      {historico &&
        (historico.length === 0 ? (
          <small>{t('admin.ativos.mover.sem_movimentacoes')}</small>
        ) : (
          <ul>
            {historico.map((m) => (
              <li key={m.id}>
                <small>
                  {t('admin.ativos.mover.linha', {
                    origem: nomeDoLocal(m.localOrigemId),
                    destino: nomeDoLocal(m.localDestinoId),
                    quem: m.nomeUsuario ?? m.usuarioId,
                    quando: intl.formatDate(m.movidoEm, { dateStyle: 'short', timeStyle: 'short' }),
                  })}
                </small>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

export default function AtivosDoHotel() {
  const t = useT();
  const { idioma } = useIdioma();
  const mensagemDeErro = useMensagemDeErro();
  const [hoteis, setHoteis] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [locais, setLocais] = useState<Local[]>([]);
  const [categorias, setCategorias] = useState<{
    idiomaPadrao: Idioma;
    categorias: Categoria[];
  } | null>(null);
  const [ativos, setAtivos] = useState<Ativo[] | null>(null);
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    void chamarApi<{ hoteis: Hotel[] }>('/api/v1/hoteis').then((r) => {
      if (!r.ok) return setAviso({ tipo: 'erro', erro: r.erro });
      setHoteis(r.dados.hoteis);
      setHotelId((atual) => atual || r.dados.hoteis[0]?.id || '');
    });
    void chamarApi<{ idiomaPadrao: Idioma; categorias: Categoria[] }>(
      '/api/v1/categorias-de-ativo',
    ).then((r) => (r.ok ? setCategorias(r.dados) : setAviso({ tipo: 'erro', erro: r.erro })));
  }, []);

  const carregar = useCallback(async () => {
    if (!hotelId) return;
    const [l, a] = await Promise.all([
      chamarApi<{ locais: Local[] }>(`/api/v1/hoteis/${hotelId}/locais`),
      chamarApi<{ ativos: Ativo[] }>(comBusca(`/api/v1/hoteis/${hotelId}/ativos`, busca)),
    ]);
    if (l.ok) setLocais(l.dados.locais);
    if (a.ok) setAtivos(a.dados.ativos);
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

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <a href="/">{t('comum.voltar')}</a>
      <h1>{t('admin.ativos.titulo')}</h1>
      <select
        aria-label={t('admin.ativos.escolher_hotel')}
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
      {!ativos || !categorias ? (
        <p>{t('comum.carregando')}</p>
      ) : (
        <>
          <section style={{ display: 'grid', gap: 8 }}>
            <h2>{t('admin.ativos.novo')}</h2>
            <FormularioDeAtivo
              key={hotelId}
              ativo={null}
              locais={locais}
              categorias={categorias.categorias}
              nomeDaCategoria={nomeDaCategoria}
              rotulo={rotulo}
              executar={executar}
            />
          </section>
          <section style={{ display: 'grid', gap: 8 }}>
            <h2>{t('admin.ativos.cadastrados')}</h2>
            <CampoDeBusca
              aoBuscar={(termo) => {
                setAviso(null);
                setBusca(termo);
              }}
            />
            {ativos.length === 0 ? (
              <p>
                {busca === ''
                  ? t('admin.ativos.vazio')
                  : t('comum.busca.sem_resultado', { termo: busca })}
              </p>
            ) : (
              <ul style={{ display: 'grid', gap: 6, padding: 0, listStyle: 'none' }}>
                {ativos.map((a) => (
                  <li key={`${a.id}|${a.versao}`} style={{ display: 'grid', gap: 4 }}>
                    <FormularioDeAtivo
                      ativo={a}
                      locais={locais}
                      categorias={categorias.categorias}
                      nomeDaCategoria={nomeDaCategoria}
                      rotulo={rotulo}
                      executar={executar}
                    />
                    <MoverAtivo ativo={a} locais={locais} executar={executar} />
                    <QrDoAtivo ativo={a} />
                    <AnexosDoRegistro entidade="ativo" registroId={a.id} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
