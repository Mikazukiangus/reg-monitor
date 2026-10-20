// Limits on reading regulators' PDFs: the download size, checked while the
// file arrives, and the page count. PDFs are built here, so nothing is fetched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPdfText, PDF_LIMITS } from '../server/extract.ts';
import { readLimitedBytes } from '../server/http.ts';

// A PDF with one line of Helvetica text per page
function makePdf(pages: string[]): Uint8Array {
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  pages.forEach((text, i) => {
    const content = `BT /F1 11 Tf 40 740 Td (${text.replace(/[\\()]/g, '\\$&')}) Tj ET`;
    objects[pageIds[i]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

const pages = [
  'The Authority today published a consultation paper on the proposed changes to the rules.',
  'Comments on the proposals are invited from interested parties by the closing date below.',
  'The revised rules are expected to take effect after the consultation has been completed.'
];

test('a PDF within the limits is read as before', async () => {
  const { text, ocr } = await extractPdfText(makePdf(pages));
  assert.equal(ocr, false);
  for (const line of pages) assert.ok(text.includes(line), `missing: ${line}`);
});

test('a PDF with more pages than the limit gets no text rather than part of it', async () => {
  await assert.rejects(extractPdfText(makePdf(pages), { ...PDF_LIMITS, maxPages: 2 }), /PDF too long \(3 pages, limit 2\)/);
  // The limit itself is far above what the sources publish
  assert.ok(PDF_LIMITS.maxPages >= 1000);
});

test('a download over the size limit is refused before it is read in full', async () => {
  const chunk = new Uint8Array(1000).fill(7);
  let pulled = 0;
  const endless = new ReadableStream<Uint8Array>({ pull(controller) { pulled++; controller.enqueue(chunk); } });
  await assert.rejects(readLimitedBytes(new Response(endless), 5_500), /File too large \(over 5500 bytes; 6000 or more\)/);
  assert.equal(pulled <= 7, true, `read ${pulled} chunks after passing the limit`);

  // A size declared up front is refused without reading the body
  let read = false;
  const declared = new Response(new ReadableStream({ pull() { read = true; } }), { headers: { 'content-length': '9000' } });
  await assert.rejects(readLimitedBytes(declared, 5_500), /File too large \(over 5500 bytes; 9000 or more\)/);
  assert.equal(read, false);
});

test('a download within the size limit arrives unchanged', async () => {
  const pdf = makePdf(pages);
  let sent = 0;
  const inPieces = new ReadableStream<Uint8Array>({ pull(c) { if (sent >= pdf.length) c.close(); else c.enqueue(pdf.subarray(sent, sent += 100)); } });
  assert.deepEqual(await readLimitedBytes(new Response(inPieces), pdf.length), pdf);
});
