// Campos de formulário (ADR-038). O Campo liga o rótulo, a ajuda e o erro ao
// controle: entrega id, aria-describedby e aria-invalid para quem o renderiza.
import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';

export interface PropsDoControle {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

export interface PropsDoCampo {
  rotulo: ReactNode;
  ajuda?: ReactNode;
  /** Mensagem de erro do campo (do catálogo); marca o controle como inválido. */
  erro?: ReactNode;
  children: (controle: PropsDoControle) => ReactNode;
}

export function Campo({ rotulo, ajuda, erro, children }: PropsDoCampo) {
  const id = useId();
  const idDaAjuda = `${id}-ajuda`;
  const idDoErro = `${id}-erro`;
  const descricao = [ajuda !== undefined ? idDaAjuda : '', erro !== undefined ? idDoErro : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className="hk-campo">
      <label htmlFor={id}>{rotulo}</label>
      {children({
        id,
        ...(descricao ? { 'aria-describedby': descricao } : {}),
        ...(erro !== undefined ? { 'aria-invalid': true } : {}),
      })}
      {ajuda !== undefined ? (
        <span className="hk-campo-ajuda" id={idDaAjuda}>
          {ajuda}
        </span>
      ) : null}
      {erro !== undefined ? (
        <span className="hk-campo-erro" id={idDoErro}>
          {erro}
        </span>
      ) : null}
    </div>
  );
}

const comClasse = (className: string | undefined) =>
  className ? `hk-controle ${className}` : 'hk-controle';

export function Entrada({ className, ...resto }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...resto} className={comClasse(className)} />;
}

export function Selecao({ className, ...resto }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...resto} className={comClasse(className)} />;
}

export function AreaDeTexto({ className, ...resto }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...resto} className={comClasse(className)} />;
}
