/* fsutil.ts — path-safety + JSON read/write helpers shared by write routes. */

import fs from 'node:fs';
import path from 'node:path';

/** True when a URL segment is a plain name (no separators, no traversal). */
export function isSafeSeg(seg: string): boolean {
  return !!seg && !seg.includes('/') && !seg.includes('\\') && !seg.includes('..');
}

/** Resolve the on-disk directory for an analysis, or null if a segment is unsafe. */
export function analysisDir(out: string, client: string, slug: string): string | null {
  if (!isSafeSeg(client) || !isSafeSeg(slug)) return null;
  return path.join(out, client, slug);
}

export function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; }
  catch { return null; }
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}
