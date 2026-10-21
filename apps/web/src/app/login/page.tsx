'use client';
// Login do web (S1, ADR-032), com o segundo fator (SP1, ADR-049): a senha, e
// depois o código do aplicativo autenticador (quem já cadastrou) ou o
// cadastro do fator (quem tem papel que exige e ainda não cadastrou). A
// sessão só vai para o cookie depois do código.
import type { Chave } from '@hubkeep/i18n';
import { Botao, Campo, Entrada, Marca, MensagemDeErro, TelaDeEntrada } from '@hubkeep/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { confirmarCodigo, entrar as entrarNoAuth } from '../../cliente/sessao';
import { SeletorDeIdioma, useT } from '../../i18n/cliente';

type Etapa =
  { tipo: 'senha' } | { tipo: 'codigo' } | { tipo: 'cadastro'; qr: string; segredo: string };

const ERRO_DO_LINK: Record<string, Chave> = {
  link_invalido: 'login.erro.link_invalido',
  segundo_fator: 'login.erro.segundo_fator',
};

function FormularioLogin() {
  const t = useT();
  const router = useRouter();
  const erroDoLink = useSearchParams().get('erro');
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'senha' });
  const [erro, setErro] = useState<Chave | null>((erroDoLink && ERRO_DO_LINK[erroDoLink]) || null);

  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    const r = await entrarNoAuth(String(dados.get('email')), String(dados.get('senha')));
    setErro(null);
    if (r.tipo === 'ok') router.replace('/');
    else if (r.tipo === 'credenciais') setErro('login.erro.credenciais');
    else if (r.tipo === 'falha') setErro('login.erro.falha');
    else setEtapa(r);
  }

  async function confirmar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const codigo = String(new FormData(e.currentTarget).get('codigo')).replace(/\s/g, '');
    const r = await confirmarCodigo(codigo);
    if (r === 'ok') router.replace('/');
    else setErro(r === 'codigo_invalido' ? 'login.erro.codigo' : 'login.erro.falha');
  }

  if (etapa.tipo !== 'senha') {
    const cadastro = etapa.tipo === 'cadastro' ? etapa : null;
    return (
      <TelaDeEntrada
        marca={<Marca nome={t('app.nome')} />}
        titulo={t(
          cadastro ? 'login.segundo_fator.titulo_cadastro' : 'login.segundo_fator.titulo_codigo',
        )}
        acoes={<SeletorDeIdioma />}
        rodape={t('login.segundo_fator.perda')}
      >
        <form onSubmit={confirmar}>
          {cadastro ? (
            <>
              <p>{t('login.segundo_fator.dica_cadastro')}</p>
              {/* O QR vem do Auth como data: (SVG), que a CSP aceita em img-src. */}
              <img
                src={cadastro.qr}
                alt={t('login.segundo_fator.qr')}
                width={200}
                height={200}
                data-qr-do-segundo-fator
              />
              <p data-segredo>{t('login.segundo_fator.segredo', { segredo: cadastro.segredo })}</p>
            </>
          ) : (
            <p>{t('login.segundo_fator.dica_codigo')}</p>
          )}
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
          {erro && <MensagemDeErro>{t(erro)}</MensagemDeErro>}
          <Botao type="submit" variante="primario">
            {t('login.acao.confirmar')}
          </Botao>
        </form>
      </TelaDeEntrada>
    );
  }

  return (
    <TelaDeEntrada
      marca={<Marca nome={t('app.nome')} />}
      titulo={t('login.titulo')}
      acoes={<SeletorDeIdioma />}
      rodape={t('login.aviso_convite')}
    >
      <form onSubmit={entrar}>
        <Campo rotulo={t('login.campo.email')}>
          {(p) => <Entrada {...p} name="email" type="email" autoComplete="email" required />}
        </Campo>
        <Campo rotulo={t('login.campo.senha')}>
          {(p) => (
            <Entrada {...p} name="senha" type="password" autoComplete="current-password" required />
          )}
        </Campo>
        {erro && <MensagemDeErro>{t(erro)}</MensagemDeErro>}
        <Botao type="submit" variante="primario">
          {t('login.acao.entrar')}
        </Botao>
      </form>
    </TelaDeEntrada>
  );
}

export default function Login() {
  return (
    <Suspense>
      <FormularioLogin />
    </Suspense>
  );
}
