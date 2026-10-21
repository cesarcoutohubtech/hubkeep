'use client';
// Planos preventivos do hotel (fase 1b, PV2; ADR-041): a lista com a próxima
// data, o cadastro e a alteração com a prévia das próximas cinco datas, e
// ativar, pausar e encerrar. Cadastra a gestão do hotel e o Implantador
// (decisão 8); para os outros papéis, a API devolve a lista vazia e recusa a
// gravação. A prévia usa o calendário do domínio, o mesmo da geração (PV3).
// O teste da tela entra com a lista e o apoio já carregados (inicial).
import {
  type UnidadeDePeriodicidade,
  UNIDADES_DE_PERIODICIDADE,
  ocorrencias,
  validarPeriodicidade,
} from '@hubkeep/dominio';
import { CATALOGOS, IDIOMAS, type Idioma, resolverNome } from '@hubkeep/i18n';
import { Botao, Campo, Entrada, MensagemVazia, Painel, Selecao, Selo } from '@hubkeep/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { chamarApi } from './api';
import { Aviso, type AvisoDeAcao } from './aviso';
import { SeletorDeHotel, useHoteis, valeParaOHotel } from './cadastro';
import { ListaDeSugestoes, type SugestaoDePlano } from './sugestoes-de-plano';
import { useIdioma, useT } from '../i18n/cliente';

type Situacao = 'ativo' | 'pausado' | 'encerrado';
export type Rotulos = Partial<Record<Idioma, string>>;
export interface Plano {
  id: string;
  ativoId: string | null;
  categoriaId: string | null;
  nome: string;
  intervalo: number;
  unidade: UnidadeDePeriodicidade;
  inicio: string;
  checklistModeloId: string | null;
  tecnicoId: string | null;
  equipeId: string | null;
  situacao: Situacao;
  versao: number;
  proximaData: string | null;
  /** O que a tela avisa (PV3c): o modelo de checklist desativado e o responsável que deixou de valer. */
  pendencias: ('checklist_inativo' | 'responsavel_invalido')[];
}
export interface Apoio {
  ativos: { id: string; nome: string; ativo: boolean }[];
  categorias: { id: string; chavePadrao: string | null; nomes: Rotulos; ativa: boolean }[];
  /** PB1b: só os do grupo e os da bandeira do hotel entram na escolha. */
  modelos: { id: string; nomes: Rotulos; ativa: boolean; bandeiraId?: string | null }[];
  equipes: { id: string; nome: string; ativa: boolean }[];
  tecnicos: { usuarioId: string; nome: string }[];
  idiomaPadrao: Idioma;
}

const TOM: Record<Situacao, 'verde' | 'ambar' | 'cinza'> = {
  ativo: 'verde',
  pausado: 'ambar',
  encerrado: 'cinza',
};
const ACAO: Record<'ativar' | 'pausar' | 'encerrar', string> = {
  ativar: 'ativacao',
  pausar: 'pausa',
  encerrar: 'encerramento',
};
const texto = (f: FormData, campo: string) => String(f.get(campo) ?? '').trim();
const idOuNulo = (v: string) => (v === '' ? null : v);

/** A prévia das próximas cinco datas; vazia enquanto a periodicidade ou o início não valem. */
export function previa(intervalo: string, unidade: string, inicio: string, hoje: string): string[] {
  try {
    const p = validarPeriodicidade({ intervalo: Number(intervalo), unidade });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return [];
    return ocorrencias({ inicio, ...p }, inicio > hoje ? inicio : hoje, 5);
  } catch {
    return [];
  }
}

export function PlanosPreventivos({
  inicial,
}: {
  inicial?: {
    lista: { hoje: string; planos: Plano[] };
    apoio: Apoio;
    sugestoes?: SugestaoDePlano[];
  };
}) {
  const t = useT();
  const intl = useIntl();
  const { idioma } = useIdioma();
  const { hoteis, hotelId, setHotelId, erro: erroDosHoteis } = useHoteis();
  const [lista, setLista] = useState<{ hoje: string; planos: Plano[] } | null>(
    inicial?.lista ?? null,
  );
  const [apoio, setApoio] = useState<Apoio | null>(inicial?.apoio ?? null);
  const [sugestoes, setSugestoes] = useState<SugestaoDePlano[]>(inicial?.sugestoes ?? []);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);
  const [editando, setEditando] = useState<Plano | null>(null);
  const [rascunho, setRascunho] = useState({ intervalo: '1', unidade: 'mes', inicio: '' });

  const carregar = useCallback(async () => {
    if (!hotelId) return;
    const [p, a, c, m, e, s] = await Promise.all([
      chamarApi<{ hoje: string; planos: Plano[] }>(`/api/v1/hoteis/${hotelId}/planos-preventivos`),
      chamarApi<{ ativos: Apoio['ativos'] }>(`/api/v1/hoteis/${hotelId}/ativos`),
      chamarApi<{ idiomaPadrao: Idioma; categorias: Apoio['categorias'] }>(
        '/api/v1/categorias-de-ativo',
      ),
      chamarApi<{ modelos: Apoio['modelos'] }>('/api/v1/modelos-de-checklist'),
      chamarApi<{ equipes: Apoio['equipes']; tecnicos: Apoio['tecnicos'] }>(
        `/api/v1/hoteis/${hotelId}/equipes`,
      ),
      chamarApi<{ sugestoes: SugestaoDePlano[] }>(`/api/v1/hoteis/${hotelId}/sugestoes-de-plano`),
    ]);
    if (!p.ok) return setAviso({ tipo: 'erro', erro: p.erro });
    setLista(p.dados);
    // Quem não gere planos no hotel recebe 403: a tela fica sem sugestões.
    setSugestoes(s.ok ? s.dados.sugestoes : []);
    setApoio({
      ativos: a.ok ? a.dados.ativos : [],
      categorias: c.ok ? c.dados.categorias : [],
      idiomaPadrao: c.ok ? c.dados.idiomaPadrao : 'pt-BR',
      // Quem não lê os modelos do grupo (RLS) recebe a lista vazia: o plano fica sem checklist.
      modelos: m.ok ? m.dados.modelos : [],
      equipes: e.ok ? e.dados.equipes : [],
      tecnicos: e.ok ? e.dados.tecnicos : [],
    });
  }, [hotelId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const idiomaPadrao = apoio?.idiomaPadrao ?? 'pt-BR';
  const idiomaDoTexto: Idioma = (IDIOMAS as readonly string[]).includes(idioma)
    ? (idioma as Idioma)
    : idiomaPadrao;
  const nomeDaCategoria = (c: Apoio['categorias'][number]) =>
    resolverNome(c.nomes, idioma, {
      doCatalogo: c.chavePadrao
        ? (CATALOGOS[idiomaDoTexto][`categoria_ativo.padrao.${c.chavePadrao}`] ?? null)
        : null,
      idiomaPadrao,
    }) ?? c.id;
  const nomeDoModelo = (m: Apoio['modelos'][number]) =>
    resolverNome(m.nomes, idioma, { idiomaPadrao }) ?? m.id;
  const dataDoCalendario = (d: string) =>
    intl.formatDate(new Date(`${d}T12:00:00Z`), { dateStyle: 'short', timeZone: 'UTC' });

  const alvo = (p: Plano) => {
    if (p.ativoId) return apoio?.ativos.find((a) => a.id === p.ativoId)?.nome ?? '';
    const c = apoio?.categorias.find((x) => x.id === p.categoriaId);
    return c ? t('admin.preventivas.alvo_categoria', { categoria: nomeDaCategoria(c) }) : '';
  };
  const responsavel = (p: Plano) =>
    p.tecnicoId
      ? (apoio?.tecnicos.find((x) => x.usuarioId === p.tecnicoId)?.nome ?? '')
      : p.equipeId
        ? (apoio?.equipes.find((x) => x.id === p.equipeId)?.nome ?? '')
        : t('admin.preventivas.sem_responsavel');

  async function executar(caminho: string, init: RequestInit) {
    const r = await chamarApi<unknown>(caminho, init);
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    if (r.ok) setEditando(null);
    await carregar();
  }

  function gravar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const [tipo, id] = texto(f, 'responsavel').split(':');
    const dados = {
      nome: texto(f, 'nome'),
      intervalo: Number(texto(f, 'intervalo')),
      unidade: texto(f, 'unidade'),
      inicio: texto(f, 'inicio'),
      checklistModeloId: idOuNulo(texto(f, 'checklist')),
      tecnicoId: tipo === 'tecnico' ? (id ?? null) : null,
      equipeId: tipo === 'equipe' ? (id ?? null) : null,
    };
    if (editando) {
      void executar(`/api/v1/planos-preventivos/${editando.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...dados, versao: editando.versao }),
      });
      return;
    }
    const [tipoDoAlvo, alvoId] = texto(f, 'alvo').split(':');
    void executar(`/api/v1/hoteis/${hotelId}/planos-preventivos`, {
      method: 'POST',
      body: JSON.stringify({
        ...dados,
        ativoId: tipoDoAlvo === 'ativo' ? (alvoId ?? null) : null,
        categoriaId: tipoDoAlvo === 'categoria' ? (alvoId ?? null) : null,
        ativar: f.get('ativar') === 'on',
      }),
    });
  }

  function editar(p: Plano) {
    setEditando(p);
    setRascunho({ intervalo: String(p.intervalo), unidade: p.unidade, inicio: p.inicio });
  }

  const datas = lista
    ? previa(rascunho.intervalo, rascunho.unidade, rascunho.inicio, lista.hoje)
    : [];
  const responsavelAtual = editando
    ? editando.tecnicoId
      ? `tecnico:${editando.tecnicoId}`
      : editando.equipeId
        ? `equipe:${editando.equipeId}`
        : ''
    : '';

  return (
    <Painel>
      <div className="hk-filtros">
        <SeletorDeHotel
          rotulo={t('admin.preventivas.escolher_hotel')}
          hoteis={hoteis}
          valor={hotelId}
          aoEscolher={(id) => {
            setEditando(null);
            setHotelId(id);
          }}
        />
      </div>
      <Aviso aviso={erroDosHoteis ? { tipo: 'erro', erro: erroDosHoteis } : aviso} />

      <form
        key={editando?.id ?? 'novo'}
        onSubmit={gravar}
        className="hk-formulario"
        aria-label={editando ? t('admin.preventivas.editar') : t('admin.preventivas.novo')}
      >
        <h2>{editando ? t('admin.preventivas.editar') : t('admin.preventivas.novo')}</h2>
        <Campo rotulo={t('admin.preventivas.campo.nome')}>
          {(p) => <Entrada {...p} name="nome" defaultValue={editando?.nome ?? ''} required />}
        </Campo>
        {editando ? (
          <p className="hk-suave">{t('admin.preventivas.alvo_fixo', { alvo: alvo(editando) })}</p>
        ) : (
          <Campo rotulo={t('admin.preventivas.campo.alvo')}>
            {(p) => (
              <Selecao {...p} name="alvo" required defaultValue="">
                <option value="" disabled>
                  {t('admin.preventivas.escolher_alvo')}
                </option>
                <optgroup label={t('admin.preventivas.grupo_ativos')}>
                  {apoio?.ativos
                    .filter((a) => a.ativo)
                    .map((a) => (
                      <option key={a.id} value={`ativo:${a.id}`}>
                        {a.nome}
                      </option>
                    ))}
                </optgroup>
                <optgroup label={t('admin.preventivas.grupo_categorias')}>
                  {apoio?.categorias
                    .filter((c) => c.ativa)
                    .map((c) => (
                      <option key={c.id} value={`categoria:${c.id}`}>
                        {t('admin.preventivas.alvo_categoria', { categoria: nomeDaCategoria(c) })}
                      </option>
                    ))}
                </optgroup>
              </Selecao>
            )}
          </Campo>
        )}
        <div className="hk-em-linha">
          <Campo rotulo={t('admin.preventivas.campo.intervalo')}>
            {(p) => (
              <Entrada
                {...p}
                name="intervalo"
                type="number"
                min={1}
                value={rascunho.intervalo}
                onChange={(e) => setRascunho({ ...rascunho, intervalo: e.target.value })}
                required
              />
            )}
          </Campo>
          <Campo rotulo={t('admin.preventivas.campo.unidade')}>
            {(p) => (
              <Selecao
                {...p}
                name="unidade"
                value={rascunho.unidade}
                onChange={(e) => setRascunho({ ...rascunho, unidade: e.target.value })}
              >
                {UNIDADES_DE_PERIODICIDADE.map((u) => (
                  <option key={u} value={u}>
                    {t('admin.preventivas.unidade', { unidade: u })}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo={t('admin.preventivas.campo.inicio')}>
            {(p) => (
              <Entrada
                {...p}
                name="inicio"
                type="date"
                value={rascunho.inicio}
                onChange={(e) => setRascunho({ ...rascunho, inicio: e.target.value })}
                required
              />
            )}
          </Campo>
        </div>
        <section aria-label={t('admin.preventivas.previa')}>
          <p className="hk-suave">{t('admin.preventivas.previa')}</p>
          {datas.length === 0 ? (
            <p className="hk-suave">{t('admin.preventivas.previa_vazia')}</p>
          ) : (
            <ol className="hk-em-linha">
              {datas.map((d) => (
                <li key={d}>{dataDoCalendario(d)}</li>
              ))}
            </ol>
          )}
        </section>
        <Campo rotulo={t('admin.preventivas.campo.checklist')}>
          {(p) => (
            <Selecao {...p} name="checklist" defaultValue={editando?.checklistModeloId ?? ''}>
              <option value="">{t('admin.preventivas.sem_checklist')}</option>
              {apoio?.modelos
                .filter(
                  (m) =>
                    m.ativa &&
                    valeParaOHotel(
                      m,
                      hoteis.find((h) => h.id === hotelId),
                    ),
                )
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {nomeDoModelo(m)}
                  </option>
                ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo={t('admin.preventivas.campo.responsavel')}>
          {(p) => (
            <Selecao {...p} name="responsavel" defaultValue={responsavelAtual}>
              <option value="">{t('admin.preventivas.sem_responsavel')}</option>
              <optgroup label={t('admin.preventivas.grupo_tecnicos')}>
                {apoio?.tecnicos.map((x) => (
                  <option key={x.usuarioId} value={`tecnico:${x.usuarioId}`}>
                    {x.nome}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('admin.preventivas.grupo_equipes')}>
                {apoio?.equipes
                  .filter((x) => x.ativa)
                  .map((x) => (
                    <option key={x.id} value={`equipe:${x.id}`}>
                      {x.nome}
                    </option>
                  ))}
              </optgroup>
            </Selecao>
          )}
        </Campo>
        {editando ? null : (
          <label className="hk-marcar">
            <input type="checkbox" name="ativar" />
            {t('admin.preventivas.campo.ativar')}
          </label>
        )}
        <div className="hk-linha-de-botoes">
          <Botao type="submit" variante="primario">
            {editando ? t('admin.preventivas.acao.gravar') : t('admin.preventivas.acao.criar')}
          </Botao>
          {editando ? (
            <Botao type="button" onClick={() => setEditando(null)}>
              {t('admin.preventivas.acao.cancelar')}
            </Botao>
          ) : null}
        </div>
      </form>

      {lista ? <ListaDeSugestoes sugestoes={sugestoes} executar={executar} /> : null}

      {!lista ? (
        <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : lista.planos.length === 0 ? (
        <MensagemVazia>{t('admin.preventivas.vazio')}</MensagemVazia>
      ) : (
        <ul className="hk-lista hk-itens">
          {lista.planos.map((p) => (
            <li key={p.id}>
              <div className="hk-item-cabecalho">
                <strong>{p.nome}</strong>
                <Selo tom={TOM[p.situacao]}>
                  {t('admin.preventivas.situacao', { situacao: p.situacao })}
                </Selo>
              </div>
              <p>{alvo(p)}</p>
              <p className="hk-suave hk-em-linha">
                <span>
                  {t('admin.preventivas.periodicidade', {
                    intervalo: p.intervalo,
                    unidade: p.unidade,
                  })}
                </span>
                <span>
                  {p.proximaData
                    ? t('admin.preventivas.proxima', { data: dataDoCalendario(p.proximaData) })
                    : t('admin.preventivas.sem_proxima')}
                </span>
                <span>{responsavel(p)}</span>
              </p>
              {p.pendencias.map((pendencia) => (
                <p key={pendencia} className="hk-em-linha" role="status">
                  <Selo tom="ambar">{t('admin.preventivas.pendencia', { pendencia })}</Selo>
                </p>
              ))}
              {p.situacao === 'encerrado' ? null : (
                <div className="hk-linha-de-botoes">
                  <Botao tamanho="pequeno" onClick={() => editar(p)}>
                    {t('admin.preventivas.acao.editar')}
                  </Botao>
                  {(p.situacao === 'pausado'
                    ? (['ativar', 'encerrar'] as const)
                    : (['pausar', 'encerrar'] as const)
                  ).map((acao) => (
                    <Botao
                      key={acao}
                      tamanho="pequeno"
                      onClick={() =>
                        void executar(`/api/v1/planos-preventivos/${p.id}/${ACAO[acao]}`, {
                          method: 'POST',
                          body: JSON.stringify({ versao: p.versao }),
                        })
                      }
                    >
                      {t('admin.preventivas.acao_da_situacao', { acao })}
                    </Botao>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}
