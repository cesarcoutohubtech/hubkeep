// Provisionamento de cliente (docs/13, "Preparação do piloto"; resposta 4 do
// Cesar de 08/10/2026): o grupo, o contrato de licença, o primeiro Admin e os
// padrões. Reaproveita o primeiro passo do kit de teste, com duas diferenças:
//   - o primeiro Admin é uma pessoa de verdade: recebe o convite por e-mail
//     (o mesmo do ADR-018, pelo worker), e não uma conta com senha de teste;
//   - o grupo não é fixo: o id vem do script, e rodar de novo com o mesmo id
//     só completa o que faltou, sem duplicar nem reenviar o convite.
//
// O tenant, o contrato, o membro e a atribuição do primeiro Admin são
// trabalho do backoffice, que nenhum caso de uso faz: entram pelo dono do
// banco, numa transação, com a auditoria e o evento gravados ali mesmo, sem
// usuário (o "Sistema" da auditoria). Os padrões vão pelos casos de uso, no
// contexto do primeiro Admin, como no kit; a auditoria deles fica em nome
// dele. Chamado só por `pnpm ops:provisionar` (scripts/ops/provisionar-cliente.ts),
// que confere o alvo, e pelo teste na CI.
import { novoId } from '@hubkeep/db';
import type { Contexto } from '@hubkeep/dominio';
import pg from 'pg';
import { processarOutboxDoTenant } from '../../src/servidor/composicao';
import { identidadeDoPrimeiroAdmin } from '../../src/servidor/provisionamento';
import { instalarPadroesDoGrupo } from './padroes';

export interface PedidoDeProvisionamento {
  tenantId: string;
  nome: string;
  adminEmail: string;
  adminNome: string;
  maxHoteis: number;
  maxUhs: number;
  /** Quem autorizou, gravado no contrato (`atualizado_por`). */
  por: string;
  /** Site do web, para o link do convite. */
  site: string;
}

export interface ResultadoDoProvisionamento {
  tenantId: string;
  usuarioId: string;
  /** O convite foi gravado agora (false: o Admin já era membro; nada reenviado). */
  conviteNovo: boolean;
  /** O contrato que vale no grupo (o de antes, se já existia: rodar de novo não muda a licença). */
  contrato: { maxHoteis: number; maxUhs: number };
  padroes: { categorias: number; prioridades: number; codigos: number };
}

export async function provisionarCliente(
  urlDono: string,
  p: PedidoDeProvisionamento,
  log: (linha: string) => void = () => undefined,
): Promise<ResultadoDoProvisionamento> {
  // 1. A identidade, antes do banco: sem senha, sem confirmação, sem e-mail.
  const identidade = identidadeDoPrimeiroAdmin();
  const { usuarioId } = await identidade.garantirUsuario({
    email: p.adminEmail,
    nome: p.adminNome,
    tenantId: p.tenantId,
    nomeTenant: p.nome,
  });

  // 2. O backoffice, pelo dono, numa transação só.
  const dono = new pg.Client({ connectionString: urlDono });
  await dono.connect();
  let conviteNovo = false;
  let contrato: ResultadoDoProvisionamento['contrato'];
  try {
    await dono.query('begin');
    await dono.query(
      `insert into app.tenant (id, nome) values ($1, $2) on conflict (id) do nothing`,
      [p.tenantId, p.nome],
    );
    await dono.query(
      `insert into licenca.contrato (tenant_id, max_hoteis, max_uhs, atualizado_por)
       values ($1, $2, $3, $4) on conflict (tenant_id) do nothing`,
      [p.tenantId, p.maxHoteis, p.maxUhs, p.por],
    );
    const lido = await dono.query<{ max_hoteis: number; max_uhs: number }>(
      `select max_hoteis, max_uhs from licenca.contrato where tenant_id = $1`,
      [p.tenantId],
    );
    const [linha] = lido.rows;
    if (!linha) throw new Error('Contrato de licença não gravado.');
    contrato = { maxHoteis: linha.max_hoteis, maxUhs: linha.max_uhs };

    const auditar = (entidade: string, registroId: string, acao: string, depois: unknown) =>
      dono.query(
        `insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, antes, depois, usuario_id)
         values ($1, $2, null, $3, $4, $5, null, $6, null)`,
        [novoId(), p.tenantId, entidade, registroId, acao, JSON.stringify(depois)],
      );
    const membro = { usuarioId, nome: p.adminNome, email: p.adminEmail };
    const inserido = await dono.query(
      `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)
       on conflict (tenant_id, usuario_id) do nothing`,
      [p.tenantId, usuarioId, p.adminNome, p.adminEmail],
    );
    if (inserido.rowCount === 1) {
      conviteNovo = true;
      await auditar('membro', usuarioId, 'convidar', membro);
      // O mesmo evento do convite pela tela (criarMembro): o worker vincula o
      // tenant ao usuário e envia o e-mail, só depois do commit.
      await dono.query(
        `insert into app.evento_dominio (id, tenant_id, tipo, entidade, registro_id, payload)
         values ($1, $2, 'membro.convidado', 'membro', $3, $4)`,
        [
          novoId(),
          p.tenantId,
          usuarioId,
          JSON.stringify({
            ...membro,
            nomeTenant: p.nome,
            redirecionarPara: `${p.site}/auth/confirmar`,
          }),
        ],
      );
    }
    const atribuicaoId = novoId();
    const atribuida = await dono.query(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, concedido_por)
       select $1, $2, $3, 'admin_grupo', 'grupo', $3
        where not exists (
          select 1 from app.atribuicao_escopo
           where tenant_id = $2 and usuario_id = $3 and papel = 'admin_grupo' and revogado_em is null)`,
      [atribuicaoId, p.tenantId, usuarioId],
    );
    if (atribuida.rowCount === 1) {
      await auditar('atribuicao_escopo', atribuicaoId, 'conceder', {
        id: atribuicaoId,
        usuarioId,
        papel: 'admin_grupo',
        escopo: { tipo: 'grupo' },
        validoAte: null,
      });
    }
    await dono.query('commit');
  } catch (e) {
    await dono.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    await dono.end();
  }
  log(`Grupo ${p.nome} (${p.tenantId}) e primeiro Admin ${p.adminEmail}.`);

  // 3. Os padrões, pelos casos de uso, no contexto do primeiro Admin.
  const ctxAdmin: Contexto = { usuarioId, tenantId: p.tenantId };
  const padroes = await instalarPadroesDoGrupo(ctxAdmin, { sobrescreverPrioridade: false });
  log(
    `Padrões: ${padroes.categorias} categorias, ${padroes.prioridades} prioridades, ${padroes.codigos} códigos.`,
  );

  // 4. O convite sai agora, pelo outbox do tenant, sem esperar o cron.
  if (conviteNovo) {
    await processarOutboxDoTenant(p.tenantId);
    log('Convite processado pelo outbox.');
  }

  return { tenantId: p.tenantId, usuarioId, conviteNovo, contrato, padroes };
}
