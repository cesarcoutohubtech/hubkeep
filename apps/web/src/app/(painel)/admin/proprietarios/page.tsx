'use client';
// Proprietários e vínculos (fase 1a, A4; ADR-031): cadastro, vínculo com UH ou
// hotel inteiro, vigência e acesso (papel proprietario, somente leitura).
// Visual do pacote de interface (ADR-038, U4b).
import {
  Botao,
  Campo,
  Entrada,
  MensagemDeErro,
  MensagemVazia,
  Painel,
  type PropsDoControle,
  Selecao,
  Selo,
} from '@hubkeep/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type ErroDaApi, chamarApi } from '../../../../cliente/api';
import { Aviso, type AvisoDeAcao } from '../../../../cliente/aviso';
import { useMensagemDeErro, useT } from '../../../../i18n/cliente';

interface Hotel {
  id: string;
  nome: string;
}
interface Local {
  id: string;
  nome: string;
  tipo: 'uh' | 'area_comum';
}
interface Vinculo {
  id: string;
  tipo: 'uh' | 'hotel';
  hotelNome: string;
  localNome: string | null;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  vigente: boolean;
}
interface Proprietario {
  id: string;
  nome: string;
  documento: string | null;
  vinculos: Vinculo[];
}
interface Membro {
  usuarioId: string;
  nome: string;
  ativo: boolean;
}

const hoje = () => new Date().toISOString().slice(0, 10);
const texto = (f: FormData, campo: string) => {
  const v = String(f.get(campo) ?? '').trim();
  return v === '' ? null : v;
};

export default function ProprietariosEVinculos() {
  const t = useT();
  const mensagemDeErro = useMensagemDeErro();
  const [proprietarios, setProprietarios] = useState<Proprietario[] | null>(null);
  const [hoteis, setHoteis] = useState<Hotel[]>([]);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [hotelDoVinculo, setHotelDoVinculo] = useState('');
  const [locais, setLocais] = useState<Local[]>([]);
  const [erroDaLista, setErroDaLista] = useState<ErroDaApi | null>(null);
  const [aviso, setAviso] = useState<AvisoDeAcao | null>(null);

  const carregar = useCallback(async () => {
    const [p, h, m] = await Promise.all([
      chamarApi<{ proprietarios: Proprietario[] }>('/api/v1/proprietarios'),
      chamarApi<{ hoteis: Hotel[] }>('/api/v1/hoteis'),
      chamarApi<{ membros: Membro[] }>('/api/v1/membros'),
    ]);
    if (p.ok) setProprietarios(p.dados.proprietarios);
    else setErroDaLista(p.erro);
    if (h.ok) setHoteis(h.dados.hoteis);
    if (m.ok) setMembros(m.dados.membros.filter((x) => x.ativo));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!hotelDoVinculo) return setLocais([]);
    void chamarApi<{ locais: Local[] }>(`/api/v1/hoteis/${hotelDoVinculo}/locais`).then((r) => {
      if (r.ok) setLocais(r.dados.locais.filter((l) => l.tipo === 'uh'));
    });
  }, [hotelDoVinculo]);

  async function executar(caminho: string, init: RequestInit) {
    const r = await chamarApi<unknown>(caminho, init);
    setAviso(r.ok ? { tipo: 'ok' } : { tipo: 'erro', erro: r.erro });
    await carregar();
  }

  function criar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    void executar('/api/v1/proprietarios', {
      method: 'POST',
      body: JSON.stringify({ nome: texto(f, 'nome') ?? '', documento: texto(f, 'documento') }),
    });
  }

  function vincular(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const localId = texto(f, 'localId');
    const vigencia = { vigenciaInicio: texto(f, 'inicio') ?? '', vigenciaFim: texto(f, 'fim') };
    void executar(`/api/v1/proprietarios/${texto(f, 'proprietarioId') ?? ''}/vinculos`, {
      method: 'POST',
      body: JSON.stringify(
        localId
          ? { tipo: 'uh', localId, ...vigencia }
          : { tipo: 'hotel', hotelId: hotelDoVinculo, ...vigencia },
      ),
    });
  }

  function darAcesso(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    void executar('/api/v1/atribuicoes', {
      method: 'POST',
      body: JSON.stringify({
        usuarioId: texto(f, 'usuarioId') ?? '',
        papel: 'proprietario',
        escopo: { tipo: 'proprietario', proprietarioId: texto(f, 'proprietarioId') ?? '' },
        validoAte: null,
      }),
    });
  }

  function convidar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    void executar('/api/v1/convites', {
      method: 'POST',
      body: JSON.stringify({
        nome: texto(f, 'nome') ?? '',
        email: texto(f, 'email') ?? '',
        papel: 'proprietario',
        proprietarioId: texto(f, 'proprietarioId'),
      }),
    });
  }

  if (!proprietarios) {
    return erroDaLista ? (
      <MensagemDeErro>{mensagemDeErro(erroDaLista)}</MensagemDeErro>
    ) : (
      <MensagemVazia>{t('comum.carregando')}</MensagemVazia>
    );
  }

  const campoProprietario = (
    <Campo rotulo={t('admin.proprietarios.escolher_proprietario')}>
      {(p: PropsDoControle) => (
        <Selecao {...p} name="proprietarioId" required>
          <option value="">{t('admin.proprietarios.escolher_proprietario')}</option>
          {proprietarios.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome}
            </option>
          ))}
        </Selecao>
      )}
    </Campo>
  );

  return (
    <div className="hk-pilha">
      <Aviso aviso={aviso} />
      <div className="hk-grade" data-colunas="2">
        <Painel titulo={t('admin.proprietarios.novo')}>
          <form onSubmit={criar} className="hk-em-linha">
            <Campo rotulo={t('admin.proprietarios.campo.nome')}>
              {(p) => <Entrada {...p} name="nome" required />}
            </Campo>
            <Campo rotulo={t('admin.proprietarios.campo.documento')}>
              {(p) => <Entrada {...p} name="documento" />}
            </Campo>
            <Botao type="submit" variante="primario">
              {t('admin.proprietarios.acao.criar')}
            </Botao>
          </form>
        </Painel>

        <Painel
          titulo={t('admin.proprietarios.acesso')}
          dica={t('admin.proprietarios.acesso_ajuda')}
        >
          <div className="hk-pilha">
            <form onSubmit={darAcesso} className="hk-em-linha">
              {campoProprietario}
              <Campo rotulo={t('admin.proprietarios.escolher_membro')}>
                {(p) => (
                  <Selecao {...p} name="usuarioId" required>
                    <option value="">{t('admin.proprietarios.escolher_membro')}</option>
                    {membros.map((m) => (
                      <option key={m.usuarioId} value={m.usuarioId}>
                        {m.nome}
                      </option>
                    ))}
                  </Selecao>
                )}
              </Campo>
              <Botao type="submit">{t('admin.proprietarios.acao.dar_acesso')}</Botao>
            </form>
            <form onSubmit={convidar} className="hk-em-linha">
              {campoProprietario}
              <Campo rotulo={t('admin.membros.campo.nome')}>
                {(p) => <Entrada {...p} name="nome" required />}
              </Campo>
              <Campo rotulo={t('login.campo.email')}>
                {(p) => <Entrada {...p} name="email" type="email" required />}
              </Campo>
              <Botao type="submit">{t('admin.proprietarios.acao.convidar')}</Botao>
            </form>
          </div>
        </Painel>
      </div>

      <Painel titulo={t('admin.proprietarios.vincular')}>
        <form onSubmit={vincular} className="hk-em-linha">
          {campoProprietario}
          <Campo rotulo={t('admin.proprietarios.escolher_hotel')}>
            {(p) => (
              <Selecao
                {...p}
                value={hotelDoVinculo}
                onChange={(e) => setHotelDoVinculo(e.target.value)}
                required
              >
                <option value="">{t('admin.proprietarios.escolher_hotel')}</option>
                {hoteis.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nome}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo={t('admin.proprietarios.alvo.hotel_inteiro')}>
            {(p) => (
              <Selecao {...p} name="localId">
                <option value="">{t('admin.proprietarios.alvo.hotel_inteiro')}</option>
                {locais.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo={t('admin.proprietarios.campo.inicio')}>
            {(p) => <Entrada {...p} type="date" name="inicio" defaultValue={hoje()} required />}
          </Campo>
          <Campo rotulo={t('admin.proprietarios.campo.fim')}>
            {(p) => <Entrada {...p} type="date" name="fim" />}
          </Campo>
          <Botao type="submit" variante="primario">
            {t('admin.proprietarios.acao.vincular')}
          </Botao>
        </form>
      </Painel>

      <Painel>
        {proprietarios.length === 0 ? (
          <MensagemVazia>{t('admin.proprietarios.vazio')}</MensagemVazia>
        ) : (
          <ul className="hk-lista hk-itens">
            {proprietarios.map((p) => (
              <li key={p.id}>
                <form
                  key={`${p.nome}|${p.documento ?? ''}`}
                  className="hk-em-linha"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    const f = new FormData(ev.currentTarget);
                    void executar(`/api/v1/proprietarios/${p.id}`, {
                      method: 'PUT',
                      body: JSON.stringify({
                        nome: texto(f, 'nome') ?? '',
                        documento: texto(f, 'documento'),
                      }),
                    });
                  }}
                >
                  <Entrada
                    name="nome"
                    defaultValue={p.nome}
                    aria-label={t('admin.proprietarios.campo.nome')}
                  />
                  <Entrada
                    name="documento"
                    defaultValue={p.documento ?? ''}
                    aria-label={t('admin.proprietarios.campo.documento')}
                  />
                  <Botao type="submit" tamanho="pequeno">
                    {t('admin.proprietarios.acao.salvar')}
                  </Botao>
                </form>
                {p.vinculos.length === 0 ? (
                  <p className="hk-suave">{t('admin.proprietarios.sem_vinculos')}</p>
                ) : (
                  <ul className="hk-sublista">
                    {p.vinculos.map((v) => (
                      <li key={v.id}>
                        <form
                          key={`${v.vigenciaInicio}|${v.vigenciaFim ?? ''}`}
                          className="hk-em-linha"
                          onSubmit={(ev) => {
                            ev.preventDefault();
                            const f = new FormData(ev.currentTarget);
                            void executar(`/api/v1/vinculos-de-proprietario/${v.id}/vigencia`, {
                              method: 'PUT',
                              body: JSON.stringify({
                                tipo: v.tipo,
                                vigenciaInicio: texto(f, 'inicio') ?? '',
                                vigenciaFim: texto(f, 'fim'),
                              }),
                            });
                          }}
                        >
                          <span>
                            {t('admin.proprietarios.vinculo', {
                              tipo: v.tipo,
                              hotel: v.hotelNome,
                              local: v.localNome ?? '',
                            })}
                          </span>
                          <Selo tom={v.vigente ? 'verde' : 'cinza'}>
                            {t('admin.proprietarios.vigente', { vigente: String(v.vigente) })}
                          </Selo>
                          <Entrada
                            type="date"
                            name="inicio"
                            defaultValue={v.vigenciaInicio}
                            aria-label={t('admin.proprietarios.campo.inicio')}
                            required
                          />
                          <Entrada
                            type="date"
                            name="fim"
                            defaultValue={v.vigenciaFim ?? ''}
                            aria-label={t('admin.proprietarios.campo.fim')}
                          />
                          <Botao type="submit" tamanho="pequeno">
                            {t('admin.proprietarios.acao.alterar_vigencia')}
                          </Botao>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}
