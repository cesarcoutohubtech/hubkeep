// Funções puras do pré-voo Mews: sem SQL, rede, credenciais ou banco.
export const LIMITE_CANDIDATOS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rotulo(valor) {
  return String(valor ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 75);
}

/** Não divulga EnterpriseId/credencial_ref, mesmo se existir vínculo. */
export function formatarCandidatoMews(row) {
  if (!row || !UUID.test(row.hotel_id) || !UUID.test(row.tenant_id) ||
      typeof row.hotel !== 'string' || typeof row.grupo !== 'string' ||
      typeof row.status !== 'string' ||
      typeof row.hotel_ficticio !== 'boolean' ||
      typeof row.possui_vinculo !== 'boolean' ||
      typeof row.vinculo_ativo !== 'boolean') {
    throw new Error('mews_candidato_invalido');
  }
  const elegivel = row.hotel_ficticio === true &&
    row.status === 'ativo' && row.possui_vinculo === false;
  return Object.freeze({
    elegivel,
    linhas: Object.freeze([
      `Grupo: ${rotulo(row.grupo)}`,
      `Hotel: ${rotulo(row.hotel)}`,
      `tenant_id: ${row.tenant_id}`,
      `hotel_id: ${row.hotel_id}`,
      `Status: ${rotulo(row.status)}`,
      `Vínculo Mews: ${row.vinculo_ativo ? 'ativo' :
        row.possui_vinculo ? 'existente (não ativo)' : 'inexistente'}`,
      `Candidato: ${elegivel ? 'SIM, sujeito à seleção humana' : 'NÃO, exige revisão'}`,
    ]),
  });
}
