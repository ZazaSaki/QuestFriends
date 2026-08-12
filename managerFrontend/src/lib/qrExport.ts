import QRCode from 'qrcode';

/** Render a QR payload to a PNG blob. */
export async function qrPngBlob(value: string, size = 512): Promise<Blob> {
  const dataUrl = await QRCode.toDataURL(value, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
  return await (await fetch(dataUrl)).blob();
}

/** Save a blob to disk under `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Filename-safe slug: collapses anything outside [a-z0-9-_] into a single '_'. */
export function slug(s: string): string {
  return (s || '')
    .replace(/[^a-z0-9-_]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    || 'untitled';
}
