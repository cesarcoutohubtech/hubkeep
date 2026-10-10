'use client';
// Ativo que não existe, ou fora do escopo de quem decide o insight do hotel dele.
import Link from 'next/link';
import { Aviso } from '../../../../../cliente/aviso';
import { useT } from '../../../../../i18n/cliente';

export default function AtivoNaoEncontrado() {
  const t = useT();
  return (
    <div className="hk-pilha">
      <Link href="/inteligencia/insights" className="hk-voltar">
        {t('inteligencia.voltar')}
      </Link>
      <Aviso aviso={{ tipo: 'erro', erro: { codigo: 'ativo_nao_encontrado', parametros: {} } }} />
    </div>
  );
}
