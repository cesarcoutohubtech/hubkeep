'use client';
// Auditoria geral (fase 1c; decisões 12 a 14 do Cesar de 13/10/2026): só
// leitura, para a gestão (Admin do grupo, Gestor CSC e Gerente do hotel, este
// só nos hotéis dele). Filtros por período (até 92 dias), hotel, tipo de
// registro, ação e pessoa; páginas de 50 linhas por cursor; o antes e o depois
// num detalhe que abre na linha, com a tradução do histórico por registro (D1).
// A exportação pede páginas de 1.000 linhas e junta o CSV no navegador, até
// 50 mil, com o BOM e o separador do formato regional de quem exporta: a
// resposta de uma função da Vercel tem limite de tamanho, e o texto sai do
// mesmo catálogo da tela. A lista de ações e de pessoas do filtro é a das
// linhas já carregadas.
import { LIMITES_DA_AUDITORIA } from '@hubkeep/dominio';
import type { RespostaDaAuditoriaGeral, z } from '@hubkeep/contratos';
import { ENTIDADES_DA_AUDITORIA_API } from '@hubkeep/contratos';
import { separadorDeCsv } from '@hubkeep/i18n';
import {
  Botao,
  Campo,
  Entrada,
  MensagemDeErro,
  MensagemVazia,
  Nota,
  Painel,
  Selecao,
  Tabela,
} from '@hubkeep/ui';
import { type FormEvent, useState } from 'react';
import { useIntl } from 'react-intl';
import { type ErroDaApi, type RespostaDaApi, chamarApi } from '../../../../cliente/api';
import { useHoteis } from '../../../../cliente/cadastro';
import { arquivoCsv } from '../../../../cliente/csv';
import {
  chaveDaAcao,
  useCriarFormatadorDeValor,
  useTextoDaMudanca,
} from '../../../../cliente/HistoricoDoRegistro';
import { useMensagemDeErro, useT } from '../../../../i18n/cliente';

type Resposta = z.infer<typeof RespostaDaAuditoriaGeral>;
type Linha = Resposta['linhas'][number];

interface Filtro {
  de: string;
  ate: string;
  hotelId: string;
  entidade: string;
  acao: string;
  pessoa: string;
}

const DATA_E_HORA = { dateStyle: 'short', timeStyle: 'short' } as const;
const dois = (n: number) => String(n).padStart(2, '0');
const dataLocal = (d: Date) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;

/** De 'AAAA-MM-DD' (o dia local de quem consulta) ao instante: o início do dia, e o fim exclusive. */
const inicioDoDia = (dia: string) => new Date(`${dia}T00:00:00`);
const fimDoDia = (dia: string) => {
  const d = inicioDoDia(dia);
  d.setDate(d.getDate() + 1);
  return d;
};

function caminho(f: Filtro, cursor: string | null, exportacao: boolean) {
  const p = new URLSearchParams({
    de: inicioDoDia(f.de).toISOString(),
    ate: fimDoDia(f.ate).toISOString(),
  });
  if (f.hotelId) p.set('hotelId', f.hotelId);
  if (f.entidade) p.set('entidade', f.entidade);
  if (f.acao) p.set('acao', f.acao);
  if (f.pessoa) p.set('pessoa', f.pessoa);
  if (cursor) p.set('cursor', cursor);
  if (exportacao) p.set('exportacao', '1');
  return `/api/v1/auditoria/geral?${p.toString()}`;
}

export default function AuditoriaGeral() {
  const t = useT();
  const intl = useIntl();
  const mensagemDeErro = useMensagemDeErro();
  const criarFormatador = useCriarFormatadorDeValor();
  const textoDaMudanca = useTextoDaMudanca();
  const { hoteis } = useHoteis();
  const hoje = new Date();
  const [filtro, setFiltro] = useState<Filtro>({
    de: dataLocal(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 29)),
    ate: dataLocal(hoje),
    hotelId: '',
    entidade: '',
    acao: '',
    pessoa: '',
  });
  const [dados, setDados] = useState<Resposta | null>(null);
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set());
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [exportadas, setExportadas] = useState<number | null>(null);

  async function consultar(f: Filtro, cursor: string | null) {
    setErro(null);
    setAviso(null);
    const r = await chamarApi<Resposta>(caminho(f, cursor, false));
    if (!r.ok) return setErro(r.erro);
    setDados((atual) =>
      cursor && atual
        ? {
            ...r.dados,
            linhas: [...atual.linhas, ...r.dados.linhas],
            referencias: { ...atual.referencias, ...r.dados.referencias },
          }
        : r.dados,
    );
    if (!cursor) setAbertas(new Set());
  }

  function aoConsultar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const novo: Filtro = {
      de: String(f.get('de') ?? ''),
      ate: String(f.get('ate') ?? ''),
      hotelId: String(f.get('hotelId') ?? ''),
      entidade: String(f.get('entidade') ?? ''),
      acao: String(f.get('acao') ?? ''),
      pessoa: String(f.get('pessoa') ?? ''),
    };
    setFiltro(novo);
    void consultar(novo, null);
  }

  const nomeDoRegistro = (entidade: string) => t('auditoria.entidade', { entidade });
  const nomeDaAcao = (l: Pick<Linha, 'entidade' | 'acao'>) =>
    t(chaveDaAcao(l.entidade), { acao: l.acao });
  const nomeDoHotel = (l: Linha) =>
    l.hotelId === null
      ? t('admin.auditoria.sem_hotel')
      : (l.hotelNome ?? t('auditoria.sem_acesso'));
  const quem = (l: Linha) =>
    l.usuarioId === null
      ? t('admin.auditoria.filtro.sistema')
      : (l.usuarioNome ?? t('auditoria.sem_acesso'));

  async function exportar() {
    setErro(null);
    setAviso(null);
    setExportadas(0);
    try {
      const preferencias = await chamarApi<{ formatoRegional: string }>('/api/v1/preferencias');
      const separador = separadorDeCsv(
        preferencias.ok ? preferencias.dados.formatoRegional : intl.locale,
      );
      const linhas: Linha[] = [];
      let referencias: Resposta['referencias'] = {};
      let idiomaPadrao = 'pt-BR';
      let cursor: string | null = null;
      do {
        const r: RespostaDaApi<Resposta> = await chamarApi<Resposta>(caminho(filtro, cursor, true));
        if (!r.ok) return setErro(r.erro);
        linhas.push(...r.dados.linhas);
        referencias = { ...referencias, ...r.dados.referencias };
        idiomaPadrao = r.dados.idiomaPadrao;
        cursor = r.dados.proximoCursor;
        if (linhas.length > LIMITES_DA_AUDITORIA.linhasNoCsv) {
          return setAviso(
            t('admin.auditoria.exportacao_grande', { limite: LIMITES_DA_AUDITORIA.linhasNoCsv }),
          );
        }
        setExportadas(linhas.length);
      } while (cursor);
      const formatar = criarFormatador({ referencias, idiomaPadrao });
      const conteudo = arquivoCsv(
        [
          [
            t('admin.auditoria.coluna.quando'),
            t('admin.auditoria.coluna.hotel'),
            t('admin.auditoria.coluna.registro'),
            t('admin.auditoria.coluna.registro_id'),
            t('admin.auditoria.coluna.acao'),
            t('admin.auditoria.coluna.pessoa'),
            t('admin.auditoria.coluna.mudancas'),
          ],
          ...linhas.map((l) => [
            intl.formatDate(l.em, DATA_E_HORA),
            nomeDoHotel(l),
            nomeDoRegistro(l.entidade),
            l.registroId,
            nomeDaAcao(l),
            quem(l),
            l.mudancas.map((m) => textoDaMudanca(m, formatar)).join(' | '),
          ]),
        ],
        separador,
      );
      const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = t('admin.auditoria.arquivo', { de: filtro.de, ate: filtro.ate });
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportadas(null);
    }
  }

  const formatar = dados ? criarFormatador(dados) : null;
  // As opções de ação e de pessoa saem das linhas já carregadas.
  const acoes = new Map<string, Pick<Linha, 'entidade' | 'acao'>>();
  const pessoas = new Map<string, string>();
  for (const l of dados?.linhas ?? []) {
    if (!acoes.has(l.acao)) acoes.set(l.acao, l);
    if (l.usuarioId && l.usuarioNome) pessoas.set(l.usuarioId, l.usuarioNome);
  }
  const alternar = (id: string) =>
    setAbertas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  return (
    <div className="hk-pilha">
      <Painel dica={t('admin.auditoria.descricao', { dias: LIMITES_DA_AUDITORIA.diasPorConsulta })}>
        <form className="hk-em-linha" onSubmit={aoConsultar}>
          <Campo rotulo={t('admin.auditoria.filtro.de')}>
            {(p) => <Entrada {...p} type="date" name="de" defaultValue={filtro.de} required />}
          </Campo>
          <Campo rotulo={t('admin.auditoria.filtro.ate')}>
            {(p) => <Entrada {...p} type="date" name="ate" defaultValue={filtro.ate} required />}
          </Campo>
          <Campo rotulo={t('admin.auditoria.filtro.hotel')}>
            {(p) => (
              <Selecao {...p} name="hotelId" defaultValue={filtro.hotelId}>
                <option value="">{t('admin.auditoria.filtro.todos')}</option>
                {hoteis.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nome}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo={t('admin.auditoria.filtro.entidade')}>
            {(p) => (
              <Selecao {...p} name="entidade" defaultValue={filtro.entidade}>
                <option value="">{t('admin.auditoria.filtro.todos')}</option>
                {ENTIDADES_DA_AUDITORIA_API.map((e) => (
                  <option key={e} value={e}>
                    {nomeDoRegistro(e)}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo={t('admin.auditoria.filtro.acao')} ajuda={t('admin.auditoria.filtro.dica')}>
            {(p) => (
              <Selecao {...p} name="acao" defaultValue={filtro.acao}>
                <option value="">{t('admin.auditoria.filtro.todos')}</option>
                {[...acoes.values()].map((l) => (
                  <option key={l.acao} value={l.acao}>
                    {nomeDaAcao(l)}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo={t('admin.auditoria.filtro.pessoa')}>
            {(p) => (
              <Selecao {...p} name="pessoa" defaultValue={filtro.pessoa}>
                <option value="">{t('admin.auditoria.filtro.todos')}</option>
                <option value="sistema">{t('admin.auditoria.filtro.sistema')}</option>
                {[...pessoas].map(([id, nome]) => (
                  <option key={id} value={id}>
                    {nome}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Botao type="submit" variante="primario">
            {t('admin.auditoria.acao.consultar')}
          </Botao>
          {dados && dados.linhas.length > 0 && (
            <Botao disabled={exportadas !== null} onClick={() => void exportar()}>
              {t('admin.auditoria.acao.exportar')}
            </Botao>
          )}
        </form>
        {exportadas !== null && (
          <Nota tom="info">{t('admin.auditoria.exportando', { n: exportadas })}</Nota>
        )}
        {aviso && <Nota tom="atencao">{aviso}</Nota>}
        {erro && <MensagemDeErro>{mensagemDeErro(erro)}</MensagemDeErro>}
      </Painel>

      {dados &&
        (dados.linhas.length === 0 ? (
          <MensagemVazia>{t('admin.auditoria.vazio')}</MensagemVazia>
        ) : (
          <Painel>
            <Tabela legenda={t('admin.auditoria.legenda')}>
              <thead>
                <tr>
                  <th scope="col">{t('admin.auditoria.coluna.quando')}</th>
                  <th scope="col">{t('admin.auditoria.coluna.hotel')}</th>
                  <th scope="col">{t('admin.auditoria.coluna.registro')}</th>
                  <th scope="col">{t('admin.auditoria.coluna.acao')}</th>
                  <th scope="col">{t('admin.auditoria.coluna.pessoa')}</th>
                  <th scope="col">{t('admin.auditoria.coluna.mudancas')}</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => (
                  <tr key={l.id}>
                    <td>{intl.formatDate(l.em, DATA_E_HORA)}</td>
                    <td>{nomeDoHotel(l)}</td>
                    <td>{nomeDoRegistro(l.entidade)}</td>
                    <td>{nomeDaAcao(l)}</td>
                    <td>{quem(l)}</td>
                    <td>
                      {l.mudancas.length === 0 ? (
                        <span className="hk-suave">{t('admin.auditoria.sem_mudancas')}</span>
                      ) : abertas.has(l.id) && formatar ? (
                        <div className="hk-pilha">
                          <ul>
                            {l.mudancas.map((m) => (
                              <li key={`${m.campo}.${m.chave ?? ''}`} className="hk-suave">
                                {textoDaMudanca(m, formatar)}
                              </li>
                            ))}
                          </ul>
                          <Botao tamanho="pequeno" onClick={() => alternar(l.id)}>
                            {t('admin.auditoria.acao.esconder')}
                          </Botao>
                        </div>
                      ) : (
                        <Botao tamanho="pequeno" onClick={() => alternar(l.id)}>
                          {t('admin.auditoria.acao.detalhe')}
                        </Botao>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
            {dados.proximoCursor && (
              <Botao onClick={() => void consultar(filtro, dados.proximoCursor)}>
                {t('admin.auditoria.acao.mais')}
              </Botao>
            )}
          </Painel>
        ))}
    </div>
  );
}
