const DEFAULT_OIL_SERVICE_LABEL = 'Troca de \u00d3leo';
const DEFAULT_REVIEW_SERVICE_LABEL = 'Revis\u00e3o';
const DEFAULT_EMPTY_SERVICE_LABEL = 'N\u00e3o informado';

const CP1252_BYTES: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: true }) : null;

const mayContainMojibake = (value: string) => /[ÃÂâ]/.test(value);

const repairMojibakeOnce = (value: string) => {
  if (!decoder || !mayContainMojibake(value)) return value;

  const bytes: number[] = [];

  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined) return value;

    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }

    const mapped = CP1252_BYTES[code];
    if (mapped === undefined) return value;
    bytes.push(mapped);
  }

  try {
    return decoder.decode(new Uint8Array(bytes));
  } catch {
    return value;
  }
};

export const repairMojibake = (value?: string | null) => {
  let current = String(value || '').trim();

  for (let index = 0; index < 3; index += 1) {
    const next = repairMojibakeOnce(current);
    if (next === current) break;
    current = next.trim();
  }

  return current;
};

export const getServiceTypeKey = (value?: string | null) =>
  repairMojibake(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const CANONICAL_SERVICE_TYPES: Record<string, string> = {
  'troca de oleo': DEFAULT_OIL_SERVICE_LABEL,
  revisao: DEFAULT_REVIEW_SERVICE_LABEL,
  pneus: 'Pneus',
  freios: 'Freios',
  outros: 'Outros',
  outro: 'Outros',
};

export const canonicalServiceType = (value?: string | null) => {
  const repaired = repairMojibake(value);
  if (!repaired) return '';
  return CANONICAL_SERVICE_TYPES[getServiceTypeKey(repaired)] || repaired;
};

export const normalizeServiceTypeOptions = (values: Array<string | null | undefined>) => {
  const unique = new Map<string, string>();

  values.forEach((value) => {
    const label = canonicalServiceType(value);
    if (!label) return;

    const key = getServiceTypeKey(label);
    if (!unique.has(key)) {
      unique.set(key, label);
    }
  });

  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
};

export const isOilChangeService = (value?: string | null) => getServiceTypeKey(value) === 'troca de oleo';

export const getServiceTypeLabel = (value?: string | null) => canonicalServiceType(value) || DEFAULT_EMPTY_SERVICE_LABEL;
