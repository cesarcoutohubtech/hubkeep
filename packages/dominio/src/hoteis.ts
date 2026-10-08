// Modelo contratual do hotel (fase 1b, I2; desenho aprovado pelo Cesar em
// 08/10/2026): como o grupo opera o hotel. Os valores canônicos moram aqui; o
// banco repete a lista num check (app.hotel.modelo_contratual, migração
// 0032), e o teste tests/modelo-contratual-banco.test.ts compara os dois.
//
//   - nulo quer dizer "não informado": os hotéis anteriores à I2 ficam nulos,
//     sem padrão (um padrão como "próprio" esconderia o erro), e o painel de
//     implantação mostra a pendência;
//   - quem grava é o Admin do grupo, na configuração do hotel (a mesma regra
//     da configuração, podeGerirPoliticas; a policy de UPDATE de app.hotel só
//     deixa o Admin). O conector nunca mexe na coluna;
//   - no MVP é só rótulo e filtro. O comportamento por modelo (a matriz do
//     arrendado) vem na 1c; o afiliado é aceito como valor, sem comportamento.
import { RegraViolada } from './erros';

export const MODELOS_CONTRATUAIS = ['proprio', 'administrado', 'arrendado', 'afiliado'] as const;
export type ModeloContratual = (typeof MODELOS_CONTRATUAIS)[number];

export const ehModeloContratual = (v: unknown): v is ModeloContratual =>
  typeof v === 'string' && (MODELOS_CONTRATUAIS as readonly string[]).includes(v);

/** Nulo vale ("não informado"); fora da lista: hotel_modelo_contratual_invalido. */
export function validarModeloContratual(v: unknown): ModeloContratual | null {
  if (v === null) return null;
  if (!ehModeloContratual(v)) {
    throw new RegraViolada('hotel_modelo_contratual_invalido', 'Modelo contratual inválido.', {
      valor: typeof v === 'string' ? v : String(v),
    });
  }
  return v;
}
