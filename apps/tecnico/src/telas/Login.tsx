import type { Chave } from '@hubkeep/i18n';
import { type FormEvent, useState } from 'react';
import { useT } from '../i18n';
import { supabase } from '../sessao';

export function Login() {
  const t = useT();
  const [erro, setErro] = useState<Chave | null>(null);

  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    const { error } = await supabase().auth.signInWithPassword({
      email: String(dados.get('email')),
      password: String(dados.get('senha')),
    });
    if (error) setErro('login.erro.credenciais');
  }

  return (
    <form onSubmit={entrar} className="cartao">
      <h1>{t('tecnico.nome')}</h1>
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
