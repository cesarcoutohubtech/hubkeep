'use client';
// Lista de insights do HubKeep Intelligence (proposta das telas do 1.0, tela
// 1): os quatro indicadores, os filtros (estado, tipo, faixa e hotel) e a
// tabela dos insights que quem vê decide (a API recorta pela RLS), e, abaixo
// dela, a efetividade das intervenções (adendo ao ADR-033, 15/10/2026). Acima
// da lista, "Procurar ativo" (Cesar e Kaio, 16/10/2026) leva à página de
// qualquer ativo dos hotéis em que a pessoa decide, também sem insight. Sem o
// módulo ou sem papel que decide, a API responde 404 inteligencia_indisponivel.
// Acima de tudo, o link para as reclamações de hóspede (ADR-047).
import type {
  RespostaDaBuscaDeAtivosNoIntelligence,
  RespostaDeHoteis,
  RespostaDeInsights,
  RespostaDoResumoDoIntelligence,
  z,
} from '@hubkeep/contratos';
import {
  Campo,
  Entrada,
  Indicador,
  Indicadores,
  MensagemVazia,
  Nota,
  Painel,
  Selecao,
  Tabela,
} from '@hubkeep/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { CampoDeBusca, comBusca } from '../../../../cliente/CampoDeBusca';
import { Aviso } from '../../../../cliente/aviso';
import { useT } from '../../../../i18n/cliente';
import {
  type Efetividades,
  SeloDaFaixa,
  SeloDoEstado,
  TabelaDeEfetividade,
  useDatas,
  useEscopoDoInsight,
  useNumeroDoInsight,
  useTituloDoInsight,
} from '../comum';

type Lista = z.infer<typeof RespostaDeInsights>;
type Resumo = z.infer<typeof RespostaDoResumoDoIntelligence>;
type Hoteis = z.infer<typeof RespostaDeHoteis>;

const ESTADOS = [
  'abertos',
  'encerrados',
  'novo',
  'em_revisao',
  'aceito',
  'em_acao',
  'monitorando',
  'resolvido',
  'descartado',
] as const;
const TIPOS = ['atencao_ativo', 'sistemico'] as const;
const FAIXAS = ['critico', 'alta_atencao', 'atencao'] as const;

interface Filtro {
  estado: string;
  tipo: string;
  faixa: string;
  hotelId: string;
  /** O número digitado: "INS-0133", "0133" ou "133". */
  numero: string;
}

/** O número do insight no que a pessoa digitou, sem o prefixo e os zeros; null sem número. */
export function numeroDigitado(texto: string): number | null {
  const digitos = texto.replace(/\D/g, '');
  const n = Number(digitos);
  return digitos !== '' && n >= 1 && digitos.length <= 9 ? n : null;
}

export function caminhoDaLista(f: Filtro): string {
  const q = new URLSearchParams();
  const numero = numeroDigitado(f.numero);
  for (const [k, v] of Object.entries(f)) {
    // Com o número, o insight aparece em qualquer estado: o filtro de estado não vai.
    if (k === 'numero' || (k === 'estado' && numero !== null)) continue;
    if (v) q.set(k, v);
  }
  if (numero !== null) q.set('numero', String(numero));
  const texto = q.toString();
  return `/api/v1/inteligencia/insights${texto ? `?${texto}` : ''}`;
}

export function TelaDeInsights() {
  const t = useT();
  const [filtro, setFiltro] = useState<Filtro>({
    estado: 'abertos',
    tipo: '',
    faixa: '',
    hotelId: '',
    numero: '',
  });
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [hoteis, setHoteis] = useState<Hoteis['hoteis']>([]);
  const [lista, setLista] = useState<Lista | null>(null);
  const [efetividade, setEfetividade] = useState<Efetividades | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  // Só o Admin do grupo lê a abertura das telas: para ele, o link.
  const [veAbertura, setVeAbertura] = useState(false);

  useEffect(() => {
    void chamarApi<Resumo>('/api/v1/inteligencia/resumo').then((r) =>
      r.ok ? setResumo(r.dados) : setErro(r.erro),
    );
    void chamarApi('/api/v1/inteligencia/abertura').then((r) => setVeAbertura(r.ok));
    void chamarApi<Hoteis>('/api/v1/hoteis').then((r) => r.ok && setHoteis(r.dados.hoteis));
    void chamarApi<Efetividades>('/api/v1/inteligencia/efetividade').then((r) =>
      r.ok ? setEfetividade(r.dados) : setErro(r.erro),
    );
  }, []);

  const carregar = useCallback(async (f: Filtro) => {
    const r = await chamarApi<Lista>(caminhoDaLista(f));
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setErro(null);
    setLista(r.dados);
  }, []);
  useEffect(() => {
    void carregar(filtro);
  }, [carregar, filtro]);

  const mudar = (campo: keyof Filtro) => (e: { target: { value: string } }) =>
    setFiltro((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <div className="hk-pilha">
      <Nota tom="info">{t('inteligencia.lista.modulo')}</Nota>
      <p className="hk-em-linha">
        <Link href="/inteligencia/sinais">{t('inteligencia.sinais.link')}</Link>
        {veAbertura && <Link href="/inteligencia/abertura">{t('inteligencia.abertura.link')}</Link>}
      </p>
      <Aviso aviso={erro && { tipo: 'erro', erro }} />
      {resumo && (
        <Indicadores rotulo={t('inteligencia.indicadores.rotulo')}>
          <Indicador
            rotulo={t('inteligencia.indicador.abertos')}
            valor={resumo.abertos}
            detalhe={t('inteligencia.indicador.abertos_detalhe')}
          />
          <Indicador
            rotulo={t('inteligencia.indicador.alta')}
            valor={resumo.altaAtencaoOuCritico}
            detalhe={t('inteligencia.indicador.alta_detalhe')}
            tom={resumo.altaAtencaoOuCritico > 0 ? 'atencao' : 'neutro'}
          />
          <Indicador
            rotulo={t('inteligencia.indicador.sistemicos')}
            valor={resumo.sistemicos}
            detalhe={t('inteligencia.indicador.sistemicos_detalhe')}
          />
          <Indicador
            rotulo={t('inteligencia.indicador.sem_responsavel')}
            valor={resumo.semResponsavel}
            detalhe={t('inteligencia.indicador.sem_responsavel_detalhe')}
            tom={resumo.semResponsavel > 0 ? 'atencao' : 'neutro'}
          />
        </Indicadores>
      )}
      <ProcurarAtivo />
      <Painel titulo={t('inteligencia.lista.titulo')}>
        <form className="hk-filtros" onSubmit={(e) => e.preventDefault()}>
          <Campo rotulo={t('inteligencia.filtro.numero')}>
            {(p) => (
              <Entrada
                {...p}
                type="search"
                inputMode="numeric"
                value={filtro.numero}
                onChange={mudar('numero')}
                placeholder={t('inteligencia.filtro.numero.exemplo')}
              />
            )}
          </Campo>
          <Campo rotulo={t('inteligencia.filtro.estado')}>
            {(p) => (
              <Selecao
                {...p}
                value={filtro.estado}
                onChange={mudar('estado')}
                disabled={numeroDigitado(filtro.numero) !== null}
              >
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {e === 'abertos' || e === 'encerrados'
                      ? t(`inteligencia.filtro.estado.${e}`)
                      : t('inteligencia.insight.estado', { estado: e })}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo={t('inteligencia.filtro.tipo')}>
            {(p) => (
              <Selecao {...p} value={filtro.tipo} onChange={mudar('tipo')}>
                <option value="">{t('inteligencia.filtro.tipo.todos')}</option>
                {TIPOS.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {t('inteligencia.insight.tipo', { tipo })}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo={t('inteligencia.filtro.faixa')}>
            {(p) => (
              <Selecao {...p} value={filtro.faixa} onChange={mudar('faixa')}>
                <option value="">{t('inteligencia.filtro.faixa.todas')}</option>
                {FAIXAS.map((faixa) => (
                  <option key={faixa} value={faixa}>
                    {t(`inteligencia.faixa.${faixa}`)}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          {hoteis.length > 1 && (
            <Campo rotulo={t('inteligencia.filtro.hotel')}>
              {(p) => (
                <Selecao {...p} value={filtro.hotelId} onChange={mudar('hotelId')}>
                  <option value="">{t('inteligencia.filtro.hotel.todos')}</option>
                  {hoteis.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.nome}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
          )}
        </form>
        {lista === null ? (
          !erro && <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
        ) : lista.insights.length === 0 ? (
          <MensagemVazia>{t('inteligencia.lista.vazio')}</MensagemVazia>
        ) : (
          <TabelaDeInsights lista={lista} />
        )}
        <p className="hk-suave">{t('inteligencia.lista.rodape')}</p>
      </Painel>
      {efetividade && <SecaoDaEfetividade efetividade={efetividade} />}
    </div>
  );
}

type Encontrados = z.infer<typeof RespostaDaBuscaDeAtivosNoIntelligence>;

/** "Procurar ativo": o termo vai para a API, e cada ativo achado leva à página dele. */
function ProcurarAtivo() {
  const t = useT();
  const [termo, setTermo] = useState('');
  const [encontrados, setEncontrados] = useState<Encontrados | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);

  const procurar = async (novo: string) => {
    setTermo(novo);
    setErro(null);
    if (novo === '') {
      setEncontrados(null);
      return;
    }
    const r = await chamarApi<Encontrados>(comBusca('/api/v1/inteligencia/ativos', novo));
    if (!r.ok) {
      setErro(r.erro);
      setEncontrados(null);
      return;
    }
    setEncontrados(r.dados);
  };

  return (
    <Painel titulo={t('inteligencia.procurar.titulo')} dica={t('inteligencia.procurar.dica')}>
      <CampoDeBusca aoBuscar={(novo) => void procurar(novo)} />
      <Aviso aviso={erro && { tipo: 'erro', erro }} />
      {encontrados && <AtivosEncontrados encontrados={encontrados} termo={termo} />}
    </Painel>
  );
}

export function AtivosEncontrados({
  encontrados,
  termo,
}: {
  encontrados: Encontrados;
  termo: string;
}) {
  const t = useT();
  if (encontrados.ativos.length === 0)
    return <MensagemVazia>{t('comum.busca.sem_resultado', { termo })}</MensagemVazia>;
  return (
    <ul className="hk-lista">
      {encontrados.ativos.map((a) => (
        <li key={a.id}>
          <span className="hk-em-linha">
            <Link href={`/inteligencia/ativos/${a.id}`}>{a.nome}</Link>
            <span className="hk-suave">
              {encontrados.nomes.hoteis[a.hotelId] ?? t('inteligencia.sem_valor')}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A seção abaixo da lista: as intervenções dos hotéis em que a pessoa decide. */
export function SecaoDaEfetividade({ efetividade }: { efetividade: Efetividades }) {
  const t = useT();
  return (
    <Painel
      titulo={t('inteligencia.efetividade.lista.titulo')}
      dica={t('inteligencia.efetividade.dica')}
    >
      <TabelaDeEfetividade
        efetividade={efetividade}
        vazio={t('inteligencia.efetividade.lista.vazio')}
      />
    </Painel>
  );
}

export function TabelaDeInsights({ lista }: { lista: Lista }) {
  const t = useT();
  const titulo = useTituloDoInsight();
  const escopo = useEscopoDoInsight();
  const numero = useNumeroDoInsight();
  const { data } = useDatas();
  return (
    <Tabela legenda={t('inteligencia.lista.titulo')}>
      <thead>
        <tr>
          <th scope="col">{t('inteligencia.coluna.faixa')}</th>
          <th scope="col">{t('inteligencia.coluna.o_que_e')}</th>
          <th scope="col">{t('inteligencia.coluna.escopo')}</th>
          <th scope="col" className="hk-num">
            {t('inteligencia.coluna.score')}
          </th>
          <th scope="col">{t('inteligencia.coluna.estado')}</th>
          <th scope="col">{t('inteligencia.coluna.responsavel')}</th>
          <th scope="col">{t('inteligencia.coluna.ultima_deteccao')}</th>
        </tr>
      </thead>
      <tbody>
        {lista.insights.map((i) => (
          <tr key={i.id}>
            <td>
              <SeloDaFaixa faixa={i.faixa} />
            </td>
            <td>
              <span className="hk-suave">
                {t('inteligencia.insight.numero_e_tipo', {
                  numero: numero(i.numero),
                  tipo: t('inteligencia.insight.tipo', { tipo: i.tipo }),
                })}
              </span>
              <br />
              <Link href={`/inteligencia/insights/${i.id}`}>{titulo(i, lista.nomes)}</Link>
              {i.substitui && (
                <>
                  <br />
                  <Link className="hk-suave" href={`/inteligencia/insights/${i.substitui}`}>
                    {t('inteligencia.insight.substitui_outro')}
                  </Link>
                </>
              )}
              {i.substituidoPor && (
                <>
                  <br />
                  <Link className="hk-suave" href={`/inteligencia/insights/${i.substituidoPor}`}>
                    {t('inteligencia.insight.substituido_por_outro')}
                  </Link>
                </>
              )}
            </td>
            <td>{escopo(i, lista.nomes)}</td>
            <td className="hk-num">{i.valor ?? t('inteligencia.sem_valor')}</td>
            <td>
              <SeloDoEstado estado={i.estado} />
              {i.motivoDeDescarte && (
                <>
                  <br />
                  <span className="hk-suave">
                    {t('inteligencia.insight.motivo_descarte', { motivo: i.motivoDeDescarte })}
                  </span>
                </>
              )}
            </td>
            <td>
              {i.responsavelId
                ? (lista.nomes.pessoas[i.responsavelId] ?? t('inteligencia.sem_valor'))
                : t('inteligencia.sem_responsavel')}
            </td>
            <td>{data(i.ultimaDeteccaoEm)}</td>
          </tr>
        ))}
      </tbody>
    </Tabela>
  );
}
