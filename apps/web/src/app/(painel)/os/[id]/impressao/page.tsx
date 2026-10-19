// A OS para imprimir (1c, item 9): a tela (tela.tsx) lê a OS pela API no
// navegador; só a id inválida é 404 aqui no servidor.
import { notFound } from 'next/navigation';
import { TelaDaImpressao } from './tela';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ImpressaoDaOs({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <TelaDaImpressao key={id} id={id} />;
}
