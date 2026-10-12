'use client';
// Insight que não existe, ou fora do escopo de quem vê.
import Link from 'next/link';
import { Aviso } from '../../../../../cliente/aviso';
import { useT } from '../../../../../i18n/cliente';

export default function InsightNaoEncontrado() {
  const t = useT();
  return (
    <div className="hk-pilha">
      <Link href="/inteligencia/insights" className="hk-voltar">
        {t('inteligencia.voltar')}
      </Link>
      <Aviso aviso={{ tipo: 'erro', erro: { codigo: 'insight_nao_encontrado', parametros: {} } }} />
    </div>
  );
}
