export const normalizeBrazilianWhatsAppPhone = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.endsWith('@c.us') || trimmed.endsWith('@g.us')) return trimmed;

  let digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }

  return digits ? `${digits}@c.us` : '';
};

export const formatWhatsAppPhoneForDisplay = (value: string) => {
  const digits = String(value || '').replace(/\D/g, '');
  const withoutBrazilCode = digits.startsWith('55') ? digits.slice(2) : digits;

  if (withoutBrazilCode.length === 11) {
    return `(${withoutBrazilCode.slice(0, 2)}) ${withoutBrazilCode.slice(2, 7)}-${withoutBrazilCode.slice(7)}`;
  }

  if (withoutBrazilCode.length === 10) {
    return `(${withoutBrazilCode.slice(0, 2)}) ${withoutBrazilCode.slice(2, 6)}-${withoutBrazilCode.slice(6)}`;
  }

  return value;
};
