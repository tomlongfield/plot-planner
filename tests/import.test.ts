import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildLibrary, bundledCrops } from '../src/lib/library';
import { buildRows, guessMapping, looksLikeHeader } from '../src/lib/seedImport';
import { parseCSV, parseXLSX, toCSV } from '../src/lib/sheets';

const lib = buildLibrary(bundledCrops(), [], []);

const CSV = `What,Cultivar,Shop,Got it,Sow before,How many,Fam.
Beetrot,Boltardy,Seed Co,11/2025,2027-12,50 seeds,Amaranthaceae
Carrots,Autumn King,Seed Co,2026-02-17,,low,Brassicaceae
Broad beans,,,Gift,,plenty,
Mystery melon xyz,,,Dec 2025,,,
Tomato,Sungold,"Big Shop, Ltd",Dec 2025,,10,
Tomato,Sungold,"Big Shop, Ltd",Dec 2025,,10,
Courgette,Romanesco,,2025,,2g,`;

describe('spreadsheet reading', () => {
  it('parses CSV with quotes and detects the delimiter', () => {
    expect(parseCSV('a;b\n"x;y";2\n')).toEqual([['a', 'b'], ['x;y', '2']]);
    expect(parseCSV('a,b\r\n"say ""hi""",\n')).toEqual([['a', 'b'], ['say "hi"', '']]);
    expect(parseCSV(CSV)[5][2]).toBe('Big Shop, Ltd');
  });

  it('writes CSV that reads back the same', () => {
    const rows = [['name', 'note'], ['Garlic', 'say "hi", ok'], ['Pea', 'line\nbreak']];
    expect(parseCSV(toCSV(rows))).toEqual(rows);
  });

  it('reads an XLSX workbook, with shared strings and date-formatted cells', async () => {
    const xlsx = makeXlsx([
      ['Vegetable', 'Variety', 'Date bought'],
      ['Leek', 'Musselburgh', { date: 46000 }],
    ]);
    const sheets = await parseXLSX(xlsx);
    expect(sheets[0].name).toBe('Seeds');
    expect(sheets[0].rows).toEqual([['Vegetable', 'Variety', 'Date bought'], ['Leek', 'Musselburgh', '2025-12-09']]);
  });
});

describe('seed import (acceptance 7)', () => {
  const [header, ...rows] = parseCSV(CSV);
  const mapping = guessMapping(header, rows);

  it('maps unusual column names', () => {
    expect(looksLikeHeader(header)).toBe(true);
    expect(mapping).toEqual(['crop', 'variety', 'supplier', 'acquired', 'useBy', 'quantity', 'family']);
  });

  it('parses mixed dates and offers suggestions without changing anything', () => {
    const out = buildRows(rows, mapping, lib);
    const [beet, carrot, bean, mystery, tom1, tom2, courgette] = out;

    expect(beet.cropId).toBe('beetroot');
    expect(beet.varietyId).toBe('beetroot--boltardy');
    expect(beet.issues.map((i) => i.kind)).toContain('typo');
    expect(beet.lot).toMatchObject({ acquired: '2025-11-01', useBy: '2027-12-01', quantity: 50, unit: 'seeds', source: 'bought', supplier: 'Seed Co' });

    expect(carrot.lot.acquired).toBe('2026-02-17');
    expect(carrot.lot.status).toBe('low');
    expect(carrot.issues).toContainEqual({ kind: 'family', params: { given: 'Brassicaceae', family: 'Apiaceae', crop: 'Carrot' } });

    expect(bean.cropId).toBe('broad-bean');
    expect(bean.lot.source).toBe('gift');
    expect(bean.lot.acquired).toBeUndefined();
    expect(bean.issues.map((i) => i.kind)).toContain('dateText');

    expect(mystery.cropId).toBeUndefined();
    expect(mystery.include).toBe(false);
    expect(mystery.issues[0].kind).toBe('unmatched');
    expect(mystery.lot.acquired).toBe('2025-12-01');

    expect(tom1.varietyId).toBe('tomato--sungold');
    expect(tom1.include).toBe(true);
    expect(tom2.issues.map((i) => i.kind)).toContain('duplicate');
    expect(tom2.include).toBe(false);

    expect(courgette.newVarietyName).toBe('Romanesco');
    expect(courgette.lot).toMatchObject({ quantity: 2, unit: 'g', acquired: '2025-01-01' });
  });

  it('flags lots that are already in the inventory', () => {
    const existing = [{ id: 'x', varietyId: 'tomato--sungold', kind: 'seed' as const, source: 'bought' as const, supplier: 'Big Shop, Ltd', acquired: '2025-12-01', status: 'plenty' as const, germTests: [] }];
    const out = buildRows(rows, mapping, lib, existing);
    expect(out[4].issues.map((i) => i.kind)).toContain('duplicate');
  });
});

/** A minimal XLSX (stored + deflated entries) so the reader is tested on a real zip. */
function makeXlsx(rows: (string | { date: number })[][]): ArrayBuffer {
  const strings: string[] = [];
  const si = (s: string) => { let i = strings.indexOf(s); if (i < 0) { strings.push(s); i = strings.length - 1; } return i; };
  const col = (i: number) => String.fromCharCode(65 + i);
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) =>
    typeof c === 'string' ? `<c r="${col(ci)}${ri + 1}" t="s"><v>${si(c)}</v></c>` : `<c r="${col(ci)}${ri + 1}" s="1"><v>${c.date}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const files: Record<string, string> = {
    'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="Seeds" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheet,
    'xl/sharedStrings.xml': `<sst>${strings.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`,
    'xl/styles.xml': '<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
  };
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  let i = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text);
    const deflate = i++ % 2 === 0;
    const data = deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const n = enc.encode(name);
    const local = new Uint8Array(30 + n.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(8, deflate ? 8 : 0, true);
    lv.setUint32(18, data.length, true); lv.setUint32(22, raw.length, true); lv.setUint16(26, n.length, true);
    local.set(n, 30); local.set(data, 30 + n.length);
    const central = new Uint8Array(46 + n.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, deflate ? 8 : 0, true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, raw.length, true); cv.setUint16(28, n.length, true); cv.setUint32(42, offset, true);
    central.set(n, 46);
    locals.push(local); centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, centrals.length, true); ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const all = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) { all.set(part, p); p += part.length; }
  return all.buffer;
}
