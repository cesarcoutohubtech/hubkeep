'use client';
// Moldura das telas autenticadas (ADR-038, U3): menu lateral, barra superior
// e faixa de escopo do @hubkeep/ui, em volta de toda página de app/(painel).
//
// Sessão e grupo: a moldura pede GET /api/v1/sessao (401 leva ao login) e
// guarda o grupo escolhido no cookie hk_tenant, que a API lê. Com o cookie já
// gravado, a página carrega junto; sem ele (primeiro acesso), espera o grupo.
// Trocar de grupo pede a página de novo, porque cada tela carrega os dados do
// grupo ao montar.
//
// Idioma (F0-10b): o layout já resolve pelo perfil. O seletor grava a escolha
// no perfil (PUT /api/v1/preferencias), e o idioma resolvido vai para o
// cookie hk_idioma só para a tela de login seguir nele depois de sair.
//
// HubKeep Intelligence (módulo opcional; decisão do Cesar de 10/10/2026): o
// item do menu aparece só quando GET /api/v1/inteligencia/resumo responde,
// com a contagem dos insights abertos. Sem o módulo no grupo, ou sem papel
// que decide insight, a rota responde 404 e o item não existe. Antes da
// abertura das telas (inteligencia.visibilidade_telas; adendo ao ADR-035 de
// 12/10/2026), o resumo também responde 404; aí, se GET
// /api/v1/inteligencia/abertura responde (só o Admin do grupo), o item aparece
// sem contagem e leva à página da abertura. A moldura não importa o pacote do
// módulo: fala só com a API.
import { type Chave, type IdiomaDeExibicao, PSEUDO_IDIOMA, ehIdioma } from '@hubkeep/i18n';
import {
  Botao,
  Campo,
  Estrutura,
  GrupoDeMenu,
  ItemDeMenu,
  Marca,
  Selecao,
  type Tema,
} from '@hubkeep/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  SeletorDeIdioma,
  gravarCookieDeIdioma,
  useIdioma,
  useT,
  useTrocarIdioma,
} from '../i18n/cliente';
import { COOKIE_TEMA } from '../tema';
import { chamarApi } from './api';
import { sair as encerrarSessao } from './sessao';

interface Sessao {
  email: string | null;
  tenants: string[];
}
interface Preferencias {
  idioma: string;
  gravadas: { idioma: string | null; formatoRegional: string | null; fuso: string | null };
}

/** O menu: grupos e itens, na ordem do mock. A API decide o que cada papel vê. */
export const MENU: readonly { grupo: Chave; itens: readonly { href: string; chave: Chave }[] }[] = [
  {
    grupo: 'menu.grupo.operacao',
    itens: [
      { href: '/', chave: 'menu.inicio' },
      { href: '/chamados', chave: 'menu.chamados' },
      { href: '/os', chave: 'menu.os' },
      { href: '/sla', chave: 'menu.avisos_sla' },
      { href: '/admin/paradas', chave: 'menu.paradas' },
    ],
  },
  {
    grupo: 'menu.grupo.cadastros',
    itens: [
      { href: '/admin/hoteis', chave: 'menu.hoteis' },
      { href: '/admin/locais', chave: 'menu.locais' },
      { href: '/admin/categorias', chave: 'menu.categorias' },
      { href: '/admin/codigos', chave: 'menu.codigos' },
      { href: '/admin/checklists', chave: 'menu.checklists' },
      { href: '/admin/modelos-de-ativo', chave: 'menu.modelos_de_ativo' },
      { href: '/admin/preventivas', chave: 'menu.preventivas' },
      { href: '/admin/ativos', chave: 'menu.ativos' },
      { href: '/admin/equipes', chave: 'menu.equipes' },
      { href: '/admin/proprietarios', chave: 'menu.proprietarios' },
      { href: '/admin/fornecedores', chave: 'menu.fornecedores' },
      { href: '/admin/bandeiras', chave: 'menu.bandeiras' },
      { href: '/admin/membros', chave: 'menu.membros' },
    ],
  },
  {
    grupo: 'menu.grupo.configuracao',
    itens: [
      { href: '/admin/configuracao', chave: 'menu.configuracao' },
      { href: '/admin/feriados', chave: 'menu.feriados' },
      { href: '/admin/sla', chave: 'menu.sla' },
      { href: '/admin/arrendamento', chave: 'menu.arrendamento' },
      { href: '/admin/auditoria', chave: 'menu.auditoria' },
      { href: '/admin/implantacao', chave: 'menu.implantacao' },
    ],
  },
];

/** O item do Intelligence, fora do MENU: só aparece com o módulo e o papel. */
export const ITEM_DO_INTELLIGENCE = {
  grupo: 'menu.grupo.modulo_opcional',
  href: '/inteligencia/insights',
  chave: 'menu.inteligencia',
} as const satisfies { grupo: Chave; href: string; chave: Chave };

/** Para o Admin do grupo, com as telas ainda fechadas: a página da abertura. */
export const HREF_DA_ABERTURA = '/inteligencia/abertura';

/** Mews V1: item separado do MENU porque só o Admin vê (GET autenticado). */
export const ITEM_DA_MEWS = {
  href: '/admin/mews',
  chave: 'menu.mews',
} as const satisfies { href: string; chave: Chave };

/** O item do Intelligence fica ativo em todas as telas do módulo. */
export const intelligenceAtivo = (caminho: string) =>
  caminho === '/inteligencia' || caminho.startsWith('/inteligencia/');

/** Item do menu que corresponde ao caminho: o próprio, ou o pai (/chamados/123). */
export const itemAtivo = (caminho: string, href: string) =>
  href === '/' ? caminho === '/' : caminho === href || caminho.startsWith(`${href}/`);

/** Título da barra superior (o h1 da tela), pela rota. */
const TITULOS: readonly (readonly [RegExp, Chave])[] = [
  [/^\/$/, 'menu.inicio'],
  [/^\/chamados$/, 'corretiva.chamados.titulo'],
  [/^\/chamados\/[^/]+$/, 'corretiva.chamado.titulo'],
  [/^\/os$/, 'corretiva.os.titulo'],
  [/^\/os\/[^/]+\/impressao$/, 'impressao_os.titulo'],
  [/^\/sla$/, 'sla.painel.titulo'],
  [/^\/admin\/paradas$/, 'admin.paradas.titulo'],
  [/^\/admin\/hoteis$/, 'admin.hoteis.titulo'],
  [/^\/admin\/mews$/, 'admin.mews.titulo'],
  [/^\/admin\/locais$/, 'admin.locais.titulo'],
  [/^\/admin\/categorias$/, 'admin.categorias.titulo'],
  [/^\/admin\/codigos$/, 'admin.codigos.titulo'],
  [/^\/admin\/checklists$/, 'admin.checklists.titulo'],
  [/^\/admin\/modelos-de-ativo$/, 'admin.modelos_de_ativo.titulo'],
  [/^\/admin\/preventivas$/, 'admin.preventivas.titulo'],
  [/^\/admin\/ativos$/, 'admin.ativos.titulo'],
  [/^\/admin\/equipes$/, 'admin.equipes.titulo'],
  [/^\/admin\/proprietarios$/, 'admin.proprietarios.titulo'],
  [/^\/admin\/fornecedores$/, 'admin.fornecedores.titulo'],
  [/^\/admin\/bandeiras$/, 'admin.bandeiras.titulo'],
  [/^\/admin\/membros$/, 'admin.membros.titulo'],
  [/^\/admin\/configuracao$/, 'admin.configuracao.titulo'],
  [/^\/admin\/feriados$/, 'admin.feriados.titulo'],
  [/^\/admin\/sla$/, 'admin.sla.titulo'],
  [/^\/admin\/arrendamento$/, 'admin.arrendamento.titulo'],
  [/^\/admin\/auditoria$/, 'admin.auditoria.titulo'],
  [/^\/admin\/implantacao$/, 'admin.implantacao.titulo'],
  [/^\/inteligencia\/insights$/, 'menu.inteligencia'],
  [/^\/inteligencia\/insights\/[^/]+$/, 'inteligencia.pagina.titulo'],
  [/^\/inteligencia\/ativos\/[^/]+$/, 'inteligencia.ativo.titulo'],
  [/^\/inteligencia\/abertura$/, 'inteligencia.abertura.titulo'],
  [/^\/inteligencia\/sinais$/, 'inteligencia.sinais.titulo'],
];

export const tituloDaRota = (caminho: string): Chave | undefined =>
  TITULOS.find(([rota]) => rota.test(caminho))?.[1];

const COOKIE_TENANT = 'hk_tenant';
const seguro = () => (location.protocol === 'https:' ? '; secure' : '');
const lerCookie = (nome: string) =>
  document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${nome}=`))
    ?.split('=')[1] ?? null;
const gravarCookieTenant = (tn: string) => {
  document.cookie = `${COOKIE_TENANT}=${tn}; path=/; samesite=lax${seguro()}`;
};

export function Moldura({ temaInicial, children }: { temaInicial: Tema; children: ReactNode }) {
  const t = useT();
  const router = useRouter();
  const caminho = usePathname();
  const { idioma } = useIdioma();
  const trocarIdioma = useTrocarIdioma();
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [tenant, setTenant] = useState<string | null>(null);
  // Com o cookie do grupo já gravado, a página não precisa esperar a sessão.
  const [grupoPronto, setGrupoPronto] = useState(false);
  const [preferencias, setPreferencias] = useState<Preferencias | null>(null);
  const [tema, setTema] = useState<Tema>(temaInicial);
  // Insights abertos, ou null: sem o Intelligence para quem vê, sem item.
  const [abertos, setAbertos] = useState<number | null>(null);
  // Telas fechadas, mas quem vê é o Admin do grupo: o item leva à abertura.
  const [soAbertura, setSoAbertura] = useState(false);
  const [mewsVisivel, setMewsVisivel] = useState(false);

  useEffect(() => {
    const salvo = lerCookie(COOKIE_TENANT);
    if (salvo) {
      setTenant(salvo);
      setGrupoPronto(true);
    }
    void fetch('/api/v1/sessao').then(async (r) => {
      if (r.status === 401) return router.replace('/login');
      const s = (await r.json()) as Sessao;
      setSessao(s);
      const escolhido = salvo ?? s.tenants[0] ?? null;
      if (escolhido && !salvo) gravarCookieTenant(escolhido);
      setTenant(escolhido);
      setGrupoPronto(true);
    });
  }, [router]);

  const sincronizarIdioma = useCallback(async () => {
    const rp = await fetch('/api/v1/preferencias');
    if (!rp.ok) return;
    const p = (await rp.json()) as Preferencias;
    setPreferencias(p);
    // O pseudo-idioma (dev) não é gravado no perfil: fica até trocar à mão.
    if (idioma === PSEUDO_IDIOMA || !ehIdioma(p.idioma)) return;
    if (p.idioma !== idioma) trocarIdioma(p.idioma);
    else gravarCookieDeIdioma(p.idioma);
  }, [idioma, trocarIdioma]);

  useEffect(() => {
    if (tenant) void sincronizarIdioma();
  }, [tenant, sincronizarIdioma]);

  useEffect(() => {
    if (!grupoPronto) return;
    void chamarApi<{ abertos: number }>('/api/v1/inteligencia/resumo').then(async (r) => {
      setAbertos(r.ok ? r.dados.abertos : null);
      setSoAbertura(!r.ok && (await chamarApi('/api/v1/inteligencia/abertura')).ok);
    });
  }, [grupoPronto, caminho]);

  useEffect(() => {
    if (!grupoPronto || !tenant) {
      setMewsVisivel(false);
      return;
    }
    let valido = true;
    // O servidor valida Admin com authz.eh_admin_grupo() e RLS.
    // Nao mostrar sequer o item a gerentes, tecnicos ou sem contexto.
    void chamarApi('/api/v1/mews/status').then((r) => {
      if (valido) setMewsVisivel(r.ok);
    });
    return () => {
      valido = false;
    };
  }, [grupoPronto, tenant]);

  function trocarGrupo(tn: string) {
    gravarCookieTenant(tn);
    location.reload();
  }

  async function escolherIdioma(novo: IdiomaDeExibicao) {
    if (novo !== PSEUDO_IDIOMA && preferencias) {
      await fetch('/api/v1/preferencias', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...preferencias.gravadas, idioma: novo }),
      });
    }
    trocarIdioma(novo);
  }

  function alternarTema() {
    const novo: Tema = tema === 'escuro' ? 'claro' : 'escuro';
    if (novo === 'claro') document.documentElement.dataset['tema'] = 'claro';
    else delete document.documentElement.dataset['tema'];
    document.cookie = `${COOKIE_TEMA}=${novo}; path=/; max-age=31536000; samesite=lax${seguro()}`;
    setTema(novo);
  }

  async function sair() {
    await encerrarSessao();
    router.replace('/login');
  }

  const titulo = tituloDaRota(caminho);
  return (
    <Estrutura
      marca={<Marca nome={t('app.nome')} />}
      rotuloDoMenu={t('menu.rotulo')}
      rotuloPularParaConteudo={t('menu.pular')}
      {...(titulo ? { titulo: t(titulo) } : {})}
      menu={
        <>
          {MENU.map((g) => (
            <GrupoDeMenu key={g.grupo} rotulo={t(g.grupo)}>
              {g.itens.map((i) => (
                <ItemDeMenu
                  key={i.href}
                  href={i.href}
                  componente={Link}
                  ativo={itemAtivo(caminho, i.href)}
                >
                  {t(i.chave)}
                </ItemDeMenu>
              ))}
              {g.grupo === 'menu.grupo.configuracao' && mewsVisivel && (
                <ItemDeMenu
                  href={ITEM_DA_MEWS.href}
                  componente={Link}
                  ativo={itemAtivo(caminho, ITEM_DA_MEWS.href)}
                >
                  {t(ITEM_DA_MEWS.chave)}
                </ItemDeMenu>
              )}
            </GrupoDeMenu>
          ))}
          {(abertos !== null || soAbertura) && (
            <GrupoDeMenu rotulo={t(ITEM_DO_INTELLIGENCE.grupo)}>
              <ItemDeMenu
                href={abertos !== null ? ITEM_DO_INTELLIGENCE.href : HREF_DA_ABERTURA}
                componente={Link}
                ativo={intelligenceAtivo(caminho)}
                {...(abertos !== null ? { contagem: abertos } : {})}
              >
                {t(ITEM_DO_INTELLIGENCE.chave)}
              </ItemDeMenu>
            </GrupoDeMenu>
          )}
        </>
      }
      rodapeDoMenu={sessao?.email ?? undefined}
      acoes={
        <>
          <SeletorDeIdioma aoEscolher={(i) => void escolherIdioma(i)} />
          <Botao tamanho="pequeno" onClick={alternarTema} aria-pressed={tema === 'claro'}>
            {t('tema.claro')}
          </Botao>
          <Botao tamanho="pequeno" onClick={() => void sair()}>
            {t('inicio.sair')}
          </Botao>
        </>
      }
      escopo={
        sessao && sessao.tenants.length === 0 ? (
          t('inicio.sem_grupo')
        ) : sessao && sessao.tenants.length > 1 ? (
          <Campo rotulo={t('inicio.grupo')}>
            {(p) => (
              <Selecao {...p} value={tenant ?? ''} onChange={(e) => trocarGrupo(e.target.value)}>
                {sessao.tenants.map((tn) => (
                  <option key={tn} value={tn}>
                    {tn}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
        ) : undefined
      }
    >
      {grupoPronto ? children : <p>{t('comum.carregando')}</p>}
    </Estrutura>
  );
}
