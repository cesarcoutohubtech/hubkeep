'use client';
import type { Chave } from '@hubkeep/i18n';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { entrar as entrarNoAuth } from '../../cliente/sessao';
import { SeletorDeIdioma, useT } from '../../i18n/cliente';

function FormularioLogin() {
  const t = useT();
  const router = useRouter();
  const erroDoLink = useSearchParams().get('erro');
  const [erro, setErro] = useState<Chave | null>(
    erroDoLink === 'link_invalido' ? 'login.erro.link_invalido' : null,
  );

  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    const ok = await entrarNoAuth(String(dados.get('email')), String(dados.get('senha')));
    if (!ok) setErro('login.erro.credenciais');
    else router.replace('/');
  }

  return (
    <form onSubmit={entrar} style={{ display: 'grid', gap: 12 }}>
      <SeletorDeIdioma />
      <h1>{t('login.titulo')}</h1>
      <input
        name="email"
        type="email"
        placeholder={t('login.campo.email')}
        autoComplete="email"
        required
      />
      <input
        name="senha"
        type="password"
        placeholder={t('login.campo.senha')}
        autoComplete="current-password"
        required
      />
      <button type="submit">{t('login.acao.entrar')}</button>
      {erro && <p role="alert">{t(erro)}</p>}
      <p>{t('login.aviso_convite')}</p>
    </form>
  );
}

export default function Login() {
  return (
    <Suspense>
      <FormularioLogin />
    </Suspense>
  );
}
