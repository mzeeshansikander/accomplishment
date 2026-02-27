import crypto from 'crypto';

const BUCKET = 'generated_folios';

function toSlugPrefix(input: string) {
  const safe = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || 'anonymous';
}

function randomSuffix(bytes = 3): string {
  // 3 bytes = 5 base32-like chars, always lowercase alphanumeric
  return crypto.randomBytes(bytes).toString('hex').slice(0, 5);
}

/** Returns just the filename without extension, e.g. "john_folio_a3f9b" */
export function generateFolioName(firstName?: string): string {
  const slug = toSlugPrefix(firstName || 'anonymous');
  return `${slug}_folio_${randomSuffix()}`;
}

/** Full filename to upload: "john_folio_a3f9b.pdf" */
export function generateFolioFileName(firstName?: string): string {
  return `${generateFolioName(firstName)}.pdf`;
}

/** Reconstruct full Supabase URL from just the short code */
export function resolveShortCode(shortCode: string): string {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) throw new Error('SUPABASE_URL is required.');

  const origin = new URL(supabaseUrl).origin;
  // shortCode is the filename without .pdf — just append it
  const url = `${origin}//storage/v1/object/public/${BUCKET}/${shortCode}`;
  console.log('🚀 ~ resolveShortCode ~ url:', url);
  return url;
}
