// Aceite da F0-05 contra o Supabase do runner (Auth + Mailpit + banco reais):
//
//   convite → e-mail no Mailpit → link aberto em /auth/confirmar → sessão em
//   cookie → API por cookie e por Bearer, com o tenant escolhido por cookie.
//
// "Usuário convidado entra e vê só o próprio tenant; trocar o cookie de tenant
// para outro não mostra nada." Mais: token forjado é recusado, quem não pode
// convidar é barrado ANTES de o e-mail sair, e reconvite não duplica membro.
//
// A secret key não aparece aqui (tests/secret-key-so-no-auth-admin.test.ts): o
// primeiro admin é semeado no banco pelo dono, e o convite passa pela rota,
// que usa @hubkeep/auth-admin como em produção.
import { randomUUID } from 'node:crypto';
import { ROTAS } from '@hubkeep/contratos';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as convidar } from '../src/app/api/v1/convites/route';
import { GET as hoteis } from '../src/app/api/v1/hoteis/route';
import { GET as sessao } from '../src/app/api/v1/sessao/route';
import { GET as openapi } from '../src/app/api/interno/openapi/route';
import { GET as confirmar } from '../src/app/auth/confirmar/route';
import { processarOutboxDoTenant } from '../src/servidor/composicao';

const URL_SUPABASE = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const CHAVE_PUBLICA = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
const URL_DONO = process.env['HK_TESTE_URL_DONO'];
const URL_MAILPIT = process.env['HK_MAILPIT_URL'];
const temAmbiente = Boolean(
  URL_SUPABASE && CHAVE_PUBLICA && URL_DONO && URL_MAILPIT && process.env['DATABASE_URL_APP'],
);
if (!temAmbiente && process.env['HK_EXIGIR_BANCO'] === '1') {
  throw new Error(
    'HK_EXIGIR_BANCO=1, mas falta o ambiente do Supabase local (URL, chave, banco, Mailpit).',
  );
}
const exigir = (v: string | undefined): string => {
  if (!v) throw new Error('variável de teste ausente');
  return v;
};

const SITE = 'http://127.0.0.1:3000';
const sufixo = randomUUID().slice(0, 8);
const A = { tenant: randomUUID(), hotel: randomUUID(), admin: randomUUID(), tecnico: randomUUID() };
const B = { tenant: randomUUID(), hotel: randomUUID() };
const email = {
  admin: `admin-${sufixo}@hubkeep.test`,
  tecnico: `tecnico-${sufixo}@hubkeep.test`,
  convidado: `convidado-${sufixo}@hubkeep.test`,
  barrado: `barrado-${sufixo}@hubkeep.test`,
  outroTenant: `outro-tenant-${sufixo}@hubkeep.test`,
  simultaneo: `simultaneo-${sufixo}@hubkeep.test`,
};
const SENHA = `Senha-de-teste-${sufixo}`;

// ---------------------------------------------------------------------------
const req = (
  caminho: string,
  init: { metodo?: string; cabecalhos?: Record<string, string>; corpo?: unknown } = {},
) =>
  new Request(`${SITE}${caminho}`, {
    method: init.metodo ?? 'GET',
    headers: { 'content-type': 'application/json', ...init.cabecalhos },
    ...(init.corpo === undefined ? {} : { body: JSON.stringify(init.corpo) }),
  });

async function mensagensPara(para: string): Promise<{ ID: string }[]> {
  const r = await fetch(
    `${exigir(URL_MAILPIT)}/api/v1/search?query=${encodeURIComponent(`to:"${para}"`)}`,
  );
  return ((await r.json()) as { messages?: { ID: string }[] }).messages ?? [];
}

async function linkDoConvite(para: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const [m] = await mensagensPara(para);
    if (m) {
      const r = await fetch(`${exigir(URL_MAILPIT)}/api/v1/message/${m.ID}`);
      const html = ((await r.json()) as { HTML: string }).HTML;
      const href = /href="([^"]*token_hash=[^"]*)"/.exec(html)?.[1];
      if (!href) throw new Error('e-mail de convite sem link com token_hash');
      return href.replaceAll('&amp;', '&');
    }
    await new Promise((ok) => setTimeout(ok, 300));
  }
  throw new Error(`nenhum e-mail para ${para} no Mailpit`);
}

/** Cookies "nome=valor" de um Set-Cookie, prontos para um cabeçalho Cookie. */
const cookiesDe = (r: Response) => r.headers.getSetCookie().map((c) => c.split(';')[0] ?? '');

function tokenDoCookie(cookies: string[]): string {
  const partes = cookies
    .filter((c) => /^sb-.*-auth-token/.test(c))
    .sort()
    .map((c) => c.slice(c.indexOf('=') + 1));
  const bruto = decodeURIComponent(partes.join(''));
  const json = bruto.startsWith('base64-')
    ? Buffer.from(bruto.slice(7), 'base64url').toString()
    : bruto;
  return (JSON.parse(json) as { access_token: string }).access_token;
}

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

// ---------------------------------------------------------------------------
describe.skipIf(!temAmbiente)('F0-05 — convite, sessão e tenant ativo', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let tokenAdmin = '';
  let tokenTecnico = '';
  let cookiesConvidado: string[] = [];
  let idConvidado = '';

  const semearUsuario = async (id: string, mail: string, tenants: string[]) => {
    await dono.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change_token_new, email_change)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
         extensions.crypt($3, extensions.gen_salt('bf')), now(),
         $4::jsonb, '{}'::jsonb, now(), now(), '', '', '', '')`,
      [
        id,
        mail,
        SENHA,
        JSON.stringify({ provider: 'email', providers: ['email'], hk_tenants: tenants }),
      ],
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
    if (error || !data.session) throw new Error(`login de ${mail} falhou: ${error?.message}`);
    return data.session.access_token;
  };

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: exigir(URL_DONO) });
    await dono.connect();
    for (const [t, nome, hotel] of [
      [A.tenant, `Grupo A ${sufixo}`, A.hotel],
      [B.tenant, `Grupo B ${sufixo}`, B.hotel],
    ] as const) {
      await dono.query(`insert into app.tenant (id, nome) values ($1, $2)`, [t, nome]);
      await dono.query(
        `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, $3, 'America/Sao_Paulo', 'ativo')`,
        [hotel, t, `Hotel de ${nome}`],
      );
    }
    await semearUsuario(A.admin, email.admin, [A.tenant]);
    await semearUsuario(A.tecnico, email.tecnico, [A.tenant]);
    for (const [u, mail, papel, escopo, hotel] of [
      [A.admin, email.admin, 'admin_grupo', 'grupo', null],
      [A.tecnico, email.tecnico, 'tecnico', 'hotel', A.hotel],
    ] as const) {
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
        [A.tenant, u, mail, mail],
      );
      await dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), A.tenant, u, papel, escopo, hotel, A.admin],
      );
    }
    tokenAdmin = await entrar(email.admin);
    tokenTecnico = await entrar(email.tecnico);
  });

  afterAll(async () => {
    if (!dono) return;
    const tenants = [A.tenant, B.tenant];
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = any($1::uuid[])`, [tenants]);
    }
    await dono.query(`delete from app.tenant where id = any($1::uuid[])`, [tenants]);
    await dono.query(`delete from auth.users where email = any($1::text[])`, [
      Object.values(email),
    ]);
    await dono.end();
  });

  it('quem não pode convidar é barrado antes de o e-mail sair', async () => {
    const r = await convidar(
      req('/api/v1/convites', {
        metodo: 'POST',
        cabecalhos: { authorization: `Bearer ${tokenTecnico}`, 'x-hubkeep-tenant': A.tenant },
        corpo: { email: email.barrado, nome: 'Barrado', papel: 'tecnico', hotelId: A.hotel },
      }),
    );
    expect(r.status).toBe(403);
    // F0-07: código e parâmetros, sem frase, com o request_id do cabeçalho.
    const corpo = (await r.json()) as { erro: Record<string, unknown> };
    expect(Object.keys(corpo.erro).sort()).toEqual(['codigo', 'parametros', 'requestId']);
    expect(corpo.erro['codigo']).toBe('concessao_so_admin_ou_implantador');
    expect(corpo.erro['requestId']).toBe(r.headers.get('x-request-id'));
    await new Promise((ok) => setTimeout(ok, 1000));
    expect(await mensagensPara(email.barrado)).toEqual([]);
  });

  it('pedido inválido pela regra do domínio é recusado antes de o e-mail sair (F0-06)', async () => {
    // Implantador sem validade: a regra recusa com mensagem clara, sem criar
    // usuário no Auth e sem convite.
    const r = await convidar(
      req('/api/v1/convites', {
        metodo: 'POST',
        cabecalhos: { authorization: `Bearer ${tokenAdmin}`, 'x-hubkeep-tenant': A.tenant },
        corpo: { email: email.barrado, nome: 'Barrado', papel: 'implantador', hotelId: A.hotel },
      }),
    );
    expect(r.status).toBe(422);
    expect(((await r.json()) as { erro: { codigo: string } }).erro.codigo).toBe(
      'implantador_exige_hotel_e_validade',
    );
    await new Promise((ok) => setTimeout(ok, 1000));
    expect(await mensagensPara(email.barrado)).toEqual([]);
  });

  it('convite para hotel de outro tenant: 404, sem usuário no Auth e sem evento (ADR-018)', async () => {
    const r = await convidar(
      req('/api/v1/convites', {
        metodo: 'POST',
        cabecalhos: { authorization: `Bearer ${tokenAdmin}`, 'x-hubkeep-tenant': A.tenant },
        corpo: {
          email: email.outroTenant,
          nome: 'Outro',
          papel: 'gerente_hotel',
          hotelId: B.hotel,
        },
      }),
    );
    expect(r.status).toBe(404);
    const auth = await dono.query(`select count(*)::int as n from auth.users where email = $1`, [
      email.outroTenant,
    ]);
    expect(auth.rows[0]).toEqual({ n: 0 });
    const ev = await dono.query(
      `select count(*)::int as n from app.evento_dominio where payload->>'email' = $1`,
      [email.outroTenant],
    );
    expect(ev.rows[0]).toEqual({ n: 0 });
  });

  it('convite válido: 201 com acesso gravado e evento pendente — e nenhum e-mail ainda', async () => {
    const r = await convidar(
      req('/api/v1/convites', {
        metodo: 'POST',
        cabecalhos: { authorization: `Bearer ${tokenAdmin}`, 'x-hubkeep-tenant': A.tenant },
        corpo: {
          email: email.convidado,
          nome: 'Convidada',
          papel: 'gerente_hotel',
          hotelId: A.hotel,
        },
      }),
    );
    expect(r.status).toBe(201);
    idConvidado = ((await r.json()) as { usuarioId: string }).usuarioId;

    const ev = await dono.query(
      `select tipo, processado_em from app.evento_dominio where tenant_id = $1 and registro_id = $2`,
      [A.tenant, idConvidado],
    );
    expect(ev.rows).toEqual([{ tipo: 'membro.convidado', processado_em: null }]);
    await new Promise((ok) => setTimeout(ok, 1000));
    expect(await mensagensPara(email.convidado)).toEqual([]);

    // Reconvite de quem já é membro: 409, sem tocar no Auth nem gerar evento.
    const deNovo = await convidar(
      req('/api/v1/convites', {
        metodo: 'POST',
        cabecalhos: { authorization: `Bearer ${tokenAdmin}`, 'x-hubkeep-tenant': A.tenant },
        corpo: { email: email.convidado, nome: 'Convidada', papel: 'tecnico', hotelId: A.hotel },
      }),
    );
    expect(deNovo.status).toBe(409);
  });

  it('o convite grava membro, papel, auditoria e evento na unit of work de quem convidou', async () => {
    const m = await dono.query(
      `select nome from app.membro where tenant_id = $1 and usuario_id = $2`,
      [A.tenant, idConvidado],
    );
    const a = await dono.query(
      `select papel, escopo_tipo, hotel_id, concedido_por from app.atribuicao_escopo
       where tenant_id = $1 and usuario_id = $2`,
      [A.tenant, idConvidado],
    );
    const aud = await dono.query(
      `select entidade, usuario_id from app.auditoria where tenant_id = $1 and registro_id = $2`,
      [A.tenant, idConvidado],
    );
    const ev = await dono.query(
      `select tipo, payload->>'email' as email, payload->>'redirecionarPara' as destino
       from app.evento_dominio where tenant_id = $1 and registro_id = $2`,
      [A.tenant, idConvidado],
    );
    expect(m.rows).toEqual([{ nome: 'Convidada' }]);
    expect(a.rows).toEqual([
      { papel: 'gerente_hotel', escopo_tipo: 'hotel', hotel_id: A.hotel, concedido_por: A.admin },
    ]);
    expect(aud.rows).toEqual([{ entidade: 'membro', usuario_id: A.admin }]);
    expect(ev.rows).toEqual([
      { tipo: 'membro.convidado', email: email.convidado, destino: `${SITE}/auth/confirmar` },
    ]);
  });

  it('o worker processa o evento e só então o e-mail sai; segunda rodada não reenvia', async () => {
    expect(await processarOutboxDoTenant(A.tenant)).toEqual({ processados: 1, falhas: 0 });
    const ev = await dono.query(
      `select processado_em is not null as processado, tentativas from app.evento_dominio
       where tenant_id = $1 and registro_id = $2`,
      [A.tenant, idConvidado],
    );
    expect(ev.rows).toEqual([{ processado: true, tentativas: 0 }]);
    expect(await linkDoConvite(email.convidado)).toContain('token_hash=');
    expect(await processarOutboxDoTenant(A.tenant)).toEqual({ processados: 0, falhas: 0 });
  });

  it('o convidado abre o link do e-mail e sai com sessão em cookie', async () => {
    const link = await linkDoConvite(email.convidado);
    expect(link.startsWith(`${SITE}/auth/confirmar?`)).toBe(true);

    const r = await confirmar(new Request(link));
    expect(r.status).toBe(307);
    expect(r.headers.get('location')).toBe(`${SITE}/definir-senha`);
    cookiesConvidado = cookiesDe(r);
    expect(cookiesConvidado.some((c) => /^sb-.*-auth-token/.test(c))).toBe(true);

    const s = await sessao(
      req('/api/v1/sessao', { cabecalhos: { cookie: cookiesConvidado.join('; ') } }),
    );
    expect(s.status).toBe(200);
    expect(await s.json()).toMatchObject({ usuarioId: idConvidado, tenants: [A.tenant] });
  });

  it('por cookie: vê só o próprio tenant; trocar o cookie de tenant não mostra nada', async () => {
    const comTenant = (t: string) =>
      hoteis(
        req('/api/v1/hoteis', {
          cabecalhos: { cookie: [...cookiesConvidado, `hk_tenant=${t}`].join('; ') },
        }),
      );

    const noProprio = await comTenant(A.tenant);
    expect(noProprio.status).toBe(200);
    expect(
      ((await noProprio.json()) as { hoteis: { id: string }[] }).hoteis.map((h) => h.id),
    ).toEqual([A.hotel]);

    const noOutro = await comTenant(B.tenant);
    expect(noOutro.status).toBe(200);
    expect(((await noOutro.json()) as { hoteis: unknown[] }).hoteis).toEqual([]);
  });

  it('por Bearer (como o PWA): mesmo recorte', async () => {
    const token = tokenDoCookie(cookiesConvidado);
    const r = await hoteis(
      req('/api/v1/hoteis', {
        cabecalhos: { authorization: `Bearer ${token}`, 'x-hubkeep-tenant': A.tenant },
      }),
    );
    expect(((await r.json()) as { hoteis: { id: string }[] }).hoteis.map((h) => h.id)).toEqual([
      A.hotel,
    ]);
  });

  it('token forjado, sem assinatura ou ausente é recusado com 401', async () => {
    const [cabecalho, , assinatura] = tokenAdmin.split('.');
    const casos: [string, Record<string, string>][] = [
      // Payload trocado (sub de outro usuário) mantendo a assinatura original.
      [
        'payload adulterado',
        {
          authorization: `Bearer ${cabecalho}.${b64url({ sub: idConvidado, role: 'authenticated', aud: 'authenticated' })}.${assinatura}`,
        },
      ],
      // alg "none": sem assinatura nenhuma.
      [
        'alg none',
        {
          authorization: `Bearer ${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: A.admin, role: 'authenticated' })}.`,
        },
      ],
      ['sem token', {}],
      ['Authorization malformado', { authorization: 'Token abc' }],
    ];
    for (const [nome, cabecalhos] of casos) {
      const r = await hoteis(
        req('/api/v1/hoteis', { cabecalhos: { ...cabecalhos, 'x-hubkeep-tenant': A.tenant } }),
      );
      expect(r.status, nome).toBe(401);
    }
  });

  it('sem tenant, a API pede o tenant em vez de adivinhar', async () => {
    const r = await hoteis(
      req('/api/v1/hoteis', { cabecalhos: { authorization: `Bearer ${tokenAdmin}` } }),
    );
    expect(r.status).toBe(400);
  });

  it('dois convites simultâneos para a mesma pessoa: um 201, outro 409, um usuário e um acesso', async () => {
    // Os dois passam pela checagem de membro antes de qualquer commit; o Auth e
    // a chave primária de app.membro decidem quem fica. Quem perde não pode
    // apagar o usuário que o outro gravou (compensação, ADR-018).
    const pedir = () =>
      convidar(
        req('/api/v1/convites', {
          metodo: 'POST',
          cabecalhos: { authorization: `Bearer ${tokenAdmin}`, 'x-hubkeep-tenant': A.tenant },
          corpo: {
            email: email.simultaneo,
            nome: 'Simultânea',
            papel: 'tecnico',
            hotelId: A.hotel,
          },
        }),
      );
    const respostas = await Promise.all([pedir(), pedir()]);
    expect(respostas.map((r) => r.status).sort()).toEqual([201, 409]);

    const [ganhou, perdeu] = respostas[0]?.status === 201 ? respostas : [...respostas].reverse();
    const { usuarioId } = (await ganhou?.json()) as { usuarioId: string };
    expect(((await perdeu?.json()) as { erro: { codigo: string } }).erro.codigo).toBe(
      'ja_e_membro',
    );

    const auth = await dono.query(`select id from auth.users where email = $1`, [email.simultaneo]);
    expect(auth.rows).toEqual([{ id: usuarioId }]);
    const membro = await dono.query(
      `select usuario_id from app.membro where tenant_id = $1 and email = $2`,
      [A.tenant, email.simultaneo],
    );
    expect(membro.rows).toEqual([{ usuario_id: usuarioId }]);
    const papeis = await dono.query(
      `select count(*)::int as n from app.atribuicao_escopo where tenant_id = $1 and usuario_id = $2`,
      [A.tenant, usuarioId],
    );
    expect(papeis.rows[0]).toEqual({ n: 1 });
    const ev = await dono.query(
      `select count(*)::int as n from app.evento_dominio
       where tenant_id = $1 and tipo = 'membro.convidado' and registro_id = $2`,
      [A.tenant, usuarioId],
    );
    expect(ev.rows[0]).toEqual({ n: 1 });
  });

  it('F0-07: OpenAPI na rota interna, só com sessão válida', async () => {
    const semSessao = await openapi(req('/api/interno/openapi'));
    expect(semSessao.status).toBe(401);
    expect(((await semSessao.json()) as { erro: { codigo: string } }).erro.codigo).toBe(
      'nao_autenticado',
    );

    const comSessao = await openapi(
      req('/api/interno/openapi', { cabecalhos: { authorization: `Bearer ${tokenAdmin}` } }),
    );
    expect(comSessao.status).toBe(200);
    const doc = (await comSessao.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe('3.1.0');
    // Exatamente as rotas declaradas em packages/contratos (ROTAS): nenhuma a
    // mais nem a menos no documento servido.
    expect(Object.keys(doc.paths).sort()).toEqual([...new Set(ROTAS.map((r) => r.caminho))].sort());
  });

  it('F0-07: entrada fora do contrato vira 422 entrada_invalida, antes do caso de uso', async () => {
    const r = await convidar(
      req('/api/v1/convites', {
        metodo: 'POST',
        cabecalhos: { authorization: `Bearer ${tokenAdmin}`, 'x-hubkeep-tenant': A.tenant },
        corpo: { email: 'nao-e-email', nome: 'X', papel: 'tecnico' },
      }),
    );
    expect(r.status).toBe(422);
    const { erro } = (await r.json()) as {
      erro: { codigo: string; parametros: { problemas: { campo: string }[] } };
    };
    expect(erro.codigo).toBe('entrada_invalida');
    expect(erro.parametros.problemas.map((p) => p.campo)).toEqual(['email']);
  });
});
