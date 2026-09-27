// Configuração do tenant e do hotel e políticas (fase 1a, A7; ADR-026).
//
//   ler       qualquer membro: a configuração e as políticas, com o valor de
//             cada nível e o efetivo (hotel → grupo → padrão);
//   gravar    só o Admin do grupo; formato validado no domínio; a mudança vai
//             para a auditoria pela unit of work.
// A regra de quem grava é injetável para o teste provar que a RLS ainda barra.
import {
  type Atribuicao,
  CHAVES_DE_POLITICA,
  type ChaveDePolitica,
  type Contexto,
  NaoEncontrado,
  POLITICAS,
  RegraViolada,
  type Resultado,
  exigir,
  podeGerirPoliticas,
  resolverPolitica,
  validarPolitica,
  validarRegiao,
  type ValoresDePolitica,
} from '@hubkeep/dominio';
import { ehIdioma, fusoValido } from '@hubkeep/i18n';
import type {
  ConfiguracaoDoHotel,
  ConfiguracaoDoTenant,
  EscopoDePolitica,
  PortaConfiguracao,
} from '../portas/configuracao';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

/** Por chave: o padrão, o valor gravado em cada nível (nulo se não há ou se está fora do formato), o efetivo e de onde veio. */
export type PoliticaResolvida = {
  [C in ChaveDePolitica]: {
    chave: C;
    padrao: ValoresDePolitica[C];
    grupo: ValoresDePolitica[C] | null;
    hotel: ValoresDePolitica[C] | null;
    efetiva: ValoresDePolitica[C];
    origem: 'hotel' | 'grupo' | 'padrao';
  };
}[ChaveDePolitica];

export interface CasosDeUsoDeConfiguracao {
  lerConfiguracao(
    ctx: Contexto,
    hotelId?: string,
  ): Promise<{
    tenant: ConfiguracaoDoTenant;
    hotel: ConfiguracaoDoHotel | null;
    politicas: PoliticaResolvida[];
  }>;
  configurarTenant(ctx: Contexto, c: Omit<ConfiguracaoDoTenant, 'nome'>): Promise<void>;
  configurarHotel(
    ctx: Contexto,
    hotelId: string,
    c: Omit<ConfiguracaoDoHotel, 'id' | 'nome'>,
  ): Promise<void>;
  gravarPolitica(
    ctx: Contexto,
    chave: string,
    escopo: EscopoDePolitica,
    valor: unknown | null,
  ): Promise<void>;
}

const idiomaValido = (idioma: string | null) => {
  if (idioma !== null && !ehIdioma(idioma)) {
    throw new RegraViolada('idioma_nao_aceito', 'Idioma não disponível.', { idioma });
  }
};

export function criarCasosDeUsoDeConfiguracao(deps: {
  configuracao: PortaConfiguracao;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  /** Padrão: podeGerirPoliticas do domínio. Só o teste de aceite troca. */
  podeGerir?: (minhas: readonly Atribuicao[], agora: Date) => Resultado;
}): CasosDeUsoDeConfiguracao {
  const podeGerir = deps.podeGerir ?? podeGerirPoliticas;
  const exigirAdmin = async (ctx: Contexto) =>
    exigir(podeGerir(await deps.atribuicoes.doUsuario(ctx), deps.relogio.agora()));

  return {
    async lerConfiguracao(ctx, hotelId) {
      const tenant = await deps.configuracao.tenant(ctx);
      if (!tenant) throw new NaoEncontrado('tenant_nao_encontrado', 'Grupo não encontrado.');
      const hotel = hotelId ? await deps.configuracao.hotel(ctx, hotelId) : null;
      if (hotelId && !hotel)
        throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
      const gravadas = await deps.configuracao.politicas(ctx, hotelId);
      const resolver = <C extends ChaveDePolitica>(chave: C): PoliticaResolvida => {
        const definicao = POLITICAS[chave];
        // Valor fora do formato não vale: fica nulo e cai para o nível seguinte.
        const valorDe = (tipo: EscopoDePolitica['tipo']) => {
          const v = gravadas.find((p) => p.chave === chave && p.escopo.tipo === tipo)?.valor;
          return v !== undefined && definicao.valido(v) ? (v as ValoresDePolitica[C]) : null;
        };
        const grupo = valorDe('grupo');
        const doHotel = valorDe('hotel');
        return {
          chave,
          padrao: definicao.padrao,
          grupo,
          hotel: doHotel,
          efetiva: resolverPolitica(chave, {
            hotel: doHotel ?? undefined,
            grupo: grupo ?? undefined,
          }),
          origem: doHotel !== null ? 'hotel' : grupo !== null ? 'grupo' : 'padrao',
        } as PoliticaResolvida;
      };
      const politicas = CHAVES_DE_POLITICA.map(resolver);
      return { tenant, hotel, politicas };
    },

    async configurarTenant(ctx, c) {
      await exigirAdmin(ctx);
      validarRegiao(c);
      idiomaValido(c.idiomaPadrao);
      await deps.configuracao.configurarTenant(ctx, c);
    },

    async configurarHotel(ctx, hotelId, c) {
      await exigirAdmin(ctx);
      validarRegiao(c);
      idiomaValido(c.idiomaPadrao);
      if (!fusoValido(c.fuso))
        throw new RegraViolada('fuso_invalido', 'Fuso horário inválido.', { fuso: c.fuso });
      await deps.configuracao.configurarHotel(ctx, hotelId, c);
    },

    async gravarPolitica(ctx, chave, escopo, valor) {
      await exigirAdmin(ctx);
      if (valor === null) {
        validarPolitica(chave, POLITICAS[chave as ChaveDePolitica]?.padrao);
      } else {
        validarPolitica(chave, valor);
      }
      await deps.configuracao.gravarPolitica(ctx, chave, escopo, valor);
    },
  };
}
