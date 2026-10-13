'use client';
// Blocos da tela das políticas do SLA (fase 1c; ADR-042 e ADR-043): os prazos
// por prioridade, as exceções por categoria de ativo, a pausa, o ponto
// facultativo e a meta (chamado.sla), o horário de atendimento
// (hotel.horario_atendimento) e os avisos do monitor (chamado.escalonamento).
// Só apresentação: a página carrega e grava; o formulário vira valor em
// politicas-sla.ts, e quem valida é o domínio, pela API.
import {
  DESTINATARIOS_DO_AVISO,
  DIAS_DA_SEMANA,
  type EscalonamentoDeSla,
  type HorarioDeAtendimento,
  LIMITES_DO_ESCALONAMENTO,
  LIMITES_DO_SLA,
  MOTIVOS_DE_PAUSA,
  type PoliticaDeSla,
  RELOGIOS_DE_SLA,
} from '@hubkeep/dominio';
import type { Chave } from '@hubkeep/i18n';
import {
  Botao,
  Campo,
  Entrada,
  MensagemVazia,
  Selecao,
  Selo,
  Tabela,
  type TomDeSelo,
} from '@hubkeep/ui';
import type { FormEvent, ReactNode } from 'react';
import { useT } from '../i18n/cliente';
import {
  INTERVALOS_POR_DIA,
  escalonamentoDoFormulario,
  horarioDoFormulario,
  slaDoFormulario,
} from './politicas-sla';

export type Origem = 'hotel' | 'bandeira' | 'grupo' | 'padrao';
export type EscopoDoBotao = 'grupo' | 'bandeira' | 'hotel';
interface Resolvida<C extends string, V> {
  chave: C;
  padrao: V;
  grupo: V | null;
  bandeira: V | null;
  hotel: V | null;
  efetiva: V;
  origem: Origem;
}
/** As três políticas do SLA, como GET /api/v1/configuracao devolve. */
export type PoliticaDoSla =
  | Resolvida<'chamado.sla', PoliticaDeSla>
  | Resolvida<'hotel.horario_atendimento', HorarioDeAtendimento>
  | Resolvida<'chamado.escalonamento', EscalonamentoDeSla>;
export type ChaveDoSla = PoliticaDoSla['chave'];

/** Uma prioridade ou categoria ativa, com o nome já resolvido no idioma. */
export interface ItemComNome {
  id: string;
  chavePadrao: string | null;
  nome: string;
}

const TOM_DA_ORIGEM: Record<Origem, TomDeSelo> = {
  hotel: 'azul',
  bandeira: 'azul',
  grupo: 'azul',
  padrao: 'cinza',
};

/** O escopo pelo botão que enviou o formulário (value="hotel", "bandeira" ou "grupo"). */
const escopoDoEnvio = (ev: FormEvent<HTMLFormElement>): EscopoDoBotao => {
  const v = (ev.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
  return v === 'hotel' || v === 'bandeira' ? v : 'grupo';
};

/** Passo das horas no formulário: 15 minutos, como o domínio exige. */
const PASSO_DAS_HORAS = 0.25;
/** HH:MM de 00:00 a 23:59; o fim também aceita 24:00, como o domínio. */
const PADRAO_DO_INICIO = '([01][0-9]|2[0-3]):[0-5][0-9]';
const PADRAO_DO_FIM = `${PADRAO_DO_INICIO}|24:00`;

export function BlocosDoSla(props: {
  sla: Extract<PoliticaDoSla, { chave: 'chamado.sla' }> | undefined;
  horario: Extract<PoliticaDoSla, { chave: 'hotel.horario_atendimento' }> | undefined;
  escalonamento: Extract<PoliticaDoSla, { chave: 'chamado.escalonamento' }> | undefined;
  /** As prioridades ativas do tenant. */
  prioridades: readonly ItemComNome[];
  /** As categorias de ativo ativas do grupo. */
  categorias: readonly ItemComNome[];
  /** Com o hotel escolhido, os botões do hotel; com bandeira, também os da bandeira. */
  temHotel: boolean;
  temBandeira: boolean;
  aoGravar: (chave: ChaveDoSla, escopo: EscopoDoBotao, valor: unknown) => void;
}) {
  const t = useT();
  const { sla, horario, escalonamento, prioridades, categorias, aoGravar } = props;

  const origem = (p: PoliticaDoSla) => (
    <Selo tom={TOM_DA_ORIGEM[p.origem]}>
      {t('admin.configuracao.origem', { origem: p.origem })}
    </Selo>
  );
  const botoesDeGravar = (
    <div className="hk-linha-de-botoes">
      <Botao type="submit" value="grupo" variante="primario">
        {t('admin.configuracao.acao.gravar_grupo')}
      </Botao>
      {props.temHotel && (
        <Botao type="submit" value="hotel">
          {t('admin.configuracao.acao.gravar_hotel')}
        </Botao>
      )}
      {props.temBandeira && (
        <Botao type="submit" value="bandeira">
          {t('admin.configuracao.acao.gravar_bandeira')}
        </Botao>
      )}
    </div>
  );
  const herdar = (p: PoliticaDoSla) =>
    (p.grupo || p.bandeira || p.hotel) && (
      <div className="hk-linha-de-botoes">
        {p.grupo && (
          <Botao tamanho="pequeno" onClick={() => aoGravar(p.chave, 'grupo', null)}>
            {t('admin.configuracao.acao.herdar_grupo')}
          </Botao>
        )}
        {p.hotel && (
          <Botao tamanho="pequeno" onClick={() => aoGravar(p.chave, 'hotel', null)}>
            {t('admin.configuracao.acao.herdar_hotel')}
          </Botao>
        )}
        {p.bandeira && (
          <Botao tamanho="pequeno" onClick={() => aoGravar(p.chave, 'bandeira', null)}>
            {t('admin.configuracao.acao.herdar_bandeira')}
          </Botao>
        )}
      </div>
    );
  const bloco = (titulo: string, dica: string, p: PoliticaDoSla, conteudo: ReactNode) => (
    <section key={JSON.stringify(p)} className="hk-bloco" data-politica={p.chave}>
      <h3 className="hk-bloco-titulo">{titulo}</h3>
      <div className="hk-linha-de-botoes">
        <span className="hk-suave">{dica}</span>
        {origem(p)}
      </div>
      {conteudo}
      {herdar(p)}
    </section>
  );
  const horas = (nome: string, rotulo: string, valor: number | undefined) => (
    <Entrada
      type="number"
      name={nome}
      aria-label={rotulo}
      min={PASSO_DAS_HORAS}
      max={LIMITES_DO_SLA.horas}
      step={PASSO_DAS_HORAS}
      defaultValue={valor ?? ''}
    />
  );
  const relogio = (nome: string, rotulo: string, valor: string | undefined, opcional: boolean) => (
    <Selecao name={nome} aria-label={rotulo} defaultValue={valor ?? ''}>
      {opcional && <option value="">{t('admin.sla.relogio_da_prioridade')}</option>}
      {RELOGIOS_DE_SLA.map((r) => (
        <option key={r} value={r}>
          {t('admin.sla.relogio', { relogio: r })}
        </option>
      ))}
    </Selecao>
  );
  const rotulo = (nome: string, campo: Chave) => `${nome}: ${t(campo)}`;

  return (
    <>
      {sla &&
        bloco(
          t('admin.sla.prazos.titulo'),
          t('admin.sla.prazos.dica'),
          sla,
          <form
            className="hk-pilha"
            onSubmit={(ev) => {
              ev.preventDefault();
              aoGravar(
                'chamado.sla',
                escopoDoEnvio(ev),
                slaDoFormulario(
                  new FormData(ev.currentTarget),
                  sla.efetiva,
                  prioridades,
                  categorias,
                ),
              );
            }}
          >
            <Tabela legenda={t('admin.sla.prazos.titulo')}>
              <thead>
                <tr>
                  <th scope="col">{t('admin.sla.campo.prioridade')}</th>
                  <th scope="col">{t('admin.sla.campo.atendimento')}</th>
                  <th scope="col">{t('admin.sla.campo.solucao')}</th>
                  <th scope="col">{t('admin.sla.campo.relogio')}</th>
                </tr>
              </thead>
              <tbody>
                {prioridades.map((p) => {
                  const linha =
                    sla.efetiva.porPrioridade[p.id] ??
                    (p.chavePadrao ? sla.efetiva.porPrioridade[p.chavePadrao] : undefined);
                  return (
                    <tr key={p.id} data-prioridade={p.id}>
                      <th scope="row">{p.nome}</th>
                      <td>
                        {horas(
                          `prioridade.${p.id}.atendimento`,
                          rotulo(p.nome, 'admin.sla.campo.atendimento'),
                          linha?.atendimentoHoras,
                        )}
                      </td>
                      <td>
                        {horas(
                          `prioridade.${p.id}.solucao`,
                          rotulo(p.nome, 'admin.sla.campo.solucao'),
                          linha?.solucaoHoras,
                        )}
                      </td>
                      <td>
                        {relogio(
                          `prioridade.${p.id}.relogio`,
                          rotulo(p.nome, 'admin.sla.campo.relogio'),
                          linha?.relogio ?? 'atendimento',
                          false,
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabela>

            <h4 className="hk-bloco-titulo">{t('admin.sla.categorias.titulo')}</h4>
            <p className="hk-suave">{t('admin.sla.categorias.dica')}</p>
            {categorias.length === 0 ? (
              <MensagemVazia>{t('admin.sla.categorias.vazio')}</MensagemVazia>
            ) : (
              <Tabela legenda={t('admin.sla.categorias.titulo')}>
                <thead>
                  <tr>
                    <th scope="col">{t('admin.sla.campo.categoria')}</th>
                    <th scope="col">{t('admin.sla.campo.atendimento')}</th>
                    <th scope="col">{t('admin.sla.campo.solucao')}</th>
                    <th scope="col">{t('admin.sla.campo.relogio')}</th>
                    <th scope="col">{t('admin.sla.campo.pausa')}</th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.map((c) => {
                    const excecao = sla.efetiva.porCategoria[c.id];
                    return (
                      <tr key={c.id} data-categoria={c.id}>
                        <th scope="row">{c.nome}</th>
                        <td>
                          {horas(
                            `categoria.${c.id}.atendimento`,
                            rotulo(c.nome, 'admin.sla.campo.atendimento'),
                            excecao?.atendimentoHoras,
                          )}
                        </td>
                        <td>
                          {horas(
                            `categoria.${c.id}.solucao`,
                            rotulo(c.nome, 'admin.sla.campo.solucao'),
                            excecao?.solucaoHoras,
                          )}
                        </td>
                        <td>
                          {relogio(
                            `categoria.${c.id}.relogio`,
                            rotulo(c.nome, 'admin.sla.campo.relogio'),
                            excecao?.relogio,
                            true,
                          )}
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            name={`categoria.${c.id}.pausa`}
                            aria-label={rotulo(c.nome, 'admin.sla.campo.pausa')}
                            defaultChecked={excecao?.pausa ?? false}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Tabela>
            )}

            <fieldset className="hk-em-linha">
              <legend>{t('admin.sla.pausa.motivos')}</legend>
              {MOTIVOS_DE_PAUSA.map((m) => (
                <label key={m} className="hk-marcar">
                  <input
                    type="checkbox"
                    name={`motivo.${m}`}
                    defaultChecked={sla.efetiva.motivosQuePausam.includes(m)}
                  />
                  {t('os.motivo_pausa', { valor: m })}
                </label>
              ))}
            </fieldset>
            <div className="hk-em-linha">
              <label className="hk-marcar">
                <input
                  type="checkbox"
                  name="pontoFacultativo"
                  defaultChecked={sla.efetiva.pontoFacultativo}
                />
                {t('admin.sla.campo.ponto_facultativo')}
              </label>
              <Campo rotulo={t('admin.sla.campo.meta')}>
                {(c) => (
                  <Entrada
                    {...c}
                    type="number"
                    name="metaPercentual"
                    min={1}
                    max={100}
                    required
                    defaultValue={sla.efetiva.metaPercentual}
                  />
                )}
              </Campo>
            </div>
            {botoesDeGravar}
          </form>,
        )}

      {horario &&
        bloco(
          t('admin.sla.horario.titulo'),
          t('admin.sla.horario.dica'),
          horario,
          <form
            className="hk-pilha"
            onSubmit={(ev) => {
              ev.preventDefault();
              aoGravar(
                'hotel.horario_atendimento',
                escopoDoEnvio(ev),
                horarioDoFormulario(new FormData(ev.currentTarget)),
              );
            }}
          >
            <Tabela legenda={t('admin.sla.horario.titulo')}>
              <thead>
                <tr>
                  <th scope="col">{t('admin.sla.campo.dia')}</th>
                  {Array.from({ length: INTERVALOS_POR_DIA }, (_, i) => (
                    <th key={i} scope="col">
                      {t('admin.sla.campo.intervalo', { numero: i + 1 })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIAS_DA_SEMANA.map((dia) => {
                  const nomeDoDia = t('admin.sla.dia', { dia });
                  return (
                    <tr key={dia} data-dia={dia}>
                      <th scope="row">{nomeDoDia}</th>
                      {Array.from({ length: INTERVALOS_POR_DIA }, (_, i) => {
                        const intervalo = horario.efetiva[dia][i];
                        return (
                          <td key={i}>
                            <div className="hk-em-linha">
                              {(['inicio', 'fim'] as const).map((ponta) => (
                                <Entrada
                                  key={ponta}
                                  name={`horario.${dia}.${i}.${ponta}`}
                                  aria-label={t('admin.sla.campo.ponta', {
                                    dia: nomeDoDia,
                                    numero: i + 1,
                                    ponta,
                                  })}
                                  placeholder={t('admin.sla.campo.formato_hora')}
                                  pattern={ponta === 'fim' ? PADRAO_DO_FIM : PADRAO_DO_INICIO}
                                  inputMode="numeric"
                                  size={5}
                                  defaultValue={intervalo?.[ponta] ?? ''}
                                />
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </Tabela>
            {botoesDeGravar}
          </form>,
        )}

      {escalonamento &&
        bloco(
          t('admin.sla.escalonamento.titulo'),
          t('admin.sla.escalonamento.dica'),
          escalonamento,
          <form
            className="hk-pilha"
            onSubmit={(ev) => {
              ev.preventDefault();
              aoGravar(
                'chamado.escalonamento',
                escopoDoEnvio(ev),
                escalonamentoDoFormulario(new FormData(ev.currentTarget)),
              );
            }}
          >
            <div className="hk-em-linha">
              <Campo rotulo={t('admin.sla.campo.percentual')}>
                {(c) => (
                  <Entrada
                    {...c}
                    type="number"
                    name="percentualDoAviso"
                    min={LIMITES_DO_ESCALONAMENTO.minimo}
                    max={LIMITES_DO_ESCALONAMENTO.maximo}
                    required
                    defaultValue={escalonamento.efetiva.percentualDoAviso}
                  />
                )}
              </Campo>
            </div>
            {(['emRisco', 'vencido'] as const).map((nivel) => (
              <fieldset key={nivel} className="hk-em-linha">
                <legend>{t('admin.sla.escalonamento.quem', { nivel })}</legend>
                {DESTINATARIOS_DO_AVISO.map((d) => (
                  <label key={d} className="hk-marcar">
                    <input
                      type="checkbox"
                      name={`${nivel}.${d}`}
                      defaultChecked={escalonamento.efetiva[nivel].includes(d)}
                    />
                    {t('admin.sla.destinatario', { destinatario: d })}
                  </label>
                ))}
              </fieldset>
            ))}
            {botoesDeGravar}
          </form>,
        )}
    </>
  );
}
