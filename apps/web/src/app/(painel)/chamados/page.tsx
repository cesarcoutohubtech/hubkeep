'use client';
// Lista de chamados (fase 1a, C7): os do escopo de quem vê (a API recorta pela
// RLS), com os filtros básicos e 50 por página. Cada chamado abre o detalhe.
import { Botao, MensagemVazia, Painel, Tabela } from '@hubkeep/ui';
import { useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../cliente/api';
import {
  Aviso,
  type ChamadoResumido,
  ColunasDeChamado,
  FILTRO_VAZIO,
  type FiltroDaTela,
  FiltrosDaLista,
  LinhaDeChamado,
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
    <Painel>
      <FiltrosDaLista entidade="chamado" refs={refs} aoFiltrar={setFiltro} />
      <Aviso aviso={erro && { tipo: 'erro', erro }} />
      {chamados === null ? (
        !erro && <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : chamados.length === 0 ? (
        <MensagemVazia>{t('corretiva.chamados.vazio')}</MensagemVazia>
      ) : (
        <Tabela legenda={t('corretiva.chamados.titulo')}>
          <ColunasDeChamado />
          <tbody>
            {chamados.map((c) => (
              <LinhaDeChamado key={c.id} c={c} refs={refs} />
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
