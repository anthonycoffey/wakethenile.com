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

/**
 * The same QR as an HTML table, for email. Mail clients strip inline SVG and
 * many block images by default (and a hosted QR image would leak the ticket
 * code — a bearer credential — to a third party). Table cells with a
 * background colour render everywhere, Gmail and Outlook included.
 * Runs of same-colour modules are merged with colspan to keep the email well
 * under Gmail's ~100 KB clipping limit.
 */
export function qrEmailTable(text: string, opts: { cellSize?: number; margin?: number } = {}): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const m = opts.margin ?? 4; // quiet zone, in modules — scanners need it
  const px = opts.cellSize ?? 6;
  const size = n + 2 * m;
  const dark = (r: number, c: number) =>
    r >= m && r < m + n && c >= m && c < m + n && qr.isDark(r - m, c - m);
  const rows: string[] = [];
  for (let r = 0; r < size; r++) {
    let cells = '';
    let c = 0;
    while (c < size) {
      const d = dark(r, c);
      let run = 1;
      while (c + run < size && dark(r, c + run) === d) run++;
      // Light cells inherit the table's white; only dark runs carry a colour.
      // Per-cell styling is kept to attributes — repeating inline CSS on
      // every cell pushed a ticket email past Gmail's clipping limit.
      cells += `<td${run > 1 ? ` colspan="${run}"` : ''} width="${run * px}" height="${px}"${d ? ' bgcolor="#000000"' : ''}></td>`;
      c += run;
    }
    rows.push(`<tr style="height:${px}px">${cells}</tr>`);
  }
  return `<table role="img" aria-label="Ticket QR code" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border-collapse:collapse;margin:0 auto;background:#ffffff;font-size:0;line-height:0">${rows.join('')}</table>`;
}
