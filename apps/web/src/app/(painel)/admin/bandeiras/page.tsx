'use client';
// Bandeiras (fase 1a, A2): criar, renomear, desativar e a bandeira de cada
// hotel. Visual do pacote de interface (ADR-038, U4b).
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
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import { useMensagemDeErro, useT } from '../../../../i18n/cliente';

interface Bandeira {
  id: string;
  nome: string;
  ativa: boolean;
}
interface Hotel {
  id: string;
  nome: string;
  bandeiraId: string | null;
}

export default function Bandeiras() {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  const [bandeiras, setBandeiras] = useState<Bandeira[] | null>(null);
  const [hoteis, setHoteis] = useState<Hotel[]>([]);
  const [erroDaLista, setErroDaLista] = useState<ErroDaApi | null>(null);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    const [b, h] = await Promise.all([
      chamarApi<{ bandeiras: Bandeira[] }>('/api/v1/bandeiras'),
      chamarApi<{ hoteis: Hotel[] }>('/api/v1/hoteis'),
    ]);
    if (b.ok) setBandeiras(b.dados.bandeiras);
    else setErroDaLista(b.erro);
    if (h.ok) setHoteis(h.dados.hoteis);
  }, []);

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
    const nome = String(new FormData(ev.currentTarget).get('nome') ?? '');
    void executar('/api/v1/bandeiras', { method: 'POST', body: JSON.stringify({ nome }) });
  }

  if (!bandeiras) {
    return erroDaLista ? (
      <MensagemDeErro>{mensagemDeErro(erroDaLista)}</MensagemDeErro>
    ) : (
      <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
    );
  }

  return (
    <div className="hk-pilha">
      <Aviso aviso={aviso} />
      <div className="hk-grade" data-colunas="2">
        <Painel>
          <form onSubmit={criar} className="hk-em-linha">
            <Campo rotulo={t('admin.bandeiras.campo.nome')}>
              {(p) => <Entrada {...p} name="nome" required />}
            </Campo>
            <Botao type="submit" variante="primario">
              {t('admin.bandeiras.acao.criar')}
            </Botao>
          </form>
          {bandeiras.length === 0 ? (
            <MensagemVazia>{t('admin.bandeiras.vazio')}</MensagemVazia>
          ) : (
            <ul className="hk-lista">
              {bandeiras.map((b) => (
                <li key={b.id}>
                  <form
                    className="hk-em-linha"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      const nome = String(new FormData(ev.currentTarget).get('nome') ?? '');
                      void executar(`/api/v1/bandeiras/${b.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ nome }),
                      });
                    }}
                  >
                    <Entrada
                      name="nome"
                      defaultValue={b.nome}
                      aria-label={t('admin.bandeiras.campo.nome')}
                    />
                    <Botao type="submit" tamanho="pequeno">
                      {t('admin.bandeiras.acao.renomear')}
                    </Botao>
                  </form>
                  <div className="hk-linha-de-botoes">
                    <Selo tom={b.ativa ? 'verde' : 'cinza'}>
                      {b.ativa ? t('admin.bandeiras.ativa') : t('admin.bandeiras.desativada')}
                    </Selo>
                    <Botao
                      tamanho="pequeno"
                      onClick={() =>
                        void executar(
                          `/api/v1/bandeiras/${b.id}/${b.ativa ? 'desativacao' : 'reativacao'}`,
                          { method: 'POST' },
                        )
                      }
                    >
                      {b.ativa
                        ? t('admin.bandeiras.acao.desativar')
                        : t('admin.bandeiras.acao.reativar')}
                    </Botao>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Painel>

        <Painel titulo={t('admin.bandeiras.hoteis')}>
          <ul className="hk-lista">
            {hoteis.map((h) => (
              <li key={h.id}>
                <span>{h.nome}</span>
                <div className="hk-em-linha">
                  <Selecao
                    aria-label={t('admin.bandeiras.titulo')}
                    value={h.bandeiraId ?? ''}
                    onChange={(e) =>
                      void executar(`/api/v1/hoteis/${h.id}/bandeira`, {
                        method: 'PUT',
                        body: JSON.stringify({ bandeiraId: e.target.value || null }),
                      })
                    }
                  >
                    <option value="">{t('admin.bandeiras.sem_bandeira')}</option>
                    {bandeiras
                      .filter((b) => b.ativa || b.id === h.bandeiraId)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nome}
                        </option>
                      ))}
                  </Selecao>
                </div>
              </li>
            ))}
          </ul>
        </Painel>
      </div>
    </div>
  );
}
