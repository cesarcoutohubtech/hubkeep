// Anexos de hotel, local e ativo (fase 1a, B4; ADR-024).
//
// O arquivo vai do aparelho direto para o Storage, com a URL assinada da F0-10,
// e depois é registrado na unit of work. Anexa quem escreve no hotel (a mesma
// condição da URL de upload, ADR-024); remove quem enviou o arquivo ou quem
// gere os locais do hotel. A remoção é lógica: o arquivo fica no Storage.
// A assinatura do aceite (I8) é imutável: ninguém a remove.
// A miniatura é gerada no aparelho e enviada como um segundo objeto do mesmo
// registro; ela é sempre uma imagem.
import { escopoCobreHotel } from './equipes';
import { PermissaoNegada, RegraViolada } from './erros';
import { PAPEIS_QUE_GERENCIAM_LOCAIS } from './locais';
import { type Resultado, vigente } from './permissoes';
import type { Atribuicao } from './tipos';

export const TIPOS_DE_MINIATURA = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const LIMITE_NOME_DE_ANEXO = 200;

/** Nome original do arquivo: opcional, sem espaços nas pontas, até 200 caracteres. */
export function normalizarNomeDeAnexo(nome: string | null | undefined): string | null {
  const limpo = (nome ?? '').trim().replace(/\s+/g, ' ');
  if (limpo.length === 0) return null;
  if (limpo.length > LIMITE_NOME_DE_ANEXO) {
    throw new RegraViolada('anexo_nome_invalido', 'Nome de arquivo inválido.', {
      maximo: LIMITE_NOME_DE_ANEXO,
    });
  }
  return limpo;
}

/** A miniatura é uma imagem do mesmo registro do arquivo principal. */
export function validarMiniatura(
  principal: { registro: string },
  miniatura: { registro: string; tipo: string },
): void {
  if (
    principal.registro !== miniatura.registro ||
    !(TIPOS_DE_MINIATURA as readonly string[]).includes(miniatura.tipo)
  ) {
    throw new RegraViolada('miniatura_invalida', 'Miniatura inválida.');
  }
}

export function podeRemoverAnexo(
  minhas: readonly Atribuicao[],
  hotel: { id: string; bandeiraId: string | null },
  anexo: { usuarioId: string; assinatura?: boolean },
  usuarioId: string,
  agora: Date,
): Resultado {
  if (anexo.assinatura) {
    return {
      permitido: false,
      erro: new PermissaoNegada(
        'assinatura_nao_se_remove',
        'A assinatura do aceite não pode ser removida.',
      ),
    };
  }
  const pode =
    anexo.usuarioId === usuarioId ||
    minhas.some(
      (a) =>
        vigente(a, agora) &&
        PAPEIS_QUE_GERENCIAM_LOCAIS.includes(a.papel) &&
        escopoCobreHotel(a, hotel),
    );
  return pode
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'remover_anexo_fora_do_escopo',
          'Só quem enviou o arquivo ou quem gere o hotel remove o anexo.',
          { hotelId: hotel.id },
        ),
      };
}
