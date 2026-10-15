'use client';
// Os campos estendidos da categoria num formulário (ADR-028): um campo por
// definição, no tipo dela. Usado pelo cadastro do ativo (B3) e pelo cadastro
// dos modelos de ativo (M1). Os campos não são controlados: o valor sai do
// FormData (camposDoFormulario), e quem quer trocar os valores mostrados
// remonta o formulário com outra chave.
import type { Idioma } from '@hubkeep/i18n';
import { Campo as CampoDoFormulario, Entrada, Selecao } from '@hubkeep/ui';
import { useT } from '../i18n/cliente';

type Rotulos = Partial<Record<Idioma, string>>;
export type ValorDeCampo = string | number | boolean;

export interface DefinicaoDeCampo {
  chave: string;
  tipo: 'texto' | 'numero' | 'data' | 'lista' | 'sim_nao';
  obrigatorio: boolean;
  rotulos: Rotulos;
  unidade: string | null;
  opcoes: { chave: string; rotulos: Rotulos }[];
}

const texto = (f: FormData, campo: string) => {
  const v = String(f.get(campo) ?? '').trim();
  return v === '' ? null : v;
};

/** Valores dos campos estendidos do formulário, no tipo de cada definição; vazio fica de fora. */
export function camposDoFormulario(
  f: FormData,
  definicoes: readonly DefinicaoDeCampo[],
): Record<string, ValorDeCampo> {
  const saida: Record<string, ValorDeCampo> = {};
  for (const d of definicoes) {
    const nome = `campo.${d.chave}`;
    if (d.tipo === 'sim_nao') {
      const v = f.get(nome);
      if (v === 'sim' || v === 'nao') saida[d.chave] = v === 'sim';
      continue;
    }
    const v = texto(f, nome);
    if (v === null) continue;
    saida[d.chave] = d.tipo === 'numero' ? Number(v) : v;
  }
  return saida;
}

/**
 * Um campo por definição. `marcarObrigatorio` desligado (o modelo de ativo,
 * que só sugere) mostra o rótulo sem a marca de obrigatório.
 */
export function CamposDaCategoria({
  definicoes,
  valorDe,
  rotulo,
  prefixoDaChave,
  marcarObrigatorio = true,
}: {
  definicoes: readonly DefinicaoDeCampo[];
  valorDe: (chave: string) => ValorDeCampo | undefined;
  rotulo: (r: Rotulos, reserva: string) => string;
  /** Entra na key de cada campo: trocar o prefixo remonta os campos. */
  prefixoDaChave: string;
  marcarObrigatorio?: boolean;
}) {
  const t = useT();
  return (
    <>
      {definicoes.map((d) => {
        const nome = `campo.${d.chave}`;
        const etiqueta = rotulo(d.rotulos, d.chave) + (d.unidade ? ` (${d.unidade})` : '');
        const atual = valorDe(d.chave);
        return (
          <CampoDoFormulario
            key={`${prefixoDaChave}|${d.chave}`}
            rotulo={
              d.obrigatorio && marcarObrigatorio
                ? t('admin.ativos.obrigatorio', { campo: etiqueta })
                : etiqueta
            }
          >
            {(p) =>
              d.tipo === 'lista' ? (
                <Selecao {...p} name={nome} defaultValue={typeof atual === 'string' ? atual : ''}>
                  <option value="" />
                  {d.opcoes.map((o) => (
                    <option key={o.chave} value={o.chave}>
                      {rotulo(o.rotulos, o.chave)}
                    </option>
                  ))}
                </Selecao>
              ) : d.tipo === 'sim_nao' ? (
                <Selecao
                  {...p}
                  name={nome}
                  defaultValue={atual === true ? 'sim' : atual === false ? 'nao' : ''}
                >
                  <option value="" />
                  <option value="sim">{t('admin.ativos.sim')}</option>
                  <option value="nao">{t('admin.ativos.nao')}</option>
                </Selecao>
              ) : (
                <Entrada
                  {...p}
                  name={nome}
                  type={d.tipo === 'numero' ? 'number' : d.tipo === 'data' ? 'date' : 'text'}
                  step={d.tipo === 'numero' ? 'any' : undefined}
                  defaultValue={atual === undefined ? '' : String(atual)}
                />
              )
            }
          </CampoDoFormulario>
        );
      })}
    </>
  );
}
