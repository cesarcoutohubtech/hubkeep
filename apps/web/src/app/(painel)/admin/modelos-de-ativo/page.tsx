'use client';
// Modelos de ativo do grupo (fase 1b, M1): a categoria, o nome, o fabricante
// e o modelo do fabricante, os valores pré-preenchidos dos campos da
// categoria (nenhum obrigatório: o modelo só sugere), o checklist e a
// periodicidade sugerida para o plano. Só o Admin do grupo grava; a
// alteração leva a versão vista (ADR-029). No cadastro do ativo, escolher o
// modelo preenche só o que está vazio; os ativos que já nasceram do modelo
// ficam com o que foi copiado (ADR-026). A bandeira (PB1b) se escolhe na
// criação; nula, o modelo vale para o grupo inteiro.
import { CATALOGOS, IDIOMAS, type Idioma, resolverNome } from '@hubkeep/i18n';
import { MensagemDeErro, MensagemVazia, Painel, Selo } from '@hubkeep/ui';
import { useCallback, useEffect, useState } from 'react';
import { chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import { useBandeiras, useNomeDaBandeira } from '../../../../cliente/cadastro';
import {
  type Categoria,
  type Checklist,
  FormularioDeModelo,
  type Modelo,
  type Rotulos,
} from '../../../../cliente/modelos-de-ativo';
import { useIdioma, useMensagemDeErro, useT } from '../../../../i18n/cliente';

export default function ModelosDeAtivo() {
  const t = useT();
  const { idioma } = useIdioma();
  const mensagemDeErro = useMensagemDeErro();
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [idiomaPadrao, setIdiomaPadrao] = useState<Idioma>('pt-BR');
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);
  const bandeiras = useBandeiras();
  const nomeDaBandeira = useNomeDaBandeira(bandeiras);

  const carregar = useCallback(async () => {
    const [m, c, k] = await Promise.all([
      chamarApi<{ modelos: Modelo[] }>('/api/v1/modelos-de-ativo'),
      chamarApi<{ categorias: Categoria[] }>('/api/v1/categorias-de-ativo'),
      chamarApi<{ idiomaPadrao: Idioma; modelos: Checklist[] }>('/api/v1/modelos-de-checklist'),
    ]);
    if (m.ok) setModelos(m.dados.modelos);
    else setAviso({ tipo: 'erro', erro: m.erro });
    if (c.ok) setCategorias(c.dados.categorias);
    if (k.ok) {
      setChecklists(k.dados.modelos);
      setIdiomaPadrao(k.dados.idiomaPadrao);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function executar(caminho: string, init: RequestInit) {
    const r = await chamarApi<unknown>(caminho, init);
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregar();
  }

  const idiomaDoTexto: Idioma = (IDIOMAS as readonly string[]).includes(idioma)
    ? (idioma as Idioma)
    : idiomaPadrao;
  const rotulo = (r: Rotulos, reserva: string) =>
    resolverNome(r, idioma, { idiomaPadrao }) ?? reserva;
  const nomeDaCategoria = (c: Categoria) =>
    resolverNome(c.nomes, idioma, {
      doCatalogo: c.chavePadrao
        ? (CATALOGOS[idiomaDoTexto][`categoria_ativo.padrao.${c.chavePadrao}`] ?? null)
        : null,
      idiomaPadrao,
    }) ?? c.id;
  const categoria = (id: string) => categorias.find((c) => c.id === id);

  if (!modelos) {
    return aviso?.tipo === 'erro' ? (
      <MensagemDeErro>{mensagemDeErro(aviso.erro)}</MensagemDeErro>
    ) : (
      <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
    );
  }

  return (
    <div className="hk-pilha">
      <Painel titulo={t('admin.modelos_de_ativo.novo')}>
        {categorias.some((c) => c.ativa) ? (
          <FormularioDeModelo
            modelo={null}
            categorias={categorias}
            checklists={checklists}
            bandeiras={bandeiras}
            nomeDaCategoria={nomeDaCategoria}
            rotulo={rotulo}
            executar={executar}
          />
        ) : (
          <MensagemVazia>{t('admin.modelos_de_ativo.sem_categorias')}</MensagemVazia>
        )}
        <p className="hk-suave">{t('admin.modelos_de_ativo.dica')}</p>
        <Aviso aviso={aviso} />
      </Painel>

      {modelos.length === 0 ? (
        <MensagemVazia>{t('admin.modelos_de_ativo.vazio')}</MensagemVazia>
      ) : (
        modelos.map((m) => {
          const c = categoria(m.categoriaId);
          return (
            <Painel
              key={`${m.id}|${m.versao}`}
              titulo={m.nome}
              acoes={
                <>
                  {c && <Selo tom="azul">{nomeDaCategoria(c)}</Selo>}
                  <Selo tom="cinza">{nomeDaBandeira(m.bandeiraId)}</Selo>
                  {m.planoSugerido && (
                    <Selo tom="cinza">
                      {t('admin.preventivas.periodicidade', {
                        intervalo: m.planoSugerido.intervalo,
                        unidade: m.planoSugerido.unidade,
                      })}
                    </Selo>
                  )}
                  <Selo tom={m.ativa ? 'verde' : 'cinza'}>
                    {m.ativa
                      ? t('admin.modelos_de_ativo.ativo')
                      : t('admin.modelos_de_ativo.desativado')}
                  </Selo>
                </>
              }
            >
              <FormularioDeModelo
                modelo={m}
                categorias={categorias}
                checklists={checklists}
                bandeiras={bandeiras}
                nomeDaCategoria={nomeDaCategoria}
                rotulo={rotulo}
                executar={executar}
              />
            </Painel>
          );
        })
      )}
    </div>
  );
}
