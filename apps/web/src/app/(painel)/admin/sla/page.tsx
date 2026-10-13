'use client';
// Políticas do SLA (fase 1c; ADR-042 e ADR-043): os prazos, o horário de
// atendimento e os avisos do monitor, gravados no grupo, na bandeira do hotel
// ou no hotel, como a configuração. Todos leem; a API recusa a gravação de quem
// não é Admin do grupo. O chamado guarda a política do momento da abertura: a
// mudança vale para os próximos. Visual do pacote de interface (ADR-038).
import { CATALOGOS, IDIOMAS, type Idioma, resolverNome } from '@hubkeep/i18n';
import { MensagemVazia, Nota, Painel } from '@hubkeep/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import {
  BlocosDoSla,
  type ChaveDoSla,
  type EscopoDoBotao,
  type PoliticaDoSla,
} from '../../../../cliente/blocos-do-sla';
import { SeletorDeHotel, useHoteis } from '../../../../cliente/cadastro';
import {
  CORRETIVA_VAZIA,
  type SituacoesEPrioridades,
  useNomes,
} from '../../../../cliente/corretiva';
import { useIdioma, useT } from '../../../../i18n/cliente';

interface Configuracao {
  hotel: { id: string; bandeira: { id: string; nome: string } | null } | null;
  politicas: { chave: string }[];
}
type Rotulos = Partial<Record<Idioma, string>>;
interface Categoria {
  id: string;
  chavePadrao: string | null;
  nomes: Rotulos;
  ativa: boolean;
}

const politicaDe = <C extends ChaveDoSla>(dados: Configuracao, chave: C) =>
  dados.politicas.find((p) => p.chave === chave) as
    Extract<PoliticaDoSla, { chave: C }> | undefined;

export default function PoliticasDoSla() {
  const t = useT();
  const { idioma } = useIdioma();
  const { hoteis, hotelId, setHotelId, erro: erroDosHoteis } = useHoteis();
  const [dados, setDados] = useState<Configuracao | null>(null);
  const [corretiva, setCorretiva] = useState<SituacoesEPrioridades>(CORRETIVA_VAZIA);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    const [r, sp, c] = await Promise.all([
      chamarApi<Configuracao>(`/api/v1/configuracao${hotelId ? `?hotelId=${hotelId}` : ''}`),
      chamarApi<SituacoesEPrioridades>('/api/v1/situacoes-e-prioridades'),
      chamarApi<{ categorias: Categoria[] }>('/api/v1/categorias-de-ativo'),
    ]);
    if (r.ok) setDados(r.dados);
    else setAviso({ tipo: 'erro', erro: r.erro });
    if (sp.ok) setCorretiva(sp.dados);
    if (c.ok) setCategorias(c.dados.categorias);
  }, [hotelId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const refs = useMemo(() => ({ hoteis: [], corretiva }), [corretiva]);
  const nomes = useNomes(refs);
  const idiomaDoTexto: Idioma = (IDIOMAS as readonly string[]).includes(idioma)
    ? (idioma as Idioma)
    : corretiva.idiomaPadrao;
  const prioridades = corretiva.prioridades
    .filter((p) => p.ativa)
    .map((p) => ({ id: p.id, chavePadrao: p.chavePadrao, nome: nomes.prioridade(p.id) }));
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
          idiomaPadrao: corretiva.idiomaPadrao,
        }) ?? c.id,
    }));

  async function gravar(chave: ChaveDoSla, escopo: EscopoDoBotao, valor: unknown) {
    const bandeiraId = dados?.hotel?.bandeira?.id;
    if (escopo === 'bandeira' && !bandeiraId) return;
    const r = await chamarApi<Configuracao>(
      `/api/v1/politicas${hotelId ? `?hotelId=${hotelId}` : ''}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          chave,
          escopo:
            escopo === 'hotel'
              ? { tipo: 'hotel', hotelId }
              : escopo === 'bandeira'
                ? { tipo: 'bandeira', bandeiraId }
                : { tipo: 'grupo' },
          valor,
        }),
      },
    );
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    if (r.ok) setDados(r.dados);
  }

  if (!dados) {
    return (
      <>
        <Aviso aviso={erroDosHoteis ? { tipo: 'erro', erro: erroDosHoteis } : aviso} />
        <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      </>
    );
  }

  return (
    <div className="hk-pilha">
      <Aviso aviso={erroDosHoteis ? { tipo: 'erro', erro: erroDosHoteis } : aviso} />
      <Painel titulo={t('admin.sla.titulo')}>
        <div className="hk-pilha">
          <Nota>{t('admin.sla.explicacao')}</Nota>
          <div className="hk-filtros">
            <SeletorDeHotel
              rotulo={t('admin.sla.escolher_hotel')}
              hoteis={hoteis}
              valor={hotelId}
              aoEscolher={setHotelId}
            />
          </div>
          <BlocosDoSla
            sla={politicaDe(dados, 'chamado.sla')}
            horario={politicaDe(dados, 'hotel.horario_atendimento')}
            escalonamento={politicaDe(dados, 'chamado.escalonamento')}
            prioridades={prioridades}
            categorias={categoriasAtivas}
            temHotel={dados.hotel !== null}
            temBandeira={dados.hotel?.bandeira != null}
            aoGravar={(chave, escopo, valor) => void gravar(chave, escopo, valor)}
          />
        </div>
      </Painel>
    </div>
  );
}
