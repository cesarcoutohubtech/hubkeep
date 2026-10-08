'use client';
// Configuração do grupo e do hotel e políticas (fase 1a, A7; ADR-026). Todos
// leem; a API recusa a gravação de quem não é Admin do grupo. Visual do pacote
// de interface (ADR-038, U4b). Os nomes dos níveis de criticidade do ativo
// (I1) são editados por idioma; o campo vazio usa o nome do catálogo.
import { IDIOMAS } from '@hubkeep/i18n';
import {
  Botao,
  Campo,
  Entrada,
  MensagemVazia,
  Painel,
  Selecao,
  Selo,
  type TomDeSelo,
} from '@hubkeep/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import { SeletorDeHotel, useHoteis } from '../../../../cliente/cadastro';
import { HistoricoDoRegistro } from '../../../../cliente/HistoricoDoRegistro';
import { nomeDoIdioma, useT } from '../../../../i18n/cliente';

interface Regiao {
  pais: string | null;
  subdivisao: string | null;
  moeda: string | null;
  idiomaPadrao: string | null;
}
interface Aceite {
  ligado: boolean;
  dias: number;
}
type PoliticaSemCriticidade =
  | {
      chave: 'os.aceite_automatico';
      padrao: Aceite;
      grupo: Aceite | null;
      hotel: Aceite | null;
      efetiva: Aceite;
      origem: Origem;
    }
  | {
      chave: 'chamado.prioridade_padrao_por_categoria';
      padrao: Record<string, string>;
      grupo: Record<string, string> | null;
      hotel: Record<string, string> | null;
      efetiva: Record<string, string>;
      origem: Origem;
    };
type NomesDeCriticidade = Partial<Record<string, Partial<Record<string, string>>>>;
type Politica =
  | PoliticaSemCriticidade
  | {
      chave: 'ativo.criticidade';
      padrao: NomesDeCriticidade;
      grupo: NomesDeCriticidade | null;
      hotel: NomesDeCriticidade | null;
      efetiva: NomesDeCriticidade;
      origem: Origem;
    };
type Origem = 'hotel' | 'grupo' | 'padrao';
const NIVEIS = [1, 2, 3, 4, 5] as const;
interface Configuracao {
  tenant: Regiao & { nome: string };
  hotel: (Regiao & { id: string; nome: string; fuso: string }) | null;
  politicas: Politica[];
}

/** De onde vem o valor: do hotel e do grupo em azul, o padrão do sistema em cinza. */
const TOM_DA_ORIGEM: Record<Origem, TomDeSelo> = { hotel: 'azul', grupo: 'azul', padrao: 'cinza' };

const texto = (f: FormData, campo: string) => {
  const v = String(f.get(campo) ?? '').trim();
  return v === '' ? null : v;
};

export default function ConfiguracaoDoGrupo() {
  const t = useT();
  const { hoteis, hotelId, setHotelId, erro: erroDosHoteis } = useHoteis();
  const [dados, setDados] = useState<Configuracao | null>(null);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamarApi<Configuracao>(
      `/api/v1/configuracao${hotelId ? `?hotelId=${hotelId}` : ''}`,
    );
    if (r.ok) setDados(r.dados);
    else setAviso({ tipo: 'erro', erro: r.erro });
  }, [hotelId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function gravar(caminho: string, corpo: unknown) {
    const r = await chamarApi<Configuracao>(caminho, {
      method: 'PUT',
      body: JSON.stringify(corpo),
    });
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    if (r.ok) setDados(r.dados);
  }

  function salvarTenant(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    void gravar('/api/v1/configuracao', {
      pais: texto(f, 'pais') ?? '',
      subdivisao: texto(f, 'subdivisao'),
      moeda: texto(f, 'moeda') ?? '',
      idiomaPadrao: texto(f, 'idiomaPadrao'),
    });
  }

  function salvarHotel(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    void gravar(`/api/v1/hoteis/${hotelId}/configuracao`, {
      fuso: texto(f, 'fuso') ?? '',
      pais: texto(f, 'pais'),
      subdivisao: texto(f, 'subdivisao'),
      moeda: texto(f, 'moeda'),
      idiomaPadrao: texto(f, 'idiomaPadrao'),
    });
  }

  const gravarPolitica = (chave: Politica['chave'], escopo: 'grupo' | 'hotel', valor: unknown) =>
    gravar('/api/v1/politicas', {
      chave,
      escopo: escopo === 'grupo' ? { tipo: 'grupo' } : { tipo: 'hotel', hotelId },
      valor,
    });

  const camposDeRegiao = (r: Regiao, herda: boolean) => (
    <>
      <Campo rotulo={t('admin.configuracao.campo.pais')}>
        {(p) => <Entrada {...p} name="pais" defaultValue={r.pais ?? ''} required={!herda} />}
      </Campo>
      <Campo rotulo={t('admin.configuracao.campo.subdivisao')}>
        {(p) => <Entrada {...p} name="subdivisao" defaultValue={r.subdivisao ?? ''} />}
      </Campo>
      <Campo rotulo={t('admin.configuracao.campo.moeda')}>
        {(p) => <Entrada {...p} name="moeda" defaultValue={r.moeda ?? ''} required={!herda} />}
      </Campo>
      <Campo rotulo={t('admin.configuracao.campo.idioma')}>
        {(p) => (
          <Selecao {...p} name="idiomaPadrao" defaultValue={r.idiomaPadrao ?? ''}>
            {herda && <option value="">{t('admin.configuracao.herda')}</option>}
            {IDIOMAS.map((i) => (
              <option key={i} value={i}>
                {nomeDoIdioma(i)}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
    </>
  );

  if (!dados) {
    return (
      <>
        <Aviso aviso={erroDosHoteis ? { tipo: 'erro', erro: erroDosHoteis } : aviso} />
        <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      </>
    );
  }
  const aceite = dados.politicas.find((p) => p.chave === 'os.aceite_automatico');
  const prioridade = dados.politicas.find(
    (p) => p.chave === 'chamado.prioridade_padrao_por_categoria',
  );
  const criticidade = dados.politicas.find((p) => p.chave === 'ativo.criticidade');
  const origem = (o: Origem) => (
    <Selo tom={TOM_DA_ORIGEM[o]}>{t('admin.configuracao.origem', { origem: o })}</Selo>
  );

  return (
    <div className="hk-pilha">
      <Aviso aviso={erroDosHoteis ? { tipo: 'erro', erro: erroDosHoteis } : aviso} />
      <div className="hk-grade" data-colunas="2">
        <Painel titulo={t('admin.configuracao.grupo')}>
          <form key={JSON.stringify(dados.tenant)} onSubmit={salvarTenant} className="hk-em-linha">
            {camposDeRegiao(dados.tenant, false)}
            <Botao type="submit" variante="primario">
              {t('admin.configuracao.acao.salvar')}
            </Botao>
          </form>
        </Painel>

        <Painel titulo={t('admin.configuracao.hotel')}>
          <div className="hk-pilha">
            <div className="hk-filtros">
              <SeletorDeHotel
                rotulo={t('admin.configuracao.escolher_hotel')}
                hoteis={hoteis}
                valor={hotelId}
                aoEscolher={setHotelId}
              />
            </div>
            {dados.hotel && (
              <form
                key={JSON.stringify(dados.hotel)}
                onSubmit={salvarHotel}
                className="hk-em-linha"
              >
                <Campo rotulo={t('admin.configuracao.campo.fuso')}>
                  {(p) => <Entrada {...p} name="fuso" defaultValue={dados.hotel?.fuso} required />}
                </Campo>
                {camposDeRegiao(dados.hotel, true)}
                <Botao type="submit" variante="primario">
                  {t('admin.configuracao.acao.salvar')}
                </Botao>
              </form>
            )}
            {dados.hotel && (
              <HistoricoDoRegistro
                key={dados.hotel.id}
                entidade="hotel"
                registroId={dados.hotel.id}
              />
            )}
          </div>
        </Painel>
      </div>

      <Painel titulo={t('admin.configuracao.politicas')}>
        <div className="hk-pilha">
          {aceite?.chave === 'os.aceite_automatico' && (
            <section key={JSON.stringify(aceite)} className="hk-bloco">
              <h3 className="hk-bloco-titulo">{t('admin.configuracao.aceite.titulo')}</h3>
              <div className="hk-linha-de-botoes">
                <span className="hk-suave">
                  {t('admin.configuracao.aceite.resumo', {
                    ligado: String(aceite.efetiva.ligado),
                    dias: aceite.efetiva.dias,
                  })}
                </span>
                {origem(aceite.origem)}
              </div>
              <form
                className="hk-em-linha"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  const f = new FormData(ev.currentTarget);
                  const escopo =
                    (ev.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'hotel'
                      ? 'hotel'
                      : 'grupo';
                  void gravarPolitica('os.aceite_automatico', escopo, {
                    ligado: f.get('ligado') === 'on',
                    dias: Number(f.get('dias')),
                  });
                }}
              >
                <label className="hk-marcar">
                  <input type="checkbox" name="ligado" defaultChecked={aceite.efetiva.ligado} />
                  {t('admin.configuracao.aceite.ligado')}
                </label>
                <Campo rotulo={t('admin.configuracao.aceite.dias')}>
                  {(p) => (
                    <Entrada
                      {...p}
                      type="number"
                      name="dias"
                      min={1}
                      max={60}
                      defaultValue={aceite.efetiva.dias}
                    />
                  )}
                </Campo>
                <Botao type="submit" value="grupo">
                  {t('admin.configuracao.acao.gravar_grupo')}
                </Botao>
                {dados.hotel && (
                  <Botao type="submit" value="hotel">
                    {t('admin.configuracao.acao.gravar_hotel')}
                  </Botao>
                )}
              </form>
              {(aceite.grupo || aceite.hotel) && (
                <div className="hk-linha-de-botoes">
                  {aceite.grupo && (
                    <Botao
                      tamanho="pequeno"
                      onClick={() => void gravarPolitica('os.aceite_automatico', 'grupo', null)}
                    >
                      {t('admin.configuracao.acao.herdar_grupo')}
                    </Botao>
                  )}
                  {aceite.hotel && (
                    <Botao
                      tamanho="pequeno"
                      onClick={() => void gravarPolitica('os.aceite_automatico', 'hotel', null)}
                    >
                      {t('admin.configuracao.acao.herdar_hotel')}
                    </Botao>
                  )}
                </div>
              )}
            </section>
          )}
          {prioridade && (
            <section className="hk-bloco">
              <h3 className="hk-bloco-titulo">{t('admin.configuracao.prioridade.titulo')}</h3>
              <div className="hk-linha-de-botoes">
                <span className="hk-suave">
                  {t('admin.configuracao.prioridade.resumo', {
                    n: Object.keys(prioridade.efetiva).length,
                  })}
                </span>
                {origem(prioridade.origem)}
              </div>
            </section>
          )}
          {criticidade?.chave === 'ativo.criticidade' && (
            <section key={JSON.stringify(criticidade)} className="hk-bloco">
              <h3 className="hk-bloco-titulo">{t('admin.configuracao.criticidade.titulo')}</h3>
              <div className="hk-linha-de-botoes">
                <span className="hk-suave">{t('admin.configuracao.criticidade.dica')}</span>
                {origem(criticidade.origem)}
              </div>
              <form
                className="hk-pilha"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  const f = new FormData(ev.currentTarget);
                  const escopo =
                    (ev.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'hotel'
                      ? 'hotel'
                      : 'grupo';
                  const valor: NomesDeCriticidade = {};
                  for (const n of NIVEIS) {
                    const nomes: Partial<Record<string, string>> = {};
                    for (const i of IDIOMAS) {
                      const v = texto(f, `${n}.${i}`);
                      if (v) nomes[i] = v;
                    }
                    if (Object.keys(nomes).length > 0) valor[String(n)] = nomes;
                  }
                  void gravarPolitica('ativo.criticidade', escopo, valor);
                }}
              >
                {NIVEIS.map((n) => (
                  <fieldset key={n} className="hk-em-linha">
                    <legend>{t('admin.configuracao.criticidade.nivel', { nivel: n })}</legend>
                    {IDIOMAS.map((i) => (
                      <Campo
                        key={i}
                        rotulo={t('admin.categorias.nome_em', { idioma: nomeDoIdioma(i) })}
                      >
                        {(p) => (
                          <Entrada
                            {...p}
                            name={`${n}.${i}`}
                            placeholder={t('ativo.criticidade.nivel', { nivel: n })}
                            defaultValue={criticidade.efetiva[String(n)]?.[i] ?? ''}
                          />
                        )}
                      </Campo>
                    ))}
                  </fieldset>
                ))}
                <div className="hk-linha-de-botoes">
                  <Botao type="submit" value="grupo">
                    {t('admin.configuracao.acao.gravar_grupo')}
                  </Botao>
                  {dados.hotel && (
                    <Botao type="submit" value="hotel">
                      {t('admin.configuracao.acao.gravar_hotel')}
                    </Botao>
                  )}
                  {criticidade.grupo && (
                    <Botao
                      tamanho="pequeno"
                      onClick={() => void gravarPolitica('ativo.criticidade', 'grupo', null)}
                    >
                      {t('admin.configuracao.acao.herdar_grupo')}
                    </Botao>
                  )}
                  {criticidade.hotel && (
                    <Botao
                      tamanho="pequeno"
                      onClick={() => void gravarPolitica('ativo.criticidade', 'hotel', null)}
                    >
                      {t('admin.configuracao.acao.herdar_hotel')}
                    </Botao>
                  )}
                </div>
              </form>
            </section>
          )}
        </div>
      </Painel>
    </div>
  );
}
