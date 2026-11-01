/** Minimal PDF writer: one JPEG per page, page size exactly the Sheet in mm (pages rule 13). */
export interface PdfPage {
  /** page size in mm */
  wMm: number;
  hMm: number;
  jpeg: Uint8Array;
  pxW: number;
  pxH: number;
}

const enc = new TextEncoder();
const PT_PER_MM = 72 / 25.4;
const num = (n: number) => (Math.round(n * 1000) / 1000).toString();

export function buildPdf(pages: PdfPage[]): Blob {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === 'string' ? enc.encode(b) : b;
    chunks.push(u);
    length += u.length;
  };
  const obj = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push('\nendobj\n');
  };

  // object ids: 1 catalog, 2 pages, then per page: page, content, image
  const pageIds = pages.map((_, i) => 3 + i * 3);
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`));
  pages.forEach((pg, i) => {
    const id = pageIds[i];
    const W = pg.wMm * PT_PER_MM;
    const H = pg.hMm * PT_PER_MM;
    obj(id, () =>
      push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(W)} ${num(H)}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`),
    );
    const content = `q ${num(W)} 0 0 ${num(H)} 0 0 cm /Im0 Do Q`;
    obj(id + 1, () => push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`));
    obj(id + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${pg.pxW} /Height ${pg.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`);
      push(pg.jpeg);
      push('\nendstream');
    });
  });
  const xref = length;
  const count = 3 + pages.length * 3;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}
