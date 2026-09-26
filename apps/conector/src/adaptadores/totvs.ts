// Esqueleto do adaptador TOTVS CM (SQL Server). Somente leitura (CLAUDE.md,
// regra 8): só SELECT nas views acordadas com o cliente, com usuário que só lê.
//
// As views e as colunas ainda são da descoberta da fase 0 (docs/04); os nomes
// abaixo são o combinado provisório (vw_hubkeep_hoteis, docs/00). O driver do
// SQL Server entra junto com as views: aqui o acesso é uma porta
// (ExecutorSomenteLeitura), para o mapeamento já ter teste.
import type {
  AdaptadorDeSistemaHoteleiro,
  EntidadeExterna,
  RegistroExterno,
} from '@hubkeep/contratos';

/** Executa um SELECT e devolve as linhas. Nunca recebe outra instrução. */
export type ExecutorSomenteLeitura = (select: string) => Promise<Record<string, unknown>[]>;

export const CONSULTAS: Record<EntidadeExterna, string> = {
  hotel: 'SELECT codigo, nome FROM vw_hubkeep_hoteis ORDER BY codigo',
  uh: 'SELECT codigo, hotel, nome, andar FROM vw_hubkeep_uhs ORDER BY codigo',
};

const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

export function criarAdaptadorTotvs(executar: ExecutorSomenteLeitura): AdaptadorDeSistemaHoteleiro {
  return {
    fonte: 'totvs_cm',
    async ler(entidade) {
      const consulta = CONSULTAS[entidade];
      if (!/^\s*SELECT\s/i.test(consulta)) throw new Error('O adaptador do TOTVS só faz SELECT.');
      const linhas = await executar(consulta);
      return linhas
        .map((l): RegistroExterno => {
          const chave = texto(l['codigo']);
          if (entidade === 'hotel') return { chave, dados: { nome: texto(l['nome']) } };
          const andar = texto(l['andar']);
          return {
            chave,
            dados: { hotel: texto(l['hotel']), nome: texto(l['nome']), ...(andar && { andar }) },
          };
        })
        .filter((r) => r.chave !== '');
    },
  };
}

/** Até as views existirem: falha clara, em vez de conectar em algo não combinado. */
export const executorTotvsNaoConfigurado: ExecutorSomenteLeitura = async () => {
  throw new Error(
    'Adaptador TOTVS ainda sem driver: as views do CM são da descoberta da fase 0. Use CONECTOR_FONTE=planilha.',
  );
};
