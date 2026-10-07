'use client';
import { LIMITE_MINIMO_DA_SENHA } from '@hubkeep/contratos';
import type { Chave } from '@hubkeep/i18n';
import { Botao, Campo, Entrada, Marca, MensagemDeErro, TelaDeEntrada } from '@hubkeep/ui';
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
    <TelaDeEntrada
      marca={<Marca nome={t('app.nome')} />}
      titulo={t('senha.titulo')}
      rodape={t('senha.explicacao')}
    >
      <form onSubmit={salvar}>
        <Campo rotulo={t('senha.campo.nova')}>
          {(p) => (
            <Entrada {...p} name="senha" type="password" autoComplete="new-password" required />
          )}
        </Campo>
        {erro && <MensagemDeErro>{t(erro, { minimo: LIMITE_MINIMO_DA_SENHA })}</MensagemDeErro>}
        <Botao type="submit" variante="primario">
          {t('senha.acao.salvar')}
        </Botao>
      </form>
    </TelaDeEntrada>
  );
}
