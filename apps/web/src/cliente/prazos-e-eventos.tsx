'use client';
// Os próximos prazos e os últimos eventos da tela inicial (1c, seção 4 da
// paridade; decisão 5 do Cesar de 10/10/2026). Os dois são da gestão: os
// prazos pela GET /api/v1/chamados/proximos-prazos, e os eventos pela
// auditoria geral, os registros mais recentes dos últimos 30 dias no escopo de
// quem vê. São lidos ao abrir a tela e a cada 60 segundos, sem "ao vivo"; a
// contagem regressiva anda no mesmo passo. Quem não é da gestão recebe 403 da
// API, e o bloco não aparece.
import type { RespostaDaAuditoriaGeral, RespostaDosProximosPrazos, z } from '@hubkeep/contratos';
import { MensagemVazia, Painel, Selo } from '@hubkeep/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { useT } from '../i18n/cliente';
import { chamarApi } from './api';
import { chaveDaAcao } from './HistoricoDoRegistro';

export type PrazoNaTela = z.infer<typeof RespostaDosProximosPrazos>['prazos'][number];
export type EventoNaTela = z.infer<typeof RespostaDaAuditoriaGeral>['linhas'][number];

/** Quantos eventos e de quantos dias para trás (o limite da auditoria geral é 92). */
export const EVENTOS_NA_TELA = 5;
export const DIAS_DOS_EVENTOS = 30;
/** A leitura de novo e o passo da contagem regressiva (decisão 5). */
export const INTERVALO_MS = 60_000;

const MINUTO = 60_000;

/** O tempo até o prazo, para o texto: dias a partir de 48 horas; antes, horas e minutos. */
export function tempoAte(prazo: Date, agora: Date) {
  const minutosAte = Math.max(0, Math.floor((prazo.getTime() - agora.getTime()) / MINUTO));
  const horas = Math.floor(minutosAte / 60);
  return horas >= 48
    ? { dias: Math.floor(horas / 24), horas: 0, minutos: 0 }
    : { dias: 0, horas, minutos: minutosAte % 60 };
}

export function ProximosPrazos({ prazos, agora }: { prazos: readonly PrazoNaTela[]; agora: Date }) {
  const t = useT();
  const intl = useIntl();
  return (
    <Painel
      titulo={t('inicio.prazos.titulo')}
      dica={t('inicio.prazos.dica')}
      acoes={<Link href="/chamados">{t('inicio.prazos.ver_fila')}</Link>}
    >
      {prazos.length === 0 ? (
        <MensagemVazia>{t('inicio.prazos.vazio')}</MensagemVazia>
      ) : (
        <ol className="hk-lista hk-lista-do-inicio">
          {prazos.map((p) => (
            <li key={p.chamadoId} data-chamado={p.chamadoId}>
              <span className="hk-lista-do-inicio-principal">
                <Link href={`/chamados/${p.chamadoId}`}>{p.descricao}</Link>
                {p.emRisco ? <Selo tom="ambar">{t('inicio.prazos.em_risco')}</Selo> : null}
              </span>
              <span className="hk-suave">
                {t('inicio.prazos.linha', {
                  tipo: p.tipo,
                  hotel: p.hotelNome,
                  quando: intl.formatDate(p.prazo, { dateStyle: 'short', timeStyle: 'short' }),
                })}
              </span>
              <strong className="hk-lista-do-inicio-valor">
                <time dateTime={p.prazo}>
                  {t('inicio.prazos.restante', tempoAte(new Date(p.prazo), agora))}
                </time>
              </strong>
            </li>
          ))}
        </ol>
      )}
    </Painel>
  );
}

export function UltimosEventos({ linhas }: { linhas: readonly EventoNaTela[] }) {
  const t = useT();
  const intl = useIntl();
  const quem = (l: EventoNaTela) =>
    l.usuarioId === null
      ? t('admin.auditoria.filtro.sistema')
      : (l.usuarioNome ?? t('auditoria.sem_acesso'));
  const hotel = (l: EventoNaTela) =>
    l.hotelId === null
      ? t('admin.auditoria.sem_hotel')
      : (l.hotelNome ?? t('auditoria.sem_acesso'));
  return (
    <Painel
      titulo={t('inicio.eventos.titulo')}
      dica={t('inicio.eventos.dica', { n: EVENTOS_NA_TELA })}
      acoes={<Link href="/admin/auditoria">{t('inicio.eventos.ver_auditoria')}</Link>}
    >
      {linhas.length === 0 ? (
        <MensagemVazia>{t('inicio.eventos.vazio', { dias: DIAS_DOS_EVENTOS })}</MensagemVazia>
      ) : (
        <ol className="hk-lista hk-lista-do-inicio">
          {linhas.slice(0, EVENTOS_NA_TELA).map((l) => (
            <li key={l.id} data-evento={l.id}>
              <span className="hk-lista-do-inicio-principal">
                {t('inicio.eventos.linha', {
                  registro: t('auditoria.entidade', { entidade: l.entidade }),
                  acao: t(chaveDaAcao(l.entidade), { acao: l.acao }),
                })}
              </span>
              <span className="hk-suave">
                {t('inicio.eventos.detalhe', { hotel: hotel(l), quem: quem(l) })}
              </span>
              <time className="hk-lista-do-inicio-valor hk-suave" dateTime={l.em}>
                {intl.formatDate(l.em, { dateStyle: 'short', timeStyle: 'short' })}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Painel>
  );
}

/** Lê os dois blocos ao abrir e a cada 60 segundos; mostra só o que a API devolveu. */
export function PrazosEEventos() {
  const [prazos, setPrazos] = useState<PrazoNaTela[] | null>(null);
  const [eventos, setEventos] = useState<EventoNaTela[] | null>(null);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    let vale = true;
    const ler = () => {
      const ate = new Date();
      const de = new Date(ate.getTime() - DIAS_DOS_EVENTOS * 24 * 60 * MINUTO);
      const p = new URLSearchParams({ de: de.toISOString(), ate: ate.toISOString() });
      void Promise.all([
        chamarApi<z.infer<typeof RespostaDosProximosPrazos>>('/api/v1/chamados/proximos-prazos'),
        chamarApi<z.infer<typeof RespostaDaAuditoriaGeral>>(
          `/api/v1/auditoria/geral?${p.toString()}`,
        ),
      ]).then(([rp, re]) => {
        if (!vale) return;
        setAgora(new Date());
        setPrazos(rp.ok ? rp.dados.prazos : null);
        setEventos(re.ok ? re.dados.linhas : null);
      });
    };
    ler();
    const id = setInterval(ler, INTERVALO_MS);
    return () => {
      vale = false;
      clearInterval(id);
    };
  }, []);

  if (prazos === null && eventos === null) return null;
  return (
    <div className="hk-grade" data-colunas="2">
      {prazos !== null ? <ProximosPrazos prazos={prazos} agora={agora} /> : null}
      {eventos !== null ? <UltimosEventos linhas={eventos} /> : null}
    </div>
  );
}
