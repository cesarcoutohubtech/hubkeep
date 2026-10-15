// Teste opt-in da demo pública Mews. Sem escrita e sem persistência de dados.
// Tokens públicos de DEMO são lidos por entrada interativa, sem gravação ou env no monorepo.
import { criarClienteMews, ErroMews } from './client.mjs';
import { criarEscopo, montarProjecao } from './normalizacao.mjs';
import { createInterface } from 'node:readline/promises';

async function executar() {
  if (!globalThis.process.argv.includes('--live')) {
    globalThis.console.log('Modo seguro: nenhuma chamada externa. Use --live para optar pelo teste Mews demo.');
    return;
  }
  const linha = createInterface({
    input: globalThis.process.stdin,
    output: globalThis.process.stdout,
  });
  let clientToken;
  let accessToken;
  try {
    clientToken = (await linha.question('Mews ClientToken público de DEMO: ')).trim();
    accessToken = (await linha.question('Mews AccessToken público de DEMO: ')).trim();
  } finally {
    linha.close();
  }
  if (!clientToken || !accessToken) throw new Error('credenciais_demo_obrigatorias');

  const mews = criarClienteMews({
    clientToken,
    accessToken,
    clientName: 'HubKeep-EU-Lab/0.1',
    pageSize: 20,
    maxPages: 3,
    maxRetries: 0, // smoke limitado a até três POST reais, inclusive se ocorrer 429/5xx
  });
  // Na demo pública, nenhum dado real de clientes, hóspedes ou hotéis deve ser usado.
  // A autenticacao single-property da Mews oferece diretamente Enterprise.Id.
  // enterprises/getAll pode exigir uma permissao que tokens demo individuais nao possuem.
  const enterpriseId = await mews.obterIdentificadorEmpresa();
  const recursos = await mews.lerPrimeiraPaginaDeRecursos([enterpriseId]);
  const bloqueios = await mews.lerPrimeiraPaginaDeBloqueiosSemFiltros();
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
    consultaConfiguracao: true,
    recursosAmostrados: recursos.itens.length,
    bloqueiosAmostrados: bloqueios.itens.length,
    existeProximaPagina: {
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
