import type { DB } from './db.js';

/** Shared server context passed to every route module. */
export interface Ctx {
  db: DB;
  /** Absolute path to the output/ root that holds [client]/[analysis]/ files. */
  out: string;
  /** Filenames whose next fs.watch event should be ignored (our own writes). */
  skipNextSSE: Set<string>;
  /** Push a transient progress line to the SSE watchers of an analysis (deepen
   *  stages → the busy overlay). Set by registerWatch; no-op if nobody listens. */
  emitProgress?: (client: string, slug: string, msg: string) => void;
  /** When true, auth + multi-tenant isolation is enforced (off in unit tests). */
  auth?: boolean;
}
