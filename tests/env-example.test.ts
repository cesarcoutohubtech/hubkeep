// Toda variável de ambiente lida no repositório está no .env.example ("Pronto
// quer dizer", CLAUDE.md). Sem isto, a variável nova só aparece para quem lê o
// código — e o próximo ambiente (staging, F0-12) sobe sem ela.
//
// Varre os arquivos do repositório (versionados ou novos, respeitando o
// .gitignore), como tests/secret-key-so-no-auth-admin.test.ts, atrás das
// formas de leitura usadas aqui. Nomes montados em tempo de execução (senhas
// por papel e ambiente, conexão do dono) vêm das próprias constantes de
// scripts/ops/ambiente.ts.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AMBIENTES_COM_SENHA_EM_VARIAVEL,
  CONEXAO_DONO,
  PAPEIS_COM_LOGIN,
  variavelSenha,
} from '../scripts/ops/ambiente.ts';

const NOME = '([A-Z_][A-Z0-9_]*)';

/** Formas de leitura em código (TS/JS) e em JSON/YAML (scripts do package.json, CI). */
const EM_CODIGO = [
  new RegExp(`process\\.env\\.${NOME}`, 'g'),
  // Cobre também a forma com colchetes precedida de process.
  new RegExp(`env\\[\\s*['"\`]${NOME}['"\`]\\s*\\]`, 'g'),
  // Sintaxe env(...) do kysely-codegen e da CLI do Supabase.
  new RegExp(`env\\(${NOME}\\)`, 'g'),
  // Auxiliares da raiz de composição do web, que recebem o nome da variável.
  new RegExp(`(?:exigirEnv|conexao)\\(\\s*'${NOME}'`, 'g'),
];

/** Nos workflows: chaves de `env:` e o que se exporta ou manda para o GITHUB_ENV. */
const EM_WORKFLOW = [
  new RegExp(`^\\s+${NOME}:`, 'gm'),
  new RegExp(`\\bexport ${NOME}=`, 'g'),
  new RegExp(`echo "${NOME}=`, 'g'),
];

const EXTENSOES_CODIGO = /\.(?:[cm]?[jt]s|tsx|json)$/;
const EXTENSOES_WORKFLOW = /^\.github\/workflows\/.*\.ya?ml$/;

// Variáveis do sistema ou da plataforma, que não se configuram por ambiente.
// Entra aqui só o que for do sistema, nunca do HubKeep. NODE_ENV é definida
// pelo Next (development no `next dev`, production no build) — S1.
const DO_SISTEMA: readonly string[] = ['NODE_ENV'];

function arquivosDoRepositorio(): string[] {
  const saida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  });
  return saida.split('\n').filter(Boolean);
}

const CONSTANTES = 'scripts/ops/ambiente.ts (constantes)';

/** Variável → arquivos em que é lida. */
function variaveisLidas(): Map<string, Set<string>> {
  const achadas = new Map<string, Set<string>>();
  const anotar = (nome: string, arquivo: string) =>
    achadas.set(nome, (achadas.get(nome) ?? new Set()).add(arquivo));
  for (const arquivo of arquivosDoRepositorio()) {
    const padroes = EXTENSOES_WORKFLOW.test(arquivo)
      ? [...EM_CODIGO, ...EM_WORKFLOW]
      : EXTENSOES_CODIGO.test(arquivo)
        ? EM_CODIGO
        : [];
    if (padroes.length === 0) continue;
    let conteudo: string;
    try {
      conteudo = readFileSync(arquivo, 'utf8');
    } catch {
      continue; // removido no disco mas ainda no índice
    }
    for (const p of padroes) {
      for (const m of conteudo.matchAll(p)) {
        const nome = m[1];
        if (nome) anotar(nome, arquivo);
      }
    }
  }
  for (const nome of Object.values(CONEXAO_DONO)) anotar(nome, CONSTANTES);
  for (const amb of AMBIENTES_COM_SENHA_EM_VARIAVEL) {
    for (const papel of PAPEIS_COM_LOGIN) anotar(variavelSenha(papel, amb), CONSTANTES);
  }
  return achadas;
}

let varredura: Map<string, Set<string>> | undefined;
const lidas = () => (varredura ??= variaveisLidas());

/** Linhas NOME=valor do .env.example (sem as comentadas). */
function modelo(): Map<string, string> {
  const linhas = readFileSync('.env.example', 'utf8').split('\n');
  const vars = new Map<string, string>();
  for (const linha of linhas) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(linha.trim());
    if (m?.[1]) vars.set(m[1], (m[2] ?? '').replace(/\s+#.*$/, '').trim());
  }
  return vars;
}

describe('.env.example cobre as variáveis lidas no repositório', () => {
  it('toda variável lida está no .env.example', () => {
    const noModelo = modelo();
    const faltando = [...lidas()]
      .filter(([nome]) => !noModelo.has(nome) && !DO_SISTEMA.includes(nome))
      .map(([nome, arquivos]) => `${nome} (lida em ${[...arquivos].join(', ')})`)
      .sort();
    expect(faltando).toEqual([]);
  });

  // Se um padrão parar de casar, o teste de cima fica verde sem olhar nada.
  // Um caso real de cada forma, no arquivo em que ela aparece hoje.
  it.each([
    ['auxiliar do web', 'DATABASE_URL_APP', 'apps/web/src/servidor/composicao.ts'],
    ['leitura com ponto', 'HK_BANCO_SEM_TLS', 'apps/web/src/servidor/composicao.ts'],
    ['leitura com colchetes', 'HK_MAILPIT_URL', 'apps/web/test/autenticacao.test.ts'],
    ['env(...) do kysely-codegen', 'DEV_SESSION_POOLER', 'scripts/ops/gerar-tipos.mjs'],
    ['chave de env: no workflow', 'CI_DATABASE_URL_OWNER', '.github/workflows/banco.yml'],
    ['export no workflow', 'HK_APP_SENHA_CI', '.github/workflows/banco.yml'],
    ['echo para o GITHUB_ENV', 'HK_TESTE_URL_WORKER', '.github/workflows/banco.yml'],
    ['nome montado em scripts/ops', 'HK_APP_SENHA_DEV', CONSTANTES],
  ])('a varredura enxerga %s (controle: %s em %s)', (_forma, nome, arquivo) => {
    expect([...(lidas().get(nome) ?? [])]).toContain(arquivo);
  });

  it('o .env.example não traz valor real: vazio ou modelo com <marcadores>', () => {
    const preenchidas = [...modelo()]
      .filter(([, valor]) => valor !== '' && !/<[^>]+>/.test(valor))
      .map(([nome]) => nome);
    expect(preenchidas).toEqual([]);
  });
});
