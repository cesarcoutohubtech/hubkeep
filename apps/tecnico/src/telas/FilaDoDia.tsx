// Fila do dia (F0-11; OS na C4b): as OS do técnico e das equipes dele, como
// estão no aparelho (a última leitura da API, com o que ele fez sem rede por
// cima; os/projecao.ts). A tela mostra o estado da rede e da fila offline, e
// o seletor de idioma, que funciona sem rede e sincroniza quando ela volta.
// Operação recusada pelo servidor aparece aqui, com o motivo pelo código de
// erro da API, até o técnico dispensar (ADR-025, ajuste (c)).
import type { EstadoDaOs } from '@hubkeep/dominio';
import type { Chave, IdiomaDeExibicao } from '@hubkeep/i18n';
import { useIntl } from 'react-intl';
import type { OperacaoNaFila } from '../fila/banco';
import { nomeDoIdioma, opcoesDeIdioma, useT } from '../i18n';
import type { OsNoAparelho } from '../os/projecao';

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
  'chamado.abrir': 'tecnico.operacao.chamado_abrir',
  'os.iniciar': 'tecnico.operacao.os_iniciar',
  'os.pausar': 'tecnico.operacao.os_pausar',
  'os.retomar': 'tecnico.operacao.os_retomar',
  'os.concluir': 'tecnico.operacao.os_concluir',
  'os.apontar_horas': 'tecnico.operacao.os_apontar_horas',
  'os.registrar_material': 'tecnico.operacao.os_registrar_material',
  'anexo.foto': 'tecnico.operacao.anexo_foto',
};

/** Rótulo do estado canônico da OS, o mesmo das situações padrão. */
export const rotuloDoEstado = (estado: EstadoDaOs): Chave => `situacao.padrao.os_${estado}`;

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
  /** null: ainda não há fila do dia no aparelho (nunca entrou com rede). */
  os: OsNoAparelho[] | null;
  /** Quando a fila do dia foi lida da API (milissegundos desde 1970). */
  lidaEm: number | null;
  aoAbrirOs: (osId: string) => void;
  aoTrocarIdioma: (idioma: IdiomaDeExibicao) => void;
  aoEnviarAgora: () => void;
  aoDispensar: (chave: string) => void;
  aoAbrirAtivos: () => void;
  aoAbrirChamado: () => void;
  aoSair: () => void;
}) {
  const t = useT();
  const intl = useIntl();
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
      <button onClick={props.aoAbrirChamado}>{t('tecnico.chamado.abrir')}</button>

      <section>
        <h2>{t('tecnico.fila.titulo')}</h2>
        {props.os === null && <p>{t('tecnico.fila.sem_leitura')}</p>}
        {props.os?.length === 0 && <p>{t('tecnico.fila.vazia')}</p>}
        {props.os && props.os.length > 0 && (
          <ul>
            {props.os.map((o) => (
              <li key={o.id} data-estado={o.estado}>
                <button className="coluna" onClick={() => props.aoAbrirOs(o.id)}>
                  <span>
                    {t('tecnico.fila.item', {
                      local: o.chamado.localNome,
                      descricao: o.chamado.descricao,
                    })}
                  </span>
                  <small>{t(rotuloDoEstado(o.estado))}</small>
                  {o.pendentes > 0 && (
                    <small>{t('tecnico.os.pendentes', { n: o.pendentes })}</small>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {props.lidaEm !== null && (
          <p>
            <small>
              {t('tecnico.fila.lida_em', {
                quando: intl.formatDate(props.lidaEm, { dateStyle: 'short', timeStyle: 'short' }),
              })}
            </small>
          </p>
        )}
      </section>
    </main>
  );
}
