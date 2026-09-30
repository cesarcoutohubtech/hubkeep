// Abertura de chamado no PWA (fase 1a, C2): funciona sem rede. O local e o
// ativo vêm da referência guardada no aparelho (B3b); a abertura vira
// operação da fila (chamado.abrir, ADR-025), com a chave gerada no aparelho:
// o reenvio não duplica o chamado. O aparelho valida com as mesmas regras do
// domínio que o servidor usa (UH pendente de licença, ativo no local,
// descrição); o servidor confere de novo e resolve a prioridade e a situação.
// A foto do chamado vai pelo web, com rede; a foto sem rede entra com a OS (C4).
// Com o ativo escolhido, quem abre pode marcar o equipamento como parado (C5):
// a parada aberta nasce com o chamado, desde a hora da abertura no aparelho.
import {
  ErroDeDominio,
  NaoEncontrado,
  exigirAtivoDoChamado,
  exigirAtivoNoChamado,
  exigirLocalParaChamado,
  normalizarDescricaoDoChamado,
} from '@hubkeep/dominio';
import { type FormEvent, useState } from 'react';
import { useT } from '../i18n';
import type { Referencia } from '../referencia/banco';
import { useMotivo } from './FilaDoDia';

export interface AberturaDeChamado {
  localId: string;
  ativoId: string | null;
  descricao: string;
  /** Equipamento parado desde (ISO 8601; C5); null se não marcou. */
  paradoDesde: string | null;
}

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

  if (!referencia) {
    return (
      <main className="cartao">
        <button onClick={props.aoVoltar}>{t('comum.voltar')}</button>
        <p>{t('tecnico.ativos.sem_referencia')}</p>
      </main>
    );
  }

  // Os desativados não aparecem; a UH pendente aparece, e a recusa diz o motivo.
  const locais = (referencia.locais[hotelId] ?? []).filter((l) => l.status !== 'inativo');
  const ativos = (referencia.ativos[hotelId] ?? []).filter((a) => a.localId === localId && a.ativo);

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
      await props.aoAbrir({
        localId: local.id,
        ativoId,
        descricao,
        paradoDesde: parado ? new Date().toISOString() : null,
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
    <main className="cartao">
      <header className="linha">
        <strong>{t('tecnico.chamado.titulo')}</strong>
        <button onClick={props.aoVoltar}>{t('comum.voltar')}</button>
      </header>
      {aviso?.tipo === 'ok' && <p role="status">{t('tecnico.chamado.enfileirado')}</p>}
      {aviso?.tipo === 'erro' && (
        <p role="alert" data-codigo={aviso.codigo}>
          {motivo(aviso.codigo)}
        </p>
      )}
      <form className="coluna" onSubmit={(e) => void enviar(e)}>
        {referencia.hoteis.length > 1 && (
          <select
            aria-label={t('tecnico.chamado.hotel')}
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
          </select>
        )}
        <select
          aria-label={t('tecnico.chamado.local')}
          value={localId}
          onChange={(e) => setLocalId(e.target.value)}
          required
        >
          <option value="">{t('tecnico.chamado.escolha_o_local')}</option>
          {locais.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome}
            </option>
          ))}
        </select>
        <select
          key={localId}
          name="ativoId"
          aria-label={t('tecnico.chamado.ativo')}
          defaultValue=""
        >
          <option value="">{t('tecnico.chamado.sem_ativo')}</option>
          {ativos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>
        <label className="linha">
          <input type="checkbox" name="parado" />
          {t('tecnico.chamado.parado')}
        </label>
        <textarea
          name="descricao"
          aria-label={t('tecnico.chamado.descricao')}
          placeholder={t('tecnico.chamado.descricao')}
          rows={4}
          required
        />
        <button type="submit">{t('tecnico.chamado.acao.abrir')}</button>
      </form>
    </main>
  );
}
