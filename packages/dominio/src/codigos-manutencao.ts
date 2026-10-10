// Códigos de falha, causa e solução (fase 1b, I6). Por enquanto, só a lista
// dos tipos: o banco repete os valores num check (codigo_manutencao_tipo_lista,
// migração 0036), e o teste tests/valores-canonicos-banco.test.ts confere a
// paridade. As regras (o código da coluna certa, ativo e da categoria do
// ativo; a política os.codigos_obrigatorios cobrada no aceite, e nunca na
// conclusão do PWA) entram no PR seguinte, fora da zona protegida.

export const TIPOS_DE_CODIGO_DE_MANUTENCAO = ['falha', 'causa', 'solucao'] as const;
export type TipoDeCodigoDeManutencao = (typeof TIPOS_DE_CODIGO_DE_MANUTENCAO)[number];

export const ehTipoDeCodigoDeManutencao = (v: unknown): v is TipoDeCodigoDeManutencao =>
  typeof v === 'string' && (TIPOS_DE_CODIGO_DE_MANUTENCAO as readonly string[]).includes(v);
