'use client';
// Categorias de ativo (fase 1a, B2; ADR-028): categorias padrão do catálogo e
// do tenant, nomes em quatro idiomas e os campos estendidos de cada uma.
// Visual do pacote de interface (ADR-038, U4b): um painel por categoria.
import { IDIOMAS, type Idioma, resolverNome } from '@hubkeep/i18n';
import {
  Botao,
  Campo as CampoDoFormulario,
  Entrada,
  MensagemDeErro,
  MensagemVazia,
  Painel,
  Selecao,
  Selo,
} from '@hubkeep/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import { nomeDoIdioma, useIdioma, useMensagemDeErro, useT } from '../../../../i18n/cliente';

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

const texto = (f: FormData, campo: string) => String(f.get(campo) ?? '').trim();

export default function CategoriasDeAtivo() {
  const t = useT();
  const { idioma } = useIdioma();
  const mensagemDeErro = useMensagemDeErro();
  const [dados, setDados] = useState<{ idiomaPadrao: Idioma; categorias: Categoria[] } | null>(
    null,
  );
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

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
      <MensagemDeErro>{mensagemDeErro(aviso.erro)}</MensagemDeErro>
    ) : (
      <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
    );
  }
  const faltamPadrao = PADRAO.some((p) => !dados.categorias.some((c) => c.chavePadrao === p));

  return (
    <div className="hk-pilha">
      <Painel
        {...(faltamPadrao
          ? {
              acoes: (
                <Botao
                  tamanho="pequeno"
                  onClick={() =>
                    void executar('/api/v1/categorias-de-ativo/padrao', { method: 'POST' })
                  }
                >
                  {t('admin.categorias.acao.instalar_padrao')}
                </Botao>
              ),
            }
          : {})}
      >
        <form onSubmit={criar} className="hk-em-linha">
          <CampoDoFormulario rotulo={t('admin.categorias.campo.nome')}>
            {(p) => <Entrada {...p} name="nome" required />}
          </CampoDoFormulario>
          <Botao type="submit" variante="primario">
            {t('admin.categorias.acao.criar')}
          </Botao>
        </form>
        <Aviso aviso={aviso} />
      </Painel>

      {dados.categorias.length === 0 ? (
        <MensagemVazia>{t('admin.categorias.vazio')}</MensagemVazia>
      ) : (
        dados.categorias.map((c) => (
          <Painel
            key={c.id}
            titulo={nome(c)}
            acoes={
              <>
                <Selo tom={c.chavePadrao ? 'azul' : 'cinza'}>
                  {c.chavePadrao ? t('admin.categorias.padrao') : t('admin.categorias.do_tenant')}
                </Selo>
                <Selo tom={c.ativa ? 'verde' : 'cinza'}>
                  {c.ativa ? t('admin.categorias.ativa') : t('admin.categorias.desativada')}
                </Selo>
                <Botao
                  tamanho="pequeno"
                  onClick={() =>
                    void executar(
                      `/api/v1/categorias-de-ativo/${c.id}/${c.ativa ? 'desativacao' : 'reativacao'}`,
                      { method: 'POST' },
                    )
                  }
                >
                  {c.ativa
                    ? t('admin.categorias.acao.desativar')
                    : t('admin.categorias.acao.reativar')}
                </Botao>
              </>
            }
          >
            <div className="hk-pilha">
              <form
                key={JSON.stringify(c.nomes)}
                className="hk-em-linha"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  const f = new FormData(ev.currentTarget);
                  const nomes: Rotulos = {};
                  for (const i of IDIOMAS) if (texto(f, i)) nomes[i] = texto(f, i);
                  void salvar(c, nomes, c.campos);
                }}
              >
                {IDIOMAS.map((i) => (
                  <CampoDoFormulario
                    key={i}
                    rotulo={t('admin.categorias.nome_em', { idioma: nomeDoIdioma(i) })}
                  >
                    {(p) => <Entrada {...p} name={i} defaultValue={c.nomes[i] ?? ''} />}
                  </CampoDoFormulario>
                ))}
                <Botao type="submit" tamanho="pequeno">
                  {t('admin.categorias.acao.salvar_nomes')}
                </Botao>
              </form>

              {c.campos.length === 0 ? (
                <p className="hk-suave">{t('admin.categorias.sem_campos')}</p>
              ) : (
                <ul className="hk-sublista">
                  {c.campos.map((campo) => (
                    <li key={campo.chave}>
                      <strong>{rotulo(campo.rotulos)}</strong>
                      <span className="hk-suave">
                        {t('admin.categorias.resumo_campo', {
                          chave: campo.chave,
                          tipo: campo.tipo,
                          obrigatorio: String(campo.obrigatorio),
                        })}
                      </span>
                      {campo.unidade && <span className="hk-suave">{campo.unidade}</span>}
                      {campo.opcoes.length > 0 && (
                        <span className="hk-suave">
                          {campo.opcoes.map((o) => rotulo(o.rotulos)).join(', ')}
                        </span>
                      )}
                      <Botao
                        tamanho="pequeno"
                        onClick={() =>
                          void salvar(
                            c,
                            c.nomes,
                            c.campos.filter((x) => x.chave !== campo.chave),
                          )
                        }
                      >
                        {t('admin.categorias.acao.tirar_campo')}
                      </Botao>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={(ev) => novoCampo(c, ev)} className="hk-em-linha">
                <CampoDoFormulario rotulo={t('admin.categorias.campo.chave')}>
                  {(p) => <Entrada {...p} name="chave" required />}
                </CampoDoFormulario>
                <CampoDoFormulario rotulo={t('admin.categorias.campo.rotulo')}>
                  {(p) => <Entrada {...p} name="rotulo" required />}
                </CampoDoFormulario>
                <CampoDoFormulario rotulo={t('admin.categorias.campo.tipo')}>
                  {(p) => (
                    <Selecao {...p} name="tipo">
                      {TIPOS.map((tp) => (
                        <option key={tp} value={tp}>
                          {t('admin.categorias.tipo', { tipo: tp })}
                        </option>
                      ))}
                    </Selecao>
                  )}
                </CampoDoFormulario>
                <CampoDoFormulario rotulo={t('admin.categorias.campo.unidade')}>
                  {(p) => <Entrada {...p} name="unidade" />}
                </CampoDoFormulario>
                <CampoDoFormulario rotulo={t('admin.categorias.campo.opcoes')}>
                  {(p) => <Entrada {...p} name="opcoes" />}
                </CampoDoFormulario>
                <label className="hk-marcar">
                  <input type="checkbox" name="obrigatorio" />
                  {t('admin.categorias.campo.obrigatorio')}
                </label>
                <Botao type="submit" tamanho="pequeno">
                  {t('admin.categorias.acao.por_campo')}
                </Botao>
              </form>
            </div>
          </Painel>
        ))
      )}
    </div>
  );
}
