/* zip — monta o kit baixável: arquivos da versão (D1) + viewer (Assets) + manifesto.
 * O exemplo fica em D1 como JSON (camadas pequenas); o HTML é sintetizado aqui a partir
 * do shell do viewer, igual ao que o gerar.py faz localmente. */

import { strToU8, zipSync } from 'fflate';
import type { Kit } from '../db/index.js';

export const VIEWER_FILES = ['viewer.js', 'viewer.css', 'shell.html'] as const;

export interface ViewerFile { path: string; bytes: Uint8Array }

/** Lê os arquivos do viewer dos Workers Assets. Ausentes (ex.: build não rodou) são pulados. */
export async function loadViewer(assets: Fetcher | undefined): Promise<ViewerFile[]> {
  if (!assets) return [];
  const out: ViewerFile[] = [];
  for (const name of VIEWER_FILES) {
    try {
      const res = await assets.fetch(new Request(`https://assets.local/viewer/${name}`));
      if (res.ok) out.push({ path: `viewer/${name}`, bytes: new Uint8Array(await res.arrayBuffer()) });
    } catch { /* sem viewer */ }
  }
  return out;
}

const TIPO_LABEL: Record<string, string> = { regra: 'REGRA', recomendacao: 'RECOMENDAÇÃO', definicao: 'DEFINIÇÃO' };

/** Regras DESTA análise (entradas versionadas): o título é a regra; o corpo, curto.
 *  Mesmo texto no MCP (obter_template/guia) e no `regras.md` do zip. */
export function rulesBlock(rules: Array<{ tipo: string; title: string; body_md: string }>): string {
  rules = rules.filter((r) => r.tipo !== 'pergunta');
  if (!rules.length) return '';
  const out = ['', '## Regras desta análise (o título já é a regra)', '',
    'REGRA = não descumpra. RECOMENDAÇÃO = siga, salvo motivo dito. DEFINIÇÃO = é assim que o termo é entendido aqui.'];
  for (const r of rules) {
    out.push('', `### [${TIPO_LABEL[r.tipo] ?? 'REGRA'}] ${r.title}`);
    if (r.body_md.trim()) out.push('', r.body_md.trim());
  }
  return out.join('\n');
}

/** Perguntas norteadoras (entradas tipo 'pergunta'): o título é a pergunta; o corpo, como aprofundar.
 *  Mesmo texto no MCP (obter_template/perguntas), no resource e no `perguntas.md` do zip. */
export function questionsBlock(rules: Array<{ tipo: string; title: string; body_md: string }>): string {
  const qs = rules.filter((r) => r.tipo === 'pergunta');
  if (!qs.length) return '';
  const out = ['', '## Perguntas norteadoras (o que vale aprofundar)', '',
    'Depois de gerar, leia `saida/numeros.json` e proponha ao consultor NO CHAT as 3–5 perguntas mais relevantes para este caso, com a justificativa nos números. Elas NÃO entram no HTML. Se ele aceitar uma, calcule a tabela em Python (importe `python/calc.py`: mesmas definições do relatório), monte a seção no design system (`design-system.md` + `python/aprofundar.py`) e registre com o `pergunta_id`.'];
  for (const q of qs) {
    out.push('', `### ${q.title}`);
    if (q.body_md.trim()) out.push('', q.body_md.trim());
  }
  return out.join('\n');
}

const dec = new TextDecoder();
const noClose = (s: string): string => s.replace(/<\/script/gi, '<\\/script');

/** HTML standalone do exemplo: shell + css + js + JSON das camadas `exemplo/*.json`. null se faltar algo. */
export function renderExampleHtml(kit: Kit, viewer: ViewerFile[]): string | null {
  const v = (n: string) => viewer.find((f) => f.path === `viewer/${n}`);
  const shell = v('shell.html'); const css = v('viewer.css'); const js = v('viewer.js');
  if (!shell || !css || !js) return null;
  const file = (p: string) => kit.files.find((f) => f.path === p)?.content;
  const data = file('exemplo/data.json'); const dataset = file('exemplo/dataset.json'); const layout = file('exemplo/layout.json');
  if (!data || !dataset || !layout) return null;
  const sections: Record<string, unknown> = {};
  for (const f of kit.files) {
    if (!f.path.startsWith('exemplo/') || !f.path.endsWith('.json')) continue;
    const base = f.path.slice('exemplo/'.length);
    if (['data.json', 'dataset.json', 'layout.json', 'numeros.json'].includes(base)) continue;
    try { const s = JSON.parse(f.content) as { id?: string; widgets?: unknown }; if (s.id && s.widgets) sections[s.id] = s; } catch { /* ignora */ }
  }
  const report = { data: JSON.parse(data), dataset: JSON.parse(dataset), sections, layout: JSON.parse(layout) };
  const title = (report.data as { meta?: { title?: string } }).meta?.title || `Exemplo — ${kit.template.name}`;
  return dec.decode(shell.bytes)
    .replace('{{TITLE}}', title.replace(/</g, '&lt;'))
    .replace('{{VIEWER_CSS}}', () => dec.decode(css.bytes))
    .replace('{{REPORT_JSON}}', () => noClose(JSON.stringify(report)))
    .replace('{{VIEWER_JS}}', () => noClose(dec.decode(js.bytes)));
}

/** Zip com a pasta `<slug>/` na raiz: manifest.json, tarefas/<tarefa>.md, regras.md, perguntas.md, os arquivos da versão, viewer/,
 *  exemplo/relatorio.html e, quando o manifesto lista `exemplos_de`, os relatórios de exemplo desses templates em exemplos/<slug>.html
 *  (o design system é o contrato; o HTML real é a referência que o agente abre). */
export function buildKitZip(kit: Kit, viewer: ViewerFile[], platform: Array<{ path: string; content: string }> = [], exemplos: Array<{ slug: string; html: string }> = []): Uint8Array {
  const root = kit.template.slug;
  const entries: Record<string, Uint8Array> = {};
  // Documentos da plataforma (design system…): iguais para todo template; o kit é autossuficiente sem git.
  for (const f of platform) entries[`${root}/${f.path}`] = strToU8(f.content);
  const manifest = JSON.parse(kit.version.manifest_json) as Record<string, unknown>;
  entries[`${root}/manifest.json`] = strToU8(JSON.stringify({
    ...manifest,
    slug: kit.template.slug, name: kit.template.name, objective: kit.template.objective, when_to_use: kit.template.when_to_use,
    version: kit.version.semver ?? String(kit.version.number), version_number: kit.version.number, published_at: kit.version.published_at,
  }, null, 2));
  for (const t of kit.tasks) entries[`${root}/tarefas/${t.task_id}.md`] = strToU8(`# ${t.title}\n\n${t.body_md}\n`);
  if (kit.rules.length) entries[`${root}/regras.md`] = strToU8(`# Regras: ${kit.template.name}\n${rulesBlock(kit.rules)}\n`);
  for (const f of kit.files) entries[`${root}/${f.path}`] = strToU8(f.content);
  const qmd = questionsBlock(kit.rules);
  if (qmd) entries[`${root}/perguntas.md`] = strToU8(`# Perguntas norteadoras: ${kit.template.name}\n${qmd}\n`);
  for (const v of viewer) entries[`${root}/${v.path}`] = v.bytes;
  const example = renderExampleHtml(kit, viewer);
  if (example) entries[`${root}/exemplo/relatorio.html`] = strToU8(example);
  for (const e of exemplos) entries[`${root}/exemplos/${e.slug}.html`] = strToU8(e.html);
  return zipSync(entries, { level: 6 });
}
