'use client';
// O checklist da OS no web (fase 1b, PV1; ADR-040): a cópia aplicada, com a
// versão do modelo, e as respostas, só para leitura (o técnico responde no
// PWA). Quem tria aplica um modelo ativo na OS atribuída, em execução ou
// pausada, e troca o modelo enquanto não há resposta. A lista de modelos só
// vem para quem lê os modelos (a gestão e o Implantador); para os outros, o
// bloco mostra só o checklist. O servidor confere de novo (403, 409).
import { type Idioma, resolverNome } from '@hubkeep/i18n';
import { Botao, Campo, Selecao } from '@hubkeep/ui';
import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { chamarApi } from './api';
import { Aviso, type AvisoDeAcao } from './aviso';
import { useIdioma, useT } from '../i18n/cliente';

type Rotulos = Partial<Record<Idioma, string>>;
interface Item {
  chave: string;
  tipo: 'texto' | 'numero' | 'data' | 'lista' | 'sim_nao';
  obrigatorio: boolean;
  rotulos: Rotulos;
  unidade: string | null;
  opcoes: { chave: string; rotulos: Rotulos }[];
}
export interface Checklist {
  id: string;
  modeloId: string;
  modeloVersao: number;
  nomes: Rotulos;
  itens: Item[];
  respostas: Record<string, { valor: string | number | boolean; feitaEm: string }>;
}
export interface Modelo {
  id: string;
  nomes: Rotulos;
  versao: number;
  ativa: boolean;
}

const ESTADOS_QUE_ACEITAM = ['atribuida', 'em_execucao', 'pausada'];

export function ChecklistDaOs(props: {
  osId: string;
  estado: string;
  /** Para testes: o checklist e os modelos já carregados (no app, vêm da API). */
  inicial?: { checklist: Checklist | null; modelos: Modelo[] };
}) {
  const t = useT();
  const intl = useIntl();
  const { idioma } = useIdioma();
  const [checklist, setChecklist] = useState<Checklist | null | undefined>(
    props.inicial?.checklist,
  );
  const [modelos, setModelos] = useState<Modelo[]>(props.inicial?.modelos ?? []);
  const [idiomaPadrao, setIdiomaPadrao] = useState<Idioma>('pt-BR');
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamarApi<{ checklist: Checklist | null }>(
      `/api/v1/os/${props.osId}/checklist`,
    );
    setChecklist(r.ok ? r.dados.checklist : null);
  }, [props.osId]);

  const aceita = ESTADOS_QUE_ACEITAM.includes(props.estado);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  useEffect(() => {
    if (!aceita) return;
    void chamarApi<{ idiomaPadrao: Idioma; modelos: Modelo[] }>(
      '/api/v1/modelos-de-checklist',
    ).then((r) => {
      if (!r.ok) return;
      setIdiomaPadrao(r.dados.idiomaPadrao);
      setModelos(r.dados.modelos.filter((m) => m.ativa));
    });
  }, [aceita]);

  if (checklist === undefined) return null;
  const rotulo = (r: Rotulos) => resolverNome(r, idioma, { idiomaPadrao }) ?? '';
  const semResposta = !checklist || Object.keys(checklist.respostas).length === 0;
  const podeAplicar = aceita && semResposta && modelos.length > 0;
  if (!checklist && !podeAplicar) return null;

  const valorNaTela = (item: Item, valor: string | number | boolean) => {
    switch (item.tipo) {
      case 'sim_nao':
        return t('checklist.sim_nao', { valor: String(valor) });
      case 'lista':
        return rotulo(item.opcoes.find((o) => o.chave === valor)?.rotulos ?? {}) || String(valor);
      case 'numero':
        return `${intl.formatNumber(Number(valor))}${item.unidade ? ` ${item.unidade}` : ''}`;
      case 'data':
        return intl.formatDate(`${String(valor)}T12:00:00Z`, {
          dateStyle: 'short',
          timeZone: 'UTC',
        });
      default:
        return String(valor);
    }
  };

  async function aplicar(modeloId: string) {
    const r = await chamarApi<unknown>(`/api/v1/os/${props.osId}/checklist`, {
      method: 'PUT',
      body: JSON.stringify({ modeloId }),
    });
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregar();
  }

  return (
    <div className="hk-bloco" data-checklist-da-os={checklist?.id ?? ''}>
      <p className="hk-bloco-titulo">
        {checklist
          ? t('checklist.titulo_com_nome', {
              nome: rotulo(checklist.nomes),
              versao: checklist.modeloVersao,
            })
          : t('checklist.titulo')}
      </p>
      {checklist && (
        <ul className="hk-sublista">
          {checklist.itens.map((item) => {
            const r = checklist.respostas[item.chave];
            return (
              <li key={item.chave} data-item={item.chave} data-respondido={r ? 'sim' : 'nao'}>
                <strong>{rotulo(item.rotulos)}</strong>
                {item.obrigatorio && <span className="hk-suave">{t('checklist.obrigatorio')}</span>}
                <span className={r ? undefined : 'hk-suave'}>
                  {r ? valorNaTela(item, r.valor) : t('checklist.sem_resposta')}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {podeAplicar && (
        <form
          className="hk-em-linha"
          onSubmit={(ev) => {
            ev.preventDefault();
            const modeloId = String(new FormData(ev.currentTarget).get('modelo') ?? '');
            if (modeloId) void aplicar(modeloId);
          }}
        >
          <Campo rotulo={t('checklist.campo.modelo')}>
            {(p) => (
              <Selecao {...p} name="modelo" defaultValue={checklist?.modeloId ?? ''} required>
                <option value="">{t('checklist.escolha')}</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {rotulo(m.nomes) || m.id}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Botao type="submit" tamanho="pequeno">
            {checklist ? t('checklist.acao.trocar') : t('checklist.acao.aplicar')}
          </Botao>
        </form>
      )}
      <Aviso aviso={aviso} />
    </div>
  );
}
