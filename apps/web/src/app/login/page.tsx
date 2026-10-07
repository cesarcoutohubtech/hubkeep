'use client';
import type { Chave } from '@hubkeep/i18n';
import { Botao, Campo, Entrada, Marca, MensagemDeErro, TelaDeEntrada } from '@hubkeep/ui';
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
