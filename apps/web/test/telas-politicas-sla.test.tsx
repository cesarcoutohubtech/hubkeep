// Tela das políticas do SLA (fase 1c; ADR-042 e ADR-043): os blocos dos
// prazos, do horário de atendimento e dos avisos nos quatro idiomas e no
// pseudo-idioma, renderizados no servidor (react-dom/server), com dados
// prontos, sem rede.
import { ESCALONAMENTO_PADRAO, HORARIO_PADRAO, SLA_PADRAO } from '@hubkeep/dominio';
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ComponentProps } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BlocosDoSla } from '../src/cliente/blocos-do-sla';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const P_URGENTE = '01900000-0000-7000-8000-000000000001';
const P_PROPRIA = '01900000-0000-7000-8000-000000000002';
const C_AR = '01900000-0000-7000-8000-0000000000a1';

const resolvida = <C extends string, V>(chave: C, padrao: V, hotel: V | null = null) => ({
  chave,
  padrao,
  grupo: null,
  bandeira: null,
  hotel,
  efetiva: hotel ?? padrao,
  origem: hotel ? ('hotel' as const) : ('padrao' as const),
});

const PROPS: ComponentProps<typeof BlocosDoSla> = {
  sla: resolvida('chamado.sla', SLA_PADRAO, {
    ...SLA_PADRAO,
    porCategoria: { [C_AR]: { solucaoHoras: 6, pausa: true } },
  }),
  horario: resolvida('hotel.horario_atendimento', HORARIO_PADRAO),
  escalonamento: resolvida('chamado.escalonamento', ESCALONAMENTO_PADRAO),
  prioridades: [
    { id: P_URGENTE, chavePadrao: 'urgente', nome: 'Urgente do grupo' },
    { id: P_PROPRIA, chavePadrao: null, nome: 'Prioridade própria' },
  ],
  categorias: [{ id: C_AR, chavePadrao: null, nome: 'Ar-condicionado' }],
  temHotel: true,
  temBandeira: false,
  aoGravar: () => undefined,
};

const renderizar = (idioma: IdiomaDeExibicao, props = PROPS) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      <BlocosDoSla {...props} />
    </ProvedorDeIdioma>,
  );

describe('políticas do SLA em cada idioma', () => {
  it.each<IdiomaDeExibicao>([...IDIOMAS, PSEUDO_IDIOMA])(
    '%s: os três blocos, sem chave crua nem estilo inline',
    (idioma) => {
      const html = renderizar(idioma);
      for (const chave of ['chamado.sla', 'hotel.horario_atendimento', 'chamado.escalonamento']) {
        expect(html).toContain(`data-politica="${chave}"`);
      }
      expect(html).not.toMatch(/admin\.sla\./);
      expect(html).not.toContain('style=');
      expect(html).toContain('Urgente do grupo');
      expect(html).toContain('Ar-condicionado');
    },
  );

  it('pt-BR: a linha da prioridade padrão vem pela chave padrão; a própria fica em branco', () => {
    const html = renderizar('pt-BR');
    expect(html).toMatch(
      new RegExp(`name="prioridade\\.${P_URGENTE}\\.atendimento"[^>]*value="1"`),
    );
    expect(html).toMatch(new RegExp(`name="prioridade\\.${P_URGENTE}\\.solucao"[^>]*value="2"`));
    expect(html).toMatch(new RegExp(`name="prioridade\\.${P_PROPRIA}\\.atendimento"[^>]*value=""`));
    expect(html).toMatch(new RegExp(`name="categoria\\.${C_AR}\\.solucao"[^>]*value="6"`));
    expect(html).toMatch(new RegExp(`name="categoria\\.${C_AR}\\.pausa"[^>]*checked`));
    expect(html).toContain('Urgente do grupo: Atendimento (horas)');
  });

  it('pt-BR: o horário de segunda vem do padrão; o domingo em branco', () => {
    const html = renderizar('pt-BR');
    expect(html).toMatch(/name="horario\.seg\.0\.inicio"[^>]*value="08:00"/);
    expect(html).toMatch(/name="horario\.seg\.0\.fim"[^>]*value="18:00"/);
    expect(html).toMatch(/name="horario\.dom\.0\.inicio"[^>]*value=""/);
    expect(html).toContain('Segunda-feira, intervalo 1: início');
  });

  it('pt-BR: os avisos com o percentual e quem recebe cada nível', () => {
    const html = renderizar('pt-BR');
    expect(html).toMatch(/name="percentualDoAviso"[^>]*value="80"/);
    expect(html).toMatch(/name="vencido\.gestor_csc"[^>]*checked/);
    expect(html).not.toMatch(/name="emRisco\.gestor_csc"[^>]*checked/);
    expect(html).toContain('Quem recebe o aviso de prazo vencido');
    expect(html).toContain('Responsável pela OS');
  });

  it('os botões de gravar seguem o nível: sem hotel, só o grupo; com bandeira, também ela', () => {
    const contar = (html: string, valor: string) =>
      html.match(new RegExp(`<button[^>]*value="${valor}"[^>]*type="submit"`, 'g'))?.length ?? 0;
    const comHotel = renderizar('pt-BR');
    expect(contar(comHotel, 'grupo')).toBe(3);
    expect(contar(comHotel, 'hotel')).toBe(3);
    expect(contar(comHotel, 'bandeira')).toBe(0);
    const semHotel = renderizar('pt-BR', { ...PROPS, temHotel: false });
    expect(contar(semHotel, 'hotel')).toBe(0);
    const comBandeira = renderizar('pt-BR', { ...PROPS, temBandeira: true });
    expect(contar(comBandeira, 'bandeira')).toBe(3);
    expect(comHotel).toContain(mensagensDe('pt-BR')['admin.configuracao.acao.herdar_hotel']);
  });

  it('sem categoria ativa, a mensagem no lugar da tabela', () => {
    const html = renderizar('pt-BR', { ...PROPS, categorias: [] });
    expect(html).toContain(mensagensDe('pt-BR')['admin.sla.categorias.vazio']);
    expect(html).not.toContain('data-categoria=');
  });
});
