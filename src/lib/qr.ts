import qrcode from 'qrcode-generator';

/**
 * Build an inline SVG string encoding `text`. Pure client-side (no external
 * requests → CSP-safe). `scalable` uses a viewBox so CSS controls the size.
 */
export function qrSvg(text: string, opts: { cellSize?: number; margin?: number } = {}): string {
  const qr = qrcode(0, 'M'); // auto-fit version, medium error correction
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({
    cellSize: opts.cellSize ?? 6,
    margin: opts.margin ?? 4,
    scalable: true,
  });
}
