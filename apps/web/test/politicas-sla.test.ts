// Formulários das políticas do SLA (fase 1c; ADR-042 e ADR-043): o FormData da
// tela /admin/sla vira o valor que a API recebe, e o valor bem preenchido passa
// nos validadores do domínio, os mesmos que a API usa.
import {
  ESCALONAMENTO_PADRAO,
  HORARIO_PADRAO,
  SLA_PADRAO,
  escalonamentoValido,
  horarioDeAtendimentoValido,
  politicaDeSlaValida,
} from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  chaveDaLinha,
  escalonamentoDoFormulario,
  horarioDoFormulario,
  slaDoFormulario,
} from '../src/cliente/politicas-sla';

const P_URGENTE = '01900000-0000-7000-8000-000000000001';
const P_PROPRIA = '01900000-0000-7000-8000-000000000002';
const P_INATIVA = '01900000-0000-7000-8000-000000000003';
const C_AR = '01900000-0000-7000-8000-0000000000a1';
const C_INATIVA = '01900000-0000-7000-8000-0000000000a2';

const LINHA_ALTA = { atendimentoHoras: 2, solucaoHoras: 8, relogio: '24x7' as const };
const LINHA_URGENTE = { atendimentoHoras: 1, solucaoHoras: 2, relogio: '24x7' as const };

const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

describe('chaveDaLinha', () => {
  it('o id, se a política tem linha por ele; senão a chave padrão com linha; senão o id', () => {
    const sla = {
      porPrioridade: {
        [P_PROPRIA]: LINHA_ALTA,
        urgente: LINHA_URGENTE,
      },
    };
    expect(chaveDaLinha(sla, { id: P_PROPRIA, chavePadrao: null })).toBe(P_PROPRIA);
    expect(chaveDaLinha(sla, { id: P_URGENTE, chavePadrao: 'urgente' })).toBe('urgente');
    expect(chaveDaLinha(sla, { id: P_URGENTE, chavePadrao: 'baixa' })).toBe(P_URGENTE);
  });
});

describe('slaDoFormulario', () => {
  const prioridades = [
    { id: P_URGENTE, chavePadrao: 'urgente' },
    { id: P_PROPRIA, chavePadrao: null },
  ];
  const atual = {
    ...SLA_PADRAO,
    porPrioridade: {
      ...SLA_PADRAO.porPrioridade,
      [P_INATIVA]: { atendimentoHoras: 3, solucaoHoras: 6, relogio: '24x7' as const },
    },
    porCategoria: { [C_INATIVA]: { pausa: true } },
  };

  it('grava a linha na chave em que está, cria a da prioridade nova e mantém as que a tela não mostra', () => {
    const valor = slaDoFormulario(
      formulario({
        [`prioridade.${P_URGENTE}.atendimento`]: '0,5',
        [`prioridade.${P_URGENTE}.solucao`]: '2',
        [`prioridade.${P_URGENTE}.relogio`]: '24x7',
        [`prioridade.${P_PROPRIA}.atendimento`]: '4',
        [`prioridade.${P_PROPRIA}.solucao`]: '12',
        [`prioridade.${P_PROPRIA}.relogio`]: 'atendimento',
        [`categoria.${C_AR}.solucao`]: '6',
        [`categoria.${C_AR}.relogio`]: '',
        [`categoria.${C_AR}.pausa`]: 'on',
        'motivo.aguardando_peca': 'on',
        'motivo.fim_de_turno': 'on',
        pontoFacultativo: 'on',
        metaPercentual: '95',
      }),
      atual,
      prioridades,
      [{ id: C_AR }],
    );
    expect(valor.porPrioridade['urgente']).toEqual({
      atendimentoHoras: 0.5,
      solucaoHoras: 2,
      relogio: '24x7',
    });
    expect(valor.porPrioridade[P_URGENTE]).toBeUndefined();
    expect(valor.porPrioridade[P_PROPRIA]).toEqual({
      atendimentoHoras: 4,
      solucaoHoras: 12,
      relogio: 'atendimento',
    });
    expect(valor.porPrioridade[P_INATIVA]).toEqual(atual.porPrioridade[P_INATIVA]);
    expect(valor.porPrioridade['alta']).toEqual(SLA_PADRAO.porPrioridade['alta']);
    expect(valor.porCategoria).toEqual({
      [C_INATIVA]: { pausa: true },
      [C_AR]: { solucaoHoras: 6, pausa: true },
    });
    expect(valor.motivosQuePausam).toEqual(['aguardando_peca', 'fim_de_turno']);
    expect(valor.pontoFacultativo).toBe(true);
    expect(valor.metaPercentual).toBe(95);
    expect(politicaDeSlaValida(valor)).toBe(true);
  });

  it('as duas horas em branco tiram a linha; a categoria sem nenhum campo sai das exceções', () => {
    const valor = slaDoFormulario(
      formulario({ metaPercentual: '90' }),
      { ...SLA_PADRAO, porCategoria: { [C_AR]: { atendimentoHoras: 1 } } },
      prioridades,
      [{ id: C_AR }],
    );
    expect(valor.porPrioridade['urgente']).toBeUndefined();
    expect(valor.porCategoria).toEqual({});
    expect(valor.motivosQuePausam).toEqual([]);
    expect(politicaDeSlaValida(valor)).toBe(true);
  });

  it('a linha pela metade vai como está, e o domínio recusa', () => {
    const valor = slaDoFormulario(
      formulario({ [`prioridade.${P_PROPRIA}.atendimento`]: '4', metaPercentual: '90' }),
      SLA_PADRAO,
      prioridades,
      [],
    );
    expect(Number.isNaN(valor.porPrioridade[P_PROPRIA]?.solucaoHoras)).toBe(true);
    expect(politicaDeSlaValida(valor)).toBe(false);
  });
});

describe('horarioDoFormulario', () => {
  it('cada dia com os intervalos preenchidos, em ordem de início; o fim pode ser 24:00', () => {
    const valor = horarioDoFormulario(
      formulario({
        'horario.seg.0.inicio': '13:00',
        'horario.seg.0.fim': '18:00',
        'horario.seg.1.inicio': '08:00',
        'horario.seg.1.fim': '12:00',
        'horario.sab.0.inicio': '20:00',
        'horario.sab.0.fim': '24:00',
      }),
    );
    expect(valor.seg).toEqual([
      { inicio: '08:00', fim: '12:00' },
      { inicio: '13:00', fim: '18:00' },
    ]);
    expect(valor.sab).toEqual([{ inicio: '20:00', fim: '24:00' }]);
    expect(valor.dom).toEqual([]);
    expect(Object.keys(valor)).toEqual(Object.keys(HORARIO_PADRAO));
    expect(horarioDeAtendimentoValido(valor)).toBe(true);
  });

  it('a semana sem nenhum intervalo vai vazia, e o domínio recusa', () => {
    expect(horarioDeAtendimentoValido(horarioDoFormulario(formulario({})))).toBe(false);
  });
});

describe('escalonamentoDoFormulario', () => {
  it('o percentual e quem recebe cada nível, na ordem do domínio', () => {
    const valor = escalonamentoDoFormulario(
      formulario({
        percentualDoAviso: '75',
        'emRisco.gerente_hotel': 'on',
        'emRisco.responsavel_da_os': 'on',
        'vencido.admin_grupo': 'on',
      }),
    );
    expect(valor).toEqual({
      percentualDoAviso: 75,
      emRisco: ['responsavel_da_os', 'gerente_hotel'],
      vencido: ['admin_grupo'],
    });
    expect(escalonamentoValido(valor)).toBe(true);
    expect(escalonamentoValido({ ...ESCALONAMENTO_PADRAO, vencido: [] })).toBe(false);
  });
});
