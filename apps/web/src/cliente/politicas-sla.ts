// Formulários das políticas do SLA (1c, ADR-042 e ADR-043): leem o FormData da
// tela /admin/sla e montam o valor que o PUT /api/v1/politicas recebe. Só
// apresentação: quem valida é o domínio, pela API (politica_valor_invalido).
// O campo vazio fica fora do valor; o campo preenchido pela metade vai como
// está, e a API recusa.
import {
  DESTINATARIOS_DO_AVISO,
  DIAS_DA_SEMANA,
  type EscalonamentoDeSla,
  type HorarioDeAtendimento,
  LIMITES_DO_SLA,
  MOTIVOS_DE_PAUSA,
  type PoliticaDeSla,
  RELOGIOS_DE_SLA,
  type SlaDaCategoria,
} from '@hubkeep/dominio';

/** Intervalos de cada dia que a tela mostra: o máximo que o domínio aceita. */
export const INTERVALOS_POR_DIA = LIMITES_DO_SLA.intervalosPorDia;

const textoDe = (f: FormData, campo: string) => String(f.get(campo) ?? '').trim();

/** Horas como número; a vírgula decimal vale como ponto. Vazio: null. */
const horasDe = (f: FormData, campo: string): number | null => {
  const v = textoDe(f, campo).replace(',', '.');
  return v === '' ? null : Number(v);
};

const relogioDe = (f: FormData, campo: string) => {
  const v = textoDe(f, campo);
  return (RELOGIOS_DE_SLA as readonly string[]).includes(v)
    ? (v as (typeof RELOGIOS_DE_SLA)[number])
    : null;
};

const marcado = (f: FormData, campo: string) => f.get(campo) === 'on';

/**
 * A chave da linha que a tela edita para a prioridade: o id, se a política
 * já tem linha por ele; senão, a chave padrão dela, se tem linha por essa
 * chave; senão, o id. Assim a linha herdada do padrão continua na chave em
 * que está.
 */
export function chaveDaLinha(
  sla: Pick<PoliticaDeSla, 'porPrioridade'>,
  prioridade: { id: string; chavePadrao: string | null },
): string {
  if (Object.hasOwn(sla.porPrioridade, prioridade.id)) return prioridade.id;
  if (prioridade.chavePadrao && Object.hasOwn(sla.porPrioridade, prioridade.chavePadrao)) {
    return prioridade.chavePadrao;
  }
  return prioridade.id;
}

/**
 * A política chamado.sla a partir do formulário. As linhas de prioridade e
 * de categoria que a tela não mostra (as inativas) continuam como estavam.
 * Prioridade sem as duas horas fica sem linha (usa a de peso mais próximo);
 * categoria sem nenhum campo fica sem exceção.
 */
export function slaDoFormulario(
  f: FormData,
  atual: PoliticaDeSla,
  prioridades: readonly { id: string; chavePadrao: string | null }[],
  categorias: readonly { id: string }[],
): PoliticaDeSla {
  const porPrioridade = new Map(Object.entries(atual.porPrioridade));
  for (const p of prioridades) {
    const chave = chaveDaLinha(atual, p);
    const atendimento = horasDe(f, `prioridade.${p.id}.atendimento`);
    const solucao = horasDe(f, `prioridade.${p.id}.solucao`);
    if (atendimento === null && solucao === null) {
      porPrioridade.delete(chave);
      continue;
    }
    porPrioridade.set(chave, {
      atendimentoHoras: atendimento ?? Number.NaN,
      solucaoHoras: solucao ?? Number.NaN,
      relogio: relogioDe(f, `prioridade.${p.id}.relogio`) ?? 'atendimento',
    });
  }
  const porCategoria = new Map(Object.entries(atual.porCategoria));
  for (const c of categorias) {
    const excecao: SlaDaCategoria = {};
    const atendimento = horasDe(f, `categoria.${c.id}.atendimento`);
    const solucao = horasDe(f, `categoria.${c.id}.solucao`);
    const relogio = relogioDe(f, `categoria.${c.id}.relogio`);
    if (atendimento !== null) excecao.atendimentoHoras = atendimento;
    if (solucao !== null) excecao.solucaoHoras = solucao;
    if (relogio !== null) excecao.relogio = relogio;
    if (marcado(f, `categoria.${c.id}.pausa`)) excecao.pausa = true;
    if (Object.keys(excecao).length === 0) porCategoria.delete(c.id);
    else porCategoria.set(c.id, excecao);
  }
  return {
    porPrioridade: Object.fromEntries(porPrioridade),
    porCategoria: Object.fromEntries(porCategoria),
    motivosQuePausam: MOTIVOS_DE_PAUSA.filter((m) => marcado(f, `motivo.${m}`)),
    pontoFacultativo: marcado(f, 'pontoFacultativo'),
    metaPercentual: Number(textoDe(f, 'metaPercentual')),
  };
}

/** O horário de atendimento a partir do formulário, cada dia em ordem de início. */
export function horarioDoFormulario(f: FormData): HorarioDeAtendimento {
  const horario = {} as HorarioDeAtendimento;
  for (const dia of DIAS_DA_SEMANA) {
    const intervalos: { inicio: string; fim: string }[] = [];
    for (let i = 0; i < INTERVALOS_POR_DIA; i++) {
      const inicio = textoDe(f, `horario.${dia}.${i}.inicio`);
      const fim = textoDe(f, `horario.${dia}.${i}.fim`);
      if (inicio !== '' || fim !== '') intervalos.push({ inicio, fim });
    }
    horario[dia] = intervalos.sort((a, b) => a.inicio.localeCompare(b.inicio));
  }
  return horario;
}

/** O escalonamento do monitor a partir do formulário. */
export function escalonamentoDoFormulario(f: FormData): EscalonamentoDeSla {
  return {
    percentualDoAviso: Number(textoDe(f, 'percentualDoAviso')),
    emRisco: DESTINATARIOS_DO_AVISO.filter((d) => marcado(f, `emRisco.${d}`)),
    vencido: DESTINATARIOS_DO_AVISO.filter((d) => marcado(f, `vencido.${d}`)),
  };
}
