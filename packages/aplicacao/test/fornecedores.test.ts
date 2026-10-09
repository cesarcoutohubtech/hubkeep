// Fornecedores do grupo (fase 1b, I3) com a porta em memória: quem grava, a
// normalização antes da porta e a versão vista levada até ela. O que o banco
// deixa (RLS, CNPJ único, auditoria) é do teste de integração (packages/db).
import type { Atribuicao, Contexto } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { type MudancaDeFornecedor, criarCasosDeUsoDeFornecedores } from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const AGORA = new Date('2026-10-08T12:00:00Z');
const gerente: Atribuicao = {
  id: 'a',
  usuarioId: 'u',
  papel: 'gerente_hotel',
  escopo: { tipo: 'hotel', hotelId: 'h' },
  validoAte: null,
  revogadoEm: null,
};
const tecnico: Atribuicao = { ...gerente, papel: 'tecnico' };
const gestorDeBandeira: Atribuicao = {
  ...gerente,
  papel: 'gestor_csc',
  escopo: { tipo: 'bandeira', bandeiraId: 'b-vazia' },
};
const admin: Atribuicao = { ...gerente, papel: 'admin_grupo', escopo: { tipo: 'grupo' } };

function montar(
  minhas: Atribuicao[],
  hoteis: { id: string; bandeiraId: string | null }[] = [{ id: 'h', bandeiraId: null }],
) {
  const criados: unknown[] = [];
  const alterados: { id: string; versao: number; mudanca: MudancaDeFornecedor }[] = [];
  const casos = criarCasosDeUsoDeFornecedores({
    fornecedores: {
      hoteis: async () => hoteis,
      listar: async () => [],
      criar: async (_ctx, dados) => {
        criados.push(dados);
        return { id: 'f', versao: 1 };
      },
      alterar: async (_ctx, id, versao, mudanca) => {
        alterados.push({ id, versao, mudanca });
        return { versao: versao + 1 };
      },
    },
    atribuicoes: {
      doUsuario: async () => minhas,
      buscar: async () => null,
      conceder: async () => ({ id: 'x' }),
      revogar: async () => undefined,
    },
    relogio: { agora: () => AGORA },
  });
  return { casos, criados, alterados };
}

describe('fornecedores (I3)', () => {
  it('o gerente cadastra; os dados chegam normalizados à porta', async () => {
    const { casos, criados } = montar([gerente]);
    await casos.cadastrar(ctx, {
      nome: ' Elétrica   Local ',
      cnpj: '11.222.333/0001-81',
      contatoEmail: ' Ana@X.test ',
    });
    expect(criados).toEqual([
      {
        nome: 'Elétrica Local',
        cnpj: '11222333000181',
        contatoNome: null,
        contatoTelefone: null,
        contatoEmail: 'ana@x.test',
      },
    ]);
  });

  it('CNPJ alfanumérico entra em maiúsculas, sem pontuação', async () => {
    const { casos, criados } = montar([gerente]);
    await casos.cadastrar(ctx, { nome: 'Nova', cnpj: '12.abc.345/01de-35' });
    expect(criados).toEqual([expect.objectContaining({ cnpj: '12ABC34501DE35' })]);
  });

  it('Gestor CSC de bandeira sem hotel: 403 fornecedores_sem_hotel, sem chegar à porta', async () => {
    const { casos, criados, alterados } = montar([gestorDeBandeira], []);
    await expect(casos.cadastrar(ctx, { nome: 'X' })).rejects.toMatchObject({
      codigo: 'fornecedores_sem_hotel',
    });
    await expect(casos.reativar(ctx, 'f', 1)).rejects.toMatchObject({
      codigo: 'fornecedores_sem_hotel',
    });
    expect(criados).toEqual([]);
    expect(alterados).toEqual([]);
  });

  it('o Admin do grupo grava mesmo sem hotel', async () => {
    const { casos, criados } = montar([admin], []);
    await casos.cadastrar(ctx, { nome: 'Do admin' });
    expect(criados).toHaveLength(1);
  });

  it('CNPJ inválido é recusado antes da porta', async () => {
    const { casos, criados } = montar([gerente]);
    await expect(casos.cadastrar(ctx, { nome: 'X', cnpj: '11222333000182' })).rejects.toMatchObject(
      { codigo: 'fornecedor_cnpj_invalido' },
    );
    expect(criados).toEqual([]);
  });

  it('o técnico não grava: 403 com código, sem chegar à porta', async () => {
    const { casos, criados, alterados } = montar([tecnico]);
    await expect(casos.cadastrar(ctx, { nome: 'X' })).rejects.toMatchObject({
      codigo: 'fornecedores_sem_permissao',
    });
    await expect(casos.desativar(ctx, 'f', 1)).rejects.toMatchObject({
      codigo: 'fornecedores_sem_permissao',
    });
    expect([...criados, ...alterados]).toEqual([]);
  });

  it('alterar, desativar e reativar levam a versão vista', async () => {
    const { casos, alterados } = montar([gerente]);
    await casos.alterar(ctx, 'f', { versao: 3, nome: 'Novo' });
    await casos.desativar(ctx, 'f', 4);
    await casos.reativar(ctx, 'f', 5);
    expect(alterados.map((a) => [a.versao, a.mudanca])).toEqual([
      [
        3,
        {
          nome: 'Novo',
          cnpj: null,
          contatoNome: null,
          contatoTelefone: null,
          contatoEmail: null,
        },
      ],
      [4, { desativado: true }],
      [5, { desativado: false }],
    ]);
  });
});
