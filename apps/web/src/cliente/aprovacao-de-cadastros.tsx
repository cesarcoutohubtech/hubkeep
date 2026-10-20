'use client';
// Fila de aprovação do cadastro dos ativos do hotel (fase 1b, M4): os ativos
// que chegaram pelo PWA com a política ativo.aprovacao_do_cadastro ligada e
// ainda esperam a decisão, do mais antigo. Aprovar libera o ativo para os
// planos; recusar pede o motivo e desativa o ativo. Quem vê e decide é a
// gestão do hotel (a API recusa os outros); a tela só mostra e chama. O teste
// da tela entra com a lista já carregada (inicial).
import { Botao, Campo, Entrada, MensagemVazia, Painel } from '@hubkeep/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { chamarApi } from './api';
import { Aviso, type AvisoDeAcao } from './aviso';
import { SeletorDeHotel, useHoteis } from './cadastro';
import { useT } from '../i18n/cliente';

export interface CadastroPendente {
  id: string;
  localId: string;
  localNome: string;
  categoriaId: string | null;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  versao: number;
  criadoEm: string;
}

export function ListaDeCadastrosPendentes({
  cadastros,
  executar,
}: {
  cadastros: readonly CadastroPendente[];
  executar: (caminho: string, init: RequestInit) => Promise<void>;
}) {
  const t = useT();
  const intl = useIntl();
  const decidir = (c: CadastroPendente, decisao: 'aprovado' | 'recusado', motivo: string | null) =>
    executar(`/api/v1/ativos/${c.id}/decisao-do-cadastro`, {
      method: 'POST',
      body: JSON.stringify({ decisao, motivo, versao: c.versao }),
    });
  function recusar(ev: FormEvent<HTMLFormElement>, c: CadastroPendente) {
    ev.preventDefault();
    const motivo = String(new FormData(ev.currentTarget).get('motivo') ?? '').trim();
    void decidir(c, 'recusado', motivo);
  }

  if (cadastros.length === 0) {
    return <MensagemVazia>{t('admin.aprovacao_cadastro.vazio')}</MensagemVazia>;
  }
  return (
    <ul className="hk-lista hk-itens">
      {cadastros.map((c) => (
        <li key={`${c.id}|${c.versao}`}>
          <div className="hk-item-cabecalho">
            <strong>{c.nome}</strong>
          </div>
          <p className="hk-suave hk-em-linha">
            <span>{t('admin.aprovacao_cadastro.local', { local: c.localNome })}</span>
            {[c.fabricante, c.modelo, c.numeroSerie].some(Boolean) ? (
              <span>{[c.fabricante, c.modelo, c.numeroSerie].filter(Boolean).join(' · ')}</span>
            ) : null}
            <span>
              {t('admin.aprovacao_cadastro.cadastrado_em', {
                data: intl.formatDate(c.criadoEm, { dateStyle: 'short', timeStyle: 'short' }),
              })}
            </span>
          </p>
          <div className="hk-linha-de-botoes">
            <Botao
              tamanho="pequeno"
              variante="primario"
              onClick={() => void decidir(c, 'aprovado', null)}
            >
              {t('admin.aprovacao_cadastro.aprovar')}
            </Botao>
          </div>
          <form className="hk-em-linha" onSubmit={(ev) => recusar(ev, c)}>
            <Campo rotulo={t('admin.aprovacao_cadastro.motivo')}>
              {(p) => <Entrada {...p} name="motivo" maxLength={500} required />}
            </Campo>
            <Botao type="submit" tamanho="pequeno">
              {t('admin.aprovacao_cadastro.recusar')}
            </Botao>
          </form>
        </li>
      ))}
    </ul>
  );
}

export function FilaDeAprovacao({ inicial }: { inicial?: CadastroPendente[] }) {
  const t = useT();
  const { hoteis, hotelId, setHotelId, erro: erroDosHoteis } = useHoteis();
  const [cadastros, setCadastros] = useState<CadastroPendente[] | null>(inicial ?? null);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    if (!hotelId) return;
    const r = await chamarApi<{ cadastros: CadastroPendente[] }>(
      `/api/v1/hoteis/${hotelId}/cadastros-pendentes`,
    );
    if (r.ok) setCadastros(r.dados.cadastros);
    else {
      setCadastros([]);
      setAviso({ tipo: 'erro', erro: r.erro });
    }
  }, [hotelId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function executar(caminho: string, init: RequestInit) {
    const r = await chamarApi<unknown>(caminho, init);
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregar();
  }

  return (
    <Painel>
      <div className="hk-filtros">
        <SeletorDeHotel
          rotulo={t('admin.aprovacao_cadastro.escolher_hotel')}
          hoteis={hoteis}
          valor={hotelId}
          aoEscolher={setHotelId}
        />
      </div>
      <p className="hk-suave">{t('admin.aprovacao_cadastro.dica')}</p>
      <Aviso aviso={erroDosHoteis ? { tipo: 'erro', erro: erroDosHoteis } : aviso} />
      {cadastros === null ? (
        <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
      ) : (
        <ListaDeCadastrosPendentes cadastros={cadastros} executar={executar} />
      )}
    </Painel>
  );
}
