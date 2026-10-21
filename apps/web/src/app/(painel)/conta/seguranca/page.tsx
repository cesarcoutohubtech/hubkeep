'use client';
// Minha conta → Segurança (SP1, ADR-049): os aparelhos do segundo fator do
// próprio usuário. Cadastrar um segundo aparelho evita perder o acesso ao
// trocar de celular. Tudo passa por /auth/segundo-fator, com a sessão do
// cookie: a página não guarda token.
import { Botao, Campo, Entrada, MensagemDeErro, MensagemVazia, Painel, Selo } from '@hubkeep/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { useMensagemDeErro, useT } from '../../../../i18n/cliente';

interface Fator {
  id: string;
  nome: string | null;
  criadoEm: string;
}
interface Cadastro {
  fatorId: string;
  qr: string;
  segredo: string;
}

export default function SegurancaDaConta() {
  const t = useT();
  const intl = useIntl();
  const mensagemDeErro = useMensagemDeErro();
  const [fatores, setFatores] = useState<Fator[] | null>(null);
  const [exigido, setExigido] = useState(false);
  const [cadastro, setCadastro] = useState<Cadastro | null>(null);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const [feito, setFeito] = useState(false);

  const carregar = useCallback(async () => {
    const r = await chamarApi<{ exigido: boolean; fatores: Fator[] }>('/auth/segundo-fator');
    if (!r.ok) return setErro(r.erro);
    setFatores(r.dados.fatores);
    setExigido(r.dados.exigido);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function cadastrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setFeito(false);
    const nome = String(new FormData(e.currentTarget).get('nome') ?? '').trim();
    const r = await chamarApi<Cadastro>('/auth/segundo-fator', {
      method: 'POST',
      body: JSON.stringify(nome ? { nome } : {}),
    });
    if (r.ok) setCadastro(r.dados);
    else setErro(r.erro);
  }

  async function confirmar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cadastro) return;
    const codigo = String(new FormData(e.currentTarget).get('codigo')).replace(/\s/g, '');
    const r = await chamarApi('/auth/segundo-fator/verificacao', {
      method: 'POST',
      body: JSON.stringify({ fatorId: cadastro.fatorId, codigo }),
    });
    if (!r.ok) return setErro(r.erro);
    setCadastro(null);
    setErro(null);
    setFeito(true);
    await carregar();
  }

  async function remover(f: Fator) {
    const nome = f.nome ?? t('conta.seguranca.sem_nome');
    if (!window.confirm(t('conta.seguranca.confirmar_remocao', { nome }))) return;
    const r = await chamarApi('/auth/segundo-fator/remocao', {
      method: 'POST',
      body: JSON.stringify({ fatorId: f.id }),
    });
    setErro(r.ok ? null : r.erro);
    await carregar();
  }

  return (
    <>
      <Painel titulo={t('conta.seguranca.aparelhos')}>
        <p className="hk-suave">
          {t(exigido ? 'conta.seguranca.dica_exigido' : 'conta.seguranca.dica_opcional')}
        </p>
        {fatores?.length === 0 && <MensagemVazia>{t('conta.seguranca.vazio')}</MensagemVazia>}
        {fatores && fatores.length > 0 && (
          <ul className="hk-lista hk-itens">
            {fatores.map((f) => (
              <li key={f.id} data-fator={f.id}>
                <div className="hk-item-cabecalho">
                  <strong>{f.nome ?? t('conta.seguranca.sem_nome')}</strong>
                  <span className="hk-suave">
                    {t('conta.seguranca.desde', {
                      quando: intl.formatDate(f.criadoEm, { dateStyle: 'short' }),
                    })}
                  </span>
                  <div className="hk-linha-de-botoes">
                    <Botao tamanho="pequeno" onClick={() => void remover(f)}>
                      {t('conta.seguranca.remover')}
                    </Botao>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {feito && <Selo tom="verde">{t('conta.seguranca.cadastrado')}</Selo>}
        {erro && <MensagemDeErro>{mensagemDeErro(erro)}</MensagemDeErro>}
      </Painel>

      <Painel titulo={t('conta.seguranca.novo')}>
        {cadastro ? (
          <form onSubmit={confirmar}>
            <p>{t('login.segundo_fator.dica_cadastro')}</p>
            {/* O QR vem do Auth como data: (SVG), que a CSP aceita em img-src. */}
            <img src={cadastro.qr} alt={t('login.segundo_fator.qr')} width={200} height={200} />
            <p>{t('login.segundo_fator.segredo', { segredo: cadastro.segredo })}</p>
            <Campo rotulo={t('login.campo.codigo')}>
              {(p) => (
                <Entrada
                  {...p}
                  name="codigo"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]{6,7}"
                  required
                />
              )}
            </Campo>
            <Botao type="submit" variante="primario">
              {t('login.acao.confirmar')}
            </Botao>
          </form>
        ) : (
          <form onSubmit={cadastrar}>
            <Campo rotulo={t('conta.seguranca.nome')}>
              {(p) => <Entrada {...p} name="nome" maxLength={60} />}
            </Campo>
            <Botao type="submit" variante="primario">
              {t('conta.seguranca.cadastrar')}
            </Botao>
          </form>
        )}
      </Painel>
    </>
  );
}
