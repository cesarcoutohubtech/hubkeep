'use client';
// Configuração do grupo e do hotel e políticas (fase 1a, A7; ADR-026). Tela
// funcional, sem acabamento: o layout vem do protótipo validado. Todos leem;
// a API recusa a gravação de quem não é Admin do grupo.
import { IDIOMAS } from '@hubkeep/i18n';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../cliente/api';
import { nomeDoIdioma, useMensagemDeErro, useT } from '../../../i18n/cliente';

interface Hotel {
  id: string;
  nome: string;
}
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
type Politica =
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
type Origem = 'hotel' | 'grupo' | 'padrao';
interface Configuracao {
  tenant: Regiao & { nome: string };
  hotel: (Regiao & { id: string; nome: string; fuso: string }) | null;
  politicas: Politica[];
}

type Aviso = { tipo: 'ok' } | { tipo: 'erro'; erro: ErroDaApi };

const texto = (f: FormData, campo: string) => {
  const v = String(f.get(campo) ?? '').trim();
  return v === '' ? null : v;
};

export default function ConfiguracaoDoGrupo() {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  const [hoteis, setHoteis] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [dados, setDados] = useState<Configuracao | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    void chamarApi<{ hoteis: Hotel[] }>('/api/v1/hoteis').then((r) => {
      if (!r.ok) return setAviso({ tipo: 'erro', erro: r.erro });
      setHoteis(r.dados.hoteis);
      setHotelId((atual) => atual || r.dados.hoteis[0]?.id || '');
    });
  }, []);

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
      <input
        name="pais"
        defaultValue={r.pais ?? ''}
        placeholder={t('admin.configuracao.campo.pais')}
        aria-label={t('admin.configuracao.campo.pais')}
        required={!herda}
      />
      <input
        name="subdivisao"
        defaultValue={r.subdivisao ?? ''}
        placeholder={t('admin.configuracao.campo.subdivisao')}
        aria-label={t('admin.configuracao.campo.subdivisao')}
      />
      <input
        name="moeda"
        defaultValue={r.moeda ?? ''}
        placeholder={t('admin.configuracao.campo.moeda')}
        aria-label={t('admin.configuracao.campo.moeda')}
        required={!herda}
      />
      <select
        name="idiomaPadrao"
        defaultValue={r.idiomaPadrao ?? ''}
        aria-label={t('admin.configuracao.campo.idioma')}
      >
        {herda && <option value="">{t('admin.configuracao.herda')}</option>}
        {IDIOMAS.map((i) => (
          <option key={i} value={i}>
            {nomeDoIdioma(i)}
          </option>
        ))}
      </select>
    </>
  );

  if (!dados) return <p>{t('comum.carregando')}</p>;
  const aceite = dados.politicas.find((p) => p.chave === 'os.aceite_automatico');
  const prioridade = dados.politicas.find(
    (p) => p.chave === 'chamado.prioridade_padrao_por_categoria',
  );

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <a href="/">{t('comum.voltar')}</a>
      <h1>{t('admin.configuracao.titulo')}</h1>
      {aviso && (
        <p role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
          {aviso.tipo === 'ok' ? t('admin.membros.feito') : mensagemDeErro(aviso.erro)}
        </p>
      )}

      <section style={{ display: 'grid', gap: 8 }}>
        <h2>{t('admin.configuracao.grupo')}</h2>
        <form
          key={JSON.stringify(dados.tenant)}
          onSubmit={salvarTenant}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          {camposDeRegiao(dados.tenant, false)}
          <button type="submit">{t('admin.configuracao.acao.salvar')}</button>
        </form>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h2>{t('admin.configuracao.hotel')}</h2>
        <select
          aria-label={t('admin.configuracao.escolher_hotel')}
          value={hotelId}
          onChange={(e) => setHotelId(e.target.value)}
        >
          {hoteis.map((h) => (
            <option key={h.id} value={h.id}>
              {h.nome}
            </option>
          ))}
        </select>
        {dados.hotel && (
          <form
            key={JSON.stringify(dados.hotel)}
            onSubmit={salvarHotel}
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
          >
            <input
              name="fuso"
              defaultValue={dados.hotel.fuso}
              placeholder={t('admin.configuracao.campo.fuso')}
              aria-label={t('admin.configuracao.campo.fuso')}
              required
            />
            {camposDeRegiao(dados.hotel, true)}
            <button type="submit">{t('admin.configuracao.acao.salvar')}</button>
          </form>
        )}
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2>{t('admin.configuracao.politicas')}</h2>
        {aceite?.chave === 'os.aceite_automatico' && (
          <div key={JSON.stringify(aceite)} style={{ display: 'grid', gap: 6 }}>
            <h3>{t('admin.configuracao.aceite.titulo')}</h3>
            <small style={{ display: 'flex', gap: 12 }}>
              {t('admin.configuracao.aceite.resumo', {
                ligado: String(aceite.efetiva.ligado),
                dias: aceite.efetiva.dias,
              })}

              <span>{t('admin.configuracao.origem', { origem: aceite.origem })}</span>
            </small>
            <form
              style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
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
              <label style={{ display: 'flex', gap: 4 }}>
                <input type="checkbox" name="ligado" defaultChecked={aceite.efetiva.ligado} />
                {t('admin.configuracao.aceite.ligado')}
              </label>
              <label style={{ display: 'flex', gap: 4 }}>
                {t('admin.configuracao.aceite.dias')}
                <input
                  type="number"
                  name="dias"
                  min={1}
                  max={60}
                  defaultValue={aceite.efetiva.dias}
                />
              </label>
              <button type="submit" value="grupo">
                {t('admin.configuracao.acao.gravar_grupo')}
              </button>
              {dados.hotel && (
                <button type="submit" value="hotel">
                  {t('admin.configuracao.acao.gravar_hotel')}
                </button>
              )}
            </form>
            <div style={{ display: 'flex', gap: 8 }}>
              {aceite.grupo && (
                <button onClick={() => void gravarPolitica('os.aceite_automatico', 'grupo', null)}>
                  {t('admin.configuracao.acao.herdar_grupo')}
                </button>
              )}
              {aceite.hotel && (
                <button onClick={() => void gravarPolitica('os.aceite_automatico', 'hotel', null)}>
                  {t('admin.configuracao.acao.herdar_hotel')}
                </button>
              )}
            </div>
          </div>
        )}
        {prioridade && (
          <div style={{ display: 'grid', gap: 6 }}>
            <h3>{t('admin.configuracao.prioridade.titulo')}</h3>
            <small style={{ display: 'flex', gap: 12 }}>
              {t('admin.configuracao.prioridade.resumo', {
                n: Object.keys(prioridade.efetiva).length,
              })}

              <span>{t('admin.configuracao.origem', { origem: prioridade.origem })}</span>
            </small>
          </div>
        )}
      </section>
    </main>
  );
}
