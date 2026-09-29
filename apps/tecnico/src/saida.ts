// Saída do técnico (ADR-025, ajuste (b)): ao sair, os dados locais dele são
// apagados deste aparelho.
//   - fila de operações (IndexedDB), pendentes e recusadas, com as fotos da
//     OS que ainda não subiram (C4b);
//   - dados de referência (IndexedDB, B3b): hotéis, locais, categorias e ativos;
//   - fila do dia (IndexedDB, C4b): as OS do técnico e das equipes dele;
//   - tenant ativo (localStorage);
//   - sessão do Supabase (signOut, feito por quem chama).
// O service worker guarda só a casca do app, sem dado de ninguém. O idioma escolhido fica: é do aparelho, não da pessoa.
// As operações de outra pessoa que usou o aparelho não são tocadas: só a
// sessão dela as envia (ajuste (a)), e só a saída dela as apaga.
import type { FilaDeOperacoes } from './fila/banco';
import type { OsDoDiaDoAparelho } from './os/banco';
import type { ReferenciaDoAparelho } from './referencia/banco';

const CHAVES_DO_USUARIO_NO_ARMAZENAMENTO = ['hk_tenant'];

export async function apagarDadosLocais(
  fila: FilaDeOperacoes,
  usuarioId: string,
  armazenamento: Pick<Storage, 'removeItem'> | null = globalThis.localStorage ?? null,
  referencia: Pick<ReferenciaDoAparelho, 'apagarDoUsuario'> | null = null,
  osDoDia: Pick<OsDoDiaDoAparelho, 'apagarDoUsuario'> | null = null,
): Promise<void> {
  await fila.apagarDoUsuario(usuarioId);
  await referencia?.apagarDoUsuario(usuarioId);
  await osDoDia?.apagarDoUsuario(usuarioId);
  for (const chave of CHAVES_DO_USUARIO_NO_ARMAZENAMENTO) {
    try {
      armazenamento?.removeItem(chave);
    } catch {
      // Sem armazenamento (modo privado): não havia o que apagar.
    }
  }
}
