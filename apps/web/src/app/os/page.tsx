'use client';
// Lista de OS (fase 1a, C7): as do escopo de quem vê (a API recorta pela
// RLS), com os filtros da lista de chamados (a prioridade é a do chamado) e 50
// por página. Cada OS abre o detalhe do chamado dela.
import { useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../cliente/api';
import {
  Aviso,
  type OsResumida,
  FILTRO_VAZIO,
  type FiltroDaTela,
  FiltrosDaLista,
  ItemDeOs,
  type Referencias,
  caminhoDaLista,
  carregarReferencias,
} from '../../cliente/corretiva';
import { useT } from '../../i18n/cliente';

interface Pagina {
  os: OsResumida[];
  proximo: string | null;
}

export default function OrdensDeServico() {
  const t = useT();
  const [refs, setRefs] = useState<Referencias | null>(null);
  const [filtro, setFiltro] = useState<FiltroDaTela>(FILTRO_VAZIO);
  const [lista, setLista] = useState<OsResumida[] | null>(null);
  const [proximo, setProximo] = useState<string | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);

  const carregar = useCallback(async (f: FiltroDaTela, depoisDe: string | null) => {
    const r = await chamarApi<Pagina>(caminhoDaLista('/api/v1/os', f, depoisDe));
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setErro(null);
    setLista((atuais) => (depoisDe ? [...(atuais ?? []), ...r.dados.os] : r.dados.os));
    setProximo(r.dados.proximo);
  }, []);

  useEffect(() => {
    void carregarReferencias().then(setRefs);
  }, []);
  useEffect(() => {
    void carregar(filtro, null);
  }, [carregar, filtro]);

  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <a href="/">{t('comum.voltar')}</a>
      <h1>{t('corretiva.os.titulo')}</h1>
      <FiltrosDaLista entidade="os" refs={refs} aoFiltrar={setFiltro} />
      <Aviso aviso={erro && { tipo: 'erro', erro }} />
      {lista === null ? (
        !erro && <p>{t('comum.carregando')}</p>
      ) : lista.length === 0 ? (
        <p>{t('corretiva.os.vazio')}</p>
      ) : (
        <ul style={{ display: 'grid', gap: 12 }}>
          {lista.map((o) => (
            <ItemDeOs key={o.id} o={o} refs={refs} />
          ))}
        </ul>
      )}
      {proximo && (
        <button type="button" onClick={() => void carregar(filtro, proximo)}>
          {t('corretiva.carregar_mais')}
        </button>
      )}
    </main>
  );
}
