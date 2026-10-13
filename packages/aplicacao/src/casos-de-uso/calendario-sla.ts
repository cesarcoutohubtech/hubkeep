// O calendário de SLA de um hotel (fase 1c; ADR-042), montado na hora do
// cálculo: o horário e o ponto facultativo vêm da cópia do chamado; os
// feriados oficiais, da porta, e os do hotel, do banco. Cadastrar um feriado
// não muda prazo já gravado, só o próximo cálculo.
import {
  type CalendarioDeSla,
  type SlaAplicado,
  anosDoCalendario,
  calendarioDeSla,
  regiaoDoHotel,
} from '@hubkeep/dominio';
import type { DadosDoCalendario, FeriadosOficiais } from '../portas/calendario-sla';

export function montarCalendarioDeSla(
  feriadosOficiais: FeriadosOficiais,
  dados: DadosDoCalendario,
  copia: SlaAplicado,
  inicio: Date,
): CalendarioDeSla {
  const anos = anosDoCalendario(inicio);
  const regiao = regiaoDoHotel(dados.hotel, dados.tenant);
  return calendarioDeSla({
    fuso: dados.fuso,
    horario: copia['hotel.horario_atendimento'],
    oficiais: anos.flatMap((ano) => feriadosOficiais.doAno(regiao, ano)),
    doHotel: dados.feriados,
    pontoFacultativo: copia['chamado.sla'].pontoFacultativo,
    anos,
  });
}
