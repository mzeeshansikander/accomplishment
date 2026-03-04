import parsePhoneNumber from 'libphonenumber-js';

export const formatPhoneNumber = (phone?: string, iso2: string = 'US') => {
  if (!phone) return '';

  try {
    const normalized = phone.replace(/[^\d+]/g, '');
    const country = (iso2?.toUpperCase() || 'US') as any;
    const phoneNumber = parsePhoneNumber(normalized, country);

    if (phoneNumber) {
      return phoneNumber.formatNational();
    }
  } catch (error) {
    console.warn('Error parsing phone number:', error);
  }

  // Fallback for 10 or 11 digits
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    const d = digits.slice(1);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }

  return phone;
};
