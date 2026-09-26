// Fila do dia (F0-11): vazia até a fase 1a, quando as OS chegam. A tela já
// mostra o estado da rede e da fila offline, e o seletor de idioma é a
// operação de exemplo: funciona sem rede e sincroniza quando ela volta.
import type { IdiomaDeExibicao } from '@hubkeep/i18n';
import { nomeDoIdioma, opcoesDeIdioma, useT } from '../i18n';

export interface EstadoDaFila {
  pendentes: number;
  rejeitadas: number;
}

export function FilaDoDia(props: {
  idioma: IdiomaDeExibicao;
  online: boolean;
  fila: EstadoDaFila;
  aoTrocarIdioma: (idioma: IdiomaDeExibicao) => void;
  aoEnviarAgora: () => void;
  aoSair: () => void;
}) {
  const t = useT();
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
      {props.fila.rejeitadas > 0 && (
        <p role="alert">{t('tecnico.sincronizacao.rejeitadas', { n: props.fila.rejeitadas })}</p>
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

      <section>
        <h2>{t('tecnico.fila.titulo')}</h2>
        <p>{t('tecnico.fila.vazia')}</p>
      </section>
    </main>
  );
}
