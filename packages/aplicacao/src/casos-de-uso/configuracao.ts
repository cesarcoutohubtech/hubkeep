// Configuração do tenant e do hotel e políticas (fase 1a, A7; ADR-026).
//
//   ler       qualquer membro: a configuração e as políticas, com o valor de
//             cada nível e o efetivo (hotel → bandeira → grupo → padrão; a
//             bandeira é a do hotel, ligada na 1c);
//   gravar    só o Admin do grupo (também o modelo contratual do hotel, I2);
//             chave e formato conferidos pelo registro de
//             políticas do tenant (o do núcleo e as extensões dos módulos que
//             o tenant tem vigentes, adendo da I7), e o nível, quando a
//             extensão restringe a chave a alguns níveis (escopos); a
//             mudança vai para a auditoria pela unit of work.
// A leitura devolve só as chaves do núcleo: a tela das políticas de um módulo
// é do módulo.
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
  registroDePoliticas,
  resolverPolitica,
  validarModeloContratual,
  validarRegiao,
  type ValoresDePolitica,
} from '@hubkeep/dominio';
import { ehIdioma, fusoValido } from '@hubkeep/i18n';
import type {
  ConfiguracaoDoHotel,
  ConfiguracaoDoTenant,
  EscopoDePolitica,
  MudancaDaConfiguracaoDoHotel,
  PortaConfiguracao,
} from '../portas/configuracao';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { PoliticasDoTenant } from './modulos';

/** Por chave: o padrão, o valor gravado em cada nível (nulo se não há ou se está fora do formato), o efetivo e de onde veio. */
export type PoliticaResolvida = {
  [C in ChaveDePolitica]: {
    chave: C;
    padrao: ValoresDePolitica[C];
    grupo: ValoresDePolitica[C] | null;
    /** O valor da bandeira do hotel; nulo sem hotel, sem bandeira ou sem valor. */
    bandeira: ValoresDePolitica[C] | null;
    hotel: ValoresDePolitica[C] | null;
    efetiva: ValoresDePolitica[C];
    origem: 'hotel' | 'bandeira' | 'grupo' | 'padrao';
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
  configurarHotel(ctx: Contexto, hotelId: string, c: MudancaDaConfiguracaoDoHotel): Promise<void>;
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
  /**
   * O registro do tenant de quem pede. Padrão: só as chaves do núcleo. O ponto
   * de composição escolhe pelos módulos vigentes (criarPoliticasDoTenant).
   */
  politicas?: PoliticasDoTenant;
}): CasosDeUsoDeConfiguracao {
  const podeGerir = deps.podeGerir ?? podeGerirPoliticas;
  const doNucleo = registroDePoliticas([]);
  const politicasDo = deps.politicas ?? (async () => doNucleo);
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
        const daBandeira = valorDe('bandeira');
        const doHotel = valorDe('hotel');
        return {
          chave,
          padrao: definicao.padrao,
          grupo,
          bandeira: daBandeira,
          hotel: doHotel,
          efetiva: resolverPolitica(chave, {
            hotel: doHotel ?? undefined,
            bandeira: daBandeira ?? undefined,
            grupo: grupo ?? undefined,
          }),
          origem:
            doHotel !== null
              ? 'hotel'
              : daBandeira !== null
                ? 'bandeira'
                : grupo !== null
                  ? 'grupo'
                  : 'padrao',
        } as PoliticaResolvida;
      };
      return { tenant, hotel, politicas: CHAVES_DE_POLITICA.map(resolver) };
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
      // Ausente: o gravado fica (o conector e telas antigas não mandam o campo).
      const { modeloContratual, ...resto } = c;
      await deps.configuracao.configurarHotel(
        ctx,
        hotelId,
        modeloContratual === undefined
          ? resto
          : { ...resto, modeloContratual: validarModeloContratual(modeloContratual) },
      );
    },

    async gravarPolitica(ctx, chave, escopo, valor) {
      await exigirAdmin(ctx);
      // Valor null volta a herdar; a chave ainda precisa existir no registro
      // do tenant (chave de módulo que o tenant não tem: politica_desconhecida).
      const politicas = await politicasDo(ctx);
      politicas.validar(chave, valor === null ? politicas.padrao(chave) : valor);
      // A chave que só vale em alguns níveis (escopos da extensão) recusa os
      // outros. Voltar a herdar continua valendo em qualquer nível, para
      // limpar o valor gravado antes da restrição.
      if (valor !== null) politicas.validarNivel(chave, escopo.tipo);
      await deps.configuracao.gravarPolitica(ctx, chave, escopo, valor);
    },
  };
}
