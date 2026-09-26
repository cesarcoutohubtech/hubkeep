// Idioma e região de quem usa (F0-10b, ADR-022).
//
//   ler      resolve idioma (membro → tenant → navegador → pt-BR), formato
//            regional (membro → o do idioma), fuso (membro → padrão) e moeda
//            (do tenant). O hotel entra quando a tela tiver um hotel em foco.
//   gravar   o membro grava as próprias. Idioma e formato regional vêm das
//            listas de @hubkeep/i18n; o fuso é validado aqui, e não no banco
//            (ADR-005). Nulo apaga a escolha e volta a herdar.
import { type Contexto, RegraViolada } from '@hubkeep/dominio';
import {
  type FormatoRegional,
  type Idioma,
  ehFormatoRegional,
  ehIdioma,
  fusoValido,
  resolverFormatoRegional,
  resolverFuso,
  resolverIdioma,
} from '@hubkeep/i18n';
import type { PortaPreferencias, PreferenciasGravadas } from '../portas/preferencias';

export interface PreferenciasResolvidas {
  idioma: Idioma;
  formatoRegional: FormatoRegional;
  fuso: string;
  moeda: string;
  /** O que o membro escolheu, para a tela de preferências mostrar o "herdado". */
  gravadas: { idioma: Idioma | null; formatoRegional: string | null; fuso: string | null };
}

export interface CasosDeUsoDePreferencias {
  /** `navegador`: Accept-Language, para quem ainda não escolheu nada. */
  lerPreferencias(ctx: Contexto, navegador?: string | null): Promise<PreferenciasResolvidas>;
  gravarPreferencias(ctx: Contexto, pedido: PreferenciasGravadas): Promise<void>;
}

const NENHUMA: PreferenciasGravadas = { idioma: null, formatoRegional: null, fuso: null };

export function validarPreferencias(p: PreferenciasGravadas): void {
  if (p.idioma !== null && !ehIdioma(p.idioma)) {
    throw new RegraViolada('idioma_nao_aceito', 'Idioma não disponível.', { idioma: p.idioma });
  }
  if (p.formatoRegional !== null && !ehFormatoRegional(p.formatoRegional)) {
    throw new RegraViolada('formato_regional_nao_aceito', 'Formato regional não disponível.', {
      formatoRegional: p.formatoRegional,
    });
  }
  if (p.fuso !== null && !fusoValido(p.fuso)) {
    throw new RegraViolada('fuso_invalido', 'Fuso horário inválido.', { fuso: p.fuso });
  }
}

export function criarCasosDeUsoDePreferencias(deps: {
  preferencias: PortaPreferencias;
}): CasosDeUsoDePreferencias {
  return {
    async lerPreferencias(ctx, navegador) {
      const { membro, tenant } = await deps.preferencias.ler(ctx);
      const gravadas = membro ?? NENHUMA;
      const idioma = resolverIdioma({
        membro: gravadas.idioma,
        tenant: tenant?.idiomaPadrao,
        navegador,
      });
      return {
        idioma,
        formatoRegional: resolverFormatoRegional(gravadas.formatoRegional, idioma),
        fuso: resolverFuso({ membro: gravadas.fuso }),
        moeda: tenant?.moeda ?? 'BRL',
        // O banco só aceita idioma da lista; o estreitamento é para o tipo.
        gravadas: { ...gravadas, idioma: ehIdioma(gravadas.idioma) ? gravadas.idioma : null },
      };
    },

    async gravarPreferencias(ctx, pedido) {
      validarPreferencias(pedido);
      await deps.preferencias.gravar(ctx, pedido);
    },
  };
}
