'use client';
// QR em lote (fase 1b, M3): a folha de etiquetas dos ativos do hotel, com o
// filtro por local e por categoria e o tamanho da etiqueta. A lista vem da
// API (só o escopo de quem pede); a folha é gerada e impressa no navegador.
// As etiquetas de uma importação saem da tela da importação (M2). Os códigos
// reservados, gerados antes do cadastro, são o outro modo da tela.
import { type Idioma, resolverNome } from '@hubkeep/i18n';
import { Campo, MensagemVazia, Painel, Selecao } from '@hubkeep/ui';
import { useEffect, useMemo, useState } from 'react';
import { chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import { SeletorDeHotel, useHoteis } from '../../../../cliente/cadastro';
import {
  type AtivoDaEtiqueta,
  BarraDasEtiquetas,
  FolhaDeEtiquetas,
  SeletorDeTamanho,
  type TamanhoDeEtiqueta,
  ativosDaFolha,
} from '../../../../cliente/etiquetas';
import { CodigosReservados } from '../../../../cliente/qr-reservados';
import { useIdioma, useT } from '../../../../i18n/cliente';

const PADRAO = [
  'refrigeracao',
  'eletrica',
  'hidraulica',
  'elevadores',
  'cozinha',
  'lavanderia',
  'mobiliario',
  'eletronicos',
  'piscina',
  'seguranca',
] as const;
interface Categoria {
  id: string;
  chavePadrao: string | null;
  nomes: Partial<Record<Idioma, string>>;
}
interface Local {
  id: string;
  nome: string;
}

export default function EtiquetasDosAtivos() {
  const t = useT();
  const { idioma } = useIdioma();
  const { hoteis, hotelId, setHotelId, erro: erroDosHoteis } = useHoteis();
  const [categorias, setCategorias] = useState<{
    idiomaPadrao: Idioma;
    categorias: Categoria[];
  } | null>(null);
  const [locais, setLocais] = useState<Local[]>([]);
  const [ativos, setAtivos] = useState<AtivoDaEtiqueta[] | null>(null);
  const [localId, setLocalId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [tamanho, setTamanho] = useState<TamanhoDeEtiqueta>('media');
  const [modo, setModo] = useState<'ativos' | 'reservados'>('ativos');
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  useEffect(() => {
    void chamarApi<{ idiomaPadrao: Idioma; categorias: Categoria[] }>(
      '/api/v1/categorias-de-ativo',
    ).then((r) => (r.ok ? setCategorias(r.dados) : setAviso({ tipo: 'erro', erro: r.erro })));
  }, []);

  useEffect(() => {
    if (!hotelId) return;
    setAtivos(null);
    setLocalId('');
    void Promise.all([
      chamarApi<{ locais: Local[] }>(`/api/v1/hoteis/${hotelId}/locais`),
      chamarApi<{ ativos: AtivoDaEtiqueta[] }>(`/api/v1/hoteis/${hotelId}/ativos`),
    ]).then(([l, a]) => {
      if (l.ok) setLocais(l.dados.locais);
      if (a.ok) setAtivos(a.dados.ativos);
      if (!l.ok) setAviso({ tipo: 'erro', erro: l.erro });
      else if (!a.ok) setAviso({ tipo: 'erro', erro: a.erro });
      else setAviso(null);
    });
  }, [hotelId]);

  const daFolha = useMemo(
    () =>
      ativos
        ? ativosDaFolha(
            ativos,
            { localId: localId || undefined, categoriaId: categoriaId || undefined },
            idioma,
          )
        : null,
    [ativos, localId, categoriaId, idioma],
  );

  const idiomaPadrao = categorias?.idiomaPadrao ?? 'pt-BR';
  const nomeDaCategoria = (c: Categoria) =>
    resolverNome(c.nomes, idioma, {
      doCatalogo:
        c.chavePadrao && (PADRAO as readonly string[]).includes(c.chavePadrao)
          ? t(`categoria_ativo.padrao.${c.chavePadrao as (typeof PADRAO)[number]}` as const)
          : null,
      idiomaPadrao,
    }) ?? c.id;

  return (
    <Painel>
      <div className="hk-filtros hk-nao-imprimir">
        <SeletorDeHotel
          rotulo={t('etiquetas.hotel')}
          hoteis={hoteis}
          valor={hotelId}
          aoEscolher={setHotelId}
        />
        <Campo rotulo={t('etiquetas.modo')}>
          {(p) => (
            <Selecao
              {...p}
              value={modo}
              onChange={(e) => setModo(e.target.value === 'reservados' ? 'reservados' : 'ativos')}
            >
              {(['ativos', 'reservados'] as const).map((m) => (
                <option key={m} value={m}>
                  {t('etiquetas.modo_opcao', { modo: m })}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <SeletorDeTamanho valor={tamanho} aoEscolher={setTamanho} />
      </div>
      {modo === 'reservados' ? (
        hotelId ? (
          <CodigosReservados key={hotelId} hotelId={hotelId} tamanho={tamanho} />
        ) : null
      ) : (
        <>
          <div className="hk-filtros hk-nao-imprimir">
            <Campo rotulo={t('etiquetas.local')}>
              {(p) => (
                <Selecao {...p} value={localId} onChange={(e) => setLocalId(e.target.value)}>
                  <option value="">{t('etiquetas.todos_os_locais')}</option>
                  {locais.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo={t('etiquetas.categoria')}>
              {(p) => (
                <Selecao
                  {...p}
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                >
                  <option value="">{t('etiquetas.todas_as_categorias')}</option>
                  {(categorias?.categorias ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {nomeDaCategoria(c)}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
          </div>
          <p className="hk-suave hk-nao-imprimir">{t('etiquetas.dica')}</p>
          <div className="hk-nao-imprimir">
            <Aviso aviso={erroDosHoteis ? { tipo: 'erro', erro: erroDosHoteis } : aviso} />
          </div>
          {daFolha === null ? (
            <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
          ) : (
            <>
              <BarraDasEtiquetas total={daFolha.length} />
              <FolhaDeEtiquetas ativos={daFolha} tamanho={tamanho} />
            </>
          )}
        </>
      )}
    </Painel>
  );
}
