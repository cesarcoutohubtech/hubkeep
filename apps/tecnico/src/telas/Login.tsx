import type { Chave } from '@hubkeep/i18n';
import { Botao, Campo, Entrada, Marca, MensagemDeErro, TelaDeEntrada } from '@hubkeep/ui';
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
    <TelaDeEntrada
      marca={<Marca nome={t('app.nome')} />}
      titulo={t('tecnico.nome')}
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
