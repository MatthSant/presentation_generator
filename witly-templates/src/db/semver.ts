/* semver — versão que as pessoas veem (v1.0.2, v1.1.0, v2.0.0).
 *
 * `patch` = ajuste (texto de contexto, guia, correção); `minor` = melhoria que
 * acrescenta algo (tarefa nova, query nova, bloco novo); `major` = mudança
 * significativa (estrutura do documento, motor, parâmetros incompatíveis).
 * O `number` inteiro da tabela segue existindo como sequência interna. */

export type Bump = 'patch' | 'minor' | 'major';

const BUMPS: Bump[] = ['patch', 'minor', 'major'];

export function parseBump(v: unknown, fallback: Bump = 'patch'): Bump {
  const s = String(v ?? '').trim().toLowerCase();
  const alias: Record<string, Bump> = { ajuste: 'patch', melhoria: 'minor', grande: 'major', fix: 'patch', feat: 'minor', breaking: 'major' };
  if ((BUMPS as string[]).includes(s)) return s as Bump;
  return alias[s] ?? fallback;
}

export function parseSemver(s: string | null | undefined): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(s ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Próxima versão a partir da publicada atual. Sem publicada (ou histórico 0.x) → 1.0.0. */
export function nextSemver(current: string | null | undefined, bump: Bump = 'patch'): string {
  const p = parseSemver(current);
  if (!p || p[0] === 0) return '1.0.0';
  const [a, b, c] = p;
  if (bump === 'major') return `${a + 1}.0.0`;
  if (bump === 'minor') return `${a}.${b + 1}.0`;
  return `${a}.${b}.${c + 1}`;
}

/** Rótulo para exibição: `v1.0.2`; sem semver cai no inteiro (`v3`). */
export function versionLabel(v: { semver?: string | null; number?: number | null } | null | undefined): string {
  if (!v) return 'v?';
  if (v.semver) return `v${v.semver}`;
  return v.number != null ? `v${v.number}` : 'v?';
}
