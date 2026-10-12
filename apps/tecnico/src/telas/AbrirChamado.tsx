// Abertura de chamado no PWA (fase 1a, C2): funciona sem rede. O local e o
// ativo vêm da referência guardada no aparelho (B3b); a abertura vira
// operação da fila (chamado.abrir, ADR-025), com a chave gerada no aparelho:
// o reenvio não duplica o chamado. O aparelho valida com as mesmas regras do
// domínio que o servidor usa (UH pendente de licença, ativo no local,
// descrição); o servidor confere de novo e resolve a prioridade e a situação.
// A foto do chamado vai pelo web, com rede; a foto sem rede entra com a OS (C4).
// Com o ativo escolhido, quem abre pode marcar o equipamento como parado (C5):
// a parada aberta nasce com o chamado, desde a hora da abertura no aparelho.
// Na I4, quem abre responde se afeta hóspede (sim, não ou não sei) e, num
// chamado de UH, se a UH ficou indisponível: o período aberto da UH nasce com
// o chamado, também desde a hora da abertura no aparelho.
import {
  ErroDeDominio,
  NaoEncontrado,
  exigirAtivoDoChamado,
  exigirAtivoNoChamado,
  exigirLocalParaChamado,
  exigirUhParaIndisponibilidade,
  normalizarDescricaoDoChamado,
} from '@hubkeep/dominio';
import {
  AreaDeTexto,
  Botao,
  Campo,
  MensagemDeErro,
  MensagemVazia,
  Painel,
  Selecao,
} from '@hubkeep/ui';
import { type FormEvent, useState } from 'react';
import { useT } from '../i18n';
import type { Referencia } from '../referencia/banco';
import { useMotivo } from './FilaDoDia';
import { TelaDoTecnico } from './TelaDoTecnico';
import { nomeDoLocal } from '../locais';

export interface AberturaDeChamado {
  localId: string;
  ativoId: string | null;
  descricao: string;
  /** Equipamento parado desde (ISO 8601; C5); null se não marcou. */
  paradoDesde: string | null;
  /** Afeta hóspede? null: não sei (I4). */
  impactoHospede: boolean | null;
  /** A UH indisponível desde (ISO 8601; I4); null se não marcou. */
  uhIndisponivelDesde: string | null;
}

/** O valor do seletor "afeta hóspede?" como a operação leva (I4). */
export const impactoDoValor = (valor: string): boolean | null =>
  valor === 'sim' ? true : valor === 'nao' ? false : null;

export function AbrirChamado(props: {
  referencia: Referencia | null;
  aoAbrir: (pedido: AberturaDeChamado) => Promise<void>;
  aoVoltar: () => void;
}) {
  const t = useT();
  const motivo = useMotivo();
  const { referencia } = props;
  const [hotelId, setHotelId] = useState(referencia?.hoteis[0]?.id ?? '');
  const [localId, setLocalId] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' } | { tipo: 'erro'; codigo: string } | null>(
    null,
  );

  const voltar = (
    <Botao tamanho="pequeno" onClick={props.aoVoltar}>
      {t('comum.voltar')}
    </Botao>
  );

  if (!referencia) {
    return (
      <TelaDoTecnico titulo={t('tecnico.chamado.titulo')} acao={voltar}>
        <MensagemVazia>{t('tecnico.ativos.sem_referencia')}</MensagemVazia>
      </TelaDoTecnico>
    );
  }

  // Os desativados não aparecem; a UH pendente aparece, e a recusa diz o motivo.
  const locais = (referencia.locais[hotelId] ?? []).filter((l) => l.status !== 'inativo');
  const ativos = (referencia.ativos[hotelId] ?? []).filter((a) => a.localId === localId && a.ativo);
  // Só a UH fica indisponível; a referência guardada antes da I4 não tem o tipo.
  const ehUh = locais.find((l) => l.id === localId)?.tipo === 'uh';

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const f = new FormData(formulario);
    try {
      const local = locais.find((l) => l.id === localId);
      if (!local) throw new NaoEncontrado('local_nao_encontrado', 'Local não encontrado.');
      exigirLocalParaChamado(local);
      const ativoId = String(f.get('ativoId') ?? '') || null;
      const ativo = ativos.find((a) => a.id === ativoId);
      if (ativoId !== null && !ativo)
        throw new NaoEncontrado('ativo_nao_encontrado', 'Ativo não encontrado.');
      if (ativo) exigirAtivoDoChamado({ localId: ativo.localId, desativadoEm: null }, local.id);
      const descricao = normalizarDescricaoDoChamado(String(f.get('descricao') ?? ''));
      const parado = f.get('parado') === 'on';
      if (parado) exigirAtivoNoChamado(ativoId);
      const uhIndisponivel = f.get('uhIndisponivel') === 'on';
      if (uhIndisponivel) exigirUhParaIndisponibilidade({ tipo: local.tipo ?? 'area_comum' });
      const agora = new Date().toISOString();
      await props.aoAbrir({
        localId: local.id,
        ativoId,
        descricao,
        paradoDesde: parado ? agora : null,
        impactoHospede: impactoDoValor(String(f.get('impacto') ?? '')),
        uhIndisponivelDesde: uhIndisponivel ? agora : null,
      });
      formulario.reset();
      setLocalId('');
      setAviso({ tipo: 'ok' });
    } catch (erro) {
      if (!(erro instanceof ErroDeDominio)) throw erro;
      setAviso({ tipo: 'erro', codigo: erro.codigo });
    }
  }

  return (
    <TelaDoTecnico titulo={t('tecnico.chamado.titulo')} acao={voltar}>
      {aviso?.tipo === 'ok' && (
        <p role="status" className="tc-nota">
          {t('tecnico.chamado.enfileirado')}
        </p>
      )}
      {aviso?.tipo === 'erro' && (
        <MensagemDeErro>
          <span data-codigo={aviso.codigo}>{motivo(aviso.codigo)}</span>
        </MensagemDeErro>
      )}
      <Painel>
        <form onSubmit={(e) => void enviar(e)}>
          {referencia.hoteis.length > 1 && (
            <Campo rotulo={t('tecnico.chamado.hotel')}>
              {(p) => (
                <Selecao
                  {...p}
                  value={hotelId}
                  onChange={(e) => {
                    setHotelId(e.target.value);
                    setLocalId('');
                  }}
                >
                  {referencia.hoteis.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.nome}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
          )}
          <Campo rotulo={t('tecnico.chamado.local')}>
            {(p) => (
              <Selecao {...p} value={localId} onChange={(e) => setLocalId(e.target.value)} required>
                <option value="">{t('tecnico.chamado.escolha_o_local')}</option>
                {locais.map((l) => (
                  <option key={l.id} value={l.id}>
                    {nomeDoLocal(t, l)}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo={t('tecnico.chamado.ativo')}>
            {(p) => (
              <Selecao {...p} key={localId} name="ativoId" defaultValue="">
                <option value="">{t('tecnico.chamado.sem_ativo')}</option>
                {ativos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <label className="tc-marcar">
            <input type="checkbox" name="parado" />
            {t('tecnico.chamado.parado')}
          </label>
          {ehUh && (
            <label className="tc-marcar">
              <input type="checkbox" name="uhIndisponivel" />
              {t('tecnico.chamado.uh_indisponivel')}
            </label>
          )}
          <Campo rotulo={t('tecnico.chamado.impacto')}>
            {(p) => (
              <Selecao {...p} name="impacto" defaultValue="nao_sei">
                <option value="nao_sei">{t('tecnico.chamado.impacto_nao_sei')}</option>
                <option value="sim">{t('tecnico.chamado.impacto_sim')}</option>
                <option value="nao">{t('tecnico.chamado.impacto_nao')}</option>
              </Selecao>
            )}
          </Campo>
          <Campo rotulo={t('tecnico.chamado.descricao')}>
            {(p) => <AreaDeTexto {...p} name="descricao" rows={4} required />}
          </Campo>
          <div className="tc-acoes">
            <Botao type="submit" variante="primario">
              {t('tecnico.chamado.acao.abrir')}
            </Botao>
          </div>
        </form>
      </Painel>
    </TelaDoTecnico>
  );
}
