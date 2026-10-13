'use client';
// Bloco da matriz do arrendado (1c, decisões 5 a 7): por categoria de ativo,
// quem responde pela OS no hotel arrendado, a arrendatária ou o locador.
// Grava no grupo ou no hotel, sem a bandeira (decisão 5). Só apresentação: a
// página carrega e grava; o formulário vira valor em matriz-arrendamento.ts.
import {
  type MatrizDeArrendamento,
  RESPONSAVEIS_DO_ARRENDAMENTO,
  responsavelDoArrendamento,
} from '@hubkeep/dominio';
import { Botao, MensagemVazia, Nota, Selecao, Selo, Tabela, type TomDeSelo } from '@hubkeep/ui';
import type { FormEvent } from 'react';
import { useT } from '../i18n/cliente';
import type { ItemComNome, Origem } from './blocos-do-sla';
import { matrizDoFormulario } from './matriz-arrendamento';

/** A política, como GET /api/v1/configuracao devolve (a bandeira fica sempre nula). */
export interface PoliticaDaMatriz {
  chave: 'hotel.matriz_arrendamento';
  padrao: MatrizDeArrendamento;
  grupo: MatrizDeArrendamento | null;
  bandeira: MatrizDeArrendamento | null;
  hotel: MatrizDeArrendamento | null;
  efetiva: MatrizDeArrendamento;
  origem: Origem;
}
export type EscopoDaMatriz = 'grupo' | 'hotel';

const TOM_DA_ORIGEM: Record<Origem, TomDeSelo> = {
  hotel: 'azul',
  bandeira: 'azul',
  grupo: 'azul',
  padrao: 'cinza',
};

const escopoDoEnvio = (ev: FormEvent<HTMLFormElement>): EscopoDaMatriz =>
  (ev.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'hotel' ? 'hotel' : 'grupo';

export function BlocoDaMatriz(props: {
  politica: PoliticaDaMatriz;
  /** As categorias de ativo ativas do grupo. */
  categorias: readonly ItemComNome[];
  /** O hotel escolhido: nulo, só o grupo; fora do arrendado, a matriz não vale nele. */
  hotel: { arrendado: boolean } | null;
  aoGravar: (escopo: EscopoDaMatriz, valor: MatrizDeArrendamento | null) => void;
}) {
  const t = useT();
  const { politica, categorias, hotel, aoGravar } = props;
  const rotulo = (nome: string) => `${nome}: ${t('admin.arrendamento.campo.responsavel')}`;

  return (
    <section key={JSON.stringify(politica)} className="hk-bloco" data-politica={politica.chave}>
      <h3 className="hk-bloco-titulo">{t('admin.arrendamento.matriz.titulo')}</h3>
      <div className="hk-linha-de-botoes">
        <span className="hk-suave">{t('admin.arrendamento.matriz.dica')}</span>
        <Selo tom={TOM_DA_ORIGEM[politica.origem]}>
          {t('admin.configuracao.origem', { origem: politica.origem })}
        </Selo>
      </div>
      {hotel && !hotel.arrendado && <Nota>{t('admin.arrendamento.hotel_nao_arrendado')}</Nota>}
      {categorias.length === 0 ? (
        <MensagemVazia>{t('admin.arrendamento.vazio')}</MensagemVazia>
      ) : (
        <form
          className="hk-pilha"
          onSubmit={(ev) => {
            ev.preventDefault();
            aoGravar(
              escopoDoEnvio(ev),
              matrizDoFormulario(new FormData(ev.currentTarget), politica.efetiva, categorias),
            );
          }}
        >
          <Tabela legenda={t('admin.arrendamento.matriz.titulo')}>
            <thead>
              <tr>
                <th scope="col">{t('admin.arrendamento.campo.categoria')}</th>
                <th scope="col">{t('admin.arrendamento.campo.responsavel')}</th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((c) => (
                <tr key={c.id} data-categoria={c.id}>
                  <th scope="row">{c.nome}</th>
                  <td>
                    <Selecao
                      name={`categoria.${c.id}`}
                      aria-label={rotulo(c.nome)}
                      defaultValue={
                        responsavelDoArrendamento('arrendado', politica.efetiva, c.id) ??
                        'arrendataria'
                      }
                    >
                      {RESPONSAVEIS_DO_ARRENDAMENTO.map((r) => (
                        <option key={r} value={r}>
                          {t('admin.arrendamento.responsavel', { responsavel: r })}
                        </option>
                      ))}
                    </Selecao>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
          <div className="hk-linha-de-botoes">
            <Botao type="submit" value="grupo" variante="primario">
              {t('admin.configuracao.acao.gravar_grupo')}
            </Botao>
            {hotel && (
              <Botao type="submit" value="hotel">
                {t('admin.configuracao.acao.gravar_hotel')}
              </Botao>
            )}
          </div>
        </form>
      )}
      {(politica.grupo || politica.hotel) && (
        <div className="hk-linha-de-botoes">
          {politica.grupo && (
            <Botao tamanho="pequeno" onClick={() => aoGravar('grupo', null)}>
              {t('admin.configuracao.acao.herdar_grupo')}
            </Botao>
          )}
          {politica.hotel && (
            <Botao tamanho="pequeno" onClick={() => aoGravar('hotel', null)}>
              {t('admin.configuracao.acao.herdar_hotel')}
            </Botao>
          )}
        </div>
      )}
    </section>
  );
}
