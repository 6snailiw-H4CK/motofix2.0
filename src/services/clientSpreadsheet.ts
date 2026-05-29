import type { Client, MaintenanceStatus } from '../types';

export type ClientBackupRow = {
  id?: string;
  name: string;
  contact?: string;
  bikeModel?: string;
  email?: string;
  vehiclePlate?: string;
  mileageKm?: string;
  oilType?: string;
  recurrenceDays?: string;
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
  status?: MaintenanceStatus | string;
  isRecurringRevenue?: string;
  lastServiceType?: string;
  lastServiceValue?: string;
  lastServiceNotes?: string;
  createdAt?: string;
};

type ClientColumn = {
  key: keyof ClientBackupRow;
  label: string;
  width: number;
};

const CLIENT_COLUMNS: ClientColumn[] = [
  { key: 'id', label: 'ID', width: 24 },
  { key: 'name', label: 'Nome', width: 26 },
  { key: 'contact', label: 'WhatsApp', width: 18 },
  { key: 'bikeModel', label: 'Modelo da moto', width: 24 },
  { key: 'email', label: 'Email', width: 28 },
  { key: 'vehiclePlate', label: 'Placa', width: 14 },
  { key: 'mileageKm', label: 'Km', width: 12 },
  { key: 'oilType', label: 'Oleo', width: 18 },
  { key: 'recurrenceDays', label: 'Recorrencia dias', width: 18 },
  { key: 'lastMaintenanceDate', label: 'Ultima manutencao', width: 18 },
  { key: 'nextMaintenanceDate', label: 'Proxima manutencao', width: 18 },
  { key: 'status', label: 'Status', width: 14 },
  { key: 'isRecurringRevenue', label: 'Receita recorrente', width: 18 },
  { key: 'lastServiceType', label: 'Tipo ultimo servico', width: 22 },
  { key: 'lastServiceValue', label: 'Valor ultimo servico', width: 18 },
  { key: 'lastServiceNotes', label: 'Observacoes', width: 32 },
  { key: 'createdAt', label: 'Criado em', width: 18 },
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

const normalizeHeader = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const HEADER_ALIASES = new Map<string, keyof ClientBackupRow>([
  ['id', 'id'],
  ['nome', 'name'],
  ['cliente', 'name'],
  ['whatsapp', 'contact'],
  ['telefone', 'contact'],
  ['contato', 'contact'],
  ['modelodamoto', 'bikeModel'],
  ['moto', 'bikeModel'],
  ['email', 'email'],
  ['placa', 'vehiclePlate'],
  ['veiculoplaca', 'vehiclePlate'],
  ['km', 'mileageKm'],
  ['quilometragem', 'mileageKm'],
  ['oleo', 'oilType'],
  ['tipodeoleo', 'oilType'],
  ['recorrenciadias', 'recurrenceDays'],
  ['recorrencia', 'recurrenceDays'],
  ['ultimamanutencao', 'lastMaintenanceDate'],
  ['ultimoservico', 'lastMaintenanceDate'],
  ['proximamanutencao', 'nextMaintenanceDate'],
  ['proximoalerta', 'nextMaintenanceDate'],
  ['status', 'status'],
  ['receitarecorrente', 'isRecurringRevenue'],
  ['recorrente', 'isRecurringRevenue'],
  ['tipoultimoservico', 'lastServiceType'],
  ['servico', 'lastServiceType'],
  ['valorultimoservico', 'lastServiceValue'],
  ['valor', 'lastServiceValue'],
  ['observacoes', 'lastServiceNotes'],
  ['obs', 'lastServiceNotes'],
  ['criadoem', 'createdAt'],
]);

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

const columnIndexFromRef = (ref: string) => {
  const letters = ref.replace(/[^A-Z]/gi, '').toUpperCase();
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
};

const formatSheetDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const boolToSheet = (value?: boolean) => value ? 'Sim' : 'Nao';

const clientToRow = (client: Client): ClientBackupRow => ({
  id: client.id,
  name: client.name,
  contact: client.contact,
  bikeModel: client.bikeModel,
  email: client.email || '',
  vehiclePlate: client.vehiclePlate || '',
  mileageKm: client.mileageKm ? String(client.mileageKm) : '',
  oilType: client.oilType,
  recurrenceDays: String(client.recurrenceDays || ''),
  lastMaintenanceDate: formatSheetDate(client.lastMaintenanceDate),
  nextMaintenanceDate: formatSheetDate(client.nextMaintenanceDate),
  status: client.status,
  isRecurringRevenue: boolToSheet(client.isRecurringRevenue),
  lastServiceType: client.lastServiceType || '',
  lastServiceValue: client.lastServiceValue === undefined ? '' : String(client.lastServiceValue),
  lastServiceNotes: client.lastServiceNotes || '',
  createdAt: formatSheetDate(client.createdAt),
});

const buildSheetXml = (clients: Client[]) => {
  const rows = [
    CLIENT_COLUMNS.map(column => column.label),
    ...clients.map((client) => {
      const row = clientToRow(client);
      return CLIENT_COLUMNS.map(column => row[column.key] || '');
    }),
  ];

  const sheetRows = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((cell, cellIndex) => {
      const ref = `${columnName(cellIndex)}${rowNumber}`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`;
    }).join('');
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join('');

  const cols = CLIENT_COLUMNS.map((column, index) => (
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

export const buildClientsWorkbook = (clients: Client[]) => {
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
    <sheet name="Clientes" sheetId="1" r:id="rId1"/>
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
    'xl/worksheets/sheet1.xml': buildSheetXml(clients),
  };

  return new Blob([zipStore(files)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

export const downloadClientsWorkbook = (clients: Client[]) => {
  const blob = buildClientsWorkbook(clients);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `motofix-clientes-${date}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const getUint16 = (view: DataView, offset: number) => view.getUint16(offset, true);
const getUint32 = (view: DataView, offset: number) => view.getUint32(offset, true);

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
    return cell.getElementsByTagName('t')[0]?.textContent || '';
  }

  const raw = cell.getElementsByTagName('v')[0]?.textContent || '';
  if (type === 's') return sharedStrings[Number(raw)] || '';
  return raw;
};

export const parseClientsWorkbook = async (file: File): Promise<ClientBackupRow[]> => {
  const files = await readZipFiles(file);
  const sheetPath = files.has('xl/worksheets/sheet1.xml')
    ? 'xl/worksheets/sheet1.xml'
    : Array.from(files.keys()).find(name => name.startsWith('xl/worksheets/sheet'));

  if (!sheetPath) throw new Error('A planilha nao possui aba de clientes.');

  const sharedStringsDoc = readXml(files, 'xl/sharedStrings.xml');
  const sharedStrings = sharedStringsDoc
    ? Array.from(sharedStringsDoc.getElementsByTagName('si')).map(node => node.textContent || '')
    : [];
  const sheetDoc = readXml(files, sheetPath);
  if (!sheetDoc) throw new Error('Nao foi possivel ler a aba de clientes.');

  const parsedRows = Array.from(sheetDoc.getElementsByTagName('row')).map((row) => {
    const values: string[] = [];
    Array.from(row.getElementsByTagName('c')).forEach((cell) => {
      const ref = cell.getAttribute('r') || '';
      values[columnIndexFromRef(ref)] = cellValue(cell, sharedStrings).trim();
    });
    return values;
  }).filter(row => row.some(Boolean));

  const headers = parsedRows[0] || [];
  const keys = headers.map(header => HEADER_ALIASES.get(normalizeHeader(header)));
  const rows = parsedRows.slice(1).map((row) => {
    const output: Partial<ClientBackupRow> = {};
    row.forEach((value, index) => {
      const key = keys[index];
      if (key && value) output[key] = value;
    });
    return output;
  });

  return rows.filter((row): row is ClientBackupRow => Boolean(row.name?.trim()));
};
