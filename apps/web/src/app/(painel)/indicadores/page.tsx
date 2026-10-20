'use client';
// Painel de indicadores (1c, item 8): o período em dias (padrão: os últimos 30,
// até hoje), contados pela API no fuso de cada hotel, com a variação contra o
// período anterior do mesmo tamanho. A gestão vê os cartões da rede, o
// backlog por idade, os chamados por dia, a comparação na bandeira e a
// produtividade; o proprietário, só os cartões dos hotéis dele. Quem não pode
// ver recebe o código da API.
import { diasDoPeriodo, somarDias } from '@hubkeep/dominio';
import { Botao, Campo, Entrada, MensagemVazia, Painel, Selecao } from '@hubkeep/ui';
import { type FormEvent, useEffect, useState } from 'react';
import { chamarApi } from '../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../cliente/aviso';
import { useHoteis } from '../../../cliente/cadastro';
import {
  BacklogPorIdade,
  CartoesDoPeriodo,
  CartoesDoProprietario,
  ChamadosPorDia,
  ComparacaoNaBandeira,
  type PainelDeIndicadores,
  Produtividade,
  separarHoteis,
} from '../../../cliente/indicadores';
import { useT } from '../../../i18n/cliente';

interface Filtro {
  inicio: string;
  fim: string;
  hotelId: string;
}

const dois = (n: number) => String(n).padStart(2, '0');
const dataLocal = (d: Date) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;

const caminho = (f: Filtro) => {
  const p = new URLSearchParams({ inicio: f.inicio, fim: f.fim });
  if (f.hotelId) p.set('hotelId', f.hotelId);
  return `/api/v1/indicadores?${p.toString()}`;
};

/** O período anterior, do mesmo tamanho, terminando na véspera do início. */
const anteriorA = (f: Filtro): Filtro => {
  const dias = diasDoPeriodo({ inicio: f.inicio, fim: f.fim }).length;
  return { ...f, inicio: somarDias(f.inicio, -dias), fim: somarDias(f.inicio, -1) };
};

export default function PainelDosIndicadores() {
  const t = useT();
  const { hoteis } = useHoteis();
  const hoje = dataLocal(new Date());
  const [filtro, setFiltro] = useState<Filtro>({
    inicio: somarDias(hoje, -29),
    fim: hoje,
    hotelId: '',
  });
  const [dados, setDados] = useState<{
    atual: PainelDeIndicadores;
    anterior: PainelDeIndicadores | null;
  } | null>(null);
  const [bandeiraId, setBandeiraId] = useState('');
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  useEffect(() => {
    let vale = true;
    setDados(null);
    setAviso(null);
    void Promise.all([
      chamarApi<PainelDeIndicadores>(caminho(filtro)),
      chamarApi<PainelDeIndicadores>(caminho(anteriorA(filtro))),
    ]).then(([atual, anterior]) => {
      if (!vale) return;
      if (!atual.ok) return setAviso({ tipo: 'erro', erro: atual.erro });
      setDados({ atual: atual.dados, anterior: anterior.ok ? anterior.dados : null });
    });
    return () => {
      vale = false;
    };
  }, [filtro]);

  function aoConsultar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    setFiltro({
      inicio: String(f.get('inicio') ?? ''),
      fim: String(f.get('fim') ?? ''),
      hotelId: String(f.get('hotelId') ?? ''),
    });
  }

  const atual = dados?.atual;
  const { completos, doProprietario } = separarHoteis(atual?.hoteis ?? []);
  const bandeira = atual?.bandeiras.find((b) => b.id === bandeiraId) ?? atual?.bandeiras[0] ?? null;
  const nomeDoHotel = (id: string) => atual?.hoteis.find((h) => h.id === id)?.nome ?? id;

  return (
    <>
      <Painel>
        <form className="hk-filtros" onSubmit={aoConsultar}>
          <Campo rotulo={t('indicadores.filtro.inicio')}>
            {(p) => (
              <Entrada {...p} type="date" name="inicio" defaultValue={filtro.inicio} required />
            )}
          </Campo>
          <Campo rotulo={t('indicadores.filtro.fim')}>
            {(p) => <Entrada {...p} type="date" name="fim" defaultValue={filtro.fim} required />}
          </Campo>
          <Campo rotulo={t('indicadores.filtro.hotel')}>
            {(p) => (
              <Selecao {...p} name="hotelId" defaultValue={filtro.hotelId}>
                <option value="">{t('indicadores.filtro.todos_os_hoteis')}</option>
                {hoteis.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nome}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Botao type="submit">{t('indicadores.filtro.consultar')}</Botao>
        </form>
        <Aviso aviso={aviso} />
        {!atual ? (
          !aviso && <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
        ) : atual.hoteis.length === 0 ? (
          <MensagemVazia>{t('indicadores.vazio')}</MensagemVazia>
        ) : null}
      </Painel>

      {atual?.rede ? (
        <Painel
          titulo={t('indicadores.rede.titulo')}
          dica={t('indicadores.rede.dica', { hoteis: atual.rede.hoteis })}
        >
          <CartoesDoPeriodo
            atual={atual.rede}
            anterior={dados?.anterior?.rede ?? null}
            meta={atual.metaDeSla}
          />
          <BacklogPorIdade faixas={atual.rede.backlogPorIdade} />
          <ChamadosPorDia serie={atual.serie} />
        </Painel>
      ) : null}

      {bandeira ? (
        <Painel
          titulo={t('indicadores.comparacao.titulo')}
          dica={t('indicadores.comparacao.dica')}
          acoes={
            atual && atual.bandeiras.length > 1 ? (
              <Campo rotulo={t('indicadores.comparacao.bandeira')}>
                {(p) => (
                  <Selecao
                    {...p}
                    value={bandeira.id}
                    onChange={(e) => setBandeiraId(e.target.value)}
                  >
                    {atual.bandeiras.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nome}
                      </option>
                    ))}
                  </Selecao>
                )}
              </Campo>
            ) : undefined
          }
        >
          <ComparacaoNaBandeira bandeira={bandeira} hoteis={completos} />
        </Painel>
      ) : null}

      {atual?.rede ? (
        <Produtividade linhas={atual.produtividade} nomeDoHotel={nomeDoHotel} />
      ) : null}

      <CartoesDoProprietario hoteis={doProprietario} />
    </>
  );
}
