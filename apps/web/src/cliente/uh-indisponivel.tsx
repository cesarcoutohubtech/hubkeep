'use client';
// UH indisponível no detalhe do chamado (fase 1b, I4): os períodos em que a
// UH ficou fora de uso por causa do chamado, com o tempo de cada um, e as
// ações da gestão do hotel: marcar a UH indisponível depois da abertura
// (desde quando, com agora como padrão) e liberar o período aberto. Quem
// conclui a OS libera pelo PWA, na conclusão. Só apresentação: quando
// oferecer cada ação sai das regras do domínio; quem pode é decidido pela API,
// e a recusa volta como código, traduzida pela tela.
import type { RespostaDeUhIndisponivel, z } from '@hubkeep/contratos';
import { ESTADOS_QUE_ACEITAM_UH_INDISPONIVEL } from '@hubkeep/dominio';
import { Botao, Campo, Entrada, MensagemVazia, Painel, Selo } from '@hubkeep/ui';
import { type FormEvent, useState } from 'react';
import { useIntl } from 'react-intl';
import { type DetalheDoChamado, agoraNoCampo } from './corretiva';
import { useT } from '../i18n/cliente';

export type PeriodoDeUh = z.infer<typeof RespostaDeUhIndisponivel>['periodos'][number];

const dataCurta = { dateStyle: 'short', timeStyle: 'short' } as const;
const HORA_MS = 3_600_000;

/** A gestão marca depois só com o chamado em curso e sem período aberto (o servidor confere de novo). */
export function podeMarcarUh(detalhe: DetalheDoChamado, periodos: readonly PeriodoDeUh[]): boolean {
  return (
    detalhe.nomes.localTipo === 'uh' &&
    (ESTADOS_QUE_ACEITAM_UH_INDISPONIVEL as readonly string[]).includes(detalhe.chamado.estado) &&
    !periodos.some((p) => p.fim === null)
  );
}

function Marcacao(props: { aoMarcar: (desde: string) => void }) {
  const t = useT();
  const [desde, setDesde] = useState(() => agoraNoCampo());
  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    props.aoMarcar(new Date(desde).toISOString());
  }
  return (
    <form onSubmit={enviar}>
      <Campo rotulo={t('corretiva.uh.desde')}>
        {(p) => (
          <Entrada
            {...p}
            type="datetime-local"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        )}
      </Campo>
      <Botao type="submit">{t('corretiva.uh.marcar')}</Botao>
    </form>
  );
}

export function UhIndisponivelDoChamado(props: {
  detalhe: DetalheDoChamado;
  /** null enquanto carrega, ou se a leitura falhou. */
  periodos: PeriodoDeUh[] | null;
  aoMarcar: (desde: string) => void;
  aoLiberar: (periodo: PeriodoDeUh) => void;
}) {
  const t = useT();
  const intl = useIntl();
  const periodos = props.periodos ?? [];
  // Área comum não tem período; sem nada para mostrar, o painel some.
  if (props.detalhe.nomes.localTipo !== 'uh' && periodos.length === 0) return null;
  const marcar = podeMarcarUh(props.detalhe, periodos);
  const horas = (ms: number) =>
    intl.formatNumber(ms / HORA_MS, { maximumFractionDigits: 1, minimumFractionDigits: 0 });
  return (
    <Painel titulo={t('corretiva.uh.titulo')}>
      <div className="hk-pilha">
        {periodos.length === 0 ? (
          <MensagemVazia>{t('corretiva.uh.vazio')}</MensagemVazia>
        ) : (
          <ul className="hk-lista">
            {periodos.map((p) => (
              <li key={`${p.id}-${p.fim ?? ''}`} data-periodo={p.id}>
                <div className="hk-linha-de-botoes">
                  <Selo tom={p.fim === null ? 'ambar' : 'verde'}>
                    {p.fim === null ? t('corretiva.uh.indisponivel') : t('corretiva.uh.liberada')}
                  </Selo>
                  <span className="hk-suave">
                    {p.fim === null
                      ? t('corretiva.uh.periodo_aberto', {
                          inicio: intl.formatDate(p.inicio, dataCurta),
                          horas: horas(p.tempoIndisponivelMs),
                        })
                      : t('corretiva.uh.periodo', {
                          inicio: intl.formatDate(p.inicio, dataCurta),
                          fim: intl.formatDate(p.fim, dataCurta),
                          horas: horas(p.tempoIndisponivelMs),
                        })}
                  </span>
                  {p.fim === null && (
                    <Botao tamanho="pequeno" onClick={() => props.aoLiberar(p)}>
                      {t('corretiva.uh.liberar')}
                    </Botao>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {marcar && (
          <div className="hk-bloco">
            <p className="hk-bloco-titulo">{t('corretiva.uh.marcar')}</p>
            <p className="hk-suave">{t('corretiva.uh.marcar_descricao')}</p>
            <Marcacao key={props.detalhe.chamado.versao} aoMarcar={props.aoMarcar} />
          </div>
        )}
      </div>
    </Painel>
  );
}
