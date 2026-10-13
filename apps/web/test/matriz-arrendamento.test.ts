// Formulário da matriz do arrendado (fase 1c; decisões 5 a 7): o FormData da
// tela /admin/arrendamento vira o valor que a API recebe, e o valor passa no
// validador do domínio, o mesmo que a API usa.
import { matrizDeArrendamentoValida, responsavelDoArrendamento } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { matrizDoFormulario } from '../src/cliente/matriz-arrendamento';

const AR = '01900000-0000-7000-8000-0000000000a1';
const ELETRICA = '01900000-0000-7000-8000-0000000000a2';
const INATIVA = '01900000-0000-7000-8000-0000000000a3';

const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

describe('matrizDoFormulario', () => {
  it('só as do locador entram; a arrendatária sai; as que a tela não mostra ficam', () => {
    const valor = matrizDoFormulario(
      formulario({ [`categoria.${AR}`]: 'locador', [`categoria.${ELETRICA}`]: 'arrendataria' }),
      { [ELETRICA]: 'locador', [INATIVA]: 'locador' },
      [{ id: AR }, { id: ELETRICA }],
    );
    expect(valor).toEqual({ [AR]: 'locador', [INATIVA]: 'locador' });
    expect(matrizDeArrendamentoValida(valor)).toBe(true);
    expect(responsavelDoArrendamento('arrendado', valor, ELETRICA)).toBe('arrendataria');
  });

  it('o campo ausente ou desconhecido fica com a arrendatária', () => {
    expect(
      matrizDoFormulario(formulario({ [`categoria.${AR}`]: 'proprietario' }), { [AR]: 'locador' }, [
        { id: AR },
        { id: ELETRICA },
      ]),
    ).toEqual({});
  });
});
