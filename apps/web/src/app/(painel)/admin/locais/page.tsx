'use client';
// Locais do hotel (fase 1a, B1): UHs do sistema hoteleiro, só leitura, com o
// status da licença, e áreas comuns cadastradas aqui. Visual do pacote de
// interface (ADR-038, U4b). A edificação (I2) se edita em todo local, também
// na UH, com a sugestão das edificações que já existem no hotel.
import {
  Botao,
  Campo,
  Entrada,
  MensagemVazia,
  Painel,
  Selo,
  Tabela,
  type TomDeSelo,
} from '@hubkeep/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AnexosDoRegistro } from '../../../../cliente/AnexosDoRegistro';
import { HistoricoDoRegistro } from '../../../../cliente/HistoricoDoRegistro';
import { chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import { SeletorDeHotel, useHoteis } from '../../../../cliente/cadastro';
import { CampoDeBusca, comBusca } from '../../../../cliente/CampoDeBusca';
import { useT } from '../../../../i18n/cliente';

interface Local {
  id: string;
  nome: string;
  tipo: 'uh' | 'area_comum';
  andar: string | null;
  edificacao: string | null;
  status: 'ativo' | 'pendente_licenca' | 'inativo';
  origem: 'sistema_hoteleiro' | 'manual';
  editavel: boolean;
}

const TOM_DO_STATUS: Record<Local['status'], TomDeSelo> = {
  ativo: 'verde',
  pendente_licenca: 'ambar',
  inativo: 'cinza',
};

/** O datalist das edificações do hotel, que os campos de edificação sugerem. */
const LISTA_DE_EDIFICACOES = 'hk-edificacoes-do-hotel';

const texto = (f: FormData, campo: string) => {
  const v = String(f.get(campo) ?? '').trim();
  return v === '' ? null : v;
};

export default function LocaisDoHotel() {
  const t = useT();
  const { hoteis, hotelId, setHotelId, erro: erroDosHoteis } = useHoteis();
  const [locais, setLocais] = useState<Local[] | null>(null);
  const [edificacoes, setEdificacoes] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    if (!hotelId) return;
    const r = await chamarApi<{ locais: Local[]; edificacoes: string[] }>(
      comBusca(`/api/v1/hoteis/${hotelId}/locais`, busca),
    );
    if (r.ok) {
      setLocais(r.dados.locais);
      setEdificacoes(r.dados.edificacoes);
    } else setAviso({ tipo: 'erro', erro: r.erro });
  }, [hotelId, busca]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function executar(caminho: string, init: RequestInit) {
    const r = await chamarApi<unknown>(caminho, init);
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregar();
  }

  function criar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    void executar(`/api/v1/hoteis/${hotelId}/locais`, {
      method: 'POST',
      body: JSON.stringify({
        nome: texto(f, 'nome') ?? '',
        andar: texto(f, 'andar'),
        edificacao: texto(f, 'edificacao'),
      }),
    });
  }

  function salvarEdificacao(ev: FormEvent<HTMLFormElement>, localId: string) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    void executar(`/api/v1/locais/${localId}/edificacao`, {
      method: 'PUT',
      body: JSON.stringify({ edificacao: texto(f, 'edificacao') }),
    });
  }

  const uhs = locais?.filter((l) => l.tipo === 'uh') ?? [];
  const areas = locais?.filter((l) => l.tipo === 'area_comum') ?? [];
  const status = (l: Local) => (
    <Selo tom={TOM_DO_STATUS[l.status]}>{t('admin.locais.status', { status: l.status })}</Selo>
  );

  return (
    <div className="hk-pilha">
      <Painel>
        <div className="hk-filtros">
          <SeletorDeHotel
            rotulo={t('admin.locais.escolher_hotel')}
            hoteis={hoteis}
            valor={hotelId}
            aoEscolher={setHotelId}
          />
        </div>
        <CampoDeBusca
          aoBuscar={(termo) => {
            setAviso(null);
            setBusca(termo);
          }}
        />
        <Aviso aviso={erroDosHoteis ? { tipo: 'erro', erro: erroDosHoteis } : aviso} />
        <datalist id={LISTA_DE_EDIFICACOES}>
          {edificacoes.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
      </Painel>
      {!locais ? (
        <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : (
        <div className="hk-grade" data-colunas="2">
          <Painel titulo={t('admin.locais.areas_comuns')}>
            <form onSubmit={criar} className="hk-em-linha">
              <Campo rotulo={t('admin.locais.campo.nome')}>
                {(p) => <Entrada {...p} name="nome" required />}
              </Campo>
              <Campo rotulo={t('admin.locais.campo.andar')}>
                {(p) => <Entrada {...p} name="andar" />}
              </Campo>
              <Campo
                rotulo={t('admin.locais.campo.edificacao')}
                ajuda={t('admin.locais.campo.edificacao_dica')}
              >
                {(p) => (
                  <Entrada {...p} name="edificacao" list={LISTA_DE_EDIFICACOES} maxLength={60} />
                )}
              </Campo>
              <Botao type="submit" variante="primario">
                {t('admin.locais.acao.criar')}
              </Botao>
            </form>
            {areas.length === 0 ? (
              <MensagemVazia>
                {busca === ''
                  ? t('admin.locais.sem_areas')
                  : t('comum.busca.sem_resultado', { termo: busca })}
              </MensagemVazia>
            ) : (
              <ul className="hk-lista hk-itens">
                {areas.map((l) => (
                  <li key={l.id}>
                    <form
                      key={`${l.nome}|${l.andar ?? ''}|${l.edificacao ?? ''}`}
                      className="hk-em-linha"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        const f = new FormData(ev.currentTarget);
                        void executar(`/api/v1/locais/${l.id}`, {
                          method: 'PUT',
                          body: JSON.stringify({
                            nome: texto(f, 'nome') ?? '',
                            andar: texto(f, 'andar'),
                            edificacao: texto(f, 'edificacao'),
                          }),
                        });
                      }}
                    >
                      <Entrada
                        name="nome"
                        defaultValue={l.nome}
                        aria-label={t('admin.locais.campo.nome')}
                        disabled={!l.editavel}
                      />
                      <Entrada
                        name="andar"
                        defaultValue={l.andar ?? ''}
                        aria-label={t('admin.locais.campo.andar')}
                        disabled={!l.editavel}
                      />
                      <Entrada
                        name="edificacao"
                        defaultValue={l.edificacao ?? ''}
                        aria-label={t('admin.locais.campo.edificacao')}
                        list={LISTA_DE_EDIFICACOES}
                        maxLength={60}
                        disabled={!l.editavel}
                      />
                      {status(l)}
                      {l.editavel ? (
                        <div className="hk-linha-de-botoes">
                          <Botao type="submit" tamanho="pequeno">
                            {t('admin.locais.acao.salvar')}
                          </Botao>
                          <Botao
                            tamanho="pequeno"
                            onClick={() =>
                              void executar(
                                `/api/v1/locais/${l.id}/${l.status === 'inativo' ? 'reativacao' : 'desativacao'}`,
                                { method: 'POST' },
                              )
                            }
                          >
                            {l.status === 'inativo'
                              ? t('admin.locais.acao.reativar')
                              : t('admin.locais.acao.desativar')}
                          </Botao>
                        </div>
                      ) : (
                        <span className="hk-suave">{t('admin.locais.do_sistema_hoteleiro')}</span>
                      )}
                    </form>
                    <AnexosDoRegistro entidade="local" registroId={l.id} />
                    <HistoricoDoRegistro entidade="local" registroId={l.id} />
                  </li>
                ))}
              </ul>
            )}
          </Painel>
          <Painel titulo={t('admin.locais.uhs')} dica={t('admin.locais.uhs_ajuda')}>
            {uhs.length === 0 ? (
              <MensagemVazia>
                {busca === ''
                  ? t('admin.locais.sem_uhs')
                  : t('comum.busca.sem_resultado', { termo: busca })}
              </MensagemVazia>
            ) : (
              <Tabela legenda={t('admin.locais.uhs')}>
                <thead>
                  <tr>
                    <th scope="col">{t('admin.locais.campo.nome')}</th>
                    <th scope="col">{t('admin.locais.campo.andar')}</th>
                    <th scope="col">{t('admin.locais.campo.edificacao')}</th>
                    <th scope="col">{t('admin.locais.campo.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {uhs.map((l) => (
                    <tr key={l.id}>
                      <td>{l.nome}</td>
                      <td>{l.andar ?? ''}</td>
                      <td>
                        <form
                          key={l.edificacao ?? ''}
                          className="hk-em-linha"
                          onSubmit={(ev) => salvarEdificacao(ev, l.id)}
                        >
                          <Entrada
                            name="edificacao"
                            defaultValue={l.edificacao ?? ''}
                            aria-label={t('admin.locais.campo.edificacao')}
                            list={LISTA_DE_EDIFICACOES}
                            maxLength={60}
                          />
                          <Botao type="submit" tamanho="pequeno">
                            {t('admin.locais.acao.salvar')}
                          </Botao>
                        </form>
                      </td>
                      <td>{status(l)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            )}
          </Painel>
        </div>
      )}
    </div>
  );
}
