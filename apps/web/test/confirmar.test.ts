// B5 (docs/11): /auth/confirmar aceita só os tipos com modelo de e-mail do
// catálogo: o convite e, desde a C9 da comunicação da 1c, a recuperação de
// senha. A recusa dos outros vem antes de qualquer chamada ao Supabase, por
// isso este teste não precisa de banco nem de Auth. O convite e a recuperação,
// que seguem aceitos, estão no teste de integração (autenticacao.test.ts).
import { describe, expect, it } from 'vitest';
import { GET as confirmar } from '../src/app/auth/confirmar/route';

const BASE = 'https://app.hubkeep.test';
const pedir = (tipo: string) =>
  confirmar(new Request(`${BASE}/auth/confirmar?token_hash=abc&type=${tipo}`));

describe('/auth/confirmar só aceita o convite e a recuperação', () => {
  it.each(['magiclink', 'signup', 'email_change', 'outro'])(
    'o link de %s cai no login com link_invalido',
    async (tipo) => {
      const r = await pedir(tipo);
      expect(r.status).toBe(307);
      expect(r.headers.get('location')).toBe(`${BASE}/login?erro=link_invalido`);
    },
  );
});
