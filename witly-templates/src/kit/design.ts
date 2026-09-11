/* design — o design system como template versionado (spec 006): contrato.md + regras
 * (entradas) + elementos/<id>.json (a chamada Python e o widget que ela produz).
 * Daqui saem o design-system.md do kit/MCP e o relatório da galeria que a UI renderiza. */

import type { Kit } from '../db/index.js';
import { rulesBlock, type ViewerFile } from './zip.js';

export const DESIGN_SLUG = 'design-system';

export interface Elemento {
  id: string; grupo: string; title: string; desc?: string; call?: string; sort?: number;
  widgets: Array<Record<string, unknown> & { id: string; type: string }>;
  layout: Array<{ id: string; type?: string; x: number; y: number; w: number; h: number }>;
  dataset?: Record<string, { dims: string[]; filters: unknown[]; rows: Record<string, unknown>[] }>;
}

export const GRUPOS: Record<string, string> = { numeros: 'Números', graficos: 'Gráficos e tabelas', funil: 'Funil e listas', narrativa: 'Narrativa' };

/** Os elementos da versão, na ordem (sort, depois id). Arquivo inválido é ignorado. */
export function elementos(kit: Kit): Elemento[] {
  const out: Elemento[] = [];
  for (const f of kit.files) {
    if (!f.path.startsWith('elementos/') || !f.path.endsWith('.json')) continue;
    try {
      const e = JSON.parse(f.content) as Elemento;
      if (!e || !Array.isArray(e.widgets)) continue;
      e.id = e.id || f.path.slice('elementos/'.length, -'.json'.length);
      e.grupo = e.grupo || 'narrativa';
      e.layout = Array.isArray(e.layout) ? e.layout : [];
      out.push(e);
    } catch { /* ignora */ }
  }
  return out.sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999) || a.id.localeCompare(b.id));
}

/** O texto que entra no kit (design-system.md) e no resource contrato://widgets:
 *  contrato + regras do design + os elementos (chamada → JSON). */
export function designSystemMd(kit: Kit): string {
  const contrato = (kit.files.find((f) => f.path === 'contrato.md')?.content ?? '').trim();
  const out = [contrato];
  const regras = rulesBlock(kit.rules).replace('## Regras desta análise (o título já é a regra)', '## Regras do design system (o título já é a regra)');
  if (regras) out.push(regras);
  const els = elementos(kit);
  if (els.length) {
    out.push('', '## Elementos: a chamada e o que ela produz', '',
      'Cada elemento abaixo é uma chamada do `relatorio.py` (análise livre) ou o widget equivalente (aprofundamento). Copie a forma; troque dados e binds. Os números são de exemplo.');
    let grupo = '';
    for (const e of els) {
      if (e.grupo !== grupo) { grupo = e.grupo; out.push('', `### ${GRUPOS[grupo] ?? grupo}`); }
      out.push('', `#### ${e.title}`);
      if (e.desc) out.push('', e.desc.trim());
      if (e.call) out.push('', '```python', e.call, '```');
      const ws = e.widgets.slice(0, 2).map((w) => JSON.stringify(w, null, 1));
      out.push('', '```json', ws.join('\n'), '```');
      const lay = e.layout.map((l) => `${l.w}×${l.h}`).join(', ');
      if (lay) out.push('', `Grade: ${lay}.`);
    }
  }
  return out.join('\n').trim() + '\n';
}

export interface Report { data: Record<string, unknown>; dataset: Record<string, unknown>; sections: Record<string, unknown>; layout: { sections: Record<string, unknown[]> } }

/** O relatório da galeria: uma página por grupo, uma seção por elemento. `foco` traz esse
 *  elemento (e o grupo dele) para a frente — o viewer abre pela primeira página/seção. */
export function designReport(kit: Kit, foco?: string | null, override?: Elemento | null): Report {
  let els = elementos(kit);
  if (override) {
    const i = els.findIndex((e) => e.id === override.id);
    if (i >= 0) els[i] = override; else els.push(override);
  }
  if (foco) {
    // em foco: só o grupo do elemento, com ele primeiro — uma página, sem a sidebar do viewer
    // (a lista de elementos é a da UI); sem foco, a galeria inteira (uma página por grupo)
    const f = els.find((e) => e.id === foco);
    if (f) els = [f, ...els.filter((e) => e !== f && e.grupo === f.grupo)];
  }
  const dataset: Record<string, unknown> = {};
  const sections: Record<string, unknown> = {};
  const layout: Record<string, unknown[]> = {};
  const pages = new Map<string, { id: string; label: string; sections: Array<{ id: string; label: string }> }>();
  for (const e of els) {
    for (const [name, t] of Object.entries(e.dataset ?? {})) dataset[name] = t;
    const sid = `el-${e.id}`;
    sections[sid] = { id: sid, header: { badge: GRUPOS[e.grupo] ?? e.grupo, title: e.title, sub: e.desc ?? '' }, widgets: e.widgets };
    layout[sid] = e.layout;
    if (!pages.has(e.grupo)) pages.set(e.grupo, { id: e.grupo, label: GRUPOS[e.grupo] ?? e.grupo, sections: [] });
    pages.get(e.grupo)!.sections.push({ id: sid, label: e.title });
  }
  const ordem = foco ? [...pages.values()] : [...pages.values()].sort((a, b) => Object.keys(GRUPOS).indexOf(a.id) - Object.keys(GRUPOS).indexOf(b.id));
  const data = {
    meta: { client: 'galeria', client_name: 'Design system', title: `Design system ${kit.version.semver ? 'v' + kit.version.semver : '(rascunho)'}`,
            type: 'dashboard', theme: 'light', nav: 'sidebar', controls: { kind: 'design-system', compare: 'meta', pages: ordem.map((p) => p.id), filters: [] } },
    pages: ordem,
  };
  return { data, dataset, sections, layout: { sections: layout } };
}

const dec = new TextDecoder();
const noClose = (s: string): string => s.replace(/<\/script/gi, '<\\/script');

/** HTML standalone de qualquer relatório (viewer + JSON). null sem viewer. */
export function renderReportHtml(report: Report, viewer: ViewerFile[], title: string): string | null {
  const v = (n: string) => viewer.find((f) => f.path === `viewer/${n}`);
  const shell = v('shell.html'); const css = v('viewer.css'); const js = v('viewer.js');
  if (!shell || !css || !js) return null;
  return dec.decode(shell.bytes)
    .replace('{{TITLE}}', title.replace(/</g, '&lt;'))
    .replace('{{VIEWER_CSS}}', () => dec.decode(css.bytes))
    .replace('{{REPORT_JSON}}', () => noClose(JSON.stringify(report)))
    .replace('{{VIEWER_JS}}', () => noClose(dec.decode(js.bytes)));
}

/** Validação mínima de um elemento vindo da UI (o JSON é do editor; o viewer é tolerante). */
export function parseElemento(raw: unknown): Elemento {
  const e = raw as Partial<Elemento>;
  if (!e || typeof e !== 'object') throw new Error('elemento deve ser um objeto JSON');
  if (!e.id || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(e.id)) throw new Error('elemento.id inválido (a-z, 0-9, hífen)');
  if (!Array.isArray(e.widgets) || !e.widgets.length) throw new Error('elemento.widgets: lista não vazia');
  for (const w of e.widgets) if (!w || typeof w !== 'object' || !(w as { type?: unknown }).type || !(w as { id?: unknown }).id) throw new Error('cada widget precisa de id e type');
  return { ...e, grupo: e.grupo || 'narrativa', title: e.title || e.id, layout: Array.isArray(e.layout) ? e.layout : [], widgets: e.widgets } as Elemento;
}
