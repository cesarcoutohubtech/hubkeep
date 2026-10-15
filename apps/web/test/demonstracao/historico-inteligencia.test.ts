// O roteiro do histórico de demonstração do Intelligence (historico-
// inteligencia.ts), sem banco: o job de cada dia (executarDiaDoTenant) roda
// sobre o roteiro, com portas em memória, e as decisões do roteiro mudam o
// estado dos insights como as pessoas fariam. Confere que cada cenário abre o
// insight esperado e termina no estado planejado, que o ruído não abre
// nenhum, e que os sinais da tela do ativo (reincidência, substituição e
// efetividade) aparecem. A gravação no banco, com o relógio do roteiro, ganha o
// teste dela quando a montagem da 1b estiver na main.
import {
  type AtivoDoDia,
  type ChamadoDaFonte,
  type DeteccaoDoDia,
  type EstadoDoInsight,
  type InsightExistente,
  type LinhaDaMetricaDiaria,
  TRANSICOES_DO_INSIGHT,
  aceiteDaOs,
  conclusaoEReaberturas,
  efetividadeAntesDepois,
  executarDiaDoTenant,
  fimDoDia,
  sinalDeSubstituicao,
  DIA_MS,
  HORA_MS,
} from '@hubkeep/inteligencia';
import { TRANSICOES_DA_OS } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type ChamadoDoRoteiro,
  FUSO_DO_HISTORICO,
  MOMENTO_DO_JOB,
  type MomentoDoJob,
  type RoteiroDoHistorico,
  VOLUME_COMPLETO,
  VOLUME_CURTO,
  VOLUME_MINIMO,
  cenarioDoInsight,
  decisoesDoDia,
  estadoAposPasso,
  instanteDoJob,
  roteiroDoHistorico,
} from './historico-inteligencia';

const FIM = '2026-10-12';

interface InsightSimulado extends InsightExistente {
  tipo: DeteccaoDoDia['tipo'];
  cenario: string | null;
  abertoNoDia: string;
  estados: EstadoDoInsight[];
}

/** O chamado como o banco o guardaria em `agora`: só os passos feitos até ali. */
function chamadoNoDia(c: ChamadoDoRoteiro, agora: Date): ChamadoDaFonte {
  return {
    id: c.chave,
    hotelId: c.hotel,
    localId: c.local,
    ativoId: c.ativo,
    abertaEm: c.abertoEm,
    estado: c.estado,
    impactoHospede: c.impactoHospede,
    os: [
      {
        estado: c.os.estado,
        criadaEm: (c.os.passos[0] ?? { quando: c.abertoEm }).quando,
        codigoFalha: c.os.codigoFalha,
        executadoPor: c.os.executadoPor,
        fornecedorId: c.os.fornecedor,
        custoInformado:
          c.os.custo !== null && c.os.passos.some((p) => p.acao === 'aceitar' && p.quando <= agora)
            ? c.os.custo
            : null,
        transicoes: c.os.passos
          .filter((p) => p.quando.getTime() <= agora.getTime())
          .map((p) => ({ acao: p.acao, para: estadoAposPasso(p.acao), quando: p.quando })),
      },
    ],
  };
}

/** Roda o job em cada dia do roteiro e aplica as decisões, como o gerador fará no banco. */
async function simular(r: RoteiroDoHistorico, momento: MomentoDoJob) {
  const insights: InsightSimulado[] = [];
  const metricas: LinhaDaMetricaDiaria[] = [];
  // Por dia, para o calculosDoDia não varrer todas as linhas a cada dia.
  const metricasPorDia = new Map<string, LinhaDaMetricaDiaria[]>();
  const hoteis = r.hoteis.map((h) => ({
    hotelId: h.chave,
    bandeiraId: h.bandeira,
    fuso: FUSO_DO_HISTORICO,
  }));
  const locais = r.locais.map((l) => ({
    id: l.chave,
    hotelId: l.hotel,
    andar: l.andar,
    tipo: l.tipo,
  }));
  const paradas = new Map<string, { inicio: Date; fim: Date }[]>();
  for (const c of r.chamados)
    if (c.ativo && c.parada) paradas.set(c.ativo, [...(paradas.get(c.ativo) ?? []), c.parada]);

  for (const dia of r.dias) {
    const agora = instanteDoJob(dia, momento);
    await executarDiaDoTenant(
      {
        fonte: {
          modulos: async () => [{ modulo: 'inteligencia', inicio: r.inicio, fim: null }],
          hoteis: async () => hoteis,
          ativos: async (ag): Promise<AtivoDoDia[]> =>
            r.ativos.map((a) => ({
              id: a.chave,
              hotelId: a.hotel,
              categoriaId: a.categoria,
              fabricante: a.fabricante,
              modelo: a.modelo,
              criticidade: a.criticidade,
              garantiaAte: a.garantiaAte,
              desativadoEm: null,
              paradas: (paradas.get(a.chave) ?? [])
                .filter((p) => p.inicio <= ag)
                .map((p) => ({ inicio: p.inicio, fim: p.fim <= ag ? p.fim : null })),
            })),
          corretivas: async (ag) =>
            r.chamados.filter((c) => c.abertoEm <= ag).map((c) => chamadoNoDia(c, ag)),
          locais: async () => locais,
          politicaSistemica: async () => r.politicaSistemica,
          insights: async () => insights,
          calculosDoDia: async (d) =>
            new Map((metricasPorDia.get(d) ?? []).map((m) => [m.ativoId, m.calculo])),
        },
        gravacao: {
          gravarMetricas: async (linhas) => {
            metricas.push(...linhas);
            for (const m of linhas)
              metricasPorDia.set(m.dia, [...(metricasPorDia.get(m.dia) ?? []), m]);
          },
          abrirInsight: async ({ deteccao: d, anteriorId }) => {
            const cenario = cenarioDoInsight(r, {
              tipo: d.tipo,
              ...(d.regra ? { regra: d.regra } : {}),
              hoteis: d.hotelIds,
              escopo: d.escopo,
            });
            insights.push({
              id: `i${insights.length + 1}`,
              familia: d.familia,
              hotelIds: d.hotelIds,
              estado: 'novo',
              faixa: d.faixa,
              abertoEm: agora,
              anteriorId,
              encerradoEm: null,
              motivoDeDescarte: null,
              tipo: d.tipo,
              cenario: cenario?.chave ?? `inesperado:${d.familia}`,
              abertoNoDia: dia,
              estados: ['novo'],
            });
          },
          atualizarInsight: async ({ insightId, deteccao }) => {
            const i = insights.find((x) => x.id === insightId) as InsightSimulado;
            i.faixa = deteccao.faixa;
          },
          registrarExecucao: async () => {},
        },
      },
      { agora },
    );

    // As decisões do dia, depois do job.
    for (const i of insights) {
      const cenario = r.cenarios.find((c) => c.chave === i.cenario);
      if (!cenario) continue;
      for (const d of decisoesDoDia(r, cenario, i.abertoNoDia, dia)) {
        const t = TRANSICOES_DO_INSIGHT[d.acao];
        if (!t.de.includes(i.estado))
          throw new Error(`${cenario.chave}: ${d.acao} não vale em ${i.estado} (${dia})`);
        if (t.exigeNota && !d.nota) throw new Error(`${cenario.chave}: ${d.acao} sem nota`);
        i.estado = t.para;
        i.estados.push(t.para);
        if (t.para === 'resolvido' || t.para === 'descartado') {
          i.encerradoEm = new Date(agora.getTime() - HORA_MS);
          i.motivoDeDescarte = d.motivoDeDescarte ?? null;
        }
      }
    }
  }
  return { insights, metricas };
}

// Os dois testes que rodam o job leem a mesma simulação (183 dias do roteiro
// curto), feita uma vez por momento do job (os dois do ponto 4, até Cesar e
// Kaio combinarem). Ela custa cerca de 1,4 s sozinha e passou de 7 s
// com o pnpm test completo na CI (#237), acima dos 5 s padrão do Vitest. Os
// dois testes têm por isso um limite próprio, porque qualquer um pode ser o
// primeiro a pedi-la (com -t, por exemplo).
const LIMITE_DA_SIMULACAO_MS = 20_000;
const simulacoes = new Map<string, ReturnType<typeof simular>>();
function simulacaoDoRoteiro(momento: MomentoDoJob, volume = VOLUME_CURTO) {
  const chave = `${momento}:${JSON.stringify(volume)}`;
  let s = simulacoes.get(chave);
  if (!s) {
    s = simular(roteiroDoHistorico({ fim: FIM, volume }), momento);
    simulacoes.set(chave, s);
  }
  return s;
}
const MOMENTOS: readonly MomentoDoJob[] = ['como_em_producao', 'fim_do_dia_local'];
// O roteiro curto nos dois momentos do job; o mínimo (o do teste da gravação no
// banco) no momento padrão.
const VOLUMES_E_MOMENTOS = [
  ...MOMENTOS.map((momento) => ({ nome: 'curto', volume: VOLUME_CURTO, momento })),
  { nome: 'mínimo', volume: VOLUME_MINIMO, momento: MOMENTO_DO_JOB },
];

describe('roteiro do histórico de demonstração do Intelligence', () => {
  it('é determinístico: a mesma semente e o mesmo fim dão o mesmo roteiro', () => {
    const a = roteiroDoHistorico({ fim: FIM, volume: VOLUME_CURTO });
    const b = roteiroDoHistorico({ fim: FIM, volume: VOLUME_CURTO });
    expect(b).toEqual(a);
    expect(roteiroDoHistorico({ fim: FIM, volume: VOLUME_CURTO, semente: 7 }).chamados).not.toEqual(
      a.chamados,
    );
  });

  it('tem seis meses, seis hotéis em duas bandeiras e o volume da proposta', () => {
    const r = roteiroDoHistorico({ fim: FIM });
    expect(r.dias).toHaveLength(183);
    expect(r.dias.at(-1)).toBe(FIM);
    expect(r.hoteis).toHaveLength(6);
    expect(new Set(r.hoteis.map((h) => h.bandeira)).size).toBe(2);
    for (const h of r.hoteis) {
      const doHotel = r.ativos.filter((a) => a.hotel === h.chave).length;
      expect(doHotel).toBeGreaterThanOrEqual(50);
      expect(doHotel).toBeLessThanOrEqual(70);
    }
    const doHistorico = r.chamados.filter((c) => c.abertoEm >= r.inicio).length;
    expect(doHistorico).toBeGreaterThan(3_000);
    expect(doHistorico).toBeLessThan(3_600);
    expect(r.volume).toEqual(VOLUME_COMPLETO);
  });

  it('nenhum chamado fica fora do histórico, e a OS segue as transições do domínio', () => {
    const r = roteiroDoHistorico({ fim: FIM, volume: VOLUME_CURTO });
    const fim = fimDoDia(FIM).getTime();
    const chaves = new Set(r.chamados.map((c) => c.chave));
    expect(chaves.size).toBe(r.chamados.length);
    for (const c of r.chamados) {
      expect(c.abertoEm.getTime()).toBeGreaterThanOrEqual(r.inicioDosChamados.getTime());
      expect(c.abertoEm.getTime()).toBeLessThanOrEqual(fim);
      let estado: string = 'nova';
      let antes = c.abertoEm.getTime();
      for (const p of c.os.passos) {
        expect(TRANSICOES_DA_OS[p.acao].de, c.chave).toContain(estado);
        expect(p.quando.getTime()).toBeGreaterThanOrEqual(antes);
        antes = p.quando.getTime();
        estado = estadoAposPasso(p.acao);
      }
      if (c.os.passos.length) expect(c.os.estado).toBe(estado);
    }
  });

  it.each(VOLUMES_E_MOMENTOS)(
    'cada cenário abre o insight esperado e termina no estado do roteiro; o ruído não abre nenhum (roteiro $nome, job: $momento)',
    async ({ volume, momento }) => {
      const r = roteiroDoHistorico({ fim: FIM, volume });
      const { insights } = await simulacaoDoRoteiro(momento, volume);
      const inesperados = insights.filter((i) => i.cenario?.startsWith('inesperado:'));
      expect(inesperados.map((i) => `${i.cenario} em ${i.abertoNoDia}`)).toEqual([]);
      for (const c of r.cenarios.filter((x) => x.alvo)) {
        const doCenario = insights.filter((i) => i.cenario === c.chave);
        expect(
          doCenario.map((i) => i.abertoNoDia),
          c.chave,
        ).toHaveLength(1);
        expect((doCenario[0] as InsightSimulado).estado, c.chave).toBe(c.estadoFinal);
      }
    },
    LIMITE_DA_SIMULACAO_MS,
  );

  it.each(MOMENTOS)(
    'a reincidência, a substituição e a efetividade aparecem nos ativos dos cenários (job: %s)',
    async (momento) => {
      const r = roteiroDoHistorico({ fim: FIM, volume: VOLUME_CURTO });
      const { metricas } = await simulacaoDoRoteiro(momento);
      const agora = fimDoDia(FIM);
      const cenario = (chave: string) => r.cenarios.find((c) => c.chave === chave);

      const reincidente = cenario('reincidencia-ar')?.ativo as string;
      const maior = Math.max(
        ...metricas.filter((m) => m.ativoId === reincidente).map((m) => m.reincidencia ?? 0),
      );
      expect(maior).toBeGreaterThanOrEqual(70);

      const corretivasDe = (ativo: string) =>
        r.chamados
          .filter((c) => c.ativo === ativo)
          .map((c) => ({
            id: c.chave,
            hotelId: c.hotel,
            localId: c.local,
            ativoId: c.ativo,
            abertaEm: c.abertoEm,
            codigoFalha: c.os.codigoFalha,
            ...conclusaoEReaberturas(c.os.passos, agora),
            aceitaEm: aceiteDaOs(c.os.passos, agora),
          }));
      const paradasDe = (ativo: string) =>
        r.chamados.flatMap((c) => (c.ativo === ativo && c.parada ? [c.parada] : []));

      const lavadora = cenario('substituicao-lavadora')?.ativo as string;
      const dados = r.ativos.find((a) => a.chave === lavadora);
      const horas = paradasDe(lavadora).reduce(
        (s, p) => s + (p.fim.getTime() - p.inicio.getTime()) / HORA_MS,
        0,
      );
      const substituicao = sinalDeSubstituicao({
        corretivas12m: corretivasDe(lavadora).length,
        horasParadas12m: horas,
        idadeAnos: Math.floor(
          (agora.getTime() - (dados?.dataCompra.getTime() ?? 0)) / (365 * DIA_MS),
        ),
        custo12m: null,
        custoReposicao: null,
        impactoHospede: null,
        criticidade: dados?.criticidade ?? null,
        reincidencia: null,
        garantiaVigente: false,
      });
      expect(substituicao.sinal).toBe('avaliar_substituicao');

      const efetividade = cenario('efetividade-elevador');
      const elevador = efetividade?.ativo as string;
      const resultado = efetividadeAntesDepois(
        {
          intervencaoEm: efetividade?.intervencaoEm as Date,
          corretivas: corretivasDe(elevador),
          paradas: paradasDe(elevador),
        },
        agora,
      );
      expect(resultado.resultado).toBe('reducao_observada');
    },
    LIMITE_DA_SIMULACAO_MS,
  );
});
