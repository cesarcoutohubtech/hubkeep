'use client';
// Senha nova, depois do convite ou do link de recuperação. Quem já tem o
// segundo fator (SP1, ADR-049) confirma o código antes: o link dá uma sessão em
// aal1, e a troca de senha de quem tem TOTP pede aal2.
import { LIMITE_MINIMO_DA_SENHA } from '@hubkeep/contratos';
import type { Chave } from '@hubkeep/i18n';
import { Botao, Campo, Entrada, Marca, MensagemDeErro, TelaDeEntrada } from '@hubkeep/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { definirSenha } from '../../cliente/sessao';
import { useT } from '../../i18n/cliente';

/** O primeiro fator verificado da sessão, se houver; null sem fator ou sem leitura. */
async function fatorDaSessao(): Promise<string | null> {
  const r = await fetch('/auth/segundo-fator').catch(() => null);
  if (!r?.ok) return null;
  const { fatores } = (await r.json()) as { fatores: { id: string }[] };
  return fatores[0]?.id ?? null;
}

async function confirmarCodigo(fatorId: string, codigo: string): Promise<boolean> {
  const r = await fetch('/auth/segundo-fator/verificacao', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fatorId, codigo }),
  }).catch(() => null);
  return r?.status === 204;
}

export default function DefinirSenha() {
  const t = useT();
  const router = useRouter();
  const [erro, setErro] = useState<Chave | null>(null);
  const [fator, setFator] = useState<string | null>(null);

  useEffect(() => {
    void fatorDaSessao().then(setFator);
  }, []);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    const senha = String(dados.get('senha'));
    if (senha.length < LIMITE_MINIMO_DA_SENHA) return setErro('senha.erro.curta');
    if (fator) {
      const codigo = String(dados.get('codigo') ?? '').replace(/\s/g, '');
      if (!(await confirmarCodigo(fator, codigo))) return setErro('login.erro.codigo');
    }
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
        {fator && (
          <Campo rotulo={t('login.campo.codigo')}>
            {(p) => (
              <Entrada
                {...p}
                name="codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                required
              />
            )}
          </Campo>
        )}
        {erro && <MensagemDeErro>{t(erro, { minimo: LIMITE_MINIMO_DA_SENHA })}</MensagemDeErro>}
        <Botao type="submit" variante="primario">
          {t('senha.acao.salvar')}
        </Botao>
      </form>
    </TelaDeEntrada>
  );
}
