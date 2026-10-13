// Checklist tipado (PV1, ADR-040): quem gere os modelos, nomes, itens e
// versão, aplicação na OS, respostas (validação, hora e mescla) e a exigência
// da política na conclusão.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  type DefinicaoDeCampo,
  ESTADOS_DA_OS,
  ESTADOS_QUE_ACEITAM_CHECKLIST,
  OPCOES_DE_CONFORMIDADE,
  decidirAplicacaoDoChecklist,
  exigirChecklistCompletoNaConclusao,
  horaDaResposta,
  lerRespostas,
  mesclarRespostas,
  obrigatoriosSemResposta,
  podeGerirChecklists,
  resolverPolitica,
  validarItensDoChecklist,
  validarNomesDoChecklist,
  validarRespostasDoChecklist,
} from '../src';

const codigo = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};
const parametros = (f: () => unknown): unknown => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { parametros: unknown }).parametros;
  }
};

const agora = new Date('2026-10-12T12:00:00Z');
const atr = (papel: Atribuicao['papel'], escopo: Atribuicao['escopo']): Atribuicao => ({
  id: `a-${papel}`,
  usuarioId: 'u-1',
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
});

const ITENS: DefinicaoDeCampo[] = [
  {
    chave: 'filtro_limpo',
    tipo: 'sim_nao',
    obrigatorio: true,
    rotulos: { 'pt-BR': 'Filtro limpo' },
    unidade: null,
    opcoes: [],
  },
  {
    chave: 'pressao',
    tipo: 'numero',
    obrigatorio: false,
    rotulos: { 'pt-BR': 'Pressão' },
    unidade: 'psi',
    opcoes: [],
  },
  {
    chave: 'conformidade',
    tipo: 'lista',
    obrigatorio: true,
    rotulos: { 'pt-BR': 'Conformidade' },
    unidade: null,
    opcoes: OPCOES_DE_CONFORMIDADE.map((chave) => ({ chave, rotulos: { 'pt-BR': chave } })),
  },
  {
    chave: 'proxima',
    tipo: 'data',
    obrigatorio: false,
    rotulos: { 'pt-BR': 'Próxima' },
    unidade: null,
    opcoes: [],
  },
  {
    chave: 'obs',
    tipo: 'texto',
    obrigatorio: false,
    rotulos: { 'pt-BR': 'Observação' },
    unidade: null,
    opcoes: [],
  },
];

describe('modelos de checklist (PV1)', () => {
  it('só o Admin do grupo gere os modelos', () => {
    expect(podeGerirChecklists([atr('admin_grupo', { tipo: 'grupo' })], agora)).toEqual({
      permitido: true,
    });
    for (const papel of ['gestor_csc', 'gerente_hotel', 'implantador', 'tecnico'] as const) {
      const r = podeGerirChecklists([atr(papel, { tipo: 'hotel', hotelId: 'h-1' })], agora);
      expect(r.permitido).toBe(false);
      if (!r.permitido) expect(r.erro.codigo).toBe('checklists_so_admin');
    }
  });

  it('nome em ao menos um idioma, até 120 caracteres', () => {
    expect(validarNomesDoChecklist({ 'pt-BR': '  Inspeção   do ar ' })).toEqual({
      'pt-BR': 'Inspeção do ar',
    });
    expect(codigo(() => validarNomesDoChecklist({}))).toBe('checklist_nome_invalido');
    expect(codigo(() => validarNomesDoChecklist({ 'pt-BR': 'x'.repeat(121) }))).toBe(
      'checklist_nome_invalido',
    );
    expect(codigo(() => validarNomesDoChecklist({ de: 'Prüfung' }))).toBe(
      'checklist_nome_invalido',
    );
  });

  it('itens tipados, até 50; o novo começa na versão 1', () => {
    expect(validarItensDoChecklist(ITENS)).toEqual({ itens: ITENS, versao: 1 });
    expect(validarItensDoChecklist([]).versao).toBe(1);
    const demais = Array.from({ length: 51 }, (_, i) => ({ ...ITENS[1], chave: `item_${i}` }));
    expect(codigo(() => validarItensDoChecklist(demais))).toBe('definicao_de_campo_invalida');
  });

  it('a versão sobe só quando os itens mudam; o tipo de um item não muda', () => {
    const atual = { itens: ITENS, versao: 3 };
    expect(validarItensDoChecklist(ITENS, atual).versao).toBe(3);
    const comNovo = [...ITENS, { ...(ITENS[4] as DefinicaoDeCampo), chave: 'obs_2' }];
    expect(validarItensDoChecklist(comNovo, atual).versao).toBe(4);
    const obrigatorioMudou = ITENS.map((i) =>
      i.chave === 'pressao' ? { ...i, obrigatorio: true } : i,
    );
    expect(validarItensDoChecklist(obrigatorioMudou, atual).versao).toBe(4);
    const tipoMudou = ITENS.map((i) =>
      i.chave === 'pressao' ? { ...i, tipo: 'texto', unidade: null } : i,
    );
    expect(codigo(() => validarItensDoChecklist(tipoMudou, atual))).toBe('campo_muda_de_tipo');
  });
});

describe('aplicar o checklist na OS (PV1)', () => {
  it('com a OS atribuída, em execução ou pausada', () => {
    expect([...ESTADOS_QUE_ACEITAM_CHECKLIST]).toEqual(['atribuida', 'em_execucao', 'pausada']);
    for (const estadoDaOs of ESTADOS_DA_OS) {
      const f = () =>
        decidirAplicacaoDoChecklist({ estadoDaOs, modeloAtivo: true, respostasAtuais: null });
      if (ESTADOS_QUE_ACEITAM_CHECKLIST.includes(estadoDaOs)) expect(f).not.toThrow();
      else expect(codigo(f)).toBe('transicao_invalida');
    }
  });

  it('o modelo desativado não se aplica', () => {
    expect(
      codigo(() =>
        decidirAplicacaoDoChecklist({
          estadoDaOs: 'atribuida',
          modeloAtivo: false,
          respostasAtuais: null,
        }),
      ),
    ).toBe('checklist_modelo_inativo');
  });

  it('trocar só sem resposta', () => {
    expect(() =>
      decidirAplicacaoDoChecklist({
        estadoDaOs: 'em_execucao',
        modeloAtivo: true,
        respostasAtuais: {},
      }),
    ).not.toThrow();
    expect(
      codigo(() =>
        decidirAplicacaoDoChecklist({
          estadoDaOs: 'em_execucao',
          modeloAtivo: true,
          respostasAtuais: { filtro_limpo: { valor: true } },
        }),
      ),
    ).toBe('checklist_ja_respondido');
  });
});

describe('respostas do checklist (PV1)', () => {
  it('cada valor no tipo do item; null limpa', () => {
    expect(
      validarRespostasDoChecklist(ITENS, {
        filtro_limpo: true,
        pressao: 32.5,
        conformidade: 'nao_conforme',
        proxima: '2026-11-12',
        obs: '  troca do filtro  ',
      }),
    ).toEqual({
      filtro_limpo: true,
      pressao: 32.5,
      conformidade: 'nao_conforme',
      proxima: '2026-11-12',
      obs: 'troca do filtro',
    });
    expect(validarRespostasDoChecklist(ITENS, { pressao: null })).toEqual({ pressao: null });
  });

  it('valor fora do tipo, item desconhecido ou pedido vazio: 422 com item e motivo', () => {
    const casos: [unknown, unknown][] = [
      [{ filtro_limpo: 'sim' }, { item: 'filtro_limpo', motivo: 'tipo' }],
      [{ pressao: '30' }, { item: 'pressao', motivo: 'tipo' }],
      [{ conformidade: 'talvez' }, { item: 'conformidade', motivo: 'tipo' }],
      [{ proxima: '2026-02-30' }, { item: 'proxima', motivo: 'tipo' }],
      [{ obs: '   ' }, { item: 'obs', motivo: 'tipo' }],
      [{ outro: true }, { item: 'outro', motivo: 'item_desconhecido' }],
      [{}, { item: '', motivo: 'formato' }],
      [[true], { item: '', motivo: 'formato' }],
    ];
    for (const [respostas, esperado] of casos) {
      const f = () => validarRespostasDoChecklist(ITENS, respostas);
      expect(codigo(f)).toBe('checklist_resposta_invalida');
      expect(parametros(f)).toEqual(esperado);
    }
  });

  it('a hora do aparelho, sem passar da do servidor', () => {
    const antes = new Date('2026-10-12T08:00:00Z');
    expect(horaDaResposta(antes, agora)).toEqual(antes);
    expect(horaDaResposta(new Date('2026-10-13T00:00:00Z'), agora)).toEqual(agora);
    expect(horaDaResposta(undefined, agora)).toEqual(agora);
    expect(horaDaResposta(new Date('x'), agora)).toEqual(agora);
  });

  it('mescla item a item: a última vence, null remove, o resto fica', () => {
    const gravadas = mesclarRespostas(
      {},
      { filtro_limpo: false, pressao: 30 },
      { usuarioId: 'tec-1', feitaEm: new Date('2026-10-12T08:00:00Z') },
    );
    const depois = mesclarRespostas(
      gravadas,
      { filtro_limpo: true, pressao: null, obs: 'ok' },
      { usuarioId: 'tec-2', feitaEm: new Date('2026-10-12T09:00:00Z') },
    );
    expect(depois).toEqual({
      filtro_limpo: { valor: true, feitaEm: '2026-10-12T09:00:00.000Z', usuarioId: 'tec-2' },
      obs: { valor: 'ok', feitaEm: '2026-10-12T09:00:00.000Z', usuarioId: 'tec-2' },
    });
    expect(gravadas['pressao']?.valor).toBe(30);
  });

  it('a leitura nunca lança e descarta o que a cópia não aceita', () => {
    expect(lerRespostas(ITENS, null)).toEqual({});
    expect(
      lerRespostas(ITENS, {
        filtro_limpo: { valor: true, feitaEm: 'x', usuarioId: 'u' },
        pressao: { valor: 'trinta' },
        sumiu: { valor: 1 },
        obs: 'sem objeto',
      }),
    ).toEqual({ filtro_limpo: { valor: true, feitaEm: 'x', usuarioId: 'u' } });
  });
});

describe('checklist completo na conclusão (PV1)', () => {
  const resposta = (valor: boolean | string) => ({ valor, feitaEm: '', usuarioId: 'u' });

  it('os obrigatórios sem resposta, na ordem da cópia', () => {
    expect(obrigatoriosSemResposta(ITENS, {})).toEqual(['filtro_limpo', 'conformidade']);
    expect(obrigatoriosSemResposta(ITENS, { conformidade: resposta('conforme') })).toEqual([
      'filtro_limpo',
    ]);
  });

  it('a política, desligada por padrão; o hotel liga', () => {
    expect(resolverPolitica('os.checklist_completo_obrigatorio', {})).toEqual({ ligado: false });
    expect(
      resolverPolitica('os.checklist_completo_obrigatorio', { hotel: { ligado: true } }),
    ).toEqual({ ligado: true });
  });

  it('ligada, recusa a conclusão sem os obrigatórios; desligada ou sem checklist, não', () => {
    const incompleto = { itens: ITENS, respostas: { filtro_limpo: resposta(true) } };
    const f = () => exigirChecklistCompletoNaConclusao(true, incompleto);
    expect(codigo(f)).toBe('checklist_incompleto');
    expect(parametros(f)).toEqual({ faltam: 1, itens: 'conformidade' });
    expect(() => exigirChecklistCompletoNaConclusao(false, incompleto)).not.toThrow();
    expect(() => exigirChecklistCompletoNaConclusao(true, null)).not.toThrow();
    expect(() =>
      exigirChecklistCompletoNaConclusao(true, {
        itens: ITENS,
        respostas: { filtro_limpo: resposta(false), conformidade: resposta('nao_se_aplica') },
      }),
    ).not.toThrow();
  });
});
