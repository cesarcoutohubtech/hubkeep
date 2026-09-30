// Ativos no PWA (fase 1a, B3b): cadastrar e alterar ativo sem rede. Os dados
// vêm da referência guardada no aparelho (hotéis, locais, categorias e
// ativos); a gravação vira operação da fila (ativo.cadastrar, ativo.alterar,
// ADR-025). O aparelho valida com as mesmas regras do domínio que o servidor
// usa; o servidor confere de novo. A alteração leva a versão guardada: se
// outra pessoa gravou antes, a operação volta como recusada, com
// conflito_de_versao, na fila do dia (ADR-029). Aberta pelo QR (B5), a tela
// já vem no hotel do ativo, com o ativo aberto.
import {
  ErroDeDominio,
  NaoEncontrado,
  exigirLocalParaAtivo,
  lerDefinicoes,
  normalizarNomeDeAtivo,
  normalizarTextoDoAtivo,
  validarCamposDoAtivo,
} from '@hubkeep/dominio';
import { type IdiomaDeExibicao, ehIdioma, resolverNome } from '@hubkeep/i18n';
import { type FormEvent, useState } from 'react';
import { useIntl } from 'react-intl';
import { useT } from '../i18n';
import type {
  AtivoGuardado,
  CampoGuardado,
  CategoriaGuardada,
  LocalGuardado,
  Referencia,
} from '../referencia/banco';
import type { PortaDeFotos } from '../anexos/fotos';
import { filtrarPorBusca } from '../busca';
import { useMotivo } from './FilaDoDia';
import { FotosDoAtivo } from './FotosDoAtivo';

type Valor = string | number | boolean;

export interface GravacaoDeAtivo {
  categoriaId: string | null;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  campos: Record<string, Valor>;
}

/** O ativo aberto pelo QR (B5): pode vir da referência ou da API. */
export interface AtivoAberto {
  hotelId: string;
  ativo: AtivoGuardado;
}

export interface CadastroPendente {
  chave: string;
  nome: string;
  localId: string;
}

const CATEGORIAS_DO_CATALOGO = [
  'refrigeracao',
  'eletrica',
  'hidraulica',
  'elevadores',
  'cozinha',
  'lavanderia',
  'mobiliario',
  'eletronicos',
  'piscina',
  'seguranca',
] as const;

const texto = (f: FormData, campo: string) => {
  const v = String(f.get(campo) ?? '').trim();
  return v === '' ? null : v;
};

function camposDoFormulario(f: FormData, definicoes: readonly CampoGuardado[]) {
  const saida: Record<string, Valor> = {};
  for (const d of definicoes) {
    const nome = `campo.${d.chave}`;
    if (d.tipo === 'sim_nao') {
      const v = f.get(nome);
      if (v === 'sim' || v === 'nao') saida[d.chave] = v === 'sim';
      continue;
    }
    const v = texto(f, nome);
    if (v !== null) saida[d.chave] = d.tipo === 'numero' ? Number(v) : v;
  }
  return saida;
}

interface PropsDoFormulario {
  ativo: AtivoGuardado | null;
  referencia: Referencia;
  locais: readonly LocalGuardado[];
  nomeDoLocal: (id: string) => string;
  nomeDaCategoria: (c: CategoriaGuardada) => string;
  rotulo: (r: Partial<Record<string, string>>, reserva: string) => string;
  gravar: (acao: () => Promise<void>) => Promise<void>;
  aoCadastrar: (localId: string, g: GravacaoDeAtivo) => Promise<void>;
  aoAlterar: (ativo: AtivoGuardado, g: GravacaoDeAtivo) => Promise<void>;
  aoCancelar: () => void;
}

/** Formulário de um ativo, novo ou guardado: a categoria escolhida decide os campos. */
function Formulario(p: PropsDoFormulario) {
  const { ativo, referencia, locais, nomeDoLocal, nomeDaCategoria, rotulo, gravar } = p;
  const t = useT();
  const [categoriaId, setCategoriaId] = useState<string | null>(ativo?.categoriaId ?? null);
  const categoria = referencia.categorias.find((c) => c.id === categoriaId) ?? null;
  const definicoes = categoria?.campos ?? [];
  const valorDe = (chave: string) =>
    categoriaId === ativo?.categoriaId ? ativo?.campos[chave] : undefined;

  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    void gravar(async () => {
      const g: GravacaoDeAtivo = {
        categoriaId,
        nome: normalizarNomeDeAtivo(texto(f, 'nome') ?? ''),
        fabricante: normalizarTextoDoAtivo('fabricante', texto(f, 'fabricante')),
        modelo: normalizarTextoDoAtivo('modelo', texto(f, 'modelo')),
        numeroSerie: normalizarTextoDoAtivo('numero_serie', texto(f, 'numeroSerie')),
        campos: validarCamposDoAtivo(
          categoria
            ? { id: categoria.id, ativa: categoria.ativa, definicoes: lerDefinicoes(definicoes) }
            : null,
          ativo?.categoriaId ?? null,
          camposDoFormulario(f, definicoes),
        ),
      };
      if (ativo) return p.aoAlterar(ativo, g);
      const local = locais.find((l) => l.id === texto(f, 'localId'));
      if (!local) throw new NaoEncontrado('local_nao_encontrado', 'Local não encontrado.');
      exigirLocalParaAtivo(local);
      return p.aoCadastrar(local.id, g);
    });
  }

  return (
    <form onSubmit={enviar} className="coluna">
      {ativo ? (
        <p>{t('admin.ativos.no_local', { local: nomeDoLocal(ativo.localId) })}</p>
      ) : (
        <select name="localId" aria-label={t('admin.ativos.campo.local')} required>
          {locais
            .filter((l) => l.status !== 'inativo')
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
        </select>
      )}
      <input
        name="nome"
        defaultValue={ativo?.nome ?? ''}
        placeholder={t('admin.ativos.campo.nome')}
        aria-label={t('admin.ativos.campo.nome')}
        required
      />
      <select
        aria-label={t('admin.ativos.campo.categoria')}
        value={categoriaId ?? ''}
        onChange={(e) => setCategoriaId(e.target.value || null)}
      >
        <option value="">{t('admin.ativos.sem_categoria')}</option>
        {referencia.categorias
          .filter((c) => c.ativa || c.id === ativo?.categoriaId)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {nomeDaCategoria(c)}
            </option>
          ))}
      </select>
      {(['fabricante', 'modelo', 'numeroSerie'] as const).map((campo) => (
        <input
          key={campo}
          name={campo}
          defaultValue={ativo?.[campo] ?? ''}
          placeholder={t(`admin.ativos.campo.${campo}`)}
          aria-label={t(`admin.ativos.campo.${campo}`)}
        />
      ))}
      {definicoes.map((d) => {
        const nome = `campo.${d.chave}`;
        const etiqueta = rotulo(d.rotulos, d.chave) + (d.unidade ? ` (${d.unidade})` : '');
        const atual = valorDe(d.chave);
        return (
          <label key={`${categoriaId}|${d.chave}`} className="coluna">
            {d.obrigatorio ? t('admin.ativos.obrigatorio', { campo: etiqueta }) : etiqueta}
            {d.tipo === 'lista' ? (
              <select name={nome} defaultValue={typeof atual === 'string' ? atual : ''}>
                <option value="" />
                {d.opcoes.map((o) => (
                  <option key={o.chave} value={o.chave}>
                    {rotulo(o.rotulos, o.chave)}
                  </option>
                ))}
              </select>
            ) : d.tipo === 'sim_nao' ? (
              <select
                name={nome}
                defaultValue={atual === true ? 'sim' : atual === false ? 'nao' : ''}
              >
                <option value="" />
                <option value="sim">{t('admin.ativos.sim')}</option>
                <option value="nao">{t('admin.ativos.nao')}</option>
              </select>
            ) : (
              <input
                name={nome}
                type={d.tipo === 'numero' ? 'number' : d.tipo === 'data' ? 'date' : 'text'}
                step={d.tipo === 'numero' ? 'any' : undefined}
                defaultValue={atual === undefined ? '' : String(atual)}
              />
            )}
          </label>
        );
      })}
      <div className="linha">
        <button type="submit">
          {ativo ? t('admin.ativos.acao.salvar') : t('admin.ativos.acao.cadastrar')}
        </button>
        {ativo && (
          <button type="button" onClick={p.aoCancelar}>
            {t('tecnico.ativos.acao.cancelar')}
          </button>
        )}
      </div>
    </form>
  );
}

export function Ativos(props: {
  /** Aberta pelo QR: o hotel e o ativo que abrem primeiro. */
  aberto?: AtivoAberto | null;
  idioma: IdiomaDeExibicao;
  referencia: Referencia | null;
  pendentes: readonly CadastroPendente[];
  aoCadastrar: (localId: string, g: GravacaoDeAtivo) => Promise<void>;
  aoAlterar: (ativo: AtivoGuardado, g: GravacaoDeAtivo) => Promise<void>;
  aoVoltar: () => void;
  /** Fotos do ativo (B4), com rede; sem a porta, a tela não oferece fotos. */
  fotos?: PortaDeFotos;
  online?: boolean;
}) {
  const t = useT();
  const intl = useIntl();
  const { referencia } = props;
  const [hotelId, setHotelId] = useState(props.aberto?.hotelId ?? referencia?.hoteis[0]?.id ?? '');
  const [editando, setEditando] = useState<AtivoGuardado | null>(props.aberto?.ativo ?? null);
  const [fotosDe, setFotosDe] = useState<AtivoGuardado | null>(null);
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' } | { tipo: 'erro'; codigo: string } | null>(
    null,
  );
  const motivo = useMotivo();

  if (!referencia) {
    return (
      <main className="cartao">
        <button onClick={props.aoVoltar}>{t('comum.voltar')}</button>
        <p>{t('tecnico.ativos.sem_referencia')}</p>
      </main>
    );
  }

  const idiomaPadrao = ehIdioma(referencia.idiomaPadrao) ? referencia.idiomaPadrao : 'pt-BR';
  const nomeDaCategoria = (c: CategoriaGuardada) =>
    resolverNome(c.nomes, props.idioma, {
      doCatalogo:
        c.chavePadrao && (CATEGORIAS_DO_CATALOGO as readonly string[]).includes(c.chavePadrao)
          ? t(`categoria_ativo.padrao.${c.chavePadrao as (typeof CATEGORIAS_DO_CATALOGO)[number]}`)
          : null,
      idiomaPadrao,
    }) ?? c.id;
  const rotulo = (r: Partial<Record<string, string>>, reserva: string) =>
    resolverNome(r, props.idioma, { idiomaPadrao }) ?? reserva;
  const locais = referencia.locais[hotelId] ?? [];
  const doHotel = referencia.ativos[hotelId] ?? [];
  const ativos = filtrarPorBusca(doHotel, busca);
  const nomeDoLocal = (id: string) => locais.find((l) => l.id === id)?.nome ?? id;
  const pendentes = props.pendentes.filter((p) => locais.some((l) => l.id === p.localId));

  /** Valida com as regras do domínio; recusa vira aviso com o código, sem ir à fila. */
  async function gravar(acao: () => Promise<void>) {
    try {
      await acao();
      setAviso({ tipo: 'ok' });
      setEditando(null);
    } catch (e) {
      if (!(e instanceof ErroDeDominio)) throw e;
      setAviso({ tipo: 'erro', codigo: e.codigo });
    }
  }

  return (
    <main className="cartao">
      <header className="linha">
        <strong>{t('admin.ativos.titulo')}</strong>
        <button onClick={props.aoVoltar}>{t('comum.voltar')}</button>
      </header>
      <select
        aria-label={t('admin.ativos.escolher_hotel')}
        value={hotelId}
        onChange={(e) => {
          setHotelId(e.target.value);
          setEditando(null);
          setFotosDe(null);
        }}
      >
        {referencia.hoteis.map((h) => (
          <option key={h.id} value={h.id}>
            {h.nome}
          </option>
        ))}
      </select>
      {aviso && (
        <p role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
          {aviso.tipo === 'ok' ? t('tecnico.ativos.enfileirado') : motivo(aviso.codigo)}
        </p>
      )}
      {fotosDe && props.fotos ? (
        <FotosDoAtivo
          ativo={fotosDe}
          online={props.online ?? false}
          fotos={props.fotos}
          aoFechar={() => setFotosDe(null)}
        />
      ) : editando ? (
        <Formulario
          key={editando.id}
          ativo={editando}
          referencia={referencia}
          locais={locais}
          nomeDoLocal={nomeDoLocal}
          nomeDaCategoria={nomeDaCategoria}
          rotulo={rotulo}
          gravar={gravar}
          aoCadastrar={props.aoCadastrar}
          aoAlterar={props.aoAlterar}
          aoCancelar={() => setEditando(null)}
        />
      ) : (
        <>
          <section>
            <h2>{t('admin.ativos.novo')}</h2>
            <Formulario
              key={hotelId}
              ativo={null}
              referencia={referencia}
              locais={locais}
              nomeDoLocal={nomeDoLocal}
              nomeDaCategoria={nomeDaCategoria}
              rotulo={rotulo}
              gravar={gravar}
              aoCadastrar={props.aoCadastrar}
              aoAlterar={props.aoAlterar}
              aoCancelar={() => setEditando(null)}
            />
          </section>
          {pendentes.length > 0 && (
            <section>
              <h2>{t('tecnico.ativos.pendentes_envio')}</h2>
              <ul>
                {pendentes.map((p) => (
                  <li key={p.chave}>
                    {t('tecnico.ativos.pendente', { ativo: p.nome, local: nomeDoLocal(p.localId) })}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h2>{t('admin.ativos.cadastrados')}</h2>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label={t('comum.busca.rotulo')}
              placeholder={t('comum.busca.rotulo')}
            />
            {ativos.length === 0 ? (
              <p>
                {doHotel.length === 0
                  ? t('admin.ativos.vazio')
                  : t('comum.busca.sem_resultado', { termo: busca.trim() })}
              </p>
            ) : (
              <ul>
                {ativos.map((a) => (
                  <li key={a.id} className="linha">
                    <span>
                      {t('tecnico.ativos.item', { ativo: a.nome, local: nomeDoLocal(a.localId) })}
                    </span>
                    {!a.ativo && <small>{t('admin.ativos.desativado')}</small>}
                    {a.paradoDesde && (
                      <small data-parado-desde={a.paradoDesde}>
                        {t('tecnico.ativos.parado_desde', {
                          quando: intl.formatDate(a.paradoDesde, {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }),
                        })}
                      </small>
                    )}
                    <button onClick={() => setEditando(a)}>
                      {t('tecnico.ativos.acao.alterar')}
                    </button>
                    {props.fotos && (
                      <button onClick={() => setFotosDe(a)}>{t('tecnico.fotos.abrir')}</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
