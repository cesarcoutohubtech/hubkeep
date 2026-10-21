'use client';
// Lista de chamados (fase 1a, C7): os do escopo de quem vê (a API recorta pela
// RLS), com os filtros básicos e 50 por página. Cada chamado abre o detalhe.
// A exportação (1c, item 9) leva ao CSV os mesmos filtros (exportar-chamados).
// O hotel pode vir na URL (?hotelId=), para o quadro da tela inicial abrir a
// fila do hotel; a lista só carrega depois de ler a URL.
import { Botao, MensagemVazia, Nota, Painel, Tabela } from '@hubkeep/ui';
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
  filtroDaUrl,
} from '../../../cliente/corretiva';
import { useExportarChamados } from '../../../cliente/exportar-chamados';
import { useT } from '../../../i18n/cliente';

interface Pagina {
  chamados: ChamadoResumido[];
  proximo: string | null;
}

export default function Chamados() {
  const t = useT();
  const [refs, setRefs] = useState<Referencias | null>(null);
  const [filtro, setFiltro] = useState<FiltroDaTela | null>(null);
  const [chamados, setChamados] = useState<ChamadoResumido[] | null>(null);
  const [proximo, setProximo] = useState<string | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const { estado: exportacao, exportar } = useExportarChamados(refs);

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
    setFiltro(filtroDaUrl(window.location.search));
  }, []);
  useEffect(() => {
    if (filtro) void carregar(filtro, null);
  }, [carregar, filtro]);

  return (
    <Painel>
      {filtro && (
        <FiltrosDaLista entidade="chamado" refs={refs} aoFiltrar={setFiltro} inicial={filtro} />
      )}
      <div className="hk-linha-de-botoes">
        <Botao
          tamanho="pequeno"
          disabled={exportacao?.tipo === 'lendo'}
          onClick={() => void exportar(filtro ?? FILTRO_VAZIO)}
        >
          {t('corretiva.chamados.acao.exportar')}
        </Botao>
      </div>
      {exportacao?.tipo === 'lendo' && (
        <Nota tom="info">{t('corretiva.chamados.exportando', { n: exportacao.linhas })}</Nota>
      )}
      {exportacao?.tipo === 'grande' && <Nota tom="atencao">{exportacao.texto}</Nota>}
      {exportacao?.tipo === 'feita' && <Nota tom="ok">{exportacao.texto}</Nota>}
      <Aviso aviso={exportacao?.tipo === 'erro' ? exportacao : null} />
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
          <Botao onClick={() => void carregar(filtro ?? FILTRO_VAZIO, proximo)}>
            {t('corretiva.carregar_mais')}
          </Botao>
        </div>
      )}
    </Painel>
  );
}
