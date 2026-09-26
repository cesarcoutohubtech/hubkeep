// Aceite da F0-10b contra o Supabase do runner (banco e Auth reais):
//   - o idioma resolvido segue membro → tenant → navegador, e troca quando o
//     membro grava outro;
//   - a gravação passa pela unit of work, com auditoria sem hotel, inclusive
//     para quem não tem papel de escrita (autoauditoria, migração 0005);
//   - fuso inválido é recusado pela aplicação (422 fuso_invalido) e idioma
//     fora da lista pelo contrato (422 entrada_invalida).
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET, PUT } from '../src/app/api/v1/preferencias/route';

const URL_SUPABASE = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const CHAVE_PUBLICA = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
const URL_DONO = process.env['HK_TESTE_URL_DONO'];
const temAmbiente = Boolean(
  URL_SUPABASE && CHAVE_PUBLICA && URL_DONO && process.env['DATABASE_URL_APP'],
);
if (!temAmbiente && process.env['HK_EXIGIR_BANCO'] === '1') {
  throw new Error(
    'HK_EXIGIR_BANCO=1, mas falta o ambiente do Supabase local para as preferências.',
  );
}
const exigir = (v: string | undefined): string => {
  if (!v) throw new Error('variável de teste ausente');
  return v;
};

const sufixo = randomUUID().slice(0, 8);
const TENANT = randomUUID();
const U = { admin: randomUUID(), semPapel: randomUUID() };
const email = {
  admin: `pref-admin-${sufixo}@hubkeep.test`,
  semPapel: `pref-sem-papel-${sufixo}@hubkeep.test`,
};
const SENHA = `Senha-de-teste-${sufixo}`;

const req = (metodo: 'GET' | 'PUT', token: string, corpo?: unknown) =>
  new Request('http://127.0.0.1:3000/api/v1/preferencias', {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      'accept-language': 'en-US,en;q=0.9',
      authorization: `Bearer ${token}`,
      'x-hubkeep-tenant': TENANT,
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });

interface Resposta {
  idioma: string;
  formatoRegional: string;
  fuso: string;
  moeda: string;
  gravadas: { idioma: string | null; formatoRegional: string | null; fuso: string | null };
}

describe.skipIf(!temAmbiente)(
  'F0-10b — preferências de idioma e região',
  { timeout: 60_000 },
  () => {
    let dono: pg.Client;
    let tokenAdmin = '';
    let tokenSemPapel = '';

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
      const { data, error } = await cliente.auth.signInWithPassword({
        email: mail,
        password: SENHA,
      });
      if (error || !data.session) throw new Error(`login falhou: ${error?.message}`);
      return data.session.access_token;
    };

    beforeAll(async () => {
      dono = new pg.Client({ connectionString: exigir(URL_DONO) });
      await dono.connect();
      // Tenant chileno: idioma padrão es, moeda CLP.
      await dono.query(
        `insert into app.tenant (id, nome, pais, moeda, idioma_padrao) values ($1, 'Grupo preferências', 'CL', 'CLP', 'es')`,
        [TENANT],
      );
      await semearUsuario(U.admin, email.admin);
      await semearUsuario(U.semPapel, email.semPapel);
      for (const [u, mail] of [
        [U.admin, email.admin],
        [U.semPapel, email.semPapel],
      ] as const) {
        await dono.query(
          `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $3)`,
          [TENANT, u, mail],
        );
      }
      await dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, concedido_por)
       values ($1, $2, $3, 'admin_grupo', 'grupo', $3)`,
        [randomUUID(), TENANT, U.admin],
      );
      tokenAdmin = await entrar(email.admin);
      tokenSemPapel = await entrar(email.semPapel);
    });

    afterAll(async () => {
      if (!dono) return;
      for (const t of [
        'app.auditoria',
        'app.preferencia_membro',
        'app.atribuicao_escopo',
        'app.membro',
      ]) {
        await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
      }
      await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
      await dono.query(`delete from auth.users where id = any($1::uuid[])`, [
        [U.admin, U.semPapel],
      ]);
      await dono.end();
    });

    it('sem escolha do membro: o idioma e a moeda do tenant vencem o navegador', async () => {
      const r = await GET(req('GET', tokenAdmin));
      expect(r.status).toBe(200);
      const p = (await r.json()) as Resposta;
      expect(p).toMatchObject({ idioma: 'es', formatoRegional: 'es-419', moeda: 'CLP' });
      expect(p.gravadas).toEqual({ idioma: null, formatoRegional: null, fuso: null });
    });

    it('o membro grava outro idioma e a resposta já troca; auditoria sem hotel', async () => {
      const r = await PUT(
        req('PUT', tokenAdmin, { idioma: 'fr', formatoRegional: 'fr-CA', fuso: 'America/Toronto' }),
      );
      expect(r.status).toBe(200);
      expect((await r.json()) as Resposta).toMatchObject({
        idioma: 'fr',
        formatoRegional: 'fr-CA',
        fuso: 'America/Toronto',
      });
      const lido = (await (await GET(req('GET', tokenAdmin))).json()) as Resposta;
      expect(lido.idioma).toBe('fr');
      const { rows } = await dono.query(
        `select hotel_id, acao from app.auditoria
       where tenant_id = $1 and entidade = 'preferencia_membro' and registro_id = $2`,
        [TENANT, U.admin],
      );
      expect(rows).toEqual([{ hotel_id: null, acao: 'gravar' }]);
    });

    it('gravar de novo substitui (nulo volta a herdar do tenant)', async () => {
      const r = await PUT(
        req('PUT', tokenAdmin, { idioma: null, formatoRegional: null, fuso: null }),
      );
      expect(((await r.json()) as Resposta).idioma).toBe('es');
    });

    it('membro sem papel de escrita grava o próprio idioma e audita (autoauditoria)', async () => {
      const r = await PUT(
        req('PUT', tokenSemPapel, { idioma: 'en', formatoRegional: null, fuso: null }),
      );
      expect(r.status).toBe(200);
      expect(((await r.json()) as Resposta).idioma).toBe('en');
      // Cada um só vê a própria: o admin continua com a dele (herdada).
      expect(((await (await GET(req('GET', tokenAdmin))).json()) as Resposta).idioma).toBe('es');
    });

    it('fuso inválido: 422 fuso_invalido, recusado pela aplicação', async () => {
      const r = await PUT(
        req('PUT', tokenAdmin, { idioma: null, formatoRegional: null, fuso: 'America/Atlantida' }),
      );
      expect(r.status).toBe(422);
      const corpo = (await r.json()) as { erro: { codigo: string; parametros: unknown } };
      expect(corpo.erro.codigo).toBe('fuso_invalido');
    });

    it('idioma fora da lista: 422 entrada_invalida, pelo contrato', async () => {
      const r = await PUT(
        req('PUT', tokenAdmin, { idioma: 'de', formatoRegional: null, fuso: null }),
      );
      expect(r.status).toBe(422);
      expect(((await r.json()) as { erro: { codigo: string } }).erro.codigo).toBe(
        'entrada_invalida',
      );
    });
  },
);
