// Leitor de CSV (RFC 4180): vírgula ou ponto e vírgula, campos entre aspas com
// aspas dobradas, quebra de linha dentro de aspas, CRLF ou LF. É o formato da
// planilha, a alternativa da fase 0 ao TOTVS (docs/00). Sem dependência: o
// agente roda na rede do cliente e quanto menos pacote, menos a auditar.

export type LinhaCsv = Record<string, string>;

/** Separador da primeira linha: `;` se houver mais `;` que `,` (Excel em pt-BR). */
function separadorDe(texto: string): string {
  const cabecalho = texto.split(/\r?\n/, 1)[0] ?? '';
  return (cabecalho.match(/;/g)?.length ?? 0) > (cabecalho.match(/,/g)?.length ?? 0) ? ';' : ',';
}

export function lerCsv(texto: string): LinhaCsv[] {
  const semBom = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const sep = separadorDe(semBom);
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;

  for (let i = 0; i < semBom.length; i++) {
    const c = semBom[i];
    if (aspas) {
      if (c === '"' && semBom[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
      continue;
    }
    if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && semBom[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += c;
  }
  if (aspas) throw new Error('CSV com aspas sem fechar.');
  if (campo !== '' || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  const [cabecalho, ...dados] = linhas.filter((l) => l.some((v) => v.trim() !== ''));
  if (!cabecalho) return [];
  const nomes = cabecalho.map((n) => n.trim().toLowerCase());
  return dados.map((valores) =>
    Object.fromEntries(nomes.map((n, i) => [n, (valores[i] ?? '').trim()])),
  );
}
