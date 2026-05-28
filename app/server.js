const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = 3131;
const ROOT = path.join(__dirname, '..');        // presentation_generator/
const OUT  = path.join(ROOT, 'output');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ── List all analyses ── */
app.get('/api/analyses', (_req, res) => {
  if (!fs.existsSync(OUT)) return res.json([]);
  const analyses = fs.readdirSync(OUT)
    .filter(d => {
      const stat = fs.statSync(path.join(OUT, d));
      return stat.isDirectory() && fs.existsSync(path.join(OUT, d, 'data.json'));
    })
    .map(slug => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(OUT, slug, 'data.json'), 'utf8'));
        const commentFile = path.join(OUT, slug, 'comments.csv');
        const commentCount = fs.existsSync(commentFile)
          ? fs.readFileSync(commentFile, 'utf8').trim().split('\n').length - 1
          : 0;
        return { slug, ...data.meta, sectionCount: data.pages?.reduce((n, p) => n + p.sections.length, 0) || 0, commentCount };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(analyses);
});

/* ── Report page (SPA shell) ── */
app.get('/report/:slug', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'report.html'));
});

/* ── Get report map ── */
app.get('/api/:slug/data', (req, res) => {
  const file = path.join(OUT, req.params.slug, 'data.json');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'not found' });
  res.sendFile(file);
});

/* ── Get section JSON ── */
app.get('/api/:slug/section/:id', (req, res) => {
  const file = path.join(OUT, req.params.slug, `${req.params.id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'section not found' });
  res.sendFile(file);
});

/* ── Comments: read ── */
app.get('/api/:slug/comments', (req, res) => {
  const file = path.join(OUT, req.params.slug, 'comments.csv');
  if (!fs.existsSync(file)) return res.json([]);
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
  if (lines.length <= 1) return res.json([]);
  const headers = parseCsvLine(lines[0]);
  const comments = lines.slice(1).map(line => {
    const vals = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
  res.json(comments);
});

/* ── Comments: add ── */
app.post('/api/:slug/comments', (req, res) => {
  const { id, sectionId, sectionLabel, type, text, anchor } = req.body;
  const file   = path.join(OUT, req.params.slug, 'comments.csv');
  const header = 'id,sectionId,sectionLabel,type,text,anchor,status,createdAt\n';
  const row    = [id, sectionId, q(sectionLabel), type, q(text), q(anchor || ''), 'novo', new Date().toISOString()].join(',') + '\n';
  if (!fs.existsSync(file)) fs.writeFileSync(file, header + row, 'utf8');
  else fs.appendFileSync(file, row, 'utf8');
  res.json({ ok: true });
});

/* ── Comments: delete ── */
app.delete('/api/:slug/comments/:id', (req, res) => {
  const file = path.join(OUT, req.params.slug, 'comments.csv');
  if (!fs.existsSync(file)) return res.json({ ok: true });
  const lines    = fs.readFileSync(file, 'utf8').split('\n');
  const filtered = lines.filter((l, i) => i === 0 || !l.startsWith(req.params.id + ','));
  fs.writeFileSync(file, filtered.join('\n'), 'utf8');
  res.json({ ok: true });
});

/* ── SSE: watch for live section updates ── */
const sseClients  = {};   // slug → Set<res>
const dirWatchers = {};   // slug → FSWatcher

app.get('/api/:slug/watch', (req, res) => {
  const { slug } = req.params;
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();
  res.write('data: connected\n\n');

  if (!sseClients[slug])  sseClients[slug]  = new Set();
  sseClients[slug].add(res);
  req.on('close', () => sseClients[slug]?.delete(res));

  if (!dirWatchers[slug]) {
    const dir = path.join(OUT, slug);
    if (fs.existsSync(dir)) {
      dirWatchers[slug] = fs.watch(dir, (_, filename) => {
        if (!filename?.endsWith('.json') || filename === 'data.json') return;
        const id = filename.replace('.json', '');
        sseClients[slug]?.forEach(c => { try { c.write(`data: ${id}\n\n`); } catch {} });
      });
    }
  }
});

/* ── helpers ── */
function q(v) { return '"' + (v || '').replace(/"/g, '""') + '"'; }

function parseCsvLine(line) {
  const result = [], re = /("(?:[^"]|"")*"|[^,]*)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m.index === re.lastIndex) { re.lastIndex++; continue; }
    let v = m[1];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/""/g, '"');
    result.push(v);
  }
  return result;
}

app.listen(PORT, () => {
  console.log(`\n  ✓  Analytics App  →  http://localhost:${PORT}\n`);
});
