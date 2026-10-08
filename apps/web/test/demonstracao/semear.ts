// Dados de demonstração do kit de teste (docs/05, "Kit de teste"): um grupo
// fictício com três hotéis, locais, ativos, um usuário por papel e chamados e
// OS em cada estado, para o Cesar testar a aplicação no notebook, ligada ao
// HubKeep-dev. Só roda no dev (pnpm demo:dados, que confere o alvo) e na CI
// (semear.test.ts, no Supabase do runner).
//
// Tudo passa pelos casos de uso da aplicação, com a unit of work (auditoria e
// outbox), exatamente como as telas e o PWA fazem:
//   - hotéis e UHs chegam pelo caminho do conector: lote no staging com uma
//     credencial de agente (revogada no fim), importação e ativação pelo Admin
//     e promoção das UHs pelo worker;
//   - cada pessoa entra pelo convite de sempre, com a conta já confirmada e a
//     senha de teste, sem e-mail (servidor/demonstracao.ts);
//   - chamados, ativos e ações do Técnico vão como operação offline, com chave
//     fixa, como o PWA manda: rodar de novo não duplica.
// A exceção é o que nenhum caso de uso cria, porque é trabalho do backoffice:
// o tenant, o contrato de licença e o primeiro Admin do grupo. Esses entram
// pelo dono do banco, como nos testes de integração.
//
// Idempotente: cada passo confere o que já existe antes de gravar, e as
// operações offline repetidas voltam com a resposta da primeira vez.
import { createHash } from 'node:crypto';
import type {
  CasoDeUsoDeConvites,
  LoteRecebido,
  OperacaoOffline,
  PedidoDeConviteDeMembro,
} from '@hubkeep/aplicacao';
import {
  type CategoriaPadrao,
  Conflito,
  type Contexto,
  ESTADOS_COM_PRIORIDADE_AJUSTAVEL,
  type Escopo,
  type ModeloContratual,
  type Papel,
} from '@hubkeep/dominio';
import pg from 'pg';
import {
  casosDeUsoDeBandeiras,
  casosDeUsoDeCategorias,
  casosDeUsoDeChamados,
  casosDeUsoDeConfiguracao,
  casosDeUsoDeEquipes,
  casosDeUsoDeFornecedores,
  casosDeUsoDeHoteis,
  casosDeUsoDeLocais,
  casosDeUsoDePapeis,
  casosDeUsoDeProprietarios,
  casosDeUsoDeSincronizacao,
  casosDeUsoDeSituacoes,
  casosDeUsoDeTriagem,
  credenciaisDeAgente,
  promoverUhsDoTenant,
  recebimentoDeLotes,
} from '../../src/servidor/composicao';
import { convitesDeDemonstracao, identidadeDeDemonstracao } from '../../src/servidor/demonstracao';

/** Tenant fixo da demonstração no dev: rodar de novo cai no mesmo grupo. */
export const TENANT_DA_DEMONSTRACAO = '0199a1f0-de30-7000-8000-00000000de30';
export const NOME_DO_GRUPO = 'Grupo Demonstração';
const FONTE = 'planilha';
const FUSO = 'America/Sao_Paulo';

export interface OpcoesDaDemonstracao {
  /** Dono do banco (postgres): só o tenant, a licença e o primeiro Admin. */
  urlDono: string;
  /** Senha de teste de todas as contas. */
  senha: string;
  tenantId?: string;
  /** Domínio dos e-mails; precisa terminar em .test. */
  dominio?: string;
  /** Site do web, para o link de aceite gravado no convite (nenhum e-mail sai). */
  site?: string;
  log?: (linha: string) => void;
}

export const PESSOAS = {
  admin: { nome: 'Ana Admin', email: 'admin' },
  gestor: { nome: 'Gustavo Gestor CSC', email: 'gestor.csc' },
  implantador: { nome: 'Irene Implantadora', email: 'implantador' },
  gerenteCentro: { nome: 'Gabriela Gerente Centro', email: 'gerente.centro' },
  gerentePraia: { nome: 'Paulo Gerente Praia', email: 'gerente.praia' },
  tecnicoCentro: { nome: 'Tiago Técnico Centro', email: 'tecnico.centro' },
  tecnicoPraia: { nome: 'Teresa Técnica Praia', email: 'tecnico.praia' },
  solicitante: { nome: 'Sofia Solicitante', email: 'solicitante' },
  donoUh: { nome: 'Otávio Proprietário UH', email: 'proprietario.uh' },
  donoHotel: { nome: 'Olívia Proprietária Hotel', email: 'proprietario.hotel' },
} as const;
export type Pessoa = keyof typeof PESSOAS;

const HOTEIS = {
  centro: { chave: 'DEMO-CENTRO', nome: 'Hotel Demonstração Centro', bandeira: 'azul' },
  praia: { chave: 'DEMO-PRAIA', nome: 'Hotel Demonstração Praia', bandeira: 'verde' },
  serra: { chave: 'DEMO-SERRA', nome: 'Hotel Demonstração Serra', bandeira: 'azul' },
} as const;
type Hotel = keyof typeof HOTEIS;
const BANDEIRAS = { azul: 'Bandeira Azul', verde: 'Bandeira Verde' } as const;

const UHS: Record<Hotel, string[]> = {
  centro: ['UH 101', 'UH 102', 'UH 103', 'UH 104', 'UH 201', 'UH 202'],
  praia: ['UH 101', 'UH 102', 'UH 103', 'UH 104'],
  serra: ['UH 101', 'UH 102', 'UH 103'],
};
const AREAS: Partial<Record<Hotel, string[]>> = {
  centro: ['Piscina', 'Cozinha', 'Casa de máquinas'],
  praia: ['Lobby', 'Restaurante'],
};

/**
 * Modelo contratual (I2): o Centro é próprio e o Praia, arrendado. O Serra,
 * em implantação, fica sem modelo, e o painel de implantação mostra a
 * pendência. Só grava no hotel ainda sem modelo: o que o Cesar mudou pela
 * tela fica.
 */
const MODELO_CONTRATUAL: Partial<Record<Hotel, ModeloContratual>> = {
  centro: 'proprio',
  praia: 'arrendado',
};

/**
 * Edificação (I2) de alguns locais do Centro, nas UHs do sistema hoteleiro e
 * numa área comum. Só grava no local ainda sem edificação.
 */
const EDIFICACOES: Partial<Record<Hotel, Record<string, string>>> = {
  centro: {
    'UH 101': 'Torre A',
    'UH 102': 'Torre A',
    'UH 103': 'Torre A',
    'UH 104': 'Torre A',
    'UH 201': 'Torre B',
    'UH 202': 'Torre B',
    Piscina: 'Área externa',
  },
};

/**
 * Fornecedores do grupo (I3), com CNPJ fictício: os dígitos verificadores
 * foram calculados para bases inventadas, sem consulta à Receita. O contato é
 * fictício (domínio .test). A Gabriela, Gerente do Centro, cadastra a
 * serralheria local, que fica visível para o grupo. Só cadastra o nome que
 * ainda não existe: o que o Cesar mudou pela tela fica.
 */
const FORNECEDORES: readonly {
  quem: 'admin' | 'gestor' | 'gerenteCentro';
  nome: string;
  cnpj: string | null;
  contatoNome: string | null;
  contatoTelefone: string | null;
  contatoEmail: string | null;
}[] = [
  {
    quem: 'admin',
    nome: 'Frio Total Refrigeração (fictício)',
    cnpj: '98765432000198',
    contatoNome: 'Rita Refrigeração',
    contatoTelefone: '+55 41 3000-0001',
    contatoEmail: 'rita@frio-total.test',
  },
  {
    quem: 'gestor',
    nome: 'Sobe e Desce Elevadores (fictício)',
    cnpj: '13579246000101',
    contatoNome: 'Eduardo Elevadores',
    contatoTelefone: '+55 41 3000-0002',
    contatoEmail: null,
  },
  {
    quem: 'gerenteCentro',
    nome: 'Serralheria do Bairro (fictício)',
    cnpj: null,
    contatoNome: null,
    contatoTelefone: '+55 41 99000-0003',
    contatoEmail: null,
  },
];

/** Ativos: hotel, local, categoria padrão, nome, fabricante, modelo. */
const ATIVOS = {
  frigobar: ['centro', 'UH 101', 'refrigeracao', 'Frigobar UH 101', 'Gelar', 'FB-80'],
  arCentro: ['centro', 'UH 102', 'refrigeracao', 'Ar-condicionado UH 102', 'Ventus', 'Split 12k'],
  tv: ['centro', 'UH 103', 'eletronicos', 'TV UH 103', 'Visão', '43 pol.'],
  aquecedor: ['centro', 'Piscina', 'piscina', 'Aquecedor da piscina', 'Termo', 'AQ-500'],
  forno: ['centro', 'Cozinha', 'cozinha', 'Forno combinado', 'Chef', 'FC-10'],
  arPraia: ['praia', 'UH 101', 'refrigeracao', 'Ar-condicionado UH 101', 'Ventus', 'Split 9k'],
  gelo: ['praia', 'Restaurante', 'cozinha', 'Máquina de gelo', 'Polar', 'MG-50'],
} as const satisfies Record<string, readonly [Hotel, string, string, string, string, string]>;
type Ativo = keyof typeof ATIVOS;

/**
 * Compra, garantia e criticidade (I1) de alguns ativos. Só no cadastro: num
 * grupo criado antes da I1, os ativos ficam como estavam (a operação de chave
 * fixa não grava de novo), e os campos se preenchem pela tela.
 */
const DADOS_DA_I1: Partial<
  Record<Ativo, { dataCompra: string | null; garantiaAte: string | null; criticidade: number }>
> = {
  frigobar: { dataCompra: null, garantiaAte: null, criticidade: 2 },
  arCentro: { dataCompra: '2024-03-15', garantiaAte: '2027-03-15', criticidade: 4 },
  aquecedor: { dataCompra: '2022-11-01', garantiaAte: '2024-11-01', criticidade: 3 },
  forno: { dataCompra: '2025-06-10', garantiaAte: '2028-06-10', criticidade: 5 },
  gelo: { dataCompra: null, garantiaAte: null, criticidade: 3 },
};

/**
 * Prioridade padrão por categoria, gravada como política do grupo (ADR-026),
 * no que se espera de um hotel: parar um elevador ou a segurança é urgente;
 * frio, energia, água e cozinha param a operação ou o quarto; o resto espera.
 */
const PRIORIDADE_POR_CATEGORIA = {
  elevadores: 'urgente',
  seguranca: 'urgente',
  refrigeracao: 'alta',
  eletrica: 'alta',
  hidraulica: 'alta',
  cozinha: 'alta',
  lavanderia: 'media',
  eletronicos: 'media',
  piscina: 'media',
  mobiliario: 'baixa',
} as const satisfies Record<CategoriaPadrao, string>;

/** O que cada chamado mostra no teste (roteiro no docs/10-kit-de-teste.md). */
export const CENARIOS = [
  'aberto',
  'atribuido',
  'emExecucaoParado',
  'aguardandoAceite',
  'cancelado',
  'concluido',
  'praiaAberto',
] as const;
export type Cenario = (typeof CENARIOS)[number];

export interface ResultadoDaDemonstracao {
  tenantId: string;
  usuarios: Record<Pessoa, { email: string; usuarioId: string }>;
  hoteis: Record<Hotel, string>;
  chamados: Record<Cenario, string>;
}

/** UUID fixo a partir de um nome: a mesma chave de operação a cada execução. */
function idFixo(tenantId: string, nome: string): string {
  const h = createHash('sha256').update(`${tenantId}:${nome}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const conflito = (e: unknown, codigo: string) => e instanceof Conflito && e.codigo === codigo;

export async function semearDemonstracao(
  o: OpcoesDaDemonstracao,
): Promise<ResultadoDaDemonstracao> {
  const tenantId = o.tenantId ?? TENANT_DA_DEMONSTRACAO;
  const dominio = o.dominio ?? 'demo.hubkeep.test';
  const site = o.site ?? 'http://localhost:3000';
  const log = o.log ?? (() => undefined);
  const emailDe = (p: Pessoa) => `${PESSOAS[p].email}@${dominio}`;

  // 1. Base do backoffice, pelo dono: tenant, licença e primeiro Admin.
  const identidade = identidadeDeDemonstracao(o.senha);
  const admin = await identidade.garantirUsuario({
    email: emailDe('admin'),
    nome: PESSOAS.admin.nome,
    tenantId,
    nomeTenant: NOME_DO_GRUPO,
  });
  await identidade.vincularTenant(admin.usuarioId, tenantId);
  const dono = new pg.Client({ connectionString: o.urlDono });
  await dono.connect();
  try {
    await dono.query(
      `insert into app.tenant (id, nome) values ($1, $2) on conflict (id) do nothing`,
      [tenantId, NOME_DO_GRUPO],
    );
    // Três hotéis e 40 UHs: dá para ativar o terceiro hotel no teste.
    await dono.query(
      `insert into licenca.contrato (tenant_id, max_hoteis, max_uhs, atualizado_por)
       values ($1, 3, 40, 'demonstracao') on conflict (tenant_id) do nothing`,
      [tenantId],
    );
    await dono.query(
      `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)
       on conflict (tenant_id, usuario_id) do nothing`,
      [tenantId, admin.usuarioId, PESSOAS.admin.nome, emailDe('admin')],
    );
    await dono.query(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, concedido_por)
       select $1, $2, $3, 'admin_grupo', 'grupo', $3
        where not exists (
          select 1 from app.atribuicao_escopo
           where tenant_id = $2 and usuario_id = $3 and papel = 'admin_grupo' and revogado_em is null)`,
      [idFixo(tenantId, 'atribuicao-admin'), tenantId, admin.usuarioId],
    );
  } finally {
    await dono.end();
  }
  const ctxAdmin: Contexto = { usuarioId: admin.usuarioId, tenantId };
  log(`Grupo e primeiro Admin: ${emailDe('admin')}`);

  // 2. Hotéis e UHs pelo caminho do conector.
  const credenciais = await credenciaisDeAgente();
  const credencial = await credenciais.criarCredencial(ctxAdmin, 'Dados de demonstração');
  try {
    const lotes: LoteRecebido[] = [
      {
        fonte: FONTE,
        entidade: 'hotel',
        registros: Object.values(HOTEIS).map((h) => ({
          chave: h.chave,
          dados: { nome: h.nome, fuso: FUSO },
        })),
      },
      {
        fonte: FONTE,
        entidade: 'uh',
        registros: (Object.keys(UHS) as Hotel[]).flatMap((h) =>
          UHS[h].map((nome) => ({
            chave: `${HOTEIS[h].chave}-${nome.replace('UH ', '')}`,
            dados: { hotel: HOTEIS[h].chave, nome, andar: nome.slice(3, 4) },
          })),
        ),
      },
    ];
    const recebimento = await recebimentoDeLotes();
    for (const lote of lotes) await recebimento.receberLote(credencial.credencial, lote);
  } finally {
    await credenciais.revogarCredencial(ctxAdmin, credencial.id);
  }

  const hoteisUc = await casosDeUsoDeHoteis();
  const hoteis = {} as Record<Hotel, string>;
  for (const h of Object.keys(HOTEIS) as Hotel[]) {
    try {
      hoteis[h] = (
        await hoteisUc.importarHotel(ctxAdmin, { fonte: FONTE, chave: HOTEIS[h].chave })
      ).hotelId;
    } catch (e) {
      if (!conflito(e, 'hotel_ja_importado')) throw e;
      hoteis[h] = (e as Conflito).parametros['hotelId'] as string;
    }
  }
  // O Serra fica em implantação, com as UHs pendentes de licença: o Admin ativa no teste.
  for (const h of ['centro', 'praia'] as const) {
    try {
      await hoteisUc.ativarHotel(ctxAdmin, hoteis[h]);
    } catch (e) {
      if (!conflito(e, 'hotel_ja_ativo')) throw e;
    }
  }
  await promoverUhsDoTenant(tenantId);

  const bandeirasUc = await casosDeUsoDeBandeiras();
  const bandeiras = {} as Record<keyof typeof BANDEIRAS, string>;
  const existentes = await bandeirasUc.listarBandeiras(ctxAdmin);
  for (const [b, nome] of Object.entries(BANDEIRAS) as [keyof typeof BANDEIRAS, string][]) {
    bandeiras[b] =
      existentes.find((x) => x.nome === nome)?.id ??
      (await bandeirasUc.criarBandeira(ctxAdmin, nome)).id;
  }
  const visiveis = await (await casosDeUsoDePapeis()).listarHoteisVisiveis(ctxAdmin);
  for (const h of Object.keys(HOTEIS) as Hotel[]) {
    const bandeiraId = bandeiras[HOTEIS[h].bandeira];
    if (visiveis.find((v) => v.id === hoteis[h])?.bandeiraId !== bandeiraId) {
      await bandeirasUc.definirBandeiraDoHotel(ctxAdmin, hoteis[h], bandeiraId);
    }
  }

  const configuracaoUc = await casosDeUsoDeConfiguracao();
  for (const [h, modeloContratual] of Object.entries(MODELO_CONTRATUAL) as [
    Hotel,
    ModeloContratual,
  ][]) {
    const { hotel } = await configuracaoUc.lerConfiguracao(ctxAdmin, hoteis[h]);
    if (hotel && hotel.modeloContratual === null) {
      await configuracaoUc.configurarHotel(ctxAdmin, hoteis[h], {
        fuso: hotel.fuso,
        pais: hotel.pais,
        subdivisao: hotel.subdivisao,
        moeda: hotel.moeda,
        idiomaPadrao: hotel.idiomaPadrao,
        modeloContratual,
      });
    }
  }

  const locaisUc = await casosDeUsoDeLocais();
  const locais = {} as Record<Hotel, Map<string, string>>;
  for (const h of Object.keys(HOTEIS) as Hotel[]) {
    const lista = await locaisUc.listarLocais(ctxAdmin, hoteis[h]);
    const porNome = new Map(lista.map((l) => [l.nome, l.id]));
    for (const area of AREAS[h] ?? []) {
      if (!porNome.has(area)) {
        porNome.set(area, (await locaisUc.criarAreaComum(ctxAdmin, hoteis[h], area, null)).id);
      }
    }
    for (const [nome, edificacao] of Object.entries(EDIFICACOES[h] ?? {})) {
      const id = porNome.get(nome);
      const gravada = lista.find((l) => l.id === id)?.edificacao ?? null;
      if (id && gravada === null) await locaisUc.alterarEdificacao(ctxAdmin, id, edificacao);
    }
    locais[h] = porNome;
  }
  const local = (h: Hotel, nome: string) => {
    const id = locais[h].get(nome);
    if (!id) throw new Error(`Local ${nome} do hotel ${h} não encontrado.`);
    return id;
  };
  log('Hotéis, bandeiras e locais prontos.');

  // 3. Categorias, situações e prioridades padrão.
  const categoriasUc = await casosDeUsoDeCategorias();
  await categoriasUc.instalarCategoriasPadrao(ctxAdmin);
  const { categorias } = await categoriasUc.listarCategorias(ctxAdmin);
  const situacoesUc = await casosDeUsoDeSituacoes();
  await situacoesUc.instalarPadrao(ctxAdmin);
  const { prioridades } = await situacoesUc.listarSituacoesEPrioridades(ctxAdmin);
  const prioridade = (chave: string) => {
    const id = prioridades.find((p) => p.chavePadrao === chave)?.id;
    if (!id) throw new Error(`Prioridade padrão ${chave} não encontrada.`);
    return id;
  };
  // Prioridade por categoria: sem esta política, todo chamado abria na de
  // menor peso (Baixa). Gravar de novo reaproveita a linha do grupo.
  await (
    await casosDeUsoDeConfiguracao()
  ).gravarPolitica(
    ctxAdmin,
    'chamado.prioridade_padrao_por_categoria',
    { tipo: 'grupo' },
    Object.fromEntries(
      categorias.flatMap((c) => {
        const chave = PRIORIDADE_POR_CATEGORIA[c.chavePadrao as CategoriaPadrao];
        return chave ? [[c.id, prioridade(chave)]] : [];
      }),
    ),
  );

  // 4. Pessoas, pelo convite. Os proprietários antes, porque o papel é no escopo deles.
  const proprietariosUc = await casosDeUsoDeProprietarios();
  const garantirProprietario = async (nome: string) => {
    const achado = (await proprietariosUc.listarProprietarios(ctxAdmin)).find(
      (p) => p.nome === nome,
    );
    return achado ?? { id: (await proprietariosUc.criarProprietario(ctxAdmin, nome, null)).id };
  };
  const hoje = new Date().toISOString().slice(0, 10);
  const propUh = await garantirProprietario('Otávio Proprietário');
  const propHotel = await garantirProprietario('Olívia Proprietária');
  const vinculos = (await proprietariosUc.listarProprietarios(ctxAdmin)).flatMap((p) => p.vinculos);
  if (!vinculos.some((v) => v.localId === local('centro', 'UH 101') && v.vigente)) {
    await proprietariosUc.vincular(
      ctxAdmin,
      propUh.id,
      { tipo: 'uh', localId: local('centro', 'UH 101') },
      { inicio: hoje, fim: null },
    );
  }
  if (!vinculos.some((v) => v.tipo === 'hotel' && v.hotelId === hoteis.praia && v.vigente)) {
    await proprietariosUc.vincular(
      ctxAdmin,
      propHotel.id,
      { tipo: 'hotel', hotelId: hoteis.praia },
      { inicio: hoje, fim: null },
    );
  }

  const noventaDias = new Date(Date.now() + 90 * 24 * 3600 * 1000);
  const convites: [Pessoa, Papel, Escopo, Date | null][] = [
    ['gestor', 'gestor_csc', { tipo: 'bandeira', bandeiraId: bandeiras.azul }, null],
    ['implantador', 'implantador', { tipo: 'hotel', hotelId: hoteis.serra }, noventaDias],
    ['gerenteCentro', 'gerente_hotel', { tipo: 'hotel', hotelId: hoteis.centro }, null],
    ['gerentePraia', 'gerente_hotel', { tipo: 'hotel', hotelId: hoteis.praia }, null],
    ['tecnicoCentro', 'tecnico', { tipo: 'hotel', hotelId: hoteis.centro }, null],
    ['tecnicoPraia', 'tecnico', { tipo: 'hotel', hotelId: hoteis.praia }, null],
    ['solicitante', 'solicitante', { tipo: 'hotel', hotelId: hoteis.centro }, null],
    ['donoUh', 'proprietario', { tipo: 'proprietario', proprietarioId: propUh.id }, null],
    ['donoHotel', 'proprietario', { tipo: 'proprietario', proprietarioId: propHotel.id }, null],
  ];
  const convitesUc: CasoDeUsoDeConvites = await convitesDeDemonstracao(o.senha);
  const usuarios = {
    admin: { email: emailDe('admin'), usuarioId: admin.usuarioId },
  } as ResultadoDaDemonstracao['usuarios'];
  for (const [p, papel, escopo, validoAte] of convites) {
    const pedido: PedidoDeConviteDeMembro = {
      email: emailDe(p),
      nome: PESSOAS[p].nome,
      papel,
      escopo,
      validoAte,
      redirecionarPara: `${site}/auth/confirmar`,
    };
    let usuarioId: string;
    try {
      usuarioId = (await convitesUc.convidarMembro(ctxAdmin, pedido)).usuarioId;
    } catch (e) {
      if (!conflito(e, 'ja_e_membro')) throw e;
      // Já é membro: a identidade devolve o id e põe a senha de teste de novo.
      usuarioId = (
        await identidade.garantirUsuario({
          email: pedido.email,
          nome: pedido.nome,
          tenantId,
          nomeTenant: NOME_DO_GRUPO,
        })
      ).usuarioId;
    }
    usuarios[p] = { email: pedido.email, usuarioId };
  }
  const ctx = (p: Pessoa): Contexto => ({ usuarioId: usuarios[p].usuarioId, tenantId });
  log(`Pessoas prontas: ${Object.keys(usuarios).length} contas.`);

  const equipesUc = await casosDeUsoDeEquipes();
  const { equipes } = await equipesUc.listarEquipes(ctxAdmin, hoteis.centro);
  const achada = equipes.find((e) => e.nome === 'Equipe Centro');
  const equipe = achada ?? (await equipesUc.criarEquipe(ctxAdmin, hoteis.centro, 'Equipe Centro'));
  const membrosDaEquipe = achada?.membros ?? [];
  if (!membrosDaEquipe.some((m) => m.usuarioId === usuarios.tecnicoCentro.usuarioId)) {
    await equipesUc.porMembro(ctxAdmin, equipe.id, usuarios.tecnicoCentro.usuarioId);
  }

  const fornecedoresUc = await casosDeUsoDeFornecedores();
  const fornecedoresExistentes = await fornecedoresUc.listar(ctxAdmin);
  for (const { quem, ...dados } of FORNECEDORES) {
    if (!fornecedoresExistentes.some((f) => f.nome === dados.nome)) {
      await fornecedoresUc.cadastrar(ctx(quem), dados);
    }
  }
  log(`Fornecedores prontos: ${FORNECEDORES.length}.`);

  // 5. Ativos e chamados, como operações offline de chave fixa.
  const sincronizacao = await casosDeUsoDeSincronizacao();
  const operar = async (quem: Pessoa, nome: string, op: Omit<OperacaoOffline, 'chave'>) =>
    (
      await sincronizacao.receberOperacao(ctx(quem), {
        ...op,
        chave: idFixo(tenantId, nome),
      } as OperacaoOffline)
    ).resposta;

  const ativos = {} as Record<Ativo, string>;
  for (const [a, [h, nomeDoLocal, categoria, nome, fabricante, modelo]] of Object.entries(
    ATIVOS,
  ) as [Ativo, (typeof ATIVOS)[Ativo]][]) {
    const categoriaId = categorias.find((c) => c.chavePadrao === categoria)?.id ?? null;
    const r = await operar('admin', `ativo:${a}`, {
      tipo: 'ativo.cadastrar',
      dados: {
        localId: local(h, nomeDoLocal),
        categoriaId,
        nome,
        fabricante,
        modelo,
        numeroSerie: null,
        ...DADOS_DA_I1[a],
      },
    });
    ativos[a] = String(r['id']);
  }
  log('Ativos prontos.');

  const triagem = await casosDeUsoDeTriagem();
  const chamadosUc = await casosDeUsoDeChamados();
  const duasHorasAtras = new Date(Date.now() - 2 * 3600 * 1000);
  const abrir = async (
    cenario: Cenario,
    quem: Pessoa,
    h: Hotel,
    nomeDoLocal: string,
    descricao: string,
    ativo: Ativo | null = null,
    paradoDesde: Date | null = null,
  ) =>
    String(
      (
        await operar(quem, `chamado:${cenario}`, {
          tipo: 'chamado.abrir',
          dados: {
            localId: local(h, nomeDoLocal),
            ativoId: ativo ? ativos[ativo] : null,
            descricao,
            paradoDesde: paradoDesde?.toISOString() ?? null,
          },
        })
      )['id'],
    );
  /** Tria e gera a OS, se ainda não foi feito. */
  const gerarOs = async (
    quem: Pessoa,
    chamadoId: string,
    responsavel: { tipo: 'tecnico'; usuarioId: string } | { tipo: 'equipe'; equipeId: string },
  ) => {
    const existente = (await triagem.osDoChamado(ctx(quem), chamadoId))[0];
    if (existente) return existente.id;
    let c = await chamadosUc.chamado(ctx(quem), chamadoId);
    if (c.estado === 'aberto') {
      await triagem.triar(ctx(quem), chamadoId, { versao: c.versao });
      c = await chamadosUc.chamado(ctx(quem), chamadoId);
    }
    return (await triagem.gerarOs(ctx(quem), chamadoId, { versao: c.versao, responsavel })).id;
  };
  const osAtual = async (quem: Pessoa, chamadoId: string, osId: string) => {
    const os = (await triagem.osDoChamado(ctx(quem), chamadoId)).find((x) => x.id === osId);
    if (!os) throw new Error(`OS ${osId} não encontrada.`);
    return os;
  };
  /** Ação do Técnico pela fila offline; repetida, volta a resposta da primeira vez. */
  const agir = async (
    cenario: Cenario,
    chamadoId: string,
    osId: string,
    acao: 'iniciar' | 'concluir',
    extra: { equipamentoVoltou?: boolean; concluidaEm?: string } = {},
  ) => {
    const os = await osAtual('tecnicoCentro', chamadoId, osId);
    await operar('tecnicoCentro', `os:${cenario}:${acao}`, {
      tipo: `os.${acao}`,
      dados: { osId, versao: os.versao, ...extra },
    });
  };
  const tecnico = { tipo: 'tecnico' as const, usuarioId: usuarios.tecnicoCentro.usuarioId };

  const chamados = {} as Record<Cenario, string>;
  // Aberto, esperando a triagem do Gerente ou do Gestor CSC.
  chamados.aberto = await abrir(
    'aberto',
    'solicitante',
    'centro',
    'UH 104',
    'Chuveiro sem água quente',
  );

  // OS atribuída ao Técnico, ainda não iniciada: aparece na fila do dia do PWA.
  chamados.atribuido = await abrir(
    'atribuido',
    'solicitante',
    'centro',
    'UH 101',
    'Frigobar não gela',
    'frigobar',
  );
  await gerarOs('gerenteCentro', chamados.atribuido, tecnico);

  // Em execução, com o equipamento parado desde a abertura.
  chamados.emExecucaoParado = await abrir(
    'emExecucaoParado',
    'gerenteCentro',
    'centro',
    'UH 102',
    'Ar-condicionado desligando sozinho',
    'arCentro',
    duasHorasAtras,
  );
  const osParado = await gerarOs('gerenteCentro', chamados.emExecucaoParado, tecnico);
  await agir('emExecucaoParado', chamados.emExecucaoParado, osParado, 'iniciar');

  // Concluída pelo Técnico, esperando o aceite de quem abriu (a Solicitante) ou do Gerente.
  chamados.aguardandoAceite = await abrir(
    'aguardandoAceite',
    'solicitante',
    'centro',
    'Piscina',
    'Aquecedor da piscina com ruído',
    'aquecedor',
  );
  const osAceite = await gerarOs('gerenteCentro', chamados.aguardandoAceite, tecnico);
  await agir('aguardandoAceite', chamados.aguardandoAceite, osAceite, 'iniciar');
  const inicio = new Date(Date.now() - 90 * 60 * 1000).toISOString();
  const fim = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await operar('tecnicoCentro', 'os:aguardandoAceite:horas', {
    tipo: 'os.apontar_horas',
    dados: { osId: osAceite, inicio, fim },
  });
  await operar('tecnicoCentro', 'os:aguardandoAceite:material', {
    tipo: 'os.registrar_material',
    dados: { osId: osAceite, descricao: 'Rolamento do motor da bomba' },
  });
  await agir('aguardandoAceite', chamados.aguardandoAceite, osAceite, 'concluir');

  // Cancelado pelo Gerente, com o motivo.
  chamados.cancelado = await abrir(
    'cancelado',
    'solicitante',
    'centro',
    'UH 103',
    'TV sem sinal',
    'tv',
  );
  const cancelado = await chamadosUc.chamado(ctx('gerenteCentro'), chamados.cancelado);
  if (cancelado.estado !== 'cancelado') {
    await triagem.cancelarChamado(ctx('gerenteCentro'), chamados.cancelado, {
      versao: cancelado.versao,
      motivo: 'Aberto em duplicidade: o hóspede já tinha avisado a recepção.',
    });
  }

  // Concluído: OS da equipe, executada e aceita pelo Gerente (linha do tempo completa).
  chamados.concluido = await abrir(
    'concluido',
    'gerenteCentro',
    'centro',
    'Cozinha',
    'Forno não chega à temperatura',
    'forno',
  );
  const osConcluida = await gerarOs('gerenteCentro', chamados.concluido, {
    tipo: 'equipe',
    equipeId: equipe.id,
  });
  await agir('concluido', chamados.concluido, osConcluida, 'iniciar');
  await agir('concluido', chamados.concluido, osConcluida, 'concluir');
  const concluida = await osAtual('gerenteCentro', chamados.concluido, osConcluida);
  if (concluida.estado === 'concluida') {
    await triagem.aceitarOs(ctx('gerenteCentro'), osConcluida, { versao: concluida.versao });
  }

  // No Praia, hotel do proprietário do hotel inteiro: aberto pelo Gerente.
  chamados.praiaAberto = await abrir(
    'praiaAberto',
    'gerentePraia',
    'praia',
    'UH 101',
    'Ar-condicionado pingando no carpete',
    'arPraia',
  );
  // Prioridade de cada chamado: a da categoria do ativo, que a política já
  // aplica na abertura, e a do chuveiro sem ativo, que o Gerente ajusta para
  // Alta (o roteiro do kit tria com Urgente e confere a troca no histórico).
  // Num grupo criado antes da política, os chamados ainda em curso
  // são ajustados aqui; os já concluídos ou cancelados guardam a prioridade
  // da abertura (cópia da política, ADR-026).
  const esperada: Record<Cenario, [Pessoa, string]> = {
    aberto: ['gerenteCentro', 'alta'],
    atribuido: ['gerenteCentro', PRIORIDADE_POR_CATEGORIA.refrigeracao],
    emExecucaoParado: ['gerenteCentro', PRIORIDADE_POR_CATEGORIA.refrigeracao],
    aguardandoAceite: ['gerenteCentro', PRIORIDADE_POR_CATEGORIA.piscina],
    cancelado: ['gerenteCentro', PRIORIDADE_POR_CATEGORIA.eletronicos],
    concluido: ['gerenteCentro', PRIORIDADE_POR_CATEGORIA.cozinha],
    praiaAberto: ['gerentePraia', PRIORIDADE_POR_CATEGORIA.refrigeracao],
  };
  for (const cenario of CENARIOS) {
    const [quem, chave] = esperada[cenario];
    const c = await chamadosUc.chamado(ctx(quem), chamados[cenario]);
    if (c.prioridadeId === prioridade(chave)) continue;
    if (!(ESTADOS_COM_PRIORIDADE_AJUSTAVEL as readonly string[]).includes(c.estado)) continue;
    await triagem.priorizar(ctx(quem), chamados[cenario], {
      versao: c.versao,
      prioridadeId: prioridade(chave),
    });
  }
  log('Chamados e OS prontos.');

  return { tenantId, usuarios, hoteis, chamados };
}
