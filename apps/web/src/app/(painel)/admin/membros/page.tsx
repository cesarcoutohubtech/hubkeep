'use client';
// Membros e papéis (fase 1a, A3): lista pelo escopo de quem vê, convite,
// concessão e revogação de papel, validade e desativação. Tela funcional, sem
// acabamento: o layout vem do protótipo validado com o cliente.
import type { Chave } from '@hubkeep/i18n';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
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

type Aviso = { tipo: 'ok'; texto: string } | { tipo: 'erro'; erro: ErroDaApi };

/** Data (yyyy-mm-dd, do campo date) como fim do dia no fuso de quem digita. */
const fimDoDia = (data: string) => (data ? new Date(`${data}T23:59:59`).toISOString() : null);

export default function MembrosEPapeis() {
  const t = useT();
  const intl = useIntl();
  const mensagemDeErro = useMensagemDeErro();
  const [membros, setMembros] = useState<Membro[] | null>(null);
  const [hoteis, setHoteis] = useState<Hotel[]>([]);
  const [erroDaLista, setErroDaLista] = useState<ErroDaApi | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

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

  if (erroDaLista) return <p role="alert">{mensagemDeErro(erroDaLista)}</p>;
  if (!membros) return <p>{t('comum.carregando')}</p>;

  const campoPapel = (
    <select name="papel" aria-label={t('admin.membros.campo.papel')} required>
      {PAPEIS.map((p) => (
        <option key={p} value={p}>
          {t(`papel.${p}` as const)}
        </option>
      ))}
    </select>
  );
  const campoHotel = (
    <select name="hotelId" aria-label={t('admin.membros.campo.hotel')}>
      <option value="">{t('escopo.grupo')}</option>
      {hoteis.map((h) => (
        <option key={h.id} value={h.id}>
          {h.nome}
        </option>
      ))}
    </select>
  );
  const campoValidade = (
    <input type="date" name="validoAte" aria-label={t('admin.membros.campo.validade')} />
  );

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <a href="/">{t('comum.voltar')}</a>
      <h1>{t('admin.membros.titulo')}</h1>
      {aviso && (
        <p role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
          {aviso.tipo === 'ok' ? aviso.texto : mensagemDeErro(aviso.erro)}
        </p>
      )}

      <section>
        <h2>{t('admin.membros.convidar')}</h2>
        <form onSubmit={convidar} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input name="nome" placeholder={t('admin.membros.campo.nome')} required />
          <input name="email" type="email" placeholder={t('login.campo.email')} required />
          {campoPapel}
          {campoHotel}
          {campoValidade}
          <button type="submit">{t('admin.membros.acao.convidar')}</button>
        </form>
      </section>

      <ul style={{ display: 'grid', gap: 12, padding: 0, listStyle: 'none' }}>
        {membros.map((m) => (
          <li
            key={m.usuarioId}
            style={{ display: 'grid', gap: 6, borderTop: '1px solid #ddd', paddingTop: 8 }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>{m.nome}</strong>
              <span>{m.email}</span>
              <small>{m.ativo ? t('admin.membros.ativo') : t('admin.membros.desativado')}</small>
              <button
                onClick={() =>
                  void executar(
                    `/api/v1/membros/${m.usuarioId}/${m.ativo ? 'desativacao' : 'reativacao'}`,
                    { method: 'POST' },
                  )
                }
              >
                {m.ativo ? t('admin.membros.acao.desativar') : t('admin.membros.acao.reativar')}
              </button>
            </div>
            {m.atribuicoes.length === 0 ? (
              <small>{t('admin.membros.sem_papel')}</small>
            ) : (
              <ul>
                {m.atribuicoes.map((a) => (
                  <li
                    key={a.id}
                    style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                  >
                    <span>
                      {t('admin.membros.papel', {
                        papel: t(`papel.${a.papel}` as const),
                        escopo: descreverEscopo(a.escopo),
                      })}
                    </span>
                    {a.validoAte && (
                      <small>
                        {t('admin.membros.ate', {
                          data: intl.formatDate(a.validoAte, { dateStyle: 'short' }),
                        })}
                      </small>
                    )}
                    {a.revogadoEm ? (
                      <small>{t('admin.membros.revogado')}</small>
                    ) : !a.vigente ? (
                      <small>{t('admin.membros.vencido')}</small>
                    ) : null}
                    {!a.revogadoEm && (
                      <>
                        <form
                          style={{ display: 'flex', gap: 4 }}
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
                          {campoValidade}
                          <button type="submit">{t('admin.membros.acao.salvar_validade')}</button>
                        </form>
                        <button
                          onClick={() =>
                            void executar(`/api/v1/atribuicoes/${a.id}/revogacao`, {
                              method: 'POST',
                            })
                          }
                        >
                          {t('admin.membros.acao.revogar')}
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form
              onSubmit={(ev) => conceder(m.usuarioId, ev)}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
            >
              {campoPapel}
              {campoHotel}
              {campoValidade}
              <button type="submit">{t('admin.membros.acao.conceder')}</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
