'use client';
// Feriados do hotel (fase 1c; ADR-042): o feriado municipal e o do próprio
// hotel, que contam no calendário de SLA. Cadastra, altera o nome e a marca
// "repete todo ano", desativa e reativa; a data não muda. Quem só lê o hotel
// vê a lista, sem os formulários. Visual do pacote de interface (ADR-038).
import { Botao, Campo, Entrada, MensagemVazia, Nota, Painel, Selo } from '@hubkeep/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import { SeletorDeHotel, useHoteis } from '../../../../cliente/cadastro';
import { useT } from '../../../../i18n/cliente';

interface Feriado {
  id: string;
  data: string;
  nome: string;
  anual: boolean;
  ativo: boolean;
}
interface Lista {
  feriados: Feriado[];
  podeCadastrar: boolean;
}

export default function FeriadosDoHotel() {
  const t = useT();
  const intl = useIntl();
  const { hoteis, hotelId, setHotelId, erro: erroDosHoteis } = useHoteis();
  const [lista, setLista] = useState<Lista | null>(null);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    if (!hotelId) return;
    const r = await chamarApi<Lista>(`/api/v1/hoteis/${hotelId}/feriados`);
    if (r.ok) setLista(r.dados);
    else setAviso({ tipo: 'erro', erro: r.erro });
  }, [hotelId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function executar(caminho: string, init: RequestInit) {
    const r = await chamarApi<unknown>(caminho, init);
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregar();
  }

  function cadastrar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    void executar(`/api/v1/hoteis/${hotelId}/feriados`, {
      method: 'POST',
      body: JSON.stringify({
        data: String(f.get('data') ?? ''),
        nome: String(f.get('nome') ?? ''),
        anual: f.get('anual') === 'on',
      }),
    });
  }

  // A data é do calendário do hotel, sem hora: formata como meia-noite em UTC.
  const dataLonga = (data: string) =>
    intl.formatDate(`${data}T00:00:00Z`, { dateStyle: 'long', timeZone: 'UTC' });

  return (
    <Painel>
      <div className="hk-filtros">
        <SeletorDeHotel
          rotulo={t('admin.feriados.escolher_hotel')}
          hoteis={hoteis}
          valor={hotelId}
          aoEscolher={setHotelId}
        />
      </div>
      <Nota>{t('admin.feriados.explicacao')}</Nota>
      <Aviso aviso={erroDosHoteis ? { tipo: 'erro', erro: erroDosHoteis } : aviso} />
      {lista?.podeCadastrar && (
        <form onSubmit={cadastrar} className="hk-em-linha">
          <Campo rotulo={t('admin.feriados.campo.data')}>
            {(p) => <Entrada {...p} type="date" name="data" required />}
          </Campo>
          <Campo rotulo={t('admin.feriados.campo.nome')}>
            {(p) => <Entrada {...p} name="nome" required />}
          </Campo>
          <label className="hk-em-linha">
            <input type="checkbox" name="anual" />
            <span>{t('admin.feriados.campo.anual')}</span>
          </label>
          <Botao type="submit" variante="primario">
            {t('admin.feriados.acao.cadastrar')}
          </Botao>
        </form>
      )}

      {!lista ? (
        <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : lista.feriados.length === 0 ? (
        <MensagemVazia>{t('admin.feriados.vazio')}</MensagemVazia>
      ) : (
        <ul className="hk-lista hk-itens">
          {lista.feriados.map((f) => (
            <li key={f.id}>
              <div className="hk-item-cabecalho">
                <strong>{dataLonga(f.data)}</strong>
                {lista.podeCadastrar ? (
                  <form
                    className="hk-em-linha"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      const dados = new FormData(ev.currentTarget);
                      void executar(`/api/v1/feriados/${f.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                          nome: String(dados.get('nome') ?? ''),
                          anual: dados.get('anual') === 'on',
                        }),
                      });
                    }}
                  >
                    <Entrada
                      name="nome"
                      defaultValue={f.nome}
                      aria-label={t('admin.feriados.campo.nome')}
                    />
                    <label className="hk-em-linha">
                      <input type="checkbox" name="anual" defaultChecked={f.anual} />
                      <span>{t('admin.feriados.campo.anual')}</span>
                    </label>
                    <Botao type="submit" tamanho="pequeno">
                      {t('admin.feriados.acao.salvar')}
                    </Botao>
                  </form>
                ) : (
                  <span>{f.nome}</span>
                )}
                {f.anual && <Selo tom="azul">{t('admin.feriados.anual')}</Selo>}
                <Selo tom={f.ativo ? 'verde' : 'cinza'}>
                  {f.ativo ? t('admin.feriados.ativo') : t('admin.feriados.desativado')}
                </Selo>
                {lista.podeCadastrar && (
                  <div className="hk-linha-de-botoes">
                    <Botao
                      tamanho="pequeno"
                      onClick={() =>
                        void executar(
                          `/api/v1/feriados/${f.id}/${f.ativo ? 'desativacao' : 'reativacao'}`,
                          { method: 'POST' },
                        )
                      }
                    >
                      {f.ativo
                        ? t('admin.feriados.acao.desativar')
                        : t('admin.feriados.acao.reativar')}
                    </Botao>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}
