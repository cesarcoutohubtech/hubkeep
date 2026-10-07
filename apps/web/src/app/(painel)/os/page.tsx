'use client';
// Lista de OS (fase 1a, C7): as do escopo de quem vê (a API recorta pela
// RLS), com os filtros da lista de chamados (a prioridade é a do chamado) e 50
// por página. Cada OS abre o detalhe do chamado dela.
import { Botao, MensagemVazia, Painel, Tabela } from '@hubkeep/ui';
import { useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../cliente/api';
import {
  Aviso,
  ColunasDeOs,
  FILTRO_VAZIO,
  type FiltroDaTela,
  FiltrosDaLista,
  LinhaDeOs,
  type OsResumida,
  type Referencias,
  caminhoDaLista,
  carregarReferencias,
} from '../../../cliente/corretiva';
import { useT } from '../../../i18n/cliente';

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
    <Painel>
      <FiltrosDaLista entidade="os" refs={refs} aoFiltrar={setFiltro} />
      <Aviso aviso={erro && { tipo: 'erro', erro }} />
      {lista === null ? (
        !erro && <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : lista.length === 0 ? (
        <MensagemVazia>{t('corretiva.os.vazio')}</MensagemVazia>
      ) : (
        <Tabela legenda={t('corretiva.os.titulo')}>
          <ColunasDeOs />
          <tbody>
            {lista.map((o) => (
              <LinhaDeOs key={o.id} o={o} refs={refs} />
            ))}
          </tbody>
        </Tabela>
      )}
      {proximo && (
        <div className="hk-mensagem-acao">
          <Botao onClick={() => void carregar(filtro, proximo)}>
            {t('corretiva.carregar_mais')}
          </Botao>
        </div>
      )}
    </Painel>
  );
}
