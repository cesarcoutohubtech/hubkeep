// Feriados oficiais dos testes de integração (1c, ADR-042): nenhum. A
// biblioteca de feriados fica no servidor do web, com o teste de regressão
// dela em apps/web/test/feriados-oficiais.test.ts; aqui os prazos dependem
// só do horário e dos feriados do hotel.
import type { FeriadosOficiais } from '@hubkeep/aplicacao';

export const semFeriadosOficiais: FeriadosOficiais = { doAno: () => [] };
