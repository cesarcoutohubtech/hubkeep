// Compressão da foto e miniatura, no navegador (ADR-024; docs/01): a foto sai
// em JPEG com o lado maior limitado, e a miniatura é um segundo JPEG pequeno,
// para a lista não baixar a foto inteira. A transformação de imagem do Storage
// fica desligada. Usado pelo PWA (foto do técnico) e pelo web (arquivo enviado
// pelo computador). Depende de canvas: no teste, quem envia recebe outra
// preparação.

export interface FotoPreparada {
  foto: Blob;
  miniatura: Blob;
}

export const LADO_DA_FOTO = 1600;
export const LADO_DA_MINIATURA = 320;

/** Tipos que viram foto comprimida com miniatura; o resto (PDF) vai como está. */
export const TIPOS_DE_FOTO: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

/** Largura e altura com o lado maior limitado a `lado`, sem ampliar. */
export function dimensoes(
  largura: number,
  altura: number,
  lado: number,
): { largura: number; altura: number } {
  const escala = Math.min(1, lado / Math.max(largura, altura));
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

async function redimensionar(imagem: ImageBitmap, lado: number, qualidade: number): Promise<Blob> {
  const { largura, altura } = dimensoes(imagem.width, imagem.height, lado);
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível.');
  // JPEG não tem transparência: o fundo branco evita que um PNG transparente
  // (planta, diagrama) saia preto.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(imagem, 0, 0, largura, altura);
  return new Promise((ok, falha) =>
    canvas.toBlob(
      (b) => (b ? ok(b) : falha(new Error('Falha ao gerar a imagem.'))),
      'image/jpeg',
      qualidade,
    ),
  );
}

/** Foto comprimida e miniatura, as duas em JPEG, com a orientação da câmera. */
export async function prepararFoto(arquivo: Blob): Promise<FotoPreparada> {
  const imagem = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  try {
    return {
      foto: await redimensionar(imagem, LADO_DA_FOTO, 0.8),
      miniatura: await redimensionar(imagem, LADO_DA_MINIATURA, 0.7),
    };
  } finally {
    imagem.close();
  }
}
