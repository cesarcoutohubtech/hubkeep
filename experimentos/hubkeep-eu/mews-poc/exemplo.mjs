import { criarEscopo, montarProjecao } from './normalizacao.mjs';

const escopo = criarEscopo({ tenantId: 'tenant-ficticio', vinculos: [{ enterpriseId: 'mews-hotel-1', hotelId: 'hotel-hubkeep-1' }] });
const recursos = [
  { Id: 'quarto-101', EnterpriseId: 'mews-hotel-1', Name: '101', IsActive: true,
    State: 'Dirty', UpdatedUtc: '2026-10-15T10:00:00Z', Data: { Discriminator: 'Space', Value: { FloorNumber: '1' } } },
  { Id: 'cama-101', EnterpriseId: 'mews-hotel-1', Name: 'Cama A', IsActive: true,
    State: 'Clean', Data: { Discriminator: 'Object', Value: {} } },
];
const bloqueios = [
  { Id: 'block-1', EnterpriseId: 'mews-hotel-1', AssignedResourceId: 'quarto-101',
    Type: 'OutOfOrder', IsActive: true, StartUtc: '2026-10-15T11:00:00Z',
    EndUtc: '2026-10-16T11:00:00Z', UpdatedUtc: '2026-10-15T09:00:00Z',
    Notes: 'Ignorar: campo livre potencialmente pessoal' },
];
globalThis.console.log(JSON.stringify(montarProjecao(escopo, recursos, bloqueios), null, 2));
