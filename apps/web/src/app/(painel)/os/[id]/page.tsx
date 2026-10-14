// Página da OS por id (PV3c): a OS preventiva, que não tem chamado, abre aqui
// pela lista de OS. A tela (tela.tsx) lê a OS pela API no navegador, como as
// telas antes da P1c; só a id inválida é 404 aqui no servidor.
import { notFound } from 'next/navigation';
import { TelaDaOs } from './tela';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Os({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <TelaDaOs key={id} id={id} />;
}
