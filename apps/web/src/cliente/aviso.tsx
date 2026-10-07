'use client';
// Aviso de resultado das ações (ADR-038): feito (ou o texto de sucesso da
// ação), ou o erro da API traduzido. Usado pela operação e pelos cadastros.
import { MensagemDeErro, Nota } from '@hubkeep/ui';
import type { ErroDaApi } from './api';
import { useMensagemDeErro, useT } from '../i18n/cliente';

export type AvisoDeAcao = { tipo: 'ok'; texto?: string } | { tipo: 'erro'; erro: ErroDaApi };

export function Aviso({ aviso }: { aviso: AvisoDeAcao | null }) {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  if (!aviso) return null;
  return aviso.tipo === 'ok' ? (
    <Nota tom="ok">{aviso.texto ?? t('comum.feito')}</Nota>
  ) : (
    <MensagemDeErro>{mensagemDeErro(aviso.erro)}</MensagemDeErro>
  );
}
