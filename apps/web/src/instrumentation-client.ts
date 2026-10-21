// Roda no navegador antes do código do app (Next 16): o Zod sem JIT, antes de
// qualquer schema de @hubkeep/contratos, para a CSP sem 'unsafe-eval' não
// registrar a sonda Function('') do Zod 4 como violação (SP2).
import '@hubkeep/contratos/sem-eval';
