'use client';
// Anexos de um hotel, local ou ativo (fase 1a, B4; ADR-024): lista, envio e
// remoção. O envio (enviar-anexo) comprime a imagem e gera a miniatura pelo
// mesmo código do PWA; PDF vai como está. Abrir pede uma URL de 5 minutos.
// As fotos da OS (I8) aparecem só para ver, no detalhe do chamado: com o
// momento (antes ou depois) e a assinatura do aceite marcada; quem tira a
// foto é o técnico, no PWA.
// Tela funcional, sem acabamento: o layout vem do protótipo.
import { Botao, Campo, Entrada, MensagemDeErro, Selo } from '@hubkeep/ui';
import { useCallback, useState } from 'react';
import { useIntl } from 'react-intl';
import { useMensagemDeErro, useT } from '../i18n/cliente';
import { type ErroDaApi, chamarApi } from './api';
import { type Entidade, enviarAnexo } from './enviar-anexo';

type EntidadeDaLista = Entidade | 'os';

const RECURSO: Record<EntidadeDaLista, string> = {
  hotel: 'hoteis',
  local: 'locais',
  ativo: 'ativos',
  os: 'os',
};
const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

interface Anexo {
  id: string;
  tipo: string;
  nome: string | null;
  usuarioId: string;
  nomeUsuario: string | null;
  criadoEm: string;
  podeRemover: boolean;
  /** Foto da OS antes ou depois (I8). */
  momento?: 'antes' | 'depois' | null;
  /** A assinatura do aceite (I8). */
  assinatura?: boolean;
}

export function AnexosDoRegistro({
  entidade,
  registroId,
  somenteLeitura = false,
}: {
  entidade: EntidadeDaLista;
  registroId: string;
  /** Sem envio (as fotos da OS entram pelo PWA). */
  somenteLeitura?: boolean;
}) {
  const t = useT();
  const intl = useIntl();
  const mensagemDeErro = useMensagemDeErro();
  const [anexos, setAnexos] = useState<Anexo[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroDaApi | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamarApi<{ anexos: Anexo[] }>(
      `/api/v1/${RECURSO[entidade]}/${registroId}/anexos`,
    );
    if (r.ok) setAnexos(r.dados.anexos);
    else setErro(r.erro);
  }, [entidade, registroId]);

  async function enviar(arquivo: File) {
    if (entidade === 'os') return;
    setEnviando(true);
    setErro(null);
    try {
      const e = await enviarAnexo({ entidade, registroId }, arquivo);
      if (e) setErro(e);
      await carregar();
    } finally {
      setEnviando(false);
    }
  }

  async function abrir(id: string) {
    const r = await chamarApi<{ url: string }>(`/api/v1/anexos/${id}/url-de-download`, {
      method: 'POST',
      body: JSON.stringify({ miniatura: false }),
    });
    if (r.ok) window.open(r.dados.url, '_blank', 'noopener');
    else setErro(r.erro);
  }

  async function remover(id: string) {
    const r = await chamarApi<{ id: string }>(`/api/v1/anexos/${id}/remocao`, {
      method: 'POST',
    });
    if (!r.ok) setErro(r.erro);
    await carregar();
  }

  if (anexos === null) {
    return (
      <div>
        <Botao tamanho="pequeno" onClick={() => void carregar()}>
          {t('admin.anexos.acao.ver')}
        </Botao>
        {erro && <MensagemDeErro>{mensagemDeErro(erro)}</MensagemDeErro>}
      </div>
    );
  }

  return (
    <div className="hk-pilha">
      <p className="hk-bloco-titulo">{t('admin.anexos.titulo')}</p>
      {anexos.length === 0 ? (
        <p className="hk-suave">{t('admin.anexos.vazio')}</p>
      ) : (
        <ul className="hk-lista">
          {anexos.map((a) => (
            <li key={a.id}>
              <span className="hk-suave">
                {t('admin.anexos.linha', {
                  quando: intl.formatDate(a.criadoEm, { dateStyle: 'short', timeStyle: 'short' }),
                  arquivo:
                    a.nome ??
                    (a.tipo === 'application/pdf'
                      ? t('admin.anexos.tipo.pdf')
                      : t('admin.anexos.tipo.imagem')),
                  quem: a.nomeUsuario ?? t('admin.anexos.alguem'),
                })}
              </span>
              {a.momento && (
                <Selo tom="azul">{t('admin.anexos.momento', { momento: a.momento })}</Selo>
              )}
              {a.assinatura && <Selo tom="ambar">{t('admin.anexos.assinatura')}</Selo>}
              <span className="hk-linha-de-botoes">
                <Botao tamanho="pequeno" onClick={() => void abrir(a.id)}>
                  {t('admin.anexos.acao.abrir')}
                </Botao>
                {a.podeRemover && (
                  <Botao tamanho="pequeno" variante="perigo" onClick={() => void remover(a.id)}>
                    {t('admin.anexos.acao.remover')}
                  </Botao>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!somenteLeitura && (
        <Campo rotulo={enviando ? t('admin.anexos.enviando') : t('admin.anexos.acao.enviar')}>
          {(c) => (
            <Entrada
              {...c}
              type="file"
              accept={TIPOS.join(',')}
              disabled={enviando}
              onChange={(e) => {
                const arquivo = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (arquivo) void enviar(arquivo);
              }}
            />
          )}
        </Campo>
      )}
      {erro && <MensagemDeErro>{mensagemDeErro(erro)}</MensagemDeErro>}
    </div>
  );
}
