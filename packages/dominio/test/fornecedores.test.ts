// Fornecedor mínimo do grupo (fase 1b, I3): quem grava, o CNPJ com os dígitos
// verificadores, o nome e o contato.
import { describe, expect, it } from 'vitest';
import type { Atribuicao } from '../src/index';
import {
  cnpjDeFornecedorRepetido,
  cnpjValido,
  exigirHotelParaGerirFornecedores,
  formatarCnpj,
  normalizarContatoDeFornecedor,
  normalizarNomeDeFornecedor,
  podeGerirFornecedores,
  validarCnpj,
  validarDadosDeFornecedor,
} from '../src/fornecedores';

const AGORA = new Date('2026-10-08T12:00:00Z');
const atr = (
  papel: Atribuicao['papel'],
  escopo: Atribuicao['escopo'],
  validoAte: Date | null = null,
): Atribuicao => ({ id: 'a', usuarioId: 'u', papel, escopo, validoAte, revogadoEm: null });

const codigo = (r: ReturnType<typeof podeGerirFornecedores>) =>
  r.permitido ? 'ok' : r.erro.codigo;

describe('podeGerirFornecedores', () => {
  it('Admin do grupo, Gestor CSC e Gerente do hotel gravam', () => {
    expect(codigo(podeGerirFornecedores([atr('admin_grupo', { tipo: 'grupo' })], AGORA))).toBe(
      'ok',
    );
    expect(
      codigo(
        podeGerirFornecedores([atr('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b' })], AGORA),
      ),
    ).toBe('ok');
    expect(
      codigo(podeGerirFornecedores([atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h' })], AGORA)),
    ).toBe('ok');
  });

  it('Técnico, Solicitante, Implantador e proprietário não gravam', () => {
    for (const papel of ['tecnico', 'solicitante', 'implantador', 'proprietario'] as const) {
      expect(
        codigo(podeGerirFornecedores([atr(papel, { tipo: 'hotel', hotelId: 'h' })], AGORA)),
      ).toBe('fornecedores_sem_permissao');
    }
    expect(
      codigo(
        podeGerirFornecedores(
          [atr('proprietario', { tipo: 'proprietario', proprietarioId: 'p' })],
          AGORA,
        ),
      ),
    ).toBe('fornecedores_sem_permissao');
  });

  it('papel vencido ou revogado não grava', () => {
    const vencido = atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h' }, new Date(0));
    expect(codigo(podeGerirFornecedores([vencido], AGORA))).toBe('fornecedores_sem_permissao');
    const revogado = { ...atr('gestor_csc', { tipo: 'grupo' }), revogadoEm: new Date(0) };
    expect(codigo(podeGerirFornecedores([revogado], AGORA))).toBe('fornecedores_sem_permissao');
  });
});

describe('CNPJ', () => {
  it('confere os dois dígitos verificadores', () => {
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11444777000161')).toBe(true);
    expect(cnpjValido('11222333000182')).toBe(false);
    expect(cnpjValido('11222333000191')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
    expect(cnpjValido('1122233300018')).toBe(false);
  });

  it('aceita com ou sem pontuação e devolve só os dígitos; vazio é null', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(validarCnpj(' 11222333000181 ')).toBe('11222333000181');
    expect(validarCnpj('')).toBeNull();
    expect(validarCnpj('   ')).toBeNull();
    expect(validarCnpj(null)).toBeNull();
    expect(validarCnpj(undefined)).toBeNull();
  });

  it('recusa dígito errado, letra e tamanho errado com código', () => {
    for (const cnpj of ['11.222.333/0001-82', '11222333000181a', 'AB222333000181', '123']) {
      expect(() => validarCnpj(cnpj)).toThrow(
        expect.objectContaining({ codigo: 'fornecedor_cnpj_invalido' }),
      );
    }
  });

  it('formata os 14 dígitos com a máscara', () => {
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarCnpj('123')).toBe('123');
  });

  it('o repetido é Conflito com código', () => {
    expect(cnpjDeFornecedorRepetido()).toMatchObject({ codigo: 'fornecedor_cnpj_repetido' });
  });

  it('alfanumérico (Receita, desde julho de 2026): o exemplo oficial confere', () => {
    expect(cnpjValido('12ABC34501DE35')).toBe(true);
    expect(cnpjValido('12ABC34501DE36')).toBe(false);
    // Os verificadores continuam numéricos, e só maiúsculas no formato guardado.
    expect(cnpjValido('12ABC34501DEA5')).toBe(false);
    expect(cnpjValido('12abc34501de35')).toBe(false);
  });

  it('alfanumérico com pontuação e minúsculas vira os 14 caracteres em maiúsculas', () => {
    expect(validarCnpj('12.ABC.345/01DE-35')).toBe('12ABC34501DE35');
    expect(validarCnpj(' 12.abc.345/01de-35 ')).toBe('12ABC34501DE35');
    for (const cnpj of ['12.ABC.345/01DE-36', '12ABC34501DE3', '12ABC34501DE35X', '12ÁBC34501DE35'])
      expect(() => validarCnpj(cnpj)).toThrow(
        expect.objectContaining({ codigo: 'fornecedor_cnpj_invalido' }),
      );
  });

  it('formata o alfanumérico com a mesma máscara', () => {
    expect(formatarCnpj('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
  });
});

describe('nome e contato', () => {
  it('nome: limpa espaços e recusa vazio ou longo', () => {
    expect(normalizarNomeDeFornecedor('  Refrigeração   Sul ')).toBe('Refrigeração Sul');
    expect(() => normalizarNomeDeFornecedor('   ')).toThrow(
      expect.objectContaining({ codigo: 'fornecedor_nome_invalido', parametros: { maximo: 120 } }),
    );
    expect(() => normalizarNomeDeFornecedor('x'.repeat(121))).toThrow(
      expect.objectContaining({ codigo: 'fornecedor_nome_invalido' }),
    );
  });

  it('contato: vazio vira null, e-mail em minúsculas', () => {
    expect(normalizarContatoDeFornecedor({})).toEqual({
      nome: null,
      telefone: null,
      email: null,
    });
    expect(
      normalizarContatoDeFornecedor({
        nome: '  Ana   Souza ',
        telefone: ' +55 (41) 3333-0000 ',
        email: ' Ana@Fornecedor.TEST ',
      }),
    ).toEqual({ nome: 'Ana Souza', telefone: '+55 (41) 3333-0000', email: 'ana@fornecedor.test' });
  });

  it('contato inválido: cada campo com o próprio código', () => {
    expect(() => normalizarContatoDeFornecedor({ nome: 'x'.repeat(121) })).toThrow(
      expect.objectContaining({ codigo: 'fornecedor_contato_nome_invalido' }),
    );
    for (const telefone of ['abc12345678', '1234', '+55 41 3333-0000 ramal 2', '9'.repeat(31)]) {
      expect(() => normalizarContatoDeFornecedor({ telefone })).toThrow(
        expect.objectContaining({ codigo: 'fornecedor_telefone_invalido' }),
      );
    }
    for (const email of ['ana', 'ana@', 'ana @x.test', `${'a'.repeat(320)}@x.test`]) {
      expect(() => normalizarContatoDeFornecedor({ email })).toThrow(
        expect.objectContaining({ codigo: 'fornecedor_email_invalido' }),
      );
    }
  });

  it('o cadastro inteiro sai normalizado', () => {
    expect(
      validarDadosDeFornecedor({
        nome: ' Elétrica  Local ',
        cnpj: '11.444.777/0001-61',
        contatoNome: '',
        contatoTelefone: null,
      }),
    ).toEqual({
      nome: 'Elétrica Local',
      cnpj: '11444777000161',
      contatoNome: null,
      contatoTelefone: null,
      contatoEmail: null,
    });
  });
});

describe('o papel alcança algum hotel para gravar fornecedor', () => {
  const H1 = { id: 'h1', bandeiraId: 'b1' };
  const recusa = (f: () => void) => {
    try {
      f();
      return null;
    } catch (e) {
      return (e as { codigo: string }).codigo;
    }
  };

  it('Gestor CSC de bandeira com hotel, sim; de bandeira sem hotel, fornecedores_sem_hotel', () => {
    const gestor = [atr('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b1' })];
    expect(recusa(() => exigirHotelParaGerirFornecedores(gestor, [H1], AGORA))).toBeNull();
    const semHotel = [atr('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b2' })];
    expect(recusa(() => exigirHotelParaGerirFornecedores(semHotel, [H1], AGORA))).toBe(
      'fornecedores_sem_hotel',
    );
    expect(recusa(() => exigirHotelParaGerirFornecedores(semHotel, [], AGORA))).toBe(
      'fornecedores_sem_hotel',
    );
  });

  it('o Gerente do hotel alcança o hotel dele; o Admin do grupo grava mesmo sem hotel', () => {
    const gerente = [atr('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' })];
    expect(recusa(() => exigirHotelParaGerirFornecedores(gerente, [H1], AGORA))).toBeNull();
    const admin = [atr('admin_grupo', { tipo: 'grupo' })];
    expect(recusa(() => exigirHotelParaGerirFornecedores(admin, [], AGORA))).toBeNull();
  });

  it('o papel vencido não alcança', () => {
    const vencido = [
      atr('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b1' }, new Date('2026-10-01T00:00:00Z')),
    ];
    expect(recusa(() => exigirHotelParaGerirFornecedores(vencido, [H1], AGORA))).toBe(
      'fornecedores_sem_hotel',
    );
  });
});
