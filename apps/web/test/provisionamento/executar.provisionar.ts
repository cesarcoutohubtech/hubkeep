// Execução do provisionamento de cliente, chamada por `pnpm ops:provisionar`
// (scripts/ops/provisionar-cliente.ts), que confere o alvo e monta o pedido.
// Fora do `pnpm test`: o vitest do web só pega *.test.ts, e este arquivo só
// roda pela config vitest.provisionamento.config.ts.
import { expect, it } from 'vitest';
import { type PedidoDeProvisionamento, provisionarCliente } from './provisionar';

const exigir = (nome: string): string => {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não está definida (rode por pnpm ops:provisionar).`);
  return v;
};

it('provisionamento de cliente', { timeout: 600_000 }, async () => {
  const pedido = JSON.parse(exigir('HK_PROV_PEDIDO')) as PedidoDeProvisionamento;
  const r = await provisionarCliente(exigir('HK_PROV_URL_DONO'), pedido, (l) => console.log(l));
  console.log(
    [
      '',
      `Grupo: ${r.tenantId}`,
      `Contrato: ${r.contrato.maxHoteis} hotéis e ${r.contrato.maxUhs} UHs`,
      `Primeiro Admin: ${pedido.adminEmail} (${r.conviteNovo ? 'convite enviado' : 'já era membro; nada reenviado'})`,
      '',
    ].join('\n'),
  );
  expect(r.tenantId).toBe(pedido.tenantId);
});
