'use client';
// Administração de hotéis (fase 1a, A1): o que chegou do sistema hoteleiro, a
// importação para implantação e a ativação, que consome licença. Visual do
// pacote de interface (ADR-038, U4b). O modelo contratual (I2) aparece e
// filtra a lista; quem o grava é o Admin do grupo, na configuração do hotel.
import { MODELOS_CONTRATUAIS_API } from '@hubkeep/contratos';
import {
  Botao,
  Campo,
  MensagemDeErro,
  MensagemVazia,
  Painel,
  Selecao,
  Selo,
  Tabela,
  type TomDeSelo,
} from '@hubkeep/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import { HistoricoDoRegistro } from '../../../../cliente/HistoricoDoRegistro';
import { useMensagemDeErro, useT } from '../../../../i18n/cliente';

interface HotelParaAtivacao {
  fonte: string;
  chave: string;
  nome: string | null;
  fuso: string | null;
  hotel: {
    id: string;
    status: string;
    nome: string;
    fuso: string;
    modeloContratual: string | null;
  } | null;
  diferencas: ('nome' | 'fuso')[];
}
interface Lista {
  hoteis: HotelParaAtivacao[];
  uso: {
    hoteis: { contratados: number; emUso: number };
    uhs: { contratadas: number; emUso: number };
  };
}

/** Cor da situação do hotel: ativo verde, em implantação âmbar, o resto cinza. */
const TOM_DA_SITUACAO: Record<string, TomDeSelo> = { ativo: 'verde', em_implantacao: 'ambar' };

/** Nulo é "não informado", que também é uma opção do filtro. */
const NAO_INFORMADO = 'nao_informado';
const modeloDo = (h: HotelParaAtivacao) => h.hotel?.modeloContratual ?? NAO_INFORMADO;

export default function HoteisDoSistemaHoteleiro() {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  const [lista, setLista] = useState<Lista | null>(null);
  const [erroDaLista, setErroDaLista] = useState<ErroDaApi | null>(null);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);
  const [fusos, setFusos] = useState<Record<string, string>>({});
  const [filtroDeModelo, setFiltroDeModelo] = useState('');
  const opcoesDeFuso = useMemo(() => Intl.supportedValuesOf('timeZone'), []);

  const carregar = useCallback(async () => {
    const r = await chamarApi<Lista>('/api/v1/hoteis/staging');
    if (r.ok) {
      setLista(r.dados);
      setErroDaLista(null);
    } else setErroDaLista(r.erro);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function importar(h: HotelParaAtivacao) {
    const fuso = fusos[`${h.fonte}|${h.chave}`] ?? h.fuso;
    const r = await chamarApi<{ hotelId: string }>('/api/v1/hoteis/importacoes', {
      method: 'POST',
      body: JSON.stringify({ fonte: h.fonte, chave: h.chave, fuso }),
    });
    setAviso(
      r.ok ? { tipo: 'ok', texto: t('admin.hoteis.importado') } : { tipo: 'erro', erro: r.erro },
    );
    await carregar();
  }

  async function ativar(hotelId: string) {
    const r = await chamarApi<{ uhsLiberadas: number; uhsPendentes: number }>(
      `/api/v1/hoteis/${hotelId}/ativacao`,
      { method: 'POST' },
    );
    setAviso(
      r.ok
        ? {
            tipo: 'ok',
            texto: t('admin.hoteis.ativado', {
              liberadas: r.dados.uhsLiberadas,
              pendentes: r.dados.uhsPendentes,
            }),
          }
        : { tipo: 'erro', erro: r.erro },
    );
    await carregar();
  }

  if (erroDaLista) return <MensagemDeErro>{mensagemDeErro(erroDaLista)}</MensagemDeErro>;
  if (!lista) return <MensagemVazia>{t('comum.carregando')}</MensagemVazia>;
  // O filtro só olha os hotéis já importados: o que não foi importado não tem modelo.
  const visiveis =
    filtroDeModelo === ''
      ? lista.hoteis
      : lista.hoteis.filter((h) => h.hotel && modeloDo(h) === filtroDeModelo);

  return (
    <Painel
      dica={t('admin.hoteis.licenca', {
        hoteisEmUso: lista.uso.hoteis.emUso,
        hoteisContratados: lista.uso.hoteis.contratados,
        uhsEmUso: lista.uso.uhs.emUso,
        uhsContratadas: lista.uso.uhs.contratadas,
      })}
    >
      <Aviso aviso={aviso} />
      {lista.hoteis.length > 0 && (
        <div className="hk-filtros">
          <Campo rotulo={t('admin.hoteis.filtro.modelo_contratual')}>
            {(p) => (
              <Selecao
                {...p}
                value={filtroDeModelo}
                onChange={(e) => setFiltroDeModelo(e.target.value)}
              >
                <option value="">{t('admin.hoteis.filtro.todos')}</option>
                {[...MODELOS_CONTRATUAIS_API, NAO_INFORMADO].map((m) => (
                  <option key={m} value={m}>
                    {t('hotel.modelo_contratual', { modelo: m })}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
        </div>
      )}
      {lista.hoteis.length === 0 ? (
        <MensagemVazia>{t('admin.hoteis.vazio')}</MensagemVazia>
      ) : visiveis.length === 0 ? (
        <MensagemVazia>{t('admin.hoteis.filtro.vazio')}</MensagemVazia>
      ) : (
        <Tabela legenda={t('admin.hoteis.titulo')}>
          <thead>
            <tr>
              <th scope="col">{t('admin.hoteis.coluna.hotel')}</th>
              <th scope="col">{t('admin.hoteis.coluna.codigo')}</th>
              <th scope="col">{t('admin.hoteis.coluna.situacao')}</th>
              <th scope="col">{t('admin.hoteis.coluna.fuso')}</th>
              <th scope="col">{t('admin.hoteis.coluna.modelo_contratual')}</th>
              <th scope="col">{t('admin.hoteis.coluna.acao')}</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((h) => {
              const chave = `${h.fonte}|${h.chave}`;
              return (
                <tr key={chave}>
                  <td>
                    <strong>{h.hotel?.nome ?? h.nome}</strong>
                    {h.diferencas.length > 0 && (
                      <p className="hk-suave">
                        {t('admin.hoteis.diferencas', {
                          campos: h.diferencas
                            .map((d) =>
                              t(
                                d === 'nome'
                                  ? 'admin.hoteis.campo.nome'
                                  : 'admin.hoteis.campo.fuso',
                              ),
                            )
                            .join(', '),
                        })}
                      </p>
                    )}
                    {h.hotel && <HistoricoDoRegistro entidade="hotel" registroId={h.hotel.id} />}
                  </td>
                  <td>
                    <span className="hk-id">{h.chave}</span>
                  </td>
                  <td>
                    {h.hotel ? (
                      <Selo tom={TOM_DA_SITUACAO[h.hotel.status] ?? 'cinza'}>
                        {t('hotel.status', { status: h.hotel.status })}
                      </Selo>
                    ) : (
                      <Selo tom="azul">{t('admin.hoteis.nao_importado')}</Selo>
                    )}
                  </td>
                  <td>
                    {h.hotel ? (
                      h.hotel.fuso
                    ) : (
                      <Selecao
                        aria-label={t('admin.hoteis.escolher_fuso')}
                        value={fusos[chave] ?? h.fuso ?? ''}
                        onChange={(e) => setFusos({ ...fusos, [chave]: e.target.value })}
                      >
                        <option value="">{t('admin.hoteis.escolher_fuso')}</option>
                        {opcoesDeFuso.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </Selecao>
                    )}
                  </td>
                  <td>
                    {h.hotel && (
                      <Selo tom={h.hotel.modeloContratual ? 'azul' : 'ambar'}>
                        {t('hotel.modelo_contratual', { modelo: modeloDo(h) })}
                      </Selo>
                    )}
                  </td>
                  <td>
                    {!h.hotel && (
                      <Botao tamanho="pequeno" variante="primario" onClick={() => void importar(h)}>
                        {t('admin.hoteis.acao.importar')}
                      </Botao>
                    )}
                    {h.hotel && h.hotel.status !== 'ativo' && (
                      <Botao
                        tamanho="pequeno"
                        variante="primario"
                        onClick={() => void ativar(h.hotel?.id ?? '')}
                      >
                        {t('admin.hoteis.acao.ativar')}
                      </Botao>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Tabela>
      )}
    </Painel>
  );
}
