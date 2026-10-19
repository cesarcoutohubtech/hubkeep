'use client';
// O formulário do modelo de ativo (fase 1b, M1), novo ou existente: a
// categoria escolhida decide os campos pré-preenchidos (nenhum obrigatório,
// porque o modelo só sugere) e os checklists que cabem nela. Vazio na
// periodicidade é "sem sugestão". Usado pela tela /admin/modelos-de-ativo.
import type { Idioma } from '@hubkeep/i18n';
import { Botao, Campo as CampoDoFormulario, Entrada, Selecao } from '@hubkeep/ui';
import { type FormEvent, useState } from 'react';
import { useT } from '../i18n/cliente';
import {
  CamposDaCategoria,
  type DefinicaoDeCampo,
  type ValorDeCampo,
  camposDoFormulario,
} from './campos-da-categoria';

const UNIDADES = ['dia', 'semana', 'mes'] as const;
export type Rotulos = Partial<Record<Idioma, string>>;
export interface Categoria {
  id: string;
  chavePadrao: string | null;
  nomes: Rotulos;
  campos: DefinicaoDeCampo[];
  ativa: boolean;
}
export interface Checklist {
  id: string;
  categoriaId: string | null;
  nomes: Rotulos;
  ativa: boolean;
}
export interface Modelo {
  id: string;
  categoriaId: string;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  campos: Record<string, ValorDeCampo>;
  checklistModeloId: string | null;
  planoSugerido: { intervalo: number; unidade: (typeof UNIDADES)[number] } | null;
  versao: number;
  ativa: boolean;
}

const texto = (f: FormData, campo: string) => {
  const v = String(f.get(campo) ?? '').trim();
  return v === '' ? null : v;
};

export function FormularioDeModelo({
  modelo,
  categorias,
  checklists,
  nomeDaCategoria,
  rotulo,
  executar,
}: {
  modelo: Modelo | null;
  categorias: readonly Categoria[];
  checklists: readonly Checklist[];
  nomeDaCategoria: (c: Categoria) => string;
  rotulo: (r: Rotulos, reserva: string) => string;
  executar: (caminho: string, init: RequestInit) => Promise<void>;
}) {
  const t = useT();
  const ativas = categorias.filter((c) => c.ativa || c.id === modelo?.categoriaId);
  const [categoriaId, setCategoriaId] = useState<string>(
    modelo?.categoriaId ?? ativas[0]?.id ?? '',
  );
  const definicoes = categorias.find((c) => c.id === categoriaId)?.campos ?? [];
  const valorDe = (chave: string) =>
    categoriaId === modelo?.categoriaId ? modelo?.campos[chave] : undefined;

  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const intervalo = texto(f, 'intervalo');
    const gravacao = {
      categoriaId,
      nome: texto(f, 'nome') ?? '',
      fabricante: texto(f, 'fabricante'),
      modelo: texto(f, 'modelo'),
      campos: camposDoFormulario(f, definicoes),
      checklistModeloId: texto(f, 'checklist'),
      planoSugerido:
        intervalo === null
          ? null
          : { intervalo: Number(intervalo), unidade: texto(f, 'unidade') ?? 'mes' },
    };
    void (modelo
      ? executar(`/api/v1/modelos-de-ativo/${modelo.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...gravacao, versao: modelo.versao }),
        })
      : executar('/api/v1/modelos-de-ativo', { method: 'POST', body: JSON.stringify(gravacao) }));
  }

  return (
    <form onSubmit={enviar} className="hk-em-linha">
      <CampoDoFormulario rotulo={t('admin.modelos_de_ativo.campo.categoria')}>
        {(p) => (
          <Selecao
            {...p}
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            required
          >
            {ativas.map((c) => (
              <option key={c.id} value={c.id}>
                {nomeDaCategoria(c)}
              </option>
            ))}
          </Selecao>
        )}
      </CampoDoFormulario>
      <CampoDoFormulario rotulo={t('admin.modelos_de_ativo.campo.nome')}>
        {(p) => <Entrada {...p} name="nome" defaultValue={modelo?.nome ?? ''} required />}
      </CampoDoFormulario>
      {(['fabricante', 'modelo'] as const).map((campo) => (
        <CampoDoFormulario key={campo} rotulo={t(`admin.ativos.campo.${campo}`)}>
          {(p) => <Entrada {...p} name={campo} defaultValue={modelo?.[campo] ?? ''} />}
        </CampoDoFormulario>
      ))}
      <CamposDaCategoria
        definicoes={definicoes}
        valorDe={valorDe}
        rotulo={rotulo}
        prefixoDaChave={categoriaId}
        marcarObrigatorio={false}
      />
      <CampoDoFormulario rotulo={t('admin.modelos_de_ativo.campo.checklist')}>
        {(p) => (
          <Selecao
            {...p}
            key={`checklist|${categoriaId}`}
            name="checklist"
            defaultValue={modelo?.checklistModeloId ?? ''}
          >
            <option value="">{t('admin.modelos_de_ativo.sem_checklist')}</option>
            {checklists
              .filter(
                (c) =>
                  (c.ativa && (c.categoriaId === null || c.categoriaId === categoriaId)) ||
                  c.id === modelo?.checklistModeloId,
              )
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {rotulo(c.nomes, c.id)}
                </option>
              ))}
          </Selecao>
        )}
      </CampoDoFormulario>
      <CampoDoFormulario rotulo={t('admin.modelos_de_ativo.campo.intervalo')}>
        {(p) => (
          <Entrada
            {...p}
            type="number"
            min={1}
            name="intervalo"
            defaultValue={modelo?.planoSugerido ? String(modelo.planoSugerido.intervalo) : ''}
          />
        )}
      </CampoDoFormulario>
      <CampoDoFormulario rotulo={t('admin.preventivas.campo.unidade')}>
        {(p) => (
          <Selecao {...p} name="unidade" defaultValue={modelo?.planoSugerido?.unidade ?? 'mes'}>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {t('admin.preventivas.unidade', { unidade: u })}
              </option>
            ))}
          </Selecao>
        )}
      </CampoDoFormulario>
      <div className="hk-linha-de-botoes">
        <Botao type="submit" variante={modelo ? 'padrao' : 'primario'}>
          {modelo
            ? t('admin.modelos_de_ativo.acao.salvar')
            : t('admin.modelos_de_ativo.acao.criar')}
        </Botao>
        {modelo && (
          <Botao
            onClick={() =>
              void executar(
                `/api/v1/modelos-de-ativo/${modelo.id}/${modelo.ativa ? 'desativacao' : 'reativacao'}`,
                { method: 'POST', body: JSON.stringify({ versao: modelo.versao }) },
              )
            }
          >
            {modelo.ativa
              ? t('admin.modelos_de_ativo.acao.desativar')
              : t('admin.modelos_de_ativo.acao.reativar')}
          </Botao>
        )}
      </div>
    </form>
  );
}
