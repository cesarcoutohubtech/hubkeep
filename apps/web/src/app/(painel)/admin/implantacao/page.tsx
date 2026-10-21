'use client';
// Painel de implantação do hotel (fase 1a, A5): o que falta para o hotel
// operar (inclusive o modelo contratual não informado, I2). O Implantador
// cadastra as pessoas pela tela de membros, abaixo do próprio papel. Só o visual do pacote de interface (ADR-038, U4b); o
// conteúdo é o mesmo. O pacote da bandeira (PB1): a prévia do que aplicar
// copia e o botão de aplicar, para o Admin e o Implantador; e o tempo de
// implantação contra a meta de 1 dia, tirado da auditoria do hotel.
import { MensagemDeErro, MensagemVazia, Nota, Painel, comoBotao } from '@hubkeep/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import { AplicacaoDoPacote, type CopiaDoPacote } from '../../../../cliente/pacote-da-bandeira';
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
  | 'modelo_contratual_nao_informado'
  | 'sem_locais'
  | 'uhs_pendentes_de_licenca'
  | 'locais_sem_ativo'
  | 'ativos_sem_categoria'
  | 'sem_gerente'
  | 'sem_tecnico'
  | 'pessoas_sem_papel_vigente';
interface PainelDoHotel {
  hotel: { id: string; nome: string; status: string; modeloContratual: string | null };
  locais: { uhsAtivas: number; uhsPendentes: number; areasComuns: number; inativos: number };
  ativos: {
    ativos: number;
    semCategoria: number;
    locaisSemAtivo: number;
    comModeloSemPlano: number;
  };
  papeis: { papel: Papel; pessoas: number }[];
  pessoasSemPapelVigente: { usuarioId: string; nome: string }[];
  pendencias: Pendencia[];
  tempo: {
    entrouEm: string;
    prontoEm: string | null;
    duracaoMs: number | null;
    metaMs: number;
    dentroDaMeta: boolean | null;
  };
}

function TempoDeImplantacao({ tempo }: { tempo: PainelDoHotel['tempo'] }) {
  const t = useT();
  const intl = useIntl();
  const data = (iso: string) => intl.formatDate(iso, { dateStyle: 'short', timeStyle: 'short' });
  const duracao = (ms: number) => {
    const minutos = Math.floor(ms / 60_000);
    return t('admin.ativos.parada.duracao', {
      horas: Math.floor(minutos / 60),
      minutos: minutos % 60,
    });
  };
  const horas = Math.round(tempo.metaMs / 3_600_000);
  return (
    <Painel titulo={t('admin.implantacao.tempo.titulo')}>
      <p>{t('admin.implantacao.tempo.entrou', { em: data(tempo.entrouEm) })}</p>
      {tempo.duracaoMs === null ? (
        <p className="hk-suave">{t('admin.implantacao.tempo.sem_registro')}</p>
      ) : (
        <>
          <p>
            {tempo.prontoEm
              ? t('admin.implantacao.tempo.pronto', {
                  em: data(tempo.prontoEm),
                  duracao: duracao(tempo.duracaoMs),
                })
              : t('admin.implantacao.tempo.em_curso', { duracao: duracao(tempo.duracaoMs) })}
          </p>
          <Nota tom={tempo.dentroDaMeta ? 'ok' : 'atencao'}>
            {t(
              tempo.dentroDaMeta
                ? 'admin.implantacao.tempo.na_meta'
                : 'admin.implantacao.tempo.fora_da_meta',
              { horas },
            )}
          </Nota>
        </>
      )}
    </Painel>
  );
}

export default function PainelDeImplantacao() {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  const { hoteis, hotelId, setHotelId, erro: erroDosHoteis } = useHoteis();
  const [painel, setPainel] = useState<PainelDoHotel | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  // null: sem o pacote (quem não aplica recebe 403 e não vê o quadro).
  const [copias, setCopias] = useState<CopiaDoPacote[] | null>(null);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregarPacote = useCallback(async () => {
    if (!hotelId) return;
    const r = await chamarApi<{ copias: CopiaDoPacote[] }>(`/api/v1/hoteis/${hotelId}/pacote`);
    setCopias(r.ok ? r.dados.copias : null);
  }, [hotelId]);

  useEffect(() => {
    setAviso(null);
    void carregarPacote();
  }, [carregarPacote]);

  async function aplicarPacote() {
    const r = await chamarApi<unknown>(`/api/v1/hoteis/${hotelId}/pacote/aplicacao`, {
      method: 'POST',
    });
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregarPacote();
  }

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
          <TempoDeImplantacao tempo={painel.tempo} />
          <div className="hk-grade" data-colunas="2">
            <Painel titulo={t('admin.implantacao.locais')}>
              <p>{t('admin.implantacao.resumo_locais', painel.locais)}</p>
            </Painel>
            <Painel
              titulo={t('admin.implantacao.ativos')}
              acoes={
                painel.ativos.comModeloSemPlano > 0 ? (
                  <Link href="/admin/preventivas" {...comoBotao('padrao', 'pequeno')}>
                    {t('admin.implantacao.ir_para_sugestoes')}
                  </Link>
                ) : undefined
              }
            >
              <p>{t('admin.implantacao.resumo_ativos', painel.ativos)}</p>
              <p>
                {t('admin.implantacao.com_modelo_sem_plano', {
                  n: painel.ativos.comModeloSemPlano,
                })}
              </p>
            </Painel>
          </div>
          {copias ? (
            <Painel titulo={t('admin.pacote.aplicacao.titulo')}>
              <AplicacaoDoPacote copias={copias} aplicar={aplicarPacote} />
              <Aviso aviso={aviso} />
            </Painel>
          ) : null}
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
