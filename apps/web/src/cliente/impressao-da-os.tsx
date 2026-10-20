'use client';
// A OS impressa (fase 1c, item 9; seção 6 de docs/referencia/paridade-mock-1c.md):
// o serviço, a origem, o local, o ativo e o responsável; quem executou, a
// execução (os códigos de falha, causa e solução e a reabertura) e o custo
// informado; o checklist com as respostas; as fotos; e o aceite, com a imagem
// da assinatura quando houver. O custo some da folha de quem só enxerga o hotel
// como proprietário: quem decide é o servidor (custoOculto). A folha de estilo
// de impressão (packages/ui) esconde o menu, a barra e os botões, e o papel sai
// com as cores do tema claro, ligado no beforeprint e desfeito no afterprint.
import type { RespostaDaImpressaoDaOs, z } from '@hubkeep/contratos';
import { Botao } from '@hubkeep/ui';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import { ChecklistDaOs } from './checklist-da-os';
import type { CodigosDoTenant } from './codigos-manutencao';
import { CodigosDaOs, type Referencias, useNomes } from './corretiva';
import { useTemaClaroNaImpressao } from './impressao';
import { useT } from '../i18n/cliente';

export type ImpressaoDaOs = z.infer<typeof RespostaDaImpressaoDaOs>;

/** Uma foto da OS, com a URL assinada (a miniatura, quando há). */
export interface FotoNaFolha {
  id: string;
  url: string;
  momento: 'antes' | 'depois' | null;
  criadoEm: string;
}

const dataCurta = { dateStyle: 'short' } as const;
const dataEHora = { dateStyle: 'short', timeStyle: 'short' } as const;

/** O botão de imprimir e a volta para a OS; não saem no papel. */
export function BarraDaImpressao({ osId }: { osId: string }) {
  const t = useT();
  useTemaClaroNaImpressao();
  return (
    <div className="hk-linha-de-botoes hk-nao-imprimir">
      <Link href={`/os/${osId}`} className="hk-voltar">
        {t('impressao_os.voltar')}
      </Link>
      <Botao onClick={() => window.print()}>{t('impressao_os.acao.imprimir')}</Botao>
    </div>
  );
}

export function FolhaDaOs(props: {
  impressao: ImpressaoDaOs;
  refs: Referencias | null;
  codigos: CodigosDoTenant | null;
  /** null: as fotos ainda carregam. */
  fotos: FotoNaFolha[] | null;
  assinaturaUrl: string | null;
  impressaEm: Date;
}) {
  const t = useT();
  const intl = useIntl();
  const nomes = useNomes(props.refs);
  const { os: o, nomes: n } = props.impressao;
  const responsavel = nomes.nome(
    o.responsavel.tipo === 'tecnico'
      ? n.pessoas[o.responsavel.usuarioId]
      : n.equipes[o.responsavel.equipeId],
  );
  const servico = o.preventiva ? o.preventiva.planoNome : (props.impressao.descricao ?? '');
  const origem = o.preventiva
    ? t('impressao_os.origem.preventiva', {
        plano: o.preventiva.planoNome,
        data: intl.formatDate(new Date(`${o.preventiva.dataPrevista}T12:00:00Z`), {
          dateStyle: 'short',
          timeZone: 'UTC',
        }),
      })
    : t('impressao_os.origem.corretiva', { data: intl.formatDate(o.criadoEm, dataCurta) });
  const campos: [string, string][] = [
    [t('impressao_os.campo.servico'), servico],
    [t('impressao_os.campo.origem'), origem],
    [
      t('impressao_os.campo.local'),
      t('corretiva.onde', { hotel: nomes.nome(n.hotel), local: nomes.nome(n.local) }),
    ],
    [t('impressao_os.campo.ativo'), n.ativo ?? t('impressao_os.sem_ativo')],
    [t('impressao_os.campo.responsavel'), responsavel],
    [t('impressao_os.campo.situacao'), nomes.situacao(o.situacaoId)],
    [
      t('impressao_os.campo.executado_por'),
      o.executadoPor === 'fornecedor'
        ? t('impressao_os.executado_por.fornecedor', {
            nome: nomes.nome(o.fornecedorId ? n.fornecedores[o.fornecedorId] : null),
          })
        : t('impressao_os.executado_por.equipe'),
    ],
  ];
  if (o.responsavelArrendamento) {
    campos.push([
      t('impressao_os.campo.arrendamento'),
      t('impressao_os.arrendamento', { responsavel: o.responsavelArrendamento }),
    ]);
  }
  if (!props.impressao.custoOculto) {
    campos.push([
      t('impressao_os.campo.custo'),
      o.custoInformado === null
        ? t('impressao_os.sem_custo')
        : intl.formatNumber(o.custoInformado, { style: 'currency', currency: 'BRL' }),
    ]);
  }
  const temCodigo = Object.values(o.codigos).some((c) => c !== null);

  return (
    <article className="hk-folha" data-os={o.id} data-custo-oculto={props.impressao.custoOculto}>
      <header className="hk-folha-cabecalho">
        <p className="hk-bloco-titulo">
          {t('impressao_os.cabecalho', { hotel: nomes.nome(n.hotel) })}
        </p>
        <p className="hk-suave">
          {t('impressao_os.emitida', { data: intl.formatDate(props.impressaEm, dataEHora) })}
        </p>
      </header>

      <dl className="hk-folha-campos">
        {campos.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt>{rotulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>

      <section className="hk-folha-secao" data-secao="execucao">
        <p className="hk-bloco-titulo">{t('impressao_os.campo.execucao')}</p>
        {temCodigo ? (
          <CodigosDaOs os={o} codigos={props.codigos} />
        ) : (
          <p className="hk-suave">{t('impressao_os.sem_codigos')}</p>
        )}
        {o.motivoReabertura && (
          <p className="hk-suave">
            {t('corretiva.os.motivo_reabertura', { motivo: o.motivoReabertura })}
          </p>
        )}
        {o.motivoCancelamento && (
          <p className="hk-suave">
            {t('corretiva.motivo_cancelamento', { motivo: o.motivoCancelamento })}
          </p>
        )}
      </section>

      <section className="hk-folha-secao" data-secao="checklist">
        <ChecklistDaOs osId={o.id} estado={o.estado} somenteLeitura />
      </section>

      <section className="hk-folha-secao" data-secao="fotos">
        <p className="hk-bloco-titulo">{t('impressao_os.fotos')}</p>
        {props.fotos === null ? (
          <p className="hk-suave">{t('comum.carregando')}</p>
        ) : props.fotos.length === 0 ? (
          <p className="hk-suave">{t('impressao_os.sem_fotos')}</p>
        ) : (
          <ul className="hk-folha-fotos">
            {props.fotos.map((f) => {
              const legenda = t('impressao_os.foto', {
                momento: f.momento ?? 'sem',
                quando: intl.formatDate(f.criadoEm, dataEHora),
              });
              return (
                <li key={f.id} data-foto={f.id}>
                  <img src={f.url} alt={legenda} />
                  <span className="hk-suave">{legenda}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {props.impressao.aceite && (
        <section
          className="hk-folha-secao"
          data-secao="aceite"
          data-aceite={props.impressao.aceite}
        >
          <p className="hk-bloco-titulo">{t('impressao_os.aceite')}</p>
          <p>{t('impressao_os.aceite.estado', { estado: props.impressao.aceite })}</p>
          {props.assinaturaUrl && (
            <img
              className="hk-folha-assinatura"
              src={props.assinaturaUrl}
              alt={t('impressao_os.assinatura')}
            />
          )}
        </section>
      )}
    </article>
  );
}
