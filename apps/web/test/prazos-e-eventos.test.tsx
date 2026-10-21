// Os próximos prazos e os últimos eventos da tela inicial (1c, seção 4 da
// paridade; decisão 5): a contagem regressiva, o selo do em risco e as linhas
// da auditoria, nos quatro idiomas e no pseudo-idioma, renderizados no
// servidor (react-dom/server), sem rede.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  type EventoNaTela,
  type PrazoNaTela,
  ProximosPrazos,
  UltimosEventos,
  tempoAte,
} from '../src/cliente/prazos-e-eventos';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const AGORA = new Date('2026-10-20T12:00:00Z');
const MIN = 60_000;
const C1 = '0193a000-0000-4000-8000-0000000000c1';
const C2 = '0193a000-0000-4000-8000-0000000000c2';
const H1 = '0193a000-0000-4000-8000-000000000001';

const PRAZOS: PrazoNaTela[] = [
  {
    chamadoId: C1,
    hotelId: H1,
    hotelNome: 'Hotel Centro',
    descricao: 'Ar não liga',
    prioridadeId: null,
    tipo: 'atendimento',
    prazo: new Date(AGORA.getTime() + 25 * MIN).toISOString(),
    emRisco: true,
  },
  {
    chamadoId: C2,
    hotelId: H1,
    hotelNome: 'Hotel Centro',
    descricao: 'Vazamento na pia',
    prioridadeId: null,
    tipo: 'solucao',
    prazo: new Date(AGORA.getTime() + (3 * 60 + 10) * MIN).toISOString(),
    emRisco: false,
  },
];

const EVENTOS: EventoNaTela[] = Array.from({ length: 7 }, (_, i) => ({
  id: `0193a000-0000-4000-8000-00000000e00${i}`,
  em: new Date(AGORA.getTime() - i * MIN).toISOString(),
  hotelId: i === 1 ? null : H1,
  hotelNome: i === 1 ? null : 'Hotel Centro',
  entidade: 'chamado',
  registroId: C1,
  acao: 'abrir',
  usuarioId: i === 2 ? null : '0193a000-0000-4000-8000-0000000000f1',
  usuarioNome: i === 2 ? null : 'Ana',
  mudancas: [],
}));

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      {tela}
    </ProvedorDeIdioma>,
  );
const pt = mensagensDe('pt-BR');

describe('próximos prazos e últimos eventos em cada idioma', () => {
  it.each<IdiomaDeExibicao>([...IDIOMAS, PSEUDO_IDIOMA])(
    '%s: os dois blocos, cheios e vazios, sem chave crua nem estilo inline',
    (idioma) => {
      for (const [prazos, eventos] of [
        [PRAZOS, EVENTOS],
        [[], []],
      ] as const) {
        const html = renderizar(
          idioma,
          <>
            <ProximosPrazos prazos={prazos} agora={AGORA} />
            <UltimosEventos linhas={eventos} />
          </>,
        );
        expect(html).not.toMatch(/(inicio|auditoria|admin)\.[a-z_.]+/);
        expect(html).not.toContain('style=');
      }
    },
  );
});

describe('próximos prazos', () => {
  it('pt-BR: cada prazo com o chamado, o tipo, o hotel e o tempo que falta; o em risco com selo', () => {
    const html = renderizar('pt-BR', <ProximosPrazos prazos={PRAZOS} agora={AGORA} />);
    expect(html.match(/data-chamado=/g)).toHaveLength(2);
    expect(html).toContain(`href="/chamados/${C1}"`);
    expect(html).toContain('em 25 min');
    expect(html).toContain('em 3 h 10 min');
    expect(html).toMatch(/Atendimento · Hotel Centro · /);
    expect(html.match(new RegExp(pt['inicio.prazos.em_risco'], 'g'))).toHaveLength(1);
    expect(html).toContain('href="/chamados"');
  });

  it('o tempo: minutos, horas e minutos, e dias a partir de 48 horas; o prazo de agora é zero', () => {
    const em = (min: number) => new Date(AGORA.getTime() + min * MIN);
    expect(tempoAte(em(0), AGORA)).toEqual({ dias: 0, horas: 0, minutos: 0 });
    expect(tempoAte(em(59), AGORA)).toEqual({ dias: 0, horas: 0, minutos: 59 });
    expect(tempoAte(em(47 * 60 + 5), AGORA)).toEqual({ dias: 0, horas: 47, minutos: 5 });
    expect(tempoAte(em(50 * 60), AGORA)).toEqual({ dias: 2, horas: 0, minutos: 0 });
  });

  it('sem prazo, a mensagem', () => {
    expect(renderizar('pt-BR', <ProximosPrazos prazos={[]} agora={AGORA} />)).toContain(
      pt['inicio.prazos.vazio'],
    );
  });
});

describe('últimos eventos', () => {
  it('pt-BR: os cinco mais recentes, com o registro, a ação, o hotel e quem', () => {
    const html = renderizar('pt-BR', <UltimosEventos linhas={EVENTOS} />);
    expect(html.match(/data-evento=/g)).toHaveLength(5);
    expect(html).toContain('Chamado: ');
    expect(html).toContain('Hotel Centro · Ana');
    expect(html).toContain(`${pt['admin.auditoria.sem_hotel']} · Ana`);
    expect(html).toContain(`Hotel Centro · ${pt['admin.auditoria.filtro.sistema']}`);
    expect(html).toContain('href="/admin/auditoria"');
  });
});
