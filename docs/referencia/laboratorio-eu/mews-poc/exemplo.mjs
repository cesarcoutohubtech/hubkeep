import { criarEscopo, montarProjecao } from './normalizacao.mjs';

const escopo = criarEscopo({ tenantId: 'demo-tenant', vinculos: [
  { enterpriseId: 'demo-enterprise', hotelId: 'hotel-demo' },
] });
const recursos = [{
  Id: 'resource-101', EnterpriseId: 'demo-enterprise', Name: '101',
  State: 'Dirty', IsActive: true, UpdatedUtc: '2026-10-15T10:00:00Z',
  Data: { Discriminator: 'Space', Value: { FloorNumber: '1' } },
}];
const bloqueios = [{
  Id: 'block-1', EnterpriseId: 'demo-enterprise', AssignedResourceId: 'resource-101',
  Type: 'OutOfOrder', IsActive: true, StartUtc: '2026-10-15T12:00:00Z',
  EndUtc: '2026-10-16T12:00:00Z', UpdatedUtc: '2026-10-15T10:00:00Z',
}];
globalThis.console.log(JSON.stringify(montarProjecao(escopo, recursos, bloqueios), null, 2));
