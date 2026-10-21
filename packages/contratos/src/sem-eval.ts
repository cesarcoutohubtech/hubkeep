// O Zod sem JIT (SP2): com JIT, o Zod 4 testa `Function('')` ao definir o
// schema de objeto, e a CSP sem 'unsafe-eval' registra a tentativa como
// violação, mesmo com o erro tratado. Este módulo tem de ser o primeiro
// import do app, antes de qualquer schema de @hubkeep/contratos.
import { config } from 'zod';

config({ jitless: true });
