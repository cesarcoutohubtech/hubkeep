'use client';
// As reclamações de hóspede no Intelligence (ADR-047, a 1.5 sem IA; Cesar e
// Kaio, 16/10/2026), de um hotel por vez:
// - a importação do CSV: o navegador lê o arquivo e manda só as colunas do
//   HubKeep, em partes abaixo do limite do corpo; a resposta diz, por linha,
//   o que entrou, o repetido e o erro, com a linha do arquivo;
// - a fila de classificação: as sem classificação por padrão. Uma pessoa diz
//   se é manutenção e, sendo, a categoria, a UH e o ativo, com a ligação
//   possível ou confirmada. Nada liga a reclamação ao ativo sem ela;
// - abrir chamado a partir da reclamação de manutenção com UH ou ativo
//   (adendo de 19/10/2026 ao ADR-047): o chamado abre pelo núcleo, na UH ou
//   no local do ativo, com "afeta hóspede"; o texto do hóspede não vai junto,
//   e a descrição vem com uma sugestão que a pessoa completa.
// As categorias, as UHs e os ativos vêm das rotas do núcleo que quem decide
// insight no hotel já lê. Sem decidir no hotel, a API responde
// hotel_nao_encontrado; sem o módulo, inteligencia_indisponivel.
import type {
  RespostaDaFilaDeSinais,
  RespostaDaImportacaoDeSinais,
  RespostaDeAtivosDoHotel,
  RespostaDeCategorias,
  RespostaDeLocaisDoHotel,
  z,
} from '@hubkeep/contratos';
import { COLUNAS_DO_CSV_API, LIMITE_DA_IMPORTACAO_API } from '@hubkeep/contratos';
import { CATALOGOS, IDIOMAS, type Idioma, resolverNome } from '@hubkeep/i18n';
import {
  AreaDeTexto,
  Botao,
  Campo,
  Entrada,
  MensagemDeErro,
  MensagemVazia,
  Nota,
  Painel,
  Selecao,
  Selo,
  Tabela,
} from '@hubkeep/ui';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { CampoDeBusca, comBusca } from '../../../../cliente/CampoDeBusca';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import { SeletorDeHotel, useHoteis } from '../../../../cliente/cadastro';
import { BOM } from '../../../../cliente/csv';
import { useIdioma, useT } from '../../../../i18n/cliente';
import { useDatas } from '../comum';
import {
  CABECALHO_DO_MODELO,
  type LeituraDoCsv,
  type LinhaDoCsv,
  lerCsvDeSinais,
  partesDaImportacao,
} from './csv';

type Fila = z.infer<typeof RespostaDaFilaDeSinais>;
type Sinal = Fila['sinais'][number];
type Importacao = z.infer<typeof RespostaDaImportacaoDeSinais>;
type Categoria = z.infer<typeof RespostaDeCategorias>['categorias'][number];
type Local = z.infer<typeof RespostaDeLocaisDoHotel>['locais'][number];
type Ativo = z.infer<typeof RespostaDeAtivosDoHotel>['ativos'][number];

const SITUACOES = ['pendentes', 'manutencao', 'fora', 'todas'] as const;

export interface Apoio {
  categorias: Categoria[];
  idiomaPadrao: Idioma;
  uhs: Local[];
}

export function TelaDeSinais() {
  const t = useT();
  const { hoteis, hotelId, setHotelId, erro } = useHoteis();
  // A fila relê depois de cada importação.
  const [rodada, setRodada] = useState(0);
  // Antes da data de abertura das telas (adendo de 20/10/2026 ao ADR-035), a
  // tela não leva aos insights nem à página do ativo, que ainda estão fechados.
  const [telasAbertas, setTelasAbertas] = useState(false);
  useEffect(() => {
    void chamarApi<{ telasAbertas: boolean }>('/api/v1/inteligencia/sinais/acesso').then((r) =>
      setTelasAbertas(r.ok && r.dados.telasAbertas),
    );
  }, []);
  const hotel = hoteis.find((h) => h.id === hotelId);
  return (
    <div className="hk-pilha">
      <Nota tom="info">{t('inteligencia.sinais.intro')}</Nota>
      {telasAbertas ? (
        <p>
          <Link href="/inteligencia/insights">{t('inteligencia.sinais.voltar')}</Link>
        </p>
      ) : (
        <p className="hk-suave">{t('inteligencia.sinais.antes_da_abertura')}</p>
      )}
      <Aviso aviso={erro && { tipo: 'erro', erro }} />
      {hoteis.length > 1 && (
        <SeletorDeHotel
          rotulo={t('inteligencia.sinais.hotel')}
          hoteis={hoteis}
          valor={hotelId}
          aoEscolher={setHotelId}
        />
      )}
      {hotel && (
        <>
          <ImportarSinais
            key={`importar-${hotel.id}`}
            hotelId={hotel.id}
            hotelNome={hotel.nome}
            aoImportar={() => setRodada((r) => r + 1)}
          />
          <FilaDeSinais
            key={`fila-${hotel.id}`}
            hotelId={hotel.id}
            rodada={rodada}
            telasAbertas={telasAbertas}
          />
        </>
      )}
    </div>
  );
}

/** O resultado de todas as partes, com a linha de cada erro no arquivo. */
export interface ResultadoSomado {
  entraram: number;
  repetidas: number;
  erros: { linhaNoArquivo: number; erro: string }[];
}

/** Soma as respostas das partes; a linha 1 de cada parte é a primeira linha dela. */
export function somarPartes(
  respostas: readonly Importacao[],
  partes: readonly (readonly number[])[],
): ResultadoSomado {
  const soma: ResultadoSomado = { entraram: 0, repetidas: 0, erros: [] };
  respostas.forEach((r, i) => {
    soma.entraram += r.entraram;
    soma.repetidas += r.repetidas;
    for (const l of r.linhas) {
      if (l.resultado === 'erro') {
        soma.erros.push({ linhaNoArquivo: partes[i]?.[l.linha - 1] ?? l.linha, erro: l.erro });
      }
    }
  });
  return soma;
}

function ImportarSinais({
  hotelId,
  hotelNome,
  aoImportar,
}: {
  hotelId: string;
  hotelNome: string;
  aoImportar: () => void;
}) {
  const t = useT();
  const [arquivo, setArquivo] = useState('');
  const [leitura, setLeitura] = useState<LeituraDoCsv | null>(null);
  const [progresso, setProgresso] = useState<{ parte: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<ResultadoSomado | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);

  const escolher = async (f: File) => {
    setResultado(null);
    setErro(null);
    setArquivo(f.name);
    setLeitura(lerCsvDeSinais(await f.text()));
  };

  const importar = async () => {
    if (!leitura?.ok) return;
    const numeradas = leitura.linhas.map((linha, i) => ({
      linha,
      noArquivo: leitura.linhasNoArquivo[i] ?? i + 2,
    }));
    const partes = partesDaImportacao(numeradas.map((n) => n.linha)).reduce<
      { linhas: LinhaDoCsv[]; noArquivo: number[] }[]
    >((acc, linhas) => {
      const inicio = acc.reduce((n, p) => n + p.linhas.length, 0);
      acc.push({
        linhas,
        noArquivo: numeradas.slice(inicio, inicio + linhas.length).map((n) => n.noArquivo),
      });
      return acc;
    }, []);
    const respostas: Importacao[] = [];
    setErro(null);
    for (const [i, parte] of partes.entries()) {
      setProgresso({ parte: i + 1, total: partes.length });
      const r = await chamarApi<Importacao>('/api/v1/inteligencia/sinais/importacoes', {
        method: 'POST',
        body: JSON.stringify({ hotelId, linhas: parte.linhas }),
      });
      if (!r.ok) {
        setErro(r.erro);
        break;
      }
      respostas.push(r.dados);
    }
    setProgresso(null);
    if (respostas.length) {
      setResultado(
        somarPartes(
          respostas,
          partes.map((p) => p.noArquivo),
        ),
      );
      setLeitura(null);
      aoImportar();
    }
  };

  const baixarModelo = () => {
    const url = URL.createObjectURL(
      new Blob([`${BOM}${CABECALHO_DO_MODELO}\r\n`], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = t('inteligencia.sinais.importacao.modelo_arquivo');
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Painel
      titulo={t('inteligencia.sinais.importacao.titulo')}
      dica={t('inteligencia.sinais.importacao.dica', {
        colunas: COLUNAS_DO_CSV_API.join(', '),
        limite: LIMITE_DA_IMPORTACAO_API,
      })}
      acoes={
        <Botao tamanho="pequeno" onClick={baixarModelo}>
          {t('inteligencia.sinais.importacao.modelo')}
        </Botao>
      }
    >
      <div className="hk-pilha">
        <Campo rotulo={t('inteligencia.sinais.importacao.arquivo')}>
          {(c) => (
            <Entrada
              {...c}
              type="file"
              accept=".csv,text/csv"
              disabled={progresso !== null}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (f) void escolher(f);
              }}
            />
          )}
        </Campo>
        {leitura && <LeituraDoArquivo leitura={leitura} arquivo={arquivo} />}
        {leitura?.ok && (
          <div className="hk-linha-de-botoes">
            <Botao
              variante="primario"
              disabled={progresso !== null}
              onClick={() => void importar()}
            >
              {progresso
                ? t('inteligencia.sinais.importacao.enviando', progresso)
                : t('inteligencia.sinais.importacao.importar', { hotel: hotelNome })}
            </Botao>
          </div>
        )}
        <Aviso aviso={erro && { tipo: 'erro', erro }} />
        {resultado && <ResultadoDaImportacao resultado={resultado} />}
      </div>
    </Painel>
  );
}

export function LeituraDoArquivo({ leitura, arquivo }: { leitura: LeituraDoCsv; arquivo: string }) {
  const t = useT();
  if (!leitura.ok) {
    return (
      <MensagemDeErro>
        {leitura.erro === 'colunas_faltando'
          ? t('inteligencia.sinais.leitura.colunas_faltando', {
              colunas: leitura.faltando.join(', '),
            })
          : leitura.erro === 'muitas_linhas'
            ? t('inteligencia.sinais.leitura.muitas_linhas', { limite: leitura.limite })
            : t('inteligencia.sinais.leitura.sem_linhas')}
      </MensagemDeErro>
    );
  }
  return (
    <>
      <p>
        {t('inteligencia.sinais.importacao.pronto', { linhas: leitura.linhas.length, arquivo })}
      </p>
      {leitura.ignoradas.length > 0 && (
        <Nota tom="atencao">
          {t('inteligencia.sinais.importacao.ignoradas', {
            colunas: leitura.ignoradas.join(', '),
          })}
        </Nota>
      )}
    </>
  );
}

export function ResultadoDaImportacao({ resultado }: { resultado: ResultadoSomado }) {
  const t = useT();
  return (
    <div className="hk-pilha">
      <Nota tom={resultado.erros.length ? 'atencao' : 'ok'}>
        {t('inteligencia.sinais.importacao.resultado', {
          entraram: resultado.entraram,
          repetidas: resultado.repetidas,
          erros: resultado.erros.length,
        })}
      </Nota>
      {resultado.erros.length > 0 && (
        <Tabela legenda={t('inteligencia.sinais.importacao.erros')} legendaVisivel>
          <thead>
            <tr>
              <th scope="col" className="hk-num">
                {t('inteligencia.sinais.importacao.coluna.linha')}
              </th>
              <th scope="col">{t('inteligencia.sinais.importacao.coluna.motivo')}</th>
            </tr>
          </thead>
          <tbody>
            {resultado.erros.map((e) => (
              <tr key={e.linhaNoArquivo}>
                <td className="hk-num">{e.linhaNoArquivo}</td>
                <td>{t('inteligencia.sinais.erro_da_linha', { erro: e.erro })}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </div>
  );
}

function FilaDeSinais({
  hotelId,
  rodada,
  telasAbertas,
}: {
  hotelId: string;
  rodada: number;
  telasAbertas: boolean;
}) {
  const t = useT();
  const [situacao, setSituacao] = useState<(typeof SITUACOES)[number]>('pendentes');
  const [fila, setFila] = useState<Fila | null>(null);
  const [apoio, setApoio] = useState<Apoio | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const [editando, setEditando] = useState<Sinal | null>(null);
  const [abrindo, setAbrindo] = useState<Sinal | null>(null);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    const q = new URLSearchParams({ hotelId, situacao });
    const r = await chamarApi<Fila>(`/api/v1/inteligencia/sinais?${q.toString()}`);
    if (!r.ok) {
      setErro(r.erro);
      setFila(null);
      return;
    }
    setErro(null);
    setFila(r.dados);
  }, [hotelId, situacao]);
  useEffect(() => {
    void carregar();
  }, [carregar, rodada]);

  useEffect(() => {
    void Promise.all([
      chamarApi<z.infer<typeof RespostaDeCategorias>>('/api/v1/categorias-de-ativo'),
      chamarApi<z.infer<typeof RespostaDeLocaisDoHotel>>(`/api/v1/hoteis/${hotelId}/locais`),
    ]).then(([c, l]) =>
      setApoio({
        categorias: c.ok ? c.dados.categorias : [],
        idiomaPadrao: c.ok ? c.dados.idiomaPadrao : 'pt-BR',
        uhs: l.ok ? l.dados.locais.filter((x) => x.tipo === 'uh') : [],
      }),
    );
  }, [hotelId]);

  return (
    <Painel titulo={t('inteligencia.sinais.fila.titulo')} dica={t('inteligencia.sinais.fila.dica')}>
      <form className="hk-filtros" onSubmit={(e) => e.preventDefault()}>
        <Campo rotulo={t('inteligencia.sinais.fila.situacao')}>
          {(p) => (
            <Selecao
              {...p}
              value={situacao}
              onChange={(e) => setSituacao(e.target.value as (typeof SITUACOES)[number])}
            >
              {SITUACOES.map((s) => (
                <option key={s} value={s}>
                  {t('inteligencia.sinais.fila.situacao.opcao', { situacao: s })}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
      </form>
      <Aviso aviso={erro ? { tipo: 'erro', erro } : aviso} />
      {fila === null ? (
        !erro && <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : fila.sinais.length === 0 ? (
        <MensagemVazia>{t('inteligencia.sinais.fila.vazia')}</MensagemVazia>
      ) : (
        <TabelaDeSinais
          fila={fila}
          apoio={apoio}
          telasAbertas={telasAbertas}
          aoEditar={(s) => {
            setAviso(null);
            setAbrindo(null);
            setEditando(s);
          }}
          aoAbrirChamado={(s) => {
            setAviso(null);
            setEditando(null);
            setAbrindo(s);
          }}
        />
      )}
      {fila?.limitada && (
        <p className="hk-suave">
          {t('inteligencia.sinais.fila.limitada', { limite: fila.sinais.length })}
        </p>
      )}
      {editando && apoio && (
        <FormularioDeClassificacao
          key={editando.id}
          sinal={editando}
          apoio={apoio}
          nomeDoAtivo={editando.ativoId ? fila?.nomes.ativos[editando.ativoId] : undefined}
          aoCancelar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null);
            setAviso({ tipo: 'ok', texto: t('inteligencia.sinais.form.salva') });
            void carregar();
          }}
        />
      )}
      {abrindo && apoio && (
        <FormularioDeChamado
          key={abrindo.id}
          sinal={abrindo}
          apoio={apoio}
          nomeDoAtivo={abrindo.ativoId ? fila?.nomes.ativos[abrindo.ativoId] : undefined}
          aoCancelar={() => setAbrindo(null)}
          aoAbrir={() => {
            setAbrindo(null);
            setAviso({ tipo: 'ok', texto: t('inteligencia.sinais.chamado.aberto') });
            void carregar();
          }}
        />
      )}
    </Painel>
  );
}

/** O nome da categoria no idioma de quem vê, como nas outras telas. */
export function useNomeDaCategoria(apoio: Apoio | null) {
  const { idioma } = useIdioma();
  const idiomaPadrao = apoio?.idiomaPadrao ?? 'pt-BR';
  const idiomaDoTexto: Idioma = (IDIOMAS as readonly string[]).includes(idioma)
    ? (idioma as Idioma)
    : idiomaPadrao;
  return (c: Categoria) =>
    resolverNome(c.nomes, idioma, {
      doCatalogo: c.chavePadrao
        ? (CATALOGOS[idiomaDoTexto][`categoria_ativo.padrao.${c.chavePadrao}`] ?? null)
        : null,
      idiomaPadrao,
    }) ?? c.id;
}

/** Pode virar chamado: de manutenção, com UH ou ativo, e ainda sem chamado. */
export const podeAbrirChamado = (s: Sinal): boolean =>
  s.manutencao === true && (s.uhId !== null || s.ativoId !== null) && s.chamadoId === null;

export function TabelaDeSinais({
  fila,
  apoio,
  telasAbertas = true,
  aoEditar,
  aoAbrirChamado,
}: {
  fila: Fila;
  apoio: Apoio | null;
  /** Antes da abertura das telas, o ativo aparece sem o link da página dele. */
  telasAbertas?: boolean;
  aoEditar: (s: Sinal) => void;
  aoAbrirChamado: (s: Sinal) => void;
}) {
  const t = useT();
  const { data, numero } = useDatas();
  const nomeDaCategoria = useNomeDaCategoria(apoio);
  const semValor = t('inteligencia.sem_valor');
  const categoria = (id: string | null) => {
    const c = id ? apoio?.categorias.find((x) => x.id === id) : undefined;
    return c ? nomeDaCategoria(c) : null;
  };
  const uh = (id: string | null) => (id ? apoio?.uhs.find((x) => x.id === id)?.nome : undefined);
  return (
    <Tabela legenda={t('inteligencia.sinais.fila.titulo')}>
      <thead>
        <tr>
          <th scope="col">{t('inteligencia.sinais.coluna.data')}</th>
          <th scope="col">{t('inteligencia.sinais.coluna.fonte')}</th>
          <th scope="col" className="hk-num">
            {t('inteligencia.sinais.coluna.nota')}
          </th>
          <th scope="col">{t('inteligencia.sinais.coluna.texto')}</th>
          <th scope="col">{t('inteligencia.sinais.coluna.classificacao')}</th>
          <th scope="col">{t('inteligencia.sinais.coluna.acao')}</th>
        </tr>
      </thead>
      <tbody>
        {fila.sinais.map((s) => (
          <tr key={s.id}>
            <td>{data(s.ocorridoEm)}</td>
            <td>
              {s.fonte}
              <br />
              <span className="hk-suave">{s.idExterno}</span>
            </td>
            <td className="hk-num">
              {s.nota !== null && s.escala !== null
                ? t('inteligencia.sinais.nota', {
                    nota: numero(s.nota, 2),
                    escala: numero(s.escala, 0),
                  })
                : semValor}
            </td>
            <td>
              {s.texto ?? (
                <span className="hk-suave">
                  {s.textoApagadoEm
                    ? t('inteligencia.sinais.texto_apagado', { data: data(s.textoApagadoEm) })
                    : t('inteligencia.sinais.sem_texto')}
                </span>
              )}
              {s.uhCitada && (
                <>
                  <br />
                  <span className="hk-suave">
                    {t('inteligencia.sinais.uh_citada', { uh: s.uhCitada })}
                  </span>
                </>
              )}
            </td>
            <td>
              <Selo tom={s.manutencao ? 'ambar' : 'cinza'}>
                {t('inteligencia.sinais.situacao', {
                  situacao:
                    s.manutencao === null ? 'pendente' : s.manutencao ? 'manutencao' : 'fora',
                })}
              </Selo>
              {s.manutencao && (
                <span className="hk-suave">
                  {[
                    categoria(s.categoriaId),
                    uh(s.uhId),
                    t('inteligencia.sinais.ligacao', { ligacao: s.ligacao }),
                  ]
                    .filter(Boolean)
                    .map((x) => (
                      <span key={x}>
                        <br />
                        {x}
                      </span>
                    ))}
                </span>
              )}
              {s.ativoId && (
                <>
                  <br />
                  {telasAbertas ? (
                    <Link href={`/inteligencia/ativos/${s.ativoId}`}>
                      {fila.nomes.ativos[s.ativoId] ?? semValor}
                    </Link>
                  ) : (
                    (fila.nomes.ativos[s.ativoId] ?? semValor)
                  )}
                </>
              )}
              {s.classificadoEm && (
                <>
                  <br />
                  <span className="hk-suave">
                    {t('inteligencia.sinais.classificado_por', {
                      pessoa:
                        (s.classificadoPor && fila.nomes.pessoas[s.classificadoPor]) || semValor,
                      data: data(s.classificadoEm),
                    })}
                  </span>
                </>
              )}
            </td>
            <td>
              <div className="hk-pilha">
                <Botao tamanho="pequeno" onClick={() => aoEditar(s)}>
                  {s.manutencao === null
                    ? t('inteligencia.sinais.acao.classificar')
                    : t('inteligencia.sinais.acao.alterar')}
                </Botao>
                {podeAbrirChamado(s) && (
                  <Botao tamanho="pequeno" onClick={() => aoAbrirChamado(s)}>
                    {t('inteligencia.sinais.acao.abrir_chamado')}
                  </Botao>
                )}
                {s.chamadoId && (
                  <Link href={`/chamados/${s.chamadoId}`}>
                    {t('inteligencia.sinais.chamado.ver')}
                  </Link>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </Tabela>
  );
}

/** A UH que a reclamação cita, se uma UH do hotel tem exatamente esse nome ou número. */
export function uhSugerida(uhs: readonly Local[], citada: string | null): string | null {
  if (!citada) return null;
  const alvo = citada.trim().toLowerCase();
  const achadas = uhs.filter((u) => {
    const nome = u.nome.trim().toLowerCase();
    return nome === alvo || nome.split(/\s+/).at(-1) === alvo;
  });
  return achadas.length === 1 ? (achadas[0]?.id ?? null) : null;
}

export function FormularioDeClassificacao({
  sinal,
  apoio,
  nomeDoAtivo,
  aoCancelar,
  aoSalvar,
}: {
  sinal: Sinal;
  apoio: Apoio;
  nomeDoAtivo: string | undefined;
  aoCancelar: () => void;
  aoSalvar: () => void;
}) {
  const t = useT();
  const { data } = useDatas();
  const nomeDaCategoria = useNomeDaCategoria(apoio);
  const [manutencao, setManutencao] = useState(
    sinal.manutencao === null ? '' : sinal.manutencao ? 'sim' : 'nao',
  );
  const [categoriaId, setCategoriaId] = useState(sinal.categoriaId ?? '');
  const [uhId, setUhId] = useState(sinal.uhId ?? uhSugerida(apoio.uhs, sinal.uhCitada) ?? '');
  const [ativo, setAtivo] = useState<{ id: string; nome: string } | null>(
    sinal.ativoId ? { id: sinal.ativoId, nome: nomeDoAtivo ?? sinal.ativoId } : null,
  );
  const [ligacao, setLigacao] = useState(
    sinal.ligacao === 'sem_ligacao' ? 'possivel' : sinal.ligacao,
  );
  const [encontrados, setEncontrados] = useState<Ativo[] | null>(null);
  const [termo, setTermo] = useState('');
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const ehManutencao = manutencao === 'sim';

  const procurar = async (novo: string) => {
    setTermo(novo);
    setAviso(null);
    if (novo === '') return setEncontrados(null);
    const r = await chamarApi<z.infer<typeof RespostaDeAtivosDoHotel>>(
      comBusca(`/api/v1/hoteis/${sinal.hotelId}/ativos`, novo),
    );
    if (!r.ok) {
      setAviso({ tipo: 'erro', erro: r.erro });
      return setEncontrados(null);
    }
    setEncontrados(r.dados.ativos.filter((a) => a.ativo));
  };

  const escolher = (a: Ativo) => {
    setAtivo({ id: a.id, nome: a.nome });
    // A categoria é a do ativo (a API recusa outra).
    if (a.categoriaId) setCategoriaId(a.categoriaId);
    setEncontrados(null);
  };

  const salvar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEnviando(true);
    const r = await chamarApi<{ versao: number }>(
      `/api/v1/inteligencia/sinais/${sinal.id}/classificacao`,
      {
        method: 'POST',
        body: JSON.stringify({
          versao: sinal.versao,
          manutencao: ehManutencao,
          categoriaId: ehManutencao && categoriaId ? categoriaId : null,
          uhId: uhId || null,
          ativoId: ehManutencao && ativo ? ativo.id : null,
          ligacao: ehManutencao && ativo ? ligacao : 'sem_ligacao',
        }),
      },
    );
    setEnviando(false);
    if (!r.ok) return setAviso({ tipo: 'erro', erro: r.erro });
    aoSalvar();
  };

  const categorias = apoio.categorias.filter((c) => c.ativa || c.id === categoriaId);
  return (
    <Painel
      nivel={3}
      titulo={t('inteligencia.sinais.form.titulo', { data: data(sinal.ocorridoEm) })}
    >
      <div className="hk-pilha">
        <p>
          {sinal.texto ??
            (sinal.textoApagadoEm
              ? t('inteligencia.sinais.texto_apagado', { data: data(sinal.textoApagadoEm) })
              : t('inteligencia.sinais.sem_texto'))}
        </p>
        {sinal.uhCitada && (
          <p className="hk-suave">{t('inteligencia.sinais.uh_citada', { uh: sinal.uhCitada })}</p>
        )}
        <Campo rotulo={t('inteligencia.sinais.form.manutencao')}>
          {(p) => (
            <Selecao {...p} value={manutencao} onChange={(e) => setManutencao(e.target.value)}>
              <option value="" disabled>
                {t('inteligencia.sinais.form.escolha')}
              </option>
              <option value="sim">{t('inteligencia.sinais.form.sim')}</option>
              <option value="nao">{t('inteligencia.sinais.form.nao')}</option>
            </Selecao>
          )}
        </Campo>
        {ehManutencao && (
          <div className="hk-pilha">
            <strong>{t('inteligencia.sinais.form.ativo')}</strong>
            <p className="hk-suave">{t('inteligencia.sinais.form.ativo_dica')}</p>
            {ativo ? (
              <p className="hk-em-linha">
                <span>{ativo.nome}</span>
                <Botao tamanho="pequeno" onClick={() => setAtivo(null)}>
                  {t('inteligencia.sinais.form.tirar_ativo')}
                </Botao>
              </p>
            ) : (
              <>
                <p className="hk-suave">{t('inteligencia.sinais.form.sem_ativo')}</p>
                <CampoDeBusca aoBuscar={(novo) => void procurar(novo)} />
                {encontrados &&
                  (encontrados.length === 0 ? (
                    <MensagemVazia>{t('comum.busca.sem_resultado', { termo })}</MensagemVazia>
                  ) : (
                    <ul className="hk-lista">
                      {encontrados.map((a) => (
                        <li key={a.id} className="hk-em-linha">
                          <span>{a.nome}</span>
                          <Botao tamanho="pequeno" onClick={() => escolher(a)}>
                            {t('inteligencia.sinais.form.escolher')}
                          </Botao>
                        </li>
                      ))}
                    </ul>
                  ))}
              </>
            )}
          </div>
        )}
        <form className="hk-pilha" onSubmit={(e) => void salvar(e)}>
          {ehManutencao && (
            <Campo rotulo={t('inteligencia.sinais.form.categoria')}>
              {(p) => (
                <Selecao
                  {...p}
                  value={categoriaId}
                  disabled={ativo !== null && categoriaId !== ''}
                  onChange={(e) => setCategoriaId(e.target.value)}
                >
                  <option value="">{t('inteligencia.sinais.form.sem_categoria')}</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nomeDaCategoria(c)}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
          )}
          {manutencao !== '' && (
            <Campo rotulo={t('inteligencia.sinais.form.uh')}>
              {(p) => (
                <Selecao {...p} value={uhId} onChange={(e) => setUhId(e.target.value)}>
                  <option value="">{t('inteligencia.sinais.form.sem_uh')}</option>
                  {apoio.uhs.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
          )}
          {ehManutencao && ativo && (
            <Campo rotulo={t('inteligencia.sinais.form.ligacao')}>
              {(p) => (
                <Selecao
                  {...p}
                  value={ligacao}
                  onChange={(e) => setLigacao(e.target.value as typeof ligacao)}
                >
                  {(['possivel', 'confirmada'] as const).map((l) => (
                    <option key={l} value={l}>
                      {t('inteligencia.sinais.ligacao', { ligacao: l })}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
          )}
          <Aviso aviso={aviso} />
          <div className="hk-linha-de-botoes">
            <Botao type="submit" variante="primario" disabled={enviando || manutencao === ''}>
              {t('inteligencia.sinais.form.salvar')}
            </Botao>
            <Botao type="button" onClick={aoCancelar}>
              {t('inteligencia.sinais.form.cancelar')}
            </Botao>
          </div>
        </form>
      </div>
    </Painel>
  );
}

/**
 * A sugestão da descrição do chamado, sem o texto do hóspede (detalhe do
 * Kaio): a fonte, a data, a categoria e a UH que a classificação tiver.
 */
export function useSugestaoDoChamado(apoio: Apoio) {
  const t = useT();
  const { data } = useDatas();
  const nomeDaCategoria = useNomeDaCategoria(apoio);
  return (s: Sinal) => {
    const c = s.categoriaId ? apoio.categorias.find((x) => x.id === s.categoriaId) : undefined;
    const uh = s.uhId ? apoio.uhs.find((x) => x.id === s.uhId)?.nome : undefined;
    const detalhe = [c ? nomeDaCategoria(c) : null, uh ?? null].filter(Boolean).join(', ');
    return t('inteligencia.sinais.chamado.sugestao', {
      fonte: s.fonte,
      data: data(s.ocorridoEm),
      temDetalhe: detalhe ? 'sim' : 'nao',
      detalhe,
    });
  };
}

export function FormularioDeChamado({
  sinal,
  apoio,
  nomeDoAtivo,
  aoCancelar,
  aoAbrir,
}: {
  sinal: Sinal;
  apoio: Apoio;
  nomeDoAtivo: string | undefined;
  aoCancelar: () => void;
  aoAbrir: (chamadoId: string) => void;
}) {
  const t = useT();
  const { data } = useDatas();
  const sugestao = useSugestaoDoChamado(apoio);
  const [comAtivo, setComAtivo] = useState(sinal.ativoId !== null);
  const [descricao, setDescricao] = useState(() => sugestao(sinal));
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);
  // O chamado que abriu sem a ligação (chamado_sem_ligacao): a pessoa liga de novo.
  const [semLigacao, setSemLigacao] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const uh = sinal.uhId ? apoio.uhs.find((x) => x.id === sinal.uhId)?.nome : undefined;

  const abrir = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEnviando(true);
    const r = await chamarApi<{ chamadoId: string }>(
      `/api/v1/inteligencia/sinais/${sinal.id}/chamado`,
      { method: 'POST', body: JSON.stringify({ comAtivo, descricao }) },
    );
    setEnviando(false);
    if (r.ok) return aoAbrir(r.dados.chamadoId);
    const chamadoId = r.erro.parametros['chamadoId'];
    if (r.erro.codigo === 'chamado_sem_ligacao' && typeof chamadoId === 'string') {
      setSemLigacao(chamadoId);
    }
    setAviso({ tipo: 'erro', erro: r.erro });
  };

  const ligar = async (chamadoId: string) => {
    setEnviando(true);
    const r = await chamarApi<{ chamadoId: string }>(
      `/api/v1/inteligencia/sinais/${sinal.id}/chamado/ligacao`,
      { method: 'POST', body: JSON.stringify({ chamadoId }) },
    );
    setEnviando(false);
    if (r.ok) return aoAbrir(chamadoId);
    setAviso({ tipo: 'erro', erro: r.erro });
  };

  return (
    <Painel
      nivel={3}
      titulo={t('inteligencia.sinais.chamado.titulo', { data: data(sinal.ocorridoEm) })}
      dica={t('inteligencia.sinais.chamado.dica')}
    >
      {semLigacao ? (
        <div className="hk-pilha">
          <Aviso aviso={aviso} />
          <p>
            <Link href={`/chamados/${semLigacao}`}>{t('inteligencia.sinais.chamado.ver')}</Link>
          </p>
          <div className="hk-linha-de-botoes">
            <Botao variante="primario" disabled={enviando} onClick={() => void ligar(semLigacao)}>
              {t('inteligencia.sinais.chamado.ligar_de_novo')}
            </Botao>
            <Botao onClick={aoCancelar}>{t('inteligencia.sinais.form.cancelar')}</Botao>
          </div>
        </div>
      ) : (
        <form className="hk-pilha" onSubmit={(e) => void abrir(e)}>
          {sinal.ativoId && (
            <label className="hk-marcar">
              <input
                type="checkbox"
                checked={comAtivo}
                onChange={(e) => setComAtivo(e.target.checked)}
              />
              {t('inteligencia.sinais.chamado.com_ativo', {
                ativo: nomeDoAtivo ?? t('inteligencia.sem_valor'),
              })}
            </label>
          )}
          <p className="hk-suave">
            {comAtivo && sinal.ativoId
              ? t('inteligencia.sinais.chamado.local_do_ativo')
              : t('inteligencia.sinais.chamado.na_uh', { uh: uh ?? t('inteligencia.sem_valor') })}
          </p>
          <Campo rotulo={t('inteligencia.sinais.chamado.descricao')}>
            {(p) => (
              <AreaDeTexto
                {...p}
                value={descricao}
                maxLength={2000}
                rows={4}
                onChange={(e) => setDescricao(e.target.value)}
              />
            )}
          </Campo>
          <p className="hk-suave">{t('inteligencia.sinais.chamado.afeta_hospede')}</p>
          <Aviso aviso={aviso} />
          <div className="hk-linha-de-botoes">
            <Botao
              type="submit"
              variante="primario"
              disabled={enviando || descricao.trim() === '' || (!comAtivo && !sinal.uhId)}
            >
              {t('inteligencia.sinais.chamado.abrir')}
            </Botao>
            <Botao type="button" onClick={aoCancelar}>
              {t('inteligencia.sinais.form.cancelar')}
            </Botao>
          </div>
        </form>
      )}
    </Painel>
  );
}
