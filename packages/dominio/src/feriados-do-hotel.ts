// Feriados do hotel (fase 1c; ADR-042, decisões 3 e 4 do calendário de SLA):
// o feriado municipal e o do próprio hotel, que a biblioteca de feriados não
// cobre. Quem cadastra é a gestão do hotel e o Implantador, como as equipes
// (a policy de app.feriado_hotel usa os mesmos papéis, migração 0043). A data
// não muda depois de gravada (sem UPDATE na coluna): para trocar, desativa e
// cadastra outro. "Repete todo ano" (anual) vale no mesmo dia e mês de cada
// ano. Cadastrar um feriado não muda prazo já gravado, só o próximo cálculo.
import { PermissaoNegada, RegraViolada } from './erros';
import { escopoCobreHotel } from './equipes';
import { type Resultado, vigente } from './permissoes';
import type { Atribuicao, Papel } from './tipos';

export const PAPEIS_QUE_CADASTRAM_FERIADOS: readonly Papel[] = [
  'admin_grupo',
  'gestor_csc',
  'implantador',
  'gerente_hotel',
];

export const LIMITES_DO_FERIADO = { nome: 120, anoMinimo: 2000, anoMaximo: 2100 } as const;

export function podeCadastrarFeriados(
  minhas: readonly Atribuicao[],
  hotel: { id: string; bandeiraId: string | null },
  agora: Date,
): Resultado {
  const pode = minhas.some(
    (a) =>
      vigente(a, agora) &&
      PAPEIS_QUE_CADASTRAM_FERIADOS.includes(a.papel) &&
      escopoCobreHotel(a, hotel),
  );
  return pode
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'feriados_fora_do_escopo',
          'Você não cadastra feriados neste hotel.',
          { hotelId: hotel.id },
        ),
      };
}

/** Nome do feriado: sem espaços nas pontas nem repetidos, de 1 a 120 caracteres. */
export function normalizarNomeDoFeriado(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, ' ');
  if (limpo.length === 0 || limpo.length > LIMITES_DO_FERIADO.nome) {
    throw new RegraViolada('feriado_nome_invalido', 'Nome do feriado inválido.', {
      maximo: LIMITES_DO_FERIADO.nome,
    });
  }
  return limpo;
}

/** A data do feriado: 'AAAA-MM-DD', um dia que existe, de 2000 a 2100. */
export function validarDataDoFeriado(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  const ano = Number(m?.[1]);
  const d = m ? new Date(Date.UTC(ano, Number(m[2]) - 1, Number(m[3]))) : null;
  if (
    !d ||
    d.toISOString().slice(0, 10) !== data ||
    ano < LIMITES_DO_FERIADO.anoMinimo ||
    ano > LIMITES_DO_FERIADO.anoMaximo
  ) {
    throw new RegraViolada('feriado_data_invalida', 'Data do feriado inválida.', {
      minimo: `${LIMITES_DO_FERIADO.anoMinimo}-01-01`,
      maximo: `${LIMITES_DO_FERIADO.anoMaximo}-12-31`,
    });
  }
  return data;
}
