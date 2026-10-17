// Reading spreadsheets in the browser with no libraries: CSV (any common
// delimiter) and XLSX (a zip of XML files, unpacked with DecompressionStream).

export type Sheet = { name: string; rows: string[][] };

export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== '')).map((r) => r.map((c) => c.trim()));
}

// ── XLSX ──────────────────────────────────────────────

interface ZipEntry { name: string; method: number; compressed: Uint8Array }

function readZip(buf: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Find the end of central directory record.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not-zip');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = new Map<string, ZipEntry>();
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = view.getUint16(local + 26, true);
    const lExtraLen = view.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    out.set(name, { name, method, compressed: buf.subarray(start, start + size) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function inflate(e: ZipEntry): Promise<string> {
  if (e.method === 0) return new TextDecoder().decode(e.compressed);
  if (e.method !== 8) throw new Error('zip-method');
  const stream = new Blob([e.compressed as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function textOf(xml: string): string {
  // Concatenate every <t> run (rich text has several).
  let s = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) s += m[1];
  return unescapeXml(s);
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Built-in and custom number formats that are dates. */
function dateStyles(stylesXml: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!stylesXml) return out;
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\s+numFmtId="(\d+)"\s+formatCode="([^"]*)"/g)) custom.set(Number(m[1]), m[2]);
  const xfs = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  let i = 0;
  for (const m of xfs.matchAll(/<xf\b[^>]*?numFmtId="(\d+)"/g)) {
    const id = Number(m[1]);
    const code = custom.get(id) ?? '';
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, ''))) out.add(i);
    i++;
  }
  return out;
}

function serialToISO(n: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000).toISOString().slice(0, 10);
}

export async function parseXLSX(data: ArrayBuffer): Promise<Sheet[]> {
  const zip = readZip(new Uint8Array(data));
  const get = async (n: string) => (zip.has(n) ? inflate(zip.get(n)!) : undefined);
  const shared: string[] = [];
  const sst = await get('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  const dates = dateStyles(await get('xl/styles.xml'));

  const wb = (await get('xl/workbook.xml')) ?? '';
  const rels = (await get('xl/_rels/workbook.xml.rels')) ?? '';
  const target = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1];
    const tg = m[0].match(/Target="([^"]+)"/)?.[1];
    if (id && tg) target.set(id, tg.replace(/^\/?(xl\/)?/, 'xl/'));
  }
  const sheets: Sheet[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unescapeXml(m[0].match(/name="([^"]*)"/)?.[1] ?? 'Sheet');
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1];
    const path = (rid && target.get(rid)) || `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const xml = await get(path);
    if (!xml) continue;
    const rows: string[][] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row: string[] = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const body = c[2] ?? '';
        const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
        const type = attrs.match(/t="(\w+)"/)?.[1];
        const style = Number(attrs.match(/s="(\d+)"/)?.[1] ?? -1);
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let val = '';
        if (type === 's' && v != null) val = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') val = textOf(body);
        else if (type === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else if (v != null) val = type !== 'str' && dates.has(style) && /^\d+(\.\d+)?$/.test(v) ? serialToISO(Number(v)) : unescapeXml(v);
        const idx = ref ? colIndex(ref) : row.length;
        while (row.length < idx) row.push('');
        row[idx] = val.trim();
      }
      if (row.some((x) => x !== '')) rows.push(row);
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

export async function readSheets(file: File): Promise<Sheet[]> {
  if (/\.xlsx$/i.test(file.name) || file.type.includes('spreadsheetml')) return parseXLSX(await file.arrayBuffer());
  return [{ name: file.name, rows: parseCSV(await file.text()) }];
}

// ── CSV writing ───────────────────────────────────────

export function toCSV(rows: (string | number | boolean | undefined | null)[][]): string {
  return rows
    .map((r) => r.map((v) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\r\n') + '\r\n';
}
