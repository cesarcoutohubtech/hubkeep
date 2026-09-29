// Compressão da foto e miniatura, no aparelho (ADR-024; docs/01): a foto sai em
// JPEG com o lado maior limitado, e a miniatura é um segundo JPEG pequeno, para
// a lista não baixar a foto inteira. A transformação de imagem do Storage fica
// desligada. Depende de canvas: no teste, quem envia recebe outra preparação.

export interface FotoPreparada {
  foto: Blob;
  miniatura: Blob;
}

const LADO_DA_FOTO = 1600;
const LADO_DA_MINIATURA = 320;

async function redimensionar(imagem: ImageBitmap, lado: number, qualidade: number): Promise<Blob> {
  const escala = Math.min(1, lado / Math.max(imagem.width, imagem.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(imagem.width * escala));
  canvas.height = Math.max(1, Math.round(imagem.height * escala));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível.');
  ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
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
