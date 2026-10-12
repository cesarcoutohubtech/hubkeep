// Foto antes ou depois e assinatura no aceite (fase 1b, I8) contra Postgres
// real (na CI, o Supabase do runner):
//   - o técnico tira a foto "antes" com a OS atribuída, ainda não iniciada; o
//     momento fica no anexo, na auditoria e no evento;
//   - a conclusão: com a política os.foto_depois_obrigatoria desligada
//     (padrão), conclui sem foto; ligada no hotel, recusa sem foto "depois" (a
//     "antes" não conta) e conclui com ela;
//   - o aceite: com a política os.assinatura_no_aceite desligada, aceita sem
//     assinatura; ligada, recusa sem ela e aceita com ela, que é registrada
//     como anexo da OS na mesma unit of work, com o id na OS, na auditoria e
//     no evento; caminho de outra OS é recusado;
//   - a URL da assinatura só para quem pode aceitar a OS concluída;
//   - ninguém remove a assinatura: o domínio recusa e, com a checagem
//     removida, a RLS não acha a linha.
// O Storage fica de fora (URL falsa).
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  type ArmazenamentoDeArquivos,
  criarCasosDeUsoDeAnexos,
  criarCasosDeUsoDeChamados,
  criarCasosDeUsoDeExecucao,
  criarCasosDeUsoDeSincronizacao,
  criarCasosDeUsoDeSituacoes,
  criarCasosDeUsoDeTriagem,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import { PermissaoNegada } from '@hubkeep/dominio';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaAnexos,
  criarPortaChamados,
  criarPortaEscopoDeAnexo,
  criarPortaExecucao,
  criarPortaOperacoesOffline,
  criarPortaPrioridades,
  criarPortaSituacoes,
  criarPortaTriagem,
  criarPortasDeAplicacao,
  novoId,
} from '../src/index';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const TENANT = randomUUID();
const H1 = randomUUID();
const UH = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

describe.skipIf(!temBanco)(
  'I8 — foto antes ou depois e assinatura no aceite',
  { timeout: 60_000 },
  () => {
    let dono: pg.Client;
    let banco: AcessoBanco;
    let chamados: ReturnType<typeof criarCasosDeUsoDeChamados>;
    let triagem: ReturnType<typeof criarCasosDeUsoDeTriagem>;
    let sincronizacao: ReturnType<typeof criarCasosDeUsoDeSincronizacao>;
    let anexos: ReturnType<typeof criarCasosDeUsoDeAnexos>;
    let semChecagem: ReturnType<typeof criarCasosDeUsoDeAnexos>;

    const armazenamento: ArmazenamentoDeArquivos = {
      urlDeUpload: async (caminho) => ({
        url: `https://storage.invalid/up/${caminho}`,
        token: 't',
      }),
      urlDeDownload: async (caminho) => `https://storage.invalid/down/${caminho}`,
    };

    const ligar = (chave: string) =>
      dono.query(
        `insert into app.politica (id, tenant_id, escopo_tipo, hotel_id, chave, valor, atualizado_por)
       values ($1, $2, 'hotel', $3, $4, '{"ligado": true}', $5)`,
        [randomUUID(), TENANT, H1, chave, U.admin],
      );
    const desligar = (chave: string) =>
      dono.query(`delete from app.politica where tenant_id = $1 and chave = $2`, [TENANT, chave]);

    /** Chamado aberto pelo Gerente e OS atribuída ao Técnico (versão 1). */
    async function osAtribuida() {
      const { id: chamadoId } = await chamados.abrir(ctx(U.gerente), {
        localId: UH,
        descricao: `Chuveiro ${randomUUID()}`,
      });
      const versaoDoChamado = (await chamados.chamado(ctx(U.gerente), chamadoId)).versao;
      const { id: osId } = await triagem.gerarOs(ctx(U.gerente), chamadoId, {
        versao: versaoDoChamado,
        responsavel: { tipo: 'tecnico', usuarioId: U.tecnico },
      });
      return { chamadoId, osId };
    }

    const operar = (tipo: 'os.iniciar' | 'os.concluir', osId: string, versao: number) =>
      sincronizacao.receberOperacao(ctx(U.tecnico), {
        chave: randomUUID(),
        tipo,
        dados: { osId, versao },
      });

    /** Foto da OS pelo técnico, com o momento. */
    async function foto(osId: string, momento: 'antes' | 'depois') {
      const { caminho } = await anexos.pedirUrlDeUpload(ctx(U.tecnico), {
        entidade: 'os',
        registroId: osId,
        tipo: 'image/jpeg',
      });
      return anexos.registrar(ctx(U.tecnico), { caminho, momento });
    }

    /** OS iniciada e concluída pelo técnico, sem política; devolve a versão concluída (3). */
    async function osConcluida() {
      const { osId } = await osAtribuida();
      await operar('os.iniciar', osId, 1);
      await operar('os.concluir', osId, 2);
      return { osId, versao: 3 };
    }

    beforeAll(async () => {
      dono = new pg.Client({ connectionString: URL_DONO });
      await dono.connect();
      await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo I8')`, [TENANT]);
      await dono.query(
        `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, 'Hotel', 'UTC', 'ativo')`,
        [H1, TENANT],
      );
      await dono.query(
        `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
       values ($1, $2, $3, 'uh', 'UH 101', 'uh 101', 'ativo')`,
        [UH, TENANT, H1],
      );
      for (const [nome, id] of Object.entries(U)) {
        await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
          id,
          `${id}@hubkeep.invalid`,
        ]);
        await dono.query(
          `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
          [TENANT, id, nome, `${id}@hubkeep.invalid`],
        );
      }
      const atribuir = (usuario: string, papel: string, escopo: string, hotel: string | null) =>
        dono.query(
          `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7)`,
          [randomUUID(), TENANT, usuario, papel, escopo, hotel, U.admin],
        );
      await atribuir(U.admin, 'admin_grupo', 'grupo', null);
      await atribuir(U.gerente, 'gerente_hotel', 'hotel', H1);
      await atribuir(U.tecnico, 'tecnico', 'hotel', H1);

      banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 4 } });
      const atribuicoes = criarPortasDeAplicacao(banco).atribuicoes;
      const situacoes = criarPortaSituacoes(banco);
      const prioridades = criarPortaPrioridades(banco);
      await criarCasosDeUsoDeSituacoes({
        situacoes,
        prioridades,
        atribuicoes,
        relogio: relogioDoSistema,
      }).instalarPadrao(ctx(U.admin));
      const portaTriagem = criarPortaTriagem(banco);
      chamados = criarCasosDeUsoDeChamados({
        chamados: criarPortaChamados(banco),
        situacoes,
        prioridades,
        atribuicoes,
        relogio: relogioDoSistema,
      });
      triagem = criarCasosDeUsoDeTriagem({
        triagem: portaTriagem,
        situacoes,
        prioridades,
        atribuicoes,
        relogio: relogioDoSistema,
      });
      const execucao = criarCasosDeUsoDeExecucao({
        execucao: criarPortaExecucao(banco),
        triagem: portaTriagem,
        situacoes,
        atribuicoes,
        relogio: relogioDoSistema,
      });
      sincronizacao = criarCasosDeUsoDeSincronizacao({
        operacoes: criarPortaOperacoesOffline(banco),
        ativos: {
          prepararCadastro: () => Promise.reject(new Error('fora do teste')),
          prepararAlteracao: () => Promise.reject(new Error('fora do teste')),
        },
        chamados,
        execucao,
      });
      const depsDosAnexos = {
        escopo: criarPortaEscopoDeAnexo(banco),
        anexos: criarPortaAnexos(banco),
        atribuicoes,
        armazenamento,
        relogio: relogioDoSistema,
        novoId,
        regraParaAnexar: async (
          c: { usuarioId: string; tenantId: string },
          e: string,
          id: string,
        ) => {
          if (e === 'os') await execucao.exigirFoto(c, id);
        },
        regraParaAssinar: (c: { usuarioId: string; tenantId: string }, id: string) =>
          triagem.exigirQuemAceita(c, id),
      };
      anexos = criarCasosDeUsoDeAnexos(depsDosAnexos);
      // Sem a regra do domínio: só a RLS decide quem remove.
      semChecagem = criarCasosDeUsoDeAnexos({
        ...depsDosAnexos,
        podeRemover: () => ({ permitido: true }),
      });
    });

    afterAll(async () => {
      await banco?.encerrar();
      if (!dono) return;
      // A OS aponta a assinatura (FK): solta antes de apagar os anexos.
      await dono.query(`update app.os set assinatura_aceite_id = null where tenant_id = $1`, [
        TENANT,
      ]);
      for (const t of [
        'app.evento_dominio',
        'app.auditoria',
        'app.operacao_offline',
        'app.anexo',
        'app.os_transicao',
        'app.os',
        'app.chamado',
        'app.politica',
        'app.situacao',
        'app.prioridade',
        'app.atribuicao_escopo',
        'app.local',
        'app.hotel',
        'app.membro',
      ]) {
        await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
      }
      await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
      await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
    });

    it('o técnico tira a foto "antes" com a OS atribuída: momento no anexo, na auditoria e no evento', async () => {
      const { osId } = await osAtribuida();
      const { id } = await foto(osId, 'antes');
      const [listado] = await anexos.listar(ctx(U.gerente), 'os', osId);
      expect(listado).toMatchObject({ id, momento: 'antes', assinatura: false });
      const auditoria = await dono.query<{ depois: { momento?: string } }>(
        `select depois from app.auditoria
        where tenant_id = $1 and entidade = 'anexo' and registro_id = $2 and acao = 'criar'`,
        [TENANT, id],
      );
      expect(auditoria.rows[0]?.depois.momento).toBe('antes');
      const evento = await dono.query<{ payload: { momento?: string } }>(
        `select payload from app.evento_dominio
        where tenant_id = $1 and tipo = 'anexo.registrado' and registro_id = $2`,
        [TENANT, id],
      );
      expect(evento.rows[0]?.payload.momento).toBe('antes');
    });

    it('com a política da foto desligada (padrão), conclui sem foto', async () => {
      const { osId } = await osAtribuida();
      await operar('os.iniciar', osId, 1);
      const { resposta } = await operar('os.concluir', osId, 2);
      expect(resposta).toMatchObject({ estado: 'concluida' });
    });

    it('com a política da foto ligada, recusa sem foto "depois" e conclui com ela', async () => {
      await ligar('os.foto_depois_obrigatoria');
      try {
        const { osId } = await osAtribuida();
        await foto(osId, 'antes');
        await operar('os.iniciar', osId, 1);
        await expect(operar('os.concluir', osId, 2)).rejects.toMatchObject({
          codigo: 'foto_depois_obrigatoria',
        });
        await foto(osId, 'depois');
        const { resposta } = await operar('os.concluir', osId, 2);
        expect(resposta).toMatchObject({ estado: 'concluida' });
      } finally {
        await desligar('os.foto_depois_obrigatoria');
      }
    });

    it('a URL da assinatura só para quem pode aceitar a OS concluída', async () => {
      const atribuida = await osAtribuida();
      await expect(
        anexos.pedirUrlDaAssinatura(ctx(U.gerente), atribuida.osId),
      ).rejects.toMatchObject({ codigo: 'transicao_invalida' });
      const { osId } = await osConcluida();
      await expect(anexos.pedirUrlDaAssinatura(ctx(U.tecnico), osId)).rejects.toBeInstanceOf(
        PermissaoNegada,
      );
      const { caminho } = await anexos.pedirUrlDaAssinatura(ctx(U.gerente), osId);
      expect(caminho).toMatch(new RegExp(`^${TENANT}/${H1}/os/${osId}/[0-9a-f-]{36}\\.png$`));
    });

    it('com a política da assinatura desligada (padrão), aceita sem ela; a OS fica sem', async () => {
      const { osId, versao } = await osConcluida();
      await triagem.aceitarOs(ctx(U.gerente), osId, { versao });
      const os = await dono.query(`select assinatura_aceite_id from app.os where id = $1`, [osId]);
      expect(os.rows[0]).toEqual({ assinatura_aceite_id: null });
    });

    it('com a política da assinatura ligada, recusa sem ela e grava a assinatura com o aceite', async () => {
      await ligar('os.assinatura_no_aceite');
      try {
        const { osId, versao } = await osConcluida();
        const gerente = ctx(U.gerente);
        await expect(triagem.aceitarOs(gerente, osId, { versao })).rejects.toMatchObject({
          codigo: 'assinatura_obrigatoria_no_aceite',
        });
        // Caminho de outra OS: recusado antes de gravar.
        const outra = await osConcluida();
        const deOutra = (await anexos.pedirUrlDaAssinatura(gerente, outra.osId)).caminho;
        await expect(
          triagem.aceitarOs(gerente, osId, { versao, assinaturaCaminho: deOutra }),
        ).rejects.toMatchObject({ codigo: 'assinatura_invalida' });

        const { caminho } = await anexos.pedirUrlDaAssinatura(gerente, osId);
        await triagem.aceitarOs(gerente, osId, { versao, assinaturaCaminho: caminho });
        const anexo = await dono.query<{
          id: string;
          assinatura: boolean;
          tipo: string;
          usuario_id: string;
        }>(
          `select id, assinatura, tipo, usuario_id from app.anexo where tenant_id = $1 and caminho = $2`,
          [TENANT, caminho],
        );
        expect(anexo.rows[0]).toMatchObject({
          assinatura: true,
          tipo: 'image/png',
          usuario_id: U.gerente,
        });
        const assinaturaId = anexo.rows[0]?.id;
        const os = await dono.query(
          `select estado, assinatura_aceite_id from app.os where id = $1`,
          [osId],
        );
        expect(os.rows[0]).toEqual({ estado: 'aceita', assinatura_aceite_id: assinaturaId });
        const auditoria = await dono.query<{ depois: { assinaturaId?: string } }>(
          `select depois from app.auditoria where tenant_id = $1 and registro_id = $2 and acao = 'aceitar'`,
          [TENANT, osId],
        );
        expect(auditoria.rows[0]?.depois.assinaturaId).toBe(assinaturaId);
        const evento = await dono.query<{ payload: { assinaturaId?: string } }>(
          `select payload from app.evento_dominio where tenant_id = $1 and tipo = 'os.aceita' and registro_id = $2`,
          [TENANT, osId],
        );
        expect(evento.rows[0]?.payload.assinaturaId).toBe(assinaturaId);

        // Ninguém remove a assinatura: o domínio recusa; sem ele, a RLS não acha a linha.
        const [listada] = (await anexos.listar(gerente, 'os', osId)).filter((a) => a.assinatura);
        expect(listada).toMatchObject({ id: assinaturaId, podeRemover: false });
        await expect(anexos.remover(gerente, assinaturaId ?? '')).rejects.toMatchObject({
          codigo: 'assinatura_nao_se_remove',
        });
        await expect(semChecagem.remover(gerente, assinaturaId ?? '')).rejects.toMatchObject({
          codigo: 'anexo_nao_encontrado',
        });
      } finally {
        await desligar('os.assinatura_no_aceite');
      }
    });
  },
);
