'use client';
// Membros e papéis (fase 1a, A3): lista pelo escopo de quem vê, convite,
// concessão e revogação de papel, validade e desativação. Visual do pacote de
// interface (ADR-038, U4b).
import type { Chave } from '@hubkeep/i18n';
import {
  Botao,
  Campo,
  Entrada,
  MensagemDeErro,
  MensagemVazia,
  Painel,
  type PropsDoControle,
  Selecao,
  Selo,
} from '@hubkeep/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import { useMensagemDeErro, useT } from '../../../../i18n/cliente';

const PAPEIS = [
  'admin_grupo',
  'gestor_csc',
  'implantador',
  'gerente_hotel',
  'tecnico',
  'solicitante',
  'proprietario',
] as const;
type Papel = (typeof PAPEIS)[number];

interface Atribuicao {
  id: string;
  papel: Papel;
  escopo:
    | { tipo: 'grupo' }
    | { tipo: 'bandeira' }
    | { tipo: 'hotel'; hotelId: string }
    | { tipo: 'proprietario' };
  validoAte: string | null;
  revogadoEm: string | null;
  vigente: boolean;
}
interface Membro {
  usuarioId: string;
  nome: string;
  email: string;
  ativo: boolean;
  atribuicoes: Atribuicao[];
}
interface Hotel {
  id: string;
  nome: string;
}

/** O controle recebe o id do Campo (com rótulo visível) ou só o rótulo acessível. */
type Controle = PropsDoControle | { 'aria-label': string };

/** Data (yyyy-mm-dd, do campo date) como fim do dia no fuso de quem digita. */
const fimDoDia = (data: string) => (data ? new Date(`${data}T23:59:59`).toISOString() : null);

export default function MembrosEPapeis() {
  const t = useT();
  const intl = useIntl();
  const mensagemDeErro = useMensagemDeErro();
  const [membros, setMembros] = useState<Membro[] | null>(null);
  const [hoteis, setHoteis] = useState<Hotel[]>([]);
  const [erroDaLista, setErroDaLista] = useState<ErroDaApi | null>(null);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    const [m, h] = await Promise.all([
      chamarApi<{ membros: Membro[] }>('/api/v1/membros'),
      chamarApi<{ hoteis: Hotel[] }>('/api/v1/hoteis'),
    ]);
    if (m.ok) {
      setMembros(m.dados.membros);
      setErroDaLista(null);
    } else setErroDaLista(m.erro);
    if (h.ok) setHoteis(h.dados.hoteis);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function executar(
    caminho: string,
    init: RequestInit,
    sucesso: Chave = 'admin.membros.feito',
  ) {
    const r = await chamarApi<unknown>(caminho, init);
    setAviso(r.ok ? { tipo: 'ok', texto: t(sucesso) } : { tipo: 'erro', erro: r.erro });
    await carregar();
  }

  const nomeDoHotel = (id: string) => hoteis.find((h) => h.id === id)?.nome ?? id;
  const descreverEscopo = (e: Atribuicao['escopo']) =>
    e.tipo === 'hotel'
      ? t('escopo.hotel', { hotel: nomeDoHotel(e.hotelId) })
      : t(`escopo.${e.tipo}` as const);

  function convidar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const d = new FormData(ev.currentTarget);
    const hotelId = String(d.get('hotelId') ?? '');
    void executar(
      '/api/v1/convites',
      {
        method: 'POST',
        body: JSON.stringify({
          email: String(d.get('email')),
          nome: String(d.get('nome')),
          papel: String(d.get('papel')),
          hotelId: hotelId || null,
          validoAte: fimDoDia(String(d.get('validoAte') ?? '')),
        }),
      },
      'admin.membros.convite_enviado',
    );
  }

  function conceder(usuarioId: string, ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const d = new FormData(ev.currentTarget);
    const hotelId = String(d.get('hotelId') ?? '');
    void executar('/api/v1/atribuicoes', {
      method: 'POST',
      body: JSON.stringify({
        usuarioId,
        papel: String(d.get('papel')),
        escopo: hotelId ? { tipo: 'hotel', hotelId } : { tipo: 'grupo' },
        validoAte: fimDoDia(String(d.get('validoAte') ?? '')),
      }),
    });
  }

  if (erroDaLista) return <MensagemDeErro>{mensagemDeErro(erroDaLista)}</MensagemDeErro>;
  if (!membros) return <MensagemVazia>{t('comum.carregando')}</MensagemVazia>;

  const campoPapel = (c: Controle) => (
    <Selecao {...c} name="papel" required>
      {PAPEIS.map((p) => (
        <option key={p} value={p}>
          {t(`papel.${p}` as const)}
        </option>
      ))}
    </Selecao>
  );
  const campoHotel = (c: Controle) => (
    <Selecao {...c} name="hotelId">
      <option value="">{t('escopo.grupo')}</option>
      {hoteis.map((h) => (
        <option key={h.id} value={h.id}>
          {h.nome}
        </option>
      ))}
    </Selecao>
  );
  const campoValidade = (c: Controle) => <Entrada {...c} type="date" name="validoAte" />;

  return (
    <div className="hk-pilha">
      <Aviso aviso={aviso} />
      <Painel titulo={t('admin.membros.convidar')}>
        <form onSubmit={convidar} className="hk-em-linha">
          <Campo rotulo={t('admin.membros.campo.nome')}>
            {(p) => <Entrada {...p} name="nome" required />}
          </Campo>
          <Campo rotulo={t('login.campo.email')}>
            {(p) => <Entrada {...p} name="email" type="email" required />}
          </Campo>
          <Campo rotulo={t('admin.membros.campo.papel')}>{campoPapel}</Campo>
          <Campo rotulo={t('admin.membros.campo.hotel')}>{campoHotel}</Campo>
          <Campo rotulo={t('admin.membros.campo.validade')}>{campoValidade}</Campo>
          <Botao type="submit" variante="primario">
            {t('admin.membros.acao.convidar')}
          </Botao>
        </form>
      </Painel>

      <Painel>
        <ul className="hk-lista hk-itens">
          {membros.map((m) => (
            <li key={m.usuarioId}>
              <div className="hk-item-cabecalho">
                <strong>{m.nome}</strong>
                <span className="hk-suave">{m.email}</span>
                <Selo tom={m.ativo ? 'verde' : 'cinza'}>
                  {m.ativo ? t('admin.membros.ativo') : t('admin.membros.desativado')}
                </Selo>
                <div className="hk-linha-de-botoes">
                  <Botao
                    tamanho="pequeno"
                    onClick={() =>
                      void executar(
                        `/api/v1/membros/${m.usuarioId}/${m.ativo ? 'desativacao' : 'reativacao'}`,
                        { method: 'POST' },
                      )
                    }
                  >
                    {m.ativo ? t('admin.membros.acao.desativar') : t('admin.membros.acao.reativar')}
                  </Botao>
                </div>
              </div>
              {m.atribuicoes.length === 0 ? (
                <p className="hk-suave">{t('admin.membros.sem_papel')}</p>
              ) : (
                <ul className="hk-sublista">
                  {m.atribuicoes.map((a) => (
                    <li key={a.id}>
                      <span>
                        {t('admin.membros.papel', {
                          papel: t(`papel.${a.papel}` as const),
                          escopo: descreverEscopo(a.escopo),
                        })}
                      </span>
                      {a.validoAte && (
                        <span className="hk-suave">
                          {t('admin.membros.ate', {
                            data: intl.formatDate(a.validoAte, { dateStyle: 'short' }),
                          })}
                        </span>
                      )}
                      {a.revogadoEm ? (
                        <Selo tom="cinza">{t('admin.membros.revogado')}</Selo>
                      ) : !a.vigente ? (
                        <Selo tom="ambar">{t('admin.membros.vencido')}</Selo>
                      ) : null}
                      {!a.revogadoEm && (
                        <>
                          <form
                            className="hk-em-linha"
                            onSubmit={(ev) => {
                              ev.preventDefault();
                              const data = String(
                                new FormData(ev.currentTarget).get('validoAte') ?? '',
                              );
                              void executar(`/api/v1/atribuicoes/${a.id}/validade`, {
                                method: 'PUT',
                                body: JSON.stringify({ validoAte: fimDoDia(data) }),
                              });
                            }}
                          >
                            {campoValidade({ 'aria-label': t('admin.membros.campo.validade') })}
                            <Botao type="submit" tamanho="pequeno">
                              {t('admin.membros.acao.salvar_validade')}
                            </Botao>
                          </form>
                          <Botao
                            tamanho="pequeno"
                            variante="perigo"
                            onClick={() =>
                              void executar(`/api/v1/atribuicoes/${a.id}/revogacao`, {
                                method: 'POST',
                              })
                            }
                          >
                            {t('admin.membros.acao.revogar')}
                          </Botao>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={(ev) => conceder(m.usuarioId, ev)} className="hk-em-linha">
                {campoPapel({ 'aria-label': t('admin.membros.campo.papel') })}
                {campoHotel({ 'aria-label': t('admin.membros.campo.hotel') })}
                {campoValidade({ 'aria-label': t('admin.membros.campo.validade') })}
                <Botao type="submit" tamanho="pequeno">
                  {t('admin.membros.acao.conceder')}
                </Botao>
              </form>
            </li>
          ))}
        </ul>
      </Painel>
    </div>
  );
}
