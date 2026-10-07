'use client';
// Equipes do hotel (fase 1a, A6): criar, renomear, desativar e pôr ou tirar
// membro. Visual do pacote de interface (ADR-038, U4b).
import { Botao, Campo, Entrada, MensagemVazia, Painel, Selecao, Selo } from '@hubkeep/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import { SeletorDeHotel, useHoteis } from '../../../../cliente/cadastro';
import { useT } from '../../../../i18n/cliente';

interface Equipe {
  id: string;
  nome: string;
  ativa: boolean;
  membros: { usuarioId: string; nome: string; ativo: boolean }[];
}
interface Lista {
  equipes: Equipe[];
  disponiveis: { usuarioId: string; nome: string }[];
}

export default function EquipesDoHotel() {
  const t = useT();
  const { hoteis, hotelId, setHotelId, erro: erroDosHoteis } = useHoteis();
  const [lista, setLista] = useState<Lista | null>(null);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    if (!hotelId) return;
    const r = await chamarApi<Lista>(`/api/v1/hoteis/${hotelId}/equipes`);
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

  function criar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const nome = String(new FormData(ev.currentTarget).get('nome') ?? '');
    void executar(`/api/v1/hoteis/${hotelId}/equipes`, {
      method: 'POST',
      body: JSON.stringify({ nome }),
    });
  }

  return (
    <Painel>
      <div className="hk-filtros">
        <SeletorDeHotel
          rotulo={t('admin.equipes.escolher_hotel')}
          hoteis={hoteis}
          valor={hotelId}
          aoEscolher={setHotelId}
        />
      </div>
      <Aviso aviso={erroDosHoteis ? { tipo: 'erro', erro: erroDosHoteis } : aviso} />
      <form onSubmit={criar} className="hk-em-linha">
        <Campo rotulo={t('admin.equipes.campo.nome')}>
          {(p) => <Entrada {...p} name="nome" required />}
        </Campo>
        <Botao type="submit" variante="primario">
          {t('admin.equipes.acao.criar')}
        </Botao>
      </form>

      {!lista ? (
        <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : lista.equipes.length === 0 ? (
        <MensagemVazia>{t('admin.equipes.vazio')}</MensagemVazia>
      ) : (
        <ul className="hk-lista hk-itens">
          {lista.equipes.map((e) => {
            const ativos = e.membros.filter((m) => m.ativo);
            return (
              <li key={e.id}>
                <div className="hk-item-cabecalho">
                  <form
                    className="hk-em-linha"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      const nome = String(new FormData(ev.currentTarget).get('nome') ?? '');
                      void executar(`/api/v1/equipes/${e.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ nome }),
                      });
                    }}
                  >
                    <Entrada
                      name="nome"
                      defaultValue={e.nome}
                      aria-label={t('admin.equipes.campo.nome')}
                    />
                    <Botao type="submit" tamanho="pequeno">
                      {t('admin.equipes.acao.renomear')}
                    </Botao>
                  </form>
                  <Selo tom={e.ativa ? 'verde' : 'cinza'}>
                    {e.ativa ? t('admin.equipes.ativa') : t('admin.equipes.desativada')}
                  </Selo>
                  <div className="hk-linha-de-botoes">
                    <Botao
                      tamanho="pequeno"
                      onClick={() =>
                        void executar(
                          `/api/v1/equipes/${e.id}/${e.ativa ? 'desativacao' : 'reativacao'}`,
                          { method: 'POST' },
                        )
                      }
                    >
                      {e.ativa
                        ? t('admin.equipes.acao.desativar')
                        : t('admin.equipes.acao.reativar')}
                    </Botao>
                  </div>
                </div>
                {ativos.length === 0 ? (
                  <p className="hk-suave">{t('admin.equipes.sem_membros')}</p>
                ) : (
                  <ul className="hk-sublista">
                    {ativos.map((m) => (
                      <li key={m.usuarioId}>
                        <span>{m.nome}</span>
                        <Botao
                          tamanho="pequeno"
                          onClick={() =>
                            void executar(
                              `/api/v1/equipes/${e.id}/membros/${m.usuarioId}/remocao`,
                              { method: 'POST' },
                            )
                          }
                        >
                          {t('admin.equipes.acao.tirar')}
                        </Botao>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  className="hk-em-linha"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    const usuarioId = String(new FormData(ev.currentTarget).get('usuarioId') ?? '');
                    if (usuarioId) {
                      void executar(`/api/v1/equipes/${e.id}/membros`, {
                        method: 'POST',
                        body: JSON.stringify({ usuarioId }),
                      });
                    }
                  }}
                >
                  <Selecao name="usuarioId" aria-label={t('admin.equipes.escolher_membro')}>
                    <option value="">{t('admin.equipes.escolher_membro')}</option>
                    {lista.disponiveis
                      .filter((d) => !ativos.some((m) => m.usuarioId === d.usuarioId))
                      .map((d) => (
                        <option key={d.usuarioId} value={d.usuarioId}>
                          {d.nome}
                        </option>
                      ))}
                  </Selecao>
                  <Botao type="submit" tamanho="pequeno">
                    {t('admin.equipes.acao.por')}
                  </Botao>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </Painel>
  );
}
