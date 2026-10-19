// @hubkeep/contratos não depende do domínio nem do i18n (o conector só conhece
// contratos), então repete a lista de papéis e a de idiomas. Este teste impede
// que divirjam.
import { describe, expect, it } from 'vitest';
import {
  CHAVES_DE_POLITICA_API,
  FORMATOS_DE_POLITICA_API,
  IDIOMAS_API,
  MOMENTOS_DA_FOTO_API,
  MOTIVOS_DE_PAUSA_API,
  RESPONSAVEIS_DO_ARRENDAMENTO_API,
  CANAIS_DE_ENVIO_API,
  DESTINATARIOS_DO_AVISO_API,
  NIVEIS_DO_AVISO_API,
  TIPOS_DE_ALERTA_DE_SLA_API,
  PAPEIS_API,
  CATEGORIAS_PADRAO_API,
  PENDENCIAS_DE_IMPLANTACAO_API,
  MODELOS_CONTRATUAIS_API,
  TIPOS_DE_CAMPO_API,
  STATUS_DE_LOCAL_API,
  TIPOS_DE_LOCAL_API,
  ACOES_DA_OS_API,
  ACOES_DO_CHAMADO_API,
  ENTIDADES_COM_SITUACAO_API,
  ENTIDADES_COM_HISTORICO_API,
  ENTIDADES_DA_LINHA_DO_TEMPO_API,
  EXECUTORES_DA_OS_API,
  ORIGENS_DO_CHAMADO_API,
  ESTADOS_DA_OS_API,
  ESTADOS_DO_CHAMADO_API,
  PRIORIDADES_PADRAO_API,
  PREFIXOS_DO_NUCLEO_API,
  PedidoDePolitica,
  TIPOS_DE_CODIGO_DE_MANUTENCAO_API,
  ACOES_DO_PLANO_API,
  PENDENCIAS_DO_PLANO_API,
  SITUACOES_DO_PLANO_API,
  UNIDADES_DE_PERIODICIDADE_API,
  DECISOES_DO_CADASTRO_API,
  SITUACOES_DO_CADASTRO_API,
} from '../packages/contratos/src/index';
import type { StatusDeLocal, TipoDeLocal } from '../packages/dominio/src/index';
import {
  CATEGORIAS_PADRAO,
  DECISOES_DO_CADASTRO,
  SITUACOES_DO_CADASTRO,
  IDIOMAS_DE_ROTULO,
  TIPOS_DE_CAMPO,
  CHAVES_DE_POLITICA,
  PAPEIS,
  PENDENCIAS_DE_IMPLANTACAO,
  MODELOS_CONTRATUAIS,
  MOMENTOS_DA_FOTO,
  MOTIVOS_DE_PAUSA,
  RESPONSAVEIS_DO_ARRENDAMENTO,
  CANAIS_DE_ENVIO,
  DESTINATARIOS_DO_AVISO,
  NIVEIS_DO_AVISO,
  TIPOS_DE_ALERTA_DE_SLA,
  ESCALONAMENTO_PADRAO,
  HORARIO_PADRAO,
  POLITICAS,
  SLA_PADRAO,
  ACOES_DA_OS,
  ACOES_DO_CHAMADO,
  ENTIDADES_COM_SITUACAO,
  ENTIDADES_COM_HISTORICO,
  ENTIDADES_DA_LINHA_DO_TEMPO,
  EXECUTORES_DA_OS,
  ORIGENS_DO_CHAMADO,
  ESTADOS_DA_OS,
  ESTADOS_DO_CHAMADO,
  PRIORIDADES_PADRAO,
  PREFIXOS_DO_NUCLEO,
  TIPOS_DE_CODIGO_DE_MANUTENCAO,
  ACOES_DO_PLANO,
  PENDENCIAS_DO_PLANO,
  SITUACOES_DO_PLANO,
  UNIDADES_DE_PERIODICIDADE,
} from '../packages/dominio/src/index';
import { IDIOMAS } from '../packages/i18n/src/index';

describe('contratos × domínio', () => {
  it('os papéis aceitos pela API são exatamente os do domínio', () => {
    expect([...PAPEIS_API]).toEqual([...PAPEIS]);
  });

  it('os idiomas aceitos pela API são exatamente os do @hubkeep/i18n', () => {
    expect([...IDIOMAS_API]).toEqual([...IDIOMAS]);
  });

  it('chave de módulo: a API aceita texto fora dos prefixos do núcleo, que são os do domínio', () => {
    expect([...PREFIXOS_DO_NUCLEO_API]).toEqual([...PREFIXOS_DO_NUCLEO]);
    const pedido = (chave: string, valor: unknown) =>
      PedidoDePolitica.safeParse({ chave, escopo: { tipo: 'grupo' }, valor }).success;
    expect(pedido('inteligencia.atencao_ativo', { limite: 70 })).toBe(true);
    expect(pedido('inteligencia.atencao_ativo', null)).toBe(true);
    // Chave do núcleo com valor fora do formato não escapa pelo ramo da extensão.
    expect(pedido('os.aceite_automatico', { ligado: true, dias: 0 })).toBe(false);
    expect(pedido('os.nao_existe', {})).toBe(false);
    expect(pedido('ativo.criticidade', {})).toBe(true);
    expect(pedido('ativo.nao_existe', {})).toBe(false);
    expect(pedido('sem_ponto', {})).toBe(false);
    expect(pedido('inteligencia.atencao_ativo', undefined)).toBe(false);
    expect(pedido('Maiuscula.x', {})).toBe(false);
  });

  it('as políticas da API são as do domínio, com o mesmo formato (ADR-026)', () => {
    expect([...CHAVES_DE_POLITICA_API].sort()).toEqual([...CHAVES_DE_POLITICA].sort());
    const U = '0193a000-0000-4000-8000-000000000001';
    const linha = (atendimentoHoras: number, solucaoHoras: number, relogio: string) => ({
      atendimentoHoras,
      solucaoHoras,
      relogio,
    });
    const intervalo = (n: number) => ({ inicio: `0${n}:00`, fim: `0${n}:30` });
    const amostras: Record<(typeof CHAVES_DE_POLITICA)[number], unknown[]> = {
      'os.aceite_automatico': [
        { ligado: true, dias: 1 },
        { ligado: false, dias: 60 },
        { ligado: true, dias: 0 },
        { ligado: true, dias: 61 },
        { ligado: true, dias: 2.5 },
        { ligado: 'sim', dias: 7 },
        { ligado: true, dias: 7, extra: 1 },
        { ligado: true },
        [true, 7],
        null,
      ],
      'os.codigos_obrigatorios': [
        { ligado: true },
        { ligado: false },
        { ligado: 'sim' },
        { ligado: true, extra: 1 },
        {},
        true,
        null,
      ],
      'os.foto_depois_obrigatoria': [
        { ligado: true },
        { ligado: false },
        { ligado: 1 },
        { ligado: true, extra: 1 },
        {},
        false,
        null,
      ],
      'os.assinatura_no_aceite': [
        { ligado: true },
        { ligado: false },
        { ligado: 'nao' },
        { ligado: false, extra: 1 },
        {},
        [],
        null,
      ],
      'ativo.aprovacao_do_cadastro': [
        { ligado: true },
        { ligado: false },
        { ligado: 0 },
        { ligado: true, extra: 1 },
        {},
        'sim',
        null,
      ],
      'os.checklist_completo_obrigatorio': [
        { ligado: true },
        { ligado: false },
        { ligado: 0 },
        { ligado: true, extra: 1 },
        {},
        'sim',
        null,
      ],
      'chamado.prioridade_padrao_por_categoria': [
        {},
        { [U]: U },
        { x: U },
        { [U]: 'x' },
        { [U]: 1 },
        [],
        null,
      ],
      'ativo.criticidade': [
        {},
        { 1: { 'pt-BR': 'Baixa', en: 'Low' }, 5: { fr: 'Critique' } },
        { 3: {} },
        { 6: { 'pt-BR': 'Seis' } },
        { 0: { 'pt-BR': 'Zero' } },
        { 1: { de: 'Niedrig' } },
        { 1: { 'pt-BR': '   ' } },
        { 1: { 'pt-BR': ' Baixa ' } },
        { 1: { 'pt-BR': 'x'.repeat(121) } },
        { 1: 'Baixa' },
        { 1: { 'pt-BR': 1 } },
        [],
        null,
      ],
      'chamado.sla': [
        SLA_PADRAO,
        { ...SLA_PADRAO, porPrioridade: { [U]: linha(4, 4, '24x7') } },
        { ...SLA_PADRAO, porPrioridade: {} },
        { ...SLA_PADRAO, porPrioridade: { critica: linha(1, 2, '24x7') } },
        { ...SLA_PADRAO, porPrioridade: { urgente: linha(3, 2, '24x7') } },
        { ...SLA_PADRAO, porPrioridade: { urgente: linha(0.25, 2160, 'atendimento') } },
        { ...SLA_PADRAO, porPrioridade: { urgente: linha(0.3, 2, '24x7') } },
        { ...SLA_PADRAO, porPrioridade: { urgente: linha(1, 2161, '24x7') } },
        { ...SLA_PADRAO, porPrioridade: { urgente: linha(0, 2, '24x7') } },
        { ...SLA_PADRAO, porPrioridade: { urgente: linha(1, 2, 'comercial') } },
        { ...SLA_PADRAO, porPrioridade: { urgente: { ...linha(1, 2, '24x7'), extra: 1 } } },
        { ...SLA_PADRAO, porCategoria: { [U]: { pausa: true } } },
        { ...SLA_PADRAO, porCategoria: { [U]: { relogio: '24x7', solucaoHoras: 4 } } },
        { ...SLA_PADRAO, porCategoria: { [U]: {} } },
        { ...SLA_PADRAO, porCategoria: { [U]: { atendimentoHoras: 5, solucaoHoras: 4 } } },
        { ...SLA_PADRAO, porCategoria: { [U]: { pausa: 'sim' } } },
        { ...SLA_PADRAO, porCategoria: { [U]: { cor: 'azul' } } },
        { ...SLA_PADRAO, porCategoria: { x: { pausa: true } } },
        { ...SLA_PADRAO, motivosQuePausam: [] },
        { ...SLA_PADRAO, motivosQuePausam: ['aguardando_peca', 'aguardando_peca'] },
        { ...SLA_PADRAO, motivosQuePausam: ['almoco'] },
        { ...SLA_PADRAO, pontoFacultativo: 'nao' },
        { ...SLA_PADRAO, metaPercentual: 0 },
        { ...SLA_PADRAO, metaPercentual: 100 },
        { ...SLA_PADRAO, metaPercentual: 90.5 },
        { ...SLA_PADRAO, extra: 1 },
        { porPrioridade: SLA_PADRAO.porPrioridade },
        [],
        null,
      ],
      'hotel.horario_atendimento': [
        HORARIO_PADRAO,
        { ...HORARIO_PADRAO, dom: [{ inicio: '00:00', fim: '24:00' }] },
        {
          ...HORARIO_PADRAO,
          seg: [
            { inicio: '08:00', fim: '12:00' },
            { inicio: '12:00', fim: '18:00' },
          ],
        },
        {
          ...HORARIO_PADRAO,
          seg: [
            { inicio: '13:00', fim: '18:00' },
            { inicio: '08:00', fim: '12:00' },
          ],
        },
        {
          ...HORARIO_PADRAO,
          seg: [
            { inicio: '08:00', fim: '12:30' },
            { inicio: '12:00', fim: '18:00' },
          ],
        },
        { ...HORARIO_PADRAO, seg: [{ inicio: '18:00', fim: '08:00' }] },
        { ...HORARIO_PADRAO, seg: [{ inicio: '08:00', fim: '08:00' }] },
        { ...HORARIO_PADRAO, seg: [{ inicio: '24:00', fim: '24:00' }] },
        { ...HORARIO_PADRAO, seg: [{ inicio: '8:00', fim: '18:00' }] },
        { ...HORARIO_PADRAO, seg: [{ inicio: '08:00', fim: '18:60' }] },
        { ...HORARIO_PADRAO, seg: [{ inicio: '08:00', fim: '18:00', extra: 1 }] },
        { ...HORARIO_PADRAO, seg: Array.from({ length: 5 }, (_, n) => intervalo(n)) },
        { dom: [], seg: [], ter: [], qua: [], qui: [], sex: [], sab: [] },
        { ...HORARIO_PADRAO, feriado: [] },
        { seg: HORARIO_PADRAO.seg },
        [],
        null,
      ],
      'chamado.escalonamento': [
        ESCALONAMENTO_PADRAO,
        { ...ESCALONAMENTO_PADRAO, percentualDoAviso: 50 },
        { ...ESCALONAMENTO_PADRAO, percentualDoAviso: 95, vencido: ['admin_grupo'] },
        { ...ESCALONAMENTO_PADRAO, percentualDoAviso: 49 },
        { ...ESCALONAMENTO_PADRAO, percentualDoAviso: 96 },
        { ...ESCALONAMENTO_PADRAO, percentualDoAviso: 80.5 },
        { ...ESCALONAMENTO_PADRAO, emRisco: [] },
        { ...ESCALONAMENTO_PADRAO, emRisco: ['gerente_hotel', 'gerente_hotel'] },
        { ...ESCALONAMENTO_PADRAO, vencido: ['tecnico'] },
        { ...ESCALONAMENTO_PADRAO, extra: 1 },
        { percentualDoAviso: 80, emRisco: ['gerente_hotel'] },
        [],
        null,
      ],
      'hotel.matriz_arrendamento': [
        {},
        { [U]: 'locador' },
        { [U]: 'arrendataria' },
        { [U]: 'proprietario' },
        { [U]: null },
        { x: 'locador' },
        Object.fromEntries(
          Array.from({ length: 201 }, (_, n) => [
            `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`,
            'locador',
          ]),
        ),
        [],
        'locador',
        null,
      ],
    };
    for (const chave of CHAVES_DE_POLITICA) {
      expect(FORMATOS_DE_POLITICA_API[chave].safeParse(POLITICAS[chave].padrao).success).toBe(true);
      for (const v of amostras[chave]) {
        expect([chave, v, FORMATOS_DE_POLITICA_API[chave].safeParse(v).success]).toEqual([
          chave,
          v,
          POLITICAS[chave].valido(v),
        ]);
      }
    }
  });

  it('os destinatários do aviso do monitor de SLA da API são os do domínio (ADR-043)', () => {
    expect([...DESTINATARIOS_DO_AVISO_API]).toEqual([...DESTINATARIOS_DO_AVISO]);
  });

  it('os tipos e os níveis dos avisos de SLA da API são os do domínio (ADR-043, M4)', () => {
    expect([...TIPOS_DE_ALERTA_DE_SLA_API]).toEqual([...TIPOS_DE_ALERTA_DE_SLA]);
    expect([...NIVEIS_DO_AVISO_API]).toEqual([...NIVEIS_DO_AVISO]);
  });

  it('os responsáveis do arrendado da API são os do domínio (decisão 5)', () => {
    expect([...RESPONSAVEIS_DO_ARRENDAMENTO_API]).toEqual([...RESPONSAVEIS_DO_ARRENDAMENTO]);
    expect([...CANAIS_DE_ENVIO_API]).toEqual([...CANAIS_DE_ENVIO]);
  });

  it('os motivos da pausa da API são os do domínio (ADR-042)', () => {
    expect([...MOTIVOS_DE_PAUSA_API]).toEqual([...MOTIVOS_DE_PAUSA]);
  });

  it('os momentos da foto da OS da API são os do domínio (I8)', () => {
    expect([...MOMENTOS_DA_FOTO_API]).toEqual([...MOMENTOS_DA_FOTO]);
  });

  it('a unidade, a situação e as ações do plano preventivo da API são as do domínio (PV2)', () => {
    expect([...UNIDADES_DE_PERIODICIDADE_API]).toEqual([...UNIDADES_DE_PERIODICIDADE]);
    expect([...SITUACOES_DO_PLANO_API]).toEqual([...SITUACOES_DO_PLANO]);
    expect([...ACOES_DO_PLANO_API]).toEqual([...ACOES_DO_PLANO]);
  });

  it('as situações e as decisões do cadastro do ativo da API são as do domínio (M4)', () => {
    expect([...SITUACOES_DO_CADASTRO_API]).toEqual([...SITUACOES_DO_CADASTRO]);
    expect([...DECISOES_DO_CADASTRO_API]).toEqual([...DECISOES_DO_CADASTRO]);
  });

  it('as pendências do plano preventivo da API são as do domínio (PV3c)', () => {
    expect([...PENDENCIAS_DO_PLANO_API]).toEqual([...PENDENCIAS_DO_PLANO]);
  });

  it('as pendências do painel de implantação são as do domínio', () => {
    expect([...PENDENCIAS_DE_IMPLANTACAO_API]).toEqual([...PENDENCIAS_DE_IMPLANTACAO]);
  });

  it('os modelos contratuais do hotel da API são os do domínio (I2)', () => {
    expect([...MODELOS_CONTRATUAIS_API]).toEqual([...MODELOS_CONTRATUAIS]);
  });

  it('tipos e status de local da API são os do domínio e do banco (B1)', () => {
    const tipos: readonly TipoDeLocal[] = TIPOS_DE_LOCAL_API;
    const status: readonly StatusDeLocal[] = STATUS_DE_LOCAL_API;
    expect([...tipos].sort()).toEqual(['area_comum', 'uh']);
    expect([...status].sort()).toEqual(['ativo', 'inativo', 'pendente_licenca']);
  });

  it('tipos de campo, categorias padrão e idiomas de rótulo da API são os do domínio (ADR-028)', () => {
    expect([...TIPOS_DE_CAMPO_API]).toEqual([...TIPOS_DE_CAMPO]);
    expect([...CATEGORIAS_PADRAO_API]).toEqual([...CATEGORIAS_PADRAO]);
    expect([...IDIOMAS_DE_ROTULO]).toEqual([...IDIOMAS]);
  });

  it('estados, ações, entidades com situação e prioridades padrão da API são os do domínio (ADR-027)', () => {
    expect([...ESTADOS_DO_CHAMADO_API]).toEqual([...ESTADOS_DO_CHAMADO]);
    expect([...ESTADOS_DA_OS_API]).toEqual([...ESTADOS_DA_OS]);
    expect([...ACOES_DO_CHAMADO_API]).toEqual([...ACOES_DO_CHAMADO]);
    expect([...ACOES_DA_OS_API]).toEqual([...ACOES_DA_OS]);
    expect([...ENTIDADES_COM_SITUACAO_API]).toEqual([...ENTIDADES_COM_SITUACAO]);
    expect([...PRIORIDADES_PADRAO_API]).toEqual(PRIORIDADES_PADRAO.map((p) => p.chave));
  });

  it('as entidades da linha do tempo da API são as do domínio (C7)', () => {
    expect([...ENTIDADES_DA_LINHA_DO_TEMPO_API]).toEqual([...ENTIDADES_DA_LINHA_DO_TEMPO]);
  });

  it('a origem do chamado e quem executa a OS na API são os do domínio (I4)', () => {
    expect([...ORIGENS_DO_CHAMADO_API]).toEqual([...ORIGENS_DO_CHAMADO]);
    expect([...EXECUTORES_DA_OS_API]).toEqual([...EXECUTORES_DA_OS]);
  });

  it('os tipos de código de manutenção da API são os do domínio (I6)', () => {
    expect([...TIPOS_DE_CODIGO_DE_MANUTENCAO_API]).toEqual([...TIPOS_DE_CODIGO_DE_MANUTENCAO]);
  });

  it('as entidades com histórico da API são as do domínio (D1)', () => {
    expect([...ENTIDADES_COM_HISTORICO_API]).toEqual([...ENTIDADES_COM_HISTORICO]);
  });
});
