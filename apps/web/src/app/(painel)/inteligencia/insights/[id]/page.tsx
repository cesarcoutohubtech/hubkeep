'use client';
// /inteligencia/insights/{id} — a página do insight. Id fora do formato: 404.
import { notFound, useParams } from 'next/navigation';
import { UUID } from '../../comum';
import { TelaDoInsight } from './tela';

export default function Insight() {
  const { id } = useParams<{ id: string }>();
  if (!UUID.test(id)) notFound();
  return <TelaDoInsight key={id} id={id} />;
}
