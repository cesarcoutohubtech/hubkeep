'use client';
// Abertura das telas do HubKeep Intelligence (inteligencia.visibilidade_telas;
// adendo ao ADR-035 de 12/10/2026). Só o Admin do grupo, também antes da
// abertura (decisão 2 do Cesar): vê quando as telas abrem e para quem, e muda
// pela política, no escopo do grupo (PUT /api/v1/politicas). A regra é do
// motor; a tela só mostra a resposta e grava o valor.
import {
  PAPEIS_QUE_VEEM_AS_TELAS_API,
  type RespostaDaAberturaDoIntelligence,
  type z,
} from '@hubkeep/contratos';
import { Botao, Campo, Dados, Entrada, MensagemVazia, Nota, Painel } from '@hubkeep/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import { useT } from '../../../../i18n/cliente';
import { useDatas } from '../comum';

export type Abertura = z.infer<typeof RespostaDaAberturaDoIntelligence>;
type Config = Abertura['config'];

const CHAVE = 'inteligencia.visibilidade_telas';

export function TelaDaAbertura() {
  const t = useT();
  const [abertura, setAbertura] = useState<Abertura | null>(null);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamarApi<Abertura>('/api/v1/inteligencia/abertura');
    if (r.ok) setAbertura(r.dados);
    else setAviso({ tipo: 'erro', erro: r.erro });
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function gravar(valor: Config | null) {
    const r = await chamarApi('/api/v1/politicas', {
      method: 'PUT',
      body: JSON.stringify({ chave: CHAVE, escopo: { tipo: 'grupo' }, valor }),
    });
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    if (r.ok) await carregar();
  }

  return (
    <div className="hk-pilha">
      <Nota tom="info">{t('inteligencia.abertura.nota')}</Nota>
      <Aviso aviso={aviso} />
      {abertura === null ? (
        aviso === null && <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : (
        <ConteudoDaAbertura abertura={abertura} aoGravar={(v) => void gravar(v)} />
      )}
    </div>
  );
}

/** A abertura e o formulário, sem rede: `aoGravar(null)` volta ao padrão. */
export function ConteudoDaAbertura({
  abertura,
  aoGravar,
}: {
  abertura: Abertura;
  aoGravar: (valor: Config | null) => void;
}) {
  const t = useT();
  const { data, dataHora } = useDatas();
  const a = abertura.abertura;

  function salvar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const aPartirDe = String(f.get('aPartirDe') ?? '');
    aoGravar({
      aPartirDe: aPartirDe === '' ? null : aPartirDe,
      diasAposAtivacao: Number(f.get('diasAposAtivacao')),
      papeis: PAPEIS_QUE_VEEM_AS_TELAS_API.filter((p) => f.get(`papel.${p}`) === 'on'),
    });
  }

  return (
    <>
      <Painel titulo={t('inteligencia.abertura.titulo')}>
        <Dados
          itens={[
            {
              rotulo: t('inteligencia.abertura.estado'),
              valor: t('inteligencia.abertura.estado.valor', {
                abertas: String(abertura.abertas),
              }),
            },
            {
              rotulo: t('inteligencia.abertura.em'),
              valor: a ? dataHora(a.em) : t('inteligencia.abertura.sem_contrato'),
            },
            {
              rotulo: t('inteligencia.abertura.origem'),
              valor:
                a?.origem === 'data'
                  ? t('inteligencia.abertura.origem.data')
                  : t('inteligencia.abertura.origem.ativacao', {
                      dias: abertura.config.diasAposAtivacao,
                      ativacao: a?.primeiraAtivacao ? data(a.primeiraAtivacao) : '—',
                    }),
            },
            {
              rotulo: t('inteligencia.abertura.papeis'),
              valor: abertura.config.papeis.map((p) => t(`papel.${p}`)).join(', '),
            },
          ]}
        />
      </Painel>
      <Painel titulo={t('inteligencia.abertura.mudar')}>
        <form key={JSON.stringify(abertura.config)} className="hk-pilha" onSubmit={salvar}>
          <div className="hk-em-linha">
            <Campo
              rotulo={t('inteligencia.abertura.campo.data')}
              ajuda={t('inteligencia.abertura.campo.data_ajuda')}
            >
              {(p) => (
                <Entrada
                  {...p}
                  type="date"
                  name="aPartirDe"
                  defaultValue={abertura.config.aPartirDe ?? ''}
                />
              )}
            </Campo>
            <Campo rotulo={t('inteligencia.abertura.campo.dias')}>
              {(p) => (
                <Entrada
                  {...p}
                  type="number"
                  name="diasAposAtivacao"
                  min={0}
                  max={365}
                  defaultValue={abertura.config.diasAposAtivacao}
                />
              )}
            </Campo>
          </div>
          <fieldset className="hk-em-linha">
            <legend>{t('inteligencia.abertura.papeis')}</legend>
            {PAPEIS_QUE_VEEM_AS_TELAS_API.map((p) => (
              <label key={p} className="hk-marcar">
                <input
                  type="checkbox"
                  name={`papel.${p}`}
                  defaultChecked={abertura.config.papeis.includes(p)}
                />
                {t(`papel.${p}`)}
              </label>
            ))}
          </fieldset>
          <div className="hk-linha-de-botoes">
            <Botao type="submit" variante="primario">
              {t('inteligencia.abertura.acao.salvar')}
            </Botao>
            <Botao type="button" onClick={() => aoGravar(null)}>
              {t('inteligencia.abertura.acao.padrao')}
            </Botao>
          </div>
        </form>
      </Painel>
    </>
  );
}
