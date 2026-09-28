// Fila do dia (F0-11): vazia até a fase 1a, quando as OS chegam. A tela já
// mostra o estado da rede e da fila offline, e o seletor de idioma é a
// operação de exemplo: funciona sem rede e sincroniza quando ela volta.
// Operação recusada pelo servidor aparece aqui, com o motivo pelo código de
// erro da API, até o técnico dispensar (ADR-025, ajuste (c)).
import type { Chave, IdiomaDeExibicao } from '@hubkeep/i18n';
import { useIntl } from 'react-intl';
import type { OperacaoNaFila } from '../fila/banco';
import { nomeDoIdioma, opcoesDeIdioma, useT } from '../i18n';

export interface OperacaoRecusada {
  chave: string;
  tipo: OperacaoNaFila['tipo'];
  /** Código de erro da API (ex.: fuso_invalido) ou entrada_invalida, se recusada no aparelho. */
  codigo: string;
}

export interface EstadoDaFila {
  pendentes: number;
  rejeitadas: OperacaoRecusada[];
}

const ROTULO_DA_OPERACAO: Record<OperacaoNaFila['tipo'], Chave> = {
  'preferencias.gravar': 'tecnico.operacao.preferencias_gravar',
  'ativo.cadastrar': 'tecnico.operacao.ativo_cadastrar',
  'ativo.alterar': 'tecnico.operacao.ativo_alterar',
};

/** Motivo pelo catálogo (erro.<codigo>); código desconhecido aparece como está. */
export function useMotivo(): (codigo: string) => string {
  const intl = useIntl();
  const t = useT();
  return (codigo) =>
    `erro.${codigo}` in intl.messages
      ? intl.formatMessage({ id: `erro.${codigo}` })
      : t('tecnico.rejeitada.codigo_desconhecido', { codigo });
}

export function FilaDoDia(props: {
  idioma: IdiomaDeExibicao;
  online: boolean;
  fila: EstadoDaFila;
  aoTrocarIdioma: (idioma: IdiomaDeExibicao) => void;
  aoEnviarAgora: () => void;
  aoDispensar: (chave: string) => void;
  aoAbrirAtivos: () => void;
  aoSair: () => void;
}) {
  const t = useT();
  const motivo = useMotivo();
  return (
    <main className="cartao">
      <header className="linha">
        <strong>{t('tecnico.nome')}</strong>
        <button onClick={props.aoSair}>{t('inicio.sair')}</button>
      </header>

      <p role="status" className={props.online ? 'online' : 'offline'}>
        {props.online ? t('tecnico.rede.online') : t('tecnico.rede.offline')}
      </p>

      <section className="linha">
        <span>{t('tecnico.sincronizacao.pendentes', { n: props.fila.pendentes })}</span>
        {props.fila.pendentes > 0 && props.online && (
          <button onClick={props.aoEnviarAgora}>{t('tecnico.sincronizacao.enviar_agora')}</button>
        )}
      </section>

      {props.fila.rejeitadas.length > 0 && (
        <section role="alert">
          <h2>{t('tecnico.sincronizacao.rejeitadas', { n: props.fila.rejeitadas.length })}</h2>
          <ul>
            {props.fila.rejeitadas.map((r) => (
              <li key={r.chave} className="linha" data-codigo={r.codigo}>
                <span>
                  {t('tecnico.rejeitada.item', {
                    operacao: t(ROTULO_DA_OPERACAO[r.tipo]),
                    motivo: motivo(r.codigo),
                  })}
                </span>
                <button onClick={() => props.aoDispensar(r.chave)}>
                  {t('tecnico.rejeitada.dispensar')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <label className="linha">
        {t('comum.idioma')}
        <select
          value={props.idioma}
          onChange={(e) => props.aoTrocarIdioma(e.target.value as IdiomaDeExibicao)}
        >
          {opcoesDeIdioma().map((i) => (
            <option key={i} value={i}>
              {nomeDoIdioma(i)}
            </option>
          ))}
        </select>
      </label>

      <button onClick={props.aoAbrirAtivos}>{t('tecnico.ativos.abrir')}</button>

      <section>
        <h2>{t('tecnico.fila.titulo')}</h2>
        <p>{t('tecnico.fila.vazia')}</p>
      </section>
    </main>
  );
}
