// Nome do local no PWA: com a edificação, quando preenchida ("UH 101 · Torre
// A"), para distinguir a UH 101 de duas torres (I2; decisão 6 do Cesar de
// 09/10/2026). A junção sai do catálogo, como todo texto de tela.
import type { useT } from './i18n';

export function nomeDoLocal(
  t: ReturnType<typeof useT>,
  local: { nome: string; edificacao?: string | null | undefined },
): string {
  return local.edificacao
    ? t('tecnico.local.nome_com_edificacao', { nome: local.nome, edificacao: local.edificacao })
    : local.nome;
}
