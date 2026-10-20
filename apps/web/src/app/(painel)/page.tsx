'use client';
// Tela inicial: os próximos prazos e os últimos eventos, para a gestão (1c,
// seção 4 da paridade), e os hotéis visíveis no grupo escolhido. A sessão, o
// grupo e o idioma ficam na moldura (cliente/moldura.tsx); tudo passa pela API,
// que verifica o token no servidor.
import { MensagemVazia, Painel, Selo, type TomDeSelo, Tabela } from '@hubkeep/ui';
import { useEffect, useState } from 'react';
import { PrazosEEventos } from '../../cliente/prazos-e-eventos';
import { useT } from '../../i18n/cliente';

interface Hotel {
  id: string;
  nome: string;
  status: string;
}

const TOM_DO_STATUS: Readonly<Record<string, TomDeSelo>> = {
  ativo: 'verde',
  em_implantacao: 'ambar',
  desativado: 'cinza',
};

export default function Inicio() {
  const t = useT();
  const [hoteis, setHoteis] = useState<Hotel[] | null>(null);

  useEffect(() => {
    void fetch('/api/v1/hoteis').then(async (r) =>
      setHoteis(r.ok ? ((await r.json()) as { hoteis: Hotel[] }).hoteis : []),
    );
  }, []);

  return (
    <>
      <PrazosEEventos />
      <Painel titulo={t('inicio.hoteis.titulo')}>
        {hoteis === null ? (
          <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
        ) : hoteis.length === 0 ? (
          <MensagemVazia>{t('inicio.hoteis.vazio')}</MensagemVazia>
        ) : (
          <Tabela legenda={t('inicio.hoteis.titulo')}>
            <thead>
              <tr>
                <th scope="col">{t('admin.hoteis.coluna.hotel')}</th>
                <th scope="col">{t('admin.hoteis.coluna.situacao')}</th>
              </tr>
            </thead>
            <tbody>
              {hoteis.map((h) => (
                <tr key={h.id}>
                  <td>{h.nome}</td>
                  <td>
                    <Selo tom={TOM_DO_STATUS[h.status] ?? 'cinza'}>
                      {t('hotel.status', { status: h.status })}
                    </Selo>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Painel>
    </>
  );
}
