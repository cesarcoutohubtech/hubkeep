// B5 (docs/11): /auth/confirmar aceita só o convite até a fase 1c. A recusa
// vem antes de qualquer chamada ao Supabase, por isso este teste não precisa
// de banco nem de Auth. O convite, que segue aceito, está no teste de
// integração (autenticacao.test.ts).
import { describe, expect, it } from 'vitest';
import { GET as confirmar } from '../src/app/auth/confirmar/route';

const BASE = 'https://app.hubkeep.test';
const pedir = (tipo: string) =>
  confirmar(new Request(`${BASE}/auth/confirmar?token_hash=abc&type=${tipo}`));

describe('/auth/confirmar até a fase 1c', () => {
  it.each(['recovery', 'magiclink', 'signup', 'email_change', 'outro'])(
    'o link de %s cai no login com link_invalido',
    async (tipo) => {
      const r = await pedir(tipo);
      expect(r.status).toBe(307);
      expect(r.headers.get('location')).toBe(`${BASE}/login?erro=link_invalido`);
    },
  );
});
