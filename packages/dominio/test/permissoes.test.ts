// Aceite da F0-06: "testes de domínio cobrem as regras de concessão".
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  type Escopo,
  type Papel,
  PermissaoNegada,
  RegraViolada,
  exigir,
  podeAtivarHotel,
  podeConcederPapel,
  podeGerenciarCredencialDeAgente,
  podeRevogarPapel,
} from '../src/index';

const AGORA = new Date('2026-09-24T12:00:00Z');
const AMANHA = new Date('2026-09-25T12:00:00Z');
const ONTEM = new Date('2026-09-23T12:00:00Z');
const H1: Escopo = { tipo: 'hotel', hotelId: 'h1' };
const H2: Escopo = { tipo: 'hotel', hotelId: 'h2' };
const GRUPO: Escopo = { tipo: 'grupo' };
const BANDEIRA: Escopo = { tipo: 'bandeira', bandeiraId: 'b1' };
const PROPRIETARIO: Escopo = { tipo: 'proprietario', proprietarioId: 'p1' };

let seq = 0;
const atrib = (papel: Papel, escopo: Escopo, extra: Partial<Atribuicao> = {}): Atribuicao => ({
  id: `a${++seq}`,
  usuarioId: 'concedente',
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
  ...extra,
});

const ADMIN = [atrib('admin_grupo', GRUPO)];
const IMPLANTADOR_H1 = [atrib('implantador', H1, { validoAte: AMANHA })];
const IMPLANTADOR_VENCIDO = [atrib('implantador', H1, { validoAte: ONTEM })];
const IMPLANTADOR_REVOGADO = [atrib('implantador', H1, { validoAte: AMANHA, revogadoEm: ONTEM })];
const ADMIN_REVOGADO = [atrib('admin_grupo', GRUPO, { revogadoEm: ONTEM })];
const GERENTE_H1 = [atrib('gerente_hotel', H1)];

const pedido = (papel: Papel, escopo: Escopo, validoAte: Date | null = null) => ({
  usuarioId: 'alvo',
  papel,
  escopo,
  validoAte,
});

const erroDe = (r: ReturnType<typeof podeConcederPapel>) => (r.permitido ? null : r.erro);

describe('conceder papel — Admin do grupo', () => {
  it.each<[Papel, Escopo, Date | null]>([
    ['admin_grupo', GRUPO, null],
    ['gestor_csc', GRUPO, null],
    ['gestor_csc', BANDEIRA, null],
    ['gerente_hotel', H1, null],
    ['tecnico', H2, null],
    ['solicitante', H1, null],
    ['implantador', H1, AMANHA],
    ['proprietario', PROPRIETARIO, null],
    ['proprietario', H1, null],
  ])('concede %s em %o', (papel, escopo, validade) => {
    expect(podeConcederPapel(ADMIN, pedido(papel, escopo, validade), AGORA)).toEqual({
      permitido: true,
    });
  });

  it.each<[string, Papel, Escopo, Date | null, string]>([
    ['Implantador sem validade', 'implantador', H1, null, 'implantador_exige_hotel_e_validade'],
    [
      'Implantador fora de hotel',
      'implantador',
      GRUPO,
      AMANHA,
      'implantador_exige_hotel_e_validade',
    ],
    ['Proprietário no grupo', 'proprietario', GRUPO, null, 'proprietario_escopo_invalido'],
    ['Proprietário na bandeira', 'proprietario', BANDEIRA, null, 'proprietario_escopo_invalido'],
    [
      'escopo de proprietário para Técnico',
      'tecnico',
      PROPRIETARIO,
      null,
      'escopo_proprietario_so_para_proprietario',
    ],
    ['validade no passado', 'tecnico', H1, ONTEM, 'validade_no_passado'],
    ['validade igual a agora', 'tecnico', H1, AGORA, 'validade_no_passado'],
  ])('recusa pedido inválido: %s', (_n, papel, escopo, validade, codigo) => {
    const erro = erroDe(podeConcederPapel(ADMIN, pedido(papel, escopo, validade), AGORA));
    expect(erro).toBeInstanceOf(RegraViolada);
    expect(erro?.codigo).toBe(codigo);
  });
});

describe('conceder papel — Implantador (sem escalada)', () => {
  it.each<Papel>(['gestor_csc', 'gerente_hotel', 'tecnico', 'solicitante'])(
    'concede %s no hotel em que é Implantador',
    (papel) => {
      expect(podeConcederPapel(IMPLANTADOR_H1, pedido(papel, H1), AGORA)).toEqual({
        permitido: true,
      });
    },
  );

  it.each<[string, Papel, Escopo, Date | null]>([
    ['Admin do grupo', 'admin_grupo', GRUPO, null],
    ['outro Implantador', 'implantador', H1, AMANHA],
    ['Proprietário', 'proprietario', H1, null],
    ['papel no grupo inteiro', 'tecnico', GRUPO, null],
    ['papel numa bandeira', 'gestor_csc', BANDEIRA, null],
    ['papel em hotel onde não é Implantador', 'tecnico', H2, null],
  ])('não concede %s', (_n, papel, escopo, validade) => {
    const erro = erroDe(podeConcederPapel(IMPLANTADOR_H1, pedido(papel, escopo, validade), AGORA));
    expect(erro).toBeInstanceOf(PermissaoNegada);
  });

  it('permissão vem antes da validação: Implantador pedindo Implantador sem validade é 403, não 422', () => {
    const erro = erroDe(podeConcederPapel(IMPLANTADOR_H1, pedido('implantador', H1, null), AGORA));
    expect(erro).toBeInstanceOf(PermissaoNegada);
  });

  it('dentro do alcance, ainda valida o pedido', () => {
    const erro = erroDe(podeConcederPapel(IMPLANTADOR_H1, pedido('tecnico', H1, ONTEM), AGORA));
    expect(erro).toBeInstanceOf(RegraViolada);
  });
});

describe('conceder papel — quem não concede', () => {
  it.each<[string, Atribuicao[]]>([
    ['Implantador com validade vencida', IMPLANTADOR_VENCIDO],
    ['Implantador revogado', IMPLANTADOR_REVOGADO],
    ['Admin do grupo revogado', ADMIN_REVOGADO],
    ['Gerente do hotel', GERENTE_H1],
    ['usuário sem atribuição', []],
  ])('%s não concede nem Técnico no próprio hotel', (_n, atribuicoes) => {
    const erro = erroDe(podeConcederPapel(atribuicoes, pedido('tecnico', H1), AGORA));
    expect(erro).toBeInstanceOf(PermissaoNegada);
    expect(erro?.codigo).toBe('concessao_so_admin_ou_implantador');
  });

  it('o motivo sai como código e parâmetros; a frase fica para log (ADR-022)', () => {
    const erro = erroDe(podeConcederPapel(IMPLANTADOR_H1, pedido('admin_grupo', GRUPO), AGORA));
    expect(erro?.codigo).toBe('implantador_nao_concede_papel');
    expect(erro?.parametros).toEqual({ papel: 'admin_grupo' });
    expect(erro?.message).toBe('O Implantador não concede o papel Admin do grupo.');
  });
});

describe('revogar papel', () => {
  const tecnicoH1 = atrib('tecnico', H1, { usuarioId: 'alvo' });
  const tecnicoH2 = atrib('tecnico', H2, { usuarioId: 'alvo' });
  const adminAlvo = atrib('admin_grupo', GRUPO, { usuarioId: 'alvo' });
  const proprioImplantador = IMPLANTADOR_H1[0] as Atribuicao;

  it('Admin do grupo revoga qualquer atribuição', () => {
    expect(podeRevogarPapel(ADMIN, adminAlvo, AGORA)).toEqual({ permitido: true });
    expect(podeRevogarPapel(ADMIN, tecnicoH2, AGORA)).toEqual({ permitido: true });
  });

  it('Implantador revoga papel comum no próprio hotel', () => {
    expect(podeRevogarPapel(IMPLANTADOR_H1, tecnicoH1, AGORA)).toEqual({ permitido: true });
  });

  it.each<[string, Atribuicao[], Atribuicao]>([
    ['Implantador revogando Admin', IMPLANTADOR_H1, adminAlvo],
    [
      'Implantador revogando a própria concessão de Implantador',
      IMPLANTADOR_H1,
      proprioImplantador,
    ],
    ['Implantador revogando em outro hotel', IMPLANTADOR_H1, tecnicoH2],
    ['Implantador vencido', IMPLANTADOR_VENCIDO, tecnicoH1],
    ['Gerente do hotel', GERENTE_H1, tecnicoH1],
  ])('nega: %s', (_n, atribuicoes, alvo) => {
    const r = podeRevogarPapel(atribuicoes, alvo, AGORA);
    expect(r.permitido ? null : r.erro).toBeInstanceOf(PermissaoNegada);
  });

  it('atribuição já revogada é regra violada, mesmo para o Admin', () => {
    const r = podeRevogarPapel(ADMIN, { ...tecnicoH1, revogadoEm: ONTEM }, AGORA);
    expect(r.permitido ? null : r.erro).toBeInstanceOf(RegraViolada);
  });
});

describe('ativar hotel e exigir()', () => {
  it('só o Admin do grupo ativa hotel', () => {
    expect(podeAtivarHotel(ADMIN, AGORA)).toEqual({ permitido: true });
    expect(podeAtivarHotel(IMPLANTADOR_H1, AGORA).permitido).toBe(false);
  });

  it('só o Admin do grupo cria e revoga credencial do agente conector', () => {
    expect(podeGerenciarCredencialDeAgente(ADMIN, AGORA)).toEqual({ permitido: true });
    const negado = podeGerenciarCredencialDeAgente(IMPLANTADOR_H1, AGORA);
    expect(negado.permitido ? null : negado.erro.codigo).toBe('credencial_de_agente_so_admin');
    expect(podeGerenciarCredencialDeAgente(GERENTE_H1, AGORA).permitido).toBe(false);
  });

  it('exigir() lança o erro do resultado negado e não faz nada no permitido', () => {
    expect(() => exigir(podeAtivarHotel(GERENTE_H1, AGORA))).toThrow(PermissaoNegada);
    expect(() => exigir(podeAtivarHotel(ADMIN, AGORA))).not.toThrow();
  });
});
