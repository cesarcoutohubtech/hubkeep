'use client';
// Lista de chamados (fase 1a, C7): os do escopo de quem vê (a API recorta pela
// RLS), com os filtros básicos e 50 por página. Cada chamado abre o detalhe.
import { useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../cliente/api';
import {
  Aviso,
  type ChamadoResumido,
  FILTRO_VAZIO,
  type FiltroDaTela,
  FiltrosDaLista,
  ItemDeChamado,
  type Referencias,
  caminhoDaLista,
  carregarReferencias,
} from '../../../cliente/corretiva';
import { useT } from '../../../i18n/cliente';

interface Pagina {
  chamados: ChamadoResumido[];
  proximo: string | null;
}

export default function Chamados() {
  const t = useT();
  const [refs, setRefs] = useState<Referencias | null>(null);
  const [filtro, setFiltro] = useState<FiltroDaTela>(FILTRO_VAZIO);
  const [chamados, setChamados] = useState<ChamadoResumido[] | null>(null);
  const [proximo, setProximo] = useState<string | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);

  const carregar = useCallback(async (f: FiltroDaTela, depoisDe: string | null) => {
    const r = await chamarApi<Pagina>(caminhoDaLista('/api/v1/chamados', f, depoisDe));
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setErro(null);
    setChamados((atuais) =>
      depoisDe ? [...(atuais ?? []), ...r.dados.chamados] : r.dados.chamados,
    );
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
      <h1>{t('corretiva.chamados.titulo')}</h1>
      <FiltrosDaLista entidade="chamado" refs={refs} aoFiltrar={setFiltro} />
      <Aviso aviso={erro && { tipo: 'erro', erro }} />
      {chamados === null ? (
        !erro && <p>{t('comum.carregando')}</p>
      ) : chamados.length === 0 ? (
        <p>{t('corretiva.chamados.vazio')}</p>
      ) : (
        <ul style={{ display: 'grid', gap: 12 }}>
          {chamados.map((c) => (
            <ItemDeChamado key={c.id} c={c} refs={refs} />
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
