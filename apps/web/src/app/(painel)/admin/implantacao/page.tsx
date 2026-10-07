'use client';
// Painel de implantação do hotel (fase 1a, A5): o que falta para o hotel
// operar. O Implantador cadastra as pessoas pela tela de membros, abaixo do
// próprio papel. Tela funcional, sem acabamento: o layout vem do protótipo.
import { useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { useMensagemDeErro, useT } from '../../../../i18n/cliente';

interface Hotel {
  id: string;
  nome: string;
}
type Papel =
  | 'admin_grupo'
  | 'gestor_csc'
  | 'implantador'
  | 'gerente_hotel'
  | 'tecnico'
  | 'solicitante'
  | 'proprietario';
type Pendencia =
  | 'sem_locais'
  | 'uhs_pendentes_de_licenca'
  | 'sem_gerente'
  | 'sem_tecnico'
  | 'pessoas_sem_papel_vigente';
interface Painel {
  hotel: { id: string; nome: string; status: string };
  locais: { uhsAtivas: number; uhsPendentes: number; areasComuns: number; inativos: number };
  ativos: { ativos: number; semCategoria: number; locaisSemAtivo: number };
  papeis: { papel: Papel; pessoas: number }[];
  pessoasSemPapelVigente: { usuarioId: string; nome: string }[];
  pendencias: Pendencia[];
}

export default function PainelDeImplantacao() {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  const [hoteis, setHoteis] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);

  useEffect(() => {
    void chamarApi<{ hoteis: Hotel[] }>('/api/v1/hoteis').then((r) => {
      if (!r.ok) return setErro(r.erro);
      setHoteis(r.dados.hoteis);
      setHotelId((atual) => atual || r.dados.hoteis[0]?.id || '');
    });
  }, []);

  useEffect(() => {
    if (!hotelId) return;
    setPainel(null);
    void chamarApi<Painel>(`/api/v1/hoteis/${hotelId}/implantacao`).then((r) => {
      if (r.ok) {
        setPainel(r.dados);
        setErro(null);
      } else setErro(r.erro);
    });
  }, [hotelId]);

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <a href="/">{t('comum.voltar')}</a>
      <h1>{t('admin.implantacao.titulo')}</h1>
      <select
        aria-label={t('admin.implantacao.escolher_hotel')}
        value={hotelId}
        onChange={(e) => setHotelId(e.target.value)}
      >
        {hoteis.map((h) => (
          <option key={h.id} value={h.id}>
            {h.nome}
          </option>
        ))}
      </select>
      {erro ? (
        <p role="alert">{mensagemDeErro(erro)}</p>
      ) : !painel ? (
        <p>{t('comum.carregando')}</p>
      ) : (
        <>
          <section>
            <h2>{t('admin.implantacao.pendencias')}</h2>
            {painel.pendencias.length === 0 ? (
              <p>{t('admin.implantacao.sem_pendencias')}</p>
            ) : (
              <ul>
                {painel.pendencias.map((p) => (
                  <li key={p}>{t(`admin.implantacao.pendencia.${p}` as const)}</li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2>{t('admin.implantacao.locais')}</h2>
            <p>{t('admin.implantacao.resumo_locais', painel.locais)}</p>
            <h2>{t('admin.implantacao.ativos')}</h2>
            <p>{t('admin.implantacao.resumo_ativos', painel.ativos)}</p>
          </section>
          <section>
            <h2>{t('admin.implantacao.pessoas')}</h2>
            <ul>
              {painel.papeis.map((p) => (
                <li key={p.papel}>
                  {t('admin.implantacao.papel_com_pessoas', {
                    papel: t(`papel.${p.papel}` as const),
                    pessoas: p.pessoas,
                  })}
                </li>
              ))}
            </ul>
            {painel.pessoasSemPapelVigente.length > 0 && (
              <>
                <h3>{t('admin.implantacao.sem_papel_vigente')}</h3>
                <ul>
                  {painel.pessoasSemPapelVigente.map((p) => (
                    <li key={p.usuarioId}>{p.nome}</li>
                  ))}
                </ul>
              </>
            )}
            <a href="/admin/membros">{t('admin.implantacao.ir_para_membros')}</a>
          </section>
        </>
      )}
    </main>
  );
}
