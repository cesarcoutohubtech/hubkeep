'use client';
// Códigos de falha, causa e solução (fase 1b, I6): os padrão do catálogo e os
// do grupo, com nome em quatro idiomas e a categoria de ativo a que servem
// (vazia: todas). O tipo e a categoria não mudam depois de criado; para mudar,
// cria-se outro e desativa-se o antigo. Todos que leem algum hotel veem; a API
// recusa a gravação de quem não é Admin do grupo (codigos_so_admin). Visual do
// pacote de interface (ADR-038): um painel por tipo.
import { CATEGORIAS_PADRAO } from '@hubkeep/dominio';
import { type Chave, IDIOMAS, type Idioma, resolverNome } from '@hubkeep/i18n';
import {
  Botao,
  Campo,
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
import {
  type CodigoNaTela,
  TIPOS_DE_CODIGO,
  useCodigosDoTenant,
  useNomeDoCodigo,
} from '../../../../cliente/codigos-manutencao';
import { nomeDoIdioma, useIdioma, useMensagemDeErro, useT } from '../../../../i18n/cliente';

interface Categoria {
  id: string;
  chavePadrao: string | null;
  nomes: Partial<Record<Idioma, string>>;
  ativa: boolean;
}

const texto = (f: FormData, campo: string) => String(f.get(campo) ?? '').trim();

export default function CodigosDeManutencao() {
  const t = useT();
  const { idioma } = useIdioma();
  const mensagemDeErro = useMensagemDeErro();
  const { dados, recarregar, erro } = useCodigosDoTenant();
  const nomeDoCodigo = useNomeDoCodigo(dados);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregarCategorias = useCallback(async () => {
    const r = await chamarApi<{ categorias: Categoria[] }>('/api/v1/categorias-de-ativo');
    if (r.ok) setCategorias(r.dados.categorias);
  }, []);

  useEffect(() => {
    void carregarCategorias();
  }, [carregarCategorias]);

  async function executar(caminho: string, init: RequestInit) {
    const r = await chamarApi<unknown>(caminho, init);
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await recarregar();
  }

  const idiomaPadrao = dados?.idiomaPadrao ?? 'pt-BR';
  const idiomaDoTexto: Idioma = (IDIOMAS as readonly string[]).includes(idioma)
    ? (idioma as Idioma)
    : idiomaPadrao;
  const nomeDaCategoria = (id: string | null) => {
    if (id === null) return t('admin.codigos.todas_as_categorias');
    const c = categorias.find((x) => x.id === id);
    if (!c) return id;
    const doCatalogo =
      c.chavePadrao && (CATEGORIAS_PADRAO as readonly string[]).includes(c.chavePadrao)
        ? t(`categoria_ativo.padrao.${c.chavePadrao}` as Chave)
        : null;
    return resolverNome(c.nomes, idioma, { doCatalogo, idiomaPadrao }) ?? c.id;
  };

  function criar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    void executar('/api/v1/codigos-de-manutencao', {
      method: 'POST',
      body: JSON.stringify({
        tipo: texto(f, 'tipo'),
        categoriaId: texto(f, 'categoriaId') || null,
        nomes: { [idiomaDoTexto]: texto(f, 'nome') },
      }),
    });
  }

  function salvarNomes(c: CodigoNaTela, ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const nomes: Partial<Record<Idioma, string>> = {};
    for (const i of IDIOMAS) if (texto(f, i)) nomes[i] = texto(f, i);
    void executar(`/api/v1/codigos-de-manutencao/${c.id}`, {
      method: 'PUT',
      body: JSON.stringify({ nomes }),
    });
  }

  if (!dados) {
    return erro ? (
      <MensagemDeErro>{mensagemDeErro(erro)}</MensagemDeErro>
    ) : (
      <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
    );
  }

  return (
    <div className="hk-pilha">
      <Painel
        acoes={
          <Botao
            tamanho="pequeno"
            onClick={() =>
              void executar('/api/v1/codigos-de-manutencao/padrao', { method: 'POST' })
            }
          >
            {t('admin.codigos.acao.instalar_padrao')}
          </Botao>
        }
      >
        <div className="hk-pilha">
          <p className="hk-suave">{t('admin.codigos.dica')}</p>
          <form onSubmit={criar} className="hk-em-linha">
            <Campo rotulo={t('admin.codigos.campo.tipo')}>
              {(p) => (
                <Selecao {...p} name="tipo">
                  {TIPOS_DE_CODIGO.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {t('codigo_manutencao.tipo', { tipo })}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo={t('admin.codigos.campo.categoria')}>
              {(p) => (
                <Selecao {...p} name="categoriaId" defaultValue="">
                  <option value="">{t('admin.codigos.todas_as_categorias')}</option>
                  {categorias
                    .filter((c) => c.ativa)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {nomeDaCategoria(c.id)}
                      </option>
                    ))}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo={t('admin.codigos.campo.nome')}>
              {(p) => <Entrada {...p} name="nome" required />}
            </Campo>
            <Botao type="submit" variante="primario">
              {t('admin.codigos.acao.criar')}
            </Botao>
          </form>
          <Aviso aviso={aviso} />
        </div>
      </Painel>

      {dados.codigos.length === 0 ? (
        <MensagemVazia>{t('admin.codigos.vazio')}</MensagemVazia>
      ) : (
        TIPOS_DE_CODIGO.map((tipo) => (
          <Painel key={tipo} titulo={t('admin.codigos.titulo_do_tipo', { tipo })}>
            <ul className="hk-lista" data-tipo={tipo}>
              {dados.codigos
                .filter((c) => c.tipo === tipo)
                .map((c) => (
                  <li key={c.id} data-codigo={c.id}>
                    <div className="hk-pilha">
                      <div className="hk-linha-de-botoes">
                        <strong>{nomeDoCodigo(c)}</strong>
                        <span className="hk-suave">{nomeDaCategoria(c.categoriaId)}</span>
                        <Selo tom={c.chavePadrao ? 'azul' : 'cinza'}>
                          {c.chavePadrao ? t('admin.codigos.padrao') : t('admin.codigos.do_grupo')}
                        </Selo>
                        <Selo tom={c.ativa ? 'verde' : 'cinza'}>
                          {c.ativa ? t('admin.codigos.ativo') : t('admin.codigos.desativado')}
                        </Selo>
                        <Botao
                          tamanho="pequeno"
                          onClick={() =>
                            void executar(
                              `/api/v1/codigos-de-manutencao/${c.id}/${c.ativa ? 'desativacao' : 'reativacao'}`,
                              { method: 'POST' },
                            )
                          }
                        >
                          {c.ativa
                            ? t('admin.codigos.acao.desativar')
                            : t('admin.codigos.acao.reativar')}
                        </Botao>
                      </div>
                      <details>
                        <summary>{t('admin.codigos.acao.editar_nomes')}</summary>
                        <form
                          key={JSON.stringify(c.nomes)}
                          className="hk-em-linha"
                          onSubmit={(ev) => salvarNomes(c, ev)}
                        >
                          {IDIOMAS.map((i) => (
                            <Campo
                              key={i}
                              rotulo={t('admin.codigos.nome_em', { idioma: nomeDoIdioma(i) })}
                            >
                              {(p) => <Entrada {...p} name={i} defaultValue={c.nomes[i] ?? ''} />}
                            </Campo>
                          ))}
                          <Botao type="submit" tamanho="pequeno">
                            {t('admin.codigos.acao.salvar_nomes')}
                          </Botao>
                        </form>
                      </details>
                    </div>
                  </li>
                ))}
            </ul>
          </Painel>
        ))
      )}
    </div>
  );
}
