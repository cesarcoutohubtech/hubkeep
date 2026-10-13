// Aceite automático (fase 1c, M5; ADR-044), por tenant, no cron /api/cron/sla,
// depois do monitor. Para cada OS corretiva concluída: as políticas
// os.aceite_automatico, os.codigos_obrigatorios e os.assinatura_no_aceite do
// hotel; o domínio decide; o aceite devido é gravado sem autor, com a
// situação de cada estado e o chamado como no aceite manual. No máximo
// LIMITE_DO_ACEITE_AUTOMATICO_POR_RODADA aceites por tenant em cada rodada.
import {
  type AceiteAutomatico,
  LIMITE_DO_ACEITE_AUTOMATICO_POR_RODADA,
  decidirAceiteAutomatico,
  resolverPolitica,
  situacaoPara,
} from '@hubkeep/dominio';
import type { PortaAceiteAutomatico } from '../portas/aceite-automatico';
import type { Relogio } from '../portas/papeis';

export interface ResultadoDoAceiteAutomatico {
  avaliadas: number;
  aceitas: number;
}

interface PoliticasDoHotel {
  aceite: AceiteAutomatico;
  codigosObrigatorios: boolean;
  assinaturaNoAceite: boolean;
}

export function criarAceiteAutomatico(deps: {
  aceite: PortaAceiteAutomatico;
  relogio: Relogio;
}): (tenantId: string) => Promise<ResultadoDoAceiteAutomatico> {
  return (tenantId) =>
    deps.aceite.emSessao(tenantId, async (s) => {
      const agora = deps.relogio.agora();
      const osConcluidas = await s.osConcluidas();
      if (osConcluidas.length === 0) return { avaliadas: 0, aceitas: 0 };
      const situacoes = await s.situacoes();
      const politicas = new Map<string, PoliticasDoHotel>();
      const doHotel = async (hotelId: string): Promise<PoliticasDoHotel> => {
        let p = politicas.get(hotelId);
        if (!p) {
          const [aceite, codigos, assinatura] = await Promise.all([
            s.politica(hotelId, 'os.aceite_automatico'),
            s.politica(hotelId, 'os.codigos_obrigatorios'),
            s.politica(hotelId, 'os.assinatura_no_aceite'),
          ]);
          p = {
            aceite: resolverPolitica('os.aceite_automatico', aceite),
            codigosObrigatorios: resolverPolitica('os.codigos_obrigatorios', codigos).ligado,
            assinaturaNoAceite: resolverPolitica('os.assinatura_no_aceite', assinatura).ligado,
          };
          politicas.set(hotelId, p);
        }
        return p;
      };

      let aceitas = 0;
      for (const os of osConcluidas) {
        if (aceitas >= LIMITE_DO_ACEITE_AUTOMATICO_POR_RODADA) break;
        const p = await doHotel(os.hotelId);
        const d = decidirAceiteAutomatico({
          os,
          politica: p.aceite,
          codigosObrigatorios: p.codigosObrigatorios,
          assinaturaNoAceite: p.assinaturaNoAceite,
          agora,
        });
        if (!d.aceitar || os.concluidaEm === null) continue;
        const gravou = await s.aceitar({
          osId: os.id,
          hotelId: os.hotelId,
          versao: os.versao,
          situacaoId: situacaoPara(situacoes, 'os', d.estado),
          chamado: {
            id: os.chamadoId,
            versao: os.versaoDoChamado,
            estado: d.chamado,
            situacaoId: situacaoPara(situacoes, 'chamado', d.chamado),
          },
          concluidaEm: os.concluidaEm,
          dias: p.aceite.dias,
        });
        if (gravou) aceitas++;
      }
      return { avaliadas: osConcluidas.length, aceitas };
    });
}
