/* slug.ts — accent-folding slugifier (shared by routes that derive file/keys). */

const ACCENTS: Record<string, string> = {
  'ã':'a','â':'a','á':'a','à':'a','ä':'a','å':'a','é':'e','ê':'e','è':'e','ë':'e',
  'í':'i','î':'i','ì':'i','ï':'i','ó':'o','ô':'o','õ':'o','ò':'o','ö':'o',
  'ú':'u','û':'u','ù':'u','ü':'u','ñ':'n','ç':'c',
};

export function slugify(str: string): string {
  return String(str).toLowerCase()
    .replace(/[^a-z0-9]/g, c => ACCENTS[c] || '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
