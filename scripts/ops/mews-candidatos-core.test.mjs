import test from 'node:test';
import assert from 'node:assert/strict';
import { formatarCandidatoMews, LIMITE_CANDIDATOS } from './mews-candidatos-core.mjs';

const base = {
  hotel_id: 'ca200000-0000-0000-0000-000000000001',
  tenant_id: 'ca100000-0000-0000-0000-000000000001',
  hotel: 'Hotel Demonstração Centro',
  grupo: 'Grupo Demonstração',
  status: 'ativo',
  hotel_ficticio: true,
  possui_vinculo: false,
  vinculo_ativo: false,
};

test('hotel demo ativo sem vinculo e candidato somente a escolha humana', () => {
  const x = formatarCandidatoMews(base);
  assert.equal(x.elegivel, true);
  assert.ok(x.linhas.some((s) => s.includes('SIM, sujeito à seleção humana')));
  assert.equal(Object.isFrozen(x), true);
  assert.equal(Object.isFrozen(x.linhas), true);
  assert.equal(LIMITE_CANDIDATOS, 20);
});

test('hotel inativo nao e elegivel', () => {
  assert.equal(formatarCandidatoMews({ ...base, status: 'implantacao' }).elegivel, false);
});

test('hotel com vinculo ativo nunca e elegivel', () => {
  const x = formatarCandidatoMews({ ...base, possui_vinculo: true, vinculo_ativo: true });
  assert.equal(x.elegivel, false);
  assert.ok(x.linhas.some((s) => s.includes('Vínculo Mews: ativo')));
});

test('vinculo revogado nao autoriza substituicao silenciosa', () => {
  const x = formatarCandidatoMews({ ...base, possui_vinculo: true });
  assert.equal(x.elegivel, false);
  assert.ok(x.linhas.some((s) => s.includes('existente (não ativo)')));
});

test('grupo demo sozinho nao classifica hotel como ficticio', () => {
  assert.equal(formatarCandidatoMews({ ...base, hotel_ficticio: false }).elegivel, false);
});

test('identificadores UUID malformados sao recusados', () => {
  assert.throws(() => formatarCandidatoMews({ ...base, hotel_id: 'abc' }),
    /mews_candidato_invalido/);
  assert.throws(() => formatarCandidatoMews({ ...base, tenant_id: null }),
    /mews_candidato_invalido/);
});

test('tipos indevidos de flags sao recusados sem coerção', () => {
  assert.throws(() => formatarCandidatoMews({ ...base, possui_vinculo: 'false' }),
    /mews_candidato_invalido/);
});

test('retorno so mostra identificadores internos, sem credencial ou EnterpriseId', () => {
  const resultado = formatarCandidatoMews({
    ...base,
    grupo: 'Grupo\nseguro',
    hotel: 'Hotel\rDemo',
    enterprise_id: 'ENTERPRISE-SEGREDO',
    credencial_ref: 'vault:segredo',
    email: 'admin@exemplo.test',
  });
  const texto = resultado.linhas.join('\n');
  for (const proibido of ['ENTERPRISE-SEGREDO', 'vault:segredo', 'admin@exemplo.test']) {
    assert.equal(texto.includes(proibido), false);
  }
  assert.ok(texto.includes('Grupo seguro'));
  assert.ok(texto.includes('Hotel Demo'));
});
