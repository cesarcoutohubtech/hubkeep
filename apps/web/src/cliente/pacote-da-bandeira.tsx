'use client';
// Pacote da bandeira (fase 1b, PB1): os planos por categoria do pacote, da
// bandeira ou do grupo inteiro, que o Admin do grupo mantém, e a aplicação do
// pacote ao hotel, no painel de implantação. A bandeira se escolhe na criação
// e não muda. As regras são do servidor; a tela só mostra e chama. Os testes
// entram com os dados já carregados.
import { Botao, Campo, Entrada, MensagemVazia, Selecao } from '@hubkeep/ui';
import { type FormEvent, useState } from 'react';
import { useT } from '../i18n/cliente';
import type { Categoria, Checklist, Rotulos } from './modelos-de-ativo';

const UNIDADES = ['dia', 'semana', 'mes'] as const;
type Unidade = (typeof UNIDADES)[number];

export interface PlanoPadrao {
  id: string;
  bandeiraId: string | null;
  categoriaId: string;
  nome: string;
  intervalo: number;
  unidade: Unidade;
  checklistModeloId: string | null;
  ativa: boolean;
  versao: number;
}

export interface Bandeira {
  id: string;
  nome: string;
}

export interface CopiaDoPacote {
  planoPadraoId: string;
  categoriaId: string;
  nome: string;
  intervalo: number;
  unidade: Unidade;
  checklistModeloId: string | null;
  inicio: string;
}

const texto = (f: FormData, campo: string) => {
  const v = String(f.get(campo) ?? '').trim();
  return v === '' ? null : v;
};

export function FormularioDePlanoPadrao({
  plano,
  bandeiras,
  categorias,
  checklists,
  nomeDaCategoria,
  rotulo,
  executar,
}: {
  plano: PlanoPadrao | null;
  bandeiras: readonly Bandeira[];
  categorias: readonly Categoria[];
  checklists: readonly Checklist[];
  nomeDaCategoria: (c: Categoria) => string;
  rotulo: (r: Rotulos, reserva: string) => string;
  executar: (caminho: string, init: RequestInit) => Promise<void>;
}) {
  const t = useT();
  const ativas = categorias.filter((c) => c.ativa || c.id === plano?.categoriaId);
  const [categoriaId, setCategoriaId] = useState<string>(plano?.categoriaId ?? ativas[0]?.id ?? '');

  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const dados = {
      categoriaId,
      nome: texto(f, 'nome') ?? '',
      intervalo: Number(texto(f, 'intervalo') ?? '0'),
      unidade: texto(f, 'unidade') ?? 'mes',
      checklistModeloId: texto(f, 'checklist'),
    };
    void (plano
      ? executar(`/api/v1/planos-do-pacote/${plano.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...dados, versao: plano.versao }),
        })
      : executar('/api/v1/planos-do-pacote', {
          method: 'POST',
          body: JSON.stringify({ ...dados, bandeiraId: texto(f, 'bandeira') }),
        }));
  }

  return (
    <form onSubmit={enviar} className="hk-em-linha">
      {plano ? null : (
        <Campo rotulo={t('admin.pacote.campo.bandeira')}>
          {(p) => (
            <Selecao {...p} name="bandeira" defaultValue="">
              <option value="">{t('admin.pacote.todo_o_grupo')}</option>
              {bandeiras.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
      )}
      <Campo rotulo={t('admin.modelos_de_ativo.campo.categoria')}>
        {(p) => (
          <Selecao
            {...p}
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            required
          >
            {ativas.map((c) => (
              <option key={c.id} value={c.id}>
                {nomeDaCategoria(c)}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo={t('admin.pacote.campo.nome')}>
        {(p) => <Entrada {...p} name="nome" defaultValue={plano?.nome ?? ''} required />}
      </Campo>
      <Campo rotulo={t('admin.pacote.campo.intervalo')}>
        {(p) => (
          <Entrada
            {...p}
            type="number"
            min={1}
            name="intervalo"
            defaultValue={plano ? String(plano.intervalo) : '1'}
            required
          />
        )}
      </Campo>
      <Campo rotulo={t('admin.preventivas.campo.unidade')}>
        {(p) => (
          <Selecao {...p} name="unidade" defaultValue={plano?.unidade ?? 'mes'}>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {t('admin.preventivas.unidade', { unidade: u })}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo={t('admin.modelos_de_ativo.campo.checklist')}>
        {(p) => (
          <Selecao
            {...p}
            key={`checklist|${categoriaId}`}
            name="checklist"
            defaultValue={plano?.checklistModeloId ?? ''}
          >
            <option value="">{t('admin.modelos_de_ativo.sem_checklist')}</option>
            {checklists
              .filter(
                (c) =>
                  (c.ativa && (c.categoriaId === null || c.categoriaId === categoriaId)) ||
                  c.id === plano?.checklistModeloId,
              )
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {rotulo(c.nomes, c.id)}
                </option>
              ))}
          </Selecao>
        )}
      </Campo>
      <div className="hk-linha-de-botoes">
        <Botao type="submit" variante={plano ? 'padrao' : 'primario'}>
          {plano ? t('admin.pacote.acao.salvar') : t('admin.pacote.acao.criar')}
        </Botao>
        {plano && (
          <Botao
            onClick={() =>
              void executar(
                `/api/v1/planos-do-pacote/${plano.id}/${plano.ativa ? 'desativacao' : 'reativacao'}`,
                { method: 'POST', body: JSON.stringify({ versao: plano.versao }) },
              )
            }
          >
            {plano.ativa ? t('admin.pacote.acao.desativar') : t('admin.pacote.acao.reativar')}
          </Botao>
        )}
      </div>
    </form>
  );
}

/** O que aplicar o pacote copiaria para o hotel, com o botão de aplicar. */
export function AplicacaoDoPacote({
  copias,
  aplicar,
}: {
  copias: readonly CopiaDoPacote[];
  aplicar: () => Promise<void>;
}) {
  const t = useT();
  if (copias.length === 0) {
    return <MensagemVazia>{t('admin.pacote.aplicacao.nada')}</MensagemVazia>;
  }
  return (
    <>
      <p className="hk-suave">{t('admin.pacote.aplicacao.dica')}</p>
      <ul className="hk-lista hk-itens">
        {copias.map((c) => (
          <li key={c.planoPadraoId} className="hk-em-linha">
            <strong>{c.nome}</strong>
            <span className="hk-suave">
              {t('admin.preventivas.periodicidade', { intervalo: c.intervalo, unidade: c.unidade })}
            </span>
          </li>
        ))}
      </ul>
      <div className="hk-linha-de-botoes">
        <Botao variante="primario" onClick={() => void aplicar()}>
          {t('admin.pacote.aplicacao.aplicar', { quantos: copias.length })}
        </Botao>
      </div>
    </>
  );
}
