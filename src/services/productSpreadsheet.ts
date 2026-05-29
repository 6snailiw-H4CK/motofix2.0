import type { ProductCatalogItem } from '../types';

export type ProductImportRow = Pick<ProductCatalogItem, 'id' | 'sourceCode' | 'description' | 'ncm' | 'salePrice'>;

const textDecoder = new TextDecoder('utf-8');

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
    const ncm = row[5] || '';
    const salePrice = parseMoney(row[11]);

    if (!rawDescription.match(/^\s*\d+\s*-/) || !Number.isFinite(salePrice)) return [];

    const { sourceCode, description } = splitCodeDescription(rawDescription, index + 1);
    if (!description) return [];

    return [{
      id: `produto-${normalizeDocId(sourceCode || description) || index + 1}`,
      sourceCode,
      description,
      ncm,
      salePrice,
    }];
  });

  const unique = new Map<string, ProductImportRow>();
  products.forEach(product => unique.set(product.id, product));
  return Array.from(unique.values());
};
