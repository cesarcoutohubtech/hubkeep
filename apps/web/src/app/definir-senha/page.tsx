'use client';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { supabaseNavegador } from '../../cliente/supabase';

export default function DefinirSenha() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const senha = String(new FormData(e.currentTarget).get('senha'));
    if (senha.length < 8) return setErro('Use ao menos 8 caracteres.');
    const { error } = await supabaseNavegador().auth.updateUser({ password: senha });
    if (error) setErro('Não foi possível salvar a senha. Abra o link do convite de novo.');
    else router.replace('/');
  }

  return (
    <form onSubmit={salvar} style={{ display: 'grid', gap: 12 }}>
      <h1>Defina sua senha</h1>
      <p>Seu convite foi aceito. Escolha a senha para os próximos acessos.</p>
      <input
        name="senha"
        type="password"
        placeholder="Nova senha"
        autoComplete="new-password"
        required
      />
      <button type="submit">Salvar e entrar</button>
      {erro && <p role="alert">{erro}</p>}
    </form>
  );
}
