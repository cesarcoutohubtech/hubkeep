// Aceite da F0-05: "a secret key não aparece em nenhum pacote além de
// auth-admin (checado na CI)" — CLAUDE.md, regra 5.
//
// Varre todo arquivo do repositório (versionado ou novo, respeitando o
// .gitignore) atrás do nome da variável e dos marcadores de chave de
// administração do Supabase. Fora da lista abaixo, qualquer ocorrência quebra
// a CI: quem precisar da chave usa @hubkeep/auth-admin.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MARCADORES = /SUPABASE_SECRET_KEY|SERVICE_ROLE_KEY|service_role|sb_secret_/;

// Onde a menção é legítima: o próprio pacote, a CI que entrega a chave ao
// ambiente de teste, documentação e o modelo de variáveis.
const PERMITIDOS = [
  /^packages\/auth-admin\//,
  /^\.github\/workflows\//,
  /^docs\//,
  /\.md$/,
  /^\.env\.example$/,
  // Config gerada pelo supabase init: cita o PAPEL service_role da Data API num
  // comentário, não a chave. Chave de verdade não vai em config.toml.
  /^supabase\/config\.toml$/,
  // Meta-teste 31: cita o PAPEL service_role para provar que ele não tem USAGE
  // nos schemas do HubKeep (B8 do docs/11). Não traz chave.
  /^supabase\/tests\/database\/001_meta_seguranca\.test\.sql$/,
  /^tests\/secret-key-so-no-auth-admin\.test\.ts$/,
];

function arquivosDoRepositorio(): string[] {
  const saida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  });
  return saida.split('\n').filter(Boolean);
}

describe('secret key do Supabase só em packages/auth-admin', () => {
  it('nenhum arquivo fora da lista permitida menciona a secret key', () => {
    const ocorrencias: string[] = [];
    for (const arquivo of arquivosDoRepositorio()) {
      if (PERMITIDOS.some((p) => p.test(arquivo))) continue;
      let conteudo: string;
      try {
        conteudo = readFileSync(arquivo, 'utf8');
      } catch {
        continue; // removido no disco mas ainda no índice
      }
      conteudo.split('\n').forEach((linha, i) => {
        if (MARCADORES.test(linha)) ocorrencias.push(`${arquivo}:${i + 1}`);
      });
    }
    expect(ocorrencias).toEqual([]);
  });

  it('o próprio pacote auth-admin é quem lê a chave (controle: o teste enxerga o que procura)', () => {
    const fonte = readFileSync('packages/auth-admin/src/index.ts', 'utf8');
    expect(MARCADORES.test(fonte)).toBe(true);
  });
});

// ADR-024: no Storage, a secret key só emite as duas URLs assinadas do bucket
// de anexos. Não lê, não lista, não apaga objeto, não sobrescreve e não chega
// a tabela nem a função do banco.
describe('auth-admin: uso do Storage restrito às duas URLs assinadas (ADR-024)', () => {
  const fonte = readFileSync('packages/auth-admin/src/index.ts', 'utf8');

  it('só createSignedUploadUrl e createSignedUrl no bucket', () => {
    const chamadas = new Set([...fonte.matchAll(/\bbucket\.(\w+)\(/g)].map((m) => m[1]));
    expect([...chamadas].sort()).toEqual(['createSignedUploadUrl', 'createSignedUrl']);
  });

  it('o único .from() é o do bucket de anexos; sem rpc, schema ou upsert ligado', () => {
    const froms = [...fonte.matchAll(/(\w+(?:\([^)]*\))?)\.from\(([^)]*)\)/g)].map((m) => m[0]);
    expect(froms).toEqual(['storage.from(BUCKET_DE_ANEXOS)']);
    expect(fonte).not.toMatch(/\.rpc\(|\.schema\(|upsert:\s*true/);
    expect(fonte).toMatch(/createSignedUploadUrl\(caminho, \{ upsert: false \}\)/);
  });

  it('o módulo não exporta o cliente do Supabase, nem em tipo', () => {
    const exportados = [
      ...fonte.matchAll(/^export\s+(?:async\s+)?(?:const|function|class|type|interface)\s+(\w+)/gm),
    ].map((m) => m[1]);
    expect(exportados).toEqual([
      'criarAdministracaoDoAuth',
      // Remoção do segundo fator (SP1, ADR-049 e adendo ao ADR-024).
      'criarAdministracaoDoSegundoFator',
      // Contas dos dados de demonstração (kit de teste), só com e-mail .test.
      'criarIdentidadeDeDemonstracao',
      'BUCKET_DE_ANEXOS',
      'criarArmazenamentoDeAnexos',
    ]);
    expect(fonte).not.toMatch(/^export\s*(?:\*|\{)/m);
    const assinaturas = fonte.split('\n').filter((l) => l.startsWith('export'));
    expect(assinaturas.join('\n')).not.toMatch(/SupabaseClient/);
  });

  it('em execução, o armazenamento entrega só as duas funções de URL', async () => {
    const { criarArmazenamentoDeAnexos } = await import('../packages/auth-admin/src/index');
    const anterior = process.env.SUPABASE_SECRET_KEY;
    process.env.SUPABASE_SECRET_KEY = 'chave-falsa-so-para-montar-o-cliente';
    try {
      // Montar o cliente não faz rede; nenhuma URL é pedida aqui.
      const armazenamento = criarArmazenamentoDeAnexos({ url: 'http://127.0.0.1:9' });
      expect(Object.keys(armazenamento).sort()).toEqual(['urlDeDownload', 'urlDeUpload']);
      for (const f of Object.values(armazenamento)) expect(typeof f).toBe('function');
    } finally {
      if (anterior === undefined) delete process.env.SUPABASE_SECRET_KEY;
      else process.env.SUPABASE_SECRET_KEY = anterior;
    }
  });

  it('a porta tem exatamente as duas funções', () => {
    const porta = readFileSync('packages/aplicacao/src/portas/anexos.ts', 'utf8');
    const bloco = /interface ArmazenamentoDeArquivos \{([\s\S]*?)\n\}/.exec(porta)?.[1] ?? '';
    const metodos = [...bloco.matchAll(/^\s+(\w+)\(/gm)].map((m) => m[1]);
    expect(metodos).toEqual(['urlDeUpload', 'urlDeDownload']);
  });
});

// ADR-049 e adendo ao ADR-024: no MFA, a secret key só lista e remove os
// fatores do usuário pedido. Não cadastra fator nem mexe em outra coisa.
describe('auth-admin: uso do MFA restrito a listar e remover fatores (ADR-049)', () => {
  const fonte = readFileSync('packages/auth-admin/src/index.ts', 'utf8');

  it('só listFactors e deleteFactor na API de administração do MFA', () => {
    const chamadas = new Set([...fonte.matchAll(/\.admin\.mfa\.(\w+)\(/g)].map((m) => m[1]));
    expect([...chamadas].sort()).toEqual(['deleteFactor', 'listFactors']);
    expect(fonte).not.toMatch(/\.mfa\.(enroll|challenge|verify)\(/);
  });

  it('em execução, a administração do segundo fator entrega só a remoção', async () => {
    const { criarAdministracaoDoSegundoFator } = await import('../packages/auth-admin/src/index');
    const anterior = process.env.SUPABASE_SECRET_KEY;
    process.env.SUPABASE_SECRET_KEY = 'chave-falsa-so-para-montar-o-cliente';
    try {
      const adm = criarAdministracaoDoSegundoFator({ url: 'http://127.0.0.1:9' });
      expect(Object.keys(adm)).toEqual(['removerFatores']);
    } finally {
      if (anterior === undefined) delete process.env.SUPABASE_SECRET_KEY;
      else process.env.SUPABASE_SECRET_KEY = anterior;
    }
  });
});
