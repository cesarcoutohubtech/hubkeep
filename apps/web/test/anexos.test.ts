// Aceite da F0-10 contra o Supabase do runner (banco, Auth e Storage reais):
//   - upload direto pela URL assinada funciona;
//   - acesso sem URL assinada é negado (chave pública, JWT do usuário, URL pública);
//   - usuário de outro hotel não consegue URL para o registro.
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as urlDeDownload } from '../src/app/api/v1/anexos/url-de-download/route';
import { POST as urlDeUpload } from '../src/app/api/v1/anexos/url-de-upload/route';

const URL_SUPABASE = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const CHAVE_PUBLICA = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
const URL_DONO = process.env['HK_TESTE_URL_DONO'];
const temAmbiente = Boolean(
  URL_SUPABASE && CHAVE_PUBLICA && URL_DONO && process.env['DATABASE_URL_APP'],
);
if (!temAmbiente && process.env['HK_EXIGIR_BANCO'] === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas falta o ambiente do Supabase local para os anexos.');
}
const exigir = (v: string | undefined): string => {
  if (!v) throw new Error('variável de teste ausente');
  return v;
};

const sufixo = randomUUID().slice(0, 8);
const T = { tenant: randomUUID(), h1: randomUUID(), h2: randomUUID(), local: randomUUID() };
const U = { admin: randomUUID(), gerenteH2: randomUUID() };
const email = {
  admin: `anexo-admin-${sufixo}@hubkeep.test`,
  gerente: `anexo-gerente-${sufixo}@hubkeep.test`,
};
const SENHA = `Senha-de-teste-${sufixo}`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const req = (caminho: string, token: string, corpo: unknown) =>
  new Request(`http://127.0.0.1:3000${caminho}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-hubkeep-tenant': T.tenant,
    },
    body: JSON.stringify(corpo),
  });

describe.skipIf(!temAmbiente)('F0-10 — anexos por URL assinada', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let tokenAdmin = '';
  let tokenGerente = '';
  let caminho = '';

  const semearUsuario = async (id: string, mail: string) => {
    await dono.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change_token_new, email_change)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
         extensions.crypt($3, extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '')`,
      [id, mail, SENHA],
    );
    await dono.query(
      `insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
       values (gen_random_uuid(), $1::uuid, $1::uuid::text, 'email', $2::jsonb, now(), now())`,
      [id, JSON.stringify({ sub: id, email: mail, email_verified: true })],
    );
  };
  const entrar = async (mail: string) => {
    const cliente = createClient(exigir(URL_SUPABASE), exigir(CHAVE_PUBLICA), {
      auth: { persistSession: false },
    });
    const { data, error } = await cliente.auth.signInWithPassword({ email: mail, password: SENHA });
    if (error || !data.session) throw new Error(`login falhou: ${error?.message}`);
    return data.session.access_token;
  };

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: exigir(URL_DONO) });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo anexos')`, [T.tenant]);
    for (const [h, nome] of [
      [T.h1, 'Hotel 1'],
      [T.h2, 'Hotel 2'],
    ] as const) {
      await dono.query(
        `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, $3, 'America/Sao_Paulo', 'ativo')`,
        [h, T.tenant, nome],
      );
    }
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, status) values ($1, $2, $3, 'uh', '101', 'ativo')`,
      [T.local, T.tenant, T.h1],
    );
    await semearUsuario(U.admin, email.admin);
    await semearUsuario(U.gerenteH2, email.gerente);
    for (const [u, mail, papel, escopo, hotel] of [
      [U.admin, email.admin, 'admin_grupo', 'grupo', null],
      [U.gerenteH2, email.gerente, 'gerente_hotel', 'hotel', T.h2],
    ] as const) {
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $3)`,
        [T.tenant, u, mail],
      );
      await dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), T.tenant, u, papel, escopo, hotel, U.admin],
      );
    }
    tokenAdmin = await entrar(email.admin);
    tokenGerente = await entrar(email.gerente);
  });

  afterAll(async () => {
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.atribuicao_escopo',
      'app.local',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [T.tenant]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [T.tenant]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [[U.admin, U.gerenteH2]]);
    await dono.end();
  });

  it('upload direto do navegador pela URL assinada funciona', async () => {
    const r = await urlDeUpload(
      req('/api/v1/anexos/url-de-upload', tokenAdmin, {
        entidade: 'local',
        registroId: T.local,
        tipo: 'image/png',
      }),
    );
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { caminho: string; url: string };
    caminho = corpo.caminho;
    expect(caminho.startsWith(`${T.tenant}/${T.h1}/local/${T.local}/`)).toBe(true);
    expect(caminho.endsWith('.png')).toBe(true);

    const envio = await fetch(corpo.url, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: PNG,
    });
    expect(envio.status).toBe(200);
  });

  it('acesso sem URL assinada é negado (chave pública, JWT do usuário, URL pública)', async () => {
    const base = `${exigir(URL_SUPABASE)}/storage/v1/object`;
    const tentativas = [
      fetch(`${base}/anexos/${caminho}`, { headers: { apikey: exigir(CHAVE_PUBLICA) } }),
      fetch(`${base}/anexos/${caminho}`, {
        headers: { apikey: exigir(CHAVE_PUBLICA), authorization: `Bearer ${tokenAdmin}` },
      }),
      fetch(`${base}/public/anexos/${caminho}`),
    ];
    for (const r of await Promise.all(tentativas)) {
      expect(r.status, r.url).not.toBe(200);
      const bytes = Buffer.from(await r.arrayBuffer());
      expect(bytes.equals(PNG)).toBe(false);
    }
  });

  it('a URL de download assinada devolve o arquivo', async () => {
    const r = await urlDeDownload(req('/api/v1/anexos/url-de-download', tokenAdmin, { caminho }));
    expect(r.status).toBe(200);
    const { url } = (await r.json()) as { url: string };
    const arquivo = await fetch(url);
    expect(arquivo.status).toBe(200);
    expect(Buffer.from(await arquivo.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it('usuário de outro hotel não consegue URL para o registro (nem de upload, nem de download)', async () => {
    const up = await urlDeUpload(
      req('/api/v1/anexos/url-de-upload', tokenGerente, {
        entidade: 'local',
        registroId: T.local,
        tipo: 'image/png',
      }),
    );
    expect(up.status).toBe(404);
    expect(((await up.json()) as { erro: { codigo: string } }).erro.codigo).toBe(
      'registro_nao_encontrado',
    );
    const down = await urlDeDownload(
      req('/api/v1/anexos/url-de-download', tokenGerente, { caminho }),
    );
    expect(down.status).toBe(404);
  });
});
