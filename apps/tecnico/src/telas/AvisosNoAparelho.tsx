// Avisos neste aparelho (1c, ADR-046, C4): ativar ou desativar o push na fila
// do dia. O estado diz se o aparelho recebe, se o navegador não suporta (no
// iPhone, só com o app na tela inicial), se a permissão foi negada, se o push
// não está ligado no servidor ou se falta rede. Os textos vêm do catálogo.
import { Botao } from '@hubkeep/ui';
import type { EstadoDoPush } from '../push';
import { useT } from '../i18n';

const MENSAGEM = {
  ativo: 'tecnico.push.ativo',
  inativo: 'tecnico.push.inativo',
  indisponivel: 'tecnico.push.indisponivel',
  sem_suporte: 'tecnico.push.sem_suporte',
  negado: 'tecnico.push.negado',
  sem_rede: 'tecnico.push.precisa_de_rede',
} as const;

export function AvisosNoAparelho(props: {
  estado: EstadoDoPush;
  /** Ativo antes do pedido que falhou por falta de rede: o botão segue o aparelho. */
  inscrito: boolean;
  ocupado: boolean;
  aoAtivar: () => void;
  aoDesativar: () => void;
}) {
  const t = useT();
  const podeMudar = props.estado !== 'sem_suporte' && props.estado !== 'indisponivel';
  return (
    <section aria-labelledby="tc-avisos">
      <h2 id="tc-avisos">{t('tecnico.push.titulo')}</h2>
      <p role="status">{t(MENSAGEM[props.estado])}</p>
      {podeMudar && props.estado !== 'negado' && (
        <Botao
          tamanho="pequeno"
          disabled={props.ocupado}
          onClick={props.inscrito ? props.aoDesativar : props.aoAtivar}
        >
          {props.inscrito ? t('tecnico.push.desativar') : t('tecnico.push.ativar')}
        </Botao>
      )}
    </section>
  );
}
