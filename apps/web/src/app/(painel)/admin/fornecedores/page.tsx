'use client';
// Fornecedores do grupo (fase 1b, I3): cadastrar, alterar, desativar e
// reativar, com a versão vista (ADR-029: se outro gravou antes, a API recusa
// com conflito_de_versao e a tela recarrega), e o histórico de cada um. O
// fornecedor vale para o grupo inteiro. Quem grava é o Admin do grupo, o
// Gestor CSC e o Gerente do hotel; a API recusa os outros com código. O CNPJ
// vai como foi digitado, e a API devolve só os dígitos. Visual do pacote de
// interface (ADR-038).
import { formatarCnpj } from '@hubkeep/dominio';
import {
  Botao,
  Campo,
  Entrada,
  MensagemDeErro,
  MensagemVazia,
  Nota,
  Painel,
  Selo,
} from '@hubkeep/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { HistoricoDoRegistro } from '../../../../cliente/HistoricoDoRegistro';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import { useMensagemDeErro, useT } from '../../../../i18n/cliente';

interface Fornecedor {
  id: string;
  nome: string;
  cnpj: string | null;
  contatoNome: string | null;
  contatoTelefone: string | null;
  contatoEmail: string | null;
  ativo: boolean;
  versao: number;
}

const CAMPOS = ['nome', 'cnpj', 'contatoNome', 'contatoTelefone', 'contatoEmail'] as const;
type CampoDoFornecedor = (typeof CAMPOS)[number];

const ROTULO = {
  nome: 'admin.fornecedores.campo.nome',
  cnpj: 'admin.fornecedores.campo.cnpj',
  contatoNome: 'admin.fornecedores.campo.contato_nome',
  contatoTelefone: 'admin.fornecedores.campo.contato_telefone',
  contatoEmail: 'admin.fornecedores.campo.contato_email',
} as const satisfies Record<CampoDoFornecedor, string>;

const TIPO: Record<CampoDoFornecedor, string> = {
  nome: 'text',
  cnpj: 'text',
  contatoNome: 'text',
  contatoTelefone: 'tel',
  contatoEmail: 'email',
};

/** Texto do campo; vazio vira null (o domínio faz o mesmo). */
const texto = (f: FormData, nome: string): string | null => {
  const v = String(f.get(nome) ?? '').trim();
  return v === '' ? null : v;
};

function FormularioDeFornecedor({
  fornecedor,
  executar,
}: {
  fornecedor?: Fornecedor;
  executar: (caminho: string, init: RequestInit) => Promise<boolean>;
}) {
  const t = useT();

  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const f = new FormData(form);
    const gravacao = {
      nome: texto(f, 'nome') ?? '',
      cnpj: texto(f, 'cnpj'),
      contatoNome: texto(f, 'contatoNome'),
      contatoTelefone: texto(f, 'contatoTelefone'),
      contatoEmail: texto(f, 'contatoEmail'),
    };
    void (async () => {
      const ok = await (fornecedor
        ? executar(`/api/v1/fornecedores/${fornecedor.id}`, {
            method: 'PUT',
            body: JSON.stringify({ ...gravacao, versao: fornecedor.versao }),
          })
        : executar('/api/v1/fornecedores', { method: 'POST', body: JSON.stringify(gravacao) }));
      if (ok && !fornecedor) form.reset();
    })();
  }

  const valorInicial = (campo: CampoDoFornecedor): string => {
    const v = fornecedor?.[campo] ?? '';
    return campo === 'cnpj' && v ? formatarCnpj(v) : v;
  };

  return (
    <form onSubmit={enviar} className="hk-em-linha">
      {CAMPOS.map((campo) => (
        <Campo key={campo} rotulo={t(ROTULO[campo])}>
          {(p) => (
            <Entrada
              {...p}
              name={campo}
              type={TIPO[campo]}
              defaultValue={valorInicial(campo)}
              required={campo === 'nome'}
            />
          )}
        </Campo>
      ))}
      <div className="hk-linha-de-botoes">
        <Botao type="submit" variante={fornecedor ? 'padrao' : 'primario'}>
          {fornecedor
            ? t('admin.fornecedores.acao.salvar')
            : t('admin.fornecedores.acao.cadastrar')}
        </Botao>
        {fornecedor && (
          <Botao
            onClick={() =>
              void executar(
                `/api/v1/fornecedores/${fornecedor.id}/${fornecedor.ativo ? 'desativacao' : 'reativacao'}`,
                { method: 'POST', body: JSON.stringify({ versao: fornecedor.versao }) },
              )
            }
          >
            {fornecedor.ativo
              ? t('admin.fornecedores.acao.desativar')
              : t('admin.fornecedores.acao.reativar')}
          </Botao>
        )}
      </div>
    </form>
  );
}

export default function Fornecedores() {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  const [fornecedores, setFornecedores] = useState<Fornecedor[] | null>(null);
  const [erroDaLista, setErroDaLista] = useState<ErroDaApi | null>(null);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamarApi<{ fornecedores: Fornecedor[] }>('/api/v1/fornecedores');
    if (r.ok) setFornecedores(r.dados.fornecedores);
    else setErroDaLista(r.erro);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function executar(caminho: string, init: RequestInit): Promise<boolean> {
    const r = await chamarApi<unknown>(caminho, init);
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregar();
    return r.ok;
  }

  if (!fornecedores) {
    return erroDaLista ? (
      <MensagemDeErro>{mensagemDeErro(erroDaLista)}</MensagemDeErro>
    ) : (
      <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
    );
  }

  return (
    <div className="hk-pilha">
      <Aviso aviso={aviso} />
      <Painel titulo={t('admin.fornecedores.novo')}>
        <Nota>{t('admin.fornecedores.ajuda')}</Nota>
        <FormularioDeFornecedor executar={executar} />
      </Painel>
      <Painel titulo={t('admin.fornecedores.titulo')}>
        {fornecedores.length === 0 ? (
          <MensagemVazia>{t('admin.fornecedores.vazio')}</MensagemVazia>
        ) : (
          <ul className="hk-lista hk-itens">
            {fornecedores.map((f) => (
              <li key={`${f.id}|${f.versao}`}>
                <div className="hk-item-cabecalho">
                  <strong>{f.nome}</strong>
                  <span className="hk-suave">
                    {f.cnpj ? formatarCnpj(f.cnpj) : t('admin.fornecedores.sem_cnpj')}
                  </span>
                  <Selo tom={f.ativo ? 'verde' : 'cinza'}>
                    {f.ativo ? t('admin.fornecedores.ativo') : t('admin.fornecedores.desativado')}
                  </Selo>
                </div>
                <FormularioDeFornecedor fornecedor={f} executar={executar} />
                <HistoricoDoRegistro entidade="fornecedor" registroId={f.id} />
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}
