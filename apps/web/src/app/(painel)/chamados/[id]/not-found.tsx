'use client';
// 404 do detalhe do chamado (P1c): o chamado não existe ou quem pede não o vê
// (a RLS não o mostra). A mensagem é a mesma do erro da API, pelo catálogo.
import Link from 'next/link';
import { Aviso } from '../../../../cliente/corretiva';
import { useT } from '../../../../i18n/cliente';

const NAO_ENCONTRADO = {
  tipo: 'erro',
  erro: { codigo: 'chamado_nao_encontrado', parametros: {} },
} as const;

export default function ChamadoNaoEncontrado() {
  const t = useT();
  return (
    <>
      <Link href="/chamados" className="hk-voltar">
        {t('corretiva.voltar_para_chamados')}
      </Link>
      <Aviso aviso={NAO_ENCONTRADO} />
    </>
  );
}
