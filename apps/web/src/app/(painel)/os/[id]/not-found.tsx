'use client';
// 404 da página da OS (PV3c): a id não é UUID. A mensagem é a mesma do erro da
// API, pelo catálogo.
import Link from 'next/link';
import { Aviso } from '../../../../cliente/corretiva';
import { useT } from '../../../../i18n/cliente';

const NAO_ENCONTRADA = {
  tipo: 'erro',
  erro: { codigo: 'os_nao_encontrada', parametros: {} },
} as const;

export default function OsNaoEncontrada() {
  const t = useT();
  return (
    <>
      <Link href="/os" className="hk-voltar">
        {t('corretiva.voltar_para_os')}
      </Link>
      <Aviso aviso={NAO_ENCONTRADA} />
    </>
  );
}
