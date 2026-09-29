// ADR-032, condição 3: toda action da CI fixada pelo SHA do commit, com a versão
// em comentário (o Dependabot atualiza os dois juntos). Uma tag (@v5) pode ser
// movida pelo dono da action para outro código; o SHA, não. Imagem de container
// fixada por digest, pelo mesmo motivo.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = '.github/workflows';
const workflows = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
const linhas = (arquivo: string) =>
  readFileSync(`${DIR}/${arquivo}`, 'utf8')
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l));

const FIXADA = /uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*$/;

describe('actions fixadas por SHA, com a versão em comentário', () => {
  it('há workflows para conferir', () => {
    expect(workflows.length).toBeGreaterThanOrEqual(4);
  });

  it.each(workflows)('%s: todo uses: tem SHA de 40 dígitos e # vX.Y.Z', (arquivo) => {
    const usos = linhas(arquivo).filter((l) => /\buses:/.test(l));
    for (const uso of usos) expect(uso, uso.trim()).toMatch(FIXADA);
  });

  it.each(workflows)('%s: imagem de container por digest', (arquivo) => {
    const imagens = linhas(arquivo).filter((l) => /\bimage:/.test(l));
    for (const img of imagens) expect(img, img.trim()).toMatch(/@sha256:[0-9a-f]{64}\s*$/);
  });

  it('o Dependabot acompanha as actions', () => {
    const dependabot = readFileSync('.github/dependabot.yml', 'utf8');
    expect(dependabot).toMatch(/package-ecosystem:\s*github-actions/);
  });
});
