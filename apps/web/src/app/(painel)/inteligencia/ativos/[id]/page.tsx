'use client';
// /inteligencia/ativos/{id} — o detalhe do ativo no Intelligence. Id fora do formato: 404.
import { notFound, useParams } from 'next/navigation';
import { UUID } from '../../comum';
import { TelaDoAtivo } from './tela';

export default function AtivoNoIntelligence() {
  const { id } = useParams<{ id: string }>();
  if (!UUID.test(id)) notFound();
  return <TelaDoAtivo key={id} id={id} />;
}
