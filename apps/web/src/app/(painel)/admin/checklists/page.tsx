'use client';
// Modelos de checklist do grupo (fase 1b, PV1; ADR-040): nomes em quatro
// idiomas, a categoria sugerida e os itens tipados (os campos da categoria,
// ADR-028), com a marca de obrigatório. O item de conformidade é um atalho
// que cria uma lista com "Conforme", "Não conforme" e "Não se aplica", com os
// rótulos dos quatro catálogos. A versão sobe quando os itens mudam; as OS
// que já têm o checklist ficam com a cópia delas.
import { CATALOGOS, IDIOMAS, type Idioma, resolverNome } from '@hubkeep/i18n';
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
const CONFORMIDADE = ['conforme', 'nao_conforme', 'nao_se_aplica'] as const;
type Tipo = (typeof TIPOS)[number];
type Rotulos = Partial<Record<Idioma, string>>;
interface Item {
  chave: string;
  tipo: Tipo;
  obrigatorio: boolean;
  rotulos: Rotulos;
  unidade: string | null;
  opcoes: { chave: string; rotulos: Rotulos }[];
}
interface Modelo {
  id: string;
  categoriaId: string | null;
  nomes: Rotulos;
  itens: Item[];
  versao: number;
  ativa: boolean;
}
interface Categoria {
  id: string;
  chavePadrao: string | null;
  nomes: Rotulos;
  ativa: boolean;
}

const texto = (f: FormData, campo: string) => String(f.get(campo) ?? '').trim();

/** O rótulo de uma opção de conformidade nos quatro catálogos. */
const rotulosDoCatalogo = (chave: string): Rotulos => {
  const r: Rotulos = {};
  for (const i of IDIOMAS) {
    const m = CATALOGOS[i][chave];
    if (m) r[i] = m;
  }
  return r;
};

export default function ModelosDeChecklist() {
  const t = useT();
  const { idioma } = useIdioma();
  const mensagemDeErro = useMensagemDeErro();
  const [dados, setDados] = useState<{ idiomaPadrao: Idioma; modelos: Modelo[] } | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    const [r, c] = await Promise.all([
      chamarApi<{ idiomaPadrao: Idioma; modelos: Modelo[] }>('/api/v1/modelos-de-checklist'),
      chamarApi<{ categorias: Categoria[] }>('/api/v1/categorias-de-ativo'),
    ]);
    if (r.ok) setDados(r.dados);
    else setAviso({ tipo: 'erro', erro: r.erro });
    if (c.ok) setCategorias(c.dados.categorias);
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
  const rotulo = (r: Rotulos) => resolverNome(r, idioma, { idiomaPadrao }) ?? '';
  const idiomaDoTexto: Idioma = (IDIOMAS as readonly string[]).includes(idioma)
    ? (idioma as Idioma)
    : idiomaPadrao;
  const nomeDaCategoria = (c: Categoria) =>
    resolverNome(c.nomes, idioma, {
      doCatalogo: c.chavePadrao
        ? (CATALOGOS[idiomaDoTexto][`categoria_ativo.padrao.${c.chavePadrao}`] ?? null)
        : null,
      idiomaPadrao,
    }) ?? c.id;

  const salvar = (m: Modelo, mudanca: Partial<Pick<Modelo, 'nomes' | 'categoriaId' | 'itens'>>) =>
    executar(`/api/v1/modelos-de-checklist/${m.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nomes: mudanca.nomes ?? m.nomes,
        categoriaId: mudanca.categoriaId === undefined ? m.categoriaId : mudanca.categoriaId,
        itens: mudanca.itens ?? m.itens,
      }),
    });

  function criar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    void executar('/api/v1/modelos-de-checklist', {
      method: 'POST',
      body: JSON.stringify({
        nomes: { [idiomaDoTexto]: texto(f, 'nome') },
        categoriaId: texto(f, 'categoria') || null,
        itens: [],
      }),
    });
  }

  /** Opções da lista no formato "chave=rótulo; chave=rótulo", no idioma de quem digita. */
  function novoItem(m: Modelo, ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const tipo = texto(f, 'tipo') as Tipo;
    const item: Item = {
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
    void salvar(m, { itens: [...m.itens, item] });
  }

  function novoItemDeConformidade(m: Modelo, ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const item: Item = {
      chave: texto(f, 'chave'),
      tipo: 'lista',
      obrigatorio: f.get('obrigatorio') === 'on',
      rotulos: { [idiomaDoTexto]: texto(f, 'rotulo') },
      unidade: null,
      opcoes: CONFORMIDADE.map((chave) => ({
        chave,
        rotulos: rotulosDoCatalogo(`checklist.conformidade.${chave}`),
      })),
    };
    void salvar(m, { itens: [...m.itens, item] });
  }

  const seletorDeCategoria = (nome: string, atual: string | null) => (
    <CampoDoFormulario rotulo={t('admin.checklists.campo.categoria')}>
      {(p) => (
        <Selecao {...p} name={nome} defaultValue={atual ?? ''}>
          <option value="">{t('admin.checklists.todas_as_categorias')}</option>
          {categorias
            .filter((c) => c.ativa || c.id === atual)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {nomeDaCategoria(c)}
              </option>
            ))}
        </Selecao>
      )}
    </CampoDoFormulario>
  );

  if (!dados) {
    return aviso?.tipo === 'erro' ? (
      <MensagemDeErro>{mensagemDeErro(aviso.erro)}</MensagemDeErro>
    ) : (
      <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
    );
  }

  return (
    <div className="hk-pilha">
      <Painel>
        <form onSubmit={criar} className="hk-em-linha">
          <CampoDoFormulario rotulo={t('admin.checklists.campo.nome')}>
            {(p) => <Entrada {...p} name="nome" required />}
          </CampoDoFormulario>
          {seletorDeCategoria('categoria', null)}
          <Botao type="submit" variante="primario">
            {t('admin.checklists.acao.criar')}
          </Botao>
        </form>
        <p className="hk-suave">{t('admin.checklists.dica')}</p>
        <Aviso aviso={aviso} />
      </Painel>

      {dados.modelos.length === 0 ? (
        <MensagemVazia>{t('admin.checklists.vazio')}</MensagemVazia>
      ) : (
        dados.modelos.map((m) => (
          <Painel
            key={m.id}
            titulo={rotulo(m.nomes) || m.id}
            acoes={
              <>
                <Selo tom="azul">{t('admin.checklists.versao', { versao: m.versao })}</Selo>
                <Selo tom={m.ativa ? 'verde' : 'cinza'}>
                  {m.ativa ? t('admin.checklists.ativo') : t('admin.checklists.desativado')}
                </Selo>
                <Botao
                  tamanho="pequeno"
                  onClick={() =>
                    void executar(
                      `/api/v1/modelos-de-checklist/${m.id}/${m.ativa ? 'desativacao' : 'reativacao'}`,
                      { method: 'POST' },
                    )
                  }
                >
                  {m.ativa
                    ? t('admin.checklists.acao.desativar')
                    : t('admin.checklists.acao.reativar')}
                </Botao>
              </>
            }
          >
            <div className="hk-pilha">
              <form
                key={JSON.stringify([m.nomes, m.categoriaId])}
                className="hk-em-linha"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  const f = new FormData(ev.currentTarget);
                  const nomes: Rotulos = {};
                  for (const i of IDIOMAS) if (texto(f, i)) nomes[i] = texto(f, i);
                  void salvar(m, { nomes, categoriaId: texto(f, 'categoria') || null });
                }}
              >
                {IDIOMAS.map((i) => (
                  <CampoDoFormulario
                    key={i}
                    rotulo={t('admin.checklists.nome_em', { idioma: nomeDoIdioma(i) })}
                  >
                    {(p) => <Entrada {...p} name={i} defaultValue={m.nomes[i] ?? ''} />}
                  </CampoDoFormulario>
                ))}
                {seletorDeCategoria('categoria', m.categoriaId)}
                <Botao type="submit" tamanho="pequeno">
                  {t('admin.checklists.acao.salvar')}
                </Botao>
              </form>

              {m.itens.length === 0 ? (
                <p className="hk-suave">{t('admin.checklists.sem_itens')}</p>
              ) : (
                <ol className="hk-sublista">
                  {m.itens.map((item) => (
                    <li key={item.chave}>
                      <strong>{rotulo(item.rotulos)}</strong>
                      <span className="hk-suave">
                        {t('admin.categorias.resumo_campo', {
                          chave: item.chave,
                          tipo: item.tipo,
                          obrigatorio: String(item.obrigatorio),
                        })}
                      </span>
                      {item.unidade && <span className="hk-suave">{item.unidade}</span>}
                      {item.opcoes.length > 0 && (
                        <span className="hk-suave">
                          {item.opcoes.map((o) => rotulo(o.rotulos)).join(', ')}
                        </span>
                      )}
                      <Botao
                        tamanho="pequeno"
                        onClick={() =>
                          void salvar(m, { itens: m.itens.filter((x) => x.chave !== item.chave) })
                        }
                      >
                        {t('admin.checklists.acao.tirar_item')}
                      </Botao>
                    </li>
                  ))}
                </ol>
              )}

              <form onSubmit={(ev) => novoItem(m, ev)} className="hk-em-linha">
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
                  {t('admin.checklists.acao.por_item')}
                </Botao>
              </form>

              <form onSubmit={(ev) => novoItemDeConformidade(m, ev)} className="hk-em-linha">
                <CampoDoFormulario rotulo={t('admin.categorias.campo.chave')}>
                  {(p) => <Entrada {...p} name="chave" required />}
                </CampoDoFormulario>
                <CampoDoFormulario rotulo={t('admin.categorias.campo.rotulo')}>
                  {(p) => <Entrada {...p} name="rotulo" required />}
                </CampoDoFormulario>
                <label className="hk-marcar">
                  <input type="checkbox" name="obrigatorio" defaultChecked />
                  {t('admin.categorias.campo.obrigatorio')}
                </label>
                <Botao type="submit" tamanho="pequeno">
                  {t('admin.checklists.acao.por_conformidade')}
                </Botao>
              </form>
            </div>
          </Painel>
        ))
      )}
    </div>
  );
}
