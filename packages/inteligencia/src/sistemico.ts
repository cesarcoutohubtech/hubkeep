// Detecção de possível problema sistêmico (PRD, seção 15), por regras
// determinísticas: mesmo modelo, mesma área (andar das UHs ou a mesma área
// comum), mesmo fornecedor e crescimento da mesma falha. O resultado é sempre
// "possível": só uma pessoa confirma. A regra do feedback externo espera a 1.5.
// Agrupar por falha usa o código de falha da OS (`app.os.codigo_falha_id`, I6); sem ele,
// o agrupamento cai na categoria do ativo, e a corretiva sem nenhum dos dois
// fica de fora.
//
// Versão 2 (aprovada pelo Cesar em 08/10/2026, alinhada ao mock):
// - só a regra do mesmo modelo vem ligada por padrão; as outras quatro ficam
//   desligadas pela política (`ativa`), e o grupo liga as que quiser;
// - o mesmo modelo agrupa por categoria, fabricante e modelo (sem a falha) e
//   exige, na política, 3 hotéis, 6 chamados em 90 dias e 5 ativos com chamado;
// - além dos mínimos, a taxa do modelo (chamados por ativo instalado, em 90
//   dias) precisa ser de pelo menos o dobro da base, e nunca menos de 0,3. A
//   base é a taxa dos outros modelos da mesma categoria no tenant.
//
// Respostas de 10/10/2026 (Kaio e Cesar):
// - fabricante e modelo comparados sem maiúsculas, acentos e espaços extras
//   (`chaveDeModelo`); o ativo sem modelo fica fora da regra;
// - ativo instalado é o que esteve ativo em algum momento da janela: o
//   baixado (`desativadoEm`) antes do início não conta, nem no modelo nem na
//   base; o instalado no meio conta inteiro no 1.0;
// - sem outro modelo instalado na categoria, a regra não dispara: sem
//   comparação, não dá para atribuir o problema ao modelo (o mesmo princípio
//   do "sem base" da efetividade);
// - os 3 hotéis são hotéis distintos com pelo menos um chamado contado na
//   janela em ativos do modelo; ter o modelo instalado não basta.
//
// A versão continua a 2: nenhum sinal foi gravado ainda, e ela é a primeira
// que um sinal gravado vai levar.
import {
  type AtivoAnalisado,
  type Corretiva,
  type LocalAnalisado,
  chaveDeModelo,
  fornecedorDaOs,
} from './historico';
import { DIA_MS } from './score';

export const VERSAO_SISTEMICO = 2;

export interface ConfigSistemico {
  mesmoModelo: {
    ativa: boolean;
    /** Hotéis distintos com chamado do modelo na janela. */
    minHoteis: number;
    /** Chamados do modelo na janela. */
    minChamados: number;
    /** Ativos distintos do modelo com chamado na janela. */
    minAtivos: number;
    janelaDias: number;
    /** A taxa do modelo precisa ser de pelo menos esta vez a da base. */
    taxaMinimaVezesBase: number;
    /** Chamados por ativo na janela; a taxa nunca vale menos que isto. */
    taxaMinima: number;
  };
  mesmoAndar: { ativa: boolean; minLocais: number; janelaDias: number };
  mesmaAreaComum: { ativa: boolean; minOcorrencias: number; janelaDias: number };
  /**
   * Taxa de volta das OS de um fornecedor (pelo id do cadastro): corretiva nova no mesmo ativo até
   * `diasAposCorretiva` depois da conclusão. Só conta a OS cuja observação já
   * terminou, para a taxa não sair baixa só porque a conclusão é recente.
   */
  mesmoFornecedor: {
    ativa: boolean;
    janelaDias: number;
    diasAposCorretiva: number;
    minConcluidas: number;
    limiarPercentual: number;
  };
  crescimento: { ativa: boolean; percentual: number; minAtual: number; janelaDias: number };
}

export const PADRAO_SISTEMICO: ConfigSistemico = {
  mesmoModelo: {
    ativa: true,
    minHoteis: 3,
    minChamados: 6,
    minAtivos: 5,
    janelaDias: 90,
    taxaMinimaVezesBase: 2,
    taxaMinima: 0.3,
  },
  mesmoAndar: { ativa: false, minLocais: 5, janelaDias: 10 },
  mesmaAreaComum: { ativa: false, minOcorrencias: 5, janelaDias: 30 },
  mesmoFornecedor: {
    ativa: false,
    janelaDias: 180,
    diasAposCorretiva: 30,
    minConcluidas: 5,
    limiarPercentual: 30,
  },
  crescimento: { ativa: false, percentual: 50, minAtual: 5, janelaDias: 30 },
};

/**
 * Os mínimos só fazem sentido como inteiros de pelo menos 1, e a taxa e a
 * razão contra a base não podem ser negativas. Conferido ao gravar a política.
 */
export function configSistemicoValida(c: ConfigSistemico): boolean {
  const inteiro = (n: number) => Number.isInteger(n) && n >= 1;
  const m = c.mesmoModelo;
  return (
    inteiro(m.minHoteis) &&
    inteiro(m.minChamados) &&
    inteiro(m.minAtivos) &&
    inteiro(m.janelaDias) &&
    m.taxaMinimaVezesBase > 0 &&
    m.taxaMinima >= 0 &&
    inteiro(c.mesmoAndar.minLocais) &&
    inteiro(c.mesmoAndar.janelaDias) &&
    inteiro(c.mesmaAreaComum.minOcorrencias) &&
    inteiro(c.mesmaAreaComum.janelaDias) &&
    inteiro(c.mesmoFornecedor.janelaDias) &&
    inteiro(c.mesmoFornecedor.minConcluidas) &&
    inteiro(c.crescimento.minAtual) &&
    inteiro(c.crescimento.janelaDias)
  );
}

export type RegraSistemica =
  | 'mesmo_modelo'
  | 'mesmo_andar'
  | 'mesma_area_comum'
  | 'mesmo_fornecedor'
  | 'crescimento_categoria';

export interface SinalSistemico {
  regra: RegraSistemica;
  /** Sempre 'possivel': confirmação é humana (PRD, seção 15). */
  situacao: 'possivel';
  versao: number;
  /** O que agrupa: falha, modelo, hotel, andar, local ou fornecedor. */
  chave: Readonly<Record<string, string>>;
  evidencia: {
    quantidade: number;
    distintos: number;
    janelaDias: number;
    hotelIds: readonly string[];
    corretivaIds: readonly string[];
    anterior?: number;
    variacaoPercentual?: number;
    /** Mesmo modelo: os ativos instalados do modelo, a taxa dele e a da base (chamados por ativo na janela). */
    ativosDoModelo?: number;
    taxaPorAtivo?: number;
    basePorAtivo?: number;
    /** Mesmo fornecedor: OS concluídas com volta, a taxa e a da equipe interna. */
    voltas?: number;
    taxaPercentual?: number;
    taxaInternaPercentual?: number | null;
  };
}

export interface EntradaSistemico {
  corretivas: readonly Corretiva[];
  ativos: readonly AtivoAnalisado[];
  locais: readonly LocalAnalisado[];
}

const unicos = (xs: readonly string[]) => [...new Set(xs)].sort();
const percentual = (parte: number, todo: number) => Math.round((parte / todo) * 1000) / 10;

function agrupar<T>(xs: readonly T[], chave: (x: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = chave(x);
    if (k === null) continue;
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
}

export function detectarSistemicos(
  e: EntradaSistemico,
  agora: Date,
  config: ConfigSistemico = PADRAO_SISTEMICO,
): SinalSistemico[] {
  const ativos = new Map(e.ativos.map((a) => [a.id, a]));
  const locais = new Map(e.locais.map((l) => [l.id, l]));
  const falhaDe = (c: Corretiva): string | null =>
    c.codigoFalha ?? (c.ativoId ? (ativos.get(c.ativoId)?.categoriaId ?? null) : null);
  const naJanela =
    (dias: number, deslocamento = 0) =>
    (c: Corretiva) => {
      const fim = agora.getTime() - deslocamento * DIA_MS;
      return c.abertaEm.getTime() > fim - dias * DIA_MS && c.abertaEm.getTime() <= fim;
    };
  const sinais: SinalSistemico[] = [];

  // Mesmo modelo (categoria, fabricante e modelo) em hotéis diferentes: os
  // mínimos da política e a taxa de chamados por ativo contra a da base. Só
  // entra o ativo com categoria, fabricante e modelo; sem os três, não se sabe
  // se é o mesmo modelo, e ele fica de fora da conta toda, inclusive da base.
  // O ativo baixado antes do início da janela também fica de fora, com os
  // chamados dele.
  const mm = config.mesmoModelo;
  const inicioDoModelo = agora.getTime() - mm.janelaDias * DIA_MS;
  const naJanelaDoAtivo = (a: AtivoAnalisado): boolean =>
    !a.desativadoEm || a.desativadoEm.getTime() > inicioDoModelo;
  const ativosDoModelo = new Map(e.ativos.filter(naJanelaDoAtivo).map((a) => [a.id, a]));
  const grupoDoAtivo = (a: AtivoAnalisado | undefined): string | null => {
    const modelo = a ? chaveDeModelo(a) : null;
    return a?.categoriaId && modelo ? JSON.stringify([a.categoriaId, modelo]) : null;
  };
  if (mm.ativa) {
    const instalados = agrupar([...ativosDoModelo.values()], grupoDoAtivo);
    const naBaseDaCategoria = new Map<string, { ativos: number; chamados: number }>();
    const naJanelaDoModelo = e.corretivas.filter(naJanela(mm.janelaDias));
    for (const [k, doGrupo] of instalados) {
      const [categoriaId] = JSON.parse(k) as [string, string];
      const acc = naBaseDaCategoria.get(categoriaId) ?? { ativos: 0, chamados: 0 };
      naBaseDaCategoria.set(categoriaId, {
        ativos: acc.ativos + doGrupo.length,
        chamados: acc.chamados,
      });
    }
    const porModelo = agrupar(naJanelaDoModelo, (c) =>
      grupoDoAtivo(c.ativoId ? ativosDoModelo.get(c.ativoId) : undefined),
    );
    for (const [k, cs] of porModelo) {
      const [categoriaId] = JSON.parse(k) as [string, string];
      const acc = naBaseDaCategoria.get(categoriaId) as { ativos: number; chamados: number };
      naBaseDaCategoria.set(categoriaId, { ...acc, chamados: acc.chamados + cs.length });
    }
    for (const [k, cs] of porModelo) {
      const [categoriaId, modelo] = JSON.parse(k) as [string, string];
      const distintos = unicos(cs.map((c) => c.ativoId as string)).length;
      const hotelIds = unicos(cs.map((c) => c.hotelId));
      if (hotelIds.length < mm.minHoteis || cs.length < mm.minChamados || distintos < mm.minAtivos)
        continue;
      const doModelo = (instalados.get(k) ?? []).length;
      const categoria = naBaseDaCategoria.get(categoriaId) as { ativos: number; chamados: number };
      const taxa = cs.length / Math.max(doModelo, distintos);
      const ativosDaBase = categoria.ativos - doModelo;
      // Sem outro modelo instalado na categoria, não há com o que comparar.
      if (ativosDaBase <= 0) continue;
      const base = (categoria.chamados - cs.length) / ativosDaBase;
      if (taxa < Math.max(mm.taxaMinima, mm.taxaMinimaVezesBase * base)) continue;
      sinais.push({
        regra: 'mesmo_modelo',
        situacao: 'possivel',
        versao: VERSAO_SISTEMICO,
        chave: { categoriaId, modelo },
        evidencia: {
          quantidade: cs.length,
          distintos,
          janelaDias: mm.janelaDias,
          hotelIds,
          corretivaIds: cs.map((c) => c.id),
          ativosDoModelo: Math.max(doModelo, distintos),
          taxaPorAtivo: Math.round(taxa * 100) / 100,
          basePorAtivo: Math.round(base * 100) / 100,
        },
      });
    }
  }

  // Mesmo andar do mesmo hotel, mesma falha, locais distintos.
  const ma = config.mesmoAndar;
  const porAndar = agrupar(ma.ativa ? e.corretivas.filter(naJanela(ma.janelaDias)) : [], (c) => {
    const andar = locais.get(c.localId)?.andar?.trim();
    const falha = falhaDe(c);
    return andar && falha ? `${c.hotelId}#${andar}#${falha}` : null;
  });
  for (const [k, cs] of porAndar) {
    const distintos = unicos(cs.map((c) => c.localId)).length;
    if (distintos < ma.minLocais) continue;
    const [hotelId, andar, falha] = k.split('#') as [string, string, string];
    sinais.push({
      regra: 'mesmo_andar',
      situacao: 'possivel',
      versao: VERSAO_SISTEMICO,
      chave: { hotelId, andar, falha },
      evidencia: {
        quantidade: cs.length,
        distintos,
        janelaDias: ma.janelaDias,
        hotelIds: [hotelId],
        corretivaIds: cs.map((c) => c.id),
      },
    });
  }

  // A mesma área comum (cozinha, lavanderia, piscina): várias ocorrências da
  // mesma falha no mesmo local, mesmo que em ativos diferentes ou sem ativo.
  const ac = config.mesmaAreaComum;
  const porArea = agrupar(ac.ativa ? e.corretivas.filter(naJanela(ac.janelaDias)) : [], (c) => {
    const falha = falhaDe(c);
    return locais.get(c.localId)?.tipo === 'area_comum' && falha ? `${c.localId}#${falha}` : null;
  });
  for (const [k, cs] of porArea) {
    if (cs.length < ac.minOcorrencias) continue;
    const [localId, falha] = k.split('#') as [string, string];
    const hotelId = (cs[0] as Corretiva).hotelId;
    sinais.push({
      regra: 'mesma_area_comum',
      situacao: 'possivel',
      versao: VERSAO_SISTEMICO,
      chave: { hotelId, localId, falha },
      evidencia: {
        quantidade: cs.length,
        distintos: unicos(cs.flatMap((c) => (c.ativoId ? [c.ativoId] : []))).length,
        janelaDias: ac.janelaDias,
        hotelIds: [hotelId],
        corretivaIds: cs.map((c) => c.id),
      },
    });
  }

  // Mesmo fornecedor: a taxa de volta das OS do fornecedor passa do limiar.
  const mf = config.mesmoFornecedor;
  const observadas = (mf.ativa ? e.corretivas : []).filter(
    (c) =>
      c.ativoId !== null &&
      c.concluidaEm !== null &&
      c.concluidaEm.getTime() > agora.getTime() - mf.janelaDias * DIA_MS &&
      c.concluidaEm.getTime() <= agora.getTime() - mf.diasAposCorretiva * DIA_MS,
  );
  const voltou = (c: Corretiva) =>
    e.corretivas.some(
      (d) =>
        d.id !== c.id &&
        d.ativoId === c.ativoId &&
        d.abertaEm.getTime() >= (c.concluidaEm as Date).getTime() &&
        d.abertaEm.getTime() <= (c.concluidaEm as Date).getTime() + mf.diasAposCorretiva * DIA_MS,
    );
  const internas = observadas.filter((c) => c.executadoPor === 'equipe_interna');
  const taxaInterna = internas.length
    ? percentual(internas.filter(voltou).length, internas.length)
    : null;
  for (const [fornecedorId, cs] of agrupar(observadas, fornecedorDaOs)) {
    if (cs.length < mf.minConcluidas) continue;
    const comVolta = cs.filter(voltou);
    const taxa = percentual(comVolta.length, cs.length);
    if (taxa < mf.limiarPercentual) continue;
    sinais.push({
      regra: 'mesmo_fornecedor',
      situacao: 'possivel',
      versao: VERSAO_SISTEMICO,
      chave: { fornecedorId },
      evidencia: {
        quantidade: cs.length,
        distintos: unicos(cs.map((c) => c.ativoId as string)).length,
        janelaDias: mf.janelaDias,
        hotelIds: unicos(cs.map((c) => c.hotelId)),
        corretivaIds: comVolta.map((c) => c.id),
        voltas: comVolta.length,
        taxaPercentual: taxa,
        taxaInternaPercentual: taxaInterna,
      },
    });
  }

  // Crescimento da mesma falha no hotel, contra a janela anterior de igual tamanho.
  const cr = config.crescimento;
  const chaveHotel = (c: Corretiva) => {
    const falha = falhaDe(c);
    return falha ? `${c.hotelId}#${falha}` : null;
  };
  const doCrescimento = cr.ativa ? e.corretivas : [];
  const atual = agrupar(doCrescimento.filter(naJanela(cr.janelaDias)), chaveHotel);
  const anterior = agrupar(
    doCrescimento.filter(naJanela(cr.janelaDias, cr.janelaDias)),
    chaveHotel,
  );
  for (const [k, cs] of atual) {
    const antes = anterior.get(k)?.length ?? 0;
    if (cs.length < cr.minAtual || antes === 0) continue;
    const variacaoPercentual = percentual(cs.length - antes, antes);
    if (variacaoPercentual < cr.percentual) continue;
    const [hotelId, falha] = k.split('#') as [string, string];
    sinais.push({
      regra: 'crescimento_categoria',
      situacao: 'possivel',
      versao: VERSAO_SISTEMICO,
      chave: { hotelId, falha },
      evidencia: {
        quantidade: cs.length,
        distintos: unicos(cs.map((c) => c.localId)).length,
        janelaDias: cr.janelaDias,
        hotelIds: [hotelId],
        corretivaIds: cs.map((c) => c.id),
        anterior: antes,
        variacaoPercentual,
      },
    });
  }

  return sinais;
}
