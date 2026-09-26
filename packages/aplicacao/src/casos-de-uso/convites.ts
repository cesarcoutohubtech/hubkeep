// Convidar membro (ADR-014, ordem do ADR-018). Não existe convite sem acesso
// gravado: o e-mail só sai depois, pelo worker, a partir do evento.
//
//   a) regra do domínio (papel, escopo, validade) — antes de qualquer IO externo;
//   b) situação do pedido no contexto de quem convida: tenant, escopo visível,
//      membro existente. Escopo não visível → 404, sem tocar no Auth;
//   c) usuário no provedor de identidade, SEM e-mail;
//   d) membro + atribuição + evento membro.convidado numa unit of work; se
//      falhar, o usuário criado NESTA requisição é removido (compensação);
//   e) o worker envia o e-mail pelo evento (criarManipuladoresDeEventos).
import {
  type Contexto,
  Conflito,
  type Escopo,
  NaoEncontrado,
  type Papel,
  PermissaoNegada,
} from '@hubkeep/dominio';
import type { PortaConvites } from '../portas/convites';
import type { ProvedorDeIdentidade } from '../portas/identidade';
import type { CasosDeUsoDePapeis } from './papeis';

export interface PedidoDeConviteDeMembro {
  email: string;
  nome: string;
  papel: Papel;
  escopo: Escopo;
  validoAte: Date | null;
  /** Tela de aceite (a rota /auth/confirmar da web). */
  redirecionarPara: string;
}

export interface DependenciasDeConvites {
  papeis: Pick<CasosDeUsoDePapeis, 'verificarConcessao'>;
  convites: PortaConvites;
  identidade: ProvedorDeIdentidade;
}

export interface CasoDeUsoDeConvites {
  convidarMembro(ctx: Contexto, pedido: PedidoDeConviteDeMembro): Promise<{ usuarioId: string }>;
}

export function criarCasoDeUsoDeConvites(deps: DependenciasDeConvites): CasoDeUsoDeConvites {
  return {
    async convidarMembro(ctx, pedido) {
      // a) A regra não depende de quem é o alvo, só de quem concede e do que se
      //    pede: o id do convidado ainda não existe.
      await deps.papeis.verificarConcessao(ctx, {
        usuarioId: 'convidado',
        papel: pedido.papel,
        escopo: pedido.escopo,
        validoAte: pedido.validoAte,
      });

      // b)
      const situacao = await deps.convites.situacao(ctx, {
        email: pedido.email,
        escopo: pedido.escopo,
      });
      if (situacao.nomeTenant === null) {
        throw new PermissaoNegada('nao_e_membro_do_grupo', 'Você não é membro deste grupo.');
      }
      if (!situacao.escopoVisivel) {
        throw new NaoEncontrado('escopo_nao_encontrado', 'Escopo do convite não encontrado.');
      }
      if (situacao.jaMembro) {
        throw new Conflito('ja_e_membro', 'Esta pessoa já é membro deste grupo.');
      }

      // c)
      const { usuarioId, criadoAgora } = await deps.identidade.garantirUsuario({
        email: pedido.email,
        nome: pedido.nome,
        tenantId: ctx.tenantId,
        nomeTenant: situacao.nomeTenant,
      });

      // d)
      try {
        await deps.convites.gravar(ctx, {
          usuarioId,
          nome: pedido.nome,
          email: pedido.email,
          papel: pedido.papel,
          escopo: pedido.escopo,
          validoAte: pedido.validoAte,
          convite: { nomeTenant: situacao.nomeTenant, redirecionarPara: pedido.redirecionarPara },
        });
      } catch (e) {
        // Só quem esta requisição criou: usuário pré-existente (membro de outro
        // tenant) nunca é removido por uma falha aqui. Conflito de membro quer
        // dizer que um convite simultâneo gravou o acesso com este mesmo
        // usuário: removê-lo apagaria o convite do outro.
        const outroConviteGravou = e instanceof Conflito && e.codigo === 'ja_e_membro';
        if (criadoAgora && !outroConviteGravou) {
          // Se a remoção falhar, vale o erro original: usuário do Auth sem
          // membro não vê nada (falha fechada, ADR-014).
          await deps.identidade.removerUsuario(usuarioId).catch(() => undefined);
        }
        throw e;
      }
      return { usuarioId };
    },
  };
}
