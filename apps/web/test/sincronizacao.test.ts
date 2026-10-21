// Aceite da F0-11 (servidor) contra o Supabase do runner: a operação que o PWA
// fez offline é aplicada uma vez só.
//   - reenvio da mesma chave (resposta perdida): 200 com repetida, sem efeito;
//   - dois envios simultâneos da mesma chave: um efeito só;
//   - a mesma chave de outro usuário é outra operação (a chave é por usuário);
//   - operação inválida: 422 e a chave não fica guardada.
// O efeito contado é a auditoria da troca de preferências (uma linha por gravação).
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST } from '../src/app/api/v1/sincronizacao/operacoes/route';
import { elevarParaAal2 } from './segundo-fator-de-teste';

const URL_SUPABASE = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const CHAVE_PUBLICA = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
const URL_DONO = process.env['HK_TESTE_URL_DONO'];
const temAmbiente = Boolean(
  URL_SUPABASE && CHAVE_PUBLICA && URL_DONO && process.env['DATABASE_URL_APP'],
);
if (!temAmbiente && process.env['HK_EXIGIR_BANCO'] === '1') {
  throw new Error(
    'HK_EXIGIR_BANCO=1, mas falta o ambiente do Supabase local para a sincronização.',
  );
}
const exigir = (v: string | undefined): string => {
  if (!v) throw new Error('variável de teste ausente');
  return v;
};

const sufixo = randomUUID().slice(0, 8);
const TENANT = randomUUID();
const U = { a: randomUUID(), b: randomUUID() };
const email = { a: `sinc-a-${sufixo}@hubkeep.test`, b: `sinc-b-${sufixo}@hubkeep.test` };
const SENHA = `Senha-de-teste-${sufixo}`;

const enviar = (token: string, corpo: unknown) =>
  POST(
    new Request('http://127.0.0.1:3000/api/v1/sincronizacao/operacoes', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'x-hubkeep-tenant': TENANT,
      },
      body: JSON.stringify(corpo),
    }),
  );

const operacao = (chave: string, idioma: string, fuso: string | null = null) => ({
  chave,
  tipo: 'preferencias.gravar',
  dados: { idioma, formatoRegional: null, fuso },
});

describe.skipIf(!temAmbiente)(
  'F0-11 — operação offline aplicada uma vez só',
  { timeout: 60_000 },
  () => {
    let dono: pg.Client;
    const token = { a: '', b: '' };

    const auditorias = async (usuario: string) =>
      Number(
        (
          await dono.query(
            `select count(*) as n from app.auditoria
           where tenant_id = $1 and entidade = 'preferencia_membro' and registro_id = $2`,
            [TENANT, usuario],
          )
        ).rows[0].n,
      );

    beforeAll(async () => {
      dono = new pg.Client({ connectionString: exigir(URL_DONO) });
      await dono.connect();
      await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo sincronização')`, [
        TENANT,
      ]);
      for (const [u, mail] of [
        [U.a, email.a],
        [U.b, email.b],
      ] as const) {
        await dono.query(
          `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
           confirmation_token, recovery_token, email_change_token_new, email_change)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
           extensions.crypt($3, extensions.gen_salt('bf')), now(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '')`,
          [u, mail, SENHA],
        );
        await dono.query(
          `insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
         values (gen_random_uuid(), $1::uuid, $1::uuid::text, 'email', $2::jsonb, now(), now())`,
          [u, JSON.stringify({ sub: u, email: mail, email_verified: true })],
        );
        await dono.query(
          `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $3)`,
          [TENANT, u, mail],
        );
      }
      const entrar = async (mail: string) => {
        const cliente = createClient(exigir(URL_SUPABASE), exigir(CHAVE_PUBLICA), {
          auth: { persistSession: false },
        });
        const { data, error } = await cliente.auth.signInWithPassword({
          email: mail,
          password: SENHA,
        });
        if (error || !data.session) throw new Error(`login falhou: ${error?.message}`);
        // SP1: o portão da API pede aal2 a quem tem papel que exige o segundo fator.
        return (await elevarParaAal2(cliente)).access_token;
      };
      token.a = await entrar(email.a);
      token.b = await entrar(email.b);
    });

    afterAll(async () => {
      if (!dono) return;
      for (const t of [
        'app.auditoria',
        'app.operacao_offline',
        'app.preferencia_membro',
        'app.membro',
      ]) {
        await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
      }
      await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
      await dono.query(`delete from auth.users where id = any($1::uuid[])`, [[U.a, U.b]]);
      await dono.end();
    });

    it('primeiro envio aplica (201); reenvio da mesma chave devolve 200 repetida, sem efeito', async () => {
      const chave = randomUUID();
      const r1 = await enviar(token.a, operacao(chave, 'es'));
      expect(r1.status).toBe(201);
      expect(await r1.json()).toEqual({ chave, repetida: false, resposta: { aplicada: true } });
      const r2 = await enviar(token.a, operacao(chave, 'es'));
      expect(r2.status).toBe(200);
      expect(await r2.json()).toEqual({ chave, repetida: true, resposta: { aplicada: true } });
      expect(await auditorias(U.a)).toBe(1);
    });

    it('dois envios simultâneos da mesma chave: um efeito só', async () => {
      const antes = await auditorias(U.a);
      const chave = randomUUID();
      const respostas = await Promise.all([
        enviar(token.a, operacao(chave, 'fr')),
        enviar(token.a, operacao(chave, 'fr')),
      ]);
      const corpos = (await Promise.all(respostas.map((r) => r.json()))) as { repetida: boolean }[];
      expect(respostas.map((r) => r.status).sort()).toEqual([200, 201]);
      expect(corpos.filter((c) => c.repetida)).toHaveLength(1);
      expect(await auditorias(U.a)).toBe(antes + 1);
    });

    it('a mesma chave de outro usuário é outra operação', async () => {
      const chave = randomUUID();
      expect((await enviar(token.a, operacao(chave, 'en'))).status).toBe(201);
      expect((await enviar(token.b, operacao(chave, 'en'))).status).toBe(201);
      expect(await auditorias(U.b)).toBe(1);
    });

    it('operação inválida: 422 e a chave não fica guardada', async () => {
      const chave = randomUUID();
      const r = await enviar(token.a, operacao(chave, 'es', 'America/Atlantida'));
      expect(r.status).toBe(422);
      expect(((await r.json()) as { erro: { codigo: string } }).erro.codigo).toBe('fuso_invalido');
      const { rows } = await dono.query(
        `select 1 from app.operacao_offline where tenant_id = $1 and chave = $2`,
        [TENANT, chave],
      );
      expect(rows).toEqual([]);
    });
  },
);
