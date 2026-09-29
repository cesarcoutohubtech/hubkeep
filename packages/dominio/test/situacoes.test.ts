// Situações e prioridades do tenant (C1; ADR-027) e a prioridade padrão do
// chamado pela política (A7).
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  ESTADOS_DA_OS,
  ESTADOS_DO_CHAMADO,
  PRIORIDADES_PADRAO,
  type PrioridadeParaRegra,
  SITUACOES_PADRAO,
  type SituacaoParaRegra,
  exigirPrioridadeRestante,
  exigirSituacaoRestante,
  podeGerirPrioridades,
  podeGerirSituacoes,
  prioridadePadraoDoChamado,
  resolverPolitica,
  situacaoPara,
  validarCor,
  validarEstadoDaSituacao,
  validarNomesDeConfiguracao,
  validarOrdem,
  validarPeso,
} from '../src';

const agora = new Date('2026-09-29T12:00:00Z');
const codigo = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('padrões', () => {
  it('uma situação padrão por estado canônico do chamado e da OS', () => {
    expect(SITUACOES_PADRAO.filter((s) => s.entidade === 'chamado').map((s) => s.estado)).toEqual([
      ...ESTADOS_DO_CHAMADO,
    ]);
    expect(SITUACOES_PADRAO.filter((s) => s.entidade === 'os').map((s) => s.estado)).toEqual([
      ...ESTADOS_DA_OS,
    ]);
    expect(new Set(SITUACOES_PADRAO.map((s) => s.chave)).size).toBe(SITUACOES_PADRAO.length);
    for (const s of SITUACOES_PADRAO) {
      expect(s.chave).toMatch(/^[a-z][a-z_]{1,39}$/);
      expect(() => validarCor(s.cor)).not.toThrow();
      expect(() => validarOrdem(s.ordem)).not.toThrow();
    }
  });

  it('prioridades padrão: urgente, alta, média e baixa, com peso decrescente', () => {
    expect(PRIORIDADES_PADRAO.map((p) => p.chave)).toEqual(['urgente', 'alta', 'media', 'baixa']);
    const pesos = PRIORIDADES_PADRAO.map((p) => p.peso);
    expect([...pesos].sort((a, b) => b - a)).toEqual(pesos);
  });
});

describe('quem gere', () => {
  const a = (papel: Atribuicao['papel'], escopo: Atribuicao['escopo']): Atribuicao => ({
    id: 'x',
    usuarioId: 'u',
    papel,
    escopo,
    validoAte: null,
    revogadoEm: null,
  });
  it('só o Admin do grupo gere situações e prioridades', () => {
    const admin = [a('admin_grupo', { tipo: 'grupo' })];
    const gestor = [a('gestor_csc', { tipo: 'grupo' })];
    expect(podeGerirSituacoes(admin, agora).permitido).toBe(true);
    expect(podeGerirPrioridades(admin, agora).permitido).toBe(true);
    const s = podeGerirSituacoes(gestor, agora);
    const p = podeGerirPrioridades(gestor, agora);
    expect(!s.permitido && s.erro.codigo).toBe('situacoes_so_admin');
    expect(!p.permitido && p.erro.codigo).toBe('prioridades_so_admin');
  });
});

describe('validações', () => {
  it('nomes: a do tenant precisa de um; a padrão pode ficar sem', () => {
    expect(validarNomesDeConfiguracao('situacao', { 'pt-BR': ' Aguardando  peça ' }, null)).toEqual(
      {
        'pt-BR': 'Aguardando peça',
      },
    );
    expect(validarNomesDeConfiguracao('prioridade', {}, 'alta')).toEqual({});
    expect(codigo(() => validarNomesDeConfiguracao('situacao', {}, null))).toBe(
      'situacao_nome_invalido',
    );
    expect(codigo(() => validarNomesDeConfiguracao('prioridade', { de: 'x' }, null))).toBe(
      'prioridade_nome_invalido',
    );
    expect(
      codigo(() => validarNomesDeConfiguracao('prioridade', { en: 'x'.repeat(121) }, null)),
    ).toBe('prioridade_nome_invalido');
  });

  it('ordem de 1 a 999, peso de 1 a 1000, inteiros', () => {
    expect(validarOrdem(1)).toBe(1);
    expect(validarPeso(1000)).toBe(1000);
    for (const v of [0, 1000, 1.5, '3', null])
      expect(codigo(() => validarOrdem(v))).toBe('ordem_invalida');
    for (const v of [0, 1001, 2.5, '3', null])
      expect(codigo(() => validarPeso(v))).toBe('peso_invalido');
  });

  it('cor em #rrggbb, guardada em minúsculas', () => {
    expect(validarCor(' #A1B2C3 ')).toBe('#a1b2c3');
    for (const v of ['#abc', 'a1b2c3', '#gggggg', null])
      expect(codigo(() => validarCor(v))).toBe('cor_invalida');
  });

  it('estado da situação: um canônico da entidade', () => {
    expect(validarEstadoDaSituacao('os', 'pausada')).toEqual({ entidade: 'os', estado: 'pausada' });
    for (const [e, s] of [
      ['chamado', 'pausada'],
      ['os', 'em_triagem'],
      ['preventiva', 'aberto'],
      ['chamado', null],
    ])
      expect(codigo(() => validarEstadoDaSituacao(e, s))).toBe('estado_invalido');
  });
});

describe('situação ao entrar num estado', () => {
  const s = (
    id: string,
    estado: string,
    ordem: number,
    extra: Partial<SituacaoParaRegra> = {},
  ): SituacaoParaRegra => ({ id, entidade: 'os', estado, ordem, ativa: true, ...extra });
  const lista = [
    s('execucao', 'em_execucao', 30),
    s('aguardando-peca', 'em_execucao', 35),
    s('execucao-velha', 'em_execucao', 5, { ativa: false }),
    s('pausada', 'pausada', 40),
    s('chamado-execucao', 'em_execucao', 1, { entidade: 'chamado' }),
  ];

  it('sem pedido, a ativa de menor ordem do estado e da entidade', () => {
    expect(situacaoPara(lista, 'os', 'em_execucao')).toBe('execucao');
    expect(situacaoPara(lista, 'chamado', 'em_execucao')).toBe('chamado-execucao');
  });

  it('a pedida vale se for ativa e do estado', () => {
    expect(situacaoPara(lista, 'os', 'em_execucao', 'aguardando-peca')).toBe('aguardando-peca');
    for (const pedida of ['pausada', 'execucao-velha', 'chamado-execucao', 'nao-existe'])
      expect(codigo(() => situacaoPara(lista, 'os', 'em_execucao', pedida))).toBe(
        'situacao_fora_do_estado',
      );
  });

  it('estado sem situação ativa: sem_situacao_para_estado', () => {
    expect(codigo(() => situacaoPara(lista, 'os', 'concluida'))).toBe('sem_situacao_para_estado');
  });

  it('não desativa a última situação ativa do estado', () => {
    expect(() => exigirSituacaoRestante(lista, 'aguardando-peca')).not.toThrow();
    expect(codigo(() => exigirSituacaoRestante(lista, 'pausada'))).toBe(
      'ultima_situacao_do_estado',
    );
    // A do chamado no mesmo estado não conta para a da OS.
    expect(codigo(() => exigirSituacaoRestante(lista, 'chamado-execucao'))).toBe(
      'ultima_situacao_do_estado',
    );
  });
});

describe('prioridade padrão do chamado', () => {
  const p = (id: string, peso: number, ordem: number, ativa = true): PrioridadeParaRegra => ({
    id,
    peso,
    ordem,
    ativa,
  });
  const [URGENTE, ALTA, MEDIA, BAIXA, INATIVA] = [1, 2, 3, 4, 5].map(uuid) as [
    string,
    string,
    string,
    string,
    string,
  ];
  const prioridades = [
    p(URGENTE, 100, 10),
    p(ALTA, 70, 20),
    p(MEDIA, 40, 30),
    p(BAIXA, 10, 40),
    p(INATIVA, 1, 50, false),
  ];
  const [ELEVADOR, COZINHA] = [11, 12].map(uuid) as [string, string];

  it('a da categoria, pela política resolvida hotel → grupo → padrão', () => {
    const grupo = { [ELEVADOR]: ALTA, [COZINHA]: MEDIA };
    const hotel = { [ELEVADOR]: URGENTE };
    const doHotel = resolverPolitica('chamado.prioridade_padrao_por_categoria', { hotel, grupo });
    expect(
      prioridadePadraoDoChamado({ porCategoria: doHotel, categoriaId: ELEVADOR, prioridades }),
    ).toEqual({
      prioridadeId: URGENTE,
      origem: 'categoria',
    });
    // O hotel substitui o grupo por inteiro (a política é um valor só).
    expect(
      prioridadePadraoDoChamado({ porCategoria: doHotel, categoriaId: COZINHA, prioridades }),
    ).toEqual({ prioridadeId: BAIXA, origem: 'menor_peso' });
    const doGrupo = resolverPolitica('chamado.prioridade_padrao_por_categoria', { grupo });
    expect(
      prioridadePadraoDoChamado({ porCategoria: doGrupo, categoriaId: COZINHA, prioridades }),
    ).toEqual({ prioridadeId: MEDIA, origem: 'categoria' });
    const padrao = resolverPolitica('chamado.prioridade_padrao_por_categoria', {});
    expect(
      prioridadePadraoDoChamado({ porCategoria: padrao, categoriaId: ELEVADOR, prioridades }),
    ).toEqual({ prioridadeId: BAIXA, origem: 'menor_peso' });
  });

  it('sem categoria, ou com a prioridade da categoria desativada: a ativa de menor peso', () => {
    expect(
      prioridadePadraoDoChamado({
        porCategoria: { [ELEVADOR]: ALTA },
        categoriaId: null,
        prioridades,
      }).prioridadeId,
    ).toBe(BAIXA);
    expect(
      prioridadePadraoDoChamado({
        porCategoria: { [ELEVADOR]: INATIVA },
        categoriaId: ELEVADOR,
        prioridades,
      }),
    ).toEqual({ prioridadeId: BAIXA, origem: 'menor_peso' });
  });

  it('empate de peso: a de maior ordem (a mais abaixo na lista)', () => {
    const empate = [p(ALTA, 10, 20), p(MEDIA, 10, 30)];
    expect(
      prioridadePadraoDoChamado({ porCategoria: {}, categoriaId: null, prioridades: empate })
        .prioridadeId,
    ).toBe(MEDIA);
  });

  it('nenhuma ativa: sem_prioridade_ativa; não desativa a última', () => {
    expect(
      codigo(() =>
        prioridadePadraoDoChamado({
          porCategoria: {},
          categoriaId: null,
          prioridades: [p(INATIVA, 1, 1, false)],
        }),
      ),
    ).toBe('sem_prioridade_ativa');
    expect(() => exigirPrioridadeRestante(prioridades, BAIXA)).not.toThrow();
    expect(
      codigo(() => exigirPrioridadeRestante([p(ALTA, 1, 1), p(INATIVA, 1, 2, false)], ALTA)),
    ).toBe('ultima_prioridade');
  });
});
