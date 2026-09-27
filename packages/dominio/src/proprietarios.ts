// Proprietários e vínculos (fase 1a, A4; ADR-031). O proprietário ou locador
// se liga a UHs (condo-hotel) ou a um hotel inteiro, sempre com vigência. O
// escopo que isso dá é calculado na fonte, no banco (authz.locais_proprietario);
// aqui ficam as regras de cadastro: quem gere, formato e sobreposição.
import { Conflito, PermissaoNegada, RegraViolada } from './erros';
import { type Resultado, ehAdminGrupo } from './permissoes';
import type { Atribuicao } from './tipos';

/** Datas yyyy-mm-dd; fim nulo é sem prazo. Os dois extremos valem. */
export interface Vigencia {
  inicio: string;
  fim: string | null;
}

/** Cadastro de proprietário e vínculos: só o Admin do grupo (dado pessoal, LGPD). */
export function podeGerirProprietarios(minhas: readonly Atribuicao[], agora: Date): Resultado {
  return ehAdminGrupo(minhas, agora)
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'proprietarios_so_admin',
          'Só o Admin do grupo gere proprietários.',
        ),
      };
}

export function normalizarNomeDeProprietario(nome: string): string {
  const n = nome.trim().replace(/\s+/g, ' ');
  if (n.length === 0 || n.length > 200) {
    throw new RegraViolada('proprietario_nome_invalido', 'Nome de proprietário inválido.');
  }
  return n;
}

export function normalizarDocumento(documento: string | null): string | null {
  const d = documento?.trim() ?? '';
  if (d.length > 32) {
    throw new RegraViolada('proprietario_documento_invalido', 'Documento inválido.');
  }
  return d === '' ? null : d;
}

const dataValida = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export function validarVigencia(v: Vigencia): Vigencia {
  if (!dataValida(v.inicio) || (v.fim !== null && (!dataValida(v.fim) || v.fim < v.inicio))) {
    throw new RegraViolada('vigencia_invalida', 'Vigência inválida.', {
      inicio: v.inicio,
      fim: v.fim,
    });
  }
  return v;
}

/** Dia (yyyy-mm-dd, UTC, como o current_date do banco) de um instante. */
export const diaDe = (instante: Date): string => instante.toISOString().slice(0, 10);

export const vigenciaCobre = (v: Vigencia, dia: string): boolean =>
  v.inicio <= dia && (v.fim === null || v.fim >= dia);

export const vigenciasSobrepostas = (a: Vigencia, b: Vigencia): boolean =>
  a.inicio <= (b.fim ?? '9999-12-31') && b.inicio <= (a.fim ?? '9999-12-31');

/** Dois vínculos do mesmo proprietário com a mesma UH (ou o mesmo hotel) não se sobrepõem. */
export function exigirSemSobreposicao(existentes: readonly Vigencia[], nova: Vigencia): void {
  if (existentes.some((e) => vigenciasSobrepostas(e, nova))) {
    throw new Conflito('vinculo_sobreposto', 'Já existe vínculo nesse período.');
  }
}
