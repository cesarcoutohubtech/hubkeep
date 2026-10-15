import test from 'node:test';
import assert from 'node:assert/strict';
import { criarClienteMews, ErroMews } from './client.mjs';
import { chaveMews, criarEscopo, normalizarEspaco, normalizarBloqueio, montarProjecao } from './normalizacao.mjs';

const token = { clientToken: 'segredo-cliente', accessToken: 'segredo-acesso', minIntervalMs: 0 };
const resp = (json, status = 200, headers = {}) => new Response(JSON.stringify(json), { status, headers });
const escopo = criarEscopo({ tenantId: 'tenantA', vinculos: [
  { enterpriseId: 'empresaA', hotelId: 'hotelA' },
  { enterpriseId: 'empresaB', hotelId: 'hotelB' },
] });
const space = (Id, EnterpriseId = 'empresaA', extras = {}) => ({
  Id, EnterpriseId, Name: '101', IsActive: true, State: 'Dirty', UpdatedUtc: '2026-10-15T10:00:00Z',
  Data: { Discriminator: 'Space', Value: { FloorNumber: '1' } }, ...extras,
});
const block = (Id, EnterpriseId = 'empresaA', AssignedResourceId = 'quarto1', extras = {}) => ({
  Id, EnterpriseId, AssignedResourceId, IsActive: true, Type: 'OutOfOrder',
  StartUtc: '2026-10-15T10:00:00Z', EndUtc: '2026-10-16T10:00:00Z',
  UpdatedUtc: '2026-10-15T11:00:00Z', Notes: 'e-mail pessoal@exemplo.com', ...extras,
});

test('nega chamadas sem credenciais', () => {
  assert.throws(() => criarClienteMews({ clientToken: 'a' }), /credenciais_demo_obrigatorias/);
});
test('nega produção e URLs arbitrárias', () => {
  assert.throws(() => criarClienteMews({ ...token, baseUrl: 'https://api.mews.com' }), /somente_ambiente_demo/);
  assert.throws(() => criarClienteMews({ ...token, baseUrl: 'https://example.com' }), /somente_ambiente_demo/);
});
test('nega configuração inválida e filtros que sobrescrevem tokens', async () => {
  assert.throws(() => criarClienteMews({ ...token, pageSize: 0 }), /configuracao_invalida/);
  const c = criarClienteMews({ ...token, fetchImpl: async () => resp({ Enterprises: [] }) });
  await assert.rejects(c.listarEmpresas({ ClientToken: 'forjado' }), /filtros_reservados/);
  assert.throws(() => c.listarRecursos([]), /enterprise_ids_obrigatorios/);
});
test('somente endpoints getAll em POST com autenticação no corpo', async () => {
  const chamadas = [];
  const c = criarClienteMews({ ...token, fetchImpl: async (url, req) => {
    chamadas.push({ url, method: req.method, body: JSON.parse(req.body) });
    return resp({ Enterprises: [{ Id: 'empresaA' }] });
  } });
  assert.deepEqual(await c.listarEmpresas(), [{ Id: 'empresaA' }]);
  assert.deepEqual(chamadas[0].url, 'https://api.mews-demo.com/api/connector/v1/enterprises/getAll');
  assert.equal(chamadas[0].method, 'POST');
  assert.equal(chamadas[0].body.ClientToken, token.clientToken);
  assert.equal(chamadas[0].body.AccessToken, token.accessToken);
  assert.deepEqual(chamadas[0].body.Limitation, { Count: 100 });
});
test('paginação cursor usa retorno mesmo com página cheia; termina na página curta', async () => {
  const vistos = [];
  const c = criarClienteMews({ ...token, pageSize: 2, fetchImpl: async (url, req) => {
    const q = JSON.parse(req.body);
    vistos.push(q.Limitation.Cursor);
    if (!q.Limitation.Cursor) return resp({ Resources: [{ Id: '1' }, { Id: '2' }], Cursor: 'pagina2' });
    return resp({ Resources: [{ Id: '3' }], Cursor: 'pagina3' });
  }});
  assert.deepEqual((await c.listarRecursos(['empresaA'])).map(x => x.Id), ['1','2','3']);
  assert.deepEqual(vistos, [undefined, 'pagina2']);
});
test('não repete cursor, nem roda páginas sem fim', async () => {
  const c = criarClienteMews({ ...token, pageSize: 1, maxPages: 3,
    fetchImpl: async () => resp({ Enterprises: [{ Id: 'x' }], Cursor: 'mesmo' }) });
  await assert.rejects(c.listarEmpresas(), /cursor_repetido/);
});
test('limita máximo de páginas', async () => {
  let i = 0;
  const c = criarClienteMews({ ...token, pageSize: 1, maxPages: 2,
    fetchImpl: async () => resp({ Enterprises: [{ Id: 'x' }], Cursor: 'cursor' + (++i) }) });
  await assert.rejects(c.listarEmpresas(), /limite_paginas_excedido/);
});
test('429 respeita Retry-After, usa só POST e depois recupera', async () => {
  const duracoes = [];
  let chamadas = 0;
  const c = criarClienteMews({ ...token, sleep: async (ms) => duracoes.push(ms),
    fetchImpl: async () => ++chamadas === 1
      ? resp({ Error: 'slow' }, 429, { 'retry-after': '2' })
      : resp({ Enterprises: [] }) });
  assert.deepEqual(await c.listarEmpresas(), []);
  assert.equal(chamadas, 2);
  assert.deepEqual(duracoes, [2000]);
});
test('5xx com retry esgotado retorna código sem corpo e sem tokens', async () => {
  const c = criarClienteMews({ ...token, maxRetries: 1, sleep: async () => {},
    fetchImpl: async () => resp({ Error: 'segredo-acesso' }, 500) });
  await assert.rejects(c.listarEmpresas(), (e) => {
    assert.ok(e instanceof ErroMews);
    assert.equal(e.status, 500);
    assert.ok(!JSON.stringify(e).includes('segredo'));
    return true;
  });
});
test('falha de rede não vaza token', async () => {
  const c = criarClienteMews({ ...token, maxRetries: 0,
    fetchImpl: async () => { throw new Error('url com token segredo-acesso'); } });
  await assert.rejects(c.listarEmpresas(), (e) => e.codigo === 'rede_indisponivel' && !e.message.includes('segredo'));
});
test('401 é recusado sem tentar usar token no log', async () => {
  const c = criarClienteMews({ ...token, fetchImpl: async () => resp({ erro: 'segredo' }, 401) });
  await assert.rejects(c.listarEmpresas(), (e) => e.codigo === 'requisicao_recusada' && e.status === 401);
});
test('resposta malformada é falha fechada', async () => {
  const c = criarClienteMews({ ...token, fetchImpl: async () => resp({ Algo: [] }) });
  await assert.rejects(c.listarEmpresas(), /lista_ausente/);
});
test('resources usa extensão e blocos incluem excluídos; somente leitura', async () => {
  const a = [];
  const c = criarClienteMews({ ...token, fetchImpl: async (url, init) => {
    a.push({ url, body: JSON.parse(init.body) });
    return resp(url.includes('resourceBlocks/') ? { ResourceBlocks: [] } : { Resources: [] });
  } });
  await c.listarRecursos(['empresaA']);
  await c.listarBloqueios(['empresaA']);
  assert.deepEqual(a[0].body.Extent, { Resources: true, Inactive: true });
  assert.deepEqual(a[1].body.ActivityStates, ['Active', 'Deleted']);
  assert.ok(a.every(x => x.url.endsWith('/getAll')));
});
test('normalização descarta não-Space, propriedade desconhecida e sem nome', () => {
  assert.equal(normalizarEspaco(escopo, space('obj', 'empresaA', { Data: { Discriminator: 'Object' } })), null);
  assert.equal(normalizarEspaco(escopo, space('x', 'empresaC')), null);
  assert.equal(normalizarEspaco(escopo, space('x', 'empresaA', { Name: '' })), null);
  assert.ok(normalizarEspaco(escopo, space('x', 'empresaA')));
});
test('mesmo número de quarto em dois hotéis não compartilha chave externa', () => {
  const um = normalizarEspaco(escopo, space('quarto1', 'empresaA'));
  const dois = normalizarEspaco(escopo, space('quarto1', 'empresaB'));
  assert.equal(um.nome, dois.nome);
  assert.notEqual(um.codigoExterno, dois.codigoExterno);
  assert.notEqual(um.hotelId, dois.hotelId);
});
test('outro tenant não recebe espaços nem bloqueios sem vínculo', () => {
  const outro = criarEscopo({ tenantId: 'tenantB', vinculos: [{ enterpriseId: 'empresaC', hotelId: 'hotelC' }] });
  const p = montarProjecao(outro, [space('quarto1')], [block('bloco1')]);
  assert.deepEqual(p.espacos, []);
  assert.deepEqual(p.bloqueios, []);
});
test('bloqueio para recurso fora do conjunto autorizado é excluído', () => {
  assert.equal(normalizarBloqueio(escopo, block('bloco1'), new Set()), null);
  assert.ok(normalizarBloqueio(escopo, block('bloco1'), new Set([chaveMews('empresaA','quarto1')])));
});
test('nunca copia notas pessoais e não cria OS nem altera status/licença', () => {
  const p = montarProjecao(escopo, [space('quarto1')], [block('bloco1')]);
  assert.equal(p.espacos.length, 1);
  assert.equal(p.bloqueios.length, 1);
  assert.ok(!JSON.stringify(p).includes('pessoal@'));
  assert.equal(p.espacos[0].podeAlterarStatusLicenca, false);
  assert.equal(p.espacos[0].podeCriarOs, false);
  assert.equal(p.bloqueios[0].podeRegistrarIndisponibilidade, false);
  assert.equal(p.persistiuNoHubKeep, false);
});
test('bloqueio InternalUse não é tratado como falha, block excluído não é removido do HubKeep', () => {
  const p = montarProjecao(escopo, [space('quarto1')], [block('bloco1','empresaA','quarto1',{ Type: 'InternalUse', IsActive: false, DeletedUtc: '2026-10-15T12:00:00Z' })]);
  assert.equal(p.bloqueios[0].tipoBloqueio, 'InternalUse');
  assert.equal(p.bloqueios[0].ativoNoPms, false);
  assert.equal(p.bloqueios[0].podeCriarOs, false);
});
test('se eventos chegam fora de ordem, projeção mantém a versão mais nova', () => {
  const velho = space('quarto1','empresaA',{ State: 'Dirty', UpdatedUtc: '2026-10-13T10:00:00Z' });
  const novo = space('quarto1','empresaA',{ State: 'Clean', UpdatedUtc: '2026-10-15T10:00:00Z' });
  const p = montarProjecao(escopo, [novo, velho, novo], []);
  assert.equal(p.espacos.length, 1);
  assert.equal(p.espacos[0].estadoOperacionalMews, 'Clean');
});
test('vínculo duplicado falha fechado', () => {
  assert.throws(() => criarEscopo({ tenantId: 'T', vinculos: [
    { enterpriseId:'A',hotelId:'1' }, { enterpriseId:'A',hotelId:'2' } ] }), /vinculo_invalido/);
});
test('chaves grandes não cabem no contrato e são recusadas', () => {
  assert.throws(() => chaveMews('a'.repeat(200), 'b'), /identificador_mews_muito_longo/);
});
