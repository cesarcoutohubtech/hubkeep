'use client';
// Bloco da tolerância da preventiva em dia (1c, decisão 11) na tela de
// configuração: os dias depois do dia previsto em que a preventiva concluída
// ainda conta como em dia no painel de indicadores (preventiva.tolerancia_dias,
// de 0 a 30, padrão 0). Grava no grupo, na bandeira ou no hotel, como as outras
// políticas. Só apresentação: quem valida é o domínio, pela API.
import { Botao, Campo, Entrada, Selo } from '@hubkeep/ui';
import type { FormEvent } from 'react';
import { useT } from '../i18n/cliente';
import type { EscopoDoBotao, Origem } from './blocos-do-sla';

interface Tolerancia {
  dias: number;
}
/** A política como GET /api/v1/configuracao devolve. */
export interface PoliticaDaTolerancia {
  chave: 'preventiva.tolerancia_dias';
  padrao: Tolerancia;
  grupo: Tolerancia | null;
  bandeira: Tolerancia | null;
  hotel: Tolerancia | null;
  efetiva: Tolerancia;
  origem: Origem;
}

/** Os limites do domínio (politicas.ts), repetidos no campo para o navegador. */
const MAXIMO_DE_DIAS = 30;

const escopoDoEnvio = (ev: FormEvent<HTMLFormElement>): EscopoDoBotao => {
  const v = (ev.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
  return v === 'hotel' || v === 'bandeira' ? v : 'grupo';
};

export function BlocoDaTolerancia(props: {
  politica: PoliticaDaTolerancia;
  /** Com o hotel escolhido, o botão do hotel; com bandeira, também o da bandeira. */
  temHotel: boolean;
  temBandeira: boolean;
  aoGravar: (
    chave: 'preventiva.tolerancia_dias',
    escopo: EscopoDoBotao,
    valor: Tolerancia | null,
  ) => void;
}) {
  const t = useT();
  const { politica: p, aoGravar } = props;
  return (
    <section className="hk-bloco" data-politica={p.chave}>
      <h3 className="hk-bloco-titulo">{t('admin.configuracao.tolerancia.titulo')}</h3>
      <div className="hk-linha-de-botoes">
        <span className="hk-suave">
          {t('admin.configuracao.tolerancia.resumo', { dias: p.efetiva.dias })}
        </span>
        <Selo tom={p.origem === 'padrao' ? 'cinza' : 'azul'}>
          {t('admin.configuracao.origem', { origem: p.origem })}
        </Selo>
      </div>
      <p className="hk-suave">{t('admin.configuracao.tolerancia.dica')}</p>
      <form
        className="hk-em-linha"
        onSubmit={(ev) => {
          ev.preventDefault();
          const f = new FormData(ev.currentTarget);
          aoGravar(p.chave, escopoDoEnvio(ev), { dias: Number(f.get('dias')) });
        }}
      >
        <Campo rotulo={t('admin.configuracao.tolerancia.dias')}>
          {(c) => (
            <Entrada
              {...c}
              type="number"
              name="dias"
              min={0}
              max={MAXIMO_DE_DIAS}
              step={1}
              required
              defaultValue={p.efetiva.dias}
            />
          )}
        </Campo>
        <Botao type="submit" value="grupo">
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
      </form>
      {(p.grupo || p.bandeira || p.hotel) && (
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
      )}
    </section>
  );
}
