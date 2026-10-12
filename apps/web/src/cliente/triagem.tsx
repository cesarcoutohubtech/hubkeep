'use client';
// Triagem e atribuição no detalhe do chamado (fase 1a, depois da C7; Cesar,
// 30/09/2026): triar, ajustar a prioridade, gerar a OS para um Técnico ou uma
// equipe do hotel, reatribuir e cancelar a OS, e cancelar o chamado, pelas
// rotas da C3. Só apresentação: qual formulário aparece em cada estado sai das
// tabelas de transição do domínio, e quem pode é decidido pela API (a recusa
// volta como código e aparece traduzida, como no aceite). A lista de pessoas é
// a de membros ativos que a rota das equipes do hotel já devolve; quem não é
// Técnico do hotel é recusado pela API (responsavel_sem_papel_tecnico).
//
// Na I4: quem executa a OS (a equipe interna ou um fornecedor ativo do grupo),
// escolhido ao gerar e corrigido até a conclusão, e o impacto no hóspede,
// corrigido até o aceite.
import {
  ESTADOS_COM_EXECUTOR_AJUSTAVEL,
  ESTADOS_COM_IMPACTO_AJUSTAVEL,
  ESTADOS_COM_PRIORIDADE_AJUSTAVEL,
  TRANSICOES_DA_OS,
  TRANSICOES_DO_CHAMADO,
} from '@hubkeep/dominio';
import { AreaDeTexto, Botao, Campo, Painel, Selecao } from '@hubkeep/ui';
import { type FormEvent, useState } from 'react';
import {
  type DetalheDoChamado,
  type OsDoChamado,
  type Referencias,
  chaveDoImpacto,
  useNomes,
} from './corretiva';
import { useT } from '../i18n/cliente';

/** Quem pode receber a OS, como GET /api/v1/hoteis/{id}/equipes devolve. */
export interface CandidatosAResponsavel {
  equipes: { id: string; nome: string; ativa: boolean }[];
  /** Só os Técnicos do hotel: a API recusa qualquer outra pessoa. */
  tecnicos: { usuarioId: string; nome: string }[];
}

export type Responsavel =
  { tipo: 'tecnico'; usuarioId: string } | { tipo: 'equipe'; equipeId: string };

/** Fornecedor do grupo, como GET /api/v1/fornecedores devolve (I3). */
export interface FornecedorParaEscolha {
  id: string;
  nome: string;
  ativo: boolean;
}

/** Quem executa a OS (I4), como as rotas recebem. */
export type Execucao =
  { executadoPor: 'equipe_interna' } | { executadoPor: 'fornecedor'; fornecedorId: string };

/** Valor da opção do seletor de quem executa: `equipe_interna` ou `fornecedor:<id>`. */
export function execucaoDoValor(valor: string): Execucao | null {
  if (valor === 'equipe_interna') return { executadoPor: 'equipe_interna' };
  const [tipo, id] = valor.split(':');
  return tipo === 'fornecedor' && id ? { executadoPor: 'fornecedor', fornecedorId: id } : null;
}

const valorDaExecucao = (o: OsDoChamado): string =>
  o.executadoPor === 'fornecedor' && o.fornecedorId
    ? `fornecedor:${o.fornecedorId}`
    : 'equipe_interna';

/** O que a página faz com cada formulário: a rota e o corpo, na versão vista. */
export interface AcoesDaTriagem {
  triar: (prioridadeId: string | null) => void;
  priorizar: (prioridadeId: string) => void;
  gerarOs: (responsavel: Responsavel, execucao: Execucao) => void;
  cancelarChamado: (motivo: string) => void;
  /** Afeta hóspede? null: não sei (I4). */
  informarImpacto: (impacto: boolean | null) => void;
  definirExecutor: (os: OsDoChamado, execucao: Execucao) => void;
  reatribuirOs: (os: OsDoChamado, responsavel: Responsavel) => void;
  cancelarOs: (os: OsDoChamado, motivo: string) => void;
}

/** Valor da opção do seletor de responsável: `tecnico:<id>` ou `equipe:<id>`. */
export function responsavelDoValor(valor: string): Responsavel | null {
  const [tipo, id] = valor.split(':');
  if (!id) return null;
  if (tipo === 'tecnico') return { tipo: 'tecnico', usuarioId: id };
  if (tipo === 'equipe') return { tipo: 'equipe', equipeId: id };
  return null;
}

const vale = (estados: readonly string[], estado: string) => estados.includes(estado);

/** As ações que o estado permite; o papel é conferido pela API. */
export function acoesPossiveis(detalhe: DetalheDoChamado) {
  const estado = detalhe.chamado.estado;
  return {
    triar: vale(TRANSICOES_DO_CHAMADO.triar.de, estado),
    // No chamado aberto, a prioridade vai junto com a triagem (um formulário só).
    priorizar: vale(ESTADOS_COM_PRIORIDADE_AJUSTAVEL, estado) && estado !== 'aberto',
    gerarOs: vale(TRANSICOES_DA_OS.gerar.chamado?.de ?? [], estado),
    cancelarChamado: vale(TRANSICOES_DO_CHAMADO.cancelar.de, estado),
    osReatribuiveis: detalhe.os.filter((o) => vale(TRANSICOES_DA_OS.reatribuir.de, o.estado)),
    osCancelaveis: detalhe.os.filter((o) => vale(TRANSICOES_DA_OS.cancelar.de, o.estado)),
    impacto: vale(ESTADOS_COM_IMPACTO_AJUSTAVEL, estado),
    osComExecutorAjustavel: detalhe.os.filter((o) =>
      vale(ESTADOS_COM_EXECUTOR_AJUSTAVEL, o.estado),
    ),
  };
}

function SeletorDePrioridade(props: {
  refs: Referencias | null;
  valor: string;
  aoMudar: (v: string) => void;
  opcional: boolean;
}) {
  const t = useT();
  const nomes = useNomes(props.refs);
  const ativas = (props.refs?.corretiva.prioridades ?? []).filter((p) => p.ativa);
  return (
    <Campo rotulo={t('corretiva.triagem.prioridade')}>
      {(c) => (
        <Selecao {...c} value={props.valor} onChange={(e) => props.aoMudar(e.target.value)}>
          <option value="">
            {props.opcional
              ? t('corretiva.triagem.manter_prioridade')
              : t('corretiva.triagem.escolha')}
          </option>
          {ativas.map((p) => (
            <option key={p.id} value={p.id}>
              {nomes.prioridade(p.id)}
            </option>
          ))}
        </Selecao>
      )}
    </Campo>
  );
}

function SeletorDeResponsavel(props: {
  candidatos: CandidatosAResponsavel | null;
  valor: string;
  aoMudar: (v: string) => void;
}) {
  const t = useT();
  const pessoas = props.candidatos?.tecnicos ?? [];
  const equipes = (props.candidatos?.equipes ?? []).filter((e) => e.ativa);
  if (pessoas.length === 0 && equipes.length === 0) {
    return <p className="hk-suave">{t('corretiva.triagem.sem_candidatos')}</p>;
  }
  return (
    <Campo
      rotulo={t('corretiva.triagem.responsavel')}
      ajuda={t('corretiva.triagem.dica_responsavel')}
    >
      {(c) => (
        <Selecao {...c} value={props.valor} onChange={(e) => props.aoMudar(e.target.value)}>
          <option value="">{t('corretiva.triagem.escolha')}</option>
          {equipes.length > 0 && (
            <optgroup label={t('corretiva.triagem.equipes')}>
              {equipes.map((e) => (
                <option key={e.id} value={`equipe:${e.id}`}>
                  {e.nome}
                </option>
              ))}
            </optgroup>
          )}
          {pessoas.length > 0 && (
            <optgroup label={t('corretiva.triagem.pessoas')}>
              {pessoas.map((p) => (
                <option key={p.usuarioId} value={`tecnico:${p.usuarioId}`}>
                  {p.nome}
                </option>
              ))}
            </optgroup>
          )}
        </Selecao>
      )}
    </Campo>
  );
}

/**
 * Equipe interna ou um fornecedor ativo do grupo. O fornecedor já escolhido e
 * depois desativado continua na lista, para a tela mostrar o que está gravado.
 */
function SeletorDeExecutor(props: {
  fornecedores: FornecedorParaEscolha[] | null;
  valor: string;
  aoMudar: (v: string) => void;
}) {
  const t = useT();
  const opcoes = (props.fornecedores ?? []).filter(
    (f) => f.ativo || props.valor === `fornecedor:${f.id}`,
  );
  return (
    <Campo rotulo={t('corretiva.triagem.executor')} ajuda={t('corretiva.triagem.dica_executor')}>
      {(c) => (
        <Selecao {...c} value={props.valor} onChange={(e) => props.aoMudar(e.target.value)}>
          <option value="equipe_interna">{t('corretiva.triagem.equipe_interna')}</option>
          {opcoes.length > 0 && (
            <optgroup label={t('corretiva.triagem.fornecedores')}>
              {opcoes.map((f) => (
                <option key={f.id} value={`fornecedor:${f.id}`}>
                  {f.nome}
                </option>
              ))}
            </optgroup>
          )}
        </Selecao>
      )}
    </Campo>
  );
}

function Atribuicao(props: {
  candidatos: CandidatosAResponsavel | null;
  rotulo: string;
  aoEnviar: (r: Responsavel) => void;
}) {
  const [valor, setValor] = useState('');
  const escolhido = responsavelDoValor(valor);
  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (escolhido) props.aoEnviar(escolhido);
  }
  return (
    <form onSubmit={enviar}>
      <SeletorDeResponsavel candidatos={props.candidatos} valor={valor} aoMudar={setValor} />
      <Botao type="submit" variante="primario" disabled={!escolhido}>
        {props.rotulo}
      </Botao>
    </form>
  );
}

/** Gerar a OS: o responsável e quem executa (I4; padrão, a equipe interna). */
function Geracao(props: {
  candidatos: CandidatosAResponsavel | null;
  fornecedores: FornecedorParaEscolha[] | null;
  aoEnviar: (r: Responsavel, e: Execucao) => void;
}) {
  const t = useT();
  const [valor, setValor] = useState('');
  const [executor, setExecutor] = useState('equipe_interna');
  const escolhido = responsavelDoValor(valor);
  const execucao = execucaoDoValor(executor);
  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (escolhido && execucao) props.aoEnviar(escolhido, execucao);
  }
  return (
    <form onSubmit={enviar}>
      <SeletorDeResponsavel candidatos={props.candidatos} valor={valor} aoMudar={setValor} />
      <SeletorDeExecutor fornecedores={props.fornecedores} valor={executor} aoMudar={setExecutor} />
      <Botao type="submit" variante="primario" disabled={!escolhido || !execucao}>
        {t('corretiva.triagem.gerar_os')}
      </Botao>
    </form>
  );
}

/** Corrigir quem executa a OS até a conclusão (I4). */
function CorrecaoDoExecutor(props: {
  os: OsDoChamado;
  fornecedores: FornecedorParaEscolha[] | null;
  aoEnviar: (e: Execucao) => void;
}) {
  const t = useT();
  const atual = valorDaExecucao(props.os);
  const [executor, setExecutor] = useState(atual);
  const execucao = execucaoDoValor(executor);
  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (execucao) props.aoEnviar(execucao);
  }
  return (
    <form onSubmit={enviar}>
      <SeletorDeExecutor fornecedores={props.fornecedores} valor={executor} aoMudar={setExecutor} />
      <Botao type="submit" disabled={!execucao || executor === atual}>
        {t('corretiva.triagem.salvar_executor')}
      </Botao>
    </form>
  );
}

/** Afeta hóspede? Sim, não ou não sei (I4), corrigido até o aceite. */
function Impacto(props: { atual: boolean | null; aoEnviar: (impacto: boolean | null) => void }) {
  const t = useT();
  const [valor, setValor] = useState<string>(chaveDoImpacto(props.atual));
  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    props.aoEnviar(valor === 'sim' ? true : valor === 'nao' ? false : null);
  }
  return (
    <form onSubmit={enviar}>
      <Campo rotulo={t('corretiva.triagem.impacto')}>
        {(c) => (
          <Selecao {...c} value={valor} onChange={(e) => setValor(e.target.value)}>
            <option value="sim">{t('corretiva.impacto.sim')}</option>
            <option value="nao">{t('corretiva.impacto.nao')}</option>
            <option value="nao_informado">{t('corretiva.impacto.nao_sei')}</option>
          </Selecao>
        )}
      </Campo>
      <Botao type="submit" disabled={valor === chaveDoImpacto(props.atual)}>
        {t('corretiva.triagem.salvar_impacto')}
      </Botao>
    </form>
  );
}

function Cancelamento(props: { rotulo: string; aoEnviar: (motivo: string) => void }) {
  const t = useT();
  const [motivo, setMotivo] = useState('');
  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    props.aoEnviar(motivo);
  }
  return (
    <form onSubmit={enviar}>
      <Campo rotulo={t('corretiva.triagem.motivo')}>
        {(c) => (
          <AreaDeTexto {...c} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
        )}
      </Campo>
      <Botao type="submit" variante="perigo">
        {props.rotulo}
      </Botao>
    </form>
  );
}

function Triar(props: { refs: Referencias | null; aoEnviar: (p: string | null) => void }) {
  const t = useT();
  const [prioridade, setPrioridade] = useState('');
  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    props.aoEnviar(prioridade || null);
  }
  return (
    <form onSubmit={enviar}>
      <SeletorDePrioridade refs={props.refs} valor={prioridade} aoMudar={setPrioridade} opcional />
      <Botao type="submit" variante="primario">
        {t('corretiva.triagem.triar')}
      </Botao>
    </form>
  );
}

function Priorizar(props: { refs: Referencias | null; aoEnviar: (p: string) => void }) {
  const t = useT();
  const [prioridade, setPrioridade] = useState('');
  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (prioridade) props.aoEnviar(prioridade);
  }
  return (
    <form onSubmit={enviar}>
      <SeletorDePrioridade
        refs={props.refs}
        valor={prioridade}
        aoMudar={setPrioridade}
        opcional={false}
      />
      <Botao type="submit" disabled={!prioridade}>
        {t('corretiva.triagem.ajustar_prioridade')}
      </Botao>
    </form>
  );
}

export function TriagemDoChamado(props: {
  detalhe: DetalheDoChamado;
  refs: Referencias | null;
  candidatos: CandidatosAResponsavel | null;
  /** Os fornecedores do grupo (I3), para quem executa; null enquanto carrega ou sem acesso. */
  fornecedores: FornecedorParaEscolha[] | null;
  acoes: AcoesDaTriagem;
}) {
  const t = useT();
  const nomes = useNomes(props.refs);
  const { detalhe, acoes } = props;
  const n = detalhe.nomes;
  const a = acoesPossiveis(detalhe);
  const osComAcao = detalhe.os.filter(
    (o) =>
      a.osReatribuiveis.includes(o) ||
      a.osCancelaveis.includes(o) ||
      a.osComExecutorAjustavel.includes(o),
  );
  const algumaAcao =
    a.triar || a.priorizar || a.gerarOs || a.cancelarChamado || a.impacto || osComAcao.length > 0;
  const responsavel = (o: OsDoChamado) =>
    nomes.nome(
      o.responsavel.tipo === 'tecnico'
        ? n.pessoas[o.responsavel.usuarioId]
        : n.equipes[o.responsavel.equipeId],
    );
  // As chaves com a versão remontam os formulários depois de cada gravação.
  const v = detalhe.chamado.versao;
  return (
    <Painel titulo={t('corretiva.triagem.titulo')}>
      <div className="hk-pilha">
        <p className="hk-suave">{t('corretiva.triagem.descricao')}</p>
        {!algumaAcao && <p className="hk-suave">{t('corretiva.triagem.nada_a_fazer')}</p>}
        {a.triar && (
          <div className="hk-bloco" data-tom="atencao">
            <p className="hk-bloco-titulo">{t('corretiva.triagem.triar')}</p>
            <Triar key={`triar-${v}`} refs={props.refs} aoEnviar={acoes.triar} />
          </div>
        )}
        {a.priorizar && (
          <div className="hk-bloco">
            <p className="hk-bloco-titulo">{t('corretiva.triagem.ajustar_prioridade')}</p>
            <Priorizar key={`priorizar-${v}`} refs={props.refs} aoEnviar={acoes.priorizar} />
          </div>
        )}
        {a.gerarOs && (
          <div className="hk-bloco" data-tom="atencao">
            <p className="hk-bloco-titulo">{t('corretiva.triagem.gerar_os')}</p>
            <Geracao
              key={`gerar-${v}`}
              candidatos={props.candidatos}
              fornecedores={props.fornecedores}
              aoEnviar={acoes.gerarOs}
            />
          </div>
        )}
        {a.impacto && (
          <div className="hk-bloco">
            <p className="hk-bloco-titulo">{t('corretiva.triagem.impacto')}</p>
            <Impacto
              key={`impacto-${v}`}
              atual={detalhe.chamado.impactoHospede}
              aoEnviar={acoes.informarImpacto}
            />
          </div>
        )}
        {osComAcao.map((o) => (
          <div key={`${o.id}-${o.versao}`} className="hk-bloco">
            <p className="hk-bloco-titulo">
              {t('corretiva.triagem.os', {
                situacao: nomes.situacao(o.situacaoId),
                nome: responsavel(o),
              })}
            </p>
            {a.osReatribuiveis.includes(o) && (
              <Atribuicao
                candidatos={props.candidatos}
                rotulo={t('corretiva.triagem.reatribuir')}
                aoEnviar={(r) => acoes.reatribuirOs(o, r)}
              />
            )}
            {a.osComExecutorAjustavel.includes(o) && (
              <CorrecaoDoExecutor
                os={o}
                fornecedores={props.fornecedores}
                aoEnviar={(e) => acoes.definirExecutor(o, e)}
              />
            )}
            {a.osCancelaveis.includes(o) && (
              <>
                <p className="hk-suave">{t('corretiva.triagem.cancelar_os_descricao')}</p>
                <Cancelamento
                  rotulo={t('corretiva.triagem.cancelar_os')}
                  aoEnviar={(motivo) => acoes.cancelarOs(o, motivo)}
                />
              </>
            )}
          </div>
        ))}
        {a.cancelarChamado && (
          <div className="hk-bloco">
            <p className="hk-bloco-titulo">{t('corretiva.triagem.cancelar_chamado')}</p>
            <Cancelamento
              key={`cancelar-${v}`}
              rotulo={t('corretiva.triagem.cancelar_chamado')}
              aoEnviar={acoes.cancelarChamado}
            />
          </div>
        )}
      </div>
    </Painel>
  );
}
