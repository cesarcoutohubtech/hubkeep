'use client';
// Página da OS (PV3c): a OS preventiva, gerada pelo worker sem chamado, com o
// plano, o ativo e a data prevista no alto, e o mesmo bloco da OS do detalhe
// do chamado (BlocoDaOs: checklist, códigos, aceite, reabertura, fotos e
// histórico) e as mesmas ações de triagem (AcoesDaOs: reatribuir, quem
// executa, arrendamento e cancelar). A OS corretiva também abre aqui, com o
// caminho para o chamado dela. Quem pode cada ação é decidido pela API; a
// recusa volta como código e aparece traduzida. A preventiva não tem parada
// (parada_na_preventiva): a reabertura não oferece o equipamento parado.
import type { ResponsavelDoArrendamento } from '@hubkeep/dominio';
import { MensagemVazia, Painel } from '@hubkeep/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { type Traco, enviarAssinatura, pngDaAssinatura } from '../../../../cliente/assinatura';
import { useCodigosDoTenant } from '../../../../cliente/codigos-manutencao';
import {
  Aviso,
  BlocoDaOs,
  type CodigosDaOsNaTela,
  type DetalheDoChamado,
  type OsDaPagina,
  type PedidoDeReabertura,
  type Referencias,
  carregarReferencias,
  useNomes,
} from '../../../../cliente/corretiva';
import {
  AcoesDaOs,
  type CandidatosAResponsavel,
  type Execucao,
  type FornecedorParaEscolha,
  type Responsavel,
} from '../../../../cliente/triagem';
import { useT } from '../../../../i18n/cliente';

interface DetalheDaOs {
  os: OsDaPagina;
  nomes: DetalheDoChamado['nomes'];
  assinaturaNoAceite: boolean;
}

type AvisoDaTela = { tipo: 'ok' } | { tipo: 'erro'; erro: ErroDaApi } | null;

export function TelaDaOs({ id }: { id: string }) {
  const t = useT();
  const intl = useIntl();
  const { dados: codigos } = useCodigosDoTenant();
  const [refs, setRefs] = useState<Referencias | null>(null);
  const [detalhe, setDetalhe] = useState<DetalheDaOs | null>(null);
  const [aviso, setAviso] = useState<AvisoDaTela>(null);
  const [candidatos, setCandidatos] = useState<CandidatosAResponsavel | null>(null);
  const [fornecedores, setFornecedores] = useState<FornecedorParaEscolha[] | null>(null);
  const nomes = useNomes(refs);

  const carregar = useCallback(async () => {
    const d = await chamarApi<DetalheDaOs>(`/api/v1/os/${id}`);
    if (d.ok) setDetalhe(d.dados);
    else setAviso({ tipo: 'erro', erro: d.erro });
    return d.ok ? d.dados.os.hotelId : null;
  }, [id]);

  useEffect(() => {
    void carregarReferencias().then(setRefs);
    void chamarApi<{ fornecedores: FornecedorParaEscolha[] }>('/api/v1/fornecedores').then((r) =>
      setFornecedores(r.ok ? r.dados.fornecedores : null),
    );
    void carregar().then(async (hotelId) => {
      if (!hotelId) return;
      const c = await chamarApi<CandidatosAResponsavel>(`/api/v1/hoteis/${hotelId}/equipes`);
      setCandidatos(c.ok ? c.dados : null);
    });
  }, [carregar]);

  /** Ação na OS: POST na rota, com a versão vista; depois, relê a OS. */
  async function enviar(caminho: string, corpo: Record<string, unknown>) {
    const r = await chamarApi<unknown>(caminho, { method: 'POST', body: JSON.stringify(corpo) });
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregar();
  }

  async function aceitar(
    os: OsDaPagina,
    custoInformado: number | null,
    codigosDaOs: CodigosDaOsNaTela | undefined,
    assinatura: Traco[] | null | undefined,
  ) {
    let assinaturaCaminho: string | undefined;
    if (assinatura && assinatura.length > 0) {
      const png = await pngDaAssinatura(assinatura);
      const enviada = png
        ? await enviarAssinatura(os.id, png)
        : ({ ok: false, erro: { codigo: 'envio_de_arquivo_falhou', parametros: {} } } as const);
      if (!enviada.ok) {
        setAviso({ tipo: 'erro', erro: enviada.erro });
        return;
      }
      assinaturaCaminho = enviada.caminho;
    }
    await enviar(`/api/v1/os/${os.id}/aceite`, {
      versao: os.versao,
      custoInformado,
      ...(codigosDaOs ? { codigos: codigosDaOs } : {}),
      ...(assinaturaCaminho ? { assinaturaCaminho } : {}),
    });
  }

  const reabrir = (os: OsDaPagina, p: PedidoDeReabertura) =>
    void enviar(`/api/v1/os/${os.id}/reabertura`, {
      versao: os.versao,
      motivo: p.motivo,
      paradoDesde: p.paradoDesde,
    });

  const o = detalhe?.os ?? null;
  const n = detalhe?.nomes ?? null;
  const responsavel =
    o && n
      ? nomes.nome(
          o.responsavel.tipo === 'tecnico'
            ? n.pessoas[o.responsavel.usuarioId]
            : n.equipes[o.responsavel.equipeId],
        )
      : '';
  return (
    <>
      <Link href="/os" className="hk-voltar">
        {t('corretiva.voltar_para_os')}
      </Link>
      <Aviso aviso={aviso} />
      {!detalhe || !o || !n ? (
        !aviso && <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : (
        <div className="hk-pilha">
          <Painel
            titulo={t('corretiva.onde', { hotel: nomes.nome(n.hotel), local: nomes.nome(n.local) })}
          >
            {o.preventiva ? (
              <p className="hk-texto-longo" data-preventiva={o.preventiva.planoId}>
                {t('corretiva.os.preventiva', {
                  plano: o.preventiva.planoNome,
                  ativo: nomes.nome(n.ativo),
                  data: intl.formatDate(new Date(`${o.preventiva.dataPrevista}T12:00:00Z`), {
                    dateStyle: 'short',
                    timeZone: 'UTC',
                  }),
                })}
              </p>
            ) : (
              <Link href={`/chamados/${o.chamadoId ?? ''}`}>{t('corretiva.os.ver_chamado')}</Link>
            )}
          </Painel>
          <Painel titulo={t('corretiva.os.da_pagina')}>
            <BlocoDaOs
              key={`${o.id}-${o.versao}`}
              os={o}
              nomes={n}
              refs={refs}
              codigos={codigos}
              assinaturaNoAceite={detalhe.assinaturaNoAceite}
              temAtivo={o.preventiva === null && n.ativo !== null}
              aoAceitar={(os, custo, codigosDaOs, assinatura) =>
                void aceitar(os, custo, codigosDaOs, assinatura)
              }
              aoReabrir={reabrir}
            />
          </Painel>
          <AcoesDaOs
            key={`acoes-${o.id}-${o.versao}`}
            os={o}
            titulo={t('corretiva.triagem.os', {
              situacao: nomes.situacao(o.situacaoId),
              nome: responsavel,
            })}
            candidatos={candidatos}
            fornecedores={fornecedores}
            aoReatribuir={(r: Responsavel) =>
              void enviar(`/api/v1/os/${o.id}/reatribuicao`, { versao: o.versao, responsavel: r })
            }
            aoDefinirExecutor={(e: Execucao) =>
              void enviar(`/api/v1/os/${o.id}/executor`, { versao: o.versao, ...e })
            }
            aoAjustarArrendamento={(r: ResponsavelDoArrendamento, motivo: string) =>
              void enviar(`/api/v1/os/${o.id}/arrendamento`, {
                versao: o.versao,
                responsavel: r,
                motivo,
              })
            }
            aoCancelar={(motivo: string) =>
              void enviar(`/api/v1/os/${o.id}/cancelamento`, { versao: o.versao, motivo })
            }
          />
        </div>
      )}
    </>
  );
}
