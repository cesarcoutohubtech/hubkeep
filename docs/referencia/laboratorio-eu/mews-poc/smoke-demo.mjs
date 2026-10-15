// Teste opt-in da demo pública Mews. Sem escrita e sem persistência de dados.
// Nunca passar tokens na CLI: usar somente variáveis de ambiente locais.
import { criarClienteMews, ErroMews } from './client.mjs';
import { criarEscopo, montarProjecao } from './normalizacao.mjs';

async function executar() {
  if (!globalThis.process.argv.includes('--live')) {
    globalThis.console.log('Modo seguro: nenhuma chamada externa. Use --live para optar pelo teste Mews demo.');
    return;
  }
  const clientToken = globalThis.process.env.MEWS_DEMO_CLIENT_TOKEN;
  const accessToken = globalThis.process.env.MEWS_DEMO_ACCESS_TOKEN;
  if (!clientToken || !accessToken) {
    throw new Error('defina_MEWS_DEMO_CLIENT_TOKEN_e_MEWS_DEMO_ACCESS_TOKEN');
  }

  const mews = criarClienteMews({
    clientToken,
    accessToken,
    clientName: 'HubKeep-EU-Lab/0.1',
    pageSize: 20,
    maxPages: 3,
    maxRetries: 1,
  });
  // Na demo pública, nenhum dado real de clientes, hóspedes ou hotéis deve ser usado.
  const empresas = await mews.lerPrimeiraPaginaDeEmpresas();
  const primeira = empresas.itens.find((item) => typeof item?.Id === 'string');
  if (!primeira) {
    globalThis.console.log(JSON.stringify({ ambiente: 'mews-demo', empresas: 0, status: 'sem_dados' }));
    return;
  }

  const enterpriseId = primeira.Id;
  const recursos = await mews.lerPrimeiraPaginaDeRecursos([enterpriseId]);
  const bloqueios = await mews.lerPrimeiraPaginaDeBloqueios([enterpriseId]);
  const escopo = criarEscopo({
    tenantId: 'tenant-sintetico-mews-lab',
    vinculos: [{ enterpriseId, hotelId: 'hotel-sintetico-mews-lab' }],
  });
  const projecao = montarProjecao(escopo, recursos.itens, bloqueios.itens);
  // Nunca mostrar tokens, nomes de recursos, campos livres, hóspedes, URLs ou payloads crus.
  globalThis.console.log(JSON.stringify({
    ambiente: 'mews-demo',
    status: 'consulta_read_only_realizada',
    chamadasHttpEsperadas: 3,
    empresasAmostradas: empresas.itens.length,
    recursosAmostrados: recursos.itens.length,
    bloqueiosAmostrados: bloqueios.itens.length,
    existeProximaPagina: {
      empresas: Boolean(empresas.cursor),
      recursos: Boolean(recursos.cursor),
      bloqueios: Boolean(bloqueios.cursor),
    },
    espacosNormalizados: projecao.espacos.length,
    bloqueiosNormalizados: projecao.bloqueios.length,
    persistiuNoHubKeep: projecao.persistiuNoHubKeep,
  }));
}

executar().catch((err) => {
  const codigo = err instanceof ErroMews ? err.codigo : 'falha_inesperada';
  globalThis.console.error(JSON.stringify({ status: 'erro', codigo }));
  globalThis.process.exitCode = 1;
});
