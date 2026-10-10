// Módulos contratados do tenant (I7, licenca.modulo), até o backoffice existir:
//
//   pnpm ops:modulo --ambiente dev --tenant <uuid>
//   pnpm ops:modulo --ambiente dev --tenant <uuid> --modulo inteligencia \
//     --inicio 2026-10-10T00:00:00-03:00 [--fim 2027-10-10T00:00:00-03:00] \
//     --por "Cesar" [--dry-run]
//
// Sem --modulo, lista. Com --modulo, grava a vigência: cria a linha do módulo
// no tenant ou muda o início e o fim da que existe (renovar ou encerrar é
// mudar a vigência; ninguém apaga). --dry-run mostra o resultado e desfaz.
//
// Conecta com a string do dono (ambiente.ts, que confere o alvo antes) e grava
// com o papel hk_backoffice, numa transação (`set local role`): as policies e
// os grants de licenca.modulo são os do backoffice, como no pgTAP 030. O
// backoffice não lê tabela de negócio; o tenant que não existe falha pela FK.
// Se o módulo vale agora é regra do domínio (moduloVigente), que o servidor
// aplica a cada request.
import pg from 'pg';
import { type Ambiente, conexaoDono, descrever, lerArgs } from './ambiente.ts';
import { lerPedidoDeModulo, uuidV7 } from './modulos.ts';

// Grava dado de licença: só no dev por enquanto. Staging e produção entram com
// o roteiro de operação deles (F0-12), por decisão revisada.
const AMBIENTES_PERMITIDOS: readonly Ambiente[] = ['dev'];

const argv = process.argv.slice(2);
const { ambiente, dryRun } = lerArgs(argv, AMBIENTES_PERMITIDOS);
const pedido = lerPedidoDeModulo(argv);
const config = conexaoDono(ambiente);
console.log(`Ambiente: ${ambiente} — ${descrever(config)}\n`);

const iso = (d: Date | null) => (d ? d.toISOString() : 'sem prazo');
const mostrar = (
  linhas: { modulo: string; inicio: Date; fim: Date | null; atualizado_por: string }[],
) => {
  if (linhas.length === 0) console.log('Nenhum módulo contratado.');
  for (const l of linhas)
    console.log(`${l.modulo}: de ${iso(l.inicio)} até ${iso(l.fim)} (por ${l.atualizado_por})`);
};

const dono = new pg.Client(config);
await dono.connect();
try {
  await dono.query('begin');
  await dono.query('set local role hk_backoffice');
  if (pedido.acao === 'gravar') {
    await dono.query(
      `insert into licenca.modulo (id, tenant_id, modulo, inicio, fim, atualizado_por)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (tenant_id, modulo) do update
         set inicio = excluded.inicio, fim = excluded.fim,
             atualizado_em = now(), atualizado_por = excluded.atualizado_por`,
      [uuidV7(), pedido.tenant, pedido.modulo, pedido.inicio, pedido.fim, pedido.por],
    );
  }
  const { rows } = await dono.query(
    `select modulo, inicio, fim, atualizado_por from licenca.modulo
     where tenant_id = $1 order by modulo`,
    [pedido.tenant],
  );
  mostrar(rows);
  if (pedido.acao === 'gravar' && dryRun) {
    await dono.query('rollback');
    console.log('\n--dry-run: nada foi gravado.');
  } else {
    await dono.query('commit');
    if (pedido.acao === 'gravar') console.log('\nGravado.');
  }
} catch (e) {
  await dono.query('rollback').catch(() => undefined);
  // FK de tenant_id: o grupo não existe neste ambiente.
  if ((e as { code?: string }).code === '23503') {
    console.error(`Grupo ${pedido.tenant} não encontrado em ${ambiente}. Nada foi gravado.`);
    process.exitCode = 1;
  } else throw e;
} finally {
  await dono.end();
}
