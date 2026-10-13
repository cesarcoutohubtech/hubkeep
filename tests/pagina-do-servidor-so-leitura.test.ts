// ADR-039, adendo da P1c, condição do Cesar (13/10/2026): o carregarNaPagina,
// que monta os dados de uma página no servidor sem passar pela /api/v1, só
// vale numa lista fechada de páginas, e cada página só chama casos de uso que
// leem. Hoje a lista tem só o detalhe do chamado. Página nova, ou leitura nova
// numa página da lista, muda este teste, que é zona protegida (ADR-023): o
// Cesar vê a mudança antes do merge.
//
// Como o teste confere:
//   - nenhum arquivo dos apps, fora do pagina.ts, usa o carregarNaPagina sem
//     estar na lista;
//   - a página da lista só importa do servidor o pagina.ts e o módulo de
//     leituras dela;
//   - o módulo de leituras só pega os casos de uso pelas fontes (FONTES), e
//     cada fonte é um Pick com os métodos de leitura da lista fechada;
//   - nenhum método da lista tem nome de ação que grava.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGINA_TS = 'apps/web/src/servidor/pagina.ts';

/** As páginas que podem usar o carregarNaPagina e o módulo de leituras de cada uma. */
const PAGINAS: Record<string, { leituras: string }> = {
  'apps/web/src/app/(painel)/chamados/[id]/page.tsx': {
    leituras: 'apps/web/src/servidor/leituras-do-chamado.ts',
  },
};

/** Os métodos de caso de uso que as páginas da lista podem chamar: todos só leem. */
const LEITURAS_PERMITIDAS = [
  'CasosDeUsoDeChamados.chamado',
  'CasosDeUsoDeConsultas.linhaDoTempo',
  'CasosDeUsoDeConsultas.nomesDoChamado',
  'CasosDeUsoDeEquipes.listarEquipes',
  'CasosDeUsoDePapeis.listarHoteisVisiveis',
  'CasosDeUsoDeSituacoes.listarSituacoesEPrioridades',
  'CasosDeUsoDeTriagem.assinaturaNoAceite',
  'CasosDeUsoDeTriagem.osDoChamado',
];

/** Começo de nome de método que grava; nenhuma leitura permitida pode ter um deles. */
const VERBO_QUE_GRAVA =
  /^(abrir|aceitar|alterar|aplicar|ativar|atribuir|atualizar|cadastrar|cancelar|concluir|convidar|criar|desativar|encerrar|excluir|gerar|gravar|iniciar|liberar|marcar|mover|pausar|reabrir|reatribuir|registrar|remover|responder|retomar|revogar|salvar|triar)/;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (nome === 'node_modules' || nome === '.next' || nome === 'dist') return [];
    return statSync(caminho).isDirectory()
      ? arquivos(caminho)
      : /\.(ts|tsx)$/.test(nome)
        ? [caminho]
        : [];
  });
}

const ler = (caminho: string) => readFileSync(caminho, 'utf8');

/** Os pares "CasosDeUsoDeX.metodo" dos Pick<CasosDeUsoDeX, 'a' | 'b'> de um arquivo. */
function metodosDosPick(fonte: string): string[] {
  const pares: string[] = [];
  for (const m of fonte.matchAll(/Pick<\s*(CasosDeUsoDe\w+)\s*,\s*([^>]+)>/g)) {
    for (const metodo of (m[2] ?? '').matchAll(/'(\w+)'/g)) pares.push(`${m[1]}.${metodo[1]}`);
  }
  return pares.sort();
}

describe('ADR-039, P1c: o carregarNaPagina só numa lista fechada e só para ler', () => {
  const usos = ['apps']
    .flatMap(arquivos)
    .filter((f) => !f.includes('/test/') && f !== PAGINA_TS)
    .filter((f) => /\bcarregarNaPagina\b/.test(ler(f)));

  it('só as páginas da lista usam o carregarNaPagina', () => {
    expect(usos.sort()).toEqual(Object.keys(PAGINAS).sort());
  });

  for (const [pagina, { leituras }] of Object.entries(PAGINAS)) {
    it(`${pagina}: do servidor, só importa o pagina.ts e o módulo de leituras`, () => {
      const doServidor = [...ler(pagina).matchAll(/from '([^']*servidor\/[^']+)'/g)].map((m) =>
        (m[1] ?? '').replace(/^.*servidor\//, 'apps/web/src/servidor/'),
      );
      const permitidos = [PAGINA_TS.replace(/\.ts$/, ''), leituras.replace(/\.ts$/, '')];
      expect(doServidor.length).toBeGreaterThan(0);
      for (const m of doServidor) expect(permitidos, m).toContain(m);
    });

    it(`${leituras}: os casos de uso só pelas fontes, com os métodos de leitura da lista`, () => {
      const fonte = ler(leituras);
      const daComposicao = /import\s*\{([^}]*)\}\s*from '\.\/composicao'/.exec(fonte)?.[1] ?? '';
      const nomes = daComposicao
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      expect(nomes.length).toBeGreaterThan(0);
      for (const nome of nomes) {
        // Só casos de uso, e cada um aparece duas vezes: no import e nas FONTES.
        expect(nome).toMatch(/^casosDeUsoDe\w+$/);
        expect(fonte.match(new RegExp(`\\b${nome}\\b`, 'g')), nome).toHaveLength(2);
      }
      // Do banco, só tipos: nada de acesso, unit of work ou pool.
      for (const m of fonte.matchAll(/import\s+(type\s+)?\{[^}]*\}\s*from '@hubkeep\/db'/g)) {
        expect(m[1], m[0]).toBeTruthy();
      }
      const pick = metodosDosPick(fonte);
      expect(pick.length).toBeGreaterThan(0);
      for (const par of pick) expect(LEITURAS_PERMITIDAS, par).toContain(par);
    });
  }

  it('nenhum método da lista tem nome de ação que grava', () => {
    for (const par of LEITURAS_PERMITIDAS) {
      expect(par.split('.')[1], par).not.toMatch(VERBO_QUE_GRAVA);
    }
  });

  it('controle: um Pick com método que grava fica fora da lista', () => {
    const fonte = "x: () => Promise<Pick<CasosDeUsoDeTriagem, 'osDoChamado' | 'gerarOs'>>;";
    const fora = metodosDosPick(fonte).filter((p) => !LEITURAS_PERMITIDAS.includes(p));
    expect(fora).toEqual(['CasosDeUsoDeTriagem.gerarOs']);
    expect('gerarOs').toMatch(VERBO_QUE_GRAVA);
  });
});
