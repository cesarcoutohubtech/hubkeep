// O que a ligação do servidor monta, a partir das linhas do banco, para o job
// diário (ADR-036). Quem lê o banco entrega as linhas como estão; as regras de
// quais entram e de como as políticas resolvem ficam aqui, em código puro:
// - só os hotéis com status `ativo` entram no dia (Cesar, 10/10/2026; aguarda o
//   Kaio): o hotel em implantação ou desativado não gera métrica nem insight;
// - o chamado cancelado sem OS não é corretiva. Com mais de uma OS (a cancelada
//   e a que a substituiu), vale a que não foi cancelada; só com canceladas, a
//   mais recente (Cesar, 10/10/2026; aguarda o Kaio);
// - a leitura começa no instante mais antigo que alguma regra do dia olha
//   (`inicioDaLeitura`), pelas janelas das políticas resolvidas;
// - as políticas do hotel resolvem pelo registro do tenant (hotel → bandeira →
//   grupo → padrão, adendo ao ADR-026), e a versão da política gravada na
//   métrica identifica as linhas que resolveram (ADR-036).
import type {
  EstadoDaOs,
  EstadoDoChamado,
  ExecutadoPor,
  RegistroDePoliticas,
  StatusDeHotel,
} from '@hubkeep/dominio';
import type { ConfigAtencao } from './atencao';
import { type HotelDoDia, JANELA_CUSTO_DIAS, VERSAO_DE_POLITICA_PADRAO } from './dia';
import type { Corretiva, TransicaoDaOs } from './historico';
import { type ConfigReincidencia, PADRAO_REINCIDENCIA, diasAposPreventiva } from './reincidencia';
import { DIA_MS } from './score';
import type { ConfigSistemico } from './sistemico';

/** Uma OS do chamado, como o banco a guarda, com as transições (I5). */
export interface OsDaFonte {
  estado: EstadoDaOs;
  criadaEm: Date;
  codigoFalha: string | null;
  executadoPor: ExecutadoPor;
  fornecedorId: string | null;
  /** Em reais; null não informado. O driver devolve texto: quem lê converte. */
  custoInformado: number | null;
  transicoes: readonly TransicaoDaOs[];
}

/** Um chamado com as OS dele, como o banco os guarda. */
export interface ChamadoDaFonte {
  id: string;
  hotelId: string;
  localId: string;
  ativoId: string | null;
  abertaEm: Date;
  estado: EstadoDoChamado;
  impactoHospede: boolean | null;
  os: readonly OsDaFonte[];
}

/** A corretiva como o job a recebe: com as transições da OS, de onde saem a conclusão, as reaberturas e o aceite. */
export type CorretivaDaFonte = Omit<Corretiva, 'concluidaEm' | 'reaberturas' | 'aceitaEm'> & {
  transicoes: readonly TransicaoDaOs[];
};

/** A OS que conta para o chamado: a que não foi cancelada, ou a cancelada mais recente. */
export function osDoChamado<O extends OsDaFonte>(os: readonly O[]): O | undefined {
  const viva = os.find((o) => o.estado !== 'cancelada');
  if (viva) return viva;
  return [...os].sort((a, b) => b.criadaEm.getTime() - a.criadaEm.getTime())[0];
}

/**
 * Os chamados que contam como corretiva, cada um com a OS que vale. O chamado
 * cancelado fica fora, com ou sem OS (termo de base "corretiva" do glossário de
 * métricas, divergência b; até a versão 1 da reincidência e a 2 da atenção e do
 * sistêmico, o cancelado com OS entrava). O chamado ainda sem OS entra sem os
 * campos dela.
 */
export function corretivasDosChamados(chamados: readonly ChamadoDaFonte[]): CorretivaDaFonte[] {
  const corretivas: CorretivaDaFonte[] = [];
  for (const c of chamados) {
    if (c.estado === 'cancelado') continue;
    const os = osDoChamado(c.os);
    corretivas.push({
      id: c.id,
      hotelId: c.hotelId,
      localId: c.localId,
      ativoId: c.ativoId,
      abertaEm: c.abertaEm,
      impactoHospede: c.impactoHospede,
      codigoFalha: os?.codigoFalha ?? null,
      transicoes: os?.transicoes ?? [],
      ...(os
        ? {
            executadoPor: os.executadoPor,
            fornecedorId: os.fornecedorId,
            custoInformado: os.custoInformado,
          }
        : {}),
    });
  }
  return corretivas;
}

/**
 * O chamado mais antigo de cada hotel entre os lidos, com o cancelado: o
 * começo dos dados do hotel, para o crescimento (sistêmico v4). A leitura vai
 * sempre além das duas janelas do crescimento (`inicioDaLeitura`), então o
 * hotel com chamado antes delas aparece aqui com ele.
 */
export function primeiroChamadoPorHotel(chamados: readonly ChamadoDaFonte[]): Map<string, Date> {
  const primeiro = new Map<string, Date>();
  for (const c of chamados) {
    const antes = primeiro.get(c.hotelId);
    if (!antes || c.abertaEm.getTime() < antes.getTime()) primeiro.set(c.hotelId, c.abertaEm);
  }
  return primeiro;
}

/**
 * O instante mais antigo que alguma regra do dia olha: o custo informado (12
 * meses), a janela da reincidência de cada hotel, mais os dias da falha depois
 * de preventiva (a conclusão da preventiva vem antes da corretiva), e as do
 * sinal sistêmico (o crescimento compara a janela com a anterior; o mesmo
 * fornecedor olha a conclusão na janela). Quem lê o banco traz:
 * - os chamados abertos depois dele, ou com transição de OS depois dele (a OS
 *   aberta antes e concluída na janela conta no custo e no fornecedor);
 * - os ativos sem baixa antes dele, e as paradas que terminam depois dele.
 */
export function inicioDaLeitura(
  hoteis: readonly HotelDoDia[],
  sistemico: ConfigSistemico,
  agora: Date,
): Date {
  const dias = Math.max(
    JANELA_CUSTO_DIAS,
    ...hoteis.map((h) => {
      const r = h.reincidencia ?? PADRAO_REINCIDENCIA;
      return r.janelaDias + diasAposPreventiva(r);
    }),
    sistemico.mesmoModelo.janelaDias,
    sistemico.mesmoAndar.janelaDias,
    sistemico.mesmaAreaComum.janelaDias,
    sistemico.mesmoFornecedor.janelaDias,
    2 * sistemico.crescimento.janelaDias,
  );
  return new Date(agora.getTime() - dias * DIA_MS);
}

/** As chaves de política que o job lê. */
export const CHAVES_DO_JOB = [
  'inteligencia.reincidencia',
  'inteligencia.atencao_ativo',
  'inteligencia.sistemico',
] as const;

/** Uma linha ativa de `app.politica`, como o banco a guarda. */
export interface LinhaDePolitica {
  id: string;
  chave: string;
  escopo: 'grupo' | 'bandeira' | 'hotel';
  hotelId: string | null;
  bandeiraId: string | null;
  valor: unknown;
  atualizadoEm: Date;
}

/** Um hotel do tenant, como o banco o guarda. */
export interface HotelDaFonte {
  id: string;
  bandeiraId: string | null;
  status: StatusDeHotel;
  /** O fuso IANA do hotel (`app.hotel.fuso`), em que o dia da métrica é contado. */
  fuso: string;
}

type ChaveDoHotel = 'inteligencia.reincidencia' | 'inteligencia.atencao_ativo';
const CHAVES_DO_HOTEL: readonly ChaveDoHotel[] = [
  'inteligencia.reincidencia',
  'inteligencia.atencao_ativo',
];

/** As linhas de uma chave que valem para o hotel, na ordem da resolução: hotel, bandeira, grupo. */
export function niveisDoHotel(
  linhas: readonly LinhaDePolitica[],
  chave: string,
  hotel: Pick<HotelDaFonte, 'id' | 'bandeiraId'>,
): LinhaDePolitica[] {
  const daChave = linhas.filter((l) => l.chave === chave);
  return [
    daChave.find((l) => l.escopo === 'hotel' && l.hotelId === hotel.id),
    hotel.bandeiraId === null
      ? undefined
      : daChave.find((l) => l.escopo === 'bandeira' && l.bandeiraId === hotel.bandeiraId),
    daChave.find((l) => l.escopo === 'grupo'),
  ].filter((l): l is LinhaDePolitica => l !== undefined);
}

/**
 * Os hotéis do dia, com as políticas resolvidas pelo registro do tenant e a
 * versão da política: `chave=id@atualizado_em` de cada linha que resolveu,
 * separados por `;`, ou `padrao` quando valem só os padrões do código. A
 * linha com valor fora do formato não resolve e não entra na versão, como na
 * resolução do registro.
 */
export function hoteisDoDia(
  hoteis: readonly HotelDaFonte[],
  linhas: readonly LinhaDePolitica[],
  registro: RegistroDePoliticas,
): HotelDoDia[] {
  return hoteis
    .filter((h) => h.status === 'ativo')
    .map((h) => {
      const versoes: string[] = [];
      const valores = {} as { [C in ChaveDoHotel]: unknown };
      for (const chave of CHAVES_DO_HOTEL) {
        const niveis = niveisDoHotel(linhas, chave, h);
        valores[chave] = registro.resolver(chave, {
          hotel: niveis.find((l) => l.escopo === 'hotel')?.valor,
          bandeira: niveis.find((l) => l.escopo === 'bandeira')?.valor,
          grupo: niveis.find((l) => l.escopo === 'grupo')?.valor,
        });
        const venceu = niveis.find((l) => registro.valido(chave, l.valor));
        if (venceu) versoes.push(`${chave}=${venceu.id}@${venceu.atualizadoEm.toISOString()}`);
      }
      return {
        hotelId: h.id,
        bandeiraId: h.bandeiraId,
        fuso: h.fuso,
        reincidencia: valores['inteligencia.reincidencia'] as ConfigReincidencia,
        atencao: valores['inteligencia.atencao_ativo'] as ConfigAtencao,
        versaoPolitica: versoes.length ? versoes.join(';') : VERSAO_DE_POLITICA_PADRAO,
      };
    });
}

/** A política do sinal sistêmico: só a do grupo, porque o sinal cruza hotéis. */
export function politicaSistemicaDoGrupo(
  linhas: readonly LinhaDePolitica[],
  registro: RegistroDePoliticas,
): ConfigSistemico {
  const grupo = linhas.find((l) => l.chave === 'inteligencia.sistemico' && l.escopo === 'grupo');
  return registro.resolver('inteligencia.sistemico', { grupo: grupo?.valor }) as ConfigSistemico;
}
