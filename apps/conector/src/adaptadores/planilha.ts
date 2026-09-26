// Adaptador de planilha (CSV), a alternativa da fase 0 ao TOTVS (docs/00):
// hotéis e UHs vêm de arquivos exportados pelo cliente.
//
//   hotéis:  codigo, nome
//   UHs:     codigo, hotel (codigo do hotel), nome, andar (opcional)
import { readFile } from 'node:fs/promises';
import type {
  AdaptadorDeSistemaHoteleiro,
  EntidadeExterna,
  RegistroExterno,
} from '@hubkeep/contratos';
import { type LinhaCsv, lerCsv } from '../csv';

export interface ArquivosDaPlanilha {
  hotel?: string;
  uh?: string;
}

const porChave = (a: RegistroExterno, b: RegistroExterno) =>
  a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0;

function exigirColunas(linhas: LinhaCsv[], colunas: string[], arquivo: string): void {
  const primeira = linhas[0];
  if (!primeira) return;
  const faltando = colunas.filter((c) => !(c in primeira));
  if (faltando.length > 0) {
    throw new Error(`${arquivo}: faltam as colunas ${faltando.join(', ')}.`);
  }
}

/** Converte as linhas da planilha em registros do contrato, em ordem de chave. */
export function registrosDaPlanilha(
  entidade: EntidadeExterna,
  linhas: LinhaCsv[],
): RegistroExterno[] {
  const registros = linhas
    .filter((l) => (l['codigo'] ?? '') !== '')
    .map((l): RegistroExterno => {
      const chave = l['codigo'] ?? '';
      if (entidade === 'hotel') return { chave, dados: { nome: l['nome'] ?? '' } };
      const andar = l['andar'] ?? '';
      return {
        chave,
        dados: { hotel: l['hotel'] ?? '', nome: l['nome'] ?? '', ...(andar && { andar }) },
      };
    });
  return registros.sort(porChave);
}

export function criarAdaptadorDePlanilha(
  arquivos: ArquivosDaPlanilha,
): AdaptadorDeSistemaHoteleiro {
  return {
    fonte: 'planilha',
    async ler(entidade) {
      const arquivo = arquivos[entidade];
      if (!arquivo) return [];
      const linhas = lerCsv(await readFile(arquivo, 'utf8'));
      exigirColunas(
        linhas,
        entidade === 'hotel' ? ['codigo', 'nome'] : ['codigo', 'hotel', 'nome'],
        arquivo,
      );
      return registrosDaPlanilha(entidade, linhas);
    },
  };
}
