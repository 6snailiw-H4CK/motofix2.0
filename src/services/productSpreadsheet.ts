import type { ProductCatalogItem, ProductCatalogVariation } from '../types';

export type ProductImportRow = Pick<ProductCatalogItem, 'id' | 'sourceCode' | 'description' | 'variation' | 'variations' | 'ncm' | 'salePrice'>;

type ProductColumn = {
  label: string;
  width: number;
};

const PRODUCT_COLUMNS: ProductColumn[] = [
  { label: 'Descricao', width: 42 },
  { label: 'Codigo Barras', width: 18 },
  { label: 'Marca', width: 18 },
  { label: 'Referencia', width: 18 },
  { label: 'Adicional', width: 18 },
  { label: 'NCM', width: 14 },
  { label: 'Fator', width: 12 },
  { label: 'Emb', width: 10 },
  { label: 'Estoque', width: 12 },
  { label: 'Custo R$', width: 14 },
  { label: 'T Custo R$', width: 14 },
  { label: 'Venda R$', width: 14 },
  { label: 'T Venda R$', width: 14 },
  { label: 'Variacoes', width: 34 },
];

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');

const xmlEscape = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const columnName = (index: number) => {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
};

const getUint16 = (view: DataView, offset: number) => view.getUint16(offset, true);
const getUint32 = (view: DataView, offset: number) => view.getUint32(offset, true);

const columnIndexFromRef = (ref: string) => {
  const letters = ref.replace(/[^A-Z]/gi, '').toUpperCase();
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
};

const inflateRaw = async (bytes: Uint8Array) => {
  const DecompressionStreamCtor = (globalThis as typeof globalThis & {
    DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array>;
  }).DecompressionStream;

  if (!DecompressionStreamCtor) {
    throw new Error('Este navegador nao suporta leitura de XLSX compactado.');
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStreamCtor('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const readZipFiles = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let endOffset = -1;

  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 66000); offset--) {
    if (getUint32(view, offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }

  if (endOffset < 0) throw new Error('Arquivo XLSX invalido.');

  const entryCount = getUint16(view, endOffset + 10);
  const centralOffset = getUint32(view, endOffset + 16);
  const files = new Map<string, Uint8Array>();
  let pointer = centralOffset;

  for (let index = 0; index < entryCount; index++) {
    if (getUint32(view, pointer) !== 0x02014b50) throw new Error('Indice XLSX invalido.');
    const method = getUint16(view, pointer + 10);
    const compressedSize = getUint32(view, pointer + 20);
    const nameLength = getUint16(view, pointer + 28);
    const extraLength = getUint16(view, pointer + 30);
    const commentLength = getUint16(view, pointer + 32);
    const localOffset = getUint32(view, pointer + 42);
    const fileName = textDecoder.decode(bytes.slice(pointer + 46, pointer + 46 + nameLength));

    const localNameLength = getUint16(view, localOffset + 26);
    const localExtraLength = getUint16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);

    if (method === 0) {
      files.set(fileName, compressed);
    } else if (method === 8) {
      files.set(fileName, await inflateRaw(compressed));
    }

    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return files;
};

const readXml = (files: Map<string, Uint8Array>, name: string) => {
  const bytes = files.get(name);
  if (!bytes) return null;
  const doc = new DOMParser().parseFromString(textDecoder.decode(bytes), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return null;
  return doc;
};

const cellValue = (cell: Element, sharedStrings: string[]) => {
  const type = cell.getAttribute('t');
  if (type === 'inlineStr') {
    return cell.getElementsByTagName('t')[0]?.textContent || cell.textContent || '';
  }

  const raw = cell.getElementsByTagName('v')[0]?.textContent || '';
  if (type === 's') return sharedStrings[Number(raw)] || '';
  return raw;
};

const normalizeDocId = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);

const parseMoney = (value?: string) => {
  if (!value) return 0;
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const splitCodeDescription = (value: string, fallbackIndex: number) => {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(\d+)\s*-\s*(.+)$/);
  const sourceCode = match?.[1] || String(fallbackIndex);
  const description = match?.[2]?.trim() || cleaned;
  return { sourceCode, description };
};

const formatMoneyForSheet = (value?: number) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2).replace('.', ',') : '0,00';
};

const formatVariationsForSheet = (variations?: ProductCatalogVariation[]) => (
  (variations || [])
    .filter(variation => variation.name?.trim())
    .map(variation => `${variation.name.trim()}: ${formatMoneyForSheet(variation.salePrice)}`)
    .join('; ')
);

const parseVariations = (value?: string): ProductCatalogVariation[] => {
  if (!value?.trim()) return [];

  return value
    .split(/[;\n|]+/)
    .map((part, index) => {
      const cleaned = part.replace(/\s+/g, ' ').trim();
      if (!cleaned) return null;

      const match = cleaned.match(/^(.+?)(?:\s*[:=-]\s*|\s+)([\d.,]+)$/);
      const name = (match?.[1] || cleaned).trim();
      const salePrice = parseMoney(match?.[2] || '');
      if (!name) return null;

      return {
        id: `${normalizeDocId(name) || 'variacao'}-${index + 1}`,
        name,
        salePrice,
      };
    })
    .filter((variation): variation is ProductCatalogVariation => Boolean(variation));
};

const productToSheetRow = (product: ProductCatalogItem, index: number) => {
  const sourceCode = product.sourceCode || String(index + 1);
  const description = [sourceCode, product.description].filter(Boolean).join(' - ');
  const variations = formatVariationsForSheet(product.variations);

  return [
    description,
    '',
    '',
    '',
    product.variation || '',
    product.ncm || '',
    '',
    '',
    '',
    '',
    '',
    formatMoneyForSheet(product.salePrice),
    '',
    variations,
  ];
};

const buildSheetXml = (products: ProductCatalogItem[]) => {
  const rows = [
    PRODUCT_COLUMNS.map(column => column.label),
    ...products.map(productToSheetRow),
  ];

  const sheetRows = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((cell, cellIndex) => {
      const ref = `${columnName(cellIndex)}${rowNumber}`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`;
    }).join('');
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join('');

  const cols = PRODUCT_COLUMNS.map((column, index) => (
    `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`
  )).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${cols}</cols>
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let current = i;
    for (let j = 0; j < 8; j++) {
      current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
    }
    table[i] = current >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const writeUint16 = (view: DataView, offset: number, value: number) => view.setUint16(offset, value, true);
const writeUint32 = (view: DataView, offset: number, value: number) => view.setUint32(offset, value, true);

const concatBytes = (parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const dosDateTime = () => {
  const date = new Date();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
};

const zipStore = (files: Record<string, string>) => {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const { dosDate, dosTime } = dosDateTime();
  let offset = 0;

  Object.entries(files).forEach(([fileName, content]) => {
    const nameBytes = textEncoder.encode(fileName);
    const contentBytes = textEncoder.encode(content);
    const crc = crc32(contentBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, dosTime);
    writeUint16(localView, 12, dosDate);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, contentBytes.length);
    writeUint32(localView, 22, contentBytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, contentBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, dosTime);
    writeUint16(centralView, 14, dosDate);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, contentBytes.length);
    writeUint32(centralView, 24, contentBytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + contentBytes.length;
  });

  const centralDirectory = concatBytes(centralParts);
  const localFiles = concatBytes(localParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, Object.keys(files).length);
  writeUint16(endView, 10, Object.keys(files).length);
  writeUint32(endView, 12, centralDirectory.length);
  writeUint32(endView, 16, localFiles.length);
  writeUint16(endView, 20, 0);

  return concatBytes([localFiles, centralDirectory, end]);
};

export const buildProductsWorkbook = (products: ProductCatalogItem[]) => {
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Mercadorias" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Inter"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`,
    'xl/worksheets/sheet1.xml': buildSheetXml(products),
  };

  return new Blob([zipStore(files)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

export const downloadProductsWorkbook = (products: ProductCatalogItem[]) => {
  const blob = buildProductsWorkbook(products);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `motofix-mercadorias-${date}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const parseProductsWorkbook = async (file: File): Promise<ProductImportRow[]> => {
  const files = await readZipFiles(file);
  const sheetPath = files.has('xl/worksheets/sheet1.xml')
    ? 'xl/worksheets/sheet1.xml'
    : Array.from(files.keys()).find(name => name.startsWith('xl/worksheets/sheet'));

  if (!sheetPath) throw new Error('A planilha nao possui aba de mercadorias.');

  const sharedStringsDoc = readXml(files, 'xl/sharedStrings.xml');
  const sharedStrings = sharedStringsDoc
    ? Array.from(sharedStringsDoc.getElementsByTagName('si')).map(node => node.textContent || '')
    : [];
  const sheetDoc = readXml(files, sheetPath);
  if (!sheetDoc) throw new Error('Nao foi possivel ler a aba de mercadorias.');

  const parsedRows = Array.from(sheetDoc.getElementsByTagName('row')).map((row) => {
    const values: string[] = [];
    Array.from(row.getElementsByTagName('c')).forEach((cell) => {
      const ref = cell.getAttribute('r') || '';
      values[columnIndexFromRef(ref)] = cellValue(cell, sharedStrings).trim();
    });
    return values;
  });

  const products = parsedRows.flatMap((row, index) => {
    const rawDescription = row[0] || '';
    const variation = row[4] || '';
    const ncm = row[5] || '';
    const salePrice = parseMoney(row[11]);
    const variations = parseVariations(row[13]);

    if (!rawDescription.match(/^\s*\d+\s*-/) || !Number.isFinite(salePrice)) return [];

    const { sourceCode, description } = splitCodeDescription(rawDescription, index + 1);
    if (!description) return [];

    return [{
      id: `produto-${normalizeDocId(sourceCode || description) || index + 1}`,
      sourceCode,
      description,
      variation,
      variations,
      ncm,
      salePrice,
    }];
  });

  const unique = new Map<string, ProductImportRow>();
  products.forEach(product => unique.set(product.id, product));
  return Array.from(unique.values());
};
