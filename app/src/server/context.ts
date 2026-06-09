import type { DB } from './db.js';

/** Shared server context passed to every route module. */
export interface Ctx {
  db: DB;
  /** Absolute path to the output/ root that holds [client]/[analysis]/ files. */
  out: string;
  /** Filenames whose next fs.watch event should be ignored (our own writes). */
  skipNextSSE: Set<string>;
  /** When true, auth + multi-tenant isolation is enforced (off in unit tests). */
  auth?: boolean;
}
