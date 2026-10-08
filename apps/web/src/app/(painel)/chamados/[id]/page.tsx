// Detalhe do chamado no servidor (P1c): a página lê o chamado, as OS, a linha
// do tempo, as referências e os candidatos a responsável pelos mesmos casos de
// uso e o mesmo contexto da API, numa transação de leitura só, e entrega tudo
// à tela (tela.tsx), que no navegador cuida das ações. Quem não vê o chamado
// (ou pede um id que não é UUID) recebe 404, como na API.
import { notFound } from 'next/navigation';
import { telaDoChamado } from '../../../../servidor/leituras-do-chamado';
import { carregarNaPagina } from '../../../../servidor/pagina';
import { TelaDoChamado } from './tela';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Chamado({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const carga = await carregarNaPagina('pagina.chamado', (ctx, registrarErro) =>
    telaDoChamado(ctx, id, registrarErro),
  );
  if (carga.tipo === 'nao_encontrado') notFound();
  return (
    <TelaDoChamado
      key={id}
      id={id}
      inicial={carga.tipo === 'ok' ? carga.dados : null}
      erroInicial={carga.tipo === 'erro' ? carga.erro : null}
    />
  );
}
