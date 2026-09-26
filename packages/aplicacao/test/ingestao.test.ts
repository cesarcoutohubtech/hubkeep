// Ingestão (F0-08) com portas em memória: credencial, idempotência do lote,
// gestão de credencial pelo Admin e promoção de UHs com a regra de licença.
import {
  type Atribuicao,
  type Contexto,
  NaoEncontrado,
  PermissaoNegada,
  RegraViolada,
} from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  CredencialInvalida,
  type Criptografia,
  type HotelParaPromocao,
  type LocalExistente,
  type LoteRecebido,
  type UhDoStaging,
  criarCasosDeUsoDeIngestao,
  hashDoLote,
  lerCredencial,
} from '../src/index';

const TENANT = '10000000-0000-4000-8000-000000000001';
const ctx: Contexto = { usuarioId: 'admin', tenantId: TENANT };
const SEGREDO = 'S'.repeat(43);
const CREDENCIAL = `hk_${TENANT}_${SEGREDO}`;
const AGORA = new Date('2026-09-26T12:00:00Z');

/** "Hash" que devolve o próprio texto: deixa ver o que foi hasheado. */
const cripto: Criptografia = {
  segredoAleatorio: () => SEGREDO,
  sha256Hex: async (t) => `h(${t})`,
};

const ADMIN: Atribuicao[] = [
  {
    id: 'a',
    usuarioId: 'admin',
    papel: 'admin_grupo',
    escopo: { tipo: 'grupo' },
    validoAte: null,
    revogadoEm: null,
  },
];
const GERENTE: Atribuicao[] = [
  {
    id: 'g',
    usuarioId: 'admin',
    papel: 'gerente_hotel',
    escopo: { tipo: 'hotel', hotelId: 'h1' },
    validoAte: null,
    revogadoEm: null,
  },
];

const lote = (registros: LoteRecebido['registros']): LoteRecebido => ({
  fonte: 'planilha',
  entidade: 'uh',
  registros,
});

function montar(opcoes: {
  ativas?: { id: string; hash: string }[];
  atribuicoes?: Atribuicao[];
  revogada?: { revogadaEm: Date } | null;
  uhs?: UhDoStaging[];
  hoteis?: [string, HotelParaPromocao][];
  locais?: [string, LocalExistente][];
  uso?: { contratadas: number; emUso: number };
}) {
  const log: string[] = [];
  const criadas: unknown[] = [];
  const casos = criarCasosDeUsoDeIngestao({
    cripto,
    relogio: { agora: () => AGORA },
    atribuicoes: {
      doUsuario: async () => opcoes.atribuicoes ?? ADMIN,
      buscar: async () => null,
      conceder: async () => ({ id: 'x' }),
      revogar: async () => undefined,
    },
    ingestao: {
      emSessao: async (tenantId, fn) => {
        log.push(`sessao:${tenantId}`);
        return fn({
          credenciaisAtivas: async () =>
            opcoes.ativas ?? [{ id: 'c1', hash: `sha256:h(${SEGREDO})` }],
          registrarLote: async (_l, loteHash) => {
            log.push(`registrar:${loteHash.slice(0, 12)}`);
            return { cargaId: 'carga-1', novo: true };
          },
        });
      },
    },
    credenciais: {
      criar: async (_c, cred) => {
        log.push(`criar:${cred.hash}`);
        return { id: 'cred-1' };
      },
      revogar: async () =>
        opcoes.revogada === undefined ? { revogadaEm: AGORA } : opcoes.revogada,
    },
    promocao: {
      emSessao: async (_t, fn) =>
        fn({
          uhsDoStaging: async () => opcoes.uhs ?? [],
          hoteisPorCodigo: async () => new Map(opcoes.hoteis ?? []),
          locaisPorCodigo: async () => new Map(opcoes.locais ?? []),
          usoDeLicenca: async () => opcoes.uso ?? { contratadas: 0, emUso: 0 },
          criarUh: async (uh) => void criadas.push(uh),
          atualizarUh: async (id, dados) => void log.push(`atualizar:${id}:${dados.nome}`),
        }),
    },
  });
  return { casos, log, criadas };
}

describe('receber lote do agente', () => {
  it('credencial fora do formato: recusa sem abrir sessão no banco', async () => {
    const { casos, log } = montar({});
    await expect(
      casos.receberLote('Bearer qualquer', lote([{ chave: '1', dados: {} }])),
    ).rejects.toBeInstanceOf(CredencialInvalida);
    expect(log).toEqual([]);
  });

  it('credencial revogada (fora das ativas): recusa sem gravar', async () => {
    const { casos, log } = montar({ ativas: [] });
    await expect(
      casos.receberLote(CREDENCIAL, lote([{ chave: '1', dados: {} }])),
    ).rejects.toBeInstanceOf(CredencialInvalida);
    expect(log).toEqual([`sessao:${TENANT}`]);
  });

  it('credencial válida: grava no tenant do prefixo, com o hash calculado aqui', async () => {
    const { casos, log } = montar({});
    const r = await casos.receberLote(CREDENCIAL, lote([{ chave: '1', dados: { a: 1 } }]));
    expect(r).toMatchObject({ tenantId: TENANT, cargaId: 'carga-1', novo: true });
    expect(log[0]).toBe(`sessao:${TENANT}`);
    expect(log[1]).toMatch(/^registrar:/);
  });

  it('chave repetida no mesmo lote é recusada antes do banco', async () => {
    const { casos, log } = montar({});
    await expect(
      casos.receberLote(
        CREDENCIAL,
        lote([
          { chave: '1', dados: {} },
          { chave: '1', dados: {} },
        ]),
      ),
    ).rejects.toBeInstanceOf(RegraViolada);
    expect(log).toEqual([]);
  });

  it('hash do lote não depende da ordem dos registros nem das chaves dos dados', async () => {
    const a = await hashDoLote(
      lote([
        { chave: '2', dados: { y: 1, x: 2 } },
        { chave: '1', dados: {} },
      ]),
      cripto,
    );
    const b = await hashDoLote(
      lote([
        { chave: '1', dados: {} },
        { chave: '2', dados: { x: 2, y: 1 } },
      ]),
      cripto,
    );
    const c = await hashDoLote(
      lote([
        { chave: '1', dados: {} },
        { chave: '2', dados: { x: 3, y: 1 } },
      ]),
      cripto,
    );
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('credencial do agente', () => {
  it('só o Admin cria; o segredo sai uma vez e o banco recebe só o hash', async () => {
    const { casos, log } = montar({});
    const r = await casos.criarCredencial(ctx, 'Agente Slaviero');
    expect(lerCredencial(r.credencial)).toEqual({ tenantId: TENANT, segredo: SEGREDO });
    expect(log).toEqual([`criar:sha256:h(${SEGREDO})`]);
  });

  it('quem não é Admin não cria nem revoga', async () => {
    const { casos, log } = montar({ atribuicoes: GERENTE });
    await expect(casos.criarCredencial(ctx, 'x')).rejects.toBeInstanceOf(PermissaoNegada);
    await expect(casos.revogarCredencial(ctx, 'cred-1')).rejects.toBeInstanceOf(PermissaoNegada);
    expect(log).toEqual([]);
  });

  it('revogar o que não existe (ou já foi revogado) é 404', async () => {
    const { casos } = montar({ revogada: null });
    await expect(casos.revogarCredencial(ctx, 'cred-x')).rejects.toBeInstanceOf(NaoEncontrado);
  });
});

describe('promover UHs', () => {
  const ATIVO: HotelParaPromocao = { id: 'h1', status: 'ativo' };
  const IMPLANTACAO: HotelParaPromocao = { id: 'h2', status: 'em_implantacao' };
  const uh = (chave: string, dados: unknown): UhDoStaging => ({ fonte: 'planilha', chave, dados });

  it('UH nova em hotel ativo entra ativa enquanto há saldo; depois, pendente_licenca', async () => {
    const { casos, criadas } = montar({
      uhs: [
        uh('101', { hotel: 'H1', nome: '101' }),
        uh('102', { hotel: 'H1', nome: '102', andar: '1' }),
      ],
      hoteis: [['planilha|H1', ATIVO]],
      uso: { contratadas: 5, emUso: 4 },
    });
    expect(await casos.promoverUhs(TENANT)).toMatchObject({ criadas: 2, ativas: 1, pendentes: 1 });
    expect(criadas).toEqual([
      { hotelId: 'h1', chave: '101', nome: '101', andar: null, status: 'ativo' },
      { hotelId: 'h1', chave: '102', nome: '102', andar: '1', status: 'pendente_licenca' },
    ]);
  });

  it('hotel em implantação não consome licença: UH entra pendente', async () => {
    const { casos, criadas } = montar({
      uhs: [uh('201', { hotel: 'H2', nome: '201' })],
      hoteis: [['planilha|H2', IMPLANTACAO]],
      uso: { contratadas: 100, emUso: 0 },
    });
    await casos.promoverUhs(TENANT);
    expect(criadas).toMatchObject([{ status: 'pendente_licenca' }]);
  });

  it('sem hotel, dados inválidos, já promovida sem mudança e já promovida com mudança', async () => {
    const { casos, criadas, log } = montar({
      uhs: [
        uh('301', { hotel: 'NAO-EXISTE', nome: '301' }),
        uh('302', { nome: 'sem hotel' }),
        uh('101', { hotel: 'H1', nome: '101' }),
        uh('102', { hotel: 'H1', nome: '102 novo' }),
      ],
      hoteis: [['planilha|H1', ATIVO]],
      locais: [
        ['h1|101', { id: 'l101', nome: '101', andar: null }],
        ['h1|102', { id: 'l102', nome: '102', andar: null }],
      ],
      uso: { contratadas: 10, emUso: 2 },
    });
    expect(await casos.promoverUhs(TENANT)).toEqual({
      criadas: 0,
      ativas: 0,
      pendentes: 0,
      atualizadas: 1,
      semHotel: 1,
      invalidas: 1,
    });
    expect(criadas).toEqual([]);
    expect(log).toEqual(['atualizar:l102:102 novo']);
  });
});
