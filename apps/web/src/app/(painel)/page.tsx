'use client';
// Tela inicial: o resumo dos últimos 30 dias (1c, seção 4 da paridade) e os
// hotéis visíveis no grupo escolhido. A sessão, o grupo e o idioma ficam na
// moldura (cliente/moldura.tsx); tudo passa pela API, que verifica o token no
// servidor. Quem não vê os indicadores (a API recusa) fica só com os hotéis.
import { MensagemVazia, Painel, Selo, type TomDeSelo, Tabela } from '@hubkeep/ui';
import { useEffect, useState } from 'react';
import { chamarApi } from '../../cliente/api';
import type { PainelDeIndicadores } from '../../cliente/indicadores';
import { ResumoDoInicio, periodosDoResumo } from '../../cliente/resumo-do-inicio';
import { useT } from '../../i18n/cliente';

interface Hotel {
  id: string;
  nome: string;
  status: string;
}

const indicadoresDo = (p: { inicio: string; fim: string }) =>
  chamarApi<PainelDeIndicadores>(`/api/v1/indicadores?${new URLSearchParams(p).toString()}`);

const TOM_DO_STATUS: Readonly<Record<string, TomDeSelo>> = {
  ativo: 'verde',
  em_implantacao: 'ambar',
  desativado: 'cinza',
};

export default function Inicio() {
  const t = useT();
  const [hoteis, setHoteis] = useState<Hotel[] | null>(null);
  const [resumo, setResumo] = useState<{
    atual: PainelDeIndicadores;
    anterior: PainelDeIndicadores | null;
  } | null>(null);

  useEffect(() => {
    void fetch('/api/v1/hoteis').then(async (r) =>
      setHoteis(r.ok ? ((await r.json()) as { hoteis: Hotel[] }).hoteis : []),
    );
    const periodos = periodosDoResumo(new Date());
    void Promise.all([indicadoresDo(periodos.atual), indicadoresDo(periodos.anterior)]).then(
      ([atual, anterior]) => {
        if (atual.ok)
          setResumo({ atual: atual.dados, anterior: anterior.ok ? anterior.dados : null });
      },
    );
  }, []);

  return (
    <>
      {resumo ? <ResumoDoInicio atual={resumo.atual} anterior={resumo.anterior} /> : null}
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
