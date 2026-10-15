/** Normalização POC sem qualquer persistência, criação de OS ou escrita no PMS. */
const str = (s) =>
  typeof s === 'string' && s.trim().length > 0 ? s.trim() : null;

export function chaveMews(enterpriseId, remoteId) {
  const e = str(enterpriseId);
  const r = str(remoteId);
  if (!e || !r) throw new Error('identificador_mews_invalido');
  // Chave utilizável como ID externo no contrato atual (máximo 200 caracteres).
  const chave = `${e}|${r}`;
  if (chave.length > 200) throw new Error('identificador_mews_muito_longo');
  return chave;
}

/**
 * A lista de vínculos vem do Admin do HubKeep após conferência humana.
 * Sem vínculo explícito, nem mesmo um recurso válido vira candidato ao hotel.
 * @param {{tenantId:string, vinculos:Array<{enterpriseId:string, hotelId:string}>}} entrada
 */
export function criarEscopo(entrada) {
  if (!str(entrada?.tenantId) || !Array.isArray(entrada?.vinculos))
    throw new Error('escopo_invalido');
  const mapa = new Map();
  for (const v of entrada.vinculos) {
    if (!str(v.enterpriseId) || !str(v.hotelId) || mapa.has(v.enterpriseId))
      throw new Error('vinculo_invalido');
    mapa.set(v.enterpriseId, v.hotelId);
  }
  return Object.freeze({ tenantId: entrada.tenantId, hoteis: mapa });
}

export function normalizarEspaco(escopo, recurso) {
  if (!recurso || recurso.Data?.Discriminator !== 'Space') return null;
  if (!str(recurso.Id) || !str(recurso.EnterpriseId) || !str(recurso.Name))
    return null;
  const hotelId = escopo.hoteis.get(recurso.EnterpriseId);
  if (!hotelId) return null;
  const estado = str(recurso.State);
  return Object.freeze({
    tenantId: escopo.tenantId,
    hotelId,
    enterpriseId: recurso.EnterpriseId,
    resourceId: recurso.Id,
    codigoExterno: chaveMews(recurso.EnterpriseId, recurso.Id),
    nome: recurso.Name.trim(),
    andar: str(recurso.Data?.Value?.FloorNumber),
    estadoOperacionalMews: estado,
    ativoNoPms: recurso.IsActive === true && !recurso.DeletedUtc,
    atualizadoEm: str(recurso.UpdatedUtc),
    // Nunca inferir automaticamente que Space=UH; pode ser sala de reunião etc.
    classificacao: 'pendente_mapeamento_uh',
    podeAlterarStatusLicenca: false,
    podeCriarOs: false,
    podeRegistrarIndisponibilidade: false,
  });
}

export function normalizarBloqueio(escopo, bloco, idsValidos = null) {
  if (!bloco || !['OutOfOrder', 'InternalUse'].includes(bloco.Type))
    return null;
  if (
    !str(bloco.Id) ||
    !str(bloco.EnterpriseId) ||
    !str(bloco.AssignedResourceId)
  )
    return null;
  const hotelId = escopo.hoteis.get(bloco.EnterpriseId);
  if (!hotelId) return null;
  const codigoRecurso = chaveMews(bloco.EnterpriseId, bloco.AssignedResourceId);
  if (idsValidos && !idsValidos.has(codigoRecurso)) return null;
  if (!str(bloco.StartUtc) || !str(bloco.EndUtc)) return null;
  return Object.freeze({
    tenantId: escopo.tenantId,
    hotelId,
    enterpriseId: bloco.EnterpriseId,
    resourceId: bloco.AssignedResourceId,
    codigoExterno: chaveMews(bloco.EnterpriseId, bloco.Id),
    codigoRecurso,
    tipoBloqueio: bloco.Type,
    inicio: bloco.StartUtc,
    fim: bloco.EndUtc,
    ativoNoPms: bloco.IsActive === true && !bloco.DeletedUtc,
    atualizadoEm: str(bloco.UpdatedUtc),
    // Nome e Notes são propositalmente descartados: podem conter dados pessoais.
    podeCriarOs: false,
    podeRegistrarIndisponibilidade: false,
  });
}

/**
 * Projeção apenas em memória. Não atualiza HubKeep, não calcula impactos.
 * Devolve itens vinculados a hotéis conhecidos, sem dados de hóspedes.
 */
export function montarProjecao(escopo, recursos, bloqueios) {
  if (!Array.isArray(recursos) || !Array.isArray(bloqueios))
    throw new Error('resposta_invalida');
  const espacos = recursos
    .map((r) => normalizarEspaco(escopo, r))
    .filter(Boolean);
  const ids = new Set(espacos.map((e) => e.codigoExterno));
  const blocos = bloqueios
    .map((b) => normalizarBloqueio(escopo, b, ids))
    .filter(Boolean);
  // Dedupe determinista por chave+updatedUtc, sem deixar um evento velho sobrescrever o novo.
  const recentes = (lista) => {
    const m = new Map();
    for (const item of lista) {
      const anterior = m.get(item.codigoExterno);
      if (
        !anterior ||
        String(item.atualizadoEm ?? '') > String(anterior.atualizadoEm ?? '')
      )
        m.set(item.codigoExterno, item);
    }
    return [...m.values()].sort((a, b) =>
      a.codigoExterno.localeCompare(b.codigoExterno),
    );
  };
  return Object.freeze({
    tenantId: escopo.tenantId,
    espacos: recentes(espacos),
    bloqueios: recentes(blocos),
    persistiuNoHubKeep: false,
  });
}