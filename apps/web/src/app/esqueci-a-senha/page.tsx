'use client';
// Esqueci a senha (C9 da comunicação da 1c): o e-mail de recuperação. A
// resposta é sempre a mesma, exista ou não a conta, para não revelar quem tem
// cadastro. O link do e-mail leva a /definir-senha.
import { Botao, Campo, Entrada, Marca, MensagemDeErro, TelaDeEntrada } from '@hubkeep/ui';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { SeletorDeIdioma, useT } from '../../i18n/cliente';

export default function EsqueciASenha() {
  const t = useT();
  const [enviado, setEnviado] = useState(false);
  const [falhou, setFalhou] = useState(false);

  async function pedir(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email'));
    const r = await fetch('/api/v1/auth/recuperar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setFalhou(r?.status !== 202);
    setEnviado(r?.status === 202);
  }

  return (
    <TelaDeEntrada
      marca={<Marca nome={t('app.nome')} />}
      titulo={t('recuperacao.titulo')}
      acoes={<SeletorDeIdioma />}
      rodape={<Link href="/login">{t('recuperacao.voltar')}</Link>}
    >
      {enviado ? (
        <p data-recuperacao-enviada>{t('recuperacao.enviado')}</p>
      ) : (
        <form onSubmit={pedir}>
          <p>{t('recuperacao.dica')}</p>
          <Campo rotulo={t('login.campo.email')}>
            {(p) => <Entrada {...p} name="email" type="email" autoComplete="email" required />}
          </Campo>
          {falhou && <MensagemDeErro>{t('login.erro.falha')}</MensagemDeErro>}
          <Botao type="submit" variante="primario">
            {t('recuperacao.acao')}
          </Botao>
        </form>
      )}
    </TelaDeEntrada>
  );
}
