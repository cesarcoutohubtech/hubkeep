'use client';
// Painel de implantação do hotel (fase 1a, A5): o que falta para o hotel
// operar. O Implantador cadastra as pessoas pela tela de membros, abaixo do
// próprio papel. Só o visual do pacote de interface (ADR-038, U4b); o
// conteúdo é o mesmo.
import { MensagemDeErro, MensagemVazia, Nota, Painel, comoBotao } from '@hubkeep/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { SeletorDeHotel, useHoteis } from '../../../../cliente/cadastro';
import { useMensagemDeErro, useT } from '../../../../i18n/cliente';

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
interface PainelDoHotel {
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
  const { hoteis, hotelId, setHotelId, erro: erroDosHoteis } = useHoteis();
  const [painel, setPainel] = useState<PainelDoHotel | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);

  useEffect(() => {
    if (!hotelId) return;
    setPainel(null);
    void chamarApi<PainelDoHotel>(`/api/v1/hoteis/${hotelId}/implantacao`).then((r) => {
      if (r.ok) {
        setPainel(r.dados);
        setErro(null);
      } else setErro(r.erro);
    });
  }, [hotelId]);

  const falha = erro ?? erroDosHoteis;
  return (
    <div className="hk-pilha">
      <div className="hk-filtros">
        <SeletorDeHotel
          rotulo={t('admin.implantacao.escolher_hotel')}
          hoteis={hoteis}
          valor={hotelId}
          aoEscolher={setHotelId}
        />
      </div>
      {falha ? (
        <MensagemDeErro>{mensagemDeErro(falha)}</MensagemDeErro>
      ) : !painel ? (
        <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : (
        <>
          <Painel titulo={t('admin.implantacao.pendencias')}>
            {painel.pendencias.length === 0 ? (
              <Nota tom="ok">{t('admin.implantacao.sem_pendencias')}</Nota>
            ) : (
              <ul className="hk-lista">
                {painel.pendencias.map((p) => (
                  <li key={p}>{t(`admin.implantacao.pendencia.${p}` as const)}</li>
                ))}
              </ul>
            )}
          </Painel>
          <div className="hk-grade" data-colunas="2">
            <Painel titulo={t('admin.implantacao.locais')}>
              <p>{t('admin.implantacao.resumo_locais', painel.locais)}</p>
            </Painel>
            <Painel titulo={t('admin.implantacao.ativos')}>
              <p>{t('admin.implantacao.resumo_ativos', painel.ativos)}</p>
            </Painel>
          </div>
          <Painel
            titulo={t('admin.implantacao.pessoas')}
            acoes={
              <Link href="/admin/membros" {...comoBotao('padrao', 'pequeno')}>
                {t('admin.implantacao.ir_para_membros')}
              </Link>
            }
          >
            <ul className="hk-lista">
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
              <div className="hk-bloco" data-tom="atencao">
                <h3 className="hk-bloco-titulo">{t('admin.implantacao.sem_papel_vigente')}</h3>
                <ul className="hk-sublista">
                  {painel.pessoasSemPapelVigente.map((p) => (
                    <li key={p.usuarioId}>{p.nome}</li>
                  ))}
                </ul>
              </div>
            )}
          </Painel>
        </>
      )}
    </div>
  );
}
