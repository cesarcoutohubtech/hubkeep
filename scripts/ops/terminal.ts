// Entrada pelo terminal para os scripts de operação em staging e produção.
//
// Nesses ambientes a confirmação e as senhas vêm de uma pessoa digitando: sem
// terminal interativo (CI, agente, pipe), o script recusa antes de conectar.
// Assim nenhuma automação altera papéis em staging ou produção, e a senha
// desses ambientes não fica em variável de ambiente nem em histórico de shell.

/** Recusa rodar sem terminal interativo. Recebe os flags para ser testável. */
export function exigirTerminalInterativo(
  entradaTty: boolean,
  saidaTty: boolean,
  amb: string,
): void {
  if (!entradaTty || !saidaTty) {
    throw new Error(
      `Em ${amb}, este script só roda num terminal interativo, com uma pessoa digitando a ` +
        'confirmação e as senhas. Nada foi conectado.',
    );
  }
}

/** A confirmação é o project ref do alvo, digitado por inteiro. */
export function confirmacaoConfere(digitado: string, ref: string): boolean {
  return ref.length > 0 && digitado.trim() === ref;
}

/** Pergunta com eco (para a confirmação). */
export async function perguntar(texto: string): Promise<string> {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(texto);
  } finally {
    rl.close();
  }
}

/**
 * Pergunta sem eco (para senha). Lê em modo raw, um caractere por vez: nada do
 * que se digita aparece na tela nem fica em buffer de linha do terminal.
 * Ctrl+C aborta o script.
 */
export function perguntarOculto(texto: string): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const entrada = process.stdin;
    process.stdout.write(texto);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    let valor = '';
    const encerrar = () => {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.removeListener('data', aoDigitar);
      process.stdout.write('\n');
    };
    const aoDigitar = (pedaco: string) => {
      for (const c of pedaco) {
        if (c === '\u0003') {
          encerrar();
          rejeitar(new Error('Cancelado.'));
          return;
        }
        if (c === '\r' || c === '\n') {
          encerrar();
          resolver(valor);
          return;
        }
        if (c === '\u007f' || c === '\b') valor = valor.slice(0, -1);
        else valor += c;
      }
    };
    entrada.on('data', aoDigitar);
  });
}
