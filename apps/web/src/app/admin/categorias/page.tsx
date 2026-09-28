'use client';
// Categorias de ativo (fase 1a, B2; ADR-028): categorias padrão do catálogo e
// do tenant, nomes em quatro idiomas e os campos estendidos de cada uma. Tela
// funcional, sem acabamento: o layout vem do protótipo validado.
import { IDIOMAS, type Idioma, resolverNome } from '@hubkeep/i18n';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../cliente/api';
import { nomeDoIdioma, useIdioma, useMensagemDeErro, useT } from '../../../i18n/cliente';

const TIPOS = ['texto', 'numero', 'data', 'lista', 'sim_nao'] as const;
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
type Tipo = (typeof TIPOS)[number];
type Rotulos = Partial<Record<Idioma, string>>;
interface Campo {
  chave: string;
  tipo: Tipo;
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

type Aviso = { tipo: 'ok' } | { tipo: 'erro'; erro: ErroDaApi };

const texto = (f: FormData, campo: string) => String(f.get(campo) ?? '').trim();

export default function CategoriasDeAtivo() {
  const t = useT();
  const { idioma } = useIdioma();
  const mensagemDeErro = useMensagemDeErro();
  const [dados, setDados] = useState<{ idiomaPadrao: Idioma; categorias: Categoria[] } | null>(
    null,
  );
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamarApi<{ idiomaPadrao: Idioma; categorias: Categoria[] }>(
      '/api/v1/categorias-de-ativo',
    );
    if (r.ok) setDados(r.dados);
    else setAviso({ tipo: 'erro', erro: r.erro });
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function executar(caminho: string, init: RequestInit) {
    const r = await chamarApi<unknown>(caminho, init);
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregar();
  }

  const idiomaPadrao = dados?.idiomaPadrao ?? 'pt-BR';
  const doCatalogo = (chave: string | null) =>
    chave && (PADRAO as readonly string[]).includes(chave)
      ? t(`categoria_ativo.padrao.${chave as (typeof PADRAO)[number]}` as const)
      : null;
  const nome = (c: Categoria) =>
    resolverNome(c.nomes, idioma, { doCatalogo: doCatalogo(c.chavePadrao), idiomaPadrao }) ?? c.id;
  const rotulo = (r: Rotulos) => resolverNome(r, idioma, { idiomaPadrao }) ?? '';
  const idiomaDoTexto: Idioma = (IDIOMAS as readonly string[]).includes(idioma)
    ? (idioma as Idioma)
    : idiomaPadrao;

  const salvar = (c: Categoria, nomes: Rotulos, campos: Campo[]) =>
    executar(`/api/v1/categorias-de-ativo/${c.id}`, {
      method: 'PUT',
      body: JSON.stringify({ nomes, campos }),
    });

  function criar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    void executar('/api/v1/categorias-de-ativo', {
      method: 'POST',
      body: JSON.stringify({ nomes: { [idiomaDoTexto]: texto(f, 'nome') }, campos: [] }),
    });
  }

  /** Opções da lista no formato "chave=rótulo; chave=rótulo", no idioma de quem digita. */
  function novoCampo(c: Categoria, ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const tipo = texto(f, 'tipo') as Tipo;
    const campo: Campo = {
      chave: texto(f, 'chave'),
      tipo,
      obrigatorio: f.get('obrigatorio') === 'on',
      rotulos: { [idiomaDoTexto]: texto(f, 'rotulo') },
      unidade: tipo === 'numero' ? texto(f, 'unidade') || null : null,
      opcoes:
        tipo === 'lista'
          ? texto(f, 'opcoes')
              .split(';')
              .map((o) => o.split('='))
              .filter(([k]) => k?.trim())
              .map(([k, r]) => ({
                chave: (k ?? '').trim(),
                rotulos: { [idiomaDoTexto]: (r ?? k ?? '').trim() },
              }))
          : [],
    };
    void salvar(c, c.nomes, [...c.campos, campo]);
  }

  if (!dados) {
    return aviso?.tipo === 'erro' ? (
      <p role="alert">{mensagemDeErro(aviso.erro)}</p>
    ) : (
      <p>{t('comum.carregando')}</p>
    );
  }
  const faltamPadrao = PADRAO.some((p) => !dados.categorias.some((c) => c.chavePadrao === p));

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <a href="/">{t('comum.voltar')}</a>
      <h1>{t('admin.categorias.titulo')}</h1>
      {aviso && (
        <p role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
          {aviso.tipo === 'ok' ? t('admin.membros.feito') : mensagemDeErro(aviso.erro)}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {faltamPadrao && (
          <button
            onClick={() => void executar('/api/v1/categorias-de-ativo/padrao', { method: 'POST' })}
          >
            {t('admin.categorias.acao.instalar_padrao')}
          </button>
        )}
        <form onSubmit={criar} style={{ display: 'flex', gap: 8 }}>
          <input
            name="nome"
            placeholder={t('admin.categorias.campo.nome')}
            aria-label={t('admin.categorias.campo.nome')}
            required
          />
          <button type="submit">{t('admin.categorias.acao.criar')}</button>
        </form>
      </div>

      {dados.categorias.length === 0 ? (
        <p>{t('admin.categorias.vazio')}</p>
      ) : (
        <ul style={{ display: 'grid', gap: 12, padding: 0, listStyle: 'none' }}>
          {dados.categorias.map((c) => (
            <li
              key={c.id}
              style={{ display: 'grid', gap: 6, borderTop: '1px solid #ddd', paddingTop: 8 }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>{nome(c)}</strong>
                <small>
                  {c.chavePadrao ? t('admin.categorias.padrao') : t('admin.categorias.do_tenant')}
                </small>
                <small>
                  {c.ativa ? t('admin.categorias.ativa') : t('admin.categorias.desativada')}
                </small>
                <button
                  onClick={() =>
                    void executar(
                      `/api/v1/categorias-de-ativo/${c.id}/${c.ativa ? 'desativacao' : 'reativacao'}`,
                      {
                        method: 'POST',
                      },
                    )
                  }
                >
                  {c.ativa
                    ? t('admin.categorias.acao.desativar')
                    : t('admin.categorias.acao.reativar')}
                </button>
              </div>

              <form
                key={JSON.stringify(c.nomes)}
                style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}
                onSubmit={(ev) => {
                  ev.preventDefault();
                  const f = new FormData(ev.currentTarget);
                  const nomes: Rotulos = {};
                  for (const i of IDIOMAS) if (texto(f, i)) nomes[i] = texto(f, i);
                  void salvar(c, nomes, c.campos);
                }}
              >
                {IDIOMAS.map((i) => (
                  <input
                    key={i}
                    name={i}
                    defaultValue={c.nomes[i] ?? ''}
                    placeholder={nomeDoIdioma(i)}
                    aria-label={t('admin.categorias.nome_em', { idioma: nomeDoIdioma(i) })}
                  />
                ))}
                <button type="submit">{t('admin.categorias.acao.salvar_nomes')}</button>
              </form>

              {c.campos.length === 0 ? (
                <small>{t('admin.categorias.sem_campos')}</small>
              ) : (
                <ul>
                  {c.campos.map((campo) => (
                    <li key={campo.chave} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span>{rotulo(campo.rotulos)}</span>
                      <small>
                        {t('admin.categorias.resumo_campo', {
                          chave: campo.chave,
                          tipo: campo.tipo,
                          obrigatorio: String(campo.obrigatorio),
                        })}
                      </small>
                      {campo.unidade && <small>{campo.unidade}</small>}
                      {campo.opcoes.length > 0 && (
                        <small>{campo.opcoes.map((o) => rotulo(o.rotulos)).join(', ')}</small>
                      )}
                      <button
                        onClick={() =>
                          void salvar(
                            c,
                            c.nomes,
                            c.campos.filter((x) => x.chave !== campo.chave),
                          )
                        }
                      >
                        {t('admin.categorias.acao.tirar_campo')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form
                onSubmit={(ev) => novoCampo(c, ev)}
                style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}
              >
                <input
                  name="chave"
                  placeholder={t('admin.categorias.campo.chave')}
                  aria-label={t('admin.categorias.campo.chave')}
                  required
                />
                <input
                  name="rotulo"
                  placeholder={t('admin.categorias.campo.rotulo')}
                  aria-label={t('admin.categorias.campo.rotulo')}
                  required
                />
                <select name="tipo" aria-label={t('admin.categorias.campo.tipo')}>
                  {TIPOS.map((tp) => (
                    <option key={tp} value={tp}>
                      {t('admin.categorias.tipo', { tipo: tp })}
                    </option>
                  ))}
                </select>
                <label style={{ display: 'flex', gap: 4 }}>
                  <input type="checkbox" name="obrigatorio" />
                  {t('admin.categorias.campo.obrigatorio')}
                </label>
                <input
                  name="unidade"
                  placeholder={t('admin.categorias.campo.unidade')}
                  aria-label={t('admin.categorias.campo.unidade')}
                />
                <input
                  name="opcoes"
                  placeholder={t('admin.categorias.campo.opcoes')}
                  aria-label={t('admin.categorias.campo.opcoes')}
                />
                <button type="submit">{t('admin.categorias.acao.por_campo')}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
