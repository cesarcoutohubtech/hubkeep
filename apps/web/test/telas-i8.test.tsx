// Telas da I8 (fase 1b) no detalhe do chamado: o quadro da assinatura no
// aceite, só com a política ligada no hotel; a OS aceita com assinatura, com o
// botão para vê-la; as fotos da OS só para ver. E o envio da assinatura pela
// URL própria, com a API e o Storage substituídos. Renderiza no servidor
// (react-dom/server), sem rede.
import { IDIOMAS, type IdiomaDeExibicao, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { RespostaDaApi } from '../src/cliente/api';
import { enviarAssinatura } from '../src/cliente/assinatura';
import {
  ChamadoEmDetalhe,
  type DetalheDoChamado,
  type OsDoChamado,
  type Referencias,
} from '../src/cliente/corretiva';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const H = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const P = '44444444-4444-4444-8444-444444444444';
const C = '55555555-5555-4555-8555-555555555555';
const U = '77777777-7777-4777-8777-777777777777';
const L = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASSINATURA = 'a0000000-0000-4000-8000-000000000001';

const refs: Referencias = {
  hoteis: [{ id: H, nome: 'Hotel Um' }],
  corretiva: { idiomaPadrao: 'pt-BR', situacoes: [], prioridades: [] },
};

const os = (extra: Partial<OsDoChamado>): OsDoChamado => ({
  id: '66666666-6666-4666-8666-666666666661',
  hotelId: H,
  chamadoId: C,
  estado: 'aceita',
  situacaoId: S,
  responsavel: { tipo: 'tecnico', usuarioId: U },
  motivoCancelamento: null,
  motivoReabertura: null,
  executadoPor: 'equipe_interna',
  fornecedorId: null,
  custoInformado: null,
  codigos: { falhaId: null, causaId: null, solucaoId: null },
  assinaturaAceiteId: null,
  criadoPor: U,
  versao: 4,
  criadoEm: '2026-10-10T12:00:00.000Z',
  ...extra,
});

const detalhe = (o: OsDoChamado, assinaturaNoAceite = false): DetalheDoChamado => ({
  chamado: {
    id: C,
    hotelId: H,
    localId: L,
    ativoId: null,
    descricao: 'Frigobar quente',
    estado: 'concluido',
    situacaoId: S,
    prioridadeId: P,
    politicaAplicada: {},
    abertoPor: U,
    motivoCancelamento: null,
    origem: 'interno',
    impactoHospede: null,
    categoriaId: null,
    prazoAtendimento: null,
    prazoSolucao: null,
    pausadoSegundos: 0,
    versao: 3,
    criadoEm: '2026-10-10T10:00:00.000Z',
  },
  os: [o],
  nomes: {
    hotel: 'Hotel Um',
    local: 'UH 101',
    localTipo: 'uh',
    ativo: null,
    pessoas: { [U]: 'Ana Técnica' },
    equipes: {},
    fornecedores: {},
  },
  assinaturaNoAceite,
});

const nada = () => undefined;

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado={false}>
      {tela}
    </ProvedorDeIdioma>,
  ).replaceAll('&#x27;', "'");

const tela = (o: OsDoChamado, assinaturaNoAceite = false) => (
  <ChamadoEmDetalhe
    detalhe={detalhe(o, assinaturaNoAceite)}
    refs={refs}
    aoAceitar={nada}
    aoReabrir={nada}
  />
);

describe('assinatura no aceite (I8)', () => {
  it.each(IDIOMAS)('%s: com a política ligada, o aceite traz o quadro', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, tela(os({ estado: 'concluida' }), true));
    expect(html).toContain('data-assinatura');
    expect(html).toContain(m['corretiva.aceite.assinatura.titulo']);
    expect(html).toContain(m['corretiva.aceite.assinatura.limpar']);
  });

  it('com a política desligada, o aceite não traz o quadro', () => {
    const html = renderizar('pt-BR', tela(os({ estado: 'concluida' })));
    expect(html).toContain(mensagensDe('pt-BR')['corretiva.aceite.aceitar']);
    expect(html).not.toContain('data-assinatura');
  });

  it.each(IDIOMAS)('%s: a OS aceita com assinatura mostra o botão para vê-la', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, tela(os({ assinaturaAceiteId: ASSINATURA })));
    expect(html).toContain(`data-assinatura-do-aceite="${ASSINATURA}"`);
    expect(html).toContain(m['corretiva.os.ver_assinatura']);
    expect(renderizar(idioma, tela(os({})))).not.toContain('data-assinatura-do-aceite');
  });

  it('as fotos da OS aparecem para ver, sem envio pelo web', () => {
    const m = mensagensDe('pt-BR');
    const html = renderizar('pt-BR', tela(os({})));
    expect(html).toContain(m['admin.anexos.acao.ver']);
    expect(html).not.toContain(m['admin.anexos.acao.enviar']);
  });
});

describe('envio da assinatura (I8)', () => {
  function montar(opcoes: { urlErro?: string; putFalha?: boolean } = {}) {
    const chamadas: string[] = [];
    const chamar = vi.fn(async (caminho: string) => {
      chamadas.push(caminho);
      return opcoes.urlErro
        ? { ok: false, erro: { codigo: opcoes.urlErro, parametros: {} } }
        : { ok: true, dados: { caminho: 't/h/os/o1/a.png', url: 'https://s/a' } };
    }) as unknown as <T>(caminho: string, init?: RequestInit) => Promise<RespostaDaApi<T>>;
    const puts: { url: string; tipo: string }[] = [];
    const requisitar = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      puts.push({
        url: String(url),
        tipo: (init?.headers as Record<string, string>)['content-type'] ?? '',
      });
      return new Response(null, { status: opcoes.putFalha ? 400 : 200 });
    }) as unknown as typeof fetch;
    return { chamar, requisitar, chamadas, puts };
  }
  const png = new Blob(['p'], { type: 'image/png' });

  it('pede a URL da OS, envia o PNG e devolve o caminho para o aceite', async () => {
    const m = montar();
    expect(await enviarAssinatura('o1', png, m)).toEqual({ ok: true, caminho: 't/h/os/o1/a.png' });
    expect(m.chamadas).toEqual(['/api/v1/os/o1/assinatura/url-de-upload']);
    expect(m.puts).toEqual([{ url: 'https://s/a', tipo: 'image/png' }]);
  });

  it('quem não aceita a OS: o erro da API, sem envio', async () => {
    const m = montar({ urlErro: 'acao_fora_do_papel' });
    expect(await enviarAssinatura('o1', png, m)).toEqual({
      ok: false,
      erro: { codigo: 'acao_fora_do_papel', parametros: {} },
    });
    expect(m.puts).toEqual([]);
  });

  it('o Storage recusa: envio_de_arquivo_falhou', async () => {
    const m = montar({ putFalha: true });
    expect(await enviarAssinatura('o1', png, m)).toMatchObject({
      ok: false,
      erro: { codigo: 'envio_de_arquivo_falhou' },
    });
  });
});
