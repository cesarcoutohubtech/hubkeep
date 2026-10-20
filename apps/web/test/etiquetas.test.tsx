// QR em lote (fase 1b, M3): a folha leva o QR, o nome e o código legível de
// cada ativo em uso e não recusado, nunca o id; o tamanho da etiqueta vai em
// mm; sem o endereço do PWA, a folha avisa em vez de gerar. Renderiza no
// servidor (react-dom/server), sem rede.
import { mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_URL_DO_TECNICO = 'https://tecnico.exemplo.com.br';
});

const { ProvedorDeIdioma } = await import('../src/i18n/cliente');
const { FolhaDeEtiquetas, ativosDaFolha } = await import('../src/cliente/etiquetas');

const renderizar = (tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma="pt-BR" mensagens={mensagensDe('pt-BR')} pseudoLiberado={false}>
      {tela}
    </ProvedorDeIdioma>,
  );

const L1 = 'a1000000-0000-4000-8000-000000000001';
const L2 = 'a1000000-0000-4000-8000-000000000002';
const C1 = 'ca000000-0000-4000-8000-000000000001';
const ativo = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id: `ab000000-0000-4000-8000-00000000000${id}`,
  nome,
  codigoQr: `7K3M9QX2A${id}`,
  localId: L1,
  categoriaId: C1,
  ativo: true,
  situacaoCadastro: 'aprovado' as const,
  ...extra,
});
const SPLIT = ativo('1', 'Split sala 2');
const ANTIGO = ativo('3', 'Antigo', { ativo: false });
const ATIVOS = [
  SPLIT,
  ativo('2', 'Bomba', { localId: L2 }),
  ANTIGO,
  ativo('4', 'Recusado', { situacaoCadastro: 'recusado' }),
  ativo('5', 'Aguardando', { situacaoCadastro: 'pendente', categoriaId: null }),
];

describe('ativosDaFolha', () => {
  it('fica com os em uso e não recusados, por nome', () => {
    expect(ativosDaFolha(ATIVOS, {}, 'pt-BR').map((a) => a.nome)).toEqual([
      'Aguardando',
      'Bomba',
      'Split sala 2',
    ]);
  });

  it('filtra por local, por categoria e pelos ids da importação', () => {
    expect(ativosDaFolha(ATIVOS, { localId: L2 }, 'pt-BR').map((a) => a.nome)).toEqual(['Bomba']);
    expect(ativosDaFolha(ATIVOS, { categoriaId: C1 }, 'pt-BR')).toHaveLength(2);
    const ids = new Set([SPLIT.id, ANTIGO.id]);
    expect(ativosDaFolha(ATIVOS, { ids }, 'pt-BR').map((a) => a.nome)).toEqual(['Split sala 2']);
  });
});

describe('FolhaDeEtiquetas', () => {
  it('leva o QR, o nome e o código legível, sem o id do ativo', () => {
    const html = renderizar(<FolhaDeEtiquetas ativos={[SPLIT]} tamanho="pequena" />);
    expect(html).toContain('Split sala 2');
    expect(html).toContain('7K3M9-QX2A1');
    expect(html).toContain('<svg');
    expect(html).toContain('--etiqueta-largura:40mm');
    expect(html).not.toContain(SPLIT.id);
  });

  it('sem ativo, a mensagem vazia', () => {
    const html = renderizar(<FolhaDeEtiquetas ativos={[]} tamanho="media" />);
    expect(html).toContain(mensagensDe('pt-BR')['etiquetas.vazia']);
  });
});
