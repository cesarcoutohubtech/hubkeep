'use client';
// Matriz do arrendado (fase 1c; decisões 5 a 7 do Cesar, de 13/10/2026): por
// categoria de ativo, quem responde pela OS no hotel arrendado. Grava no grupo
// ou no hotel, como a configuração, sem a bandeira. Todos leem; a API recusa a
// gravação de quem não é Admin do grupo. Visual do pacote de interface (ADR-038).
import { CATALOGOS, IDIOMAS, type Idioma, resolverNome } from '@hubkeep/i18n';
import { MensagemVazia, Nota, Painel } from '@hubkeep/ui';
import { useCallback, useEffect, useState } from 'react';
import { chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import {
  BlocoDaMatriz,
  type EscopoDaMatriz,
  type PoliticaDaMatriz,
} from '../../../../cliente/blocos-do-arrendamento';
import { SeletorDeHotel, useHoteis } from '../../../../cliente/cadastro';
import { useIdioma, useT } from '../../../../i18n/cliente';

interface Configuracao {
  tenant: { idiomaPadrao: Idioma };
  hotel: { id: string; modeloContratual: string | null } | null;
  politicas: { chave: string }[];
}
type Rotulos = Partial<Record<Idioma, string>>;
interface Categoria {
  id: string;
  chavePadrao: string | null;
  nomes: Rotulos;
  ativa: boolean;
}

export default function MatrizDoArrendamento() {
  const t = useT();
  const { idioma } = useIdioma();
  const { hoteis, hotelId, setHotelId, erro: erroDosHoteis } = useHoteis();
  const [dados, setDados] = useState<Configuracao | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    const [r, c] = await Promise.all([
      chamarApi<Configuracao>(`/api/v1/configuracao${hotelId ? `?hotelId=${hotelId}` : ''}`),
      chamarApi<{ categorias: Categoria[] }>('/api/v1/categorias-de-ativo'),
    ]);
    if (r.ok) setDados(r.dados);
    else setAviso({ tipo: 'erro', erro: r.erro });
    if (c.ok) setCategorias(c.dados.categorias);
  }, [hotelId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function gravar(escopo: EscopoDaMatriz, valor: unknown) {
    if (escopo === 'hotel' && !hotelId) return;
    const r = await chamarApi<Configuracao>(
      `/api/v1/politicas${hotelId ? `?hotelId=${hotelId}` : ''}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          chave: 'hotel.matriz_arrendamento',
          escopo: escopo === 'hotel' ? { tipo: 'hotel', hotelId } : { tipo: 'grupo' },
          valor,
        }),
      },
    );
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    if (r.ok) setDados(r.dados);
  }

  const politica = dados?.politicas.find((p) => p.chave === 'hotel.matriz_arrendamento') as
    PoliticaDaMatriz | undefined;
  if (!dados || !politica) {
    return (
      <>
        <Aviso aviso={erroDosHoteis ? { tipo: 'erro', erro: erroDosHoteis } : aviso} />
        <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      </>
    );
  }

  const idiomaPadrao = dados.tenant.idiomaPadrao;
  const idiomaDoTexto: Idioma = (IDIOMAS as readonly string[]).includes(idioma)
    ? (idioma as Idioma)
    : idiomaPadrao;
  const categoriasAtivas = categorias
    .filter((c) => c.ativa)
    .map((c) => ({
      id: c.id,
      chavePadrao: c.chavePadrao,
      nome:
        resolverNome(c.nomes, idioma, {
          doCatalogo: c.chavePadrao
            ? (CATALOGOS[idiomaDoTexto][`categoria_ativo.padrao.${c.chavePadrao}`] ?? null)
            : null,
          idiomaPadrao,
        }) ?? c.id,
    }));

  return (
    <div className="hk-pilha">
      <Aviso aviso={erroDosHoteis ? { tipo: 'erro', erro: erroDosHoteis } : aviso} />
      <Painel titulo={t('admin.arrendamento.titulo')}>
        <div className="hk-pilha">
          <Nota>{t('admin.arrendamento.explicacao')}</Nota>
          <div className="hk-filtros">
            <SeletorDeHotel
              rotulo={t('admin.arrendamento.escolher_hotel')}
              hoteis={hoteis}
              valor={hotelId}
              aoEscolher={setHotelId}
            />
          </div>
          <BlocoDaMatriz
            politica={politica}
            categorias={categoriasAtivas}
            hotel={dados.hotel ? { arrendado: dados.hotel.modeloContratual === 'arrendado' } : null}
            aoGravar={(escopo, valor) => void gravar(escopo, valor)}
          />
        </div>
      </Painel>
    </div>
  );
}
