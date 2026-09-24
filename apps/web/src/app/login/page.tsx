'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { supabaseNavegador } from '../../cliente/supabase';

function FormularioLogin() {
  const router = useRouter();
  const erroDoLink = useSearchParams().get('erro');
  const [erro, setErro] = useState<string | null>(
    erroDoLink === 'link_invalido' ? 'O link de convite é inválido ou expirou.' : null,
  );

  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    const { error } = await supabaseNavegador().auth.signInWithPassword({
      email: String(dados.get('email')),
      password: String(dados.get('senha')),
    });
    if (error) setErro('E-mail ou senha incorretos.');
    else router.replace('/');
  }

  return (
    <form onSubmit={entrar} style={{ display: 'grid', gap: 12 }}>
      <h1>Entrar no HubKeep</h1>
      <input name="email" type="email" placeholder="E-mail" autoComplete="email" required />
      <input
        name="senha"
        type="password"
        placeholder="Senha"
        autoComplete="current-password"
        required
      />
      <button type="submit">Entrar</button>
      {erro && <p role="alert">{erro}</p>}
      <p>O acesso é por convite. Não tem conta? Peça ao administrador do seu grupo.</p>
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
