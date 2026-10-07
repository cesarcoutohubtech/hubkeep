'use client';
// Triagem e atribuição no detalhe do chamado (fase 1a, depois da C7; Cesar,
// 30/09/2026): triar, ajustar a prioridade, gerar a OS para um Técnico ou uma
// equipe do hotel, reatribuir e cancelar a OS, e cancelar o chamado, pelas
// rotas da C3. Só apresentação: qual formulário aparece em cada estado sai das
// tabelas de transição do domínio, e quem pode é decidido pela API (a recusa
// volta como código e aparece traduzida, como no aceite). A lista de pessoas é
// a de membros ativos que a rota das equipes do hotel já devolve; quem não é
// Técnico do hotel é recusado pela API (responsavel_sem_papel_tecnico).
import {
  ESTADOS_COM_PRIORIDADE_AJUSTAVEL,
  TRANSICOES_DA_OS,
  TRANSICOES_DO_CHAMADO,
} from '@hubkeep/dominio';
import { AreaDeTexto, Botao, Campo, Painel, Selecao } from '@hubkeep/ui';
import { type FormEvent, useState } from 'react';
import { type DetalheDoChamado, type OsDoChamado, type Referencias, useNomes } from './corretiva';
import { useT } from '../i18n/cliente';

/** Quem pode receber a OS, como GET /api/v1/hoteis/{id}/equipes devolve. */
export interface CandidatosAResponsavel {
  equipes: { id: string; nome: string; ativa: boolean }[];
  disponiveis: { usuarioId: string; nome: string }[];
}

export type Responsavel =
  { tipo: 'tecnico'; usuarioId: string } | { tipo: 'equipe'; equipeId: string };

/** O que a página faz com cada formulário: a rota e o corpo, na versão vista. */
export interface AcoesDaTriagem {
  triar: (prioridadeId: string | null) => void;
  priorizar: (prioridadeId: string) => void;
  gerarOs: (responsavel: Responsavel) => void;
  cancelarChamado: (motivo: string) => void;
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
  const pessoas = props.candidatos?.disponiveis ?? [];
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
  acoes: AcoesDaTriagem;
}) {
  const t = useT();
  const nomes = useNomes(props.refs);
  const { detalhe, acoes } = props;
  const n = detalhe.nomes;
  const a = acoesPossiveis(detalhe);
  const osComAcao = detalhe.os.filter(
    (o) => a.osReatribuiveis.includes(o) || a.osCancelaveis.includes(o),
  );
  const algumaAcao =
    a.triar || a.priorizar || a.gerarOs || a.cancelarChamado || osComAcao.length > 0;
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
            <Atribuicao
              key={`gerar-${v}`}
              candidatos={props.candidatos}
              rotulo={t('corretiva.triagem.gerar_os')}
              aoEnviar={acoes.gerarOs}
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
