#!/usr/bin/env node
/* build-viewer — empacota o viewer offline a partir do client do app (monorepo):
 *   public/viewer/viewer.js   = ApexCharts + bundle IIFE de app/src/client/standalone.ts
 *   public/viewer/viewer.css  = fontes (woff2 embutidas quando há internet) + style.css
 *   public/viewer/shell.html  = esqueleto com placeholders que o gerar.py preenche:
 *                               {{TITLE}} {{VIEWER_CSS}} {{VIEWER_JS}} {{REPORT_JSON}}
 * Roda em `npm run build`. Não altera o app. */

import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const APP = path.resolve(ROOT, '..', 'app');
const OUT = path.join(ROOT, 'public', 'viewer');

async function embedFonts(fontsCss) {
  const im = fontsCss.match(/@import\s+url\(['"]?([^'")]+)['"]?\)/);
  if (!im) return fontsCss;
  try {
    // UA de browser moderno → o Google devolve woff2 com unicode-range por subset.
    const gcss = await fetch(im[1], { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' } }).then((r) => r.text());
    const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g;
    const faces = [];
    let m;
    while ((m = re.exec(gcss))) {
      const [, subset, face] = m;
      if (subset !== 'latin' && subset !== 'latin-ext') continue;
      const um = face.match(/url\(([^)]+)\)/);
      if (!um) continue;
      const url = um[1].replace(/['"]/g, '');
      const buf = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
      faces.push(`@font-face{${face.replace(/url\([^)]+\)/, `url(data:font/woff2;base64,${buf.toString('base64')})`)}}`);
    }
    if (faces.length) { console.log(`fontes embutidas: ${faces.length} faces`); return faces.join('\n'); }
  } catch (e) {
    console.warn(`fontes: não deu para embutir (${e.message}); mantendo @import`);
  }
  return fontsCss;
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const bundle = await build({
    entryPoints: [path.join(APP, 'src', 'client', 'standalone.ts')],
    bundle: true, format: 'iife', target: 'es2022', minify: true, write: false,
    legalComments: 'none', logLevel: 'warning',
  });
  const apex = await readFile(path.join(APP, 'public', 'vendor', 'apexcharts.min.js'), 'utf8');
  const js = `${apex}\n;${bundle.outputFiles[0].text}`;
  await writeFile(path.join(OUT, 'viewer.js'), js);

  const fonts = await embedFonts(await readFile(path.join(APP, 'public', 'fonts.css'), 'utf8'));
  const style = await readFile(path.join(APP, 'public', 'style.css'), 'utf8');
  const css = `${fonts}\n${style}\n` + [
    'body{margin:0}',
    '#layout-edit-btn,#tn-edit-actions,#update-btn,#export-html-btn{display:none!important}',
  ].join('\n');
  await writeFile(path.join(OUT, 'viewer.css'), css);

  let logo = '';
  try { logo = `data:image/png;base64,${(await readFile(path.join(APP, 'public', 'assets', 'logo-lockup.png'))).toString('base64')}`; } catch { /* sem logo */ }

  const shell = `<!doctype html>
<html lang="pt-BR" data-theme="light">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{TITLE}}</title>
<style>{{VIEWER_CSS}}</style>
</head>
<body>
<aside id="sidenav" hidden></aside>
<nav id="topnav">
  <div class="tn-brand"><span class="tn-client" id="tn-client">—</span></div>
  <div class="tn-pages" id="tn-pages"></div>
  <div class="tn-right"></div>
</nav>
<div id="section-bar"><span id="sb-page-label">—</span><div id="sb-tabs"></div></div>
<button id="filter-fab" hidden title="Filtrar os dados do relatório" aria-label="Filtros">
  <span class="flt-icon"><svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16l-6.3 7.4V19L10.3 21v-8.6z"/></svg></span>
  <span id="filter-count">0</span>
</button>
<div id="filter-modal">
  <div class="flt-dialog">
    <div class="flt-hd">
      <div class="flt-title">Filtros</div>
      <button class="flt-x" id="filter-close">&#215;</button>
    </div>
    <div id="filter-body"></div>
    <div class="flt-actions">
      <button class="flt-clear" id="filter-clear">Limpar</button>
    </div>
  </div>
</div>
<main id="main"><div id="export-root"></div></main>
<div id="modal-root"></div>
<script>window.__REPORT={{REPORT_JSON}};window.__REPORT.logo=window.__REPORT.logo||${JSON.stringify(logo)};</script>
<script>{{VIEWER_JS}}</script>
</body>
</html>
`;
  await writeFile(path.join(OUT, 'shell.html'), shell);
  // docs/arquitetura.html é servido em /docs/ pela UI ("Como funciona").
  await mkdir(path.join(ROOT, 'public', 'docs'), { recursive: true });
  await writeFile(path.join(ROOT, 'public', 'docs', 'arquitetura.html'), await readFile(path.join(ROOT, 'docs', 'arquitetura.html'), 'utf8'));
  const kb = (s) => `${Math.round(Buffer.byteLength(s) / 1024)} KB`;
  console.log(`viewer.js ${kb(js)} · viewer.css ${kb(css)} · shell.html ${kb(shell)} → ${path.relative(ROOT, OUT)}/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
