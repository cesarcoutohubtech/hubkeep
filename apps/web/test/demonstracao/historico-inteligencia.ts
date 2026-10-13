// Histórico de demonstração do Intelligence (atividade 3; proposta e decisões
// em docs/diario-intelligence.md, 13/10/2026): um grupo fictício com seis meses
// de manutenção em que os sinais do motor aparecem, para mostrar as telas do
// Intelligence no dev e no staging.
//
// Este arquivo tem o roteiro: uma função pura e determinística que descreve o
// grupo (bandeiras, hotéis, locais, ativos, fornecedores e códigos de falha),
// os chamados com as OS e as paradas de cada dia e as decisões sobre cada
// insight. Mesma semente e mesmo fim, mesmo roteiro, com as mesmas chaves.
//
// - O ruído do dia a dia é regular de propósito: os códigos de falha do ruído
//   giram em ordem fixa por hotel, e o ruído não toca os ativos dos cenários.
//   Assim, só os cenários plantados abrem insight, e o teste
//   (historico-inteligencia.test.ts) confere isso rodando o job de cada dia.
// - Cada cenário usa um código de falha próprio, menos o crescimento, que
//   cresce um código do ruído. Um cenário não cria sinal no outro.
// - As decisões contam em dias desde a abertura do insight, porque quem abre o
//   insight é o job, não o roteiro.
//
// Ainda não grava nada. A gravação (pnpm demo:historico --ambiente
// dev|staging, com a trava do kit contra produção) passa pelos casos de uso
// com o relógio do roteiro, na montagem separada do agente da 1b
// (montagem-com-relogio.ts, montarComRelogio); ela entra aqui depois que essa
// montagem estiver na main (Cesar e Kaio, 13/10/2026). O grupo base sai do kit
// (semearDemonstracao), sem mudar o kit.
//
// O que o histórico gerado mostra (decisão do Cesar de 13/10/2026): as datas
// do roteiro vão para o chamado, a OS, as transições, o ativo e as paradas, e
// o job e os indicadores leem essas datas. A auditoria e o outbox ficam com o
// relógio do banco, então a linha do tempo dos chamados (aba "Histórico" do
// chamado, da OS e do ativo) e a auditoria geral mostram a data da geração.
// A demonstração usa as telas do Intelligence e os indicadores, não a linha do
// tempo dos chamados.
import {
  type AcaoDaOs,
  type CategoriaPadrao,
  type EstadoDaOs,
  type EstadoDoChamado,
  type ExecutadoPor,
  TRANSICOES_DA_OS,
} from '@hubkeep/dominio';
import {
  type AcaoDoInsight,
  type ConfigSistemico,
  type Criticidade,
  DIA_MS,
  type EstadoDoInsight,
  HORA_MS,
  type MotivoDeDescarte,
  PADRAO_SISTEMICO,
  type RegraSistemica,
} from '@hubkeep/inteligencia';

export const NOME_DO_GRUPO = 'Grupo Demonstração — Intelligence';
export const DOMINIO_DO_GRUPO = 'intelligence.demo.hubkeep.test';
export const SEMENTE_DO_HISTORICO = 20261013;
export const DIAS_DO_HISTORICO = 183;
/**
 * Dias de chamados do núcleo antes do contrato do Intelligence. Sem eles, nos
 * dois primeiros meses a janela anterior do crescimento (30 dias) estaria
 * quase vazia, e todo código pareceria crescer. Com eles, o grupo já usava o
 * HubKeep antes de contratar o módulo, como um cliente de verdade.
 */
export const DIAS_DE_AQUECIMENTO = 60;

/** O tamanho do grupo e do ruído; os cenários são os mesmos em qualquer volume. */
export interface VolumeDoHistorico {
  hoteisPorBandeira: number;
  andares: number;
  uhsPorAndar: number;
  /** Chamados sem ativo por dia em cada hotel (média). */
  chamadosSemAtivoPorDia: number;
  /** Corretivas por ativo de UH por ano no ruído (média). */
  corretivasPorAtivoPorAno: number;
  /**
   * Corretivas por ativo de área comum por ano no ruído (média). Menor que o
   * das UHs: as categorias da área comum têm poucos ativos por modelo, e com o
   * ruído das UHs o sorteio sozinho abriria o sinal do mesmo modelo.
   */
  corretivasPorAtivoDeAreaPorAno: number;
}

/** O volume do dev e do staging (proposta de 13/10/2026; o Kaio ajusta, ADR-033). */
export const VOLUME_COMPLETO: VolumeDoHistorico = {
  hoteisPorBandeira: 3,
  andares: 6,
  uhsPorAndar: 8,
  chamadosSemAtivoPorDia: 2.5,
  corretivasPorAtivoPorAno: 3,
  corretivasPorAtivoDeAreaPorAno: 1,
};

/** O volume do teste da CI: os mesmos cenários, com menos UHs e menos ruído. */
export const VOLUME_CURTO: VolumeDoHistorico = {
  hoteisPorBandeira: 3,
  andares: 3,
  uhsPorAndar: 6,
  chamadosSemAtivoPorDia: 1,
  corretivasPorAtivoPorAno: 3,
  corretivasPorAtivoDeAreaPorAno: 1,
};

export interface OpcoesDoRoteiro {
  /** O último dia do histórico, `AAAA-MM-DD` (UTC). */
  fim: string;
  volume?: VolumeDoHistorico;
  semente?: number;
}

export interface BandeiraDoRoteiro {
  chave: string;
  nome: string;
}

export interface HotelDoRoteiro {
  chave: string;
  bandeira: string;
  nome: string;
}

export interface LocalDoRoteiro {
  chave: string;
  hotel: string;
  tipo: 'uh' | 'area_comum';
  andar: string | null;
  nome: string;
}

export interface AtivoDoRoteiro {
  chave: string;
  hotel: string;
  local: string;
  categoria: CategoriaPadrao;
  nome: string;
  fabricante: string;
  modelo: string;
  criticidade: Criticidade;
  /** `app.ativo.data_compra`: a idade do ativo na substituição. */
  dataCompra: Date;
  garantiaAte: Date;
  /** O cenário a que o ativo pertence; o ruído não toca esses ativos. */
  cenario: string | null;
}

export interface FornecedorDoRoteiro {
  chave: string;
  nome: string;
}

export interface CodigoDeFalhaDoRoteiro {
  chave: string;
  nome: string;
}

export interface PassoDaOs {
  acao: AcaoDaOs;
  quando: Date;
  /** Só no reabrir, que exige motivo. */
  motivo?: string;
}

export interface OsDoRoteiro {
  codigoFalha: string;
  executadoPor: ExecutadoPor;
  fornecedor: string | null;
  /** Em reais, informado no aceite; null quando não informado. */
  custo: number | null;
  /** Do gerar em diante, em ordem; o último passo dá o estado. */
  passos: readonly PassoDaOs[];
  estado: EstadoDaOs;
}

export interface ParadaDoRoteiro {
  inicio: Date;
  fim: Date;
}

export interface ChamadoDoRoteiro {
  chave: string;
  hotel: string;
  local: string;
  ativo: string | null;
  abertoEm: Date;
  impactoHospede: boolean | null;
  descricao: string;
  estado: EstadoDoChamado;
  os: OsDoRoteiro;
  /** A parada do ativo aberta pelo chamado; null sem parada. */
  parada: ParadaDoRoteiro | null;
  cenario: string | null;
}

/** O insight que o cenário deve abrir: o tipo, a regra e o conjunto de hotéis. */
export type AlvoDoCenario =
  | { tipo: 'atencao_ativo'; ativo: string; hotel: string }
  | {
      tipo: 'sistemico';
      regra: RegraSistemica;
      hoteis: readonly string[];
      /** Parte do escopo do insight, em chaves do roteiro (o modelo vai normalizado). */
      escopo: Readonly<Record<string, string>>;
    };

export interface DecisaoDoRoteiro {
  /** Dias desde o dia em que o job abriu o insight. */
  aposDias: number;
  acao: AcaoDoInsight;
  nota?: string;
  motivoDeDescarte?: MotivoDeDescarte;
}

export type SinalDoCenario =
  'atencao' | 'reincidencia' | 'sistemico' | 'substituicao' | 'efetividade';

export interface CenarioDoRoteiro {
  chave: string;
  sinal: SinalDoCenario;
  /** O insight que o cenário abre; null nos sinais que não abrem insight. */
  alvo: AlvoDoCenario | null;
  decisoes: readonly DecisaoDoRoteiro[];
  /** O estado do insight no fim do histórico; null sem insight. */
  estadoFinal: EstadoDoInsight | null;
  /** O ativo do cenário, nos sinais de ativo. */
  ativo?: string;
  /** A intervenção que a efetividade compara (antes e depois). */
  intervencaoEm?: Date;
}

export interface RoteiroDoHistorico {
  semente: number;
  /** O início do contrato do módulo, no primeiro dia do histórico: o job roda daqui em diante. */
  inicio: Date;
  /** O primeiro dia dos chamados, DIAS_DE_AQUECIMENTO antes do contrato; os ativos já existem nele. */
  inicioDosChamados: Date;
  /** Os dias do histórico (os do job), `AAAA-MM-DD`, do mais antigo ao `fim`. */
  dias: readonly string[];
  volume: VolumeDoHistorico;
  bandeiras: readonly BandeiraDoRoteiro[];
  hoteis: readonly HotelDoRoteiro[];
  locais: readonly LocalDoRoteiro[];
  ativos: readonly AtivoDoRoteiro[];
  fornecedores: readonly FornecedorDoRoteiro[];
  codigosDeFalha: readonly CodigoDeFalhaDoRoteiro[];
  /** Em ordem de abertura; a chave segue a ordem. */
  chamados: readonly ChamadoDoRoteiro[];
  cenarios: readonly CenarioDoRoteiro[];
  /** A política `inteligencia.sistemico` do grupo: todas as regras ligadas, com os valores padrão. */
  politicaSistemica: ConfigSistemico;
}

// --- sorteio determinístico ---------------------------------------------------

/** mulberry32: o mesmo número da semente dá a mesma sequência. */
function sorteador(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const CODIGOS_DO_RUIDO: readonly CodigoDeFalhaDoRoteiro[] = [
  { chave: 'vazamento', nome: 'Vazamento' },
  { chave: 'ruido_anormal', nome: 'Ruído anormal' },
  { chave: 'nao_liga', nome: 'Não liga' },
  { chave: 'baixo_desempenho', nome: 'Baixo desempenho' },
  { chave: 'entupimento', nome: 'Entupimento' },
  { chave: 'quebra_mecanica', nome: 'Quebra mecânica' },
  { chave: 'iluminacao', nome: 'Iluminação' },
  { chave: 'fechadura', nome: 'Fechadura' },
  { chave: 'acabamento', nome: 'Acabamento danificado' },
  { chave: 'mau_cheiro', nome: 'Mau cheiro' },
];

const CODIGOS_DOS_CENARIOS: readonly CodigoDeFalhaDoRoteiro[] = [
  { chave: 'falha_queimador', nome: 'Falha no queimador' },
  { chave: 'porta_elevador', nome: 'Porta do elevador' },
  { chave: 'desarme_compressor', nome: 'Desarme do compressor' },
  { chave: 'ar_sem_resfriar', nome: 'Ar não resfria' },
  { chave: 'temperatura_fora', nome: 'Temperatura fora da faixa' },
  { chave: 'infiltracao', nome: 'Infiltração' },
  { chave: 'exaustao', nome: 'Exaustão fraca' },
  { chave: 'queda_disjuntor', nome: 'Queda de disjuntor' },
  { chave: 'rolamento', nome: 'Rolamento' },
];

const NOMES_DOS_HOTEIS = [
  ['Demonstração Centro', 'Demonstração Aeroporto', 'Demonstração Parque'],
  ['Demonstração Praia', 'Demonstração Serra', 'Demonstração Lago'],
] as const;

const MODELO_A = { fabricante: 'Climafrio', modelo: 'Split 9000' };
const MODELO_B = { fabricante: 'Ventura', modelo: 'Split 12000' };
/** O modelo do cenário sistêmico: o mesmo modelo falhando em hotéis diferentes. */
const MODELO_DO_CENARIO = { fabricante: 'Polar', modelo: 'Inverter 18000' };

// --- montagem -----------------------------------------------------------------

export function roteiroDoHistorico(o: OpcoesDoRoteiro): RoteiroDoHistorico {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.fim)) throw new Error(`Fim fora do formato: ${o.fim}`);
  const volume = o.volume ?? VOLUME_COMPLETO;
  const semente = o.semente ?? SEMENTE_DO_HISTORICO;
  const sortear = sorteador(semente);
  const entre = (a: number, b: number) => a + sortear() * (b - a);

  const inicioDoFim = new Date(`${o.fim}T00:00:00Z`).getTime();
  const inicioDoDia = (antesDoFim: number) => inicioDoFim - antesDoFim * DIA_MS;
  /** O instante `hora` (UTC) do dia que fica `antesDoFim` dias antes do fim. */
  const em = (antesDoFim: number, hora: number) =>
    new Date(inicioDoDia(antesDoFim) + hora * HORA_MS);
  const dias = Array.from({ length: DIAS_DO_HISTORICO }, (_, i) =>
    new Date(inicioDoDia(DIAS_DO_HISTORICO - 1 - i)).toISOString().slice(0, 10),
  );
  // O contrato começa às 03:00 UTC (meia-noite em Brasília) do primeiro dia.
  const inicio = em(DIAS_DO_HISTORICO - 1, 3);
  const inicioDosChamados = em(DIAS_DO_HISTORICO - 1 + DIAS_DE_AQUECIMENTO, 3);
  const fimDoHistorico = inicioDoFim + DIA_MS - 1;
  const anos = (n: number) => new Date(inicio.getTime() - n * 365 * DIA_MS);

  // Grupo, hotéis, locais e ativos.
  const bandeiras: BandeiraDoRoteiro[] = [
    { chave: 'b1', nome: 'Demonstração Urbano' },
    { chave: 'b2', nome: 'Demonstração Resort' },
  ];
  const hoteis: HotelDoRoteiro[] = [];
  const locais: LocalDoRoteiro[] = [];
  const ativos: AtivoDoRoteiro[] = [];
  bandeiras.forEach((b, ib) => {
    for (let ih = 0; ih < volume.hoteisPorBandeira; ih += 1) {
      const nome = NOMES_DOS_HOTEIS[ib]?.[ih] ?? `Demonstração ${ib + 1}.${ih + 1}`;
      hoteis.push({ chave: `h${hoteis.length + 1}`, bandeira: b.chave, nome: `Hotel ${nome}` });
    }
  });
  const ativo = (
    a: Omit<AtivoDoRoteiro, 'cenario' | 'dataCompra' | 'garantiaAte'> & Partial<AtivoDoRoteiro>,
  ) => {
    ativos.push({ dataCompra: anos(4), garantiaAte: anos(2), cenario: null, ...a });
  };
  for (const h of hoteis) {
    for (let andar = 1; andar <= volume.andares; andar += 1) {
      for (let n = 1; n <= volume.uhsPorAndar; n += 1) {
        const numero = `${andar}${String(n).padStart(2, '0')}`;
        const local = `${h.chave}-uh${numero}`;
        locais.push({
          chave: local,
          hotel: h.chave,
          tipo: 'uh',
          andar: String(andar),
          nome: `UH ${numero}`,
        });
        ativo({
          chave: `${local}-ar`,
          hotel: h.chave,
          local,
          categoria: 'refrigeracao',
          nome: `Ar-condicionado UH ${numero}`,
          ...(n % 2 ? MODELO_A : MODELO_B),
          criticidade: 2,
        });
      }
    }
    const area = (sufixo: string, nome: string) => {
      const chave = `${h.chave}-${sufixo}`;
      locais.push({ chave, hotel: h.chave, tipo: 'area_comum', andar: null, nome });
      return chave;
    };
    const cozinha = area('cozinha', 'Cozinha');
    const lavanderia = area('lavanderia', 'Lavanderia');
    const maquinas = area('maquinas', 'Casa de máquinas');
    const hall = area('hall', 'Hall dos elevadores');
    area('recepcao', 'Recepção');
    const base = { hotel: h.chave };
    ativo({
      ...base,
      chave: `${h.chave}-camara`,
      local: cozinha,
      categoria: 'cozinha',
      nome: 'Câmara fria',
      fabricante: 'Gelotec',
      modelo: 'CF-20',
      criticidade: 4,
    });
    ativo({
      ...base,
      chave: `${h.chave}-freezer`,
      local: cozinha,
      categoria: 'cozinha',
      nome: 'Freezer vertical',
      fabricante: 'Gelotec',
      modelo: 'FV-8',
      criticidade: 3,
    });
    ativo({
      ...base,
      chave: `${h.chave}-lavadora`,
      local: lavanderia,
      categoria: 'lavanderia',
      nome: 'Lava-roupa industrial',
      fabricante: 'Lavamax',
      modelo: 'LX-60',
      criticidade: 4,
    });
    ativo({
      ...base,
      chave: `${h.chave}-secadora`,
      local: lavanderia,
      categoria: 'lavanderia',
      nome: 'Secadora industrial',
      fabricante: 'Lavamax',
      modelo: 'SX-60',
      criticidade: 3,
    });
    ativo({
      ...base,
      chave: `${h.chave}-bomba`,
      local: maquinas,
      categoria: 'hidraulica',
      nome: 'Bomba de recalque',
      fabricante: 'Hidrax',
      modelo: 'BR-5',
      criticidade: 4,
    });
    ativo({
      ...base,
      chave: `${h.chave}-caldeira`,
      local: maquinas,
      categoria: 'hidraulica',
      nome: 'Caldeira',
      fabricante: 'Termobras',
      modelo: 'TB-300',
      criticidade: 5,
    });
    ativo({
      ...base,
      chave: `${h.chave}-elevador1`,
      local: hall,
      categoria: 'elevadores',
      nome: 'Elevador social',
      fabricante: 'Elevar',
      modelo: 'E-8',
      criticidade: 5,
    });
    ativo({
      ...base,
      chave: `${h.chave}-elevador2`,
      local: hall,
      categoria: 'elevadores',
      nome: 'Elevador de serviço',
      fabricante: 'Elevar',
      modelo: 'E-8',
      criticidade: 4,
    });
  }
  const ativoPorChave = new Map(ativos.map((a) => [a.chave, a]));
  const marcar = (chave: string, cenario: string, mudanca: Partial<AtivoDoRoteiro> = {}) => {
    const a = ativoPorChave.get(chave);
    if (!a) throw new Error(`Ativo do cenário inexistente: ${chave}`);
    Object.assign(a, { cenario, ...mudanca });
  };
  const fornecedores: FornecedorDoRoteiro[] = [
    { chave: 'f-frio', nome: 'Frio Sul Demonstração' },
    { chave: 'f-servicos', nome: 'Serviços Gerais Demonstração' },
  ];

  // Chamados: uma OS por chamado, com o caminho de sempre (gerar, iniciar,
  // concluir, aceitar), cortado no fim do histórico.
  const chamados: Omit<ChamadoDoRoteiro, 'chave'>[] = [];
  interface PedidoDeChamado {
    hotel: string;
    local: string;
    ativo: string | null;
    abertoEm: Date;
    codigoFalha: string;
    descricao: string;
    cenario: string | null;
    impactoHospede?: boolean | null;
    executadoPor?: ExecutadoPor;
    fornecedor?: string | null;
    custo?: number | null;
    /** Horas da parada do ativo; sem o campo, sem parada. */
    horasParadas?: number;
    /** Reaberturas antes do aceite. */
    reaberturas?: number;
  }
  const chamado = (p: PedidoDeChamado) => {
    const t = p.abertoEm.getTime();
    const gerada = t + entre(0.5, 3) * HORA_MS;
    const iniciada = gerada + entre(0.5, 6) * HORA_MS;
    const parada = p.horasParadas
      ? {
          inicio: new Date(t + 0.25 * HORA_MS),
          fim: new Date(t + (0.25 + p.horasParadas) * HORA_MS),
        }
      : null;
    let concluida = Math.max(iniciada + entre(1, 6) * HORA_MS, parada ? parada.fim.getTime() : 0);
    const passos: PassoDaOs[] = [
      { acao: 'gerar', quando: new Date(gerada) },
      { acao: 'iniciar', quando: new Date(iniciada) },
      { acao: 'concluir', quando: new Date(concluida) },
    ];
    for (let r = 0; r < (p.reaberturas ?? 0); r += 1) {
      const reaberta = concluida + entre(4, 20) * HORA_MS;
      concluida = reaberta + entre(2, 12) * HORA_MS;
      passos.push(
        {
          acao: 'reabrir',
          quando: new Date(reaberta),
          motivo: 'Voltou a falhar depois do reparo.',
        },
        { acao: 'concluir', quando: new Date(concluida) },
      );
    }
    passos.push({ acao: 'aceitar', quando: new Date(concluida + entre(2, 30) * HORA_MS) });
    const feitos = passos.filter((s) => s.quando.getTime() <= fimDoHistorico);
    const ultimo = feitos[feitos.length - 1];
    const estadoDaOs: EstadoDaOs = ultimo ? estadoAposPasso(ultimo.acao) : 'atribuida';
    chamados.push({
      hotel: p.hotel,
      local: p.local,
      ativo: p.ativo,
      abertoEm: p.abertoEm,
      impactoHospede: p.impactoHospede ?? null,
      descricao: p.descricao,
      estado: estadoDoChamado(feitos.length ? estadoDaOs : null),
      os: {
        codigoFalha: p.codigoFalha,
        executadoPor: p.executadoPor ?? 'equipe_interna',
        fornecedor: p.fornecedor ?? null,
        custo: estadoDaOs === 'aceita' ? (p.custo ?? null) : null,
        passos: feitos,
        estado: estadoDaOs,
      },
      parada: parada && parada.inicio.getTime() <= fimDoHistorico ? parada : null,
      cenario: p.cenario,
    });
  };

  // --- cenários ---------------------------------------------------------------
  const cenarios: CenarioDoRoteiro[] = [];
  const h = (n: number) => {
    const hotel = hoteis[n - 1];
    if (!hotel) throw new Error(`O volume não tem o hotel ${n}`);
    return hotel.chave;
  };
  const uh = (hotel: string, andar: number, n: number) =>
    `${hotel}-uh${andar}${String(n).padStart(2, '0')}`;

  // Atenção alta: a caldeira do hotel 2, crítica e fora da garantia, falha a
  // cada 11 dias, para o hotel, afeta hóspede e custa caro. A equipe assume.
  {
    const c = 'atencao-caldeira';
    const a = `${h(2)}-caldeira`;
    marcar(a, c, { modelo: 'TB-500', garantiaAte: anos(1) });
    for (let i = 0; i < 7; i += 1)
      chamado({
        hotel: h(2),
        local: `${h(2)}-maquinas`,
        ativo: a,
        cenario: c,
        abertoEm: em(85 - i * 11, 9 + i),
        codigoFalha: 'falha_queimador',
        descricao: 'Caldeira desligando; sem água quente nos andares.',
        impactoHospede: true,
        horasParadas: 10,
        custo: 1_900,
        reaberturas: i % 3 === 1 ? 1 : 0,
      });
    cenarios.push({
      chave: c,
      sinal: 'atencao',
      ativo: a,
      alvo: { tipo: 'atencao_ativo', ativo: a, hotel: h(2) },
      decisoes: [
        { aposDias: 1, acao: 'revisar' },
        { aposDias: 3, acao: 'aceitar' },
        { aposDias: 6, acao: 'agir' },
      ],
      estadoFinal: 'em_acao',
    });
  }

  // Atenção alta resolvida, com a efetividade: o elevador social do hotel 5
  // falha no começo do histórico; depois da modernização, quase não volta.
  {
    const c = 'atencao-elevador';
    const a = `${h(5)}-elevador1`;
    marcar(a, c, { garantiaAte: anos(3) });
    for (let i = 0; i < 6; i += 1)
      chamado({
        hotel: h(5),
        local: `${h(5)}-hall`,
        ativo: a,
        cenario: c,
        abertoEm: em(175 - i * 11, 12 + i),
        codigoFalha: 'porta_elevador',
        descricao: 'Porta do elevador social não fecha.',
        impactoHospede: true,
        horasParadas: 12,
        custo: 2_500,
        reaberturas: i === 2 ? 1 : 0,
      });
    chamado({
      hotel: h(5),
      local: `${h(5)}-hall`,
      ativo: a,
      cenario: c,
      abertoEm: em(60, 15),
      codigoFalha: 'porta_elevador',
      descricao: 'Ajuste no sensor da porta do elevador social.',
      impactoHospede: false,
      custo: 300,
    });
    cenarios.push({
      chave: c,
      sinal: 'atencao',
      ativo: a,
      intervencaoEm: em(110, 13),
      alvo: { tipo: 'atencao_ativo', ativo: a, hotel: h(5) },
      decisoes: [
        { aposDias: 2, acao: 'aceitar' },
        { aposDias: 5, acao: 'agir' },
        { aposDias: 40, acao: 'monitorar' },
        { aposDias: 125, acao: 'resolver', nota: 'Elevador modernizado; falhas não voltaram.' },
      ],
      estadoFinal: 'resolvido',
    });
    cenarios.push({
      chave: 'efetividade-elevador',
      sinal: 'efetividade',
      ativo: a,
      intervencaoEm: em(110, 13),
      alvo: null,
      decisoes: [],
      estadoFinal: null,
    });
  }

  // Reincidência: o ar de uma UH do hotel 1 volta a falhar a cada duas
  // semanas, com reaberturas. A atenção fica abaixo do limite (criticidade
  // baixa, sem parada nem hóspede afetado): o sinal aparece na tela do ativo.
  {
    const c = 'reincidencia-ar';
    const a = `${uh(h(1), 1, 3)}-ar`;
    marcar(a, c);
    for (let i = 0; i < 6; i += 1)
      chamado({
        hotel: h(1),
        local: uh(h(1), 1, 3),
        ativo: a,
        cenario: c,
        abertoEm: em(80 - i * 14, 14),
        codigoFalha: 'desarme_compressor',
        descricao: 'Ar desarma depois de alguns minutos.',
        impactoHospede: false,
        custo: 250,
        reaberturas: i % 2,
      });
    cenarios.push({
      chave: c,
      sinal: 'reincidencia',
      ativo: a,
      alvo: null,
      decisoes: [],
      estadoFinal: null,
    });
  }

  // Sistêmico, mesmo modelo: o modelo do cenário, em duas UHs de cada hotel
  // das duas bandeiras, não resfria, muito mais que os outros modelos.
  {
    const c = 'sistemico-modelo';
    const doModelo = hoteis.flatMap((x) => [
      `${uh(x.chave, 2, 1)}-ar`,
      `${uh(x.chave, volume.andares, 2)}-ar`,
    ]);
    for (const a of doModelo)
      marcar(a, c, { ...MODELO_DO_CENARIO, dataCompra: anos(1), garantiaAte: anos(-1) });
    for (let i = 0; i < 30; i += 1) {
      const a = doModelo[i % doModelo.length] as string;
      const dono = ativoPorChave.get(a) as AtivoDoRoteiro;
      chamado({
        hotel: dono.hotel,
        local: dono.local,
        ativo: a,
        cenario: c,
        abertoEm: em(100 - Math.floor((i * 99) / 30), 10 + (i % 8)),
        codigoFalha: 'ar_sem_resfriar',
        descricao: 'Ar ligado, mas não resfria o quarto.',
        impactoHospede: i % 3 === 0,
        custo: 350,
      });
    }
    cenarios.push({
      chave: c,
      sinal: 'sistemico',
      alvo: {
        tipo: 'sistemico',
        regra: 'mesmo_modelo',
        hoteis: hoteis.map((x) => x.chave),
        escopo: { categoriaId: 'refrigeracao', modelo: 'polar|inverter 18000' },
      },
      decisoes: [
        { aposDias: 3, acao: 'revisar' },
        { aposDias: 7, acao: 'aceitar' },
      ],
      estadoFinal: 'aceito',
    });
  }

  // Sistêmico, mesmo fornecedor: as câmaras frias da bandeira 1 voltam a
  // falhar logo depois das OS do mesmo fornecedor.
  {
    const c = 'sistemico-fornecedor';
    const daBandeira = hoteis.filter((x) => x.bandeira === 'b1').map((x) => x.chave);
    for (const x of daBandeira) marcar(`${x}-camara`, c, { modelo: 'CF-30' });
    for (let i = 0; i < 8; i += 1) {
      const hotel = daBandeira[i % daBandeira.length] as string;
      const quando = 170 - i * 14;
      chamado({
        hotel,
        local: `${hotel}-cozinha`,
        ativo: `${hotel}-camara`,
        cenario: c,
        abertoEm: em(quando, 11),
        codigoFalha: 'temperatura_fora',
        descricao: 'Câmara fria acima da temperatura.',
        executadoPor: 'fornecedor',
        fornecedor: 'f-frio',
        custo: 1_200,
        impactoHospede: false,
      });
      if (i % 2 === 0)
        chamado({
          hotel,
          local: `${hotel}-cozinha`,
          ativo: `${hotel}-camara`,
          cenario: c,
          abertoEm: em(quando - 9, 16),
          codigoFalha: 'temperatura_fora',
          descricao: 'Câmara fria voltou a esquentar.',
          custo: 400,
          impactoHospede: false,
        });
    }
    cenarios.push({
      chave: c,
      sinal: 'sistemico',
      alvo: {
        tipo: 'sistemico',
        regra: 'mesmo_fornecedor',
        hoteis: daBandeira,
        escopo: { fornecedorId: 'f-frio' },
      },
      decisoes: [
        { aposDias: 2, acao: 'revisar' },
        { aposDias: 4, acao: 'aceitar' },
        { aposDias: 9, acao: 'agir' },
      ],
      estadoFinal: 'em_acao',
    });
  }

  // Sistêmico, mesmo andar: infiltração em cinco UHs do terceiro andar do hotel
  // 3 em uma semana. Tratado e resolvido. As rajadas dos cenários têm no máximo
  // cinco chamados do mesmo código: com seis, a rajada que atravessa a borda da
  // janela do crescimento (30 dias) abriria também o crescimento.
  {
    const c = 'sistemico-andar';
    const andar = Math.min(3, volume.andares);
    for (let i = 0; i < 5; i += 1)
      chamado({
        hotel: h(3),
        local: uh(h(3), andar, i + 1),
        ativo: null,
        cenario: c,
        abertoEm: em(70 - i, 10 + i),
        codigoFalha: 'infiltracao',
        descricao: 'Mancha de umidade no teto.',
        impactoHospede: i % 2 === 0,
        custo: 150,
      });
    cenarios.push({
      chave: c,
      sinal: 'sistemico',
      alvo: {
        tipo: 'sistemico',
        regra: 'mesmo_andar',
        hoteis: [h(3)],
        escopo: { andar: String(andar), falha: 'infiltracao' },
      },
      decisoes: [
        { aposDias: 1, acao: 'aceitar' },
        { aposDias: 2, acao: 'agir' },
        { aposDias: 12, acao: 'monitorar' },
        { aposDias: 30, acao: 'resolver', nota: 'Impermeabilização da laje refeita.' },
      ],
      estadoFinal: 'resolvido',
    });
  }

  // Sistêmico, mesma área comum, descartado: exaustão fraca na cozinha do
  // hotel 4. O gerente descarta como não relevante.
  {
    const c = 'sistemico-area-descartado';
    for (let i = 0; i < 5; i += 1)
      chamado({
        hotel: h(4),
        local: `${h(4)}-cozinha`,
        ativo: null,
        cenario: c,
        abertoEm: em(150 - i * 4, 9 + i),
        codigoFalha: 'exaustao',
        descricao: 'Coifa da cozinha puxando pouco.',
        impactoHospede: false,
        custo: 180,
      });
    cenarios.push({
      chave: c,
      sinal: 'sistemico',
      alvo: {
        tipo: 'sistemico',
        regra: 'mesma_area_comum',
        hoteis: [h(4)],
        escopo: { localId: `${h(4)}-cozinha`, falha: 'exaustao' },
      },
      decisoes: [
        {
          aposDias: 2,
          acao: 'descartar',
          motivoDeDescarte: 'nao_relevante',
          nota: 'Limpeza dos filtros já programada; não é falha do equipamento.',
        },
      ],
      estadoFinal: 'descartado',
    });
  }

  // Sistêmico, mesma área comum, novo: quedas de disjuntor na lavanderia do
  // hotel 6 nas últimas semanas, ainda sem decisão.
  {
    const c = 'sistemico-area-novo';
    for (let i = 0; i < 5; i += 1)
      chamado({
        hotel: h(6),
        local: `${h(6)}-lavanderia`,
        ativo: null,
        cenario: c,
        abertoEm: em(20 - i * 4, 8 + i),
        codigoFalha: 'queda_disjuntor',
        descricao: 'Disjuntor da lavanderia desarmou.',
        impactoHospede: false,
        custo: 120,
      });
    cenarios.push({
      chave: c,
      sinal: 'sistemico',
      alvo: {
        tipo: 'sistemico',
        regra: 'mesma_area_comum',
        hoteis: [h(6)],
        escopo: { localId: `${h(6)}-lavanderia`, falha: 'queda_disjuntor' },
      },
      decisoes: [],
      estadoFinal: 'novo',
    });
  }

  // Sistêmico, crescimento: o entupimento do hotel 4 dobra no último mês,
  // espalhado pelos andares. Em revisão.
  {
    const c = 'sistemico-crescimento';
    for (let i = 0; i < 9; i += 1)
      chamado({
        hotel: h(4),
        local: uh(h(4), (i % volume.andares) + 1, (i % volume.uhsPorAndar) + 1),
        ativo: null,
        cenario: c,
        abertoEm: em(28 - i * 3, 13),
        codigoFalha: 'entupimento',
        descricao: 'Ralo do banheiro entupido.',
        impactoHospede: true,
        custo: 90,
      });
    cenarios.push({
      chave: c,
      sinal: 'sistemico',
      alvo: {
        tipo: 'sistemico',
        regra: 'crescimento_categoria',
        hoteis: [h(4)],
        escopo: { falha: 'entupimento' },
      },
      decisoes: [{ aposDias: 1, acao: 'revisar' }],
      estadoFinal: 'em_revisao',
    });
  }

  // Substituição: a lava-roupa do hotel 6, com 12 anos, falha todo mês e para
  // a lavanderia. O sinal fica na tela do ativo (avaliar substituição).
  {
    const c = 'substituicao-lavadora';
    const a = `${h(6)}-lavadora`;
    marcar(a, c, { modelo: 'LX-40', dataCompra: anos(12), garantiaAte: anos(10) });
    for (let i = 0; i < 7; i += 1)
      chamado({
        hotel: h(6),
        local: `${h(6)}-lavanderia`,
        ativo: a,
        cenario: c,
        abertoEm: em(170 - i * 26, 10),
        codigoFalha: 'rolamento',
        descricao: 'Lava-roupa com barulho forte na centrifugação.',
        impactoHospede: false,
        horasParadas: 7,
        custo: 600,
      });
    cenarios.push({
      chave: c,
      sinal: 'substituicao',
      ativo: a,
      alvo: null,
      decisoes: [],
      estadoFinal: null,
    });
  }

  // --- ruído --------------------------------------------------------------------
  // Regular de propósito: o número de chamados de cada dia segue a média (a
  // fração acumula de um dia para o outro), e os códigos giram em ordem por
  // hotel. Assim, nenhum código cresce nem se junta num andar ou numa área
  // comum por acaso. O sorteio escolhe o local, a ordem do rodízio dos ativos, a hora e o custo.
  const locaisDoHotel = new Map(
    hoteis.map((x) => [x.chave, locais.filter((l) => l.hotel === x.chave)]),
  );
  const embaralhar = <T>(xs: readonly T[]): T[] => {
    const ys = [...xs];
    for (let i = ys.length - 1; i > 0; i -= 1) {
      const j = Math.floor(sortear() * (i + 1));
      [ys[i], ys[j]] = [ys[j] as T, ys[i] as T];
    }
    return ys;
  };
  const intercalar = (xs: readonly AtivoDoRoteiro[]): AtivoDoRoteiro[] => {
    const porModelo = new Map<string, AtivoDoRoteiro[]>();
    for (const a of xs) {
      const k = `${a.categoria}|${a.fabricante}|${a.modelo}`;
      porModelo.set(k, [...(porModelo.get(k) ?? []), a]);
    }
    const grupos = [...porModelo.keys()].sort().map((k) => embaralhar(porModelo.get(k) ?? []));
    const maior = Math.max(0, ...grupos.map((g) => g.length));
    return Array.from({ length: maior }, (_, i) =>
      grupos.flatMap((g) => (g[i] ? [g[i]] : [])),
    ).flat();
  };
  const doRuido = new Map(
    hoteis.map((x) => [x.chave, ativos.filter((a) => a.hotel === x.chave && a.cenario === null)]),
  );
  const noDia = (media: number, dia: number, deslocamento: number) =>
    Math.floor((dia + 1) * media + deslocamento) - Math.floor(dia * media + deslocamento);
  hoteis.forEach((hotel, ih) => {
    const doHotel = locaisDoHotel.get(hotel.chave) as LocalDoRoteiro[];
    const seusAtivos = doRuido.get(hotel.chave) as AtivoDoRoteiro[];
    const daUh = seusAtivos.filter((a) => a.categoria === 'refrigeracao');
    const daArea = seusAtivos.filter((a) => a.categoria !== 'refrigeracao');
    // Os ativos de cada fluxo recebem o ruído em rodízio, com os modelos
    // intercalados (e embaralhados pela semente dentro de cada modelo): em
    // qualquer janela, todo modelo tem a mesma taxa por ativo, e o ruído
    // sozinho não abre o sinal do mesmo modelo.
    const fluxos = [
      {
        ativos: intercalar(daUh),
        media: (daUh.length * volume.corretivasPorAtivoPorAno) / 365,
        vez: 0,
      },
      {
        ativos: intercalar(daArea),
        media: (daArea.length * volume.corretivasPorAtivoDeAreaPorAno) / 365,
        vez: 0,
      },
    ];
    // Cada hotel começa o rodízio num ponto diferente: sem isso, os hotéis
    // andariam juntos e, na mesma janela, todos bateriam no mesmo modelo.
    for (const f of fluxos) f.vez = Math.floor((ih * f.ativos.length) / hoteis.length);
    const deslocamento = ih / hoteis.length;
    let giro = ih;
    const proximoCodigo = () => {
      giro += 1;
      return (CODIGOS_DO_RUIDO[giro % CODIGOS_DO_RUIDO.length] as CodigoDeFalhaDoRoteiro).chave;
    };
    const total = DIAS_DE_AQUECIMENTO + DIAS_DO_HISTORICO;
    for (let k = 0; k < total; k += 1) {
      const d = total - 1 - k;
      for (let i = noDia(volume.chamadosSemAtivoPorDia, k, deslocamento); i > 0; i -= 1) {
        const local = doHotel[Math.floor(sortear() * doHotel.length)] as LocalDoRoteiro;
        const fornecedor = sortear() < 0.2;
        chamado({
          hotel: hotel.chave,
          local: local.chave,
          ativo: null,
          cenario: null,
          abertoEm: em(d, entre(11, 23)),
          codigoFalha: proximoCodigo(),
          descricao: 'Chamado de rotina.',
          impactoHospede: impactoDoRuido(sortear()),
          executadoPor: fornecedor ? 'fornecedor' : 'equipe_interna',
          fornecedor: fornecedor ? 'f-servicos' : null,
          custo: sortear() < 0.7 ? Math.round(entre(60, 600)) : null,
        });
      }
      for (const f of fluxos)
        for (let i = noDia(f.media, k, deslocamento); i > 0; i -= 1) {
          const a = f.ativos[f.vez++ % f.ativos.length] as AtivoDoRoteiro;
          chamado({
            hotel: a.hotel,
            local: a.local,
            ativo: a.chave,
            cenario: null,
            abertoEm: em(d, entre(11, 23)),
            codigoFalha: proximoCodigo(),
            descricao: `Manutenção corretiva: ${a.nome}.`,
            impactoHospede: impactoDoRuido(sortear()),
            custo: sortear() < 0.7 ? Math.round(entre(80, 900)) : null,
          });
        }
    }
  });

  const ordenados = chamados
    .map((c, i) => ({ c, i }))
    .sort((x, y) => x.c.abertoEm.getTime() - y.c.abertoEm.getTime() || x.i - y.i)
    .map(({ c }, i) => ({ chave: `ch${String(i + 1).padStart(5, '0')}`, ...c }));

  return {
    semente,
    inicio,
    inicioDosChamados,
    dias,
    volume,
    bandeiras,
    hoteis,
    locais,
    ativos,
    fornecedores,
    codigosDeFalha: [...CODIGOS_DO_RUIDO, ...CODIGOS_DOS_CENARIOS],
    chamados: ordenados,
    cenarios,
    politicaSistemica: {
      mesmoModelo: { ...PADRAO_SISTEMICO.mesmoModelo, ativa: true },
      mesmoAndar: { ...PADRAO_SISTEMICO.mesmoAndar, ativa: true },
      mesmaAreaComum: { ...PADRAO_SISTEMICO.mesmaAreaComum, ativa: true },
      mesmoFornecedor: { ...PADRAO_SISTEMICO.mesmoFornecedor, ativa: true },
      crescimento: { ...PADRAO_SISTEMICO.crescimento, ativa: true },
    },
  };
}

/** O estado da OS depois da ação, pelas transições do domínio. */
export function estadoAposPasso(acao: AcaoDaOs): EstadoDaOs {
  const para = TRANSICOES_DA_OS[acao].para;
  if (para === 'nova') throw new Error(`A ação ${acao} não leva a um estado da OS gravada`);
  return para;
}

/** No ruído: 10% afeta hóspede, 60% não afeta, 30% sem a marca. */
function impactoDoRuido(x: number): boolean | null {
  if (x < 0.1) return true;
  return x < 0.7 ? false : null;
}

/** O estado do chamado pelo estado da OS (TRANSICOES_DA_OS); sem passo, aberto. */
function estadoDoChamado(os: EstadoDaOs | null): EstadoDoChamado {
  switch (os) {
    case null:
      return 'aberto';
    case 'concluida':
      return 'aguardando_aceite';
    case 'aceita':
      return 'concluido';
    case 'cancelada':
      return 'em_triagem';
    default:
      return 'em_execucao';
  }
}

// --- decisões -------------------------------------------------------------------

/**
 * O insight visto pelo roteiro: o tipo, a regra, os hotéis e o escopo, com os
 * ids já trocados pelas chaves do roteiro (no banco, quem grava guarda a troca).
 */
export interface InsightNoRoteiro {
  tipo: 'atencao_ativo' | 'sistemico';
  regra?: RegraSistemica;
  hoteis: readonly string[];
  escopo: Readonly<Record<string, string>>;
}

const mesmosHoteis = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** O cenário de um insight aberto pelo job; undefined quando nenhum cenário o planta. */
export function cenarioDoInsight(
  r: RoteiroDoHistorico,
  i: InsightNoRoteiro,
): CenarioDoRoteiro | undefined {
  return r.cenarios.find((c) => {
    const a = c.alvo;
    if (!a || a.tipo !== i.tipo) return false;
    if (a.tipo === 'atencao_ativo') return a.ativo === i.escopo['ativoId'];
    return (
      a.regra === i.regra &&
      mesmosHoteis(a.hoteis, i.hoteis) &&
      Object.entries(a.escopo).every(([k, v]) => i.escopo[k] === v)
    );
  });
}

/** As decisões do cenário que vencem no dia, para o insight aberto em `abertoNoDia`. */
export function decisoesDoDia(
  r: RoteiroDoHistorico,
  cenario: CenarioDoRoteiro,
  abertoNoDia: string,
  dia: string,
): readonly DecisaoDoRoteiro[] {
  const a = r.dias.indexOf(abertoNoDia);
  const d = r.dias.indexOf(dia);
  if (a < 0 || d < 0) throw new Error(`Dia fora do histórico: ${a < 0 ? abertoNoDia : dia}`);
  return cenario.decisoes.filter((x) => x.aposDias === d - a);
}
