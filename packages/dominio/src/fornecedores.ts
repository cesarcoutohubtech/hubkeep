// Fornecedor mínimo do grupo (fase 1b, I3; desenho aprovado em 08/10/2026,
// docs/referencia/propostas-desenho-1b.md, item 2). O fornecedor é do grupo, e
// não do hotel: o Gerente cadastra o fornecedor local, que fica visível para o
// grupo. Aqui ficam as regras: quem cadastra e altera, o CNPJ com os dígitos
// verificadores, o nome e o contato. O banco guarda só o formato (14
// caracteres, único no grupo; alfanumérico desde a 0035) e a autorização por
// papel (policies da migração 0033).
// Portal, contrato, avaliação, custos e alçadas são da fase 2.
import { Conflito, PermissaoNegada, RegraViolada } from './erros';
import { type Resultado, ehAdminGrupo, vigente } from './permissoes';
import type { Atribuicao, Papel } from './tipos';

/** Além do Admin do grupo, quem cadastra e altera fornecedor, em qualquer hotel do grupo. */
export const PAPEIS_QUE_GERENCIAM_FORNECEDORES: readonly Papel[] = ['gestor_csc', 'gerente_hotel'];

export const LIMITES_DE_FORNECEDOR = {
  nome: 120,
  contatoNome: 120,
  contatoTelefone: 30,
  contatoEmail: 320,
} as const;

/**
 * Cadastrar, alterar, desativar e reativar fornecedor: o Admin do grupo, o
 * Gestor CSC e o Gerente do hotel, com papel vigente. O mesmo "quem" da policy
 * (authz.eh_admin_grupo ou authz.hoteis_com_papel com os dois papéis).
 */
export function podeGerirFornecedores(minhas: readonly Atribuicao[], agora: Date): Resultado {
  const pode =
    ehAdminGrupo(minhas, agora) ||
    minhas.some(
      (a) =>
        vigente(a, agora) &&
        PAPEIS_QUE_GERENCIAM_FORNECEDORES.includes(a.papel) &&
        a.escopo.tipo !== 'proprietario',
    );
  return pode
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'fornecedores_sem_permissao',
          'Só o Admin do grupo, o Gestor CSC e o Gerente do hotel cadastram fornecedores.',
        ),
      };
}

const PESOS_DO_PRIMEIRO = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DO_SEGUNDO = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function digitoVerificador(valores: readonly number[], pesos: readonly number[]): number {
  const soma = pesos.reduce((s, peso, i) => s + peso * (valores[i] ?? 0), 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * O CNPJ sem pontuação: 12 caracteres, letras maiúsculas ou dígitos (o
 * alfanumérico da Receita, desde julho de 2026), e 2 dígitos verificadores.
 */
const FORMATO_DO_CNPJ = /^[0-9A-Z]{12}\d{2}$/;

/**
 * O CNPJ tem os dois dígitos verificadores certos? No cálculo, cada caractere
 * vale o código dele menos 48 (os dígitos valem eles mesmos, e A vale 17), com
 * os mesmos pesos do CNPJ numérico, que continua valendo.
 */
export function cnpjValido(cnpj: string): boolean {
  if (!FORMATO_DO_CNPJ.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const v = [...cnpj].map((c) => c.charCodeAt(0) - 48);
  return (
    digitoVerificador(v, PESOS_DO_PRIMEIRO) === v[12] &&
    digitoVerificador(v, PESOS_DO_SEGUNDO) === v[13]
  );
}

/**
 * CNPJ opcional: vazio vira null; com pontuação (11.222.333/0001-81 ou
 * 12.ABC.345/01DE-35) ou sem, e com letras minúsculas ou maiúsculas, vira os
 * 14 caracteres em maiúsculas, com os verificadores conferidos. Inválido: 422
 * fornecedor_cnpj_invalido.
 */
export function validarCnpj(cnpj: string | null | undefined): string | null {
  const texto = cnpj?.trim() ?? '';
  if (texto === '') return null;
  const limpo = /^[0-9A-Za-z.\-/\s]+$/.test(texto)
    ? texto.replace(/[.\-/\s]/g, '').toUpperCase()
    : '';
  if (!cnpjValido(limpo)) {
    throw new RegraViolada('fornecedor_cnpj_invalido', 'CNPJ inválido.');
  }
  return limpo;
}

/** Os 14 caracteres com a máscara usual (11.222.333/0001-81), para a tela; outro texto volta igual. */
export function formatarCnpj(cnpj: string): string {
  const m = /^([0-9A-Z]{2})([0-9A-Z]{3})([0-9A-Z]{3})([0-9A-Z]{4})(\d{2})$/.exec(cnpj);
  return m ? `${m[1]}.${m[2]}.${m[3]}/${m[4]}-${m[5]}` : cnpj;
}

/** Nome do fornecedor: sem espaços sobrando, de 1 a 120 caracteres. */
export function normalizarNomeDeFornecedor(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, ' ');
  if (limpo.length === 0 || limpo.length > LIMITES_DE_FORNECEDOR.nome) {
    throw new RegraViolada('fornecedor_nome_invalido', 'Nome de fornecedor inválido.', {
      maximo: LIMITES_DE_FORNECEDOR.nome,
    });
  }
  return limpo;
}

export interface ContatoDeFornecedor {
  nome: string | null;
  telefone: string | null;
  email: string | null;
}

const vazioParaNulo = (v: string | null | undefined): string | null => {
  const limpo = v?.trim().replace(/\s+/g, ' ') ?? '';
  return limpo === '' ? null : limpo;
};

const TELEFONE = /^\+?[\d\s().-]{8,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Contato opcional (dado pessoal mínimo): cada campo vazio vira null. O nome
 * tem até 120 caracteres; o telefone, até 30, com ao menos 8 dígitos e só
 * dígitos, espaço, +, (, ), ponto e hífen; o e-mail, até 320, em minúsculas.
 */
export function normalizarContatoDeFornecedor(c: {
  nome?: string | null | undefined;
  telefone?: string | null | undefined;
  email?: string | null | undefined;
}): ContatoDeFornecedor {
  const nome = vazioParaNulo(c.nome);
  if (nome !== null && nome.length > LIMITES_DE_FORNECEDOR.contatoNome) {
    throw new RegraViolada('fornecedor_contato_nome_invalido', 'Nome do contato inválido.', {
      maximo: LIMITES_DE_FORNECEDOR.contatoNome,
    });
  }
  const telefone = vazioParaNulo(c.telefone);
  if (telefone !== null && (!TELEFONE.test(telefone) || telefone.replace(/\D/g, '').length < 8)) {
    throw new RegraViolada('fornecedor_telefone_invalido', 'Telefone do contato inválido.');
  }
  const email = vazioParaNulo(c.email)?.toLowerCase() ?? null;
  if (email !== null && (email.length > LIMITES_DE_FORNECEDOR.contatoEmail || !EMAIL.test(email))) {
    throw new RegraViolada('fornecedor_email_invalido', 'E-mail do contato inválido.');
  }
  return { nome, telefone, email };
}

/** O cadastro inteiro, normalizado e validado. */
export interface DadosDeFornecedor {
  nome: string;
  cnpj: string | null;
  contatoNome: string | null;
  contatoTelefone: string | null;
  contatoEmail: string | null;
}

export function validarDadosDeFornecedor(d: {
  nome: string;
  cnpj?: string | null | undefined;
  contatoNome?: string | null | undefined;
  contatoTelefone?: string | null | undefined;
  contatoEmail?: string | null | undefined;
}): DadosDeFornecedor {
  const nome = normalizarNomeDeFornecedor(d.nome);
  const cnpj = validarCnpj(d.cnpj);
  const contato = normalizarContatoDeFornecedor({
    nome: d.contatoNome,
    telefone: d.contatoTelefone,
    email: d.contatoEmail,
  });
  return {
    nome,
    cnpj,
    contatoNome: contato.nome,
    contatoTelefone: contato.telefone,
    contatoEmail: contato.email,
  };
}

/** O CNPJ já está em outro fornecedor do grupo (índice fornecedor_cnpj_unico): 409. */
export const cnpjDeFornecedorRepetido = (): Conflito =>
  new Conflito('fornecedor_cnpj_repetido', 'Já existe fornecedor com este CNPJ no grupo.');
