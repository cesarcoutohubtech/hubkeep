// Uma OS da fila do dia no PWA (fase 1a, C4b): funciona sem rede. As ações
// (iniciar, pausar, retomar, concluir), as horas, o material e as fotos viram
// operações da fila (ADR-025), com a chave gerada no aparelho; a transição
// leva a versão da OS como está no aparelho (os/projecao.ts). O aparelho
// valida com as regras do domínio que o servidor usa (estado, horas,
// material); o servidor confere de novo, e a recusa volta à fila do dia com o
// motivo. A foto é preparada na hora e sobe quando houver rede. Com o ativo no
// chamado (C5), o técnico registra que o equipamento está parado e encerra a
// parada quando ele volta a funcionar, também pela fila. Concluir com a parada
// do chamado aberta pede a resposta "o equipamento voltou a funcionar?", que
// vai na operação de concluir (sim: a parada encerra junto).
import { ErroDeDominio, normalizarMaterial, validarApontamento } from '@hubkeep/dominio';
import { AreaDeTexto, Botao, Campo, Entrada, MensagemDeErro, Painel, Selo } from '@hubkeep/ui';
import { type FormEvent, useState } from 'react';
import { useIntl } from 'react-intl';
import { useT } from '../i18n';
import {
  type AcaoDoTecnico,
  type OsNoAparelho,
  aceitaRegistro,
  acoesPossiveis,
  paradaPossivel,
  perguntaNaConclusao,
} from '../os/projecao';
import { TOM_DO_ESTADO, rotuloDoEstado, useMotivo } from './FilaDoDia';
import { TelaDoTecnico } from './TelaDoTecnico';

export interface AcoesDaOs {
  /** Na conclusão com a parada do chamado aberta, com a resposta do técnico. */
  aoAgir: (
    os: OsNoAparelho,
    acao: AcaoDoTecnico,
    resposta?: { equipamentoVoltou: boolean },
  ) => Promise<void>;
  aoApontar: (osId: string, inicio: Date, fim: Date) => Promise<void>;
  aoRegistrarMaterial: (osId: string, descricao: string) => Promise<void>;
  aoFotografar: (osId: string, arquivo: File) => Promise<void>;
  /** Equipamento parado agora (C5). */
  aoRegistrarParada: (osId: string) => Promise<void>;
  /** Equipamento voltou a funcionar agora (C5). */
  aoEncerrarParada: (osId: string) => Promise<void>;
}

const ROTULO_DA_ACAO = {
  iniciar: 'tecnico.os.acao.iniciar',
  pausar: 'tecnico.os.acao.pausar',
  retomar: 'tecnico.os.acao.retomar',
  concluir: 'tecnico.os.acao.concluir',
} as const;

/** A pergunta obrigatória da conclusão com a parada do chamado aberta: sim, não ou desistir. */
export function PerguntaDaParada(props: {
  aoResponder: (equipamentoVoltou: boolean) => void;
  aoDesistir: () => void;
}) {
  const t = useT();
  return (
    <Painel titulo={t('tecnico.os.concluir.pergunta_parada')} nivel={3}>
      <div role="group" data-pergunta="parada" className="tc-acoes">
        <Botao variante="primario" onClick={() => props.aoResponder(true)}>
          {t('tecnico.os.concluir.voltou')}
        </Botao>
        <Botao onClick={() => props.aoResponder(false)}>
          {t('tecnico.os.concluir.nao_voltou')}
        </Botao>
        <Botao onClick={props.aoDesistir}>{t('tecnico.os.concluir.desistir')}</Botao>
      </div>
    </Painel>
  );
}

export function Os(
  props: AcoesDaOs & {
    os: OsNoAparelho;
    aoVoltar: () => void;
    /** Para testes; no app, window.confirm. */
    confirmar?: (mensagem: string) => boolean;
    /** Para testes: a tela já com a pergunta da parada aberta. */
    perguntando?: boolean;
  },
) {
  const t = useT();
  const intl = useIntl();
  const motivo = useMotivo();
  const { os } = props;
  const parada = paradaPossivel(os);
  const confirmar = props.confirmar ?? ((m: string) => window.confirm(m));
  const [aviso, setAviso] = useState<{ tipo: 'ok' } | { tipo: 'erro'; codigo: string } | null>(
    null,
  );
  const [perguntando, setPerguntando] = useState(props.perguntando ?? false);

  /** Roda o pedido; erro de regra vira aviso com o motivo pelo catálogo. */
  async function tentar(fazer: () => Promise<void>): Promise<boolean> {
    try {
      await fazer();
      setAviso({ tipo: 'ok' });
      return true;
    } catch (erro) {
      if (!(erro instanceof ErroDeDominio)) throw erro;
      setAviso({ tipo: 'erro', codigo: erro.codigo });
      return false;
    }
  }

  async function agir(acao: AcaoDoTecnico) {
    // Com a parada do chamado aberta, a resposta à pergunta é a confirmação.
    if (acao === 'concluir' && perguntaNaConclusao(os)) return setPerguntando(true);
    if (acao === 'concluir' && !confirmar(t('tecnico.os.concluir.confirmar'))) return;
    await tentar(() => props.aoAgir(os, acao));
  }

  async function concluirRespondendo(equipamentoVoltou: boolean) {
    setPerguntando(false);
    await tentar(() => props.aoAgir(os, 'concluir', { equipamentoVoltou }));
  }

  async function apontar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const f = new FormData(formulario);
    const ok = await tentar(async () => {
      const { inicio, fim } = validarApontamento(
        { inicio: new Date(String(f.get('inicio'))), fim: new Date(String(f.get('fim'))) },
        new Date(),
      );
      await props.aoApontar(os.id, inicio, fim);
    });
    if (ok) formulario.reset();
  }

  async function registrarMaterial(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const f = new FormData(formulario);
    const ok = await tentar(() =>
      props.aoRegistrarMaterial(os.id, normalizarMaterial(String(f.get('descricao') ?? ''))),
    );
    if (ok) formulario.reset();
  }

  async function fotografar(arquivo: File | undefined) {
    if (!arquivo) return;
    await tentar(() => props.aoFotografar(os.id, arquivo));
  }

  return (
    <TelaDoTecnico
      titulo={t('tecnico.os.titulo')}
      subtitulo={t('tecnico.os.local', { local: os.chamado.localNome })}
      acao={
        <Botao tamanho="pequeno" onClick={props.aoVoltar}>
          {t('comum.voltar')}
        </Botao>
      }
    >
      <Painel>
        <p className="tc-cartao-titulo">{os.chamado.descricao}</p>
        <div className="tc-cartao-rodape">
          <span data-estado={os.estado}>
            <Selo tom={TOM_DO_ESTADO[os.estado]}>{t(rotuloDoEstado(os.estado))}</Selo>
          </span>
          {os.pendentes > 0 && <span>{t('tecnico.os.pendentes', { n: os.pendentes })}</span>}
        </div>
        {os.motivoReabertura && (
          <p className="tc-nota" data-motivo-reabertura>
            {t('tecnico.os.reaberta', { motivo: os.motivoReabertura })}
          </p>
        )}
        {os.chamado.paradoDesde && (
          <p className="tc-nota" data-parado-desde={os.chamado.paradoDesde}>
            {t('tecnico.os.parada.desde', {
              quando: intl.formatDate(os.chamado.paradoDesde, {
                dateStyle: 'short',
                timeStyle: 'short',
              }),
            })}
          </p>
        )}
      </Painel>

      {aviso?.tipo === 'ok' && (
        <p role="status" className="tc-nota">
          {t('tecnico.ativos.enfileirado')}
        </p>
      )}
      {aviso?.tipo === 'erro' && (
        <MensagemDeErro>
          <span data-codigo={aviso.codigo}>{motivo(aviso.codigo)}</span>
        </MensagemDeErro>
      )}

      <div className="tc-acoes">
        {acoesPossiveis(os.estado).map((acao, i) => (
          <Botao
            key={acao}
            variante={i === 0 ? 'primario' : 'padrao'}
            onClick={() => void agir(acao)}
          >
            {t(ROTULO_DA_ACAO[acao])}
          </Botao>
        ))}
        {parada === 'registrar' && (
          <Botao
            variante="perigo"
            onClick={() => void tentar(() => props.aoRegistrarParada(os.id))}
          >
            {t('tecnico.os.parada.registrar')}
          </Botao>
        )}
        {parada === 'encerrar' && (
          <Botao onClick={() => void tentar(() => props.aoEncerrarParada(os.id))}>
            {t('tecnico.os.parada.encerrar')}
          </Botao>
        )}
      </div>
      {perguntando && perguntaNaConclusao(os) && (
        <PerguntaDaParada
          aoResponder={(voltou) => void concluirRespondendo(voltou)}
          aoDesistir={() => setPerguntando(false)}
        />
      )}

      {aceitaRegistro(os.estado) ? (
        <>
          <Painel titulo={t('tecnico.os.horas.titulo')}>
            <form onSubmit={(e) => void apontar(e)}>
              <Campo rotulo={t('tecnico.os.horas.inicio')}>
                {(p) => <Entrada {...p} type="datetime-local" name="inicio" required />}
              </Campo>
              <Campo rotulo={t('tecnico.os.horas.fim')}>
                {(p) => <Entrada {...p} type="datetime-local" name="fim" required />}
              </Campo>
              <Botao type="submit">{t('tecnico.os.horas.apontar')}</Botao>
            </form>
          </Painel>

          <Painel titulo={t('tecnico.os.material.titulo')}>
            <form onSubmit={(e) => void registrarMaterial(e)}>
              <Campo rotulo={t('tecnico.os.material.descricao')}>
                {(p) => <AreaDeTexto {...p} name="descricao" rows={2} required />}
              </Campo>
              <Botao type="submit">{t('tecnico.os.material.registrar')}</Botao>
            </form>
          </Painel>

          <Painel titulo={t('tecnico.os.fotos.titulo')}>
            <Campo rotulo={t('tecnico.fotos.tirar')}>
              {(p) => (
                <Entrada
                  {...p}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const arquivo = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    void fotografar(arquivo);
                  }}
                />
              )}
            </Campo>
          </Painel>
        </>
      ) : (
        <p className="tc-nota">{t('tecnico.os.sem_registro')}</p>
      )}
    </TelaDoTecnico>
  );
}
