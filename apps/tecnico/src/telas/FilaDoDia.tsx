// Fila do dia (F0-11; OS na C4b): as OS do técnico e das equipes dele, como
// estão no aparelho (a última leitura da API, com o que ele fez sem rede por
// cima; os/projecao.ts). A tela mostra o estado da rede e da fila offline, e
// o seletor de idioma, que funciona sem rede e sincroniza quando ela volta,
// e os avisos neste aparelho (o push, 1c).
// Operação recusada pelo servidor aparece aqui, com o motivo pelo código de
// erro da API, até o técnico dispensar (ADR-025, ajuste (c)).
import type { EstadoDaOs } from '@hubkeep/dominio';
import type { Chave, IdiomaDeExibicao } from '@hubkeep/i18n';
import {
  Botao,
  Campo,
  MensagemDeErro,
  MensagemVazia,
  Selecao,
  Selo,
  type TomDeSelo,
} from '@hubkeep/ui';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import type { OperacaoNaFila } from '../fila/banco';
import { nomeDoIdioma, opcoesDeIdioma, useT } from '../i18n';
import type { OsNoAparelho } from '../os/projecao';
import { FaixaDaRede, TelaDoTecnico } from './TelaDoTecnico';
import { nomeDoLocal } from '../locais';

export interface OperacaoRecusada {
  chave: string;
  tipo: OperacaoNaFila['tipo'];
  /** Código de erro da API (ex.: fuso_invalido) ou entrada_invalida, se recusada no aparelho. */
  codigo: string;
}

export interface EstadoDaFila {
  pendentes: number;
  rejeitadas: OperacaoRecusada[];
  /** Criação da pendente mais velha, se passou de um dia (armazenamento.ts); senão null. */
  antigaDesde?: number | null;
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
  'os.registrar_parada': 'tecnico.operacao.os_registrar_parada',
  'os.encerrar_parada': 'tecnico.operacao.os_encerrar_parada',
  'os.responder_checklist': 'tecnico.operacao.os_responder_checklist',
  'anexo.foto': 'tecnico.operacao.anexo_foto',
};

/** Cor do selo pelo estado canônico da OS: azul andando, âmbar pausada, verde fechada. */
export const TOM_DO_ESTADO: Record<EstadoDaOs, TomDeSelo> = {
  atribuida: 'cinza',
  em_execucao: 'azul',
  pausada: 'ambar',
  concluida: 'verde',
  aceita: 'verde',
  cancelada: 'cinza',
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
  /** Os avisos neste aparelho (AvisosNoAparelho), acima do idioma. */
  avisos?: ReactNode;
}) {
  const t = useT();
  const intl = useIntl();
  const motivo = useMotivo();
  return (
    <TelaDoTecnico
      titulo={t('tecnico.fila.titulo')}
      subtitulo={t('tecnico.nome')}
      acao={
        <Botao tamanho="pequeno" onClick={props.aoSair}>
          {t('inicio.sair')}
        </Botao>
      }
      faixa={
        <FaixaDaRede online={props.online}>
          <p role="status">{props.online ? t('tecnico.rede.online') : t('tecnico.rede.offline')}</p>
          <span>{t('tecnico.sincronizacao.pendentes', { n: props.fila.pendentes })}</span>
          {props.fila.pendentes > 0 && props.online && (
            <Botao tamanho="pequeno" onClick={props.aoEnviarAgora}>
              {t('tecnico.sincronizacao.enviar_agora')}
            </Botao>
          )}
        </FaixaDaRede>
      }
    >
      {props.fila.antigaDesde != null && (
        <MensagemDeErro>
          <span data-aviso="pendencia_antiga">
            {t('tecnico.sincronizacao.antiga', {
              desde: intl.formatDate(props.fila.antigaDesde, {
                dateStyle: 'short',
                timeStyle: 'short',
              }),
            })}
          </span>
        </MensagemDeErro>
      )}

      {props.fila.rejeitadas.length > 0 && (
        <MensagemDeErro
          titulo={t('tecnico.sincronizacao.rejeitadas', { n: props.fila.rejeitadas.length })}
        >
          <ul className="tc-lista">
            {props.fila.rejeitadas.map((r) => (
              <li key={r.chave} className="linha" data-codigo={r.codigo}>
                <span>
                  {t('tecnico.rejeitada.item', {
                    operacao: t(ROTULO_DA_OPERACAO[r.tipo]),
                    motivo: motivo(r.codigo),
                  })}
                </span>
                <Botao tamanho="pequeno" onClick={() => props.aoDispensar(r.chave)}>
                  {t('tecnico.rejeitada.dispensar')}
                </Botao>
              </li>
            ))}
          </ul>
        </MensagemDeErro>
      )}

      <div className="tc-lado-a-lado">
        <Botao variante="primario" onClick={props.aoAbrirChamado}>
          {t('tecnico.chamado.abrir')}
        </Botao>
        <Botao onClick={props.aoAbrirAtivos}>{t('tecnico.ativos.abrir')}</Botao>
      </div>

      <section>
        {props.os === null && <MensagemVazia>{t('tecnico.fila.sem_leitura')}</MensagemVazia>}
        {props.os?.length === 0 && <MensagemVazia>{t('tecnico.fila.vazia')}</MensagemVazia>}
        {props.os && props.os.length > 0 && (
          <ul className="tc-lista">
            {props.os.map((o) => (
              <li key={o.id} data-estado={o.estado}>
                <button className="tc-cartao" onClick={() => props.aoAbrirOs(o.id)}>
                  <span className="tc-cartao-titulo">
                    {t('tecnico.fila.item', {
                      local: nomeDoLocal(t, {
                        nome: o.chamado.localNome,
                        edificacao: o.chamado.localEdificacao,
                      }),
                      descricao: o.chamado.descricao,
                    })}
                  </span>
                  <span className="tc-cartao-rodape">
                    <Selo tom={TOM_DO_ESTADO[o.estado]}>{t(rotuloDoEstado(o.estado))}</Selo>
                    {o.pendentes > 0 && (
                      <span>{t('tecnico.os.pendentes', { n: o.pendentes })}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {props.lidaEm !== null && (
        <p className="tc-nota">
          {t('tecnico.fila.lida_em', {
            quando: intl.formatDate(props.lidaEm, { dateStyle: 'short', timeStyle: 'short' }),
          })}
        </p>
      )}

      {props.avisos}
      <SeletorDeIdioma idioma={props.idioma} aoTrocar={props.aoTrocarIdioma} />
    </TelaDoTecnico>
  );
}

/** Seletor de idioma do PWA: funciona sem rede e sincroniza quando ela volta. */
function SeletorDeIdioma(props: {
  idioma: IdiomaDeExibicao;
  aoTrocar: (idioma: IdiomaDeExibicao) => void;
}) {
  const t = useT();
  return (
    <Campo rotulo={t('comum.idioma')}>
      {(p) => (
        <Selecao
          {...p}
          value={props.idioma}
          onChange={(e) => props.aoTrocar(e.target.value as IdiomaDeExibicao)}
        >
          {opcoesDeIdioma().map((i) => (
            <option key={i} value={i}>
              {nomeDoIdioma(i)}
            </option>
          ))}
        </Selecao>
      )}
    </Campo>
  );
}
