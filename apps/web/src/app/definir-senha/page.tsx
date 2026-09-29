'use client';
import { LIMITE_MINIMO_DA_SENHA } from '@hubkeep/contratos';
import type { Chave } from '@hubkeep/i18n';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { definirSenha } from '../../cliente/sessao';
import { useT } from '../../i18n/cliente';

export default function DefinirSenha() {
  const t = useT();
  const router = useRouter();
  const [erro, setErro] = useState<Chave | null>(null);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const senha = String(new FormData(e.currentTarget).get('senha'));
    if (senha.length < LIMITE_MINIMO_DA_SENHA) return setErro('senha.erro.curta');
    if (!(await definirSenha(senha))) setErro('senha.erro.salvar');
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
      {erro && <p role="alert">{t(erro, { minimo: LIMITE_MINIMO_DA_SENHA })}</p>}
    </form>
  );
}
