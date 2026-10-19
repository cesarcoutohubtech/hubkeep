'use client';
// Sugestões de plano do hotel (fase 1b, M1, caminho C): os ativos com modelo
// e sem plano que os cubra. "Criar plano pausado" cria o plano com a
// periodicidade e o checklist do modelo, sem responsável; descartar pede o
// motivo, e o ativo sai da lista. A regra de quem pode e do que entra é do
// servidor; a tela só mostra e chama.
import type { UnidadeDePeriodicidade } from '@hubkeep/dominio';
import { Botao, Campo, Entrada, MensagemVazia } from '@hubkeep/ui';
import type { FormEvent } from 'react';
import { useT } from '../i18n/cliente';

export interface SugestaoDePlano {
  ativoId: string;
  ativoNome: string;
  ativoVersao: number;
  modeloId: string;
  modeloNome: string | null;
  periodicidade: { intervalo: number; unidade: UnidadeDePeriodicidade } | null;
  checklistModeloId: string | null;
}

export function ListaDeSugestoes({
  sugestoes,
  executar,
}: {
  sugestoes: readonly SugestaoDePlano[];
  executar: (caminho: string, init: RequestInit) => Promise<void>;
}) {
  const t = useT();

  function descartar(ev: FormEvent<HTMLFormElement>, s: SugestaoDePlano) {
    ev.preventDefault();
    const motivo = String(new FormData(ev.currentTarget).get('motivo') ?? '').trim();
    void executar(`/api/v1/ativos/${s.ativoId}/plano-sugerido/descarte`, {
      method: 'POST',
      body: JSON.stringify({ versao: s.ativoVersao, motivo }),
    });
  }

  return (
    <section aria-label={t('admin.preventivas.sugestoes.titulo')}>
      <h2>{t('admin.preventivas.sugestoes.titulo')}</h2>
      <p className="hk-suave">{t('admin.preventivas.sugestoes.dica')}</p>
      {sugestoes.length === 0 ? (
        <MensagemVazia>{t('admin.preventivas.sugestoes.vazio')}</MensagemVazia>
      ) : (
        <ul className="hk-lista hk-itens">
          {sugestoes.map((s) => (
            <li key={`${s.ativoId}|${s.ativoVersao}`}>
              <div className="hk-item-cabecalho">
                <strong>{s.ativoNome}</strong>
              </div>
              <p className="hk-suave hk-em-linha">
                {s.modeloNome ? (
                  <span>{t('admin.preventivas.sugestoes.modelo', { modelo: s.modeloNome })}</span>
                ) : null}
                <span>
                  {s.periodicidade
                    ? t('admin.preventivas.periodicidade', s.periodicidade)
                    : t('admin.preventivas.sugestoes.sem_periodicidade')}
                </span>
              </p>
              <div className="hk-linha-de-botoes">
                {s.periodicidade ? (
                  <Botao
                    tamanho="pequeno"
                    variante="primario"
                    onClick={() =>
                      void executar(`/api/v1/ativos/${s.ativoId}/plano-sugerido`, {
                        method: 'POST',
                      })
                    }
                  >
                    {t('admin.preventivas.sugestoes.criar')}
                  </Botao>
                ) : null}
              </div>
              <form className="hk-em-linha" onSubmit={(ev) => descartar(ev, s)}>
                <Campo rotulo={t('admin.preventivas.sugestoes.motivo')}>
                  {(p) => <Entrada {...p} name="motivo" maxLength={500} required />}
                </Campo>
                <Botao type="submit" tamanho="pequeno">
                  {t('admin.preventivas.sugestoes.descartar')}
                </Botao>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
