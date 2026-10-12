// Leitura do pedido de provisionamento e da turma do kit, sem conexão nenhuma.
import { describe, expect, it } from 'vitest';
import { idDoGrupo, lerPedidoDeProvisionamento } from '../scripts/ops/provisionamento.ts';
import { lerTurma } from '../scripts/ops/turma.ts';

const BASE = [
  '--nome',
  'Grupo Exemplo',
  '--admin-email',
  'Pessoa@Cliente.com.br',
  '--admin-nome',
  'Pessoa Exemplo',
  '--max-hoteis',
  '4',
  '--max-uhs',
  '600',
  '--por',
  'Cesar',
];

function erroDe(fn: () => void): string {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return 'não falhou';
}

describe('lerPedidoDeProvisionamento', () => {
  it('lê o pedido completo; o e-mail vai em minúsculas e o grupo é novo', () => {
    const p = lerPedidoDeProvisionamento(BASE);
    expect(p).toEqual({
      tenant: null,
      nome: 'Grupo Exemplo',
      adminEmail: 'pessoa@cliente.com.br',
      adminNome: 'Pessoa Exemplo',
      maxHoteis: 4,
      maxUhs: 600,
      por: 'Cesar',
    });
    expect(idDoGrupo(p)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('com --tenant, completa o grupo informado', () => {
    const id = '0199a1f0-de30-7000-8000-00000000abcd';
    const p = lerPedidoDeProvisionamento([...BASE, '--tenant', id]);
    expect(idDoGrupo(p)).toBe(id);
    expect(erroDe(() => lerPedidoDeProvisionamento([...BASE, '--tenant', 'x']))).toMatch(
      /--tenant precisa ser o id/,
    );
  });

  it('cada argumento obrigatório faz falta', () => {
    for (const nome of [
      '--nome',
      '--admin-email',
      '--admin-nome',
      '--max-hoteis',
      '--max-uhs',
      '--por',
    ]) {
      const i = BASE.indexOf(nome);
      const sem = [...BASE.slice(0, i), ...BASE.slice(i + 2)];
      expect(erroDe(() => lerPedidoDeProvisionamento(sem))).toContain(nome);
    }
  });

  it('recusa limite fora da faixa, e-mail inválido e e-mail .test do kit', () => {
    const trocar = (nome: string, v: string) => {
      const a = [...BASE];
      a[a.indexOf(nome) + 1] = v;
      return a;
    };
    expect(erroDe(() => lerPedidoDeProvisionamento(trocar('--max-hoteis', '0')))).toMatch(
      /1 a 1000/,
    );
    expect(erroDe(() => lerPedidoDeProvisionamento(trocar('--max-uhs', '2,5')))).toMatch(/inteiro/);
    expect(erroDe(() => lerPedidoDeProvisionamento(trocar('--admin-email', 'sem-arroba')))).toMatch(
      /não é um e-mail/,
    );
    expect(
      erroDe(() => lerPedidoDeProvisionamento(trocar('--admin-email', 'admin@demo.hubkeep.test'))),
    ).toMatch(/kit de teste/);
  });
});

describe('lerTurma', () => {
  it('sem --turma é o grupo de sempre; com ela, de 1 a 99', () => {
    expect(lerTurma(['--ambiente', 'dev'])).toBeNull();
    expect(lerTurma(['--turma', '2'])).toBe(2);
    expect(lerTurma(['--turma', '99'])).toBe(99);
    for (const v of ['0', '100', 'dois', '', '1.5']) {
      expect(erroDe(() => lerTurma(['--turma', v]))).toMatch(/de 1 a 99/);
    }
    expect(erroDe(() => lerTurma(['--turma']))).toMatch(/de 1 a 99/);
  });
});
