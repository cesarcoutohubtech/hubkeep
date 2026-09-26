'use client';
import type { Chave } from '@hubkeep/i18n';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { supabaseNavegador } from '../../cliente/supabase';
import { useT } from '../../i18n/cliente';

const MINIMO_DE_CARACTERES = 8;

export default function DefinirSenha() {
  const t = useT();
  const router = useRouter();
  const [erro, setErro] = useState<Chave | null>(null);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const senha = String(new FormData(e.currentTarget).get('senha'));
    if (senha.length < MINIMO_DE_CARACTERES) return setErro('senha.erro.curta');
    const { error } = await supabaseNavegador().auth.updateUser({ password: senha });
    if (error) setErro('senha.erro.salvar');
    else router.replace('/');
  }

  return (
    <form onSubmit={salvar} style={{ display: 'grid', gap: 12 }}>
      <h1>{t('senha.titulo')}</h1>
      <p>{t('senha.explicacao')}</p>
      <input
        name="senha"
        type="password"
        placeholder={t('senha.campo.nova')}
        autoComplete="new-password"
        required
      />
      <button type="submit">{t('senha.acao.salvar')}</button>
      {erro && <p role="alert">{t(erro, { minimo: MINIMO_DE_CARACTERES })}</p>}
    </form>
  );
}
