// VITRINE DESCARTÁVEL (proposta das telas do Intelligence 1.0). Dados fictícios;
// os scores e os motivos saem do motor de verdade (packages/inteligencia).
import { criarTradutor } from '@hubkeep/i18n';
import {
  type Corretiva,
  type Score,
  atencaoDoAtivo,
  explicacaoDoScore,
  faixaDe,
  FAIXAS_PADRAO,
  reincidencia,
} from '@hubkeep/inteligencia';

export const agora = new Date('2026-10-07T12:00:00Z');
const dia = (d: number) => new Date(agora.getTime() + d * 86_400_000);

export const t = criarTradutor('pt-BR').t;

export const NOMES_DE_HOTEL: Record<string, string> = {
  h1: 'Aurora Centro',
  h2: 'Aurora Praia',
  h3: 'Aurora Serra',
  h4: 'Slim Marina',
};

let seq = 0;
const corretiva = (p: Partial<Corretiva> & { abertaEm: Date }): Corretiva => {
  seq += 1;
  return {
    id: `c${seq}`,
    hotelId: 'h1',
    localId: 'l1',
    ativoId: 'a1',
    concluidaEm: null,
    reaberturas: 0,
    codigoFalha: null,
    ...p,
  };
};

/** O ativo da tela de detalhe: um chiller com seis corretivas em 30 dias. */
export const corretivasDoChiller: Corretiva[] = Array.from({ length: 6 }, (_, i) =>
  corretiva({
    abertaEm: dia(-1 - i * 5),
    concluidaEm: dia(-i * 5),
    reaberturas: i < 3 ? 1 : 0,
    codigoFalha: 'compressor',
    aposPreventiva: i % 2 === 0,
    impactoHospede: i < 4,
    custoInformado: [1850, 1200, 900, 300, 0, 0][i] ?? 0,
  }),
);

export const reincidenciaDoChiller: Score = reincidencia(corretivasDoChiller, agora);
export const atencaoDoChiller = atencaoDoAtivo({
  criticidade: 5,
  reincidencia: reincidenciaDoChiller,
  horasParadas: 30.5,
  custoInformado12m: 4250,
  impactoHospede: 66.7,
  preventivaOuCompliance: null,
});

export const motivosDaAtencao = explicacaoDoScore(atencaoDoChiller, 3).map((e) => ({
  ...e,
  texto: t(e.chave as never, e.valores),
}));
export const motivosDaReincidencia = explicacaoDoScore(reincidenciaDoChiller, 3).map((e) => ({
  ...e,
  texto: t(e.chave as never, e.valores),
}));

/** Os 90 dias da atenção do chiller, do mais antigo ao mais novo. */
export const serieDaAtencao: { dia: Date; valor: number }[] = Array.from({ length: 90 }, (_, i) => {
  const base = 24 + i * 0.52 + 5 * Math.sin(i / 4.2) + (i % 9 === 0 ? 4 : 0);
  // O último dia é o do cálculo de hoje, o mesmo valor do indicador.
  const valor = i === 89 ? (atencaoDoChiller.valor ?? 0) : Math.round(Math.min(96, Math.max(8, base)));
  return { dia: dia(-89 + i), valor };
});

export const faixaDoValor = (v: number) => faixaDe(v, FAIXAS_PADRAO);

export type EstadoDoInsight =
  | 'novo'
  | 'em_revisao'
  | 'aceito'
  | 'em_acao'
  | 'monitorando'
  | 'resolvido'
  | 'descartado';

export interface InsightDaLista {
  id: string;
  tipo: 'atencao_ativo' | 'sistemico';
  /** O que é: o ativo, ou a regra e o modelo. */
  assunto: string;
  detalhe: string;
  escopo: string;
  faixa: string;
  valor: number | null;
  estado: EstadoDoInsight;
  responsavel: string | null;
  ultimaDeteccao: string;
  substituidoPor?: string;
  anterior?: string;
}

export const insights: InsightDaLista[] = [
  {
    id: 'INS-0142',
    tipo: 'atencao_ativo',
    assunto: 'Chiller 02',
    detalhe: 'Casa de máquinas · Carrier 30XA',
    escopo: 'Aurora Centro',
    faixa: atencaoDoChiller.faixa,
    valor: atencaoDoChiller.valor,
    estado: 'novo',
    responsavel: null,
    ultimaDeteccao: 'hoje',
  },
  {
    id: 'INS-0141',
    tipo: 'sistemico',
    assunto: 'Mesmo modelo, mesma falha',
    detalhe: 'Acme X1 · ruído · 6 ativos',
    escopo: '3 hotéis da bandeira Aurora',
    faixa: 'atencao',
    valor: null,
    estado: 'novo',
    responsavel: null,
    ultimaDeteccao: 'hoje',
    anterior: 'INS-0133',
  },
  {
    id: 'INS-0139',
    tipo: 'atencao_ativo',
    assunto: 'Elevador social B',
    detalhe: 'Torre norte · Atlas E200',
    escopo: 'Aurora Praia',
    faixa: 'critico',
    valor: 88,
    estado: 'aceito',
    responsavel: 'Marina Souza',
    ultimaDeteccao: 'ontem',
  },
  {
    id: 'INS-0137',
    tipo: 'sistemico',
    assunto: 'Mesmo andar, mesma falha',
    detalhe: '3º andar · água fria · 8 UHs em 10 dias',
    escopo: 'Aurora Serra',
    faixa: 'atencao',
    valor: null,
    estado: 'em_acao',
    responsavel: 'Paulo Lemos',
    ultimaDeteccao: 'há 2 dias',
  },
  {
    id: 'INS-0133',
    tipo: 'sistemico',
    assunto: 'Mesmo modelo, mesma falha',
    detalhe: 'Acme X1 · ruído · 5 ativos',
    escopo: '2 hotéis da bandeira Aurora',
    faixa: 'atencao',
    valor: null,
    estado: 'em_revisao',
    responsavel: 'Marina Souza',
    ultimaDeteccao: 'há 6 dias',
    substituidoPor: 'INS-0141',
  },
  {
    id: 'INS-0129',
    tipo: 'sistemico',
    assunto: 'Mesmo fornecedor, falha que volta',
    detalhe: 'Refrigeração Silva · 50% de volta em 6 OS',
    escopo: 'Grupo (4 hotéis)',
    faixa: 'atencao',
    valor: null,
    estado: 'monitorando',
    responsavel: 'Paulo Lemos',
    ultimaDeteccao: 'há 9 dias',
  },
  {
    id: 'INS-0124',
    tipo: 'atencao_ativo',
    assunto: 'Bomba de recalque 1',
    detalhe: 'Piscina · KSB Megabloc',
    escopo: 'Slim Marina',
    faixa: 'alta_atencao',
    valor: 74,
    estado: 'descartado',
    responsavel: 'Marina Souza',
    ultimaDeteccao: 'há 12 dias',
  },
];

/** Os chamados que levaram ao insight sistêmico (só hotéis do escopo de quem lê). */
export const evidenciaDoSistemico = [
  { id: 'CH-2231', hotel: 'h1', ativo: 'Ar-condicionado UH 214', abertura: '2026-10-05', situacao: 'Em execução' },
  { id: 'CH-2219', hotel: 'h1', ativo: 'Ar-condicionado UH 322', abertura: '2026-09-29', situacao: 'Aguardando aceite' },
  { id: 'CH-2204', hotel: 'h2', ativo: 'Ar-condicionado UH 118', abertura: '2026-09-22', situacao: 'Concluído' },
  { id: 'CH-2188', hotel: 'h2', ativo: 'Ar-condicionado UH 407', abertura: '2026-09-15', situacao: 'Concluído' },
  { id: 'CH-2171', hotel: 'h3', ativo: 'Ar-condicionado UH 105', abertura: '2026-09-08', situacao: 'Concluído' },
  { id: 'CH-2150', hotel: 'h3', ativo: 'Ar-condicionado UH 211', abertura: '2026-09-01', situacao: 'Concluído' },
];

export const semanasDoSistemico = [0, 1, 0, 1, 1, 2, 1, 3, 2, 3, 4, 5];
