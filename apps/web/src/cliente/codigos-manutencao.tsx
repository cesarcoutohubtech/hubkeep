'use client';
// Códigos de falha, causa e solução nas telas do web (fase 1b, I6): a lista do
// tenant e o nome de cada código no idioma de quem lê (ADR-027): o nome do
// tenant no idioma, senão o do catálogo (codigo_manutencao.padrao.<chave>),
// senão o do idioma padrão do tenant.
import { CODIGOS_PADRAO } from '@hubkeep/dominio';
import { type Chave, type Idioma, resolverNome } from '@hubkeep/i18n';
import { useCallback, useEffect, useState } from 'react';
import { useIdioma, useT } from '../i18n/cliente';
import { type ErroDaApi, chamarApi } from './api';

export type TipoDeCodigo = 'falha' | 'causa' | 'solucao';
export const TIPOS_DE_CODIGO: readonly TipoDeCodigo[] = ['falha', 'causa', 'solucao'];

export interface CodigoNaTela {
  id: string;
  tipo: TipoDeCodigo;
  categoriaId: string | null;
  chavePadrao: string | null;
  nomes: Partial<Record<Idioma, string>>;
  ativa: boolean;
}

export interface CodigosDoTenant {
  idiomaPadrao: Idioma;
  codigos: CodigoNaTela[];
}

const CHAVES_DO_CATALOGO = new Set(CODIGOS_PADRAO.map((c) => c.chave));

/** O nome do código; o id, se nada resolver. */
export function useNomeDoCodigo(dados: CodigosDoTenant | null): (c: CodigoNaTela) => string {
  const t = useT();
  const { idioma } = useIdioma();
  return (c) =>
    resolverNome(c.nomes, idioma, {
      doCatalogo:
        c.chavePadrao && CHAVES_DO_CATALOGO.has(c.chavePadrao)
          ? t(`codigo_manutencao.padrao.${c.chavePadrao}` as Chave)
          : null,
      idiomaPadrao: dados?.idiomaPadrao ?? 'pt-BR',
    }) ?? c.id;
}

/** Os códigos do tenant; null enquanto carrega ou se a leitura falhar (a tela segue sem eles). */
export function useCodigosDoTenant(): {
  dados: CodigosDoTenant | null;
  recarregar: () => Promise<void>;
  erro: ErroDaApi | null;
} {
  const [dados, setDados] = useState<CodigosDoTenant | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const recarregar = useCallback(async () => {
    const r = await chamarApi<CodigosDoTenant>('/api/v1/codigos-de-manutencao');
    if (r.ok) {
      setDados(r.dados);
      setErro(null);
    } else setErro(r.erro);
  }, []);
  useEffect(() => {
    void recarregar();
  }, [recarregar]);
  return { dados, recarregar, erro };
}
