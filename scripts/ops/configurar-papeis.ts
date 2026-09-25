// F0-03 — define LOGIN e senha dos papéis da aplicação num ambiente.
//
//   node --experimental-strip-types scripts/ops/configurar-papeis.ts --ambiente dev --dry-run
//   node --experimental-strip-types scripts/ops/configurar-papeis.ts --ambiente dev
//
// Executado por pessoa autorizada, na própria máquina; nunca na Vercel.
//
// Estado desejado (declarativo, idempotente — rodar de novo chega ao mesmo lugar):
//   hk_app, hk_worker, hk_ingestao  LOGIN, com senha
//   hk_backoffice, hk_authz         NOLOGIN, sem senha
//
// De onde vem a senha:
//   ci e dev            HK_<PAPEL>_SENHA_<AMBIENTE>
//   staging e produção  digitada, sem eco, duas vezes por papel, num terminal
//                       interativo; antes, a pessoa confirma o alvo digitando
//                       o project ref dele
//
// A senha nunca sai desta máquina: o script calcula o verificador SCRAM-SHA-256
// localmente e o ALTER ROLE recebe só ele. Senha não entra por argumento, não é
// impressa, e o --dry-run mostra os comandos com o verificador omitido.
// Limites de conexão e timeouts não moram aqui: são da migração 0002.
import pg from 'pg';
import {
  type Ambiente,
  PAPEIS_COM_LOGIN,
  PAPEIS_SEM_LOGIN,
  conexaoDono,
  descrever,
  exigirConfirmacaoProducao,
  lerArgs,
  refDoAlvo,
  variavelSenha,
} from './ambiente.ts';
import { validarSenha, verificadorScram } from './scram.ts';
import {
  confirmacaoConfere,
  exigirTerminalInterativo,
  perguntar,
  perguntarOculto,
} from './terminal.ts';

// Todos os ambientes: o script só altera papéis (LOGIN e senha), não grava nem
// apaga dado. No dev, a string de conexão precisa conter o ref de [remotes.dev]
// (conexaoDono). Staging e produção são interativos (MODO_INTERATIVO); produção
// ainda exige --confirmar-producao.
const AMBIENTES_PERMITIDOS: readonly Ambiente[] = ['ci', 'dev', 'staging', 'producao'];
const MODO_INTERATIVO: readonly Ambiente[] = ['staging', 'producao'];

async function senhaDigitada(papel: string): Promise<string> {
  const senha = await perguntarOculto(`Senha de ${papel}: `);
  const repetida = await perguntarOculto(`Repita a senha de ${papel}: `);
  if (senha !== repetida) {
    throw new Error(`As duas senhas de ${papel} não conferem. Nada foi alterado.`);
  }
  return senha;
}

interface Comando {
  texto: string; // o que se mostra
  sql: string; // o que se executa
}

async function main() {
  const { ambiente, dryRun, producao } = lerArgs(process.argv.slice(2), AMBIENTES_PERMITIDOS);
  exigirConfirmacaoProducao(ambiente, producao);
  const interativo = MODO_INTERATIVO.includes(ambiente);
  if (interativo) {
    exigirTerminalInterativo(Boolean(process.stdin.isTTY), Boolean(process.stdout.isTTY), ambiente);
  }

  const dono = conexaoDono(ambiente);
  if (interativo) {
    // Antes de conectar: a pessoa vê o alvo e o confirma digitando o ref.
    const ref = refDoAlvo(dono);
    if (!ref) throw new Error('Não foi possível tirar o project ref da string de conexão.');
    console.log(`Ambiente: ${ambiente}\nAlvo:     ${descrever(dono)}`);
    const digitado = await perguntar('Digite o project ref do alvo para confirmar: ');
    if (!confirmacaoConfere(digitado, ref)) {
      throw new Error('Confirmação não confere com o alvo. Nada foi conectado.');
    }
  }

  // Senhas: presença, formato e unicidade. Em --dry-run a ausência só é avisada
  // e, nos ambientes interativos, nenhuma senha é pedida.
  const senhas = new Map<string, string>();
  const problemas: string[] = [];
  for (const papel of PAPEIS_COM_LOGIN) {
    const nome = interativo ? `senha de ${papel}` : variavelSenha(papel, ambiente);
    let senha: string | undefined;
    if (!interativo) senha = process.env[nome];
    else if (!dryRun) senha = await senhaDigitada(papel);
    if (!senha) {
      if (!interativo) problemas.push(`${nome} não está definida.`);
      continue;
    }
    try {
      validarSenha(senha, nome);
    } catch (e) {
      problemas.push((e as Error).message);
      continue;
    }
    senhas.set(papel, senha);
  }
  if (new Set(senhas.values()).size !== senhas.size) {
    problemas.push('As senhas dos papéis precisam ser diferentes entre si.');
  }
  if (problemas.length > 0 && !dryRun) throw new Error(problemas.join('\n'));

  const cliente = new pg.Client(dono);
  await cliente.connect();
  try {
    console.log(`Ambiente: ${ambiente}${dryRun ? ' (dry-run: nada será alterado)' : ''}`);
    console.log(`Alvo:     ${descrever(dono)}\n`);

    const estado = async () =>
      new Map(
        (
          await cliente.query<{ rolname: string; rolcanlogin: boolean }>(
            `select rolname, rolcanlogin from pg_roles where rolname = any($1::text[])`,
            [[...PAPEIS_COM_LOGIN, ...PAPEIS_SEM_LOGIN]],
          )
        ).rows.map((r) => [r.rolname, r.rolcanlogin]),
      );

    const antes = await estado();
    const faltando = [...PAPEIS_COM_LOGIN, ...PAPEIS_SEM_LOGIN].filter((p) => !antes.has(p));
    if (faltando.length > 0) {
      throw new Error(
        `Papéis inexistentes (a migração de fundação foi aplicada?): ${faltando.join(', ')}`,
      );
    }

    const comandos: Comando[] = [];
    for (const papel of PAPEIS_COM_LOGIN) {
      const senha = senhas.get(papel);
      const verificador = senha ? verificadorScram(senha) : '';
      comandos.push({
        texto: `alter role ${papel} with login password '<verificador SCRAM-SHA-256 omitido>';`,
        sql: `alter role ${papel} with login password ${cliente.escapeLiteral(verificador)}`,
      });
    }
    for (const papel of PAPEIS_SEM_LOGIN) {
      comandos.push({
        texto: `alter role ${papel} with nologin password null;`,
        sql: `alter role ${papel} with nologin password null`,
      });
    }

    const listar = (m: Map<string, boolean>) => {
      for (const papel of [...PAPEIS_COM_LOGIN, ...PAPEIS_SEM_LOGIN]) {
        console.log(`  ${papel.padEnd(14)} ${m.get(papel) ? 'sim' : 'não'}`);
      }
    };
    console.log('Estado atual (LOGIN):');
    listar(antes);
    console.log('\nComandos, numa única transação:');
    for (const c of comandos) console.log(`  ${c.texto}`);

    if (dryRun) {
      if (problemas.length > 0) {
        console.log('\nAntes de aplicar, resolva:');
        for (const p of problemas) console.log(`  - ${p}`);
      }
      return;
    }

    await cliente.query('begin');
    try {
      for (const c of comandos) await cliente.query(c.sql);
      await cliente.query('commit');
    } catch (e) {
      await cliente.query('rollback');
      throw e;
    }

    const depois = await estado();
    console.log('\nEstado final (LOGIN):');
    listar(depois);
    const errado = [
      ...PAPEIS_COM_LOGIN.filter((p) => !depois.get(p)),
      ...PAPEIS_SEM_LOGIN.filter((p) => depois.get(p)),
    ];
    if (errado.length > 0) throw new Error(`Estado final inesperado em: ${errado.join(', ')}`);
    console.log('\nOK. Senhas definidas por verificador SCRAM; nenhuma senha foi transmitida.');
  } finally {
    await cliente.end();
  }
}

main().catch((e: unknown) => {
  console.error(`ERRO: ${(e as Error).message}`);
  process.exit(1);
});
