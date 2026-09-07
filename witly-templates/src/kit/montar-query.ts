/* montar-query — substitui `{{param}}` no SQL do template com escape por tipo.
 * Spec FR-005 + casos de borda: obrigatório ausente → erro listando a tarefa que o
 * produz; `{{` residual → erro; nunca concatena sem escape. */

export type ParamType = 'string' | 'number' | 'date' | 'identifier' | 'enum';

export interface ParamDef {
  id: string;
  label?: string;
  type: ParamType;
  required?: boolean;
  /** Valores aceitos quando type='enum'. */
  enum?: string[];
  /** Tarefa de contexto que produz este parâmetro (aparece na mensagem de erro). */
  task_id?: string;
  default?: string | number;
  desc?: string;
}

export class MontarQueryError extends Error {
  constructor(message: string, public readonly detail: { missing?: string[]; invalid?: string[]; undeclared?: string[] }) {
    super(message);
    this.name = 'MontarQueryError';
  }
}

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

/** Nomes de `{{param}}` presentes num SQL (sem duplicatas, em ordem). */
export function placeholdersIn(sql: string): string[] {
  const out: string[] = [];
  for (const m of sql.matchAll(PLACEHOLDER)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Placeholders usados no SQL que o manifesto não declara (aviso da UI, US2.4). */
export function undeclaredParams(sql: string, params: ParamDef[]): string[] {
  const declared = new Set(params.map((p) => p.id));
  return placeholdersIn(sql).filter((id) => !declared.has(id));
}

function escapeValue(def: ParamDef, raw: unknown): string | null {
  const v = String(raw ?? '').trim();
  switch (def.type) {
    case 'number':
      return /^-?\d+(\.\d+)?$/.test(v) ? v : null;
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `'${v}'` : null;
    case 'identifier':
      return /^[A-Za-z0-9_-]+$/.test(v) ? v : null;
    case 'enum':
      return def.enum?.includes(v) ? `'${v.replace(/'/g, "''")}'` : null;
    case 'string':
    default:
      // aspas dobradas + remove NUL; o SQL do template NÃO deve envolver o {{param}} em aspas.
      return `'${v.replace(/\0/g, '').replace(/'/g, "''")}'`;
  }
}

/** Preenche o SQL. Lança MontarQueryError com o que falta/está inválido/não foi declarado. */
export function montarQuery(sql: string, params: ParamDef[], values: Record<string, unknown>): string {
  const used = placeholdersIn(sql);
  const byId = new Map(params.map((p) => [p.id, p]));

  const undeclared = used.filter((id) => !byId.has(id));
  if (undeclared.length) {
    throw new MontarQueryError(`o SQL usa parâmetros que o manifesto não declara: ${undeclared.join(', ')}`, { undeclared });
  }

  const missing: string[] = [];
  const invalid: string[] = [];
  const resolved = new Map<string, string>();
  for (const id of used) {
    const def = byId.get(id)!;
    const raw = values[id] ?? def.default;
    if (raw == null || String(raw).trim() === '') {
      if (def.required !== false) missing.push(id);
      else resolved.set(id, escapeValue(def, '') ?? "''");
      continue;
    }
    const esc = escapeValue(def, raw);
    if (esc == null) invalid.push(id);
    else resolved.set(id, esc);
  }
  if (missing.length || invalid.length) {
    const parts: string[] = [];
    if (missing.length) {
      parts.push('faltam: ' + missing.map((id) => {
        const t = byId.get(id)?.task_id;
        return t ? `${id} (tarefa de contexto "${t}")` : id;
      }).join(', '));
    }
    if (invalid.length) parts.push('inválidos: ' + invalid.map((id) => `${id} (${byId.get(id)?.type})`).join(', '));
    throw new MontarQueryError(parts.join('; '), { missing, invalid });
  }

  const out = sql.replace(PLACEHOLDER, (_m, id: string) => resolved.get(id) ?? '');
  if (PLACEHOLDER.test(out)) {
    PLACEHOLDER.lastIndex = 0;
    throw new MontarQueryError('sobrou {{…}} após a substituição', { undeclared: placeholdersIn(out) });
  }
  PLACEHOLDER.lastIndex = 0;
  return out;
}
