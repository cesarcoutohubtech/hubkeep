// Telas da corretiva (fase 1a, C7): o caminho da lista com os filtros, e os
// componentes das listas, do detalhe (com o aceite e a reabertura) e da linha
// do tempo nos quatro idiomas e no pseudo-idioma. Renderiza no servidor
// (react-dom/server), com dados prontos, sem rede.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ChamadoEmDetalhe,
  type ChamadoResumido,
  type DetalheDoChamado,
  type EventoDaLinhaDoTempo,
  FILTRO_VAZIO,
  FiltrosDaLista,
  ColunasDeChamado,
  ColunasDeOs,
  LinhaDeChamado,
  LinhaDeOs,
  LinhaDoTempo,
  type OsResumida,
  type Referencias,
  agoraNoCampo,
  nivelDaPrioridade,
  caminhoDaLista,
} from '../src/cliente/corretiva';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const H = '11111111-1111-4111-8111-111111111111';
const S_CHAMADO = '22222222-2222-4222-8222-222222222222';
const S_OS = '33333333-3333-4333-8333-333333333333';
const P = '44444444-4444-4444-8444-444444444444';
const C = '55555555-5555-4555-8555-555555555555';
const OS = '66666666-6666-4666-8666-666666666666';
const U = '77777777-7777-4777-8777-777777777777';
const T = '88888888-8888-4888-8888-888888888888';

const refs: Referencias = {
  hoteis: [{ id: H, nome: 'Hotel Um' }],
  corretiva: {
    idiomaPadrao: 'pt-BR',
    situacoes: [
      {
        id: S_CHAMADO,
        entidade: 'chamado',
        estado: 'aguardando_aceite',
        chavePadrao: 'chamado_aguardando_aceite',
        nomes: {},
        ordem: 1,
        cor: '#000000',
        ativa: true,
      },
      {
        id: S_OS,
        entidade: 'os',
        estado: 'concluida',
        chavePadrao: 'os_concluida',
        nomes: {},
        ordem: 1,
        cor: '#000000',
        ativa: true,
      },
    ],
    prioridades: [{ id: P, chavePadrao: 'urgente', nomes: {}, ordem: 1, peso: 100, ativa: true }],
  },
} as Referencias;

const chamado: ChamadoResumido = {
  id: C,
  hotelId: H,
  hotelNome: 'Hotel Um',
  localId: U,
  localNome: 'UH 101',
  ativoId: T,
  ativoNome: 'Frigobar 101',
  descricao: 'Frigobar não gela',
  estado: 'aguardando_aceite',
  situacaoId: S_CHAMADO,
  prioridadeId: P,
  criadoEm: '2026-09-30T12:00:00.000Z',
};

const os: OsResumida = {
  id: OS,
  hotelId: H,
  hotelNome: 'Hotel Um',
  chamadoId: C,
  localNome: 'UH 101',
  descricao: 'Frigobar não gela',
  prioridadeId: P,
  estado: 'concluida',
  situacaoId: S_OS,
  responsavel: { tipo: 'tecnico', usuarioId: U },
  responsavelNome: 'Ana Técnica',
  responsavelArrendamento: null,
  criadoEm: '2026-09-30T13:00:00.000Z',
};

const detalhe: DetalheDoChamado = {
  chamado: {
    id: C,
    hotelId: H,
    localId: U,
    ativoId: T,
    descricao: 'Frigobar não gela',
    estado: 'aguardando_aceite',
    situacaoId: S_CHAMADO,
    prioridadeId: P,
    politicaAplicada: {},
    abertoPor: T,
    motivoCancelamento: null,
    origem: 'interno',
    impactoHospede: null,
    categoriaId: null,
    prazoAtendimento: '2026-09-30T16:00:00.000Z',
    prazoSolucao: '2026-10-01T12:00:00.000Z',
    pausadoSegundos: 5400,
    versao: 3,
    criadoEm: '2026-09-30T12:00:00.000Z',
  },
  os: [
    {
      id: OS,
      hotelId: H,
      chamadoId: C,
      estado: 'concluida',
      situacaoId: S_OS,
      responsavel: { tipo: 'tecnico', usuarioId: U },
      motivoCancelamento: null,
      motivoReabertura: 'Voltou a pingar',
      executadoPor: 'equipe_interna',
      fornecedorId: null,
      custoInformado: null,
      codigos: { falhaId: null, causaId: null, solucaoId: null },
      assinaturaAceiteId: null,
      responsavelArrendamento: null,
      locadorAvisadoEm: null,
      criadoPor: T,
      versao: 4,
      criadoEm: '2026-09-30T13:00:00.000Z',
    },
  ],
  nomes: {
    hotel: 'Hotel Um',
    local: 'UH 101',
    localTipo: 'uh',
    ativo: 'Frigobar 101',
    pessoas: { [T]: 'Bruno Solicitante', [U]: 'Ana Técnica' },
    equipes: {},
    fornecedores: {},
  },
  assinaturaNoAceite: false,
};

const eventos: EventoDaLinhaDoTempo[] = [
  ['chamado', 'abrir', null],
  ['parada_ativo', 'registrar', null],
  ['os', 'gerar', null],
  ['os', 'reabrir', 'Voltou a pingar'],
  ['os', 'acao_futura', null],
].map(([entidade, acao, motivo], i): EventoDaLinhaDoTempo => ({
  id: `9999999${i}-9999-4999-8999-999999999999`,
  em: '2026-09-30T14:00:00.000Z',
  entidade: entidade as EventoDaLinhaDoTempo['entidade'],
  registroId: C,
  acao: acao as string,
  usuarioId: U,
  usuarioNome: 'Ana Técnica',
  motivo: motivo ?? null,
}));

/** Os valores que vêm do banco (nomes e textos do cliente), fora do catálogo. */
const DADOS = [
  'Hotel Um',
  'Frigobar não gela',
  'UH 101',
  'Frigobar 101',
  'Ana Técnica',
  'Voltou a pingar',
];

const telas = () => (
  <>
    <FiltrosDaLista entidade="chamado" refs={refs} aoFiltrar={() => undefined} />
    <table>
      <ColunasDeChamado />
      <tbody>
        <LinhaDeChamado c={chamado} refs={refs} />
      </tbody>
    </table>
    <table>
      <ColunasDeOs />
      <tbody>
        <LinhaDeOs o={os} refs={refs} />
      </tbody>
    </table>
    <ChamadoEmDetalhe
      detalhe={detalhe}
      refs={refs}
      aoAceitar={() => undefined}
      aoReabrir={() => undefined}
    />
    <LinhaDoTempo eventos={eventos} />
    <LinhaDoTempo eventos={[]} />
  </>
);

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      {tela}
    </ProvedorDeIdioma>,
  );

describe('caminho da lista (C7)', () => {
  it('sem filtro, o caminho como está', () => {
    expect(caminhoDaLista('/api/v1/chamados', FILTRO_VAZIO)).toBe('/api/v1/chamados');
  });

  it('filtros na query; "até" inclusive vira a meia-noite local do dia seguinte', () => {
    const url = new URL(
      caminhoDaLista(
        '/api/v1/os',
        {
          hotelId: H,
          situacaoId: S_OS,
          prioridadeId: P,
          de: '2026-09-01',
          ate: '2026-09-30',
          doLocador: '1',
        },
        OS,
      ),
      'http://x',
    );
    expect(url.pathname).toBe('/api/v1/os');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      hotelId: H,
      situacaoId: S_OS,
      prioridadeId: P,
      de: new Date(2026, 8, 1).toISOString(),
      ate: new Date(2026, 9, 1).toISOString(),
      doLocador: '1',
      depoisDe: OS,
    });
  });

  it('o campo de data e hora começa na hora local', () => {
    expect(agoraNoCampo(new Date(2026, 8, 30, 7, 5))).toBe('2026-09-30T07:05');
  });
});

describe('telas da corretiva (C7) em cada idioma', () => {
  it.each(IDIOMAS)('%s: filtros, itens, detalhe com aceite e linha do tempo', (idioma) => {
    const m = mensagensDe(idioma);
    const html = renderizar(idioma, telas());
    for (const chave of [
      'corretiva.filtros.hotel',
      'corretiva.aceite.aceitar',
      'corretiva.reabertura.reabrir',
      'corretiva.reabertura.parado',
      'corretiva.linha_do_tempo.titulo',
      'corretiva.linha_do_tempo.vazia',
      'situacao.padrao.os_concluida',
      'prioridade.padrao.urgente',
    ] as const)
      expect(html).toContain(m[chave].replace(/'/g, '&#x27;'));
    for (const dado of DADOS) expect(html).toContain(dado);
  });

  it('pt-BR: ações da linha do tempo pelo catálogo, com a queda para ação desconhecida', () => {
    const html = renderizar('pt-BR', <LinhaDoTempo eventos={eventos} />);
    for (const texto of [
      'Chamado aberto',
      'Equipamento parado',
      'OS gerada',
      'OS reaberta',
      'Outra ação na OS',
      'Motivo: Voltou a pingar',
    ])
      expect(html).toContain(texto);
    expect(html).not.toContain('acao_futura');
  });

  it('o aceite automático aparece na linha do tempo, sem autor (ADR-044)', () => {
    const automatico: EventoDaLinhaDoTempo = {
      id: '99999999-9999-4999-8999-999999999998',
      em: '2026-10-08T15:00:00.000Z',
      entidade: 'os',
      registroId: C,
      acao: 'aceitar_automatico',
      usuarioId: null,
      usuarioNome: null,
      motivo: null,
    };
    for (const [idioma, texto] of [
      ['pt-BR', 'OS aceita automaticamente'],
      ['en', 'Work order accepted automatically'],
      ['es', 'Orden de trabajo aceptada automáticamente'],
      ['fr', 'Ordre de travail validé automatiquement'],
    ] as const) {
      const html = renderizar(idioma, <LinhaDoTempo eventos={[automatico]} />);
      expect(html).toContain(texto);
      expect(html).not.toContain('Ana Técnica');
    }
  });

  it('o aceite e a reabertura só aparecem na OS concluída', () => {
    const emExecucao = {
      ...detalhe,
      os: detalhe.os.map((o) => ({ ...o, estado: 'em_execucao' as const })),
    };
    const html = renderizar(
      'pt-BR',
      <ChamadoEmDetalhe
        detalhe={emExecucao}
        refs={refs}
        aoAceitar={() => undefined}
        aoReabrir={() => undefined}
      />,
    );
    expect(html).not.toContain('Aceitar');
    expect(html).not.toContain('Reabrir');
  });

  it('sem ativo no chamado, a reabertura não oferece o equipamento parado', () => {
    const semAtivo = { ...detalhe, chamado: { ...detalhe.chamado, ativoId: null } };
    const html = renderizar(
      'pt-BR',
      <ChamadoEmDetalhe
        detalhe={semAtivo}
        refs={refs}
        aoAceitar={() => undefined}
        aoReabrir={() => undefined}
      />,
    );
    expect(html).toContain('Reabrir');
    expect(html).not.toContain('O equipamento está parado');
  });

  it('os prazos de SLA e o relógio parado aparecem na ficha; sem prazo, nada', () => {
    const ficha = (d: DetalheDoChamado) =>
      renderizar(
        'pt-BR',
        <ChamadoEmDetalhe
          detalhe={d}
          refs={refs}
          aoAceitar={() => undefined}
          aoReabrir={() => undefined}
        />,
      );
    const comPrazo = ficha(detalhe);
    expect(comPrazo).toContain('data-prazo="atendimento"');
    expect(comPrazo).toContain('Atender até');
    expect(comPrazo).toContain('Resolver até');
    expect(comPrazo).toContain('Pausas pararam o relógio do SLA por 90 minutos');
    const semPrazo = ficha({
      ...detalhe,
      chamado: {
        ...detalhe.chamado,
        prazoAtendimento: null,
        prazoSolucao: null,
        pausadoSegundos: 0,
      },
    });
    expect(semPrazo).not.toContain('data-prazo');
  });

  it('pseudo-idioma: todo texto visível vem do catálogo, fora os dados do banco', () => {
    const html = renderizar(PSEUDO_IDIOMA, telas());
    const textos = [...html.matchAll(/>([^<>]+)</g)]
      .map((m) => (m[1] ?? '').trim())
      .filter((t) => t !== '' && !DADOS.includes(t));
    expect(textos.length).toBeGreaterThan(20);
    for (const texto of textos) expect(texto, texto).toMatch(/^\[.*\]$/s);
  });
});

describe('nível visual da prioridade', () => {
  const p = (id: string, peso: number, chavePadrao: string | null = null, ativa = true) => ({
    id,
    chavePadrao,
    peso,
    ativa,
    ordem: 0,
    nomes: {},
  });

  it('a padrão vai pela chave', () => {
    const lista = [p('u', 100, 'urgente'), p('b', 10, 'baixa')];
    expect(nivelDaPrioridade(lista, 'u')).toBe('critica');
    expect(nivelDaPrioridade(lista, 'b')).toBe('baixa');
  });

  it('a criada pelo tenant vai pela posição do peso entre as ativas', () => {
    const lista = [p('a', 90), p('b', 60), p('c', 30), p('d', 5), p('x', 99, null, false)];
    expect(['a', 'b', 'c', 'd'].map((id) => nivelDaPrioridade(lista, id))).toEqual([
      'critica',
      'alta',
      'media',
      'baixa',
    ]);
    expect(nivelDaPrioridade(lista, 'desconhecida')).toBe('baixa');
  });
});

describe('arrendado na corretiva (1c, ADR-045)', () => {
  const ficha = (idioma: IdiomaDeExibicao, d: DetalheDoChamado) =>
    renderizar(
      idioma,
      <ChamadoEmDetalhe
        detalhe={d}
        refs={refs}
        aoAceitar={() => undefined}
        aoReabrir={() => undefined}
      />,
    );
  const comMarca = (
    responsavelArrendamento: 'arrendataria' | 'locador' | null,
    locadorAvisadoEm: string | null,
  ): DetalheDoChamado => ({
    ...detalhe,
    os: detalhe.os.map((o) => ({ ...o, responsavelArrendamento, locadorAvisadoEm })),
  });

  it.each([
    ['pt-BR', 'Responde pela OS: o locador', 'Locador avisado em'],
    ['en', 'Responsible: the landlord', 'Landlord notified on'],
    ['es', 'Responde por la orden: el arrendador', 'Arrendador avisado el'],
    ['fr', 'Responsable de l’ordre : le bailleur', 'Bailleur prévenu le'],
  ] as const)('%s: a marca e o aviso ao locador na ficha da OS', (idioma, marca, aviso) => {
    const html = ficha(idioma, comMarca('locador', '2026-10-13T15:00:00.000Z'));
    expect(html).toContain('data-arrendamento="locador"');
    expect(html).toContain(marca);
    expect(html).toContain(aviso);
  });

  it('a arrendatária sem aviso; sem marca, nada', () => {
    const arrendataria = ficha('pt-BR', comMarca('arrendataria', null));
    expect(arrendataria).toContain('Responde pela OS: a arrendatária');
    expect(arrendataria).not.toContain('data-locador-avisado');
    // O aviso fica mesmo que a marca volte para a arrendatária (decisão 8).
    expect(ficha('pt-BR', comMarca('arrendataria', '2026-10-13T15:00:00.000Z'))).toContain(
      'data-locador-avisado',
    );
    expect(ficha('pt-BR', comMarca(null, null))).not.toContain('data-arrendamento');
  });

  it('o filtro "do locador" só na lista de OS; a OS do locador leva o selo', () => {
    const daOs = renderizar(
      'pt-BR',
      <FiltrosDaLista entidade="os" refs={refs} aoFiltrar={() => undefined} />,
    );
    expect(daOs).toContain('Só as do locador');
    const doChamado = renderizar(
      'pt-BR',
      <FiltrosDaLista entidade="chamado" refs={refs} aoFiltrar={() => undefined} />,
    );
    expect(doChamado).not.toContain('Só as do locador');
    const linha = (o: OsResumida) =>
      renderizar(
        'pt-BR',
        <table>
          <tbody>
            <LinhaDeOs o={o} refs={refs} />
          </tbody>
        </table>,
      );
    expect(linha({ ...os, responsavelArrendamento: 'locador' })).toContain('Do locador');
    expect(linha({ ...os, responsavelArrendamento: 'arrendataria' })).not.toContain('Do locador');
  });

  it('o ajuste, com motivo, e o aviso ao locador na linha do tempo', () => {
    const evento = (acao: string, motivo: string | null): EventoDaLinhaDoTempo => ({
      id: '99999999-9999-4999-8999-99999999999a',
      em: '2026-10-13T15:00:00.000Z',
      entidade: 'os',
      registroId: C,
      acao,
      usuarioId: U,
      usuarioNome: 'Ana Técnica',
      motivo,
    });
    const html = renderizar(
      'pt-BR',
      <LinhaDoTempo
        eventos={[
          evento('ajustar_arrendamento', 'Cláusula 7 do contrato'),
          { ...evento('avisar_locador', null), id: '99999999-9999-4999-8999-99999999999b' },
        ]}
      />,
    );
    expect(html).toContain('Responsável do arrendamento ajustado');
    expect(html).toContain('Motivo: Cláusula 7 do contrato');
    expect(html).toContain('Locador avisado');
  });

  it('pseudo-idioma: a marca, o aviso e o filtro vêm do catálogo', () => {
    const html = renderizar(
      PSEUDO_IDIOMA,
      <>
        <FiltrosDaLista entidade="os" refs={refs} aoFiltrar={() => undefined} />
        <ChamadoEmDetalhe
          detalhe={comMarca('locador', '2026-10-13T15:00:00.000Z')}
          refs={refs}
          aoAceitar={() => undefined}
          aoReabrir={() => undefined}
        />
      </>,
    );
    const textos = [...html.matchAll(/>([^<>]+)</g)]
      .map((m) => (m[1] ?? '').trim())
      .filter((t) => t !== '' && !DADOS.includes(t));
    for (const texto of textos) expect(texto, texto).toMatch(/^\[.*\]$/s);
  });
});
