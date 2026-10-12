// Provisionamento de cliente (docs/13, "Preparação do piloto"; resposta 4 do
// Cesar de 08/10/2026): o grupo, o contrato de licença, o primeiro Admin (que
// recebe o convite por e-mail) e os padrões.
//
//   pnpm ops:provisionar --ambiente staging --nome "Grupo Exemplo" \
//     --admin-email pessoa@cliente.com.br --admin-nome "Nome da Pessoa" \
//     --max-hoteis 4 --max-uhs 600 --por "Cesar" [--dry-run]
//   pnpm ops:provisionar --ambiente staging --tenant <uuid> ...   (completar)
//
// Sem --tenant, cria um grupo novo e recusa se já existe grupo com o mesmo
// nome (para não criar dois por engano). Com --tenant, só completa o grupo
// que já existe: rodar de novo não duplica nada, não muda a licença e não
// reenvia o convite. --dry-run confere tudo e não grava.
//
// Confere o alvo como o kit (web-do-ambiente.ts) e grava pelo
// apps/web/test/provisionamento/provisionar.ts. Produção entra com o roteiro
// de operação dela (F0-12). Nada de senha em argv nem na tela.
import pg from 'pg';
import { type Ambiente, conexaoDono, descrever, lerArgs } from './ambiente.ts';
import { idDoGrupo, lerPedidoDeProvisionamento } from './provisionamento.ts';
import { carregarWebDoAmbiente, rodarNoWeb, urlDoDonoComCa } from './web-do-ambiente.ts';

const AMBIENTES_PERMITIDOS: readonly Ambiente[] = ['dev', 'staging'];
const argv = process.argv.slice(2);
const { ambiente, dryRun } = lerArgs(argv, AMBIENTES_PERMITIDOS);
const pedido = lerPedidoDeProvisionamento(argv);

const ref = carregarWebDoAmbiente(ambiente);
const dono = conexaoDono(ambiente); // confere o ref antes de qualquer conexão
const site =
  process.env['HK_URL_SITE'] ?? (ambiente === 'dev' ? 'http://localhost:3000' : undefined);
if (!site) throw new Error('HK_URL_SITE não está definida (o link do convite usa o site).');
console.log(`Ambiente: ${ambiente} (ref ${ref}) — ${descrever(dono)}\n`);

// Só leitura, antes de gravar: o nome repetido e o grupo a completar.
const leitura = new pg.Client(dono);
await leitura.connect();
try {
  const mesmoNome = await leitura.query<{ id: string }>(
    `select id from app.tenant where lower(nome) = lower($1)`,
    [pedido.nome],
  );
  if (pedido.tenant === null && mesmoNome.rows.length > 0) {
    const ids = mesmoNome.rows.map((r) => r.id).join(', ');
    throw new Error(
      `Já existe grupo com o nome "${pedido.nome}" (${ids}). Para completar, use --tenant. Nada foi gravado.`,
    );
  }
  if (pedido.tenant !== null) {
    const existe = await leitura.query(`select 1 from app.tenant where id = $1`, [pedido.tenant]);
    if (existe.rows.length === 0) {
      throw new Error(`Grupo ${pedido.tenant} não encontrado em ${ambiente}. Nada foi gravado.`);
    }
  }
} finally {
  await leitura.end();
}

const tenantId = idDoGrupo(pedido);
console.log(
  [
    `${pedido.tenant ? 'Completar' : 'Criar'} o grupo "${pedido.nome}" (${tenantId}):`,
    `  contrato: ${pedido.maxHoteis} hotéis e ${pedido.maxUhs} UHs, por ${pedido.por} (só se ainda não houver)`,
    `  primeiro Admin: ${pedido.adminNome} <${pedido.adminEmail}>, convite para ${site}`,
    '  padrões: categorias, situações e prioridades, códigos e prioridade por categoria',
    '',
  ].join('\n'),
);
if (dryRun) {
  console.log('--dry-run: nada foi gravado.');
  process.exit(0);
}

process.exit(
  rodarNoWeb('vitest.provisionamento.config.ts', {
    HK_PROV_URL_DONO: urlDoDonoComCa(dono),
    HK_PROV_PEDIDO: JSON.stringify({
      tenantId,
      nome: pedido.nome,
      adminEmail: pedido.adminEmail,
      adminNome: pedido.adminNome,
      maxHoteis: pedido.maxHoteis,
      maxUhs: pedido.maxUhs,
      por: pedido.por,
      site,
    }),
  }),
);
