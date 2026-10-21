import { describe, expect, it } from 'vitest';
import type { Atribuicao } from '../src/index';
import {
  podeAlterarAtivoDoMembro,
  podeAlterarValidade,
  podeGerirMembros,
  podeRemoverSegundoFator,
} from '../src/membros';

const AGORA = new Date('2026-09-27T12:00:00Z');
const FUTURO = new Date('2026-12-31T00:00:00Z');
const PASSADO = new Date('2026-09-01T00:00:00Z');

let n = 0;
const atr = (
  papel: Atribuicao['papel'],
  escopo: Atribuicao['escopo'],
  extra: Partial<Atribuicao> = {},
): Atribuicao => ({
  id: `a${++n}`,
  usuarioId: 'x',
  papel,
  escopo,
  validoAte: papel === 'implantador' ? FUTURO : null,
  revogadoEm: null,
  ...extra,
});
const admin = [atr('admin_grupo', { tipo: 'grupo' })];
const implantadorH1 = [atr('implantador', { tipo: 'hotel', hotelId: 'h1' })];
const gerenteH1 = [atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' })];
const codigo = (r: ReturnType<typeof podeGerirMembros>) => (r.permitido ? 'ok' : r.erro.codigo);

describe('gerir membros', () => {
  it('Admin e Implantador vigente gerenciam; gerente e implantador vencido não', () => {
    expect(codigo(podeGerirMembros(admin, AGORA))).toBe('ok');
    expect(codigo(podeGerirMembros(implantadorH1, AGORA))).toBe('ok');
    expect(codigo(podeGerirMembros(gerenteH1, AGORA))).toBe(
      'gestao_de_membros_so_admin_ou_implantador',
    );
    const vencido = [atr('implantador', { tipo: 'hotel', hotelId: 'h1' }, { validoAte: PASSADO })];
    expect(codigo(podeGerirMembros(vencido, AGORA))).toBe(
      'gestao_de_membros_so_admin_ou_implantador',
    );
  });
});

describe('desativar ou reativar membro', () => {
  it('ninguém altera o próprio acesso', () => {
    expect(codigo(podeAlterarAtivoDoMembro(admin, 'eu', { usuarioId: 'eu' }, AGORA))).toBe(
      'nao_altera_o_proprio_acesso',
    );
  });

  it('só o Admin do grupo: o Implantador revoga papéis no hotel, não desativa no tenant', () => {
    expect(codigo(podeAlterarAtivoDoMembro(admin, 'eu', { usuarioId: 'alvo' }, AGORA))).toBe('ok');
    expect(
      codigo(podeAlterarAtivoDoMembro(implantadorH1, 'eu', { usuarioId: 'alvo' }, AGORA)),
    ).toBe('ativacao_de_membro_so_admin');
    expect(codigo(podeAlterarAtivoDoMembro(gerenteH1, 'eu', { usuarioId: 'alvo' }, AGORA))).toBe(
      'ativacao_de_membro_so_admin',
    );
  });
});

describe('remover o segundo fator (SP1)', () => {
  it('só o Admin do grupo, e nunca o próprio', () => {
    const remover = (minhas: Atribuicao[], alvo: string) =>
      codigo(podeRemoverSegundoFator(minhas, 'eu', { usuarioId: alvo }, AGORA));
    expect(remover(admin, 'alvo')).toBe('ok');
    expect(remover(admin, 'eu')).toBe('nao_remove_o_proprio_segundo_fator');
    expect(remover(implantadorH1, 'alvo')).toBe('segundo_fator_so_admin');
    expect(remover(gerenteH1, 'alvo')).toBe('segundo_fator_so_admin');
  });

  it('o Admin vencido ou revogado não remove', () => {
    const revogado = [atr('admin_grupo', { tipo: 'grupo' }, { revogadoEm: PASSADO })];
    expect(codigo(podeRemoverSegundoFator(revogado, 'eu', { usuarioId: 'alvo' }, AGORA))).toBe(
      'segundo_fator_so_admin',
    );
  });
});

describe('alterar validade', () => {
  const implantadorAlvo = atr('implantador', { tipo: 'hotel', hotelId: 'h1' });
  const tecnicoH1 = atr('tecnico', { tipo: 'hotel', hotelId: 'h1' });
  const tecnicoH2 = atr('tecnico', { tipo: 'hotel', hotelId: 'h2' });

  it('Admin prorroga o Implantador; sem validade ou no passado, não', () => {
    expect(codigo(podeAlterarValidade(admin, implantadorAlvo, FUTURO, AGORA))).toBe('ok');
    expect(codigo(podeAlterarValidade(admin, implantadorAlvo, null, AGORA))).toBe(
      'implantador_exige_hotel_e_validade',
    );
    expect(codigo(podeAlterarValidade(admin, implantadorAlvo, PASSADO, AGORA))).toBe(
      'validade_no_passado',
    );
  });

  it('Implantador: papéis abaixo dele, nos hotéis dele; nunca outro Implantador', () => {
    expect(codigo(podeAlterarValidade(implantadorH1, tecnicoH1, FUTURO, AGORA))).toBe('ok');
    expect(codigo(podeAlterarValidade(implantadorH1, tecnicoH1, null, AGORA))).toBe('ok');
    expect(codigo(podeAlterarValidade(implantadorH1, tecnicoH2, FUTURO, AGORA))).toBe(
      'nao_e_implantador_no_hotel_da_atribuicao',
    );
    expect(codigo(podeAlterarValidade(implantadorH1, implantadorAlvo, FUTURO, AGORA))).toBe(
      'implantador_nao_altera_validade_do_papel',
    );
  });

  it('revogada e quem não gerencia', () => {
    expect(
      codigo(podeAlterarValidade(admin, { ...tecnicoH1, revogadoEm: PASSADO }, FUTURO, AGORA)),
    ).toBe('ja_revogada');
    expect(codigo(podeAlterarValidade(gerenteH1, tecnicoH1, FUTURO, AGORA))).toBe(
      'validade_so_admin_ou_implantador',
    );
  });
});
