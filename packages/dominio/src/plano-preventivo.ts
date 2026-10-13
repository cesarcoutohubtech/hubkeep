// Planos preventivos (fase 1b, PV2; ADR-041, aprovado pelo Cesar em
// 12/10/2026 com as decisões 6 a 8 de
// docs/referencia/propostas-desenho-pv-implantacao.md).
//
// O plano é do hotel e tem um alvo, o ativo ou a categoria. A periodicidade
// é por tempo, em dias, semanas ou meses (decisão 7), num calendário fixo
// ancorado no início (decisão 6). As colunas app.plano_preventivo.unidade e
// .situacao têm checks com os mesmos valores destas listas (migração 0045,
// tests/valores-canonicos-banco.test.ts): valor novo exige migração que
// amplia o check.

/** A unidade da periodicidade (decisão 7: por uso fica para depois do MVP). */
export const UNIDADES_DE_PERIODICIDADE = ['dia', 'semana', 'mes'] as const;
export type UnidadeDePeriodicidade = (typeof UNIDADES_DE_PERIODICIDADE)[number];

export const ehUnidadeDePeriodicidade = (v: unknown): v is UnidadeDePeriodicidade =>
  typeof v === 'string' && (UNIDADES_DE_PERIODICIDADE as readonly string[]).includes(v);

/** A situação do plano: só o ativo gera OS; encerrar é a desativação lógica e não volta. */
export const SITUACOES_DO_PLANO = ['ativo', 'pausado', 'encerrado'] as const;
export type SituacaoDoPlano = (typeof SITUACOES_DO_PLANO)[number];

export const ehSituacaoDoPlano = (v: unknown): v is SituacaoDoPlano =>
  typeof v === 'string' && (SITUACOES_DO_PLANO as readonly string[]).includes(v);
