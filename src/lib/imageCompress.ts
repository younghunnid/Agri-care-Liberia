/**
 * Shrinks a photo for storage on the phone and for upload over mobile data.
 * Scales to at most `maxWidth` pixels wide and lowers JPEG quality until the result is
 * under `maxBytes` (about 100 KB by default, versus several MB straight from a camera).
 */
export interface CompressedImage {
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
}

const approxBytes = (dataUrl: string): number => Math.round(((dataUrl.split(',')[1] ?? '').length * 3) / 4);

export async function compressPhoto(file: File, maxWidth = 640, maxBytes = 100_000): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo (JPG or PNG).');
  if (file.size > 15 * 1024 * 1024) throw new Error('That photo is too large. Choose a smaller one.');

  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the photo.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onerror = () => reject(new Error('That file is not a valid photo.'));
    el.onload = () => resolve(el);
    el.src = source;
  });

  let width = Math.min(maxWidth, img.width);
  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = width / img.width;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot shrink photos.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.7, 0.55, 0.42]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const bytes = approxBytes(dataUrl);
      if (bytes <= maxBytes || (attempt === 3 && quality === 0.42)) {
        return {dataUrl, bytes, width: canvas.width, height: canvas.height};
      }
    }
    width = Math.round(width * 0.75); // still too big: shrink the picture itself
  }
  throw new Error('Could not shrink that photo enough.');
}
