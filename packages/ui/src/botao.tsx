// Botões (ADR-038): padrão, primário (a ação principal da tela), âmbar
// (atenção) e perigo. comoBotao dá o mesmo visual a um link.
import type { ButtonHTMLAttributes } from 'react';

export const VARIANTES_DE_BOTAO = ['padrao', 'primario', 'ambar', 'perigo'] as const;
export type VarianteDeBotao = (typeof VARIANTES_DE_BOTAO)[number];
export type TamanhoDeBotao = 'normal' | 'pequeno';

export interface PropsDoBotao extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteDeBotao;
  tamanho?: TamanhoDeBotao;
}

export function Botao({
  variante = 'padrao',
  tamanho = 'normal',
  type = 'button',
  className,
  ...resto
}: PropsDoBotao) {
  return (
    <button
      {...resto}
      type={type}
      className={className ? `hk-botao ${className}` : 'hk-botao'}
      data-variante={variante}
      data-tamanho={tamanho}
    />
  );
}

/** Atributos para um link com cara de botão: espalhe o resultado no link. */
export const comoBotao = (
  variante: VarianteDeBotao = 'padrao',
  tamanho: TamanhoDeBotao = 'normal',
) => ({ className: 'hk-botao', 'data-variante': variante, 'data-tamanho': tamanho }) as const;
