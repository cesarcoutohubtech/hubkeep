// Segundo fator no PWA (SP1, ADR-049). O PWA só verifica o código: o cadastro
// do TOTP é no web.
//   - quem já cadastrou: depois da senha, o código do aplicativo autenticador,
//     antes da fila (a sessão vai a aal2 e a renovação mantém o nível);
//   - quem tem papel que exige e ainda não cadastrou: o aviso para cadastrar
//     no web. "Já cadastrei" renova a sessão, que passa a trazer o fator, e
//     pede o código. A fila não é apagada: a operação espera o segundo fator.
import type { Chave } from '@hubkeep/i18n';
import { Botao, Campo, Entrada, Marca, MensagemDeErro, TelaDeEntrada } from '@hubkeep/ui';
import { type FormEvent, useState } from 'react';
import { useT } from '../i18n';
import { supabase } from '../sessao';

/** A sessão tem o TOTP cadastrado e ainda está em aal1: falta o código. */
export async function faltaOCodigo(): Promise<boolean> {
  const { data } = await supabase().auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === 'aal1' && data.nextLevel === 'aal2';
}

export function CodigoDoSegundoFator(props: { aoConfirmar: () => void; aoSair: () => void }) {
  const t = useT();
  const [erro, setErro] = useState<Chave | null>(null);

  async function confirmar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const codigo = String(new FormData(e.currentTarget).get('codigo')).replace(/\s/g, '');
    const auth = supabase().auth;
    const { data } = await auth.mfa.listFactors();
    const fator = data?.totp[0];
    if (!fator) return setErro('login.erro.falha');
    const { error } = await auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo });
    if (error) return setErro('login.erro.codigo');
    props.aoConfirmar();
  }

  return (
    <TelaDeEntrada
      marca={<Marca nome={t('app.nome')} />}
      titulo={t('login.segundo_fator.titulo_codigo')}
      rodape={t('login.segundo_fator.perda')}
    >
      <form onSubmit={confirmar}>
        <p>{t('login.segundo_fator.dica_codigo')}</p>
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
        {erro && <MensagemDeErro>{t(erro)}</MensagemDeErro>}
        <Botao type="submit" variante="primario">
          {t('login.acao.confirmar')}
        </Botao>
        <Botao type="button" onClick={props.aoSair}>
          {t('inicio.sair')}
        </Botao>
      </form>
    </TelaDeEntrada>
  );
}

export function CadastreOSegundoFatorNoWeb(props: { aoCadastrar: () => void; aoSair: () => void }) {
  const t = useT();

  async function jaCadastrei() {
    // A sessão renovada traz os fatores do usuário: com o TOTP, falta o código.
    await supabase().auth.refreshSession();
    props.aoCadastrar();
  }

  return (
    <TelaDeEntrada marca={<Marca nome={t('app.nome')} />} titulo={t('tecnico.nome')}>
      <MensagemDeErro>{t('tecnico.segundo_fator.cadastrar_no_web')}</MensagemDeErro>
      <Botao type="button" variante="primario" onClick={() => void jaCadastrei()}>
        {t('tecnico.segundo_fator.ja_cadastrei')}
      </Botao>
      <Botao type="button" onClick={props.aoSair}>
        {t('inicio.sair')}
      </Botao>
    </TelaDeEntrada>
  );
}
