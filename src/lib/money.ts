export const parseBrazilianCurrency = (value: unknown, fallback = 0) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  const raw = String(value ?? '').trim();
  if (!raw) return fallback;

  const cleaned = raw.replace(/\s+/g, '').replace(/[^\d,.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === ',' || cleaned === '.') return fallback;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;

  if (lastComma > -1 && lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > -1) {
    const dotParts = cleaned.split('.');
    const decimalPart = dotParts[dotParts.length - 1] || '';
    const hasSingleDot = dotParts.length === 2;
    const looksLikeThousandsSeparator = hasSingleDot && decimalPart.length === 3;

    normalized = looksLikeThousandsSeparator
      ? cleaned.replace(/\./g, '')
      : `${dotParts.slice(0, -1).join('')}.${decimalPart}`;
  } else {
    normalized = cleaned.replace(/,/g, '.');
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};
