// O checklist da OS no PWA (fase 1b, PV1; ADR-040): um campo por item, no
// tipo dele, com as respostas que a API deu e as da fila por cima
// (projecao.ts). Salvar manda só os itens que mudaram, numa operação
// os.responder_checklist, que vai pela fila e funciona sem rede; esvaziar um
// item manda null, que tira a resposta. O domínio confere os valores antes de
// pôr na fila, e o servidor confere de novo. Responder vale com a OS em
// execução ou pausada; antes, os campos ficam só para leitura.
import {
  type DefinicaoDeCampo,
  type ValorDeCampo,
  validarRespostasDoChecklist,
} from '@hubkeep/dominio';
import { ehIdioma, resolverNome } from '@hubkeep/i18n';
import { Botao, Campo, Entrada, Painel, Selecao } from '@hubkeep/ui';
import { type FormEvent, useState } from 'react';
import { useT } from '../i18n';
import { type OsNoAparelho, aceitaRegistro, checklistFaltando } from '../os/projecao';

type Respostas = Record<string, ValorDeCampo | null>;

/** O valor como fica no campo do formulário. */
const paraCampo = (v: ValorDeCampo | undefined): string => (v === undefined ? '' : String(v));

/** O texto do campo de volta ao tipo do item; vazio é "sem resposta". */
function doCampo(item: DefinicaoDeCampo, texto: string): ValorDeCampo | null {
  const limpo = texto.trim();
  if (limpo === '') return null;
  if (item.tipo === 'sim_nao') return limpo === 'true';
  if (item.tipo === 'numero') return Number(limpo.replace(',', '.'));
  return limpo;
}

export function ChecklistDaOs(props: {
  os: OsNoAparelho;
  idioma: string;
  idiomaPadrao: string;
  /** Põe as respostas na fila; devolve se deu certo (o erro vira aviso na tela da OS). */
  aoSalvar: (respostas: Respostas) => Promise<boolean>;
  /** O erro de regra antes da fila (valor fora do tipo), para o aviso da tela. */
  aoRecusar: (codigo: string) => void;
}) {
  const t = useT();
  const checklist = props.os.checklist;
  const atuais = (checklist?.respostas ?? {}) as Record<string, { valor: ValorDeCampo }>;
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  if (!checklist) return null;
  const itens = checklist.itens as DefinicaoDeCampo[];
  const editavel = aceitaRegistro(props.os.estado);
  const faltam = checklistFaltando(props.os).length;
  const rotulo = (r: object) =>
    resolverNome(r as Record<string, string>, ehIdioma(props.idioma) ? props.idioma : 'pt-BR', {
      idiomaPadrao: ehIdioma(props.idiomaPadrao) ? props.idiomaPadrao : 'pt-BR',
    }) ?? '';
  const valorNoCampo = (chave: string) => rascunho[chave] ?? paraCampo(atuais[chave]?.valor);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const mudancas: Respostas = {};
    for (const item of itens) {
      if (rascunho[item.chave] === undefined) continue;
      const novo = doCampo(item, rascunho[item.chave] ?? '');
      const antes = atuais[item.chave]?.valor;
      if (novo === null ? antes === undefined : novo === antes) continue;
      mudancas[item.chave] = novo;
    }
    if (Object.keys(mudancas).length === 0) return;
    try {
      validarRespostasDoChecklist(itens, mudancas);
    } catch (erro) {
      return props.aoRecusar((erro as { codigo?: string }).codigo ?? 'checklist_resposta_invalida');
    }
    if (await props.aoSalvar(mudancas)) setRascunho({});
  }

  const campo = (item: DefinicaoDeCampo) => {
    const comum = {
      name: item.chave,
      disabled: !editavel,
      value: valorNoCampo(item.chave),
      onChange: (e: { target: { value: string } }) =>
        setRascunho((r) => ({ ...r, [item.chave]: e.target.value })),
    };
    const titulo = t('tecnico.os.checklist.item', {
      rotulo: rotulo(item.rotulos),
      unidade: item.unidade ?? '',
      temUnidade: String(item.unidade !== null),
      obrigatorio: String(item.obrigatorio),
    });
    return (
      <Campo key={item.chave} rotulo={titulo}>
        {(p) => {
          switch (item.tipo) {
            case 'sim_nao':
              return (
                <Selecao {...p} {...comum}>
                  <option value="">{t('tecnico.os.checklist.sem_resposta')}</option>
                  <option value="true">{t('checklist.sim_nao', { valor: 'true' })}</option>
                  <option value="false">{t('checklist.sim_nao', { valor: 'false' })}</option>
                </Selecao>
              );
            case 'lista':
              return (
                <Selecao {...p} {...comum}>
                  <option value="">{t('tecnico.os.checklist.sem_resposta')}</option>
                  {item.opcoes.map((o) => (
                    <option key={o.chave} value={o.chave}>
                      {rotulo(o.rotulos) || o.chave}
                    </option>
                  ))}
                </Selecao>
              );
            case 'numero':
              return <Entrada {...p} {...comum} type="number" step="any" inputMode="decimal" />;
            case 'data':
              return <Entrada {...p} {...comum} type="date" />;
            default:
              return <Entrada {...p} {...comum} maxLength={500} />;
          }
        }}
      </Campo>
    );
  };

  return (
    <Painel titulo={t('tecnico.os.checklist.titulo', { nome: rotulo(checklist.nomes) })}>
      <form onSubmit={(e) => void salvar(e)} data-checklist={checklist.id}>
        {faltam > 0 && (
          <p className="tc-nota" data-checklist-faltam={faltam}>
            {props.os.checklistCompletoObrigatorio
              ? t('tecnico.os.checklist.faltam_para_concluir', { n: faltam })
              : t('tecnico.os.checklist.faltam', { n: faltam })}
          </p>
        )}
        {!editavel && <p className="tc-nota">{t('tecnico.os.checklist.inicie')}</p>}
        {itens.map(campo)}
        {editavel && <Botao type="submit">{t('tecnico.os.checklist.salvar')}</Botao>}
      </form>
    </Painel>
  );
}
