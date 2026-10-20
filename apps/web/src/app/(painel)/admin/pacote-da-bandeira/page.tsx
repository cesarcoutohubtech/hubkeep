'use client';
// Pacote da bandeira (fase 1b, PB1): os planos por categoria do pacote, da
// bandeira ou do grupo inteiro. Só o Admin do grupo grava; a alteração leva a
// versão vista (ADR-029). Aplicar o pacote ao hotel é no painel de
// implantação; os planos já copiados não mudam com o pacote (ADR-026).
import { CATALOGOS, IDIOMAS, type Idioma, resolverNome } from '@hubkeep/i18n';
import { MensagemDeErro, MensagemVazia, Painel, Selo } from '@hubkeep/ui';
import { useCallback, useEffect, useState } from 'react';
import { chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import type { Categoria, Checklist, Rotulos } from '../../../../cliente/modelos-de-ativo';
import {
  type Bandeira,
  FormularioDePlanoPadrao,
  type PlanoPadrao,
} from '../../../../cliente/pacote-da-bandeira';
import { useIdioma, useMensagemDeErro, useT } from '../../../../i18n/cliente';

export default function PacoteDaBandeira() {
  const t = useT();
  const { idioma } = useIdioma();
  const mensagemDeErro = useMensagemDeErro();
  const [planos, setPlanos] = useState<PlanoPadrao[] | null>(null);
  const [bandeiras, setBandeiras] = useState<Bandeira[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [idiomaPadrao, setIdiomaPadrao] = useState<Idioma>('pt-BR');
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    const [p, b, c, k] = await Promise.all([
      chamarApi<{ planos: PlanoPadrao[] }>('/api/v1/planos-do-pacote'),
      chamarApi<{ bandeiras: Bandeira[] }>('/api/v1/bandeiras'),
      chamarApi<{ categorias: Categoria[] }>('/api/v1/categorias-de-ativo'),
      chamarApi<{ idiomaPadrao: Idioma; modelos: Checklist[] }>('/api/v1/modelos-de-checklist'),
    ]);
    if (p.ok) setPlanos(p.dados.planos);
    else setAviso({ tipo: 'erro', erro: p.erro });
    if (b.ok) setBandeiras(b.dados.bandeiras);
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
  const nomeDaBandeira = (id: string | null) =>
    id === null ? t('admin.pacote.todo_o_grupo') : (bandeiras.find((b) => b.id === id)?.nome ?? id);

  if (!planos) {
    return aviso?.tipo === 'erro' ? (
      <MensagemDeErro>{mensagemDeErro(aviso.erro)}</MensagemDeErro>
    ) : (
      <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
    );
  }

  return (
    <div className="hk-pilha">
      <Painel titulo={t('admin.pacote.novo')}>
        {categorias.some((c) => c.ativa) ? (
          <FormularioDePlanoPadrao
            plano={null}
            bandeiras={bandeiras}
            categorias={categorias}
            checklists={checklists}
            nomeDaCategoria={nomeDaCategoria}
            rotulo={rotulo}
            executar={executar}
          />
        ) : (
          <MensagemVazia>{t('admin.modelos_de_ativo.sem_categorias')}</MensagemVazia>
        )}
        <p className="hk-suave">{t('admin.pacote.dica')}</p>
        <Aviso aviso={aviso} />
      </Painel>

      {planos.length === 0 ? (
        <MensagemVazia>{t('admin.pacote.vazio')}</MensagemVazia>
      ) : (
        planos.map((p) => (
          <Painel
            key={`${p.id}|${p.versao}`}
            titulo={p.nome}
            acoes={
              <>
                <Selo tom="azul">{nomeDaBandeira(p.bandeiraId)}</Selo>
                <Selo tom="cinza">
                  {t('admin.preventivas.periodicidade', {
                    intervalo: p.intervalo,
                    unidade: p.unidade,
                  })}
                </Selo>
                <Selo tom={p.ativa ? 'verde' : 'cinza'}>
                  {p.ativa ? t('admin.pacote.ativo') : t('admin.pacote.desativado')}
                </Selo>
              </>
            }
          >
            <FormularioDePlanoPadrao
              plano={p}
              bandeiras={bandeiras}
              categorias={categorias}
              checklists={checklists}
              nomeDaCategoria={nomeDaCategoria}
              rotulo={rotulo}
              executar={executar}
            />
          </Painel>
        ))
      )}
    </div>
  );
}
