// Saída do técnico (ADR-025, ajuste (b)): ao sair, os dados locais dele são
// apagados deste aparelho.
//   - fila de operações (IndexedDB), pendentes e recusadas;
//   - tenant ativo (localStorage);
//   - sessão do Supabase (signOut, feito por quem chama).
// A fila do dia ainda não guarda nada no aparelho: as OS chegam na fase 1a, e
// o que for guardado delas entra aqui. O service worker guarda só a casca do
// app, sem dado de ninguém. O idioma escolhido fica: é do aparelho, não da pessoa.
// As operações de outra pessoa que usou o aparelho não são tocadas: só a
// sessão dela as envia (ajuste (a)), e só a saída dela as apaga.
import type { FilaDeOperacoes } from './fila/banco';

const CHAVES_DO_USUARIO_NO_ARMAZENAMENTO = ['hk_tenant'];

export async function apagarDadosLocais(
  fila: FilaDeOperacoes,
  usuarioId: string,
  armazenamento: Pick<Storage, 'removeItem'> | null = globalThis.localStorage ?? null,
): Promise<void> {
  await fila.apagarDoUsuario(usuarioId);
  for (const chave of CHAVES_DO_USUARIO_NO_ARMAZENAMENTO) {
    try {
      armazenamento?.removeItem(chave);
    } catch {
      // Sem armazenamento (modo privado): não havia o que apagar.
    }
  }
}
